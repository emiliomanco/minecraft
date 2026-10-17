// ============================================================================
//  Comandos: /tp, /weather, /tick y /kill nuevos (el resto sigue en runCommandBase) y el menú de
//  autocompletado del chat: al escribir "/" aparece la lista de comandos y, después de cada espacio,
//  las opciones del siguiente argumento. Tab completa, ↑/↓ eligen.
// ============================================================================
const CMD_TIMES = ['day', 'noon', 'night', 'midnight', 'sunrise', 'sunset'];
const CMD_MODES = ['survival', 'creative', 'spectator', 'adventure'];
const CMD_EFFECTS = ['speed', 'regeneration', 'jump_boost', 'haste', 'resistance', 'night_vision'];
function cmdPlayers() { const out = []; if (G.player) out.push(G.player.name || 'Jugador'); for (const e of G.entities.values()) if ((e.remotePlayer || (e.proxy && e.type === 'player')) && e.name) out.push(e.name); return out; }
function cmdCoord(axis) { const p = G.player; if (!p) return ['~']; const v = axis === 0 ? p.x : axis === 1 ? p.y + p.world.yOff : p.z; return ['~', String(Math.floor(v))]; }
function cmdItems() { return REG.filter(d => d && d.name).map(d => d.name); }
function cmdStructs() { return typeof STRUCTS !== 'undefined' ? STRUCTS.map(s => s.name) : []; }
// cada comando: lista de argumentos; cada argumento es una lista fija, una función (args) => lista, o un texto de ayuda '<...>'
const CMD_SPEC = {
  help: [],
  gamemode: [CMD_MODES],
  time: [['set', 'add', 'query'], a => a[1] === 'set' ? CMD_TIMES.concat(['1000', '6000', '13000']) : a[1] === 'add' ? ['100', '1000', '6000'] : []],
  weather: [['clear', 'rain', 'thunder'], ['<segundos>', '60', '300', '1200']],
  tp: [a => ['~'].concat(cmdCoord(0).slice(1), cmdPlayers(), ['@s', '@p']), a => /^[~\-\d^]/.test(a[1] || '') ? cmdCoord(1) : ['~'].concat(cmdCoord(0).slice(1), cmdPlayers()), a => /^[~\-\d^]/.test(a[1] || '') ? cmdCoord(2) : cmdCoord(1), a => /^[~\-\d^]/.test(a[1] || '') ? [] : cmdCoord(2)],
  teleport: null,
  give: [cmdItems, ['1', '16', '64']],
  kill: [() => ['@s', '@e', '@e[type=', '@p'].concat(Object.keys(MOB))],
  seed: [],
  summon: [() => Object.keys(MOB), () => cmdCoord(0), () => cmdCoord(1), () => cmdCoord(2)],
  spawnpoint: [],
  difficulty: [['peaceful', 'easy', 'normal', 'hard']],
  locate: [['structure'], cmdStructs],
  clear: [],
  dimension: [['overworld', 'nether', 'end']],
  gamerule: [['keepInventory', 'doWaterDespawn', 'doDaylightCycle', 'doWeatherCycle'], ['true', 'false']],
  effect: [['give'], CMD_EFFECTS, ['30', '60', '300']],
  liquids: [['delete', 'sphere', 'cube'], a => a[1] === 'delete' ? ['all', 'water', 'lava', 'honey', 'milk'] : ['water', 'lava', 'honey', 'milk'], a => a[1] === 'sphere' ? ['<radio>', '2', '3', '4'] : a[1] === 'cube' ? ['<lado>', '2', '4', '6'] : []],
  set: [['cube', 'sphere'], () => ['air'].concat(REG.filter(d => d && d.isBlock && d.name).map(d => d.name))],
  tick: [['freeze', 'unfreeze', 'rate', 'step', 'query', '0.25', '0.5', '2', '4'], a => a[1] === 'rate' ? ['0.1', '0.5', '1', '2', '4', '10'] : a[1] === 'step' ? ['1', '20', '100'] : []]
};
CMD_SPEC.teleport = CMD_SPEC.tp;
const CMD_HELP = { help: 'lista de comandos', set: 'cube|sphere <bloque|air> (entre pos1 y pos2 del Edit Tool)', liquids: 'delete all|water|lava|honey|milk · sphere|cube water|lava|honey|milk <radio|lado>', gamemode: '<modo>', time: 'set|add|query', weather: 'clear|rain|thunder [segundos]', tp: '<x y z> | <jugador> | <quién> <x y z|destino>', give: '<objeto> [cantidad]', kill: '[@s|@e|@e[type=mob]|mob]', seed: '', summon: '<mob> [x y z]', spawnpoint: '', difficulty: '<dificultad>', locate: 'structure <nombre>', clear: '', dimension: '<dimensión>', gamerule: 'keepInventory <true|false>', effect: 'give <efecto> [segundos]', tick: 'freeze | unfreeze | <velocidad> | rate <x> | step [ticks] | query' };
// ---- ejecución
function runCommand(cmd) {
  const a = cmd.trim().slice(1).split(/\s+/); const c = (a[0] || '').toLowerCase(); const p = G.player;
  const allowed = G.cheats !== false || (G.net && G.net.role === 'host');
  if (!allowed && c !== 'help' && c !== 'seed') return chatMsg('Los trucos no están activados en este mundo.', '#f88');
  const yo = p.world.yOff;
  const coord = (v, cur, local) => v === undefined ? cur : v.startsWith('~') ? cur + (+v.slice(1) || 0) : (isNaN(+v) ? NaN : +v);
  const isCoord = v => v !== undefined && /^(~-?\d*\.?\d*|-?\d+\.?\d*)$/.test(v);
  const findEnt = name => { if (!name) return null; const n = name.toLowerCase(); if (n === '@s') return p; if (n === '@p') return p; if (p.name && p.name.toLowerCase() === n) return p; for (const e of G.entities.values()) if (e.name && e.name.toLowerCase() === n && !e.removed) return e; for (const e of G.entities.values()) if (e.type === n && !e.removed) return e; return null; };
  switch (c) {
    case 'help': chatMsg('Comandos (escribe / para ver el menú): ' + Object.keys(CMD_SPEC).filter(k => k !== 'teleport').map(k => '/' + k).join(', ')); return;
    case 'tp': case 'teleport': {
      // /tp x y z · /tp <destino> · /tp <quién> x y z · /tp <quién> <destino>
      let who = p, rest = a.slice(1);
      if (rest.length && !isCoord(rest[0]) && (rest.length === 4 || rest.length === 2)) { who = findEnt(rest[0]); rest = rest.slice(1); if (!who) return chatMsg('No se encontró: ' + a[1], '#f88'); }
      let tx, ty, tz, td = who.dim;
      if (rest.length >= 3 && rest.slice(0, 3).every(isCoord)) { const wy = (G.worlds[who.dim] || p.world).yOff; tx = coord(rest[0], who.x); ty = coord(rest[1], who.y + wy) - wy; tz = coord(rest[2], who.z); }
      else if (rest.length === 1) { const t = findEnt(rest[0]); if (!t) return chatMsg('No se encontró: ' + rest[0], '#f88'); tx = t.x; ty = t.y; tz = t.z; td = t.dim; }
      else return chatMsg('Uso: /tp ' + CMD_HELP.tp, '#f88');
      if (![tx, ty, tz].every(Number.isFinite)) return chatMsg('Coordenadas no válidas', '#f88');
      if (who === p) {
        if (p.boat) boatDismount(p); if (p.ragdoll) endRagdoll(p.ragdoll);
        if (td !== p.dim) changeDim(p, td, tx, ty, tz); else { ensureArea(p.world, tx, tz, 1); p.x = tx; p.y = ty; p.z = tz; }
        p.px = p.x; p.py = p.y; p.pz = p.z; p.vx = p.vy = p.vz = 0; p.fallDist = 0;
      } else if (who.remotePlayer) netSendTo(who.conn, { t: 'tp', x: tx, y: ty, z: tz });
      else if (who.proxy) return chatMsg('Solo el anfitrión puede mover a otros', '#f88');
      else { who.x = who.px = tx; who.y = who.py = ty; who.z = who.pz = tz; who.vx = who.vy = who.vz = 0; }
      chatMsg('Teletransportado a ' + [tx, ty + (G.worlds[td] || p.world).yOff, tz].map(v => Math.round(v * 10) / 10).join(' ')); return;
    }
    case 'weather': {
      const k = (a[1] || '').toLowerCase(); if (!['clear', 'rain', 'thunder'].includes(k)) return chatMsg('Uso: /weather ' + CMD_HELP.weather, '#f88');
      if (G.net && G.net.role === 'client') return chatMsg('Solo el anfitrión puede cambiar el clima', '#f88');
      const secs = +a[2]; G.rain = k === 'clear' ? 0 : 1; G.thunder = k === 'thunder'; G.rainTimer = secs > 0 ? secs * 20 : (k === 'clear' ? 18000 : 6000); G.weatherFast = 80; // el cambio se nota enseguida
      if (G.net && G.net.role === 'host') netBroadcast({ t: 'time', v: G.time, r: G.rain });
      chatMsg('Clima: ' + ({ clear: 'despejado', rain: 'lluvia', thunder: 'tormenta' })[k] + (secs > 0 ? ' durante ' + secs + ' s' : '')); return;
    }
    case 'tick': {
      if (G.net && G.net.role === 'client') return chatMsg('Solo el anfitrión puede cambiar el tick', '#f88');
      const k = (a[1] || 'query').toLowerCase();
      if (k === 'freeze') { G.tickFrozen = true; chatMsg('Mundo congelado (los jugadores siguen moviéndose). /tick unfreeze para continuar'); }
      else if (k === 'unfreeze') { G.tickFrozen = false; G.tickStep = 0; chatMsg('Mundo en marcha a x' + (G.tickRate || 1)); }
      else if (k === 'step') { const n = Math.max(1, Math.min(2000, +a[2] || 1)); G.tickStep = (G.tickStep || 0) + n; chatMsg('Avanzando ' + n + ' ticks'); }
      else if (k === 'query') { chatMsg('Tick: ' + (G.tickFrozen ? 'congelado' : 'x' + (G.tickRate || 1)) + ' (20 ticks/s normal)'); return; }
      else { const v = +(k === 'rate' ? a[2] : k); if (!(v > 0)) return chatMsg('Uso: /tick ' + CMD_HELP.tick, '#f88'); G.tickRate = clamp(v, 0.05, 20); G.tickFrozen = false; chatMsg('Velocidad del mundo: x' + G.tickRate + ' (' + Math.round(20 * G.tickRate * 10) / 10 + ' ticks/s)'); }
      if (G.net && G.net.role === 'host') netBroadcast({ t: 'tick', f: G.tickFrozen, r: G.tickRate });
      return;
    }
    case 'set': { // world edit: rellena con un bloque (o aire) la caja o la esfera (elipsoide) entre pos1 y pos2 del Edit Tool
      const shape = (a[1] || '').toLowerCase(), name = (a[2] || '').replace('minecraft:', '').toLowerCase();
      if ((shape !== 'cube' && shape !== 'sphere') || !name) return chatMsg('Uso: /set cube|sphere <bloque> (antes marca pos1 y pos2 con el Edit Tool)', '#f88');
      if (!WE.p1 || !WE.p2) return chatMsg('Marca pos1 (clic izquierdo) y pos2 (clic derecho) en bloques con el Edit Tool', '#f88');
      const id = name === 'air' ? 0 : ID[name]; if (id === undefined || (id && !REG[id].isBlock)) return chatMsg('Bloque desconocido: ' + name, '#f88');
      const x0 = Math.min(WE.p1[0], WE.p2[0]), x1 = Math.max(WE.p1[0], WE.p2[0]), y0 = Math.min(WE.p1[1], WE.p2[1]), y1 = Math.max(WE.p1[1], WE.p2[1]), z0 = Math.min(WE.p1[2], WE.p2[2]), z1 = Math.max(WE.p1[2], WE.p2[2]);
      const vol = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1); if (vol > 2000000) return chatMsg('Selección demasiado grande (' + vol.toLocaleString('es') + ' bloques; máximo 2.000.000)', '#f88');
      const w = p.world; const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, cz = (z0 + z1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2, rz = (z1 - z0 + 1) / 2;
      let n = 0, miss = 0;
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        if (shape === 'sphere' && ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2 > 1) continue;
        if (y < 0 || y >= w.H) continue; const cur = w.get(x, y, z); if (cur < 0) { miss++; continue; } if (cur === id && w.getMeta(x, y, z) === 0) continue;
        setBlockNet(w, x, y, z, id, 0); n++;
      }
      return chatMsg((shape === 'cube' ? 'Caja' : 'Esfera') + ': ' + n.toLocaleString('es') + ' bloques de ' + (id ? REG[id].disp : 'aire') + (miss ? ' (' + miss.toLocaleString('es') + ' sin cargar, no se tocaron)' : ''));
    }
    case 'liquids': { // solo partículas del fluido continuo: el agua y la lava normales (y los océanos) no se tocan
      if (G.net && G.net.role === 'client') return chatMsg('Solo el anfitrión puede usar /liquids (él simula el fluido)', '#f88');
      if (typeof FL === 'undefined' || !flCanSim(p.world)) return chatMsg('El fluido continuo no está activo (calidad alta y líquidos continuos en las opciones)', '#f88');
      const k = (a[1] || '').toLowerCase(), kind = (a[2] || '').toLowerCase(); const name = { water: 'agua', lava: 'lava', honey: 'miel', milk: 'leche', all: 'todos los líquidos' }; const KL = { water: 1, lava: 2, honey: 4, milk: 5 };
      if (k === 'delete') {
        if (!name[kind]) return chatMsg('Uso: /liquids delete all|water|lava|honey|milk', '#f88');
        let n = 0; for (let i = 0; i < FL.hi; i++) { const ph = FL.phase[i]; if (!ph || (kind !== 'all' && phLiq(ph) !== KL[kind])) continue; flKill(i); n++; }
        for (const [key, c] of FL.occ) { c.idx = c.idx.filter(i => FL.phase[i]); if (!c.idx.length) FL.occ.delete(key); }
        return chatMsg(n + ' partículas de ' + name[kind] + ' eliminadas');
      }
      if (k === 'sphere' || k === 'cube') {
        const liq = KL[kind] || 0; let s = +a[3];
        if (!liq || !(s > 0)) return chatMsg('Uso: /liquids ' + k + ' water|lava|honey|milk <' + (k === 'sphere' ? 'radio' : 'lado') + '>', '#f88');
        s = Math.min(s, k === 'sphere' ? 8 : 16); const half = k === 'sphere' ? s : s / 2;
        // delante del jugador, sin tocarlo
        const dir = lookDir(p); const dd = half + 1.5; const cx = p.x + dir[0] * dd, cy = p.eye + dir[1] * dd, cz = p.z + dir[2] * dd; const w = p.world; const S = FL_S;
        let n = 0, full = false;
        for (let y = cy - half + S / 2; y < cy + half && !full; y += S) for (let z = cz - half + S / 2; z < cz + half && !full; z += S) for (let x = cx - half + S / 2; x < cx + half; x += S) {
          if (k === 'sphere' && (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 > s * s) continue;
          const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z); const b = w.get(bx, by, bz); if (b < 0 || (b > 0 && (REG[b].solid || REG[b].liquid))) continue;
          if (!flCanSim(w, bx, by, bz)) continue;
          const j = () => (Math.random() - 0.5) * 0.03; if (flSpawn(x + j(), y + j(), z + j(), 0, 0, 0, liqPh(liq)) < 0) { full = true; break; } n++;
        }
        return chatMsg((k === 'sphere' ? 'Esfera' : 'Cubo') + ' de ' + name[kind] + ': ' + n + ' partículas' + (full ? ' (no caben más: límite del fluido)' : ''), full ? '#fc8' : null);
      }
      return chatMsg('Uso: /liquids ' + CMD_HELP.liquids, '#f88');
    }
    case 'kill': {
      const t = (a[1] || '@s').toLowerCase();
      if (t === '@s' || t === '@p' || (p.name && t === p.name.toLowerCase())) { p.hp = 0; p.die('void'); return; }
      const m = t.match(/^@e(?:\[type=(?:minecraft:)?([a-z_]+)\])?$/); const type = m ? m[1] : (MOB[t] || t === 'item' ? t : null);
      if (!m && !type) return chatMsg('Uso: /kill ' + CMD_HELP.kill, '#f88');
      let n = 0; for (const e of G.entities.values()) { if (e.removed || e.dead || e.remotePlayer || e.type === 'player' || e.proxy) continue; if (type && e.type !== type) continue; if (e.isBoat || e.type === 'item' || e instanceof Projectile) e.removed = true; else { e.invul = 0; hurtEntity(e, 1e9, null, 0, 0, 0, 'void'); if (!e.dead && e.hp > 0) e.hp = 0; } n++; }
      chatMsg(n + ' entidad' + (n === 1 ? '' : 'es') + ' eliminada' + (n === 1 ? '' : 's')); return;
    }
  }
  runCommandBase(cmd);
}
// ---- menú de autocompletado
const CMDUI = { list: [], sel: 0, el: null, start: 0 };
function cmdSuggest(text) {
  if (!text.startsWith('/')) return { items: [], from: 0, hint: '' };
  const body = text.slice(1); const parts = body.split(' '); const idx = parts.length - 1; const cur = parts[idx].toLowerCase(); const from = text.length - parts[idx].length;
  if (idx === 0) { const names = Object.keys(CMD_SPEC).filter(k => k.startsWith(cur)); return { items: names, from, hint: '' }; }
  const spec = CMD_SPEC[parts[0].toLowerCase()]; if (!spec) return { items: [], from, hint: 'comando desconocido' };
  const prov = spec[idx - 1]; const args = [parts[0]].concat(parts.slice(1));
  if (!prov) return { items: [], from, hint: '' };
  let list = typeof prov === 'function' ? prov(args) : prov; list = list || [];
  const hints = list.filter(s => s.startsWith('<')); const real = list.filter(s => !s.startsWith('<'));
  let items = real.filter(s => s.toLowerCase().startsWith(cur)); if (cur && items.length === 0) items = real.filter(s => s.toLowerCase().includes(cur));
  return { items: items.slice(0, 200), from, hint: hints.join(' ') || (items.length ? '' : (CMD_HELP[parts[0].toLowerCase()] || '')) };
}
function cmdUIUpdate() {
  const inp = $('chatIn'); let el = CMDUI.el; if (!el) { el = CMDUI.el = document.createElement('div'); el.id = 'cmdSug'; document.body.appendChild(el); }
  const r = cmdSuggest(inp.value); CMDUI.list = r.items; CMDUI.from = r.from; if (CMDUI.sel >= r.items.length) CMDUI.sel = 0;
  if (!inp.classList.contains('on') || (!r.items.length && !r.hint)) { el.style.display = 'none'; return; }
  const top = Math.max(0, Math.min(CMDUI.sel - 5, r.items.length - 10)); const shown = r.items.slice(top, top + 10);
  el.innerHTML = ''; el.style.display = 'block';
  // alineado con el argumento que se está escribiendo
  const meas = document.createElement('span'); meas.style.cssText = 'visibility:hidden;position:absolute;white-space:pre;font:' + getComputedStyle(inp).font; meas.textContent = inp.value.slice(0, r.from); document.body.appendChild(meas); el.style.left = (4 + 6 + meas.offsetWidth) + 'px'; meas.remove();
  for (let i = 0; i < shown.length; i++) { const d = document.createElement('div'); d.textContent = shown[i]; if (top + i === CMDUI.sel) d.className = 'on'; const k = top + i; d.onmousedown = ev => { ev.preventDefault(); CMDUI.sel = k; cmdApply(); }; el.appendChild(d); }
  if (r.items.length > 10) { const d = document.createElement('div'); d.className = 'more'; d.textContent = '… ' + r.items.length + ' opciones (↑/↓)'; el.appendChild(d); }
  if (!r.items.length && r.hint) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = r.hint; el.appendChild(d); }
}
function cmdApply() {
  const inp = $('chatIn'); const s = CMDUI.list[CMDUI.sel]; if (!s) return false;
  inp.value = inp.value.slice(0, CMDUI.from) + s + (s.endsWith('=') ? '' : ' '); CMDUI.sel = 0; cmdUIUpdate(); return true;
}
function cmdUIKey(e) {
  if (!$('chatIn').value.startsWith('/')) return;
  if (e.key === 'Tab') { e.preventDefault(); cmdApply(); }
  else if (e.key === 'ArrowDown' && CMDUI.list.length) { e.preventDefault(); CMDUI.sel = (CMDUI.sel + 1) % CMDUI.list.length; cmdUIUpdate(); }
  else if (e.key === 'ArrowUp' && CMDUI.list.length) { e.preventDefault(); CMDUI.sel = (CMDUI.sel - 1 + CMDUI.list.length) % CMDUI.list.length; cmdUIUpdate(); }
}
