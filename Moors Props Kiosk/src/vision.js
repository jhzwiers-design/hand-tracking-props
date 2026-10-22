/* MediaPipe loader — used by the webcam tracker (tracking.js) when it runs without a worker. */
import { CONFIG } from './config.js';

let pending = null;
export function loadVision() {
  if (!pending) {
    pending = (async () => {
      const vision = await import(CONFIG.tracking.visionBundle);
      const fileset = await vision.FilesetResolver.forVisionTasks(CONFIG.tracking.wasmRoot);
      return { vision, fileset };
    })();
  }
  return pending;
}
