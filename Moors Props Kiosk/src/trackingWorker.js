/* ==========================================================================
   TRACKING WORKER — runs MediaPipe off the main thread so rendering never
   waits for the camera. Receives video frames as ImageBitmaps, returns
   landmarks only. Frames are closed immediately; nothing is stored.
   ========================================================================== */
let hands = null, presence = null;

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      const vision = await import(m.bundle);
      const fileset = await vision.FilesetResolver.forVisionTasks(m.wasmRoot);
      const create = async (Task, options) => {
        try { return await Task.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } }); }
        catch { return Task.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } }); }
      };
      hands = await create(vision.HandLandmarker, {
        baseOptions: { modelAssetPath: m.handModel }, runningMode: 'VIDEO', numHands: m.numHands || 1,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      if (m.presenceModel) {
        // optional: if the tiny face detector won't load, hands still work
        try {
          presence = await create(vision.FaceDetector, {
            baseOptions: { modelAssetPath: m.presenceModel }, runningMode: 'VIDEO', minDetectionConfidence: 0.5,
          });
        } catch { presence = null; }
      }
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    }
    return;
  }

  if (m.type === 'frame') {
    const out = { type: 'result', ts: m.ts, hands: null, people: null, ms: 0 };
    const t0 = performance.now();
    try {
      const h = hands.detectForVideo(m.bitmap, m.ts);
      out.hands = { landmarks: h.landmarks || [] };
      if (m.doPresence && presence) {
        const W = m.bitmap.width || 1;
        // only the face widths and centres — who is there and how far away
        out.people = (presence.detectForVideo(m.bitmap, m.ts + 0.2).detections || [])
          .map((d) => ({ x: (d.boundingBox.originX + d.boundingBox.width / 2) / W, w: d.boundingBox.width / W }));
      }
    } catch { /* skip this frame */ }
    m.bitmap.close();
    out.ms = performance.now() - t0;
    self.postMessage(out);
  }
};
