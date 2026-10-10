// ============================================================================
//  Control del jugador, interfaz de inventario, HUD, F3, chat, mano
// ============================================================================
// ------------------------------------------------------------ iconos
const ICONS = {}; const _t16 = document.createElement('canvas'); _t16.width = _t16.height = 16; const _t16g = _t16.getContext('2d');
function tileCanvas(name, tint) {
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); const d = new Uint8ClampedArray(genTex(name));
  if (tint) for (let i = 0; i < d.length; i += 4) { d[i] *= tint[0]; d[i + 1] *= tint[1]; d[i + 2] *= tint[2]; }
  g.putImageData(new ImageData(d, 16, 16), 0, 0); return c;
}
function iconURL(id) {
  if (ICONS[id]) return ICONS[id]; const d = REG[id]; if (!d) return '';
  const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const tint = (d.tint || d.tintTop) ? [0.62 / 0.59 * 0.9, 0.86 / 0.59 * 0.9, 0.4 / 0.59 * 0.9] : null;
  if (d.isBlock && (d.render === 'cube' || (d.render === 'box' && !['torch', 'soul_torch', 'redstone_torch', 'end_rod', 'lantern', 'soul_lantern', 'pointed_dripstone', 'rail', 'lever', 'stone_button', 'lightning_rod'].includes(d.name)) || d.render === 'snow' || d.render === 'liquid')) {
    const T = d.texNames; const top = tileCanvas(T.top, d.tintTop || d.tint ? tint : null), left = tileCanvas(T.front || T.side, d.tint ? tint : null), right = tileCanvas(T.side, d.tint ? tint : null);
    const h = d.box ? (d.box[4] - d.box[1]) / 16 : d.render === 'snow' ? 0.25 : 1; const yo = (1 - h) * 16;
    g.setTransform(1, 0.5, -1, 0.5, 16, yo); g.drawImage(top, 0, 0);
    g.setTransform(1, 0.5, 0, h, 0, 8 + yo); g.drawImage(left, 0, 0); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, 16, 16);
    g.setTransform(1, -0.5, 0, h, 16, 16 + yo); g.drawImage(right, 0, 0); g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(0, 0, 16, 16);
  } else {
    const name = d.isBlock ? (d.texNames.side) : TEXNAMES[d.icon];
    g.drawImage(tileCanvas(name, d.isBlock && d.tint ? tint : null), 0, 0, 32, 32);
  }
  return (ICONS[id] = cv.toDataURL());
}
// ------------------------------------------------------------ HUD
const HUDIMG = {};
function pixImg(rows, pal) { const h = rows.length, w = rows[0].length; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } })); return c.toDataURL(); }
function buildHudImages() {
  const heart = ['.11.11...', '1rr1rr1..', '1rwrrrr1.', '1rrrrrr1.', '.1rrrr1..', '..1rr1...', '...11....'].map(r => r.padEnd(9, '.'));
  const pal = { '1': '#200', r: '#e01e1e', w: '#ffb0b0' };
  HUDIMG.heart = pixImg(heart, pal); HUDIMG.heartE = pixImg(heart, { '1': '#200', r: '#3a0d0d', w: '#3a0d0d' });
  HUDIMG.heartH = pixImg(heart.map(r => r.slice(0, 4).padEnd(9, '.')).map((r, i) => r.slice(0, 4) + heart[i].slice(4).replace(/[rw]/g, 'e')), { '1': '#200', r: '#e01e1e', w: '#ffb0b0', e: '#3a0d0d' });
  const food = ['....111..', '...1bbb1.', '..1bbbbb1', '..1bbbb1.', '.1w111...', '1w1......', '.1.......'];
  HUDIMG.food = pixImg(food, { '1': '#2a1408', b: '#c8752a', w: '#f0e6d0' }); HUDIMG.foodE = pixImg(food, { '1': '#2a1408', b: '#3a2410', w: '#3a2a20' });
  HUDIMG.foodH = pixImg(food.map((r, i) => r.slice(0, 5).replace(/b/g, 'e') + r.slice(5)), { '1': '#2a1408', b: '#c8752a', w: '#f0e6d0', e: '#3a2410' });
  const arm = ['11...11', '1g111g1', '1ggggg1', '.1ggg1.', '.1ggg1.', '.11111.'];
  HUDIMG.armor = pixImg(arm, { '1': '#222', g: '#d8d8d8' }); HUDIMG.armorE = pixImg(arm, { '1': '#222', g: '#444' }); HUDIMG.armorH = pixImg(arm.map(r => r.slice(0, 4).replace(/g/g, 'e') + r.slice(4)), { '1': '#222', g: '#d8d8d8', e: '#444' });
  HUDIMG.bubble = pixImg(['..111..', '.1wbb1.', '1wbbbb1', '1bbbbb1', '.1bbb1.', '..111..'], { '1': '#1a3a8a', w: '#fff', b: '#6aa8ff' });
}
function updateHUD() {
  const p = G.player; if (!p || G.mode !== 'game') return;
  const hb = $('hotbar'); if (!hb.children.length) for (let i = 0; i < 9; i++) { const s = document.createElement('div'); s.className = 'hslot'; hb.appendChild(s); }
  for (let i = 0; i < 9; i++) { const el = hb.children[i]; slotRender(el, p.inv[i]); el.classList.toggle('sel', i === p.sel); }
  const surv = G.gameMode === 'survival' || G.gameMode === 'adventure';
  $('stats').style.display = surv ? '' : 'none';
  const row = (el, n, full, half, empty, max = 10, shake) => { let h = ''; for (let i = 0; i < max; i++) { const v = n - i * 2; const img = v >= 2 ? full : v === 1 ? half : empty; h += `<img src="${img}" style="${shake && Math.random() < 0.5 ? 'transform:translateY(-1px)' : ''}">`; } el.innerHTML = h; };
  row($('hearts'), Math.ceil(p.hp), HUDIMG.heart, HUDIMG.heartH, HUDIMG.heartE, 10, p.hp <= 4);
  row($('food'), p.food, HUDIMG.food, HUDIMG.foodH, HUDIMG.foodE);
  const ap = p.armorPts(); $('armor').style.visibility = ap > 0 ? 'visible' : 'hidden'; row($('armor'), ap, HUDIMG.armor, HUDIMG.armorH, HUDIMG.armorE);
  if (p.air < 300 && p.eyeInWater) { let h = ''; const n = Math.ceil(p.air / 30); for (let i = 0; i < n; i++) h += `<img src="${HUDIMG.bubble}">`; $('air').innerHTML = h; } else $('air').innerHTML = '';
  $('xpbar').style.display = surv ? '' : 'none';
}
function slotRender(el, s) {
  if (!s) { el.innerHTML = ''; return; }
  const d = REG[s.id]; let h = `<img src="${iconURL(s.id)}"${s.e ? ' class="glint"' : ''}>`;
  if (s.c > 1) h += `<span class="cnt">${s.c}</span>`;
  if (d.dur && s.d > 0) { const f = 1 - s.d / d.dur; h += `<div class="dur"><div style="width:${f * 100}%;background:hsl(${f * 120},100%,50%)"></div></div>`; }
  el.innerHTML = h;
}
let itemNameT = 0;
function showItemName() { const s = G.player.held(); const el = $('itemName'); el.textContent = s ? REG[s.id].disp : ''; el.style.opacity = 1; itemNameT = 2; }
// ------------------------------------------------------------ chat/títulos
function chatMsg(text, color) {
  const el = document.createElement('div'); el.className = 'cmsg'; el.textContent = text; if (color) el.style.color = color; el.dataset.t = performance.now();
  $('chatLog').appendChild(el); while ($('chatLog').children.length > 60) $('chatLog').firstChild.remove();
}
function showTitle(t, s) { $('bigTitle').textContent = t; $('subTitle').textContent = s; $('titleWrap').style.opacity = 1; clearTimeout(showTitle.tm); showTitle.tm = setTimeout(() => $('titleWrap').style.opacity = 0, 3500); }
function flashHurt() { const el = $('fxHurt'); el.style.transition = 'none'; el.style.opacity = 0.45; requestAnimationFrame(() => { el.style.transition = 'opacity .6s'; el.style.opacity = 0; }); }
// ------------------------------------------------------------ INVENTARIO / CONTENEDORES
const UI = { open: null, cursor: null, slots: [], craft: null, hover: null, data: null };
function makeSlot(get, set, opt = {}) { return Object.assign({ get, set }, opt); }
function arrSlot(arr, i, opt) { return makeSlot(() => arr[i], v => { arr[i] = v; }, opt); }
function openScreen(kind, data) {
  const p = G.player; UI.open = kind; UI.data = data || {}; UI.slots = []; UI.cursor = UI.cursor || null;
  document.exitPointerLock && document.exitPointerLock();
  const panel = $('invPanel'); panel.innerHTML = ''; panel.className = 'panel ' + kind;
  const sec = (title, cls) => { const d = document.createElement('div'); d.className = 'sec ' + (cls || ''); if (title) { const t = document.createElement('div'); t.className = 'ptitle'; t.textContent = title; d.appendChild(t); } panel.appendChild(d); return d; };
  const grid = (parent, slots, cols, cls) => { const g = document.createElement('div'); g.className = 'grid ' + (cls || ''); g.style.gridTemplateColumns = `repeat(${cols}, var(--sl))`; for (const s of slots) { const el = document.createElement('div'); el.className = 'slot' + (s.cls ? ' ' + s.cls : ''); s.el = el; UI.slots.push(s); el.addEventListener('mousedown', ev => slotClick(s, ev)); el.addEventListener('mouseenter', () => { UI.hover = s; showTooltip(s); }); el.addEventListener('mouseleave', () => { if (UI.hover === s) UI.hover = null; hideTooltip(); }); el.addEventListener('contextmenu', e => e.preventDefault()); g.appendChild(el); } parent.appendChild(g); return g; };
  if (kind === 'creative') { buildCreative(panel, grid, sec); }
  else {
    const top = sec(null, 'top');
    if (kind === 'inv') {
      const row = document.createElement('div'); row.className = 'row2'; top.appendChild(row);
      const armorCol = document.createElement('div'); row.appendChild(armorCol);
      grid(armorCol, [0, 1, 2, 3].map(i => arrSlot(p.armor, i, { armor: i, cls: 'armor a' + i })), 1);
      const pv = document.createElement('canvas'); pv.className = 'pview'; pv.width = 100; pv.height = 140; row.appendChild(pv); drawPlayerPreview(pv);
      const offc = document.createElement('div'); offc.className = 'offc'; row.appendChild(offc); grid(offc, [makeSlot(() => p.offhand, v => p.offhand = v, { cls: 'offhand' })], 1);
      const cr = document.createElement('div'); cr.className = 'craftbox'; row.appendChild(cr);
      const t = document.createElement('div'); t.className = 'ptitle'; t.textContent = 'Fabricación'; cr.appendChild(t);
      UI.craft = { grid: UI.craftKeep || new Array(4).fill(null), w: 2 }; buildCraft(cr, grid);
    } else if (kind === 'craft') {
      const t = document.createElement('div'); t.className = 'ptitle'; t.textContent = 'Mesa de trabajo'; top.appendChild(t);
      UI.craft = { grid: new Array(9).fill(null), w: 3 }; const cr = document.createElement('div'); cr.className = 'craftbox big'; top.appendChild(cr); buildCraft(cr, grid);
    } else if (kind === 'furnace') {
      const c = data.c; const t = document.createElement('div'); t.className = 'ptitle'; t.textContent = REG[data.block].disp; top.appendChild(t);
      const fb = document.createElement('div'); fb.className = 'furn'; top.appendChild(fb);
      const left = document.createElement('div'); left.className = 'fcol'; fb.appendChild(left);
      grid(left, [arrSlot(c.items, 0, { onChange: netContainer })], 1); const flame = document.createElement('div'); flame.className = 'flame'; flame.id = 'fFlame'; left.appendChild(flame); grid(left, [arrSlot(c.items, 1, { fuel: true, onChange: netContainer })], 1);
      const arrow = document.createElement('div'); arrow.className = 'farrow'; arrow.innerHTML = '<div id="fArrow"></div>'; fb.appendChild(arrow);
      grid(fb, [arrSlot(c.items, 2, { output: true, take: true, onChange: netContainer, cls: 'big' })], 1);
    } else if (kind === 'chest' || kind === 'ender') {
      const items = data.c.items; const t = document.createElement('div'); t.className = 'ptitle'; t.textContent = data.title || 'Cofre'; top.appendChild(t);
      grid(top, items.map((_, i) => arrSlot(items, i, { onChange: netContainer })), 9);
    } else if (kind === 'anvil') {
      const t = document.createElement('div'); t.className = 'ptitle'; t.textContent = 'Yunque: reparar y combinar'; top.appendChild(t);
      UI.anv = UI.anv || [null, null]; const A = UI.anv; const fb = document.createElement('div'); fb.className = 'furn'; top.appendChild(fb);
      grid(fb, [arrSlot(A, 0), arrSlot(A, 1)], 2); const ar = document.createElement('div'); ar.className = 'farrow static'; fb.appendChild(ar);
      grid(fb, [makeSlot(() => { const r = anvilResult(A[0], A[1]); return r && (G.gameMode === 'creative' || xpLevel(p.xp) >= 1) ? r : null; }, () => { }, { output: true, craftOut: 'anvil', cls: 'big' })], 1);
      const hint = document.createElement('div'); hint.className = 'hint'; hint.id = 'anvHint'; hint.textContent = 'Dos objetos iguales o un objeto + su material. Cuesta 1 nivel de experiencia.'; top.appendChild(hint);
    } else if (kind === 'enchant') {
      const t = document.createElement('div'); t.className = 'ptitle'; t.textContent = 'Encantar (librerías cerca: ' + (data.shelves || 0) + ')'; top.appendChild(t);
      UI.enc = UI.enc || [null, null]; const E = UI.enc; const fb = document.createElement('div'); fb.className = 'furn'; top.appendChild(fb);
      grid(fb, [arrSlot(E, 0, { onChange: () => refreshInvUI() }), arrSlot(E, 1, { onChange: () => refreshInvUI() })], 2);
      const opts = document.createElement('div'); opts.className = 'encopts'; opts.id = 'encOpts'; fb.appendChild(opts);
    } else if (kind === 'smith') {
      const t = document.createElement('div'); t.className = 'ptitle'; t.textContent = 'Mejorar equipo'; top.appendChild(t);
      UI.smith = UI.smith || [null, null, null]; const sm = UI.smith; const fb = document.createElement('div'); fb.className = 'furn'; top.appendChild(fb);
      grid(fb, [arrSlot(sm, 2, { cls: 'tmpl' }), arrSlot(sm, 0), arrSlot(sm, 1)], 3);
      const ar = document.createElement('div'); ar.className = 'farrow static'; fb.appendChild(ar);
      grid(fb, [makeSlot(() => smithResult(), () => { }, { output: true, craftOut: 'smith', cls: 'big' })], 1);
      const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Equipo de diamante + lingote de netherita (+ plantilla opcional) = equipo de netherita'; top.appendChild(hint);
    }
    // inventario del jugador
    const bot = sec('Inventario', 'bot');
    grid(bot, Array.from({ length: 27 }, (_, i) => arrSlot(p.inv, 9 + i, { pinv: true })), 9);
    const hb = document.createElement('div'); hb.style.height = '8px'; bot.appendChild(hb);
    grid(bot, Array.from({ length: 9 }, (_, i) => arrSlot(p.inv, i, { pinv: true, hot: true })), 9);
  }
  $('sInv').classList.add('on'); refreshInvUI();
}
function buildCraft(parent, grid) {
  const c = UI.craft; const row = document.createElement('div'); row.className = 'crow'; parent.appendChild(row);
  grid(row, c.grid.map((_, i) => arrSlot(c.grid, i)), c.w);
  const ar = document.createElement('div'); ar.className = 'farrow static'; row.appendChild(ar);
  grid(row, [makeSlot(() => craftResult(), () => { }, { output: true, craftOut: 'craft', cls: 'big' })], 1);
}
function craftResult() { const c = UI.craft; if (!c) return null; const r = matchRecipe(c.grid, c.w); if (!r) return null; const id = ID[r.res]; if (id === undefined) return null; return { id, c: r.n, d: 0 }; }
function consumeAnvil() { const A = UI.anv; const r = anvilResult(A[0], A[1]); A[0] = null; if (r && r.use) { A[1].c -= r.use; if (A[1].c <= 0) A[1] = null; } else A[1] = null; if (G.gameMode !== 'creative') spendLevels(G.player, 1); playSound('break_item', 0, 0, 0, 0.3); }
function renderEnchant() {
  const box = $('encOpts'); if (!box) return; const E = UI.enc; const p = G.player; const s = E[0];
  const rolls = s && !s.e ? enchantRolls(s, UI.data.shelves || 0) : []; const lap = E[1] && E[1].id === ID.lapis_lazuli ? E[1].c : 0;
  box.innerHTML = rolls.length ? rolls.map((o, i) => { const ok = G.gameMode === 'creative' || (xpLevel(p.xp) >= o.cost && lap >= i + 1); return `<div class="eopt ${ok ? '' : 'no'}" data-i="${i}"><b>${o.cost}</b> ${ENCH[o.k][0]} ${ROMAN[o.lvl]} <small>(${i + 1} lapislázuli)</small></div>`; }).join('') : '<div class="hint">' + (s && s.e ? 'Ya está encantado' : 'Coloca una herramienta, arma o armadura y lapislázuli') + '</div>';
  box.querySelectorAll('.eopt').forEach(el => el.onmousedown = ev => { ev.preventDefault(); const i = +el.dataset.i; const o = rolls[i]; if (G.gameMode !== 'creative' && (xpLevel(p.xp) < o.cost || lap < i + 1)) return; s.e = { [o.k]: o.lvl }; if (Math.random() < 0.5) { const L = enchOptions(s).filter(k => k !== o.k); if (L.length) { const k2 = L[Math.random() * L.length | 0]; s.e[k2] = Math.max(1, Math.round(o.lvl * 0.6)); } } if (G.gameMode !== 'creative') { E[1].c -= i + 1; if (E[1].c <= 0) E[1] = null; spendLevels(p, i + 1); } p.enchSeed = Math.random() * 1e9 | 0; playSound('levelup', 0, 0, 0, 0.5); refreshInvUI(); });
}
function consumeCraft() { const c = UI.craft; for (let i = 0; i < c.grid.length; i++) { const s = c.grid[i]; if (!s) continue; if (s.id === ID.water_bucket || s.id === ID.lava_bucket || s.id === ID.milk_bucket) { c.grid[i] = { id: ID.bucket, c: 1 }; continue; } s.c--; if (s.c <= 0) c.grid[i] = null; } }
function smithResult() { const s = UI.smith; if (!s || !s[0] || !s[1] || s[1].id !== ID.netherite_ingot) return null; const n = REG[s[0].id].name; if (!n.startsWith('diamond_')) return null; const t = ID['netherite_' + n.slice(8)]; if (t === undefined) return null; return { id: t, c: 1, d: s[0].d || 0 }; }
function consumeSmith() { const s = UI.smith; s[0] = null; s[1].c--; if (s[1].c <= 0) s[1] = null; if (s[2]) { s[2].c--; if (s[2].c <= 0) s[2] = null; } }
function sameItem(a, b) { return a && b && a.id === b.id && (a.d || 0) === (b.d || 0) && !a.e && !b.e; }
function slotClick(s, ev) {
  ev.preventDefault(); const p = G.player; const right = ev.button === 2; const shift = ev.shiftKey;
  if (s.palette) { // creativo
    if (UI.cursor) { UI.cursor = null; } else { const d = REG[s.palette]; const st = { id: s.palette, c: shift || ev.button === 1 ? d.stack : (right ? 1 : d.stack), d: 0 }; if (shift) giveItem(p, st); else UI.cursor = st; }
    refreshInvUI(); return;
  }
  if (s.trash) { if (shift) { p.inv.fill(null); } UI.cursor = null; refreshInvUI(); return; }
  if (s.output) {
    const res = s.get(); if (!res) return;
    const take = () => { if (s.craftOut === 'craft') consumeCraft(); else if (s.craftOut === 'smith') consumeSmith(); else if (s.craftOut === 'anvil') consumeAnvil(); else s.set(null); };
    if (shift) { let guard = 0; while (guard++ < 64) { const r = s.get(); if (!r) break; const left = giveItem(p, r); if (left > 0) { if (left < r.c) { } break; } take(); if (!s.craftOut) break; } }
    else if (!UI.cursor) { UI.cursor = { ...res }; take(); }
    else if (sameItem(UI.cursor, res) && UI.cursor.c + res.c <= REG[res.id].stack) { UI.cursor.c += res.c; take(); }
    if (s.onChange) s.onChange(); refreshInvUI(); playSound('click', 0, 0, 0, 0.2); return;
  }
  const cur = s.get();
  if (shift && cur) { quickMove(s); if (s.onChange) s.onChange(); refreshInvUI(); return; }
  if (s.armor !== undefined && UI.cursor) { const d = REG[UI.cursor.id]; if (!(d.armor && d.armor.slot === s.armor) && !(s.armor === 0 && UI.cursor.id === ID.carved_pumpkin)) return; }
  if (!right) {
    if (!UI.cursor) { if (cur) { UI.cursor = cur; s.set(null); } }
    else if (!cur) { s.set(UI.cursor); UI.cursor = null; }
    else if (sameItem(cur, UI.cursor)) { const max = REG[cur.id].stack; const k = Math.min(UI.cursor.c, max - cur.c); cur.c += k; UI.cursor.c -= k; if (UI.cursor.c <= 0) UI.cursor = null; }
    else { s.set(UI.cursor); UI.cursor = cur; }
  } else {
    if (!UI.cursor) { if (cur) { const h = Math.ceil(cur.c / 2); UI.cursor = { ...cur, c: h }; cur.c -= h; if (cur.c <= 0) s.set(null); } }
    else if (!cur) { s.set({ ...UI.cursor, c: 1 }); UI.cursor.c--; if (UI.cursor.c <= 0) UI.cursor = null; }
    else if (sameItem(cur, UI.cursor) && cur.c < REG[cur.id].stack) { cur.c++; UI.cursor.c--; if (UI.cursor.c <= 0) UI.cursor = null; }
  }
  if (s.onChange) s.onChange(); refreshInvUI();
}
function quickMove(s) {
  const p = G.player; const st = s.get(); if (!st) return;
  const tryInto = targets => { for (const t of targets) { const c = t.get(); if (c && sameItem(c, st) && c.c < REG[c.id].stack) { const k = Math.min(st.c, REG[c.id].stack - c.c); c.c += k; st.c -= k; if (st.c <= 0) { s.set(null); return true; } } } for (const t of targets) { if (!t.get()) { t.set({ ...st }); s.set(null); return true; } } return false; };
  const containerSlots = UI.slots.filter(x => !x.pinv && !x.output && !x.palette && !x.trash && x.armor === undefined && !(UI.open === 'inv' && UI.craft && UI.craft.grid.includes(x.get && x.get())) );
  if (s.pinv) {
    const d = REG[st.id];
    if (d.armor && UI.open === 'inv') { const a = UI.slots.find(x => x.armor === d.armor.slot); if (a && !a.get()) { a.set(st); s.set(null); return; } }
    if (UI.open === 'furnace') { const c = UI.data.c; if (SMELT[st.id]) { tryInto([UI.slots.find(x => x.get === undefined) || arrSlotOf(c.items, 0)]); return; } if (d.fuel) { tryInto([arrSlotOf(c.items, 1)]); return; } }
    if (UI.open === 'chest' || UI.open === 'ender') { tryInto(UI.slots.filter(x => !x.pinv)); return; }
    // hotbar <-> principal
    tryInto(UI.slots.filter(x => x.pinv && x.hot !== s.hot));
  } else tryInto(UI.slots.filter(x => x.pinv).sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0)));
}
function arrSlotOf(arr, i) { return makeSlot(() => arr[i], v => arr[i] = v); }
function refreshInvUI() {
  if (!UI.open) return;
  for (const s of UI.slots) { if (!s.el) continue; slotRender(s.el, s.palette ? { id: s.palette, c: 1 } : s.get ? s.get() : null); }
  const cur = $('cursorItem'); if (UI.cursor) { slotRender(cur, UI.cursor); cur.style.display = 'block'; } else cur.style.display = 'none';
  if (UI.open === 'enchant') renderEnchant();
  if (UI.open === 'furnace') { const c = UI.data.c; const fa = $('fArrow'), ff = $('fFlame'); if (fa) fa.style.width = ((c.cook || 0) / 200 * 100) + '%'; if (ff) ff.style.opacity = c.burn > 0 ? 0.3 + 0.7 * c.burn / (c.burnMax || 1) : 0.08; }
  updateHUD();
}
function showTooltip(s) { const st = s.palette ? { id: s.palette, c: 1 } : s.get ? s.get() : null; const tt = $('tooltip'); if (!st) { tt.style.display = 'none'; return; } const d = REG[st.id]; let h = `<b>${d.disp}</b>`; if (st.e) for (const k in st.e) h += `<br><span style="color:#a8a8ff">${ENCH[k] ? ENCH[k][0] : k} ${ROMAN[st.e[k]] || st.e[k]}</span>`;
  if (d.dur) h += `<br><span style="color:#aaa">Durabilidad: ${d.dur - (st.d || 0)} / ${d.dur}</span>`; if (d.armor && d.armor.pts) h += `<br><span style="color:#58f">+${d.armor.pts} armadura</span>`; if (d.dmg) h += `<br><span style="color:#5f5">${d.dmg} de daño</span>`; if (d.food) h += `<br><span style="color:#fa5">+${d.food[0]} comida</span>`; h += `<br><span style="color:#555;font-size:14px">minecraft:${d.name}</span>`; tt.innerHTML = h; tt.style.display = 'block'; }
function hideTooltip() { $('tooltip').style.display = 'none'; }
function closeScreen() {
  const p = G.player; if (!UI.open) return;
  if (UI.craft && UI.open === 'craft') for (let i = 0; i < UI.craft.grid.length; i++) if (UI.craft.grid[i]) { const l = giveItem(p, UI.craft.grid[i]); if (l) dropItem(p.dim, p.x, p.eye, p.z, { ...UI.craft.grid[i], c: l }); UI.craft.grid[i] = null; }
  if (UI.open === 'inv' && UI.craft) { for (let i = 0; i < 4; i++) if (UI.craft.grid[i]) { const l = giveItem(p, UI.craft.grid[i]); if (l) dropItem(p.dim, p.x, p.eye, p.z, { ...UI.craft.grid[i], c: l }); UI.craft.grid[i] = null; } }
  for (const [k, arr] of [['anvil', UI.anv], ['enchant', UI.enc]]) if (UI.open === k && arr) for (let i = 0; i < arr.length; i++) if (arr[i]) { const l = giveItem(p, arr[i]); if (l) dropItem(p.dim, p.x, p.eye, p.z, { ...arr[i], c: l }); arr[i] = null; }
  if (UI.open === 'smith' && UI.smith) { for (let i = 0; i < 3; i++) if (UI.smith[i]) { giveItem(p, UI.smith[i]); UI.smith[i] = null; } }
  if (UI.cursor) { const l = giveItem(p, UI.cursor); if (l) dropItem(p.dim, p.x, p.eye, p.z, { ...UI.cursor, c: l }, -Math.sin(p.yaw) * 4, 2, -Math.cos(p.yaw) * 4, 40); UI.cursor = null; }
  if ((UI.open === 'chest' || UI.open === 'furnace') && UI.data.key) { netContainer(); if (UI.data.block === ID.chest) playSound('chest_close', p.x, p.y, p.z, 0.5); }
  UI.open = null; UI.craft = null; $('sInv').classList.remove('on'); hideTooltip(); $('cursorItem').style.display = 'none'; updateHUD();
  lockPointer();
}
function netContainer() { if (UI.data && UI.data.key && G.net && G.net.role === 'client') netSend({ t: 'cu', k: UI.data.key, c: UI.data.c }); }
// creativo
const CREATIVE_TABS = [['Construcción', i => { const d = REG[i]; return d.isBlock && d.render === 'cube' && !d.ui && !d.light && !/ore|log|leaves|sand|gravel|dirt|grass|nylium|wool/.test(d.name); }],
  ['Colores', i => /wool|terracotta|glass|concrete|carpet/.test(REG[i].name)],
  ['Naturales', i => { const d = REG[i]; return d.isBlock && (/ore|log|leaves|sand|gravel|dirt|grass|nylium|sapling|flower|mushroom|cactus|snow|ice|stone$|netherrack|soul|end_stone|moss|sculk|dripstone|clay|mud|basalt|blackstone|kelp|seagrass|lily|vine|fungus|roots|stem|wart|melon|pumpkin|bush|fern|poppy|dandelion|orchid|cornflower|daisy|amethyst|cane|chorus|petals|debris/.test(d.name)); }],
  ['Funcionales', i => { const d = REG[i]; return d.isBlock && (d.ui || d.light || /portal|spawner|bed|tnt|bars|fence|wall|rail|ladder|slab|scaffold|lever|button|plate|rod|lamp|detector|target|note|slime|honey/.test(d.name)); }],
  ['Herramientas', i => { const d = REG[i]; return !d.isBlock && (d.tool && d.tool.type !== 'sword' || /bucket|flint_and|extinguisher|shears|compass|clock|spyglass|map|lead|brush|fishing|rocket|saddle|name_tag|bone_meal|eye_of|ender_pearl/.test(d.name)); }],
  ['Combate', i => { const d = REG[i]; return !d.isBlock && (d.armor || (d.tool && d.tool.type === 'sword') || /bow|arrow|shield|trident|mace|totem|elytra|snowball/.test(d.name) || (d.tool && d.tool.type === 'axe')); }],
  ['Comida', i => !REG[i].isBlock && !!REG[i].food],
  ['Ingredientes', i => { const d = REG[i]; return !d.isBlock && !d.food && !d.tool && !d.armor && !d.dur && !d.bucket && !/bow|arrow|shield|trident|mace|totem|elytra/.test(d.name); }],
  ['Buscar', null]];
function allItemIds() { const a = []; for (let i = 1; i < REG.length; i++) { const d = REG[i]; if (!d) continue; if (d.isBlock && (d.liquid || d.portal || d.name === 'fire' || d.name === 'furnace_lit' || d.name === 'end_gateway' || d.name === 'end_portal')) continue; a.push(i); } return a; }
function buildCreative(panel, grid, sec) {
  const tabs = document.createElement('div'); tabs.className = 'ctabs'; panel.appendChild(tabs);
  const body = document.createElement('div'); body.className = 'cbody'; panel.appendChild(body);
  const search = document.createElement('input'); search.className = 'tf csearch'; search.placeholder = 'Buscar objetos...';
  const show = (ti) => {
    UI.ctab = ti; body.innerHTML = ''; UI.slots = UI.slots.filter(s => !s.palette && s.pinv !== true && !s.trash);
    [...tabs.children].forEach((b, i) => b.classList.toggle('on', i === ti));
    const [name, f] = CREATIVE_TABS[ti]; const t = document.createElement('div'); t.className = 'ptitle'; t.textContent = name; body.appendChild(t);
    let ids = allItemIds();
    if (f) ids = ids.filter(f); else { body.appendChild(search); const q = search.value.toLowerCase(); ids = ids.filter(i => REG[i].disp.toLowerCase().includes(q) || REG[i].name.includes(q)); setTimeout(() => search.focus(), 0); }
    const sc = document.createElement('div'); sc.className = 'cscroll'; body.appendChild(sc);
    grid(sc, ids.map(id => ({ palette: id })), 9);
    const bot = document.createElement('div'); bot.className = 'cbot'; body.appendChild(bot);
    grid(bot, [...Array.from({ length: 9 }, (_, i) => arrSlot(G.player.inv, i, { pinv: true, hot: true })), { trash: true, cls: 'trash', get: () => null, set() { } }], 10);
    refreshInvUI();
  };
  CREATIVE_TABS.forEach(([n], i) => { const b = document.createElement('button'); b.className = 'ctab'; b.textContent = n; b.onclick = () => show(i); tabs.appendChild(b); });
  search.oninput = () => show(CREATIVE_TABS.length - 1);
  search.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
  show(UI.ctab || 0);
}
function drawPlayerPreview(cv) { const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#000'; g.fillRect(0, 0, 100, 140); const t = n => tileCanvas(n); g.drawImage(t('steve_face'), 34, 10, 32, 32); g.drawImage(t('steve_shirt'), 34, 42, 32, 46); g.drawImage(t('steve_skin'), 18, 42, 16, 46); g.drawImage(t('steve_skin'), 66, 42, 16, 46); g.drawImage(t('steve_pants'), 34, 88, 16, 46); g.drawImage(t('steve_pants'), 50, 88, 16, 46); const a = G.player.armor; const col = i => a[i] && REG[a[i].id].armor && ARMORMAT[REG[a[i].id].armor.mat] ? 'rgba(' + ARMORMAT[REG[a[i].id].armor.mat].col.join(',') + ',0.75)' : null; if (col(0)) { g.fillStyle = col(0); g.fillRect(32, 8, 36, 14); } if (col(1)) { g.fillStyle = col(1); g.fillRect(16, 42, 68, 30); } if (col(2)) { g.fillStyle = col(2); g.fillRect(34, 86, 32, 30); } if (col(3)) { g.fillStyle = col(3); g.fillRect(34, 120, 32, 14); } }

// ------------------------------------------------------------ ENCANTAMIENTOS, YUNQUE Y COMERCIO
const ENCH = { sharpness: ['Filo', 5], efficiency: ['Eficiencia', 5], unbreaking: ['Irrompibilidad', 3], protection: ['Protección', 4], feather_falling: ['Caída de pluma', 4], power: ['Poder', 5], fortune: ['Fortuna', 3], looting: ['Botín', 3], respiration: ['Respiración', 3], fire_aspect: ['Aspecto ígneo', 2] };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
function enchLvl(s, k) { return s && s.e && s.e[k] ? s.e[k] : 0; }
function enchOptions(s) {
  const d = REG[s.id]; const t = d.tool ? d.tool.type : null; const L = [];
  if (t === 'sword') L.push('sharpness', 'looting', 'fire_aspect', 'unbreaking'); else if (t === 'axe') L.push('efficiency', 'sharpness', 'unbreaking'); else if (t) L.push('efficiency', 'fortune', 'unbreaking');
  else if (d.armor) { L.push('protection', 'unbreaking'); if (d.armor.slot === 3) L.push('feather_falling'); if (d.armor.slot === 0) L.push('respiration'); } else if (d.bow) L.push('power', 'unbreaking'); else if (d.dur) L.push('unbreaking');
  return L;
}
function xpLevel(xp) { return Math.floor(Math.sqrt((xp || 0) / 10)); }
function spendLevels(p, n) { const nl = Math.max(0, xpLevel(p.xp) - n); p.xp = nl * nl * 10; }
function enchantRolls(s, shelves) {
  const L = enchOptions(s); if (!L.length) return [];
  const r = mulberry32(((s.id * 31 + (s.d || 0) * 7 + shelves * 131) ^ (G.player.enchSeed || (G.player.enchSeed = Math.random() * 1e9 | 0))) >>> 0);
  return [1, 2, 3].map(i => { const k = L[(r() * L.length) | 0]; const max = ENCH[k][1]; const lvl = clamp(Math.round(i * max / 3 * (0.6 + Math.min(15, shelves) / 30) + r() * 0.8), 1, max); return { k, lvl, cost: i + (shelves >= 10 ? i : 0) }; });
}
function countShelves(w, x, y, z) { let n = 0; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 1; dy++) if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && w.get(x + dx, y + dy, z + dz) === ID.bookshelf) n++; return n; }
function repairMat(id) { const n = REG[id].name; for (const [m, it] of [['wooden', 'oak_planks'], ['stone', 'cobblestone'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond'], ['netherite', 'netherite_ingot'], ['leather', 'leather']]) if (n.startsWith(m + '_')) return ID[it]; return -1; }
function anvilResult(a, b) {
  if (!a || !b) return null; const d = REG[a.id]; if (!d.dur && !b.e) return null;
  if (b.id === a.id) { const keep = d.dur - (a.d || 0) + d.dur - (b.d || 0) + Math.floor(d.dur * 0.12); const e = Object.assign({}, a.e || {}); for (const k in b.e || {}) e[k] = Math.min(ENCH[k][1], e[k] === b.e[k] ? e[k] + 1 : Math.max(e[k] || 0, b.e[k])); return { id: a.id, c: 1, d: Math.max(0, d.dur - keep), e }; }
  if (b.id === repairMat(a.id) && a.d > 0) return { id: a.id, c: 1, d: Math.max(0, a.d - Math.ceil(d.dur / 4) * b.c), e: a.e, use: Math.min(b.c, Math.ceil(a.d / Math.ceil(d.dur / 4))) };
  return null;
}
const PROF = {
  'Granjero': [[['wheat', 20], 'emerald', 1], [['emerald', 1], 'bread', 6], [['potato', 26], 'emerald', 1], [['carrot', 22], 'emerald', 1], [['emerald', 3], 'golden_carrot', 3], [['emerald', 1], 'apple', 4], [['emerald', 1], 'pumpkin_pie', 2]],
  'Bibliotecario': [[['paper', 24], 'emerald', 1], [['emerald', 9], 'bookshelf', 1], [['emerald', 1], 'lantern', 1], [['book', 4], 'emerald', 1], [['emerald', 5], 'clock', 1], [['emerald', 4], 'compass', 1]],
  'Armero': [[['coal', 15], 'emerald', 1], [['emerald', 5], 'iron_helmet', 1], [['emerald', 9], 'iron_chestplate', 1], [['emerald', 7], 'iron_leggings', 1], [['emerald', 4], 'iron_boots', 1], [['emerald', 21], 'diamond_chestplate', 1], [['emerald', 5], 'shield', 1]],
  'Herrero de herramientas': [[['coal', 15], 'emerald', 1], [['iron_ingot', 4], 'emerald', 1], [['emerald', 1], 'stone_pickaxe', 1], [['emerald', 3], 'iron_shovel', 1], [['emerald', 13], 'diamond_pickaxe', 1], [['emerald', 12], 'diamond_axe', 1]],
  'Herrero de armas': [[['coal', 15], 'emerald', 1], [['emerald', 3], 'iron_axe', 1], [['emerald', 2], 'iron_sword', 1], [['emerald', 13], 'diamond_sword', 1], [['flint', 24], 'emerald', 1]],
  'Carnicero': [[['chicken', 14], 'emerald', 1], [['porkchop', 7], 'emerald', 1], [['beef', 10], 'emerald', 1], [['emerald', 1], 'cooked_porkchop', 6], [['emerald', 1], 'cooked_chicken', 8]],
  'Clérigo': [[['rotten_flesh', 32], 'emerald', 1], [['emerald', 1], 'redstone', 2], [['emerald', 1], 'lapis_lazuli', 2], [['emerald', 5], 'ender_pearl', 1], [['emerald', 4], 'glowstone', 1], [['emerald', 3], 'experience_bottle', 1]],
  'Pescador': [[['string', 15], 'emerald', 1], [['emerald', 1], 'cooked_cod', 6], [['coal', 10], 'emerald', 1], [['emerald', 2], 'fishing_rod', 1]],
  'Flechero': [[['stick', 32], 'emerald', 1], [['emerald', 1], 'arrow', 16], [['flint', 26], 'emerald', 1], [['emerald', 2], 'bow', 1], [['emerald', 3], 'crossbow', 1]],
};
function villagerTrades(e) {
  if (e.trades) return e.trades; const names = Object.keys(PROF); const r = mulberry32((typeof e.id === 'number' ? e.id : hashStr(String(e.id))) * 2654435761 >>> 0);
  e.prof = names[(r() * names.length) | 0]; const L = PROF[e.prof].slice(); const out = [];
  while (out.length < Math.min(5, L.length)) { const t = L.splice((r() * L.length) | 0, 1)[0]; out.push([typeof t[0][0] === 'string' ? [t[0]] : t[0], t[1], t[2]]); }
  return (e.trades = out);
}
function openTrade(e) {
  const trades = villagerTrades(e); const p = G.player; UI.open = 'trade'; UI.data = { e }; UI.slots = [];
  document.exitPointerLock && document.exitPointerLock();
  const panel = $('invPanel'); panel.className = 'panel tradep';
  const render = () => {
    let h = `<div class="ptitle">${e.prof} — comerciar</div><div class="trades">`;
    trades.forEach((t, i) => { const [cost, res, n] = t; const ok = cost.every(([it, c]) => countItem(p, ID[it]) >= c) && ID[res] !== undefined; h += `<div class="trade ${ok ? '' : 'no'}" data-i="${i}">` + cost.map(([it, c]) => `<span class="ti"><img src="${iconURL(ID[it])}">${c}</span>`).join('+') + ` ➜ <span class="ti"><img src="${iconURL(ID[res] ?? ID.emerald)}">${n}</span> <span class="tn">${ID[res] !== undefined ? REG[ID[res]].disp : res}</span></div>`; });
    h += '</div><div class="ptitle" style="margin-top:6px">Esmeraldas: ' + countItem(p, ID.emerald) + '</div>'; panel.innerHTML = h;
    panel.querySelectorAll('.trade').forEach(el => el.onmousedown = ev => { ev.preventDefault(); const [cost, res, n] = trades[+el.dataset.i]; if (ID[res] === undefined || !cost.every(([it, c]) => countItem(p, ID[it]) >= c)) { playSound('hurt_mob', 0, 0, 0, 0.3); return; } for (const [it, c] of cost) takeItem(p, ID[it], c); const left = giveItem(p, { id: ID[res], c: n }); if (left) dropItem(p.dim, p.x, p.eye, p.z, { id: ID[res], c: left }); p.xp = (p.xp || 0) + 3; playSound('levelup', 0, 0, 0, 0.4); render(); });
  };
  render(); $('sInv').classList.add('on'); playSound('mob_villager', 0, 0, 0, 0.6);
}
// ------------------------------------------------------------ CONTROL
const INPUT = { keys: {}, mouse: {}, dx: 0, dy: 0 };
let F3 = false, F3B = false, F3G = false, hudHidden = false, perspective = 0, lastSpace = 0, lastW = 0;
function actionFor(code) { for (const a in SETTINGS.keys) if (SETTINGS.keys[a] === code) return a; return null; }
function held(action) { const c = SETTINGS.keys[action]; return c && (INPUT.keys[c] || INPUT.mouse[c]); }
function lockPointer() { if (G.mode === 'game' && !UI.open && !G.paused && !$('chatIn').classList.contains('on') && !G.player.dead) { const cv = $('gl'); try { const r = cv.requestPointerLock && cv.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => { const r2 = cv.requestPointerLock(); if (r2 && r2.catch) r2.catch(() => { }); }); } catch (e) { } } }
function onKeyDown(e) {
  if (G.mode !== 'game') return;
  if ($('chatIn').classList.contains('on')) { if (e.code === 'Escape') { closeChat(); e.preventDefault(); } return; }
  const a = actionFor(e.code);
  if (e.code === 'F3' || a === 'debug') { e.preventDefault(); if (!e.repeat && !INPUT.keys.F3) { F3 = !F3; setF3Display(); } INPUT.keys.F3 = true; INPUT.f3used = false; return; }
  if (INPUT.keys.F3 && !INPUT.f3used && /^Key[BGNQ]$/.test(e.code)) { F3 = !F3; setF3Display(); }
  if (INPUT.keys.F3) { if (e.code === 'KeyB') { F3B = !F3B; INPUT.f3used = true; chatMsg('Cajas de colisión: ' + (F3B ? 'visibles' : 'ocultas')); } if (e.code === 'KeyG') { F3G = !F3G; INPUT.f3used = true; chatMsg('Bordes de chunk: ' + (F3G ? 'visibles' : 'ocultos')); } if (e.code === 'KeyN') { INPUT.f3used = true; setGameMode(G.gameMode === 'spectator' ? 'creative' : 'spectator'); } if (e.code === 'KeyQ') { INPUT.f3used = true; chatMsg('F3+B: cajas  F3+G: chunks  F3+N: espectador'); } e.preventDefault(); return; }
  if (e.code === 'Escape') { e.preventDefault(); if (UI.open) closeScreen(); else if (G.paused) { if ($('sOptions').classList.contains('on') || $('sControls').classList.contains('on')) { waitingKey = null; showScreen('sPause'); } else pauseGame(false); } else if ($('sCredits').classList.contains('on')) { hideScreens(); lockPointer(); } else if (!G.player.dead) pauseGame(true); return; }
  if (UI.open) {
    if (a === 'inventory' && !(document.activeElement && document.activeElement.tagName === 'INPUT')) { closeScreen(); e.preventDefault(); }
    if (/^Digit[1-9]$/.test(e.code) && UI.hover && !UI.hover.palette && UI.hover.get) { const i = +e.code[5] - 1; const s = UI.hover; const a1 = s.get(), b1 = G.player.inv[i]; s.set(b1); G.player.inv[i] = a1; refreshInvUI(); }
    if (a === 'drop' && UI.hover && UI.hover.get && !UI.hover.palette) { const s = UI.hover.get(); if (s) { const n = e.ctrlKey ? s.c : 1; dropItem(G.player.dim, G.player.x, G.player.eye - 0.3, G.player.z, { ...s, c: n }, -Math.sin(G.player.yaw) * 4, 2, -Math.cos(G.player.yaw) * 4, 40); s.c -= n; if (s.c <= 0) UI.hover.set(null); refreshInvUI(); } }
    return;
  }
  if (G.paused) return;
  INPUT.keys[e.code] = true;
  if (e.code === 'Tab') e.preventDefault();
  if (/^Digit[1-9]$/.test(e.code)) { G.player.sel = +e.code[5] - 1; updateHUD(); showItemName(); }
  switch (a) {
    case 'inventory': openScreen(G.gameMode === 'creative' ? 'creative' : 'inv'); break;
    case 'drop': { const p = G.player; const s = p.held(); if (s) { const n = e.ctrlKey ? s.c : 1; dropItem(p.dim, p.x, p.eye - 0.3, p.z, { ...s, c: n }, -Math.sin(p.yaw) * Math.cos(p.pitch) * 5, Math.sin(p.pitch) * 5 + 1.5, -Math.cos(p.yaw) * Math.cos(p.pitch) * 5, 40); s.c -= n; if (s.c <= 0) p.inv[p.sel] = null; p.swing = 1; updateHUD(); } break; }
    case 'chat': openChat(''); e.preventDefault(); break;
    case 'command': openChat('/'); e.preventDefault(); break;
    case 'perspective': perspective = (perspective + 1) % 3; e.preventDefault(); break;
    case 'hideHud': hudHidden = !hudHidden; $('hud').style.display = hudHidden ? 'none' : 'block'; e.preventDefault(); break;
    case 'jump': { const now = performance.now(); if ((G.gameMode === 'creative') && now - lastSpace < 300) { G.player.flying = !G.player.flying; G.player.vy = 0; } lastSpace = now; const p = G.player; const el = p.armor[1] && p.armor[1].id === ID.elytra; if (el && !p.onGround && !p.flying && !p.inWater && p.vy < 0 && !p.gliding) { p.gliding = true; } break; }
    case 'forward': { const now = performance.now(); if (now - lastW < 250) INPUT.sprintToggle = true; lastW = now; break; }
    case 'ragdoll': if (!INPUT.keys.F3 && typeof playerRagdollToggle === 'function') playerRagdollToggle(); break;
  }
  if (e.code === 'F2') { e.preventDefault(); screenshot(); }
  if (e.code === 'F11') { e.preventDefault(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().then(() => { try { navigator.keyboard && navigator.keyboard.lock(); } catch (err) { } }).catch(() => { }); }
}
function setF3Display() { const v = F3 && G.mode === 'game' ? 'block' : 'none'; $('debugL').style.display = $('debugR').style.display = v; dbgT = 0; }
function onKeyUp(e) {
  if (e.code === 'F3' || actionFor(e.code) === 'debug') INPUT.keys.F3 = false;
  INPUT.keys[e.code] = false; if (actionFor(e.code) === 'forward') INPUT.sprintToggle = false;
}
function screenshot() { const el = document.createElement('a'); try { requestAnimationFrame(() => { el.href = $('gl').toDataURL('image/png'); el.download = 'minecraft2_' + Date.now() + '.png'; el.click(); chatMsg('Captura guardada'); }); } catch (e) { } }
// chat
function openChat(pre) { const el = $('chatIn'); el.classList.add('on'); el.value = pre; document.exitPointerLock && document.exitPointerLock(); $('chatLog').classList.add('open'); setTimeout(() => el.focus(), 0); }
function closeChat() { const el = $('chatIn'); el.classList.remove('on'); el.blur(); $('chatLog').classList.remove('open'); lockPointer(); }
// ------------------------------------------------------------ minar / usar
const MINE = { target: null, prog: 0, stage: -1, cool: 0, useCool: 0, attackCool: 0 };
function lookDir(p) { return [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)]; }
function currentTarget() {
  const p = G.player; const w = p.world; const d = lookDir(p); const reach = G.gameMode === 'creative' ? 5.5 : 4.5;
  const hit = raycast(w, p.x, p.eye, p.z, d[0], d[1], d[2], reach, false);
  const ent = rayEntity(p.x, p.eye, p.z, d[0], d[1], d[2], Math.min(reach - 1, hit ? hit.t : reach), p.dim);
  if (ent) return { ent: ent.e, t: ent.t };
  return hit;
}
function attackEntity(e) {
  const p = G.player; const s = p.held(); const d = s ? REG[s.id] : null; let dmg = d && d.dmg ? d.dmg : 1; const sh = enchLvl(s, 'sharpness'); if (sh) dmg += 0.5 * sh + 0.5; const fa = enchLvl(s, 'fire_aspect'); if (fa && e.type !== 'player') e.fire = Math.max(e.fire || 0, 80 * fa);
  if (G.gameMode === 'spectator') return;
  const crit = !p.onGround && p.vy < 0 && !p.inWater; if (crit) { dmg *= 1.5; for (let i = 0; i < 12; i++) P_({ x: e.x, y: e.y + e.h * 0.7, z: e.z, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 5, life: 0.5, size: 0.1, layer: TEX.spark, add: true, emis: 2, r: 0.9, g: 0.9, b: 0.6, grav: 10 }); }
  if (s && s.id === ID.mace && p.fallDist > 1.5) { dmg += Math.floor(p.fallDist) * 2; p.fallDist = 0; p.vy = 4; explosionFX(p.dim, e.x, e.y, e.z, 0.5); }
  const kb = p.sprinting ? 9 : 5; const kx = -Math.sin(p.yaw) * kb, kz = -Math.cos(p.yaw) * kb;
  if (e.type === 'end_crystal') { if (G.net && G.net.role === 'client') netSend({ t: 'atk', id: e.hostId || e.id, a: 100 }); else e.hp = 0; return; }
  hurtEntity(e, dmg, p, kx * 0.4, 4, kz * 0.4);
  if (e.type === 'player' && e.remotePlayer === undefined && e.proxy) { }
  if (d && d.dur) damageItem(p.inv, p.sel, d.tool && d.tool.type === 'sword' ? 1 : 2);
  p.exh += 0.1; if (s && s.id === ID.trident) { }
  playSound(crit ? 'crit' : 'hit', e.x, e.y, e.z, 0.6);
}
function placeBlock(hit, stack) {
  const p = G.player; const w = p.world; const d = REG[stack.id]; let id = stack.id; if (!d.isBlock && d.places) id = ID[d.places];
  const bd = REG[id]; if (!bd) return false;
  let tx = hit.x, ty = hit.y, tz = hit.z; const tb = w.get(tx, ty, tz); const tbd = REG[tb];
  if (id === ID.snow && tb === ID.snow) { const m = Math.max(1, w.getMeta(tx, ty, tz)); if (m < 8) { setBlockNet(w, tx, ty, tz, m === 7 ? ID.snow_block : ID.snow, m === 7 ? 0 : m + 1); consumeHeld(p); return true; } }
  if ((id === ID.stone_slab || id === ID.oak_slab) && tb === id && hit.n[1] === 1) { setBlockNet(w, tx, ty, tz, id === ID.stone_slab ? ID.smooth_stone : ID.oak_planks); consumeHeld(p); return true; }
  if (!(tbd && tbd.replace && !(tb === ID.snow && w.getMeta(tx, ty, tz) > 1))) { tx += hit.n[0]; ty += hit.n[1]; tz += hit.n[2]; }
  const cur = w.get(tx, ty, tz); if (cur < 0 || ty < 0 || ty >= w.H) return false; if (cur !== 0 && !(REG[cur].replace)) return false;
  if (cur === ID.fire) return false; // el fuego solo se apaga con agua o con el extintor
  let meta = 0;
  if (bd.orient) { const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw); meta = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 3 : 1) : (dz > 0 ? 0 : 2); }
  if (bd.log) meta = hit.n[1] ? 0 : hit.n[0] ? 1 : 2;
  if (id === ID.torch || id === ID.soul_torch || id === ID.redstone_torch) { if (hit.n[1] === -1) return false; if (hit.n[1] === 0) meta = hit.n[2] === -1 ? 1 : hit.n[0] === 1 ? 2 : hit.n[2] === 1 ? 3 : 4; }
  if (bd.leaves) meta = 1;
  if (bd.shape && bd.shape !== 'fence' && bd.shape !== 'wall' && bd.shape !== 'pane') { const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw); meta = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 2 : 0); if ((bd.shape === 'stairs' || bd.shape === 'trapdoor') && hit.n[1] === -1) meta |= bd.shape === 'stairs' ? 4 : 8; }
  if (bd.shape === 'door') { const up = w.get(tx, ty + 1, tz); if (up !== 0 && !(up > 0 && REG[up].replace)) return false; const below = w.get(tx, ty - 1, tz); if (!(below > 0 && REG[below].solid)) return false; }
  if (id === ID.pointed_dripstone && hit.n[1] === -1) meta = 1;
  if (id === ID.snow) meta = 1;
  if (bd.solid && bd.render !== 'cross') { // no colocar dentro de entidades
    const box = bd.box ? bd.box.map(v => v / 16) : [0, 0, 0, 1, 1, 1];
    for (const e of [p, ...G.entities.values()]) { if (e.dim !== p.dim || e.type === 'item' || e instanceof Projectile || e.removed) continue; const hw = e.w / 2; if (e.x + hw > tx + box[0] && e.x - hw < tx + box[3] && e.z + hw > tz + box[2] && e.z - hw < tz + box[5] && e.y < ty + box[4] && e.y + e.h > ty + box[1]) return false; }
  }
  const tmp = { x: tx, y: ty, z: tz };
  if ((bd.render === 'cross' || bd.crop) && !bd.inWater) { const below = w.get(tx, ty - 1, tz); const ok = bd.crop ? below === ID.farmland : bd.sapling || bd.name.includes('flower') || [ID.poppy, ID.dandelion, ID.blue_orchid, ID.cornflower, ID.oxeye_daisy, ID.tall_grass, ID.fern].includes(id) ? [ID.grass_block, ID.dirt, ID.moss_block, ID.mud, ID.farmland, ID.snowy_grass, ID.podzol].includes(below) : id === ID.sugar_cane ? [ID.sand, ID.dirt, ID.grass_block, ID.sugar_cane].includes(below) : (id === ID.crimson_fungus || id === ID.warped_fungus) ? [ID.crimson_nylium, ID.warped_nylium, ID.soul_soil, ID.netherrack].includes(below) : below > 0 && REG[below].solid; if (!ok) return false; }
  if (id === ID.cactus) { const below = w.get(tx, ty - 1, tz); if (below !== ID.sand && below !== ID.red_sand && below !== ID.cactus) return false; }
  setBlockNet(w, tx, ty, tz, id, meta); if (bd.shape === 'door') setBlockNet(w, tx, ty + 1, tz, id, meta | 8);
  playSound('place', tx, ty, tz, 0.8, id); p.swing = 1; consumeHeld(p);
  return true;
}
function useItem(hit) {
  const p = G.player; const w = p.world; const s = p.held(); const d = s ? REG[s.id] : null;
  // interacción con entidades
  if (hit && hit.ent) {
    const e = hit.ent;
    if (s && s.id === ID.shears && e.type === 'sheep' && !e.sheared) { e.sheared = true; dropItem(e.dim, e.x, e.y + 1, e.z, { id: ID.white_wool, c: 1 + (Math.random() * 3 | 0) }); damageItem(p.inv, p.sel, 1); return true; }
    if (s && s.id === ID.bucket && (e.type === 'cow' || e.type === 'goat')) { consumeHeld(p); giveItem(p, { id: ID.milk_bucket, c: 1 }); return true; }
    if (e.type === 'villager') { openTrade(e); return true; }
    if (s && s.id === ID.name_tag) { e.persist = true; e.name = 'Mascota'; consumeHeld(p); return true; }
  }
  // interacción con bloques
  if (hit && !hit.ent && !(INPUT.keys[SETTINGS.keys.sneak] && s)) {
    const b = hit.id; const bd = REG[b]; const key = p.dim + ':' + hit.x + ',' + hit.y + ',' + hit.z;
    if (bd.ui === 'craft') { openScreen('craft'); return true; }
    if (bd.ui === 'furnace') { openContainer(key, 'furnace', hit, b); return true; }
    if (bd.ui === 'chest') { openContainer(key, 'chest', hit, b); return true; }
    if (bd.ui === 'ender') { openScreen('ender', { c: { items: p.ender }, title: 'Cofre de ender' }); playSound('chest_open', hit.x, hit.y, hit.z, 0.5); return true; }
    if (bd.ui === 'smith') { openScreen('smith'); return true; }
    if (bd.ui === 'anvil') { openScreen('anvil'); return true; }
    if (bd.ui === 'enchant') { openScreen('enchant', { shelves: countShelves(w, hit.x, hit.y, hit.z) }); return true; }
    if (bd.ui === 'bed') { useBed(hit); return true; }
    if (bd.ui === 'vault') { if (s && s.id === ID.ominous_key && w.getMeta(hit.x, hit.y, hit.z) === 0) { consumeHeld(p); setBlockNet(w, hit.x, hit.y, hit.z, ID.vault, 1); for (const it of rollLoot('vault', Math.random() * 1e9 | 0)) if (it) dropItem(p.dim, hit.x + 0.5, hit.y + 1.2, hit.z + 0.5, it, 0, 3, 0); playSound('levelup', hit.x, hit.y, hit.z, 1); } else chatMsg(w.getMeta(hit.x, hit.y, hit.z) ? 'Esta bóveda ya fue abierta.' : 'Necesitas una llave de desafío.', '#ccc'); return true; }
    if (b === ID.note_block) { playSound('note', hit.x, hit.y, hit.z, 1, (Math.random() * 24) | 0); P_({ x: hit.x + 0.5, y: hit.y + 1.2, z: hit.z + 0.5, vy: 1, life: 0.8, size: 0.2, layer: TEX.spark, add: true, emis: 3, r: Math.random(), g: 1, b: Math.random() }); return true; }
    if (bd.shape === 'door' || bd.shape === 'trapdoor' || bd.shape === 'gate') { const m = w.getMeta(hit.x, hit.y, hit.z) ^ 4; setBlockNet(w, hit.x, hit.y, hit.z, b, m); if (bd.shape === 'door') { const oy = m & 8 ? -1 : 1; if (w.get(hit.x, hit.y + oy, hit.z) === b) setBlockNet(w, hit.x, hit.y + oy, hit.z, b, m ^ 8); } playSound(m & 4 ? 'chest_open' : 'chest_close', hit.x, hit.y, hit.z, 0.5); return true; }
    if (b === ID.lever) { setBlockNet(w, hit.x, hit.y, hit.z, b, w.getMeta(hit.x, hit.y, hit.z) ^ 1); playSound('click', hit.x, hit.y, hit.z, 0.5); return true; }
    if (b === ID.tnt && s && (s.id === ID.flint_and_steel || s.id === ID.fire_charge)) { setBlockNet(w, hit.x, hit.y, hit.z, 0); igniteTNT(w, hit.x, hit.y, hit.z); damageItem(p.inv, p.sel, 1); return true; }
    if (b === ID.end_portal_frame && s && s.id === ID.eye_of_ender) { setBlockNet(w, hit.x, hit.y, hit.z, ID.end_portal_frame_eye, w.getMeta(hit.x, hit.y, hit.z)); consumeHeld(p); for (let i = 0; i < 12; i++) P_({ x: hit.x + 0.5, y: hit.y + 1, z: hit.z + 0.5, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 1, size: 0.12, layer: TEX.portal_p, add: true, emis: 3, r: 0.4, g: 1, b: 0.6 }); checkEndPortalFrame(w, hit.x, hit.y, hit.z); return true; }
  }
  if (!s) return false;
  // objetos
  if (d.food && (p.food < 20 || d.regen || s.id === ID.chorus_fruit || G.gameMode === 'creative')) { p.eatT = 0.01; return 'hold'; }
  if (d.milk) { p.effects = {}; consumeHeld(p); giveItem(p, { id: ID.bucket, c: 1 }); playSound('drink', p.x, p.y, p.z, 0.8); return true; }
  if (d.bow) { if (G.gameMode === 'creative' || countItem(p, ID.arrow) > 0) { p.bowT = 0.01; return 'hold'; } return false; }
  if (d.trident) { p.bowT = 0.01; return 'hold'; }
  if (d.spyglass) { p.spy = true; return 'hold'; }
  if (d.extinguisher) { sprayExtinguisher(p); return 'hold'; }
  if (d.throwable) {
    const dir = lookDir(p);
    if (d.throwable === 'eye') {
      if (p.dim !== 'overworld') return true; const sh = w.gen.structuresNear('stronghold', p.x, p.z); if (!sh) return true;
      const e = shoot('eye', p.dim, p.x, p.eye, p.z, 0, 0, 0, p, { tx: sh.x, tz: sh.z }); if (G.net && G.net.role === 'client') { const pr = new Projectile('eye', p.dim, p.x, p.eye, p.z, 0, 0, 0, p); pr.tx = sh.x; pr.tz = sh.z; G.entities.set(pr.id, pr); }
      const dist = Math.round(Math.hypot(sh.x - p.x, sh.z - p.z)); const ang = Math.atan2(sh.z - p.z, sh.x - p.x) * 180 / Math.PI;
      const dirs = ['este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste', 'norte', 'noreste']; const di = dirs[((Math.round(ang / 45) % 8) + 8) % 8];
      chatMsg('El ojo de ender vuela hacia el ' + di + ' (~' + dist + ' bloques)', '#8fc');
      consumeHeld(p); playSound('throw', p.x, p.y, p.z, 0.6); return true;
    }
    const sp = d.throwable === 'pearl' ? 25 : 22; shoot(d.throwable, p.dim, p.x + dir[0] * 0.4, p.eye - 0.1, p.z + dir[2] * 0.4, dir[0] * sp + p.vx, dir[1] * sp + 2, dir[2] * sp + p.vz, p);
    consumeHeld(p); playSound('throw', p.x, p.y, p.z, 0.6); p.swing = 1; return true;
  }
  if (d.rocket) { if (p.gliding) { p.boost = 1.2; consumeHeld(p); playSound('firework', p.x, p.y, p.z, 0.8); return true; } if (hit && !hit.ent) { const x = hit.x + 0.5 + hit.n[0], y = hit.y + 0.5 + hit.n[1], z = hit.z + 0.5 + hit.n[2]; fireworkFX(p.dim, x, y, z); consumeHeld(p); return true; } return false; }
  if (d.bucket !== undefined) {
    const dir = lookDir(p);
    if (d.bucket === 0) { const h = raycast(w, p.x, p.eye, p.z, dir[0], dir[1], dir[2], 5, true); if (h && REG[h.id].liquid && w.getMeta(h.x, h.y, h.z) === 0) { setBlockNet(w, h.x, h.y, h.z, 0); if (G.gameMode !== 'creative') { consumeHeld(p); giveItem(p, { id: h.id === ID.water ? ID.water_bucket : ID.lava_bucket, c: 1 }); } playSound('bucket', h.x, h.y, h.z, 0.8); return true; } return false; }
    if (!hit || hit.ent) return false; const liq = d.bucket === 1 ? ID.water : ID.lava;
    let tx = hit.x, ty = hit.y, tz = hit.z; const tb = w.get(tx, ty, tz); if (!(REG[tb].replace && !REG[tb].liquid)) { tx += hit.n[0]; ty += hit.n[1]; tz += hit.n[2]; }
    const cur = w.get(tx, ty, tz); if (cur !== 0 && !REG[cur].replace) return false;
    if (p.dim === 'nether' && liq === ID.water) { fizz(w, tx, ty, tz); } else setBlockNet(w, tx, ty, tz, liq, 0);
    if (G.gameMode !== 'creative') p.inv[p.sel] = { id: ID.bucket, c: 1 }; playSound('bucket_empty', tx, ty, tz, 0.8); updateHUD(); return true;
  }
  if (!hit || hit.ent) return false;
  if (s.id === ID.flint_and_steel) {
    const tx = hit.x + hit.n[0], ty = hit.y + hit.n[1], tz = hit.z + hit.n[2];
    if (w.get(tx, ty, tz) === 0) { if (!tryLightPortal(w, tx, ty, tz)) setBlockNet(w, tx, ty, tz, ID.fire); damageItem(p.inv, p.sel, 1); playSound('ignite', tx, ty, tz, 0.8); return true; }
    return false;
  }
  if (s.id === ID.bone_meal) { const b = hit.id; if (REG[b].sapling) { if (Math.random() < 0.45) growSapling(w, hit.x, hit.y, hit.z, b); } else if (REG[b].crop) setBlockNet(w, hit.x, hit.y, hit.z, b, Math.min(7, w.getMeta(hit.x, hit.y, hit.z) + 2 + (Math.random() * 3 | 0))); else if (b === ID.grass_block) { for (let i = 0; i < 12; i++) { const x = hit.x + (Math.random() * 7 | 0) - 3, z = hit.z + (Math.random() * 7 | 0) - 3; if (w.get(x, hit.y, z) === ID.grass_block && w.get(x, hit.y + 1, z) === 0) setBlockNet(w, x, hit.y + 1, z, Math.random() < 0.8 ? ID.tall_grass : [ID.poppy, ID.dandelion][Math.random() * 2 | 0]); } } else return false; consumeHeld(p); for (let i = 0; i < 10; i++) P_({ x: hit.x + Math.random(), y: hit.y + 1 + Math.random() * 0.5, z: hit.z + Math.random(), vy: 0.5, life: 1, size: 0.1, layer: TEX.spark, add: true, emis: 2, r: 0.4, g: 1, b: 0.4 }); return true; }
  if (d.tool && d.tool.type === 'hoe' && (hit.id === ID.grass_block || hit.id === ID.dirt || hit.id === ID.dirt_path) && hit.n[1] === 1 && w.get(hit.x, hit.y + 1, hit.z) === 0) { setBlockNet(w, hit.x, hit.y, hit.z, ID.farmland); damageItem(p.inv, p.sel, 1); playSound('place', hit.x, hit.y, hit.z, 0.6, ID.dirt); return true; }
  if (d.tool && d.tool.type === 'shovel' && hit.id === ID.grass_block && hit.n[1] === 1 && w.get(hit.x, hit.y + 1, hit.z) === 0) { setBlockNet(w, hit.x, hit.y, hit.z, ID.dirt_path); damageItem(p.inv, p.sel, 1); playSound('place', hit.x, hit.y, hit.z, 0.6, ID.dirt); return true; }
  if (d.tool && d.tool.type === 'axe' && REG[hit.id].log) { return false; }
  if (d.isBlock || d.places) return placeBlock(hit, s);
  return false;
}
function igniteTNT(w, x, y, z) {
  if (G.net && G.net.role === 'client') { netSend({ t: 'tnt', d: w.dim, x, y, z }); return; }
  const t = new Projectile('tnt', w.dim, x + 0.5, y, z + 0.5, 0, 2, 0); t.fuse = 80; t.grav = 20; t.w = 0.98; t.h = 0.98; G.entities.set(t.id, t); playSound('fuse', x, y, z, 1);
}
function fireworkFX(dim, x, y, z) {
  const col = [[1, 0.3, 0.3], [0.3, 1, 0.4], [0.4, 0.6, 1], [1, 0.9, 0.3], [1, 0.4, 1]][Math.random() * 5 | 0]; playSound('firework', x, y, z, 0.8);
  const ty = y + 12 + Math.random() * 6; for (let i = 0; i < 20; i++) P_({ x, y: y + i * 0.6, z, vy: 0.5, life: 0.3 + i * 0.03, size: 0.12, layer: TEX.spark, add: true, emis: 3, r: 1, g: 0.8, b: 0.5 });
  setTimeoutTick(14, () => { R.plights.push({ x, y: ty, z, r: 20, c: col.map(v => v * 4), life: 0.6, max: 0.6 }); for (let i = 0; i < 120; i++) { const a = Math.random() * 6.28, b = Math.acos(Math.random() * 2 - 1), s = 8 + Math.random() * 2; P_({ x, y: ty, z, vx: Math.cos(a) * Math.sin(b) * s, vy: Math.cos(b) * s, vz: Math.sin(a) * Math.sin(b) * s, life: 1.2 + Math.random() * 0.6, size: 0.15, layer: TEX.spark, add: true, emis: 6, r: col[0], g: col[1], b: col[2], grav: 4, drag: 1.5 }); } playSound('explode', x, ty, z, 0.3); });
}
function useBed(hit) {
  const p = G.player; const w = p.world;
  if (p.dim !== 'overworld') { setBlockNet(w, hit.x, hit.y, hit.z, 0); explode(w, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 5, true, null); if (G.net && G.net.role === 'client') netSend({ t: 'boom', d: p.dim, x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5, p: 5 }); return; }
  p.spawn = { x: hit.x + 0.5, y: hit.y + 1, z: hit.z + 0.5 }; chatMsg('Punto de reaparición establecido', '#ccc');
  const t = G.time % 24000; if (t < 12542 && (G.rainLevel || 0) < 0.5) { chatMsg('Solo puedes dormir de noche o durante tormentas.', '#ccc'); return; }
  for (const e of G.entities.values()) if (e instanceof Mob && e.def.hostile && e.dim === p.dim && Math.abs(e.x - p.x) < 8 && Math.abs(e.y - p.y) < 5 && Math.abs(e.z - p.z) < 8) { chatMsg('No puedes descansar ahora, hay monstruos cerca.', '#f88'); return; }
  if (G.net && G.net.role === 'client') { netSend({ t: 'sleep' }); chatMsg('Durmiendo... (esperando a los demás jugadores)', '#ccc'); return; }
  const fade = $('fxSleep'); fade.style.opacity = 1; setTimeout(() => { G.time = Math.ceil(G.time / 24000) * 24000 + 0; G.rain = 0; if (G.net) netBroadcast({ t: 'time', v: G.time }); fade.style.opacity = 0; }, 1600);
}
function openContainer(key, kind, hit, block) {
  const w = G.player.world;
  if (G.net && G.net.role === 'client') { netSend({ t: 'co', k: key, kind, b: block }); UI.pendingKey = key; UI.pendingKind = kind; UI.pendingBlock = block; return; }
  const c = getContainer(w, key, kind, hit.x, hit.y, hit.z);
  openScreen(kind, { c, key, block, title: REG[block].disp });
  if (block === ID.chest || block === ID.barrel) playSound('chest_open', hit.x, hit.y, hit.z, 0.5);
}
function getContainer(w, key, kind, x, y, z) {
  let c = G.containers[key];
  if (!c) {
    c = kind === 'furnace' ? { type: 'furnace', items: [null, null, null], burn: 0, burnMax: 0, cook: 0 } : { type: 'chest', items: new Array(27).fill(null) };
    const ch = w.chunk(x >> 4, z >> 4); const idx = (x & 15) | ((z & 15) << 4) | (y << 8);
    if (ch && ch.loot[idx]) { c.items = rollLoot(ch.loot[idx], hashStr(key) ^ G.seed); delete ch.loot[idx]; ch.modified = true; }
    G.containers[key] = c;
  }
  return c;
}
// ------------------------------------------------------------ actualización por fotograma del jugador
function updateInteraction(dt) {
  const p = G.player; if (p.dead || UI.open || G.paused) { MINE.target = null; return; }
  const w = p.world; const tgt = currentTarget(); G.hit = tgt;
  if (MINE.cool > 0) MINE.cool -= dt; if (MINE.useCool > 0) MINE.useCool -= dt; if (MINE.attackCool > 0) MINE.attackCool -= dt;
  const attack = held('attack'), use = held('use');
  if (p.swing > 0) { p.swing += dt * 6; if (p.swing > 1) p.swing = 0; }
  // atacar / minar
  if (attack && G.gameMode !== 'spectator') {
    if (tgt && tgt.ent) { if (MINE.attackCool <= 0) { attackEntity(tgt.ent); MINE.attackCool = 0.35; p.swing = 0.01; } MINE.target = null; }
    else if (tgt) {
      const key = tgt.x + ',' + tgt.y + ',' + tgt.z;
      if (MINE.target !== key) { MINE.target = key; MINE.prog = 0; }
      const bd = REG[tgt.id];
      if (G.gameMode === 'creative') { if (MINE.cool <= 0) { const s = p.held(); if (!(s && REG[s.id].tool && REG[s.id].tool.type === 'sword')) { breakBlock(tgt); MINE.cool = 0.2; } } }
      else if (G.gameMode !== 'adventure') {
        const bt = breakTime(bd, p.held(), p); MINE.prog += dt / bt; if (!p.swing) p.swing = 0.01;
        MINE.stage = Math.min(9, Math.floor(MINE.prog * 10));
        if (Math.random() < dt * 8) { blockParticles(w, tgt.x, tgt.y, tgt.z, tgt.id, 1, 1.5); }
        if ((MINE.digSnd = (MINE.digSnd || 0) + dt) > 0.25) { MINE.digSnd = 0; playSound('dig', tgt.x, tgt.y, tgt.z, 0.3, tgt.id); }
        if (MINE.prog >= 1) { breakBlock(tgt); MINE.target = null; MINE.prog = 0; MINE.cool = 0.25; }
      }
    }
  } else { MINE.target = null; MINE.prog = 0; }
  if (!attack) MINE.attackCool = Math.min(MINE.attackCool, 0);
  // usar
  const s = p.held();
  if (use) {
    if (p.eatT > 0 && s && REG[s.id].food) { p.eatT += dt; if (Math.random() < dt * 8) { blockParticles(w, p.x, p.eye - 0.5, p.z, 0, 0); P_({ x: p.x - Math.sin(p.yaw) * 0.4, y: p.eye - 0.2, z: p.z - Math.cos(p.yaw) * 0.4, vx: (Math.random() - 0.5) * 2, vy: 1.5, vz: (Math.random() - 0.5) * 2, life: 0.5, size: 0.08, layer: REG[s.id].icon, uv: [0.3, 0.3, 0.6, 0.6], grav: 15 }); playSound('eat', p.x, p.y, p.z, 0.4); } if (p.eatT > 1.6) { const f = REG[s.id].food; p.food = Math.min(20, p.food + f[0]); p.sat = Math.min(p.food, p.sat + f[1]); if (REG[s.id].regen) { p.effects.regen = 100; p.effects.absorb = 2400; } if (s.id === ID.chorus_fruit) { const ox = p.x + (Math.random() - 0.5) * 16, oz = p.z + (Math.random() - 0.5) * 16; const oy = w.surfaceY(Math.floor(ox), Math.floor(oz)) + 1; if (oy > 1) { p.x = ox; p.y = oy; p.z = oz; } } if (s.id === ID.mushroom_stew) { p.inv[p.sel] = null; giveItem(p, { id: ID.glass_bottle, c: 0 }); } consumeHeld(p); p.eatT = 0; playSound('burp', p.x, p.y, p.z, 0.5); MINE.useCool = 0.3; updateHUD(); } }
    else if (p.bowT > 0) { p.bowT += dt; }
    else if (MINE.useCool <= 0) { const r = useItem(tgt); if (r) { MINE.useCool = r === 'hold' ? 0 : 0.22; if (r === true) p.swing = p.swing || 0.01; } else MINE.useCool = 0.1; }
  } else {
    if (p.bowT > 0) { const pw = Math.min(1, p.bowT / 1); p.bowT = 0; if (pw > 0.1) { const dir = lookDir(p); if (s && REG[s.id].trident) { shoot('trident', p.dim, p.x, p.eye - 0.1, p.z, dir[0] * 30 * pw, dir[1] * 30 * pw, dir[2] * 30 * pw, p, { itemD: (s.d || 0) + 1 }); if (G.gameMode !== 'creative') p.inv[p.sel] = null; } else { const a = shoot('arrow', p.dim, p.x, p.eye - 0.1, p.z, dir[0] * 55 * pw, dir[1] * 55 * pw, dir[2] * 55 * pw, p, { power: pw * (1 + 0.25 * enchLvl(s, 'power')), pickable: G.gameMode !== 'creative' }); if (G.gameMode !== 'creative') takeItem(p, ID.arrow, 1); damageItem(p.inv, p.sel, 1); } playSound('bow', p.x, p.y, p.z, 0.8); updateHUD(); } }
    p.eatT = 0; p.spy = false; MINE.useCool = Math.min(MINE.useCool, 0);
  }
  // elegir bloque
  if (held('pick') && !MINE.picked && tgt && !tgt.ent) { MINE.picked = true; const id = tgt.id === ID.furnace_lit ? ID.furnace : tgt.id; const idx = p.inv.findIndex(s => s && s.id === id); if (idx >= 0 && idx < 9) p.sel = idx; else if (G.gameMode === 'creative') { const free = p.inv.slice(0, 9).findIndex(s => !s); p.inv[free >= 0 ? free : p.sel] = { id, c: 1 }; if (free >= 0) p.sel = free; } else if (idx >= 9) { const t = p.inv[p.sel]; p.inv[p.sel] = p.inv[idx]; p.inv[idx] = t; } updateHUD(); showItemName(); }
  if (!held('pick')) MINE.picked = false;
}
function breakBlock(t) {
  const p = G.player; const w = p.world; const id = t.id; const s = p.held();
  blockParticles(w, t.x, t.y, t.z, id, 18, 3); playSound('break', t.x, t.y, t.z, 0.9, id);
  let repl = 0; if (id === ID.ice && G.gameMode !== 'creative') repl = ID.water; const bd = REG[id];
  if (bd.inWater) repl = ID.water;
  setBlockNet(w, t.x, t.y, t.z, repl, 0);
  if (id === ID.nether_portal) return;
  dropBlockItems(w, t.x, t.y, t.z, id, s);
  if (s && REG[s.id].dur && bd.hard > 0) damageItem(p.inv, p.sel, REG[s.id].tool && REG[s.id].tool.type === 'sword' ? 2 : 1);
  p.exh += 0.005; updateHUD();
  if (id === ID.sculk_sensor || (bd.name === 'sculk')) { }
}
// ------------------------------------------------------------ texto F3
function debugText(fps) {
  const p = G.player; const w = p.world; const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
  const L = w.light(bx, by + 1, bz); const facingN = ['sur (Hacia +Z)', 'oeste (Hacia -X)', 'norte (Hacia -Z)', 'este (Hacia +X)'];
  const yawDeg = ((-p.yaw * 180 / Math.PI) % 360 + 540) % 360 - 180; const fi = ((Math.round(-p.yaw / (Math.PI / 2)) % 4) + 6) % 4;
  const facing = ['norte (Hacia -Z)', 'este (Hacia +X)', 'sur (Hacia +Z)', 'oeste (Hacia -X)'][fi];
  const cb = w.gen.caveBiome ? w.gen.caveBiome(bx, by, bz) : -1; const bio = cb >= 0 && by < w.surfaceY(bx, bz) - 6 ? cb : w.biomeAt(bx, bz);
  const tgt = G.hit; const yo = w.yOff;
  let ents = 0; for (const e of G.entities.values()) if (e.dim === p.dim) ents++;
  const day = Math.floor(G.time / 24000); const diff = (G.difficulty * 0.75 + (day > 20 ? 1 : day / 20)).toFixed(2);
  const left = [
    'Minecraft 2 v2.0 (HTML5/WebGL2' + (G.net ? (G.net.role === 'host' ? '/anfitrión' : '/cliente') : '') + ')',
    `${fps} fps (${CHUNK_STATS.updates} actualizaciones de chunk) T: ${SETTINGS.rd * 16 > 200 ? 'inf' : SETTINGS.rd} ${['rápido', 'medio', 'detallado', 'ultra'][R.q]}`,
    `${G.net ? 'Servidor integrado en red' : 'Servidor integrado'} @ ${TICK_MS.toFixed(1)} ms ticks, ${G.net ? G.net.peers || 0 : 0} jugadores`,
    `C: ${R.stats.chunks}/${w.chunks.size} D: ${SETTINGS.rd}, tris: ${Math.round(R.stats.tris / 1000)}k, dibujos: ${R.stats.draws}`,
    `E: ${ents}, partículas: ${G.particles.length}`,
    `${DIMS[p.dim].name} FC: ${[...w.chunks.values()].filter(c => c.modified).length}`,
    '',
    `XYZ: ${p.x.toFixed(3)} / ${(p.y + yo).toFixed(5)} / ${p.z.toFixed(3)}`,
    `Bloque: ${bx} ${by + yo} ${bz}`,
    `Chunk: ${bx & 15} ${(by + yo) & 15} ${bz & 15} en ${bx >> 4} ${(by + yo) >> 4} ${bz >> 4}`,
    `Mirando: ${facing} (${yawDeg.toFixed(1)} / ${(-p.pitch * 180 / Math.PI).toFixed(1)})`,
    `Luz cliente: ${Math.max(L[0], L[1])} (${L[0]} cielo, ${L[1]} bloque)`,
    `Bioma: minecraft:${BIOMES[bio] ? BIOMES[bio].name : '?'}`,
    `Dificultad local: ${diff} // ${DIFFNAMES[G.difficulty]} (Día ${day})`,
    `Hora: ${String(Math.floor(((G.time + 6000) % 24000) / 1000)).padStart(2, '0')}:${String(Math.floor(((G.time + 6000) % 1000) * 0.06)).padStart(2, '0')}  Clima: ${G.rainLevel > 0.3 ? 'precipitación' : 'despejado'}`,
    `Semilla: ${G.seedStr}  Modo: ${G.gameMode}`,
    `Shader: minecraft2:shaders/${['basico', 'sombras_bloom', 'realista', 'ultra'][R.q]}.glsl`,
    '',
    'Depuración: F3+B cajas, F3+G chunks, F3+N espectador',
    'Para ayuda: pulsa F3 + Q'
  ];
  const mem = performance.memory; const right = [
    `JS: ${navigator.userAgent.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/)?.[0] || 'navegador'} 64bit`,
    mem ? `Mem: ${Math.round(mem.usedJSHeapSize / mem.jsHeapSizeLimit * 100)}% ${Math.round(mem.usedJSHeapSize / 1048576)}/${Math.round(mem.jsHeapSizeLimit / 1048576)}MB` : 'Mem: n/d',
    mem ? `Asignado: ${Math.round(mem.totalJSHeapSize / 1048576)}MB` : '',
    `CPU: ${navigator.hardwareConcurrency || '?'}x núcleos`,
    '',
    `Pantalla: ${R.w}x${R.h} (${R.vendor || 'GPU'})`,
    `${R.gpu}${R.gpuKind === "cpu" ? " [SIN GPU: dibujando con la CPU]" : R.gpuKind ? " [" + R.gpuKind + "]" : ""}`,
    `WebGL 2.0  Sombras: ${R.shadowSize || 'no'}  HDR: ${R.cfb ? 'sí' : 'no'}`,
    '',
  ];
  if (tgt && !tgt.ent) { right.push('Bloque objetivo: ' + tgt.x + ', ' + (tgt.y + yo) + ', ' + tgt.z, 'minecraft:' + REG[tgt.id].name, 'meta: ' + w.getMeta(tgt.x, tgt.y, tgt.z)); }
  if (tgt && tgt.ent) right.push('Entidad objetivo:', 'minecraft:' + tgt.ent.type, 'Vida: ' + Math.ceil(tgt.ent.hp || 0));
  return [left, right];
}
