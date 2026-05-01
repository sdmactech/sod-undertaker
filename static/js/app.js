/* ═══════════════════════════════════════════════════════
   SLIMM BRINKMAN — UNDERTAKER DATABASE
   State of Deliverance · RedM · RDR II
   ═══════════════════════════════════════════════════════ */
'use strict';

const state = {
  items: [], ingStock: [],
  currentView: 'dashboard', deleteTarget: null,
  sharedNames: new Set(), // item names that exist in both tables
};

/* ─── API ─── */
async function api(method, path, body) {
  const base = (typeof API_BASE !== 'undefined') ? API_BASE : '';
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(base + path, opts);
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||`HTTP ${res.status}`); }
  return res.json();
}
const GET   = p     => api('GET',   p);
const POST  = (p,b) => api('POST',  p, b);
const PUT   = (p,b) => api('PUT',   p, b);
const PATCH = (p,b) => api('PATCH', p, b);
const DEL   = p     => api('DELETE',p);

/* ─── Toast ─── */
function toast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${type} show`;
  setTimeout(()=>{ el.className='toast'; }, 3000);
}

/* ─── Escape ─── */
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"').replace(/'/g,'&#039;');
}

/* ─── Compute shared names ─── */
function computeSharedNames() {
  const itemNames = new Set(state.items.map(i => i.name));
  const ingNames  = new Set(state.ingStock.map(r => r.name));
  state.sharedNames = new Set([...itemNames].filter(n => ingNames.has(n)));
}

/* ─── Navigation ─── */
function setView(name) {
  state.currentView = name;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const v = document.getElementById(`view-${name}`); if(v) v.classList.add('active');
  const b = document.querySelector(`.nav-btn[data-view="${name}"]`); if(b) b.classList.add('active');
  const titles = { dashboard:'Dashboard', items:'Item Registry', stock:'Stock', payout:'Payout Calculator' };
  document.getElementById('viewTitle').textContent = titles[name]||name;
  if (name==='dashboard') renderDashboard();
  if (name==='items')     renderItems();
  if (name==='stock')     renderStock();
  if (name==='payout')    renderCalculator();
  document.getElementById('sidebar').classList.remove('open');
}

async function loadAll() {
  const [items, ingStock] = await Promise.all([GET('/api/items'), GET('/api/ingredient_stock')]);
  state.items    = items;
  state.ingStock = ingStock;
  computeSharedNames();
}

/* ════════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════════ */
async function renderDashboard() {
  try {
    const s = await GET('/api/stats');
    document.getElementById('stat-items').textContent     = s.total_items;
    document.getElementById('stat-craftable').textContent = s.craftable;
    document.getElementById('stat-stock').textContent     = s.total_stock;
    document.getElementById('stat-ingstock').textContent  = s.ing_stock;
    document.getElementById('stat-maxpayout').textContent = `$${s.max_payout}`;
    document.getElementById('stat-totalstock').textContent = s.total_stock;
  } catch(e) { console.error(e); }

  const listEl = document.getElementById('dashStockList');
  if (!state.items.length) {
    listEl.innerHTML = `<p class="no-data">No items registered yet.</p>`;
  } else {
    listEl.innerHTML = state.items.map(i => {
      const cls = i.in_stock === 0 ? 'low' : i.in_stock >= 3 ? 'good' : '';
      return `<div class="dash-item-row">
        <span class="dash-item-name"><span>${i.icon||'📦'}</span>${esc(i.name)}</span>
        <div class="dash-item-right">
          <span class="dash-item-payout">${i.adds_to_payout!=null?'$'+i.adds_to_payout:'—'}</span>
          <span class="dash-stock-count ${cls}">${i.in_stock}</span>
        </div>
      </div>`;
    }).join('');
  }

  const notesEl = document.getElementById('dashNotesList');
  const withNotes = state.items.filter(i=>i.notes);
  notesEl.innerHTML = !withNotes.length
    ? `<p class="no-data">No pending notes.</p>`
    : withNotes.map(i=>`
        <div class="dash-note-row">
          <div class="note-item-name">${i.icon||'📦'} ${esc(i.name)}</div>
          <div class="note-text">${esc(i.notes)}</div>
        </div>`).join('');
}

/* ════════════════════════════════════════════
   ITEMS
   ════════════════════════════════════════════ */
async function renderItems() {
  const search  = (document.getElementById('itemSearch').value||'').toLowerCase();
  const sortVal = document.getElementById('sortFilter').value;
  document.getElementById('bestValueBanner').style.display = sortVal==='profit' ? 'flex' : 'none';
  let items;
  try { items = await GET(`/api/items?sort=${sortVal}`); } catch(e) { items = state.items; }
  const filtered = items.filter(item =>
    !search ||
    item.name.toLowerCase().includes(search) ||
    (item.category||'').toLowerCase().includes(search) ||
    (item.notes||'').toLowerCase().includes(search)
  );
  const grid = document.getElementById('itemsGrid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-icon">⚰️</span><p>No items found.</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map((item, idx) => itemCardHtml(item, sortVal==='profit' ? idx : null)).join('');

  grid.querySelectorAll('.stock-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id    = parseInt(e.target.closest('.item-card').dataset.id);
      const delta = parseInt(btn.dataset.delta);
      const item  = state.items.find(i=>i.id===id);
      if (!item) return;
      try {
        const updated = await PATCH(`/api/items/${id}/stock`, { in_stock: Math.max(0, item.in_stock+delta) });
        item.in_stock = updated.in_stock;
        // Update item card count
        e.target.closest('.item-card').querySelector('.stock-count').textContent = updated.in_stock;
        // If shared, sync ingredient stock table & state
        if (state.sharedNames.has(item.name)) {
          syncIngStockRowByName(item.name, updated.in_stock);
          toast(`🔄 Synced stock for "${item.name}"`, 'success');
        }
        updateDashboardStatStock();
      } catch(err) { toast('Failed to update stock','error'); }
    });
  });

  grid.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.addEventListener('click', () => openItemModal(parseInt(btn.dataset.id)));
  });
}

function profitBadgeHtml(pct) {
  if (pct == null) return `<span class="profit-badge na">ROI: N/A</span>`;
  const cls = pct >= 300 ? 'high' : pct >= 100 ? 'med' : 'low';
  return `<span class="profit-badge ${cls}">ROI: +${pct}%</span>`;
}

function itemCardHtml(item, rank) {
  const ings      = item.ingredients||[];
  const ingHtml   = ings.length ? `<div class="item-ingredients"><div class="ing-label">Ingredients</div><div class="ing-tags">${ings.map(i=>`<span class="ing-tag">${esc(i.name)} ${esc(i.quantity)}</span>`).join('')}</div></div>` : '';
  const notesHtml = item.notes ? `<div class="item-notes">📋 ${esc(item.notes)}</div>` : '';
  const craftBadge= item.can_craft ? `<span class="craft-badge yes">🛠️ Craftable</span>` : `<span class="craft-badge no">🛒 Purchase</span>`;
  const obtainHtml= item.obtain_note ? `<div class="item-stat"><span class="item-stat-label">Obtain</span><span class="item-stat-value" style="font-size:0.78rem;color:var(--cream-dim);">${esc(item.obtain_note)}</span></div>` : '';
  const rankClass = rank===0?'rank-1':rank===1?'rank-2':rank===2?'rank-3':'';
  const rankBadge = rank!=null&&rank<3 ? `<div class="rank-badge">${['🥇','🥈','🥉'][rank]} #${rank+1} ROI</div>` : '';
  const profitHtml= `<div class="item-stat"><span class="item-stat-label">Profit ROI</span><span class="item-stat-value">${profitBadgeHtml(item.profit_pct)}</span></div>`;
  const syncedBadge = state.sharedNames.has(item.name)
    ? `<span class="synced-badge" title="Stock is synced with Ingredient Storage">🔄 Synced</span>` : '';

  return `
    <div class="item-card ${rankClass}" data-id="${item.id}">
      ${rankBadge}
      <div class="item-card-header">
        <div class="item-card-name-wrap">
          <span class="item-card-icon">${item.icon||'📦'}</span>
          <div>
            <div class="item-card-name">${esc(item.name)} ${syncedBadge}</div>
            <div class="item-card-category">${esc(item.category||'')}</div>
          </div>
        </div>
        <div class="item-card-actions">
          <button class="btn-icon btn-edit-item" data-id="${item.id}" title="Edit">✏️</button>
        </div>
      </div>
      <div class="item-card-stats">
        <div class="item-stat"><span class="item-stat-label">Payout</span><span class="item-stat-value large">${item.adds_to_payout!=null?'$'+item.adds_to_payout:'—'}</span></div>
        <div class="item-stat"><span class="item-stat-label">Cost</span><span class="item-stat-value">${item.cost_to_make?esc(item.cost_to_make):'—'}</span></div>
        <div class="item-stat"><span class="item-stat-label">Craft</span><span class="item-stat-value">${craftBadge}</span></div>
        ${profitHtml}
        ${obtainHtml}
      </div>
      ${ingHtml}
      ${notesHtml}
      <div class="stock-row">
        <span class="stock-label">📦 In Stock</span>
        <div class="stock-controls">
          <button class="stock-btn" data-delta="-1">−</button>
          <span class="stock-count">${item.in_stock}</span>
          <button class="stock-btn" data-delta="1">+</button>
        </div>
      </div>
    </div>`;
}

/* ── Item Modal ── */
function openItemModal(id) {
  const item = state.items.find(i=>i.id===id); if (!item) return;
  document.getElementById('itemModalTitle').textContent = 'Edit Item';
  document.getElementById('itemId').value    = item.id;
  document.getElementById('fName').value     = item.name;
  document.getElementById('fCategory').value = item.category||'';
  document.getElementById('fPayout').value   = item.adds_to_payout!=null?item.adds_to_payout:'';
  document.getElementById('fCost').value     = item.cost_to_make||'';
  document.getElementById('fCostNum').value  = item.cost_numeric!=null?item.cost_numeric:'';
  document.getElementById('fIcon').value     = item.icon||'';
  document.getElementById('fObtain').value   = item.obtain_note||'';
  document.getElementById('fCraft').checked  = item.can_craft;
  document.getElementById('fNotes').value    = item.notes||'';
  const ingList = document.getElementById('ingList'); ingList.innerHTML='';
  (item.ingredients||[]).forEach(ing=>addIngRow(ing));
  document.getElementById('itemModalBackdrop').classList.add('open');
  document.getElementById('fName').focus();
}

function addIngRow(ing={}) {
  const row = document.createElement('div'); row.className='ing-row';
  row.innerHTML=`
    <input type="text"   class="form-input ing-name"   value="${esc(ing.name||'')}"          placeholder="Ingredient name"/>
    <input type="text"   class="form-input ing-qty"    value="${esc(ing.quantity||'x1')}"     placeholder="Qty"/>
    <select class="form-input ing-obtain">
      <option value="Yes"${(ing.obtainable||'Yes')==='Yes'?' selected':''}>Yes</option>
      <option value="No" ${(ing.obtainable||'')==='No' ?' selected':''}>No</option>
    </select>
    <button type="button" class="btn-remove-ing">✕</button>`;
  row.querySelector('.btn-remove-ing').addEventListener('click',()=>row.remove());
  document.getElementById('ingList').appendChild(row);
}

async function saveItem(e) {
  e.preventDefault();
  const id = document.getElementById('itemId').value; if (!id) return;
  const ingredients=[];
  document.querySelectorAll('#ingList .ing-row').forEach(row=>{
    const name=row.querySelector('.ing-name').value.trim();
    if(name) ingredients.push({ name, quantity:row.querySelector('.ing-qty').value.trim()||'x1', obtainable:row.querySelector('.ing-obtain').value });
  });
  const payoutVal  = document.getElementById('fPayout').value;
  const costNumVal = document.getElementById('fCostNum').value;
  const body = {
    name:           document.getElementById('fName').value.trim(),
    category:       document.getElementById('fCategory').value.trim(),
    adds_to_payout: payoutVal!=='' ? parseFloat(payoutVal) : null,
    cost_to_make:   document.getElementById('fCost').value.trim()||null,
    cost_numeric:   costNumVal!=='' ? parseFloat(costNumVal) : null,
    icon:           document.getElementById('fIcon').value.trim()||null,
    obtain_note:    document.getElementById('fObtain').value.trim()||null,
    can_craft:      document.getElementById('fCraft').checked,
    notes:          document.getElementById('fNotes').value.trim()||null,
    ingredients,
  };
  try {
    const updated = await PUT(`/api/items/${id}`, body);
    const idx = state.items.findIndex(i=>i.id===parseInt(id));
    if (idx!==-1) state.items[idx]=updated;
    computeSharedNames();
    toast('✅ Item updated');
    closeItemModal();
    renderItems();
    if (state.currentView==='dashboard') renderDashboard();
  } catch(err) { toast(`❌ ${err.message}`,'error'); }
}

function closeItemModal() { document.getElementById('itemModalBackdrop').classList.remove('open'); }

/* ════════════════════════════════════════════
   STOCK VIEW
   ════════════════════════════════════════════ */
function renderStock() {
  renderItemStockTable();
  renderIngStockTable();
}

/* ── Burial Item Stock Table ── */
function renderItemStockTable() {
  const tbody = document.getElementById('itemStockTbody');
  if (!state.items.length) {
    tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);font-style:italic;">No items found.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.items.map(item => {
    const craftBadge = item.can_craft
      ? `<span class="craft-badge yes" style="font-size:0.68rem;">🛠️ Craftable</span>`
      : `<span class="craft-badge no"  style="font-size:0.68rem;">🛒 Purchase</span>`;
    const isShared = state.sharedNames.has(item.name);
    const sharedTag = isShared ? `<span class="sync-tag" title="Synced with Ingredient Storage">🔄</span>` : '';
    return `
      <tr data-item-id="${item.id}">
        <td><div class="stock-item-name">${item.icon||'📦'} ${esc(item.name)} ${sharedTag}</div></td>
        <td style="color:var(--cream-faint);font-size:0.82rem;">${esc(item.category||'')}</td>
        <td style="font-family:var(--font-heading);color:var(--gold);">${item.adds_to_payout!=null?'$'+item.adds_to_payout:'—'}</td>
        <td>${craftBadge}</td>
        <td class="stock-qty-cell ${item.in_stock===0?'zero':''}" id="iqty_${item.id}">${item.in_stock}</td>
        <td class="stock-adjust-cell">
          <div class="stock-adjust-wrap">
            <button class="stock-adj-btn minus" data-id="${item.id}" data-delta="-1">−</button>
            <input type="number" class="stock-qty-input" value="${item.in_stock}" min="0" data-id="${item.id}" />
            <button class="stock-adj-btn" data-id="${item.id}" data-delta="1">+</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.stock-adj-btn').forEach(btn=>{
    btn.addEventListener('click', async()=>{
      const id    = parseInt(btn.dataset.id);
      const delta = parseInt(btn.dataset.delta);
      await adjustItemStock(id, delta);
    });
  });
  tbody.querySelectorAll('.stock-qty-input').forEach(inp=>{
    inp.addEventListener('change', async()=>{
      const id  = parseInt(inp.dataset.id);
      const val = Math.max(0, parseInt(inp.value)||0);
      const item = state.items.find(i=>i.id===id); if(!item) return;
      try {
        const updated = await PATCH(`/api/items/${id}/stock`,{ in_stock:val });
        item.in_stock = updated.in_stock;
        syncItemStockRow(id, updated.in_stock);
        inp.value = updated.in_stock;
        if (state.sharedNames.has(item.name)) {
          syncIngStockRowByName(item.name, updated.in_stock);
          toast(`🔄 "${item.name}" synced across both tables`);
        }
      } catch(err){ toast('Failed to update','error'); }
    });
  });
}

async function adjustItemStock(id, delta) {
  const item = state.items.find(i=>i.id===id); if(!item) return;
  try {
    const updated = await PATCH(`/api/items/${id}/stock`,{ in_stock: Math.max(0, item.in_stock+delta) });
    item.in_stock = updated.in_stock;
    syncItemStockRow(id, updated.in_stock);
    if (state.sharedNames.has(item.name)) {
      syncIngStockRowByName(item.name, updated.in_stock);
      toast(`🔄 "${item.name}" synced across both tables`);
    }
    updateDashboardStatStock();
  } catch(err){ toast('Failed to update','error'); }
}

function syncItemStockRow(id, qty) {
  const qtyCell = document.getElementById(`iqty_${id}`);
  if (qtyCell) { qtyCell.textContent = qty; qtyCell.className = `stock-qty-cell ${qty===0?'zero':''}`; }
  const inp = document.querySelector(`.stock-qty-input[data-id="${id}"]`);
  if (inp) inp.value = qty;
  // sync item card on items view too
  const cardCount = document.querySelector(`.item-card[data-id="${id}"] .stock-count`);
  if (cardCount) cardCount.textContent = qty;
}

/* Sync ingredient stock row in the DOM by ingredient name */
function syncIngStockRowByName(name, qty) {
  const row = state.ingStock.find(r=>r.name===name);
  if (!row) return;
  row.quantity = qty;
  const qtyCell = document.getElementById(`isqty_${row.id}`);
  if (qtyCell) { qtyCell.textContent = qty; qtyCell.className = `stock-qty-cell ${qty===0?'zero':''}`; }
  const inp = document.querySelector(`.stock-qty-input[data-id="${row.id}"][data-type="ing"]`);
  if (inp) inp.value = qty;
  updateDashboardStatIngStock();
}

/* Sync item stock row in the DOM by item name */
function syncItemStockRowByName(name, qty) {
  const item = state.items.find(i=>i.name===name);
  if (!item) return;
  item.in_stock = qty;
  syncItemStockRow(item.id, qty);
  updateDashboardStatStock();
}

function updateDashboardStatStock() {
  const el = document.getElementById('stat-stock');
  if (el) el.textContent = state.items.reduce((s,i)=>s+i.in_stock,0);
}
function updateDashboardStatIngStock() {
  const el = document.getElementById('stat-ingstock');
  if (el) el.textContent = state.ingStock.reduce((s,r)=>s+r.quantity,0);
}

/* ── Ingredient Stock Table ── */
function renderIngStockTable() {
  const tbody = document.getElementById('ingStockTbody');
  if (!state.ingStock.length) {
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);font-style:italic;">No ingredients tracked yet.</td></tr>`;
    return;
  }
  const usedInMap = {};
  state.items.forEach(item=>{
    (item.ingredients||[]).forEach(ing=>{
      if (!usedInMap[ing.name]) usedInMap[ing.name] = { items:[], obtainable: ing.obtainable };
      if (!usedInMap[ing.name].items.includes(item.name)) usedInMap[ing.name].items.push(item.name);
      if (ing.obtainable==='No') usedInMap[ing.name].obtainable = 'No';
    });
  });

  tbody.innerHTML = state.ingStock.map(row => {
    const info   = usedInMap[row.name] || { items:[], obtainable:'Yes' };
    const obCls  = info.obtainable==='No' ? 'no' : 'yes';
    const obText = info.obtainable==='No' ? '🛒 Buy' : '✅ Gather';
    const usedIn = info.items.length ? info.items.join(', ') : '—';
    const isShared = state.sharedNames.has(row.name);
    const sharedTag = isShared ? `<span class="sync-tag" title="Synced with Burial Item Inventory">🔄</span>` : '';
    return `
      <tr data-ing-id="${row.id}">
        <td style="font-family:var(--font-heading);font-size:0.88rem;color:var(--cream);">🌿 ${esc(row.name)} ${sharedTag}</td>
        <td class="used-in-cell">${esc(usedIn)}</td>
        <td><span class="obtainable-badge ${obCls}">${obText}</span></td>
        <td class="stock-qty-cell ${row.quantity===0?'zero':''}" id="isqty_${row.id}">${row.quantity}</td>
        <td class="stock-adjust-cell">
          <div class="stock-adjust-wrap">
            <button class="ing-adj-btn minus" data-id="${row.id}" data-delta="-1">−</button>
            <input type="number" class="stock-qty-input" value="${row.quantity}" min="0" data-id="${row.id}" data-type="ing" />
            <button class="ing-adj-btn" data-id="${row.id}" data-delta="1">+</button>
          </div>
        </td>
        <td><input type="text" class="stock-note-input" value="${esc(row.notes||'')}" placeholder="Add note…" data-id="${row.id}" /></td>
        <td><button class="btn-remove-ing-stock" data-id="${row.id}" title="Remove">🗑️</button></td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.ing-adj-btn').forEach(btn=>{
    btn.addEventListener('click', async()=>{
      const id    = parseInt(btn.dataset.id);
      const delta = parseInt(btn.dataset.delta);
      await adjustIngStock(id, delta);
    });
  });

  tbody.querySelectorAll('.stock-qty-input[data-type="ing"]').forEach(inp=>{
    inp.addEventListener('change', async()=>{
      const id  = parseInt(inp.dataset.id);
      const val = Math.max(0,parseInt(inp.value)||0);
      await setIngStock(id, val, null);
    });
  });

  tbody.querySelectorAll('.stock-note-input').forEach(inp=>{
    inp.addEventListener('blur', async()=>{
      const id = parseInt(inp.dataset.id);
      await setIngStock(id, null, inp.value.trim());
    });
  });

  tbody.querySelectorAll('.btn-remove-ing-stock').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      confirmDelete('ingstock', parseInt(btn.dataset.id), `Remove this ingredient from storage tracking?`);
    });
  });
}

async function adjustIngStock(id, delta) {
  const row = state.ingStock.find(r=>r.id===id); if(!row) return;
  await setIngStock(id, Math.max(0, row.quantity+delta), null);
}

async function setIngStock(id, qty, notes) {
  const row = state.ingStock.find(r=>r.id===id); if(!row) return;
  const body = {};
  if (qty   !== null) body.quantity = qty;
  if (notes !== null) body.notes    = notes;
  try {
    const updated = await PATCH(`/api/ingredient_stock/${id}`, body);
    row.quantity = updated.quantity;
    row.notes    = updated.notes;
    // Update ingredient row in DOM
    const qtyCell = document.getElementById(`isqty_${id}`);
    if (qtyCell) { qtyCell.textContent=updated.quantity; qtyCell.className=`stock-qty-cell ${updated.quantity===0?'zero':''}`; }
    const inp = document.querySelector(`.stock-qty-input[data-id="${id}"][data-type="ing"]`);
    if (inp) inp.value = updated.quantity;
    // If backend synced a burial item, update that row too
    if (updated.synced_item_id !== null && updated.synced_item_id !== undefined) {
      const syncedItem = state.items.find(i=>i.id===updated.synced_item_id);
      if (syncedItem) {
        syncedItem.in_stock = updated.synced_item_stock;
        syncItemStockRow(updated.synced_item_id, updated.synced_item_stock);
        toast(`🔄 "${row.name}" synced across both tables`);
      }
    }
    updateDashboardStatIngStock();
    updateDashboardStatStock();
  } catch(err) { toast('Failed to update','error'); }
}

/* ── Add Ingredient to Storage modal ── */
function openIngStockModal() {
  document.getElementById('isName').value = '';
  document.getElementById('isQty').value  = '0';
  document.getElementById('isNotes').value= '';
  const dl = document.getElementById('ingNameList');
  const known = new Set(state.ingStock.map(r=>r.name));
  const allIng = new Set();
  state.items.forEach(item=>(item.ingredients||[]).forEach(i=>allIng.add(i.name)));
  dl.innerHTML = [...allIng].filter(n=>!known.has(n)).map(n=>`<option value="${esc(n)}"/>`).join('');
  document.getElementById('ingStockModalBackdrop').classList.add('open');
  document.getElementById('isName').focus();
}

async function saveIngStock(e) {
  e.preventDefault();
  const name = document.getElementById('isName').value.trim(); if (!name) return;
  const body = { name, quantity: parseInt(document.getElementById('isQty').value)||0, notes: document.getElementById('isNotes').value.trim()||null };
  try {
    const created = await POST('/api/ingredient_stock', body);
    const existing = state.ingStock.findIndex(r=>r.id===created.id);
    if (existing!==-1) state.ingStock[existing]=created; else state.ingStock.push(created);
    state.ingStock.sort((a,b)=>a.name.localeCompare(b.name));
    computeSharedNames();
    toast('✅ Ingredient added to storage');
    closeIngStockModal();
    renderIngStockTable();
  } catch(err) { toast(`❌ ${err.message}`,'error'); }
}

function closeIngStockModal() { document.getElementById('ingStockModalBackdrop').classList.remove('open'); }

/* ════════════════════════════════════════════
   PAYOUT CALCULATOR
   ════════════════════════════════════════════ */
const BASE_PAYOUT = 15;

function renderCalculator() {
  const list = document.getElementById('calcItemList');
  list.innerHTML = state.items.map(item=>`
    <div class="calc-item-row" data-id="${item.id}">
      <input type="checkbox" class="calc-item-check" />
      <div class="calc-item-info">
        <div class="calc-item-name">${item.icon||'📦'} ${esc(item.name)}</div>
        <div class="calc-item-payout">${item.adds_to_payout!=null?'+$'+item.adds_to_payout+' to payout':'No payout set'}</div>
      </div>
    </div>`).join('');
  list.querySelectorAll('.calc-item-row').forEach(row=>{
    const cb = row.querySelector('.calc-item-check');
    cb.addEventListener('change', e=>{ row.classList.toggle('selected',e.target.checked); updateCalculator(); });
  });
  updateCalculator();
}

function updateCalculator() {
  const summary  = document.getElementById('calcSummary');
  const totalEl  = document.getElementById('calcTotal');
  const costEl   = document.getElementById('calcCost');
  const profitEl = document.getElementById('calcProfit');
  const profitRow= document.getElementById('calcProfitRow');

  let addedPayout = 0, totalCost = 0, hasCost = false;
  const rows = [];

  document.querySelectorAll('.calc-item-row').forEach(row=>{
    const cb = row.querySelector('.calc-item-check');
    if (!cb.checked) return;
    const item = state.items.find(i=>i.id===parseInt(row.dataset.id)); if(!item) return;
    const lineTotal = item.adds_to_payout || 0;
    addedPayout += lineTotal;
    if (item.cost_numeric!=null) { totalCost += item.cost_numeric; hasCost=true; }
    rows.push({ name:item.name, icon:item.icon, lineTotal });
  });

  const totalPayout = BASE_PAYOUT + addedPayout;

  // Build summary rows — base payout always first
  let summaryHtml = `<div class="calc-summary-row base-payout-row">
    <span>⚰️ Base Burial Payout</span>
    <span>$${BASE_PAYOUT}</span>
  </div>`;

  if (rows.length) {
    summaryHtml += rows.map(r=>`
      <div class="calc-summary-row">
        <span>${r.icon||'📦'} ${esc(r.name)}</span>
        <span>+$${r.lineTotal.toFixed(0)}</span>
      </div>`).join('');
  } else {
    summaryHtml += `<p style="color:var(--text-muted);font-style:italic;font-size:0.88rem;padding:6px 0;">No add-on items selected.</p>`;
  }

  summary.innerHTML = summaryHtml;
  totalEl.textContent = `$${totalPayout.toFixed(0)}`;

  if (hasCost) {
    costEl.textContent = `$${totalCost.toFixed(0)}`;
    const profit = totalPayout - totalCost;
    profitEl.textContent = `$${profit.toFixed(0)} (${totalCost>0?Math.round((profit/totalCost)*100):0}% ROI)`;
    profitEl.style.color = profit>=0 ? 'var(--green-light)' : '#d46060';
    profitRow.style.display='flex';
  } else {
    costEl.textContent='—'; profitRow.style.display='none';
  }
}

/* ════════════════════════════════════════════
   DELETE CONFIRM
   ════════════════════════════════════════════ */
function confirmDelete(type, id, message) {
  state.deleteTarget={type,id};
  document.getElementById('deleteMessage').textContent=message;
  document.getElementById('deleteModalBackdrop').classList.add('open');
}

async function executeDelete() {
  const {type,id} = state.deleteTarget;
  try {
    if (type==='ingstock') {
      await DEL(`/api/ingredient_stock/${id}`);
      state.ingStock = state.ingStock.filter(r=>r.id!==id);
      computeSharedNames();
      toast('🗑️ Ingredient removed'); renderIngStockTable();
    }
  } catch(err){ toast(`❌ ${err.message}`,'error'); }
  finally { closeDeleteModal(); }
}

function closeDeleteModal() { document.getElementById('deleteModalBackdrop').classList.remove('open'); state.deleteTarget=null; }

/* ════════════════════════════════════════════
   EVENT LISTENERS
   ════════════════════════════════════════════ */
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
document.getElementById('hamburger').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('itemSearch').addEventListener('input', renderItems);
document.getElementById('sortFilter').addEventListener('change', renderItems);
document.getElementById('itemForm').addEventListener('submit', saveItem);
document.getElementById('itemModalClose').addEventListener('click', closeItemModal);
document.getElementById('btnCancelItem').addEventListener('click', closeItemModal);
document.getElementById('btnAddIng').addEventListener('click', ()=>addIngRow());
document.getElementById('btnAddIngStock').addEventListener('click', openIngStockModal);
document.getElementById('ingStockForm').addEventListener('submit', saveIngStock);
document.getElementById('ingStockModalClose').addEventListener('click', closeIngStockModal);
document.getElementById('btnCancelIngStock').addEventListener('click', closeIngStockModal);
document.getElementById('btnConfirmDelete').addEventListener('click', executeDelete);
document.getElementById('btnCancelDelete').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModalClose').addEventListener('click', closeDeleteModal);
['itemModalBackdrop','ingStockModalBackdrop','deleteModalBackdrop'].forEach(id=>{
  document.getElementById(id).addEventListener('click', e=>{
    if (e.target.id===id) {
      if (id==='itemModalBackdrop')    closeItemModal();
      if (id==='ingStockModalBackdrop') closeIngStockModal();
      if (id==='deleteModalBackdrop')  closeDeleteModal();
    }
  });
});
document.addEventListener('keydown', e=>{
  if (e.key==='Escape') { closeItemModal(); closeIngStockModal(); closeDeleteModal(); }
});

/* ════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════ */
async function init() {
  try { await loadAll(); setView('dashboard'); }
  catch(err) { console.error(err); toast('Failed to load data.','error'); }
}
init();
