/* ==========================================================================
   UI — the screen overlays: landing screen, "get in position", the
   whispered instruction line, prop captions and a hidden staff panel.
   (The cue card, checklist and free-play banner live in cues.js.)
   ========================================================================== */
import { CONFIG } from './config.js';

const $ = (s) => document.querySelector(s);

// line icons for the "how to play" steps
const ICONS = {
  feet: '<svg viewBox="0 0 64 64"><path d="M20 50c-5 0-8-5-8-12s3-16 8-16 7 7 7 14-2 14-7 14z"/><path d="M44 42c-5 0-7-7-7-14s3-14 7-14 8 9 8 16-3 12-8 12z"/><path d="M8 58h48" class="dash"/></svg>',
  hand: '<svg viewBox="0 0 64 80"><rect x="18" y="38" width="30" height="30" rx="12"/><rect x="19" y="14" width="7" height="30" rx="3.5"/><rect x="27.5" y="8" width="7" height="34" rx="3.5"/><rect x="36" y="11" width="7" height="32" rx="3.5"/><rect x="44.5" y="19" width="6.5" height="26" rx="3.25"/><rect x="6" y="40" width="7" height="22" rx="3.5" transform="rotate(-38 9.5 51)"/></svg>',
  pinch: '<svg viewBox="0 0 64 64"><path d="M22 58V38c0-6 4-10 10-10h8c6 0 10 4 10 10v20"/><path d="M36 28c0-8 0-14-4-18s-10-2-10 4"/><path d="M22 38c-6-2-10-8-8-14s6-8 8-10"/><circle cx="22" cy="14" r="3" class="spark"/></svg>',
};

export class UI {
  constructor() {
    this.el = { loading: $('#loading'), instruction: $('#instruction'), message: $('#message'), debug: $('#debug') };
    this.el.message.textContent = CONFIG.ui.noCamera;
    $('#mark-title').textContent = CONFIG.production.title;
    this._cursor();
    const I = CONFIG.intro;
    $('#intro-presenter').textContent = CONFIG.production.presenter;
    $('#intro-title').textContent = CONFIG.production.title;
    $('#intro-headline').textContent = I.headline;
    $('#intro-tag').textContent = I.kicker;
    $('#intro-steps').innerHTML = I.steps.map((st, i) =>
      `<li style="--i:${i}"><span class="step-icon">${ICONS[st.icon] || ''}</span><span class="step-num">${i + 1}</span>` +
      `<span class="step-title">${st.title}</span><span class="step-text">${st.text}</span></li>`).join('');
    $('#intro-cta').textContent = I.cta;
    $('#intro-sub').textContent = I.ctaSub || '';
    $('#ready-kicker').textContent = I.ready.kicker;
    $('#ready-sub').textContent = I.ready.sub;
    $('#hello-line').textContent = I.hello;
    $('#hello-sub').textContent = I.helloSub;
    this.readyShown = false;
    $('#freeplay-line').textContent = CONFIG.cues.freePlay;
    $('#freeplay-sub').textContent = CONFIG.cues.freePlaySub;
    this.introShown = false;
  }

  ready() { this.el.loading.classList.add('gone'); document.body.classList.add('ready'); }

  /** Show a whispered instruction (cross-fades when the text changes); null hides it. */
  prompt(text) {
    if (text === this._prompt) return;
    this._prompt = text;
    const el = this.el.instruction;
    clearTimeout(this._promptT);
    el.classList.remove('show');
    if (!text) return;
    this._promptT = setTimeout(() => { el.textContent = text; el.classList.add('show'); }, el.textContent && el.textContent !== text ? 700 : 0);
  }
  /** Landing screen ("how to play"): fades in when nobody is there, out when someone walks up. */
  intro(show) {
    if (show === this.introShown) return;
    this.introShown = show;
    $('#intro').classList.toggle('show', show);
    document.body.classList.toggle('intro-on', show);
  }
  /**
   * "Get in position" screen.
   * @param status  'near' | 'ok' | 'far' (or null while unknown)
   * @param pos     0..1 along the meter (0.25..0.75 = the good zone)
   */
  position(show, status, pos) {
    if (show !== this.readyShown) {
      this.readyShown = show;
      $('#ready').classList.toggle('show', show);
      document.body.classList.toggle('ready-on', show);
    }
    if (!show) return;
    const key = status || 'far';
    if (key !== this._readyKey) {
      this._readyKey = key;
      $('#ready-line').textContent = CONFIG.intro.ready[key];
      $('#ready').dataset.status = key;
    }
    const p = Math.round(Math.max(0.03, Math.min(0.97, pos)) * 100);
    if (p !== this._meter) {
      this._meter = p;
      const dot = $('#meter-dot');
      dot.style.transform = `translateX(${(p / 100 * dot.parentElement.clientWidth).toFixed(0)}px)`;
    }
  }
  /** Show the live camera inside the "get in position" screen. */
  mirror(video) {
    if (!CONFIG.intro.ready.mirror) { $('#ready-cam').remove(); return; }
    video.classList.add('mirror-video');
    $('#ready-cam').prepend(video);
  }
  /** "Got your hand!" */
  hello() {
    const el = $('#hello');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._helloT);
    this._helloT = setTimeout(() => el.classList.remove('show'), 1500);
  }
  /** A single line that appears briefly, e.g. when a prop is picked up. */
  introCta(text) { $('#intro-cta').textContent = text; }
  whisper(text, ms = 3800) {
    const el = $('#whisper');
    clearTimeout(this._whisperT);
    el.classList.remove('show');
    if (!text) return;
    setTimeout(() => { el.textContent = text; el.classList.add('show'); }, 250);
    this._whisperT = setTimeout(() => el.classList.remove('show'), ms);
  }
  message(show) { this.el.message.classList.toggle('show', show); }

  debug(on, lines) {
    if (on !== undefined) this.el.debug.hidden = !on;
    if (lines && !this.el.debug.hidden) this.el.debug.textContent = lines;
  }

  _cursor() {
    let t;
    window.addEventListener('pointermove', () => {
      document.body.classList.remove('hide-cursor');
      clearTimeout(t);
      t = setTimeout(() => document.body.classList.add('hide-cursor'), 2500);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
