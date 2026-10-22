# You on the Moors Now: Stage Props Kiosk

An interactive kiosk for Loyola University New Orleans' production of *You on the Moors Now*. A webcam tracks the visitor's hand, so they can pick up and play with props from the show on a 3D stage. It's plain HTML/JS with no build step or backend.

## Run

- **On the kiosk:** double-click `start-kiosk.command`. It serves this folder on `127.0.0.1:8765` using `serve.py` (which turns off browser caching so edits always show up) and opens Chrome full-screen. Approve the camera prompt once.
- **By hand:** run `python3 serve.py` in this folder and open `http://127.0.0.1:8765`.
- **Online:** drag this folder onto the Netlify site's Deploys tab. The URL stays the same. The camera needs https or localhost.

Staff keys: **D** shows tracking, distance and performance data. **F** toggles fullscreen.

## The experience

**Entrance (game-style)**
1. **Landing screen** (nobody there): "Your hand is the controller", with three big how-to-play steps (*Stand here: about 3 feet back · Raise a hand · Pinch to grab*) and a "Step up to play" button. The text sits in the top half so passers-by can watch a ghost hand demo the props below (`src/attract.js`, `CONFIG.attract`).
2. **Get in position** (someone walks up, before they raise a hand): a small face detector notices them, the landing screen fades out and a "We see you" screen appears. It shows a live camera view of them and a **Too close · Perfect · Too far** meter, with "Come a little closer", "Take a step back" or "Perfect! Now raise your hand". Turn the camera view off with `intro.ready.mirror: false`.
3. **"Got your hand!"** flashes when the hand is found.

**Play**
- **Warm-up:** for about 6 seconds every prop is unlocked and glowing ("Try it out"), so visitors see they can grab anything.
- **Four cues** set the scene before curtain:
  1. *Signal the stage crew:* wave the handkerchief.
  2. *Set the tea:* carry the teacup to the glowing mark. Rushing it spills.
  3. *Light the campfire:* hold the s'more until it catches fire, then shake it out.
  4. *Tie it all together:* twirl the ribbon in a circle.

  The target prop glows and sparkles, and a line of dots leads from the hand to it. Other props are locked and shake: "Not that one yet." A cue card shows the task, a tip and a progress bar, and a checklist ticks off each step. After 7 s without success the tip spells out how; halfway through, a little cheer appears. Each step ends with "Cue N complete".
- **Finale, then free play:** "Places, everyone." Then every prop unlocks, and a banner says "The stage is yours". Under it, "Try: …" ideas rotate every few seconds. Picking up a prop shows a short line (`CONFIG.whispers`).
- If the hand drops but the person stays, the "get in position" screen comes back and the game pauses. When everyone has left for 5 s, the landing screen returns and the next visitor starts fresh.

**Hands and props**
- **One hand at a time:** the camera follows one hand and ignores small, far-off hands of passers-by (`detectHands`, `minHandSize`, `handSwitchDist` in `CONFIG.tracking`).
- **Pinch** (thumb to index finger) over a prop to pick it up. Move it, then open your hand to throw it. An open-hand swipe knocks props away. Props fall gently, bounce off the edges, then float home. While one prop is held, the others stay put.
- **Mouse and touch work as a hand too:** moving is hovering and pressing is pinching.
- **Reactions:**
  - The handkerchief ripples, shimmers when waved and floats down like cloth.
  - The ribbon draws glowing trails.
  - The teacup steams, spills when moved fast and refills.
  - The s'more toasts, catches fire, blows out when shaken and relights after 4 s.

## Tuning

Every setting is in `src/config.js`:
- `INTERACTION_CONFIG`: hand gain, pinch thresholds, grab radius, throw strength, gravity, return time.
- `CONFIG.intro`: landing and "get in position" wording.
- `CONFIG.cues`: cue wording, timings, warm-up, free-play ideas.
- `CONFIG.distance`: how far to stand. Press **D** at the spot you want people to stand, read the `face width` and `hand size`, and adjust `faceNear`/`faceFar`/`handNear`/`handFar`. A strip of floor tape there helps a lot.
- `CONFIG.render`: the pixel budget and adaptive resolution.

## Performance (target: 27-inch 2017 5K iMac, Radeon Pro 580)

- **Hand tracking runs in a background worker** (`src/trackingWorker.js`), so animation never waits for the camera. If the worker can't start, it falls back to the main thread.
- **Lighter tracking:**
  - It follows a single hand, so it only searches for a new one when that hand is lost.
  - It checks less often (every 100 ms instead of 40) while nobody is there.
  - It uses a 480×360 camera image.
- **Pixel budget:** big or Retina screens render at most `maxRenderPixels` (about 2.4 million) and Chrome scales the image up. Lower it to about 1,600,000 if it still stutters. **Adaptive resolution** steps down when frames run slow and back up when there's headroom.
- **No repaints of the overlays:**
  - On-screen animations move and fade only (no animated glows or shadows), and hidden screens stop animating.
  - The held-prop spotlight is a small pre-drawn layer moved by the graphics chip.
  - Overlays don't blur what's behind them.
- **Lean scene:**
  - No shadows.
  - Simple curtain material.
  - One shared hand light.
  - Two light beams.
  - The handkerchief and ribbon reshape at a third of the frame rate when idle.

## Files

| File | Role |
|---|---|
| `index.html` | Page structure and overlays |
| `css/kiosk.css` | All overlay styling |
| `src/config.js` | **Every setting and all the wording** |
| `src/main.js` | Frame loop, entrance flow (landing → get in position → play), distance hints |
| `src/tracking.js` | Webcam → the one active hand (pinch point, pinch state, 21 landmarks, size) and presence (is someone standing there, how close) |
| `src/trackingWorker.js` | Runs MediaPipe in a background thread |
| `src/vision.js` | Loads MediaPipe for the main-thread fallback |
| `src/interaction.js` | Hand cursor and skeleton, grabbing, throwing, swiping, prop physics, cue target glow and guide line |
| `src/props.js` | The four props, their home positions, physics and reactions |
| `src/effects.js` | Shared particle system (embers, flame, steam, smoke, drops, sparks, shimmer, glow) and motion trails |
| `src/cues.js` | Warm-up, the four cues, checklist, "cue complete" moments, finale, free play |
| `src/attract.js` | The standby ghost-hand demo |
| `src/scene.js` | Renderer, camera, stage lights, curtains, truss, ghost light, road cases, seats, dust |
| `src/ui.js` | Landing and "get in position" screens, instruction line, prop captions, staff panel |
| `serve.py` | Local no-cache web server |
| `start-kiosk.command` | Double-click launcher for the kiosk |

## Offline

Three.js, MediaPipe `tasks-vision` and its models (`hand_landmarker.task`, `blaze_face_short_range.tflite`) load from CDNs. For a venue without internet, download them into this folder and update the URLs in `index.html` and `src/config.js`.
