/* ==========================================================================
   CONFIGURATION — every tunable lives here.
   ========================================================================== */

/* ==========================================================================
   INTERACTION — hand tracking and the props the viewer can play with.
   ========================================================================== */
export const INTERACTION_CONFIG = {
  // Hands: camera frame → screen. gain > 1 lets a comfortable arm movement reach the screen edges.
  handGain: 1.45,
  handOffsetY: -0.05,      // shift the hand cursor up a little (hands are usually held low in frame)
  pinchOn: 0.32,           // thumb–index distance / hand size that counts as a pinch
  pinchOff: 0.46,          // must open past this to release (hysteresis stops flicker)
  handSmoothing: 0.45,     // per 60fps frame — cursor follow (higher = snappier, lower = steadier)
  handPlaneZ: 0.5,         // depth (m) of the plane the hand moves on, in front of the stage
  showSkeleton: true,      // draw the glowing hand skeleton so viewers see they're being tracked

  // Props
  grabRadius: 0.2,         // m — how close the pinch must be to pick a prop up
  targetGrabBoost: 1.3,    // during a cue: the prop it asks for can be grabbed from a little further away…
  otherGrabFactor: 0,      // …and the others are locked (they shake: "not that one yet"). 0.3 = only a very precise pinch
  hoverRadius: 0.26,
  holdStiffness: 22,       // how tightly a held prop follows the hand (per second)
  throwGain: 1.15,         // release velocity multiplier
  pushGain: 0.7,           // open-hand swipe impulse
  pushMinSpeed: 0.6,       // m/s hand speed before a swipe pushes props
  drag: 1.6,               // air drag (per second) after a throw
  gravity: 1.2,            // m/s² — gentle, theatrical fall
  bounce: 0.55,            // energy kept when bouncing off the frame edges
  returnAfterMs: 3500,     // a released prop floats back to its spot after this
  returnStiffness: 2.2,
};

export const CONFIG = {
  production: {
    presenter: 'Loyola University New Orleans',
    title: 'You on the Moors Now',
  },

  /* ---------------------------------------------------------------- */
  /* Tracking                                                          */
  /* ---------------------------------------------------------------- */
  tracking: {
    mirror: true,               // front-facing webcam
    detectIntervalMs: 40,       // ~25 detections/s; the cursor is smoothed in between
    idleIntervalMs: 100,        // slower checks while nobody is there (keeps the iMac cool on long days)
    videoWidth: 480, videoHeight: 360,
    visionBundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
    wasmRoot: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    handModel: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    useWorker: true,            // run detection in a background thread (smooth rendering)
    handLostAfterMs: 250,
    // ONE visitor at a time: only one hand drives the stage
    detectHands: 1,             // 1 = much lighter: once a hand is found, MediaPipe just follows it and skips the
                                // expensive "find a new hand" step. 2 = can choose between two people's hands, but
                                // runs that search on every frame whenever only one hand is in view.
    minHandSize: 0.045,         // ignore hands smaller than this (far-off passers-by, ~2.4 m+), fraction of frame height
    // Presence: a tiny face detector notices someone walking up BEFORE they raise a hand,
    // so the landing screen can fade out and coach them into position.
    trackPresence: true,
    presenceModel: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
    presenceEvery: 3,           // check every Nth tick (~8 times a second)
    presenceMinFace: 0.05,      // faces narrower than this (fraction of frame width) are just passing by in the distance
    presenceLostMs: 1500,       // no face this long → nobody there
    handSwitchDist: 0.25,       // a hand jumping further than this (screen fraction) is someone else's
  },

  interaction: INTERACTION_CONFIG,

  /* ---------------------------------------------------------------- */
  /* Entrance — landing screen and "get in position". Edit freely.     */
  /* ---------------------------------------------------------------- */
  intro: {
    // the landing screen ("how to play"), shown while nobody is there
    kicker: 'An interactive stage · Play with your hand',
    headline: 'Your hand is the controller',
    steps: [
      { icon: 'feet', title: 'Stand here', text: 'About 3 feet back (1 m)' },
      { icon: 'hand', title: 'Raise a hand', text: 'The camera finds it — no touching' },
      { icon: 'pinch', title: 'Pinch to grab', text: 'Thumb + finger together' },
    ],
    cta: 'Step up to play',
    ctaSub: '4 quick cues · about a minute',
    ctaTouch: 'Touch the stage to play',   // shown instead when there is no camera
    // the "get in position" screen, shown once someone walks up (before they raise a hand)
    ready: {
      kicker: 'We see you',
      far: 'Come a little closer',
      near: 'Take a step back',
      ok: 'Perfect! Now raise your hand',
      sub: 'The camera only follows your hand · nothing is recorded',
      mirror: true,          // show a small live camera view so people see themselves framed
    },
    hello: 'Got your hand!',  // flashes when a hand is first found
    helloSub: 'Let’s play',
    playerResetMs: 20000,    // someone stands there this long without a hand → the next visitor starts fresh
    returnAfterMs: 5000,     // nobody (no hand, no face) for this long → lights dim, landing screen returns
    dimExposure: 0.62,       // stage brightness while the landing screen is up…
    liveExposure: 1.05,      // …and once a hand takes the stage
  },

  /* ---------------------------------------------------------------- */
  /* Cues — the short task each visitor plays through, one at a time.  */
  /* check: 'wave' | 'deliver' | 'fire' | 'twirl' (see src/cues.js)    */
  /* ---------------------------------------------------------------- */
  cues: {
    steps: [
      { prop: 'handkerchief', check: 'wave', count: 5,
        title: 'Signal the stage crew', text: 'Pick up the handkerchief and wave it.',
        hint: 'Wave it side to side!', done: 'Signal received.' },
      { prop: 'teacup', check: 'deliver',
        title: 'Set the tea', text: 'Carry the teacup to the glowing mark — gently.',
        hint: 'Slowly, or it will spill…', spillHint: 'Careful — it’s spilling!',
        done: 'Tea is served. Not a drop spilled.', doneSpilled: 'Tea is served. Mostly.' },
      { prop: 'smores', check: 'fire',
        title: 'Light the campfire', text: 'Hold the s’more until it catches fire…',
        hint: 'Keep holding it — it’s toasting.', text2: '…now shake it to put it out!', hint2: 'Shake it hard!',
        done: 'Toasted to perfection.' },
      { prop: 'ribbon', check: 'twirl', turns: 1,
        title: 'Tie it all together', text: 'Twirl the ribbon in a big circle.',
        hint: 'Round and round!', done: 'Beautifully done.' },
    ],
    // warm-up: a few seconds to play with anything before the cues begin
    warmup: { kicker: 'Warm-up', title: 'Try it out', text: 'Pinch to pick anything up — move it, shake it, toss it.',
      hint: 'Your first cue is coming up…', ms: 6000, maxMs: 11000,   // waits (up to maxMs) for them to put a prop down
      toast: 'Nice! Now the real thing', toastSub: '4 quick cues to set the scene' },
    nudgeMs: 7000,            // no luck with the glowing prop this long → a clearer hint
    nudge: 'Reach toward the glow, then pinch your thumb and finger together.',
    cheers: ['Halfway there!', 'That’s it — keep going!', 'Ooh, nice!', 'Almost…'],
    pinchHint: 'Pinch your fingers to pick it up.',
    blockedHint: 'Not that one yet — try the glowing one.',
    listTitle: 'Tonight’s cues',
    listDone: 'Scene set ✓',
    lastToGo: 'That’s the last one!',
    freePlay: 'The stage is yours — pick up anything and play.',
    freePlaySub: 'Stay as long as you like',
    // free play: little "try this" ideas, rotated under the banner to keep people playing
    tryThis: [
      'Try: toss the handkerchief and watch it drift down',
      'Try: toast another s’more — then shake it out',
      'Try: draw loops in the air with the ribbon',
      'Try: whip the teacup around and watch it spill',
      'Try: fling a prop across the stage',
    ],
    tryEveryMs: 6500,
    markAt: [0.6, 0.5],       // where the tea mark sits on screen (0..1)
    pauseMs: 2200,            // pause on the "done" line before the next cue
    finale: ['Places, everyone.', 'You set the scene. The stage is yours.'],
    finaleMs: 6000,           // finale on screen, then free play
  },

  /* Standby demo: a ghost hand shows passers-by what to do */
  attract: {
    enabled: true,
    order: ['teacup', 'ribbon', 'handkerchief', 'smores'],
    startDelay: 2.5,          // seconds after the stage empties before the demo starts
    betweenDelay: 1.2,        // pause between props
    restartDelay: 3,          // after a visitor leaves
    handSize: 1.0,            // ghost hand size (1 ≈ a quarter of the screen height)
  },

  /* One quiet line when a prop is picked up during free play (set whispers: null to turn off) */
  whispers: {
    handkerchief: 'Dropped, perhaps on purpose.',
    ribbon: 'Tied neatly. For now.',
    teacup: 'Mind your manners. Or don’t.',
    smores: 'Not every story ends in a drawing room.',
  },

  /* How far to stand. Face and hand sizes are fractions of the camera frame;
     bigger = closer. Press D on the kiosk to read the live values and tune. */
  distance: {
    faceNear: 0.30,          // face wider than this → "take a step back"   (≈ 0.5 m)
    faceFar: 0.09,           // face narrower than this → "come closer"     (≈ 1.7 m)
    handNear: 0.26,          // same, for the hand while playing
    handFar: 0.06,
    holdMs: 700,             // a reading must hold this long before the hint changes
    playFar: 'Step a little closer — your hand is hard to see',
    playNear: 'Step back a little — keep your whole hand in view',
  },

  ui: {
    pinchHint: 'Pinch to pick something up.',
    noCamera: 'Camera tracking is unavailable. Touch the stage to play.',
    noCameraMessageMs: 4500,
  },

  render: {
    maxRenderPixels: 2400000,// pixel budget (≈ 2070×1160). Big/Retina screens render this many and scale up.
                             // Raise on a fast machine for sharper edges; lower if it still stutters.
    maxPixelRatio: 1.25,     // upper limit; drops automatically if frames run slow
    minPixelRatio: 0.7,      // lowest the automatic scaling will go
    antialias: true,         // smooth edges (cheap at the pixel budget above)
    adaptive: true,          // lower/raise resolution to hold a smooth frame rate
    dust: 120,
  },
};

