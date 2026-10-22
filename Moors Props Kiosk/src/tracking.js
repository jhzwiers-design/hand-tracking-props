/* ==========================================================================
   TRACKING — webcam → MediaPipe Hand Landmarker (+ a tiny face detector for
   "someone is standing here"), locally in the browser. Frames are analysed
   and discarded. Nothing is recorded, stored or uploaded.

   Hand output (ONE hand, already mapped to SCREEN space 0..1):
     hands[0] = { id, present, sx, sy, pinch, pinchAmount, pts, size }
       sx, sy: the pinch point (between thumb and index tips)
       pinch:  true while thumb and index are pinched (with hysteresis)
       pts:    Float32Array(42) — all 21 landmarks as screen x,y pairs
       size:   wrist ↔ middle knuckle, fraction of the frame (bigger = closer)

   Presence (someone standing in front, even before a hand is raised):
     presence = { present, faceW }   faceW: face width as a fraction of the frame (bigger = closer)

   Objects are updated in place every detection (no per-frame garbage).

   Performance: detection runs in a Web Worker (trackingWorker.js) so the
   render loop never waits for it; the main thread only hands over a video
   frame (~0.1 ms). If the worker can't start, it falls back to running
   MediaPipe on the main thread.
   ========================================================================== */
import { CONFIG, INTERACTION_CONFIG as IC } from './config.js';
import { loadVision } from './vision.js';

const T = CONFIG.tracking;

const makeHand = (id) => ({ id, present: false, size: 0, sx: 0.5, sy: 0.5, pinch: false, pinchAmount: 0, pts: new Float32Array(42), lastSeen: 0 });

export class Tracker {
  constructor() {
    this.hands = [makeHand('hand0')];   // one hand at a time: busy rooms are full of hands
    this.presence = { present: false, faceW: 0, lastSeen: 0 };
    this.fps = 0;
    this.running = false;
    this._n = 0;
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute('playsinline', '');
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      // small frames are plenty: the hand model works at 224 px internally; less to copy each frame
      video: { facingMode: 'user', width: { ideal: T.videoWidth }, height: { ideal: T.videoHeight }, frameRate: { ideal: 30 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    if (await this._startWorker()) { this.running = true; this._tick(); return; }

    // Fallback: run MediaPipe on the main thread
    const { vision, fileset } = await loadVision();
    const create = async (Task, options) => {
      try { return await Task.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } }); }
      catch { return Task.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } }); }
    };
    this.handLandmarker = await create(vision.HandLandmarker, {
      baseOptions: { modelAssetPath: T.handModel },
      runningMode: 'VIDEO', numHands: T.detectHands,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    if (T.trackPresence) {
      try {
        this.presenceDetector = await create(vision.FaceDetector, {
          baseOptions: { modelAssetPath: T.presenceModel }, runningMode: 'VIDEO', minDetectionConfidence: 0.5,
        });
      } catch { /* optional */ }
    }
    this.running = true;
    this._tick();
  }

  /** Start the background worker; resolves false if it isn't available. */
  _startWorker() {
    if (!T.useWorker || typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      try {
        // classic (not module) worker: MediaPipe's loader needs importScripts()
        this.worker = new Worker(new URL('./trackingWorker.js', import.meta.url));
      } catch { return done(false); }
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') done(true);
        else if (m.type === 'error') { console.warn('[tracker] worker failed, using main thread:', m.message); this.worker.terminate(); this.worker = null; done(false); }
        else if (m.type === 'result') this._onWorkerResult(m);
      };
      this.worker.onerror = () => { this.worker?.terminate(); this.worker = null; done(false); };
      this.worker.postMessage({
        type: 'init', bundle: T.visionBundle, wasmRoot: T.wasmRoot,
        handModel: T.handModel, numHands: T.detectHands,
        presenceModel: T.trackPresence ? T.presenceModel : null,
      });
      setTimeout(() => { if (!settled) { this.worker?.terminate(); this.worker = null; done(false); } }, 30000);
    });
  }

  _onWorkerResult(m) {
    this.busy = false;
    this.detectMs = m.ms;
    const now = performance.now();
    if (m.hands) this._hands(m.hands, now);
    if (m.people) this._presence(m.people, now);
  }

  _tick = () => {
    if (!this.running) return;
    this._timer = setTimeout(this._tick, this.idle ? T.idleIntervalMs : T.detectIntervalMs);   // idle: set by main while nobody is there
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    const now = performance.now();
    this._n++;

    if (this.worker) {
      // one frame in flight at a time; skip if the worker is still busy
      if (this.busy && now - this.sentAt < 1000) return;
      this.busy = true; this.sentAt = now;
      this._count(now);
      const doPresence = T.trackPresence && this._n % T.presenceEvery === 0;
      createImageBitmap(v).then((bitmap) => {
        if (!this.worker) { bitmap.close(); return; }
        this.worker.postMessage({ type: 'frame', bitmap, ts: now, doPresence }, [bitmap]);
      }).catch(() => { this.busy = false; });
      return;
    }

    // main-thread fallback (MediaPipe needs strictly increasing timestamps per task)
    this._count(now);
    try { this._hands(this.handLandmarker.detectForVideo(v, now), now); } catch { /* keep going */ }
    if (this.presenceDetector && this._n % T.presenceEvery === 0) {
      try {
        const W = v.videoWidth || 1;
        this._presence((this.presenceDetector.detectForVideo(v, now + 0.2).detections || [])
          .map((d) => ({ x: (d.boundingBox.originX + d.boundingBox.width / 2) / W, w: d.boundingBox.width / W })), now);
      } catch { /* keep going */ }
    }
  };

  /** people: [{ x, w }] — is someone standing in front, and how close (the nearest face) */
  _presence(people, now) {
    const P = this.presence;
    let w = 0;
    for (const f of people) if (f.w > w) w = f.w;
    if (w >= T.presenceMinFace) {
      P.faceW = P.present ? P.faceW + (w - P.faceW) * 0.4 : w;
      P.present = true;
      P.lastSeen = now;
    } else if (P.present && now - P.lastSeen > T.presenceLostMs) {
      P.present = false;
    }
  }

  _count(now) {
    this._times = (this._times || []).filter((t) => now - t < 1000); this._times.push(now);
    this.fps = this._times.length;
  }

  /**
   * Only ONE hand drives the stage. Several may be in view (crowds, passers-by);
   * we stay with the hand we already follow, and otherwise pick the biggest
   * (nearest the screen). Small, far-away hands are ignored.
   */
  _hands(res, now) {
    const list = res.landmarks || [];
    const aspect = this.video.videoWidth / this.video.videoHeight || 4 / 3;
    const h = this.hands[0];
    let pick = null, best = Infinity;
    for (const lm of list) {
      const size = Math.hypot((lm[0].x - lm[9].x) * aspect, lm[0].y - lm[9].y);
      if (size < T.minHandSize) continue;
      const sx = toScreenX((lm[4].x + lm[8].x) / 2), sy = toScreenY((lm[4].y + lm[8].y) / 2);
      // following someone: the hand closest to where theirs just was; otherwise the biggest
      const score = h.present ? Math.hypot(sx - h.sx, sy - h.sy) : -size;
      if (h.present && score > T.handSwitchDist) continue;
      if (score < best) { best = score; pick = { lm, size, sx, sy }; }
    }
    if (!pick) {
      if (h.present && now - h.lastSeen > T.handLostAfterMs) { h.present = false; h.pinch = false; }
      return;
    }
    const { lm } = pick;
    for (let j = 0; j < 21; j++) {
      h.pts[j * 2] = toScreenX(lm[j].x);
      h.pts[j * 2 + 1] = toScreenY(lm[j].y);
    }
    // Pinch = thumb tip ↔ index tip, relative to hand size (wrist ↔ middle knuckle)
    const dist = (a, b) => Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y);
    const ratio = dist(4, 8) / Math.max(1e-4, pick.size);
    h.pinch = h.pinch ? ratio < IC.pinchOff : ratio < IC.pinchOn;
    h.pinchAmount = clamp01((IC.pinchOff + 0.15 - ratio) / (IC.pinchOff + 0.15 - IC.pinchOn * 0.6));
    h.sx = pick.sx;
    h.sy = pick.sy;
    h.size = pick.size;                 // bigger = closer (for "step closer / back" hints)
    h.present = true;
    h.lastSeen = now;
  }

  stop() {
    this.running = false;
    this.worker?.terminate();
    clearTimeout(this._timer);
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const toScreenX = (x) => clamp01(0.5 + ((T.mirror ? 1 - x : x) - 0.5) * IC.handGain);
const toScreenY = (y) => clamp01(0.5 + (y - 0.5) * IC.handGain + IC.handOffsetY);
