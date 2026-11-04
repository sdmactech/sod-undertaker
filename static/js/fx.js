/* ═══════════════════════════════════════════════════════
   THE UNDERTAKER'S LEDGER — v4 effects
   Mode manager (light / full 3D), sound manager, light-mode casket,
   dust, lantern, and the reactions app.js fires as custom events:
     ledger:qty   { kind, id, delta, at: Element }
     ledger:bill  { total, picked }
     ledger:view  { name }
   Nothing here touches data. Remove this file and the ledger still works.
   ═══════════════════════════════════════════════════════ */
'use strict';

const root = document.documentElement;
const V = new URL(import.meta.url).searchParams.get('v') || '';
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const canHover = matchMedia('(hover: hover)');

/* ─── WebGL capability ─── */
function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch { return false; }
}
const webgl = hasWebGL();

/* ═══════════════ MODE ═══════════════ */
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let scene = null;      // scene3d module instance when loaded
let sceneLoading = null;

async function setMode(mode, { save = true } = {}) {
  if (mode === 'full' && (!webgl || reduced.matches)) mode = 'light';
  root.dataset.fx = mode;
  if (save) store.set('fx', mode);
  const btn = $('#fxMode');
  if (btn) btn.setAttribute('aria-pressed', mode === 'full');
  if (mode === 'full') {
    if (!scene && !sceneLoading) {
      const fail = err => { console.error('3D scene failed, falling back', err); sceneLoading = null; scene?.dispose(); scene = null; setMode('light'); };
      sceneLoading = import(`./scene3d.js?v=${new URL(import.meta.url).searchParams.get('v') || ''}`).then(m => {
        scene = m.createScene($('#stage3d'), { onCreak: () => sound.play('creak'), onReady: () => $('#stage3d').classList.add('ready'), onError: fail });
        scene.setOpen(openAmount);
        if (root.dataset.fx !== 'full') scene.pause();
        return scene;
      }).catch(fail);
    } else if (scene) scene.resume();
    $('.lantern')?.classList.add('on');
  } else {
    scene?.pause();
    $('.lantern')?.classList.remove('on');
  }
}

/* ═══════════════ SOUND ═══════════════ */
const sound = (() => {
  const files = { creak: 'creak', flame: 'flame', coin: 'coin', seal: 'seal', bell: 'bell' };
  const gain = { creak: .9, flame: .45, coin: .7, seal: .85, bell: .9 };
  let ctx = null, master = null, flameSrc = null, flameGain = null;
  const buffers = {};
  let on = false, unlocked = false;

  async function ensureCtx() {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination); }
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    unlocked = ctx.state === 'running';
  }
  async function load(name) {
    if (buffers[name]) return buffers[name];
    const res = await fetch(`/static/audio/${files[name]}.mp3?v=${V}`);
    if (!res.ok) throw new Error(`no audio ${name}`);
    const data = await res.arrayBuffer();
    buffers[name] = await ctx.decodeAudioData(data);
    return buffers[name];
  }
  async function play(name, { rate = 1, vol = 1 } = {}) {
    if (!on) return;
    try {
      await ensureCtx(); if (!unlocked) return;
      const buf = await load(name);
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
      const g = ctx.createGain(); g.gain.value = (gain[name] || .6) * vol;
      src.connect(g); g.connect(master); src.start();
    } catch (e) { /* missing file or blocked autoplay: stay silent */ }
  }
  async function flame(start) {
    if (!on || !start) { if (flameGain) { flameGain.gain.linearRampToValueAtTime(0, ctx.currentTime + .6); setTimeout(() => { try { flameSrc?.stop(); } catch {} flameSrc = null; }, 700); } return; }
    if (flameSrc) return;
    try {
      await ensureCtx(); if (!unlocked) return;
      const buf = await load('flame');
      flameSrc = ctx.createBufferSource(); flameSrc.buffer = buf; flameSrc.loop = true;
      flameGain = ctx.createGain(); flameGain.gain.value = 0;
      flameSrc.connect(flameGain); flameGain.connect(master); flameSrc.start();
      flameGain.gain.linearRampToValueAtTime(gain.flame, ctx.currentTime + 1.2);
    } catch {}
  }
  async function set(enabled, { save = true } = {}) {
    on = enabled;
    root.dataset.sound = on ? 'on' : 'off';
    if (save) store.set('sound', on ? 'on' : 'off');
    if (on) { await ensureCtx(); flame(true); play('bell'); $('.masthead')?.classList.add('toll'); setTimeout(() => $('.masthead')?.classList.remove('toll'), 1700); }
    else flame(false);
    $('#fxSound')?.setAttribute('aria-pressed', on && unlocked);
  }
  document.addEventListener('visibilitychange', () => { if (!on) return; if (document.hidden) flame(false); else flame(true); });
  return { play, set, flame, get on() { return on; } };
})();

/* ═══════════════ HERO: title letters, casket, dust ═══════════════ */
function splitTitle() {
  const t = $('.org-title'); if (!t || t.dataset.split) return;
  const text = t.textContent; t.dataset.split = '1';
  let i = 0;
  t.innerHTML = `<span class="sr-only">${text}</span>` + text.split(' ').map(word => `<span class="word" aria-hidden="true">${[...word].map(ch => `<span class="ch" style="--i:${i++}">${ch}</span>`).join('')}</span>`).join('<span class="ch sp" aria-hidden="true"> </span>');
}

function seedDust(el, n = 26) {
  if (!el || reduced.matches) return;
  el.innerHTML = Array.from({ length: n }, () => {
    const s = (1 + Math.random() * 2.2).toFixed(1);
    return `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--s:${s}px;--d:${(14 + Math.random() * 18).toFixed(1)}s;--dl:-${(Math.random() * 30).toFixed(1)}s;--dx:${((Math.random() - .5) * 120).toFixed(0)}px;--o:${(.25 + Math.random() * .5).toFixed(2)}"></i>`;
  }).join('');
}

/* Scroll opens the lid and drives the parallax: 0 at the top, 1 once the ledger has
   covered about 70% of the hero. Both modes read the same number. */
let openAmount = 0;
let lastCreakAt = -1;
const heroEl = $('.hero');
function onScroll() {
  if (!heroEl || reduced.matches) return;
  const h = heroEl.offsetHeight || 1;
  const y = Math.max(0, Math.min(1, window.scrollY / (h * .7)));
  heroEl.style.setProperty('--py', y.toFixed(3));
  const eased = y < .5 ? 2 * y * y : 1 - Math.pow(-2 * y + 2, 2) / 2;
  if (Math.abs(eased - openAmount) < .002) return;
  const was = openAmount; openAmount = eased;
  root.style.setProperty('--open', eased.toFixed(3));
  scene?.setOpen(eased);
  if ((was < .08 && eased >= .08) || (was > .92 && eased <= .92)) { if (performance.now() - lastCreakAt > 900) { sound.play('creak', { rate: .9 + Math.random() * .2 }); lastCreakAt = performance.now(); } }
}

function bindCasketHover() {
  const c = $('[data-casket]'); if (!c) return;
  let t;
  c.addEventListener('pointerenter', () => { if (!canHover.matches || reduced.matches) return; c.classList.add('hover'); sound.play('creak', { rate: 1.15, vol: .5 }); clearTimeout(t); t = setTimeout(() => c.classList.remove('hover'), 950); });
}

/* lantern follows the pointer */
function bindLantern() {
  const l = $('.lantern'), hero = $('.hero'); if (!l || !hero || !canHover.matches) return;
  let raf = 0, x = 0, y = 0;
  window.addEventListener('pointermove', e => {
    x = e.clientX; y = e.clientY;
    if (!raf) raf = requestAnimationFrame(() => {
      const r = hero.getBoundingClientRect();
      l.style.setProperty('--lx', `${x - r.left}px`); l.style.setProperty('--ly', `${y - r.top}px`);
      scene?.setPointer(x / innerWidth, y / innerHeight); raf = 0;
    });
  }, { passive: true });
}

/* ═══════════════ REACTIONS ═══════════════ */
const layer = document.createElement('div'); layer.className = 'fx-layer'; document.body.appendChild(layer);
function spawn(cls, x, y, n, vars) {
  if (reduced.matches) return;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i'); el.className = cls;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    for (const [k, fn] of Object.entries(vars)) el.style.setProperty(k, fn(i));
    layer.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 1500);
  }
}
function coins(at, count = 1) {
  const r = at.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  spawn('coin', x, y, 1, { '--dx': () => `${(Math.random() - .5) * 30}px` });
  sound.play('coin', { rate: .95 + Math.random() * .15 });
}
function dust(at) {
  const r = at.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  spawn('puff', x, y, 5, { '--dx': () => `${(Math.random() - .5) * 50}px`, '--dy': () => `${-10 - Math.random() * 30}px` });
}

document.addEventListener('ledger:qty', e => {
  const { delta, at } = e.detail; if (!at) return;
  if (delta > 0) coins(at, delta); else dust(at);
});

/* wax seal: stamps when the bill is sealed, shakes if nothing is picked */
let sealed = false;
function sealBill() {
  const bill = $('.bill'), wax = $('.seal-wax'); if (!bill || !wax) return;
  const picked = document.querySelectorAll('.pick[aria-pressed="true"]').length;
  if (!picked) { bill.classList.remove('bill-shake'); void bill.offsetWidth; bill.classList.add('bill-shake'); note('Pick at least one item before sealing.'); return; }
  wax.classList.remove('stamp', 'hold'); void wax.offsetWidth; wax.classList.add('stamp');
  bill.classList.add('sealed'); sealed = true;
  sound.play('seal'); note('Bill sealed.');
  $('#btnSeal')?.setAttribute('aria-pressed', 'true');
}
function note(msg) {
  const el = $('#status'); if (!el) return;
  el.textContent = msg; el.className = 'status show';
  clearTimeout(note._t); note._t = setTimeout(() => { el.className = 'status'; }, 2200);
}
function unseal() {
  const bill = $('.bill'), wax = $('.seal-wax'); if (!sealed || !wax) return;
  sealed = false; wax.classList.remove('stamp', 'hold'); bill?.classList.remove('sealed');
  $('#btnSeal')?.setAttribute('aria-pressed', 'false');
}
document.addEventListener('ledger:bill', unseal);
$('#btnSeal')?.addEventListener('click', sealBill);

/* low stock markers */
function markLow() {
  for (const row of $$('.roster-row')) { const d = $('.dot', row); if (d) d.classList.toggle('low', !d.classList.contains('on')); }
  for (const st of $$('.stepper.zero')) { st.closest('.card')?.classList.add('out'); st.closest('.row')?.classList.add('out'); }
  for (const st of $$('.stepper:not(.zero)')) { st.closest('.card')?.classList.remove('out'); st.closest('.row')?.classList.remove('out'); }
}
/* stagger panels and cards as they render: capped so late cards never wait */
function stagger() { $$('.view:not([hidden]) .panel, .view:not([hidden]) .card').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 6))); }
let renderT = 0;
function afterRender() { clearTimeout(renderT); renderT = setTimeout(() => { markLow(); stagger(); }, 20); }
document.addEventListener('ledger:view', afterRender);
document.addEventListener('ledger:qty', () => requestAnimationFrame(markLow));
new MutationObserver(afterRender).observe($('.main'), { childList: true, subtree: true });

/* the hero's ambience only runs while it is on screen */
new IntersectionObserver(([en]) => { $('.hero')?.classList.toggle('inview', en.isIntersecting); if (!en.isIntersecting) sound.flame(false); else if (sound.on) sound.flame(true); }, { threshold: 0.02 }).observe($('.hero'));
reduced.addEventListener('change', e => { if (e.matches) { setMode('light', { save: false }); const b = $('#fxMode'); if (b) { b.disabled = true; b.title = 'Reduced motion is on'; } } });

/* registry cards tilt toward the pointer (max about 7 degrees) */
if (canHover.matches && !reduced.matches) {
  let tiltRaf = 0;
  document.addEventListener('pointermove', e => {
    const card = e.target.closest && e.target.closest('.card'); if (!card) return;
    if (tiltRaf) return;
    tiltRaf = requestAnimationFrame(() => {
      tiltRaf = 0;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      card.style.setProperty('--ty', `${(x * 12).toFixed(2)}deg`);
      card.style.setProperty('--tx', `${(-y * 9).toFixed(2)}deg`);
    });
  }, { passive: true });
  document.addEventListener('pointerout', e => {
    const card = e.target.closest && e.target.closest('.card');
    if (card && !card.contains(e.relatedTarget)) { card.style.removeProperty('--tx'); card.style.removeProperty('--ty'); }
  });
}

/* ═══════════════ CONTROLS + INIT ═══════════════ */
$('#fxMode')?.addEventListener('click', () => setMode(root.dataset.fx === 'full' ? 'light' : 'full'));
$('#fxSound')?.addEventListener('click', () => sound.set(!sound.on));
if (!webgl || reduced.matches) { const b = $('#fxMode'); if (b) { b.disabled = true; b.title = reduced.matches ? 'Reduced motion is on' : 'WebGL is not available here'; } }

splitTitle();
seedDust($('.dust'));
bindCasketHover();
bindLantern();
function mastHeight() { const m = $('.masthead'); if (m) root.style.setProperty('--mast-h', `${m.offsetHeight}px`); }
new ResizeObserver(mastHeight).observe($('.masthead'));
mastHeight();
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
markLow(); stagger();

setMode(store.get('fx', 'full'), { save: false });   // Full 3D by default; Light stays the fallback
if (store.get('sound', 'off') === 'on') {
  // the browser needs a gesture before sound; arm it on the first pointer press anywhere
  // except the speaker button itself, whose click already decides
  const arm = e => { if (e.target.closest && e.target.closest('#fxSound')) return; window.removeEventListener('pointerdown', arm); sound.set(true, { save: false }); };
  window.addEventListener('pointerdown', arm);
}
