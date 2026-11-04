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
      sceneLoading = import('./scene3d.js').then(m => {
        scene = m.createScene($('#stage3d'), { onCreak: () => sound.play('creak'), onReady: () => $('#stage3d').classList.add('ready') });
        scene.setOpen(openAmount);
        return scene;
      }).catch(err => { console.error('3D scene failed, falling back', err); setMode('light'); });
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
  const gain = { creak: .8, flame: .35, coin: .55, seal: .7, bell: .5 };
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
    const res = await fetch(`/static/audio/${files[name]}.mp3`);
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
    $('#fxSound')?.setAttribute('aria-pressed', on);
    if (on) { await ensureCtx(); flame(true); play('bell', { vol: .6 }); $('.masthead')?.classList.add('toll'); setTimeout(() => $('.masthead')?.classList.remove('toll'), 1700); }
    else flame(false);
  }
  return { play, set, flame, get on() { return on; } };
})();

/* ═══════════════ HERO: title letters, casket, dust ═══════════════ */
function splitTitle() {
  const t = $('.org-title'); if (!t || t.dataset.split) return;
  const text = t.textContent; t.dataset.split = '1'; t.setAttribute('aria-label', text);
  let i = 0;
  t.innerHTML = text.split(' ').map(word => `<span class="word" aria-hidden="true">${[...word].map(ch => `<span class="ch" style="--i:${i++}">${ch}</span>`).join('')}</span>`).join('<span class="ch sp" aria-hidden="true"> </span>');
}

function seedDust(el, n = 26) {
  if (!el || reduced.matches) return;
  el.innerHTML = Array.from({ length: n }, () => {
    const s = (1 + Math.random() * 2.2).toFixed(1);
    return `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--s:${s}px;--d:${(14 + Math.random() * 18).toFixed(1)}s;--dl:-${(Math.random() * 30).toFixed(1)}s;--dx:${((Math.random() - .5) * 120).toFixed(0)}px;--o:${(.25 + Math.random() * .5).toFixed(2)}"></i>`;
  }).join('');
}

/* Scroll opens the lid: 0 at the top, 1 after ~55% of the hero has scrolled by.
   Both modes read the same number. */
let openAmount = 0;
let lastCreakAt = -1;
function onScroll() {
  const hero = $('.hero'); if (!hero) return;
  const h = hero.offsetHeight || 1;
  const y = Math.max(0, Math.min(1, window.scrollY / (h * .55)));
  const eased = y < .5 ? 2 * y * y : 1 - Math.pow(-2 * y + 2, 2) / 2;
  if (Math.abs(eased - openAmount) < .002) return;
  const was = openAmount; openAmount = eased;
  root.style.setProperty('--open', eased.toFixed(3));
  scene?.setOpen(eased);
  // creak once as it starts to open and once as it closes
  if ((was < .08 && eased >= .08) || (was > .92 && eased <= .92)) { if (performance.now() - lastCreakAt > 900) { sound.play('creak', { rate: .9 + Math.random() * .2 }); lastCreakAt = performance.now(); } }
}

function bindCasketHover() {
  const c = $('.casket-css'); if (!c) return;
  let t;
  c.addEventListener('pointerenter', () => { if (!canHover.matches) return; c.classList.add('hover'); sound.play('creak', { rate: 1.15, vol: .5 }); clearTimeout(t); t = setTimeout(() => c.classList.remove('hover'), 950); });
  c.addEventListener('click', () => { c.classList.toggle('open'); sound.play('creak'); });
}

/* lantern follows the pointer */
function bindLantern() {
  const l = $('.lantern'); if (!l || !canHover.matches) return;
  let raf = 0, x = innerWidth / 2, y = innerHeight * .3;
  window.addEventListener('pointermove', e => {
    x = e.clientX; y = e.clientY;
    if (!raf) raf = requestAnimationFrame(() => { l.style.setProperty('--lx', `${x}px`); l.style.setProperty('--ly', `${y}px`); scene?.setPointer(x / innerWidth, y / innerHeight); raf = 0; });
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
  spawn('coin', x, y, Math.min(3, count), { '--dx': () => `${(Math.random() - .5) * 46}px` });
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
  if (!picked) { bill.classList.remove('bill-shake'); void bill.offsetWidth; bill.classList.add('bill-shake'); return; }
  wax.classList.remove('stamp', 'hold'); void wax.offsetWidth; wax.classList.add('stamp');
  bill.classList.add('sealed'); sealed = true;
  sound.play('seal');
  $('#btnSeal')?.setAttribute('aria-pressed', 'true');
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
new MutationObserver(() => { clearTimeout(markLow._t); markLow._t = setTimeout(markLow, 30); }).observe($('.main'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

/* stagger panels and cards as they render */
function stagger() { $$('.view:not([hidden]) .panel, .view:not([hidden]) .card').forEach((el, i) => el.style.setProperty('--i', i)); }
document.addEventListener('ledger:view', stagger);
new MutationObserver(stagger).observe($('.main'), { childList: true, subtree: true });

/* ═══════════════ CONTROLS + INIT ═══════════════ */
$('#fxMode')?.addEventListener('click', () => setMode(root.dataset.fx === 'full' ? 'light' : 'full'));
$('#fxSound')?.addEventListener('click', () => sound.set(!sound.on));
if (!webgl || reduced.matches) { const b = $('#fxMode'); if (b) { b.disabled = true; b.title = reduced.matches ? 'Reduced motion is on' : 'WebGL is not available here'; } }

splitTitle();
seedDust($('.dust'));
bindCasketHover();
bindLantern();
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
markLow(); stagger();

setMode(store.get('fx', 'light'), { save: false });
if (store.get('sound', 'off') === 'on') {
  // the browser needs a gesture before sound; arm it on the first click or key
  const arm = () => { sound.set(true, { save: false }); window.removeEventListener('pointerdown', arm); window.removeEventListener('keydown', arm); };
  window.addEventListener('pointerdown', arm, { once: true }); window.addEventListener('keydown', arm, { once: true });
  $('#fxSound')?.setAttribute('aria-pressed', 'true');
}
