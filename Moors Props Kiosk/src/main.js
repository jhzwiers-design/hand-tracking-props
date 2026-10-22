/* ==========================================================================
   MAIN — wires everything together and runs the frame loop.

     landing ("how to play") → get in position → "Got your hand!" → warm-up
     → four cues → finale → free play. Everyone leaves → landing again.

   Mouse / touch act as a hand, with or without a camera.
   ========================================================================== */
import { CONFIG } from './config.js';
import { createStage } from './scene.js';
import { Tracker } from './tracking.js';
import { UI } from './ui.js';
import { Interaction } from './interaction.js';
import { Cues } from './cues.js';
import { Attract } from './attract.js';

const ui = new UI();
const stage = createStage(document.getElementById('stage'));
const tracker = new Tracker();

// state: loading → running · mode: camera | nocamera
const S = { state: 'loading', mode: 'camera', debug: false, handSince: 0, handGoneSince: -1e9, intro: false, seenAt: -1e9, ready: false, fresh: true };   // -1e9: the landing screen shows immediately on first load
let interaction = null, cues = null, attract = null;

// Mouse / touch behave like a hand: move = hover, press = pinch.
const pointer = { id: 'pointer', present: false, sx: 0.5, sy: 0.5, pinch: false, pinchAmount: 0, pts: null, lastMove: 0, touch: false };
const handInputs = [];

function anyHand() { return handInputs.some((h) => h.present && !h.ghost); }   // the standby demo hand doesn't count

/* ---------------- start-up ---------------- */
function boot() {
  interaction = new Interaction(stage);
  cues = new Cues(interaction, stage);
  attract = new Attract(interaction, stage.camera);
  window.kiosk = { S, tracker, stage, interaction, cues, attract, pointer, config: CONFIG, frame };   // frame: for scripted tests
  ui.ready();
  begin();
}

async function begin() {
  navigator.wakeLock?.request('screen').catch(() => {});
  try {
    await tracker.start();
    ui.mirror(tracker.video);
    S.mode = 'camera';
  } catch (e) {
    console.warn('[kiosk] camera tracking unavailable:', e);
    S.mode = 'nocamera';
    document.body.classList.add('no-camera');
    ui.introCta(CONFIG.intro.ctaTouch);
    ui.message(true);
    setTimeout(() => ui.message(false), CONFIG.ui.noCameraMessageMs);
  }
  S.state = 'running';
  document.body.dataset.state = 'running';
}

/* ---------------- mouse / touch as a hand ---------------- */
const onStage = () => S.state === 'running';
const movePointer = (e) => {
  pointer.sx = e.clientX / window.innerWidth;
  pointer.sy = e.clientY / window.innerHeight;
  pointer.lastMove = performance.now();
  pointer.touch = e.pointerType === 'touch';
};
window.addEventListener('pointermove', (e) => { if (!onStage()) return; movePointer(e); pointer.present = true; });
window.addEventListener('pointerdown', (e) => {
  if (!onStage()) return;
  movePointer(e); pointer.present = true; pointer.pinch = true; pointer.pinchAmount = 1;
});
const pointerUp = () => { pointer.pinch = false; pointer.pinchAmount = 0; if (pointer.touch) pointer.lastMove = performance.now() - 2000; };
window.addEventListener('pointerup', pointerUp);
window.addEventListener('pointercancel', pointerUp);

/* ---------------- frame loop ---------------- */
let last = performance.now(), frames = 0, fps = 0, fpsT = last;
const parallax = { x: 0, y: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));   // never negative, never a huge jump
  last = now;
  const t = now / 1000;

  if (interaction) {
    // Gather hands: camera hand + mouse/touch
    if (pointer.present && !pointer.pinch && now - pointer.lastMove > 2500) pointer.present = false;
    handInputs.length = 0;
    if (S.mode === 'camera') for (const h of tracker.hands) handInputs.push(h);
    handInputs.push(pointer);
    // standby demo: a ghost hand shows what to do while nobody is here
    attract.update(dt, S.intro && !anyHand());
    handInputs.push(attract.hand);

    interaction.update(dt, t, handInputs);
    // captions on pickup only when everything is unlocked — during the cues the cue card does the talking
    if (CONFIG.whispers && cues.open && !S.intro && interaction.events.includes('grab')) ui.whisper(CONFIG.whispers[interaction.lastGrabbed]);
    if (interaction.events.includes('blocked')) cues.blocked();
    updateFocus();
    updateIntro(now, dt);
    cues.update(dt, t, S.intro || S.ready);
    updateInstruction(now);
  }
  // subtle camera drift with the visitor's hand
  const h = handInputs.find((x) => x.present && !x.ghost);
  if (h) { parallax.x = (h.sx - 0.5) * 1.2; parallax.y = (0.5 - h.sy) * 1.2; }
  stage.update(dt, t, h ? parallax : null);

  frames++;
  if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
  if (S.debug) {
    ui.debug(undefined,
      `render ${fps} fps @ ${stage.pixelRatio().toFixed(2)}x · tracker ${tracker.fps} fps (${tracker.worker ? 'worker' : 'main thread'}, ${(tracker.detectMs || 0).toFixed(1)} ms) · particles ${interaction?.effects.live ?? 0}\n` +
      `mode ${S.mode} · screen ${S.intro ? 'landing' : S.ready ? 'get in position' : 'playing'} · cue phase ${cues?.phase}\n` +
      `presence ${tracker.presence.present ? 'yes' : 'no'} · face width ${tracker.presence.faceW.toFixed(3)} · hand size ${(tracker.hands[0].size || 0).toFixed(3)}\n` +
      `hand ${tracker.hands[0].present ? (tracker.hands[0].pinch ? 'pinch' : 'open') : '–'} · pointer ${pointer.present ? (pointer.pinch ? 'pinch' : 'hover') : '–'}`);
  }
}
requestAnimationFrame(frame);

/* ---------------- emphasis spotlight on the held prop (only touches the DOM when it changes) ---------------- */
const focusEl = document.getElementById('focus');
let lastFocus = '';
// The 200px element is scaled so its edge always lies beyond the screen; its gradient is
// drawn once for the current screen size (redrawn only on resize, never per frame).
let focusScale = 0;
function sizeFocus() {
  const vmin = Math.min(innerWidth, innerHeight);
  focusScale = (2.2 * Math.max(innerWidth, innerHeight)) / 100;     // half-size covers > 2 screen widths
  const clear = (0.11 * vmin) / focusScale, dark = (0.34 * vmin) / focusScale;   // in element pixels
  focusEl.style.background = `radial-gradient(circle at center, transparent 0, transparent ${clear.toFixed(2)}px, rgba(2,1,2,.62) ${dark.toFixed(2)}px, rgba(2,1,2,.62) 100%)`;
  lastFocus = '';
}
window.addEventListener('resize', () => { if (focusScale) sizeFocus(); });
function updateFocus() {
  const f = interaction.spotlight;
  const key = f.amount < 0.01 ? '0' : `${(f.x * 100).toFixed(1)}|${(f.y * 100).toFixed(1)}|${f.amount.toFixed(2)}`;
  if (key === lastFocus) return;
  lastFocus = key;
  focusEl.style.opacity = f.amount < 0.01 ? '0' : (f.amount * 0.9).toFixed(2);
  if (f.amount >= 0.01) {
    if (focusScale === 0) sizeFocus();
    focusEl.style.transform = `translate3d(${(f.x * innerWidth).toFixed(0)}px, ${(f.y * innerHeight).toFixed(0)}px, 0) scale(${focusScale.toFixed(3)})`;
  }
}

/* ---------------- entrance ----------------
   landing ("how to play")  ──someone walks up──▶  get in position (distance meter, live camera)
        ▲                                               │ raises a hand
        └──── nobody (no face, no hand) for a while ────┴──▶ "Got your hand!" → warm-up → cues
   ------------------------------------------------------------------------------------------- */
function updateIntro(now, dt) {
  const hand = anyHand();
  const person = S.mode === 'camera' && tracker.presence.present;
  if (hand) {
    S.handGoneSince = 0;
    if (!S.handSince) { S.handSince = now; if (S.intro || S.ready) ui.hello(); }
    S.fresh = false;
  } else { S.handSince = 0; if (!S.handGoneSince) S.handGoneSince = now; }
  if (hand || person) S.seenAt = now;
  const loading = S.state !== 'running';

  // landing: back only once the stage has been empty (no hand AND no face) for a while
  const landing = !loading && !hand && !person && (S.intro || now - S.seenAt > CONFIG.intro.returnAfterMs);
  const goneFor = hand ? 0 : now - S.handGoneSince;
  // next visitor starts afresh: everyone left, or someone stood there a long time without playing
  if ((landing && !S.intro) || (!hand && !S.fresh && goneFor > CONFIG.intro.playerResetMs)) {
    interaction.everGrabbed = false; cues.reset(); S.fresh = true;
  }
  S.intro = landing;
  tracker.idle = landing;
  ui.intro(landing);

  // get in position: someone's here but no hand yet (mid-game, only after the hand has been gone a moment)
  S.ready = !loading && !landing && !hand && person && (S.fresh || goneFor > 900);
  if (S.ready) {
    const D = CONFIG.distance, w = tracker.presence.faceW;
    const status = settle('faceDist', w > D.faceNear ? 'near' : w < D.faceFar ? 'far' : 'ok', now);
    const pos = 0.25 + 0.5 * (Math.log(D.faceNear) - Math.log(Math.max(1e-3, w))) / (Math.log(D.faceNear) - Math.log(D.faceFar));
    ui.position(true, status, pos);
  } else ui.position(false);

  // "house lights": the stage dims behind the landing screen and comes up when someone walks up
  const target = landing || loading ? CONFIG.intro.dimExposure : CONFIG.intro.liveExposure;
  const r = stage.renderer;
  r.toneMappingExposure += (target - r.toneMappingExposure) * (1 - Math.exp(-dt * (landing ? 1.2 : 3)));
}

/** Debounce a reading: it must hold for CONFIG.distance.holdMs before it's believed. */
const settled = {};
function settle(key, raw, now) {
  const s = settled[key] ||= { v: raw, cand: raw, at: now };
  if (raw !== s.cand) { s.cand = raw; s.at = now; }
  else if (raw !== s.v && now - s.at > CONFIG.distance.holdMs) s.v = raw;
  return s.v;
}

/* ---------------- adaptive instruction ---------------- */
function updateInstruction(now) {
  if (S.state !== 'running' || S.intro || S.ready) return ui.prompt(null);   // the entrance screens do the guiding
  // too far / too close? say so (hand size in the camera frame)
  const h0 = tracker.hands[0];
  if (S.mode === 'camera' && h0.present && h0.size) {
    const D = CONFIG.distance;
    const st = settle('handDist', h0.size > D.handNear ? 'near' : h0.size < D.handFar ? 'far' : 'ok', now);
    if (st !== 'ok') return ui.prompt(st === 'far' ? D.playFar : D.playNear);
  }
  if (cues.active) return ui.prompt(null);                      // the cue card does the guiding
  // free play: a nudge for anyone who hasn't picked something up yet
  ui.prompt(!interaction.everGrabbed && anyHand() && now - S.handSince > 1200 ? CONFIG.ui.pinchHint : null);
}

/* ---------------- staff keys: D = debug, F = fullscreen ---------------- */
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'd') { S.debug = !S.debug; ui.debug(S.debug); }
  if (k === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});

boot();
