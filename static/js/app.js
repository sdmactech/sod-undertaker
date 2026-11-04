/* ═══════════════════════════════════════════════════════
   THE UNDERTAKER'S LEDGER — v3 (charter ledger look)
   Helix “Ghost” Solus · Saint Denis · State of Deliverance
   Same API as v1. Motion is spring-driven so every animation
   starts from what is on screen and can be grabbed mid-flight.
   ═══════════════════════════════════════════════════════ */
'use strict';

const BASE_PAYOUT = 15;
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const narrow = matchMedia('(max-width: 860px)');

const state = {
  items: [], ingStock: [],
  view: 'dashboard', sort: 'category', search: '',
  picked: new Set(),
  deleteTarget: null,
};

/* ─── API ─── */
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}
const GET   = p      => api('GET', p);
const POST  = (p, b) => api('POST', p, b);
const PUT   = (p, b) => api('PUT', p, b);
const PATCH = (p, b) => api('PATCH', p, b);
const DEL   = p      => api('DELETE', p);

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const money = n => (n === null || n === undefined) ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;
const icon  = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const glyph = it => `<span class="glyph" aria-hidden="true">${esc(it.icon) || '⚱️'}</span>`;

/* ─── Status pill ─── */
let statusTimer;
function status(msg, type = 'ok') {
  const el = $('#status');
  el.innerHTML = (type === 'error' ? icon('x') : '') + esc(msg);
  el.className = `status show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.className = 'status'; }, type === 'error' ? 4200 : 2200);
}

/* ═══════════════════════════════════════════
   SPRING
   Apple's two designer parameters: damping ratio (1 = no overshoot)
   and response (seconds to reach the target). Re-targeting keeps the
   current value and velocity, so motion is always interruptible.
   ═══════════════════════════════════════════ */
class Spring {
  constructor(value = 0, { damping = 1, response = 0.4, precision = 0.01 } = {}) {
    Object.assign(this, { value, target: value, velocity: 0, damping, response, precision });
    this.listeners = []; this.rest = null; this.raf = 0;
  }
  onChange(fn) { this.listeners.push(fn); return this; }
  emit() { for (const fn of this.listeners) fn(this.value); }
  set(value) { this.stop(); this.value = this.target = value; this.velocity = 0; this.emit(); }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; return this; }
  to(target, opts = {}) {
    this.target = target;
    if (opts.velocity !== undefined) this.velocity = opts.velocity;
    if (opts.damping  !== undefined) this.damping  = opts.damping;
    if (opts.response !== undefined) this.response = opts.response;
    this.rest = opts.onRest || null;
    if (reducedMotion.matches && !opts.force) { this.set(target); this.rest && this.rest(); return this; }
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.step(t)); }
    return this;
  }
  step(now) {
    const dt = Math.min(0.064, (now - this.last) / 1000); this.last = now;
    const w = (2 * Math.PI) / this.response, k = w * w, c = 2 * this.damping * w;
    const n = 8, h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * h; this.value += this.velocity * h;
    }
    const settled = Math.abs(this.velocity) < this.precision * 10 && Math.abs(this.value - this.target) < this.precision;
    if (settled) { this.value = this.target; this.velocity = 0; this.raf = 0; this.emit(); this.rest && this.rest(); return; }
    this.emit();
    this.raf = requestAnimationFrame(t => this.step(t));
  }
}

/* Momentum projection, Apple's exponential-decay form */
const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);
/* Soft boundary: the further past the edge, the less it follows */
const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

/* Animated numbers start from whatever is showing */
function tweenNumber(el, to, fmt = money) {
  if (!el) return;
  if (!el._spring) {
    el._spring = new Spring(to, { damping: 1, response: 0.45, precision: 0.5 });
    el._spring.onChange(v => { el.textContent = fmt(v); });
    el.textContent = fmt(to); return;
  }
  el._spring.to(to);
}

/* ═══════════════════════════════════════════
   DATA HELPERS
   ═══════════════════════════════════════════ */
async function loadAll() {
  const [items, ingStock] = await Promise.all([GET('/api/items'), GET('/api/ingredient_stock')]);
  state.items = items; state.ingStock = ingStock;
}
const itemById  = id => state.items.find(i => i.id === id);
const ingById   = id => state.ingStock.find(r => r.id === id);
const itemByName = name => state.items.find(i => i.name === name);
const ingByName  = name => state.ingStock.find(r => r.name === name);

function computeStats() {
  const items = state.items;
  const best = items.reduce((b, i) => (i.profit_pct != null && (!b || i.profit_pct > b.profit_pct)) ? i : b, null);
  return {
    total_items: items.length,
    craftable:   items.filter(i => i.can_craft).length,
    total_stock: items.reduce((s, i) => s + (i.in_stock || 0), 0),
    ing_stock:   state.ingStock.reduce((s, r) => s + (r.quantity || 0), 0),
    max_payout:  items.reduce((m, i) => Math.max(m, i.adds_to_payout || 0), 0),
    best,
  };
}

function usedInMap() {
  const map = {};
  for (const item of state.items) for (const ing of item.ingredients || []) {
    const e = map[ing.name] || (map[ing.name] = { items: [], buy: false });
    if (!e.items.includes(item.name)) e.items.push(item.name);
    if (ing.obtainable === 'No') e.buy = true;
  }
  return map;
}

function sortedItems() {
  const q = state.search.trim().toLowerCase();
  let list = state.items.filter(i => !q ||
    i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q) || (i.notes || '').toLowerCase().includes(q));
  const byName = (a, b) => a.name.localeCompare(b.name);
  if (state.sort === 'payout') list.sort((a, b) => ((b.adds_to_payout ?? -1) - (a.adds_to_payout ?? -1)) || byName(a, b));
  else if (state.sort === 'profit') list.sort((a, b) => ((b.profit_pct ?? -9999) - (a.profit_pct ?? -9999)) || byName(a, b));
  else list.sort((a, b) => (a.category || '').localeCompare(b.category || '') || byName(a, b));
  return list;
}

/* ═══════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════ */
const TITLES = { dashboard: 'Parlour overview', items: 'Item registry', stock: 'Stock room', payout: 'Burial payout' };

function sectionMeta() {
  const onHand = state.items.filter(i => i.in_stock > 0).length;
  const text = {
    dashboard: `${onHand} of ${state.items.length} in stock`,
    items:     `${state.items.length} items`,
    stock:     `${state.items.reduce((s, i) => s + (i.in_stock || 0), 0)} goods · ${state.ingStock.reduce((s, r) => s + (r.quantity || 0), 0)} ingredients`,
    payout:    `${state.picked.size} selected`,
  }[state.view];
  $('#sectionMeta').innerHTML = `<span class="dot${onHand ? '' : ' off'}"></span>${esc(text)}`;
  $('#orgCount').textContent = `${state.items.length} burial goods`;
}

function setView(name, { push = true } = {}) {
  if (!TITLES[name]) name = 'dashboard';
  state.view = name;
  for (const v of $$('.view')) v.hidden = v.id !== `view-${name}`;
  $$('.nav-btn').forEach(b => b.dataset.view === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $('#viewTitle').textContent = TITLES[name];
  document.title = `${TITLES[name]} · Undertaker's Ledger`;
  if (push && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  render();
  window.scrollTo({ top: 0 });
  if (name === 'items') requestAnimationFrame(() => placeThumb(false));
}

function render() {
  sectionMeta();
  if (state.view === 'dashboard') renderDashboard();
  if (state.view === 'items')     renderItems();
  if (state.view === 'stock')     renderStock();
  if (state.view === 'payout')    renderPayout();
}

/* ═══════════════════════════════════════════
   OVERVIEW
   ═══════════════════════════════════════════ */
const cents = n => `$${(Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function renderDashboard() {
  const s = computeStats();
  const value = state.items.reduce((t, i) => t + (i.in_stock || 0) * (i.adds_to_payout || 0), 0);
  tweenNumber($('#stockValue'), value, cents);
  $('#financeSub').textContent = `${s.total_stock} burial goods on the shelf · ${s.ing_stock} ingredients stored`;

  // Goods roster, in stock first, like a members list with online dots
  const goods = [...state.items].sort((a, b) => (b.in_stock > 0) - (a.in_stock > 0) || (b.adds_to_payout || 0) - (a.adds_to_payout || 0) || a.name.localeCompare(b.name));
  $('#goodsCount').textContent = goods.length;
  $('#dashGoods').innerHTML = goods.length ? goods.slice(0, 7).map(i => `
    <div class="roster-row">
      ${glyph(i)}
      <div class="roster-text"><span class="roster-name">${esc(i.name)}</span><span class="roster-sub">${esc(i.category || '')} · adds ${money(i.adds_to_payout)}</span></div>
      <span class="roster-qty">${i.in_stock ? `${i.in_stock} on hand` : 'out'}</span>
      <span class="dot${i.in_stock ? ' on' : ''}" title="${i.in_stock ? 'In stock' : 'Out of stock'}"></span>
    </div>`).join('') : `<p class="empty">No items registered.</p>`;

  const notes = state.items.filter(i => i.notes);
  $('#notesCount').textContent = `${notes.length} ${notes.length === 1 ? 'notice' : 'notices'}`;
  $('#dashNotes').innerHTML = notes.length
    ? notes.map(i => `<div class="notice"><div class="notice-name">${glyph(i)}${esc(i.name)}</div><div class="notice-text">${esc(i.notes)}</div></div>`).join('')
    : `<div class="empty-state"><span class="ring">${icon('scroll')}</span><h4>No notices</h4><p>Notes added to an item will appear here.</p></div>`;
}

/* ═══════════════════════════════════════════
   ITEMS
   ═══════════════════════════════════════════ */
function roiTag(pct) {
  if (pct == null) return `<span class="tag">No cost set</span>`;
  const cls = pct >= 300 ? 'high' : pct >= 100 ? 'med' : 'low';
  return `<span class="tag tag-roi-${cls}">+${pct}% return</span>`;
}
const sourceTag = it => it.can_craft
  ? `<span class="tag tag-craft">${icon('hammer')}Craft</span>`
  : `<span class="tag tag-buy">${icon('coin')}Buy</span>`;
const syncTag = (shared, where) => shared ? `<span class="tag tag-sync" title="Count is shared with ${where}">${icon('link')}Linked</span>` : '';

function stepperHtml(kind, id, qty, label) {
  return `<div class="stepper ${qty ? '' : 'zero'}" data-kind="${kind}" data-id="${id}">
    <button type="button" data-d="-1" aria-label="One fewer ${esc(label)}" ${qty ? '' : 'disabled'}>${icon('minus')}</button>
    <input type="number" min="0" inputmode="numeric" value="${qty}" aria-label="${esc(label)} on hand" />
    <button type="button" data-d="1" aria-label="One more ${esc(label)}">${icon('plus')}</button>
  </div>`;
}

function renderItems() {
  const list = sortedItems();
  $('#roiHint').hidden = state.sort !== 'profit';
  const grid = $('#itemsGrid');
  if (!list.length) { grid.innerHTML = `<p class="empty">No items match “${esc(state.search)}”.</p>`; return; }
  grid.innerHTML = list.map((it, idx) => {
    const rank = state.sort === 'profit' && idx < 3 && it.profit_pct != null ? idx : null;
    const shared = !!ingByName(it.name);
    const ings = (it.ingredients || []).map(g =>
      `<span class="ingredient ${g.obtainable === 'No' ? 'buy' : ''}" title="${g.obtainable === 'No' ? 'Must be bought' : 'Can be gathered'}">${esc(g.name)} ${esc(g.quantity)}</span>`).join('');
    return `<article class="card ${rank === 0 ? 'rank-1' : ''}" data-id="${it.id}">
      ${rank !== null ? `<span class="rank">No. ${rank + 1} value</span>` : ''}
      <div class="card-top">
        <span class="seal" aria-hidden="true">${esc(it.icon) || '⚱️'}</span>
        <div class="card-title">
          <h3 class="card-name">${esc(it.name)}</h3>
          <div class="card-cat">${esc(it.category || '')} ${syncTag(shared, 'Ingredient stores')}</div>
        </div>
        <button class="icon-btn" data-edit="${it.id}" aria-label="Edit ${esc(it.name)}">${icon('pen')}</button>
      </div>
      <div class="card-figures">
        <div class="figure"><span class="figure-label">Adds</span><span class="figure-money">${money(it.adds_to_payout)}</span></div>
        <div class="figure"><span class="figure-label">Cost</span><span class="figure-value">${esc(it.cost_to_make) || '—'}</span></div>
        <div class="figure"><span class="figure-label">Return</span><span class="figure-value">${roiTag(it.profit_pct)}</span></div>
      </div>
      ${it.obtain_note ? `<p class="obtain">${sourceTag(it)} ${esc(it.obtain_note)}</p>` : `<p class="obtain">${sourceTag(it)}</p>`}
      ${ings ? `<div class="ingredients">${ings}</div>` : ''}
      ${it.notes ? `<p class="card-note">${esc(it.notes)}</p>` : ''}
      <div class="card-foot"><span class="card-foot-label">On hand</span>${stepperHtml('item', it.id, it.in_stock, it.name)}</div>
    </article>`;
  }).join('');
}

/* Segmented control: thumb rides two independent springs (x and width) */
const thumbX = new Spring(0, { damping: 1, response: 0.32, precision: 0.3 });
const thumbW = new Spring(0, { damping: 1, response: 0.32, precision: 0.3 });
function paintThumb() { const t = $('.segmented-thumb'); t.style.transform = `translateX(${thumbX.value}px)`; t.style.width = `${thumbW.value}px`; }
thumbX.onChange(paintThumb); thumbW.onChange(paintThumb);
function placeThumb(animate = true) {
  const btn = $(`#sortControl [data-sort="${state.sort}"]`);
  if (!btn || !btn.offsetWidth) return;
  const x = btn.offsetLeft, w = btn.offsetWidth;
  if (animate) { thumbX.to(x); thumbW.to(w); } else { thumbX.set(x); thumbW.set(w); }
}

/* ═══════════════════════════════════════════
   STOCK — counts change on the tap; the server write follows
   ═══════════════════════════════════════════ */
function renderStock() {
  const ingShared = new Set(state.items.map(i => i.name));
  $('#itemStockRows').innerHTML = state.items.length ? [...state.items]
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name))
    .map(it => `<div class="row">
      <div class="row-name">${glyph(it)}<span class="txt">${esc(it.name)}</span>${syncTag(!!ingByName(it.name), 'Ingredient stores')}</div>
      <div class="row-meta">${esc(it.category || '')} · ${it.can_craft ? 'Craft' : 'Buy'}</div>
      <div class="row-money">${money(it.adds_to_payout)}</div>
      ${stepperHtml('item', it.id, it.in_stock, it.name)}
    </div>`).join('') : `<div class="row"><p class="empty">No items registered.</p></div>`;

  const used = usedInMap();
  const rows = $('#ingStockRows'); rows.classList.add('rows-ing');
  rows.innerHTML = state.ingStock.length ? state.ingStock.map(r => {
    const u = used[r.name] || { items: [], buy: false };
    return `<div class="row" data-ing="${r.id}">
      <div class="row-name"><span class="txt">${esc(r.name)}</span>${syncTag(ingShared.has(r.name), 'Burial goods')}</div>
      <div class="row-meta row-used">${u.items.length ? `<span class="row-meta-label">Used in</span> ${esc(u.items.join(', '))}` : '<span class="row-meta-label">Not used by any item</span>'}</div>
      <div class="row-src">${u.buy ? `<span class="tag tag-buy">${icon('coin')}Buy</span>` : `<span class="tag tag-craft">Gather</span>`}</div>
      ${stepperHtml('ing', r.id, r.quantity, r.name)}
      <div class="row-note"><input class="note-input" data-note="${r.id}" value="${esc(r.notes)}" placeholder="Add a note" aria-label="Note for ${esc(r.name)}" /></div>
      <button class="icon-btn" data-remove="${r.id}" aria-label="Remove ${esc(r.name)} from stores">${icon('trash')}</button>
    </div>`;
  }).join('') : `<div class="row"><p class="empty">No ingredients tracked yet.</p></div>`;
}

const writeTimers = new Map();
function setQty(kind, id, qty) {
  qty = Math.max(0, Math.floor(Number(qty) || 0));
  const row = kind === 'item' ? itemById(id) : ingById(id);
  if (!row) return;
  const field = kind === 'item' ? 'in_stock' : 'quantity';
  if (row[field] === qty) { paintQty(kind, id, qty); return; }
  row[field] = qty;
  paintQty(kind, id, qty, true);

  // Same-named rows are one count on the server; mirror that here right away
  const twin = kind === 'item' ? ingByName(row.name) : itemByName(row.name);
  if (twin) {
    const tk = kind === 'item' ? 'ing' : 'item';
    twin[tk === 'item' ? 'in_stock' : 'quantity'] = qty;
    paintQty(tk, twin.id, qty, true);
  }
  if (state.view === 'dashboard') renderDashboard();
  sectionMeta();

  const key = `${kind}:${id}`;
  clearTimeout(writeTimers.get(key));
  writeTimers.set(key, setTimeout(() => commitQty(kind, id), 350));
}

async function commitQty(kind, id) {
  writeTimers.delete(`${kind}:${id}`);
  try {
    if (kind === 'item') await PATCH(`/api/items/${id}/stock`, { in_stock: itemById(id).in_stock });
    else await PATCH(`/api/ingredient_stock/${id}`, { quantity: ingById(id).quantity });
  } catch (err) {
    status('Could not save that count. Showing what is stored.', 'error');
    await loadAll(); render();
  }
}

function paintQty(kind, id, qty, bump = false) {
  for (const st of $$(`.stepper[data-kind="${kind}"][data-id="${id}"]`)) {
    const input = $('input', st);
    if (document.activeElement !== input) input.value = qty;
    st.classList.toggle('zero', !qty);
    $('[data-d="-1"]', st).disabled = !qty;
    if (bump && !reducedMotion.matches) { input.classList.remove('bump'); void input.offsetWidth; input.classList.add('bump'); }
  }
}

async function saveNote(id, value) {
  const r = ingById(id); if (!r || (r.notes || '') === value) return;
  const before = r.notes; r.notes = value || null;
  try { await PATCH(`/api/ingredient_stock/${id}`, { notes: value }); status('Note saved'); }
  catch { r.notes = before; status('Could not save the note.', 'error'); }
}

/* ═══════════════════════════════════════════
   PAYOUT
   ═══════════════════════════════════════════ */
function renderPayout() {
  $('#calcList').innerHTML = state.items.map(it => `
    <button class="pick" type="button" data-pick="${it.id}" aria-pressed="${state.picked.has(it.id)}">
      ${glyph(it)}
      <span class="pick-text"><span class="pick-name">${esc(it.name)}</span>
        <span class="pick-pay">${it.adds_to_payout != null ? `adds ${money(it.adds_to_payout)}` : 'no payout set'}</span></span>
      <span class="pick-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span>
    </button>`).join('');
  updateBill();
}

function updateBill() {
  const picked = state.items.filter(i => state.picked.has(i.id));
  let added = 0, cost = 0, hasCost = false;
  for (const it of picked) { added += it.adds_to_payout || 0; if (it.cost_numeric != null) { cost += it.cost_numeric; hasCost = true; } }
  const total = BASE_PAYOUT + added;

  $('#billLines').innerHTML =
    `<div class="bill-line base"><span>Base burial fee</span><span>${money(BASE_PAYOUT)}</span></div>` +
    picked.map(it => `<div class="bill-line"><span>${glyph(it)}${esc(it.name)}</span><span>+${money(it.adds_to_payout || 0)}</span></div>`).join('');

  tweenNumber($('#billTotal'), total);
  tweenNumber($('#dockTotal'), total);
  $('#billCost').textContent = hasCost ? money(cost) : '—';
  const pr = $('#billProfitRow');
  pr.hidden = !hasCost;
  if (hasCost) {
    const profit = total - cost;
    const pct = cost > 0 ? Math.round((profit / cost) * 100) : 0;
    $('#billProfit').innerHTML = `<span class="${profit >= 0 ? 'pos' : 'neg'}">${money(profit)} · ${pct}%</span>`;
  }
  $('#billClear').disabled = !picked.length;
  sectionMeta();
}

/* ═══════════════════════════════════════════
   SHEETS
   Desktop: grows out of the button that opened it, returns into it.
   Phone: a bottom sheet that tracks the finger 1:1, rubber-bands at
   the top, and uses release velocity to decide dismiss vs. settle.
   ═══════════════════════════════════════════ */
const scrim = $('#scrim');
const openSheets = [];

class Sheet {
  constructor(el) {
    this.el = el;
    this.p = new Spring(0, { damping: 1, response: 0.38, precision: 0.001 });
    this.p.onChange(v => this.paint(v));
    this.origin = { x: 0, y: 0 };
    for (const b of $$('[data-close]', el)) b.addEventListener('click', () => this.close());
    for (const g of $$('[data-grip]', el)) g.addEventListener('pointerdown', e => this.grab(e));
    el.addEventListener('keydown', e => this.trap(e));
  }
  get isOpen() { return openSheets.includes(this); }

  open(trigger) {
    this.returnFocus = trigger || document.activeElement;
    this.el.hidden = false;
    const r = this.el.getBoundingClientRect();
    if (trigger && !narrow.matches) {
      const t = trigger.getBoundingClientRect();
      this.origin = { x: (t.left + t.width / 2) - (r.left + r.width / 2), y: (t.top + t.height / 2) - (r.top + r.height / 2) };
    } else this.origin = { x: 0, y: 0 };
    if (!this.isOpen) openSheets.push(this);
    scrim.classList.add('on');
    if (this.p.value === 0) this.paint(0);
    this.p.to(1, { damping: 1, response: narrow.matches ? 0.42 : 0.36 });
    const first = $('input:not([type=hidden]), textarea, button.btn-danger', this.el);
    setTimeout(() => first && first.focus({ preventScroll: true }), narrow.matches ? 0 : 60);
  }

  close(velocity) {
    const i = openSheets.indexOf(this); if (i !== -1) openSheets.splice(i, 1);
    if (!openSheets.length) scrim.classList.remove('on');
    this.p.to(0, {
      damping: 1, response: 0.34, velocity,
      onRest: () => {
        if (this.isOpen) return;
        this.el.hidden = true;
        this.returnFocus && this.returnFocus.focus && this.returnFocus.focus({ preventScroll: true });
      },
    });
  }

  paint(v) {
    const el = this.el;
    scrim.style.opacity = Math.max(0, Math.min(1, openSheets.length ? Math.max(v, +scrim.style.opacity || 0) : v));
    if (reducedMotion.matches) {
      el.style.transform = narrow.matches ? 'translateY(0)' : 'translate(-50%, -50%)';
      el.style.opacity = v; return;
    }
    if (narrow.matches) {
      const h = el.offsetHeight || window.innerHeight;
      const y = v <= 1 ? (1 - v) * h : -rubberband((v - 1) * h, h);
      el.style.transform = `translateY(${y}px)`;
      el.style.opacity = 1;
    } else {
      const k = 1 - v, s = 0.86 + 0.14 * v;
      el.style.transform = `translate(-50%, -50%) translate(${this.origin.x * k}px, ${this.origin.y * k}px) scale(${s})`;
      el.style.opacity = Math.min(1, v * 1.6);
    }
  }

  grab(e) {
    if (!narrow.matches || e.target.closest('button')) return;
    const el = this.el, h = el.offsetHeight;
    this.p.stop();                                     // catch it mid-flight, from where it is
    const startY = e.clientY, startOffset = (1 - this.p.value) * h;
    const hist = [{ y: e.clientY, t: performance.now() }];
    let dragging = false;
    const move = ev => {
      const dy = ev.clientY - startY;
      if (!dragging && Math.abs(dy) < 6) return;       // small hysteresis so taps stay taps
      if (!dragging) { dragging = true; el.setPointerCapture(e.pointerId); }
      let y = startOffset + dy;
      if (y < 0) y = -rubberband(-y, h);
      this.p.set(1 - y / h);
      hist.push({ y: ev.clientY, t: performance.now() }); if (hist.length > 6) hist.shift();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dragging) return;
      const a = hist[0], b = hist[hist.length - 1];
      const vy = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;   // px/s, positive = down
      const y = (1 - this.p.value) * h;
      const projected = y + project(vy);
      const velocity = -vy / h;                                          // hand the finger's speed to the spring
      if (projected > h * 0.45) this.close(velocity);
      else this.p.to(1, { velocity, damping: Math.abs(vy) > 300 ? 0.8 : 1, response: 0.36 });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  trap(e) {
    if (e.key !== 'Tab') return;
    const f = $$('button:not([disabled]), input:not([type=hidden]), textarea, select', this.el).filter(x => x.offsetParent);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

const itemSheet = new Sheet($('#itemSheet'));
const ingSheet = new Sheet($('#ingSheet'));
const confirmSheet = new Sheet($('#confirmSheet'));
scrim.addEventListener('click', () => openSheets.length && openSheets[openSheets.length - 1].close());

/* ── Item editing ── */
function openItemSheet(id, trigger) {
  const it = itemById(id); if (!it) return;
  $('#itemSheetTitle').textContent = it.name;
  $('#itemId').value = it.id;
  $('#fName').value = it.name;
  $('#fCategory').value = it.category || '';
  $('#fPayout').value = it.adds_to_payout ?? '';
  $('#fCost').value = it.cost_to_make || '';
  $('#fCostNum').value = it.cost_numeric ?? '';
  $('#fIcon').value = it.icon || '';
  $('#fObtain').value = it.obtain_note || '';
  $('#fCraft').checked = !!it.can_craft;
  $('#fNotes').value = it.notes || '';
  $('#categoryList').innerHTML = [...new Set(state.items.map(i => i.category).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('');
  $('#ingList').innerHTML = '';
  (it.ingredients || []).forEach(addIngRow);
  $$('#itemForm .touched').forEach(x => x.classList.remove('touched'));
  itemSheet.open(trigger);
}

function addIngRow(ing = {}) {
  const row = document.createElement('div');
  row.className = 'ing-edit-row';
  row.innerHTML = `
    <input class="ing-name" value="${esc(ing.name || '')}" placeholder="Ingredient" aria-label="Ingredient name" />
    <input class="ing-qty" value="${esc(ing.quantity || 'x1')}" placeholder="x1" aria-label="Quantity" />
    <select class="ing-obtain" aria-label="How it is obtained">
      <option value="Yes"${(ing.obtainable || 'Yes') === 'Yes' ? ' selected' : ''}>Gather</option>
      <option value="No"${ing.obtainable === 'No' ? ' selected' : ''}>Buy</option>
    </select>
    <button type="button" class="icon-btn" aria-label="Remove ingredient">${icon('x')}</button>`;
  $('button', row).addEventListener('click', () => row.remove());
  $('#ingList').appendChild(row);
  return row;
}

async function saveItem(e) {
  e.preventDefault();
  const name = $('#fName'), cat = $('#fCategory');
  for (const f of [name, cat]) f.classList.add('touched');
  if (!name.value.trim() || !cat.value.trim()) { (name.value.trim() ? cat : name).focus(); status('Name and category are required.', 'error'); return; }
  const id = parseInt($('#itemId').value, 10);
  const num = v => v === '' ? null : parseFloat(v);
  const body = {
    name: name.value.trim(),
    category: cat.value.trim(),
    adds_to_payout: num($('#fPayout').value),
    cost_to_make: $('#fCost').value.trim() || null,
    cost_numeric: num($('#fCostNum').value),
    icon: $('#fIcon').value.trim() || null,
    obtain_note: $('#fObtain').value.trim() || null,
    can_craft: $('#fCraft').checked,
    notes: $('#fNotes').value.trim() || null,
    ingredients: $$('#ingList .ing-edit-row').map(r => ({
      name: $('.ing-name', r).value.trim(),
      quantity: $('.ing-qty', r).value.trim() || 'x1',
      obtainable: $('.ing-obtain', r).value,
    })).filter(g => g.name),
  };
  try {
    const updated = await PUT(`/api/items/${id}`, body);
    const i = state.items.findIndex(x => x.id === id);
    if (i !== -1) state.items[i] = updated;
    itemSheet.close();
    status(`${updated.name} saved`);
    render();
  } catch (err) { status(`Could not save: ${err.message}`, 'error'); }
}

/* ── Ingredient stores ── */
function openIngSheet(trigger) {
  const known = new Set(state.ingStock.map(r => r.name));
  const all = new Set(); state.items.forEach(it => (it.ingredients || []).forEach(g => all.add(g.name)));
  $('#ingNameList').innerHTML = [...all].filter(n => !known.has(n)).map(n => `<option value="${esc(n)}">`).join('');
  $('#isName').value = ''; $('#isQty').value = '0'; $('#isNotes').value = '';
  $('#isName').classList.remove('touched');
  ingSheet.open(trigger);
}

async function saveIngStock(e) {
  e.preventDefault();
  const nameEl = $('#isName'); nameEl.classList.add('touched');
  const name = nameEl.value.trim();
  if (!name) { nameEl.focus(); status('Name the ingredient first.', 'error'); return; }
  try {
    const row = await POST('/api/ingredient_stock', { name, quantity: Math.max(0, parseInt($('#isQty').value, 10) || 0), notes: $('#isNotes').value.trim() || null });
    const i = state.ingStock.findIndex(r => r.id === row.id);
    if (i !== -1) state.ingStock[i] = row; else state.ingStock.push(row);
    state.ingStock.sort((a, b) => a.name.localeCompare(b.name));
    ingSheet.close();
    status(`${row.name} added to stores`);
    renderStock();
    const el = $(`[data-ing="${row.id}"]`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      el.animate([{ background: 'var(--brass-soft)' }, { background: 'transparent' }], { duration: 1400, easing: 'ease-out' }); }
  } catch (err) { status(`Could not add: ${err.message}`, 'error'); }
}

function askRemove(id, trigger) {
  const r = ingById(id); if (!r) return;
  state.deleteTarget = id;
  $('#confirmTitle').textContent = `Remove ${r.name}?`;
  $('#confirmText').textContent = `${r.name} will stop being tracked in the stores${r.quantity ? `, along with its count of ${r.quantity}` : ''}. Items that use it are not changed.`;
  confirmSheet.open(trigger);
}

async function doRemove() {
  const id = state.deleteTarget; if (id == null) return;
  const r = ingById(id);
  confirmSheet.close();
  try {
    await DEL(`/api/ingredient_stock/${id}`);
    state.ingStock = state.ingStock.filter(x => x.id !== id);
    const el = $(`[data-ing="${id}"]`);
    if (el && !reducedMotion.matches) {
      const h = el.offsetHeight;
      await el.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0, paddingTop: 0, paddingBottom: 0 }],
        { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' }).finished.catch(() => {});
    }
    renderStock();
    status(`${r ? r.name : 'Ingredient'} removed`);
  } catch (err) { status(`Could not remove: ${err.message}`, 'error'); }
  state.deleteTarget = null;
}

/* ═══════════════════════════════════════════
   EVENTS
   ═══════════════════════════════════════════ */
for (const b of $$('.nav-btn')) b.addEventListener('click', () => setView(b.dataset.view));
window.addEventListener('hashchange', () => setView(location.hash.slice(1), { push: false }));

$('#itemSearch').addEventListener('input', e => { state.search = e.target.value; renderItems(); });
$('#sortControl').addEventListener('click', e => {
  const b = e.target.closest('[data-sort]'); if (!b || b.dataset.sort === state.sort) return;
  state.sort = b.dataset.sort;
  $$('#sortControl [data-sort]').forEach(x => x.setAttribute('aria-checked', x === b));
  placeThumb(true);
  renderItems();
});
$('#sortControl').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const btns = $$('#sortControl [data-sort]'), i = btns.findIndex(b => b.dataset.sort === state.sort);
  const next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
  next.click(); next.focus();
});

document.addEventListener('click', e => {
  const step = e.target.closest('.stepper button');
  if (step) {
    const st = step.closest('.stepper'), kind = st.dataset.kind, id = +st.dataset.id;
    const cur = kind === 'item' ? itemById(id).in_stock : ingById(id).quantity;
    setQty(kind, id, cur + Number(step.dataset.d));
    return;
  }
  const go = e.target.closest('[data-goto]');
  if (go) {
    if (go.dataset.sort) {
      state.sort = go.dataset.sort;
      $$('#sortControl [data-sort]').forEach(x => x.setAttribute('aria-checked', x.dataset.sort === state.sort));
    }
    setView(go.dataset.goto);
    if (go.dataset.anchor) requestAnimationFrame(() => document.getElementById(go.dataset.anchor).scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' }));
    return;
  }
  const edit = e.target.closest('[data-edit]');
  if (edit) return openItemSheet(+edit.dataset.edit, edit);
  const rm = e.target.closest('[data-remove]');
  if (rm) return askRemove(+rm.dataset.remove, rm);
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const id = +pick.dataset.pick;
    state.picked.has(id) ? state.picked.delete(id) : state.picked.add(id);
    pick.setAttribute('aria-pressed', state.picked.has(id));
    updateBill();
  }
});
document.addEventListener('change', e => {
  const input = e.target.closest('.stepper input');
  if (input) { const st = input.closest('.stepper'); setQty(st.dataset.kind, +st.dataset.id, input.value); }
});
document.addEventListener('keydown', e => {
  const input = e.target.closest && e.target.closest('.stepper input');
  if (input && e.key === 'Enter') input.blur();
  const note = e.target.closest && e.target.closest('.note-input');
  if (note && e.key === 'Enter') note.blur();
  if (e.key === 'Escape' && openSheets.length) openSheets[openSheets.length - 1].close();
});
document.addEventListener('focusout', e => {
  const note = e.target.closest && e.target.closest('.note-input');
  if (note) saveNote(+note.dataset.note, note.value.trim());
});

$('#billClear').addEventListener('click', () => { state.picked.clear(); renderPayout(); });
$('#btnAddIngStock').addEventListener('click', e => openIngSheet(e.currentTarget));
$('#btnAddIng').addEventListener('click', () => $('.ing-name', addIngRow()).focus());
$('#itemForm').addEventListener('submit', saveItem);
$('#ingStockForm').addEventListener('submit', saveIngStock);
$('#btnConfirm').addEventListener('click', doRemove);

/* Scroll edge effect under the toolbar */
let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => { document.body.classList.toggle('scrolled', window.scrollY > 4); ticking = false; });
}, { passive: true });

/* The floating total on phones steps aside when the full bill is in view */
new IntersectionObserver(([en]) => $('.payout-dock').classList.toggle('tucked', en.isIntersecting), { threshold: 0.4 })
  .observe($('.bill-total'));

window.addEventListener('resize', () => { if (state.view === 'items') placeThumb(false); openSheets.forEach(s => s.paint(s.p.value)); });

/* ═══════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════ */
(async function init() {
  try { await loadAll(); }
  catch (err) { console.error(err); status('Could not load the ledger. Is the server running?', 'error'); }
  setView(location.hash.slice(1) || 'dashboard', { push: false });
  if (document.fonts) document.fonts.ready.then(() => state.view === 'items' && placeThumb(false));
})();
