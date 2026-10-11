// ============================================================================
//  Pathfinding A* para mobs (al estilo del original): evaluación de celdas según el tamaño
//  del mob, saltos de 1 bloque, caídas controladas, puertas, peligros, y navegador por mob
// ============================================================================
const PATH = { queue: [], perTick: 4, tick: -1, used: 0, msTick: 0, stats: { searches: 0, nodes: 0, ms: 0 } };
const DANGER = new Set(); // bloques que hacen daño o queman
function pathInitSets() { if (DANGER.size) return; for (const n of ['lava', 'fire', 'magma_block', 'cactus', 'campfire', 'sweet_berry_bush', 'wither_rose']) if (ID[n] !== undefined) DANGER.add(ID[n]); }
// tipo de celda para los pies del mob: 0 libre, 1 bloqueada, 2 agua, 3 peligro, 4 puerta cerrada (de madera), 5 puerta de hierro cerrada
function cellKind(w, x, y, z) {
  const b = w.get(x, y, z); if (b === 0) return 0; if (b < 0) return 1; const d = REG[b]; if (!d) return 1;
  if (DANGER.has(b)) return 3;
  if (d.liquid) return d.liquid === 2 ? 3 : 2;
  if (d.shape === 'trapdoor') return 0;
  if (d.shape === 'door' || d.shape === 'gate') { if (w.getMeta(x, y, z) & 4) return 0; return b === ID.iron_door ? 5 : (d.shape === 'gate' ? 1 : 4); }
  if (d.shape === 'fence' || d.shape === 'wall') return 1; // 1,5 de alto: no se salta
  if (!d.solid || d.render === 'cross' || d.replace) return 0; // plantas, capas de nieve: se atraviesan / pisan
  return 1;
}
// ¿se puede estar de pie en (x,y,z)? (suelo firme debajo; no sobre vallas ni hojas)
function floorOk(w, x, y, z) { const b = w.get(x, y - 1, z); if (b <= 0) return false; const d = REG[b]; if (!d || !d.solid || d.liquid) return false; if (d.shape === 'fence' || d.shape === 'wall' || d.shape === 'gate' || d.leaves) return false; return true; }
// evaluación completa de un nodo para un mob de altura h: devuelve coste extra o -1 si no se puede
function nodeCost(w, x, y, z, o) {
  if (o.wide) { // huella de 2x2 (gólem, caballos...): las otras tres columnas deben dejar pasar
    for (const [fx, fz] of [[1, 0], [0, 1], [1, 1]]) for (let k = 0; k < o.hc; k++) { const t = cellKind(w, x + fx, y + k, z + fz); if (t === 1 || t === 5 || t === 4 || (t === 3 && !o.fireImmune)) return -1; }
  }
  let swim = false;
  for (let k = 0; k < o.hc; k++) {
    const t = cellKind(w, x, y + k, z);
    if (t === 1 || t === 5) return -1;
    if (t === 4) { if (!o.doors) return -1; if (k === 0) o._door = true; continue; }
    if (t === 3) { if (!o.fireImmune) return -1; continue; }
    if (t === 2) { if (k === 0) swim = true; continue; }
  }
  if (swim) return o.swim ? 0 : 8; // los mobs de tierra nadan, pero lo evitan (coste 8 como en el original)
  if (!floorOk(w, x, y, z)) return -1;
  const below = w.get(x, y - 1, z); if (DANGER.has(below) && !o.fireImmune) return -1;
  // cerca de un peligro (lava, cactus...): más caro, como en el original
  let near = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const b = w.get(x + dx, y, z + dz); if (DANGER.has(b) || DANGER.has(w.get(x + dx, y - 1, z + dz))) near = 1; }
  return near ? (o.fireImmune ? 0 : 2.5) : 0;
}
// montículo binario
class PHeap { constructor() { this.a = []; } push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= n.f) break; a[i] = a[p]; i = p; } a[i] = n; } pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { let i = 0; const n = a.length; while (true) { let l = 2 * i + 1, r = l + 1, m = i; if (l < n && a[l].f < (m === i ? last.f : a[m].f)) m = l; if (r < n && a[r].f < (m === i ? last.f : a[m].f)) m = r; if (m === i) break; a[i] = a[m]; i = m; } a[i] = last; } return top; } get size() { return this.a.length; } }
const pkey = (x, y, z) => ((x & 0xFFF) << 20) | ((z & 0xFFF) << 8) | (y & 0xFF);
// A*: devuelve { path: [[x,y,z],...], full: bool, nodes } (camino parcial al nodo más cercano si no llega)
function findPath(w, sx, sy, sz, gx, gy, gz, o) {
  pathInitSets(); const t0 = performance.now();
  const maxN = o.maxNodes || 600, maxDrop = o.maxDrop ?? 3;
  const H = (x, y, z) => { const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz) + Math.abs(y - gy) * 0.6; };
  const open = new PHeap(), seen = new Map();
  const start = { x: sx, y: sy, z: sz, g: 0, f: H(sx, sy, sz), p: null }; open.push(start); seen.set(pkey(sx, sy, sz), start);
  let best = start, bestH = start.f, n = 0;
  // caché de evaluaciones de celda (cada celda se evalúa una vez por búsqueda); puerta = +1000
  const cache = new Map(); const NC = (x, y, z) => { const k = pkey(x, y, z); let v = cache.get(k); if (v === undefined) { o._door = false; v = nodeCost(w, x, y, z, o); if (v >= 0 && o._door) v += 1000; cache.set(k, v); } return v; };
  const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (open.size && n < maxN) {
    const c = open.pop(); if (c.closed) continue; c.closed = true; n++;
    const hc = H(c.x, c.y, c.z); if (hc < bestH) { bestH = hc; best = c; }
    if (Math.abs(c.x - gx) <= (o.reach || 0) && Math.abs(c.z - gz) <= (o.reach || 0) && Math.abs(c.y - gy) <= 1) { best = c; bestH = 0; break; }
    for (const [dx, dz, base] of D8) {
      const nx = c.x + dx, nz = c.z + dz;
      if (dx && dz) { // diagonal sin cortar esquinas
        const a = NC(c.x + dx, c.y, c.z), b = NC(c.x, c.y, c.z + dz); if (a < 0 || b < 0 || a >= 1000 || b >= 1000) continue;
      }
      // misma altura, subir 1 (salto, con espacio para la cabeza) o bajar hasta maxDrop
      let ny = -999, extra = 0;
      let k = NC(nx, c.y, nz);
      if (k >= 0) { ny = c.y; extra = k; }
      else if (!(dx && dz) && cellKind(w, c.x, c.y + o.hc, c.z) !== 1) { k = NC(nx, c.y + 1, nz); if (k >= 0) { ny = c.y + 1; extra = k + 0.6; } }
      if (ny === -999) { // caída
        if (cellKind(w, nx, c.y, nz) === 1 || cellKind(w, nx, c.y + 1, nz) === 1) continue;
        for (let dy = 1; dy <= maxDrop; dy++) { const t = cellKind(w, nx, c.y - dy, nz); if (t === 1 || t === 5) break; k = NC(nx, c.y - dy, nz); if (k >= 0) { ny = c.y - dy; extra = k + dy * 0.35; break; } if (t === 2) break; }
        if (ny === -999) continue;
      }
      const door = extra >= 1000; if (door) extra -= 1000; const key = pkey(nx, ny, nz); const g = c.g + base + extra + (door ? 1 : 0);
      let m = seen.get(key); if (m && (m.closed || m.g <= g)) continue;
      if (!m) { m = { x: nx, y: ny, z: nz }; seen.set(key, m); }
      m.g = g; m.f = g + H(nx, ny, nz) * 1.05; m.p = c; m.door = door; open.push(m);
    }
  }
  const path = []; for (let c = best; c; c = c.p) path.push([c.x, c.y, c.z, c.door ? 1 : 0]); path.reverse();
  const ms = performance.now() - t0; PATH.stats.searches++; PATH.stats.nodes += n; PATH.stats.ms += ms; PATH.msTick += ms;
  return { path, full: bestH === 0, nodes: n };
}
// línea recta caminable (para saltarse nodos intermedios y no ir en zigzag)
function straightOk(w, x0, z0, x1, z1, y, o) {
  const dx = x1 - x0, dz = z1 - z0; const L = Math.hypot(dx, dz); const steps = Math.ceil(L * 3);
  for (let i = 1; i <= steps; i++) { const t = i / steps; const fx = x0 + dx * t, fz = z0 + dz * t; for (const [ox, oz] of [[-o.r, -o.r], [o.r, -o.r], [-o.r, o.r], [o.r, o.r]]) { const cx = Math.floor(fx + ox), cz = Math.floor(fz + oz); o._door = false; const k = nodeCost(w, cx, y, cz, o); if (k < 0 || k > 1 || o._door) return false; const b0 = w.get(cx, y, cz); if (b0 > 0 && REG[b0].shape === 'door') return false; } }
  return true;
}
function navOpts(e) { const d = e.def || {}; return { hc: Math.max(1, Math.ceil((e.h || 1.8) - 0.05)), r: Math.min(0.45, (e.w || 0.6) / 2), doors: e.type === 'villager', fireImmune: !!d.fireImmune, swim: !!d.swim, maxDrop: d.noFall ? 8 : 3, reach: 0, wide: (e.w || 0.6) > 1.05 }; }
// pide un camino (cola con presupuesto global por tick)
function navRequest(e, gx, gy, gz) { const nav = e.nav || (e.nav = {}); nav.goal = [gx, gy, gz]; if (!nav.queued) { nav.queued = true; PATH.queue.push(e); } }
function processPathQueue() {
  if (G.tick === PATH.tick) return; PATH.tick = G.tick; PATH.msTick = 0; let done = 0;
  while (PATH.queue.length && done < PATH.perTick && PATH.msTick < 3) {
    const e = PATH.queue.shift(); const nav = e.nav; if (!nav) continue; nav.queued = false; if (e.dead || e.removed || !e.world) continue;
    const o = navOpts(e); const w = e.world; const off = o.wide ? 0.5 : 0; const sx = Math.floor(e.x - off), sy = Math.floor(e.y + 0.1), sz = Math.floor(e.z - off); const [gx, gy, gz] = nav.goal;
    const d = Math.hypot(gx - sx, gz - sz); o.maxNodes = Math.min(1200, 200 + d * 25);
    const r = findPath(w, sx, sy, sz, gx, gy, gz, o); nav.path = r.path; nav.i = 1; nav.full = r.full; nav.t = e.age; nav.pathGoal = [gx, gy, gz]; done++;
  }
}
// altura de destino aproximada: si el objetivo es una entidad cercana, su y; si no, el suelo más cercano a la altura del mob
function navGoalY(w, e, tx, tz) {
  if (e.target && Math.abs(e.target.x - tx) < 1.5 && Math.abs(e.target.z - tz) < 1.5) return Math.floor(e.target.y + 0.1);
  const x = Math.floor(tx), z = Math.floor(tz); const y0 = Math.floor(e.y + 0.1);
  for (let k = 0; k < 8; k++) for (const y of [y0 + k, y0 - k]) if (floorOk(w, x, y, z) && cellKind(w, x, y, z) !== 1 && cellKind(w, x, y + 1, z) !== 1) return y;
  return y0;
}
// sustituye a ir en línea recta: devuelve true si se encargó del movimiento
function navWalk(e, tx, tz, speed, dt) {
  const d = e.def; if (!d || d.noGrav || d.climb || d.swim && e.inWater || SETTINGS.pathfinding === false) return false;
  const w = e.world; if (!w) return false;
  const p = typeof nearestPlayerAny === 'function' ? nearestPlayerAny(e) : G.player; if (!p || Math.abs(p.x - e.x) > 56 || Math.abs(p.z - e.z) > 56) return false; // lejos de los jugadores: movimiento simple
  const nav = e.nav || (e.nav = { path: null, i: 0, stuck: 0 });
  const gx = Math.floor(tx), gz = Math.floor(tz);
  const dist = Math.hypot(tx - e.x, tz - e.z);
  // muy cerca y a la vista: directo
  if (dist < 1.6 && Math.abs((e.target ? e.target.y : e.y) - e.y) < 1) return false;
  const pg = nav.pathGoal; const moved = !pg || Math.hypot(pg[0] - gx, pg[2] - gz) > Math.max(1.5, dist * 0.2);
  const stale = !nav.path || nav.i >= nav.path.length || e.age - nav.t > (nav.full ? 100 : 40);
  // no más de una búsqueda cada 10 ticks por mob (objetivo inalcanzable → no recalcula en bucle)
  if ((moved || stale || nav.stuck > 20) && !nav.queued && e.age - (nav.req ?? -99) >= (nav.full || !nav.path ? 10 : 25)) { nav.req = e.age; navRequest(e, gx, navGoalY(w, e, tx, tz), gz); nav.stuck = 0; }
  if (!nav.path || nav.i >= nav.path.length) { if (!nav.path) return false; e.vx *= 0.6; e.vz *= 0.6; return true; }
  const o = navOpts(e);
  // saltarse nodos si la línea recta está libre (camino suave, sin zigzag)
  for (let it = 0; it < 4 && nav.i + 1 < nav.path.length; it++) { const q = nav.path[nav.i + 1]; if (q[1] !== Math.floor(e.y + 0.1) || nav.path[nav.i][3] || q[3]) break; if (o.wide || !straightOk(w, e.x, e.z, q[0] + 0.5, q[2] + 0.5, q[1], o)) break; nav.i++; }
  const n = nav.path[nav.i]; if (nav.ci !== nav.i || nav.cp !== nav.path) { nav.ci = nav.i; nav.cp = nav.path; nav.c = o.wide ? [n[0] + 1, n[2] + 1] : nodeCenter(w, n[0], n[1], n[2]); }
  const cx = nav.c[0], cz = nav.c[1]; const ddx = cx - e.x, ddz = cz - e.z; const l = Math.hypot(ddx, ddz);
  // puertas: los aldeanos las abren al llegar y las cierran detrás
  // puerta en el siguiente nodo (marcada o cerrada después de calcular el camino): el aldeano la abre; los demás recalculan
  const doorHere = (k) => { const b = w.get(n[0], n[1] + k, n[2]); return b > 0 && REG[b].shape === 'door' && !(w.getMeta(n[0], n[1] + k, n[2]) & 4); };
  if (!n[3] && (doorHere(0) || doorHere(1)) && e.type !== 'villager') { nav.path = null; nav.stuck = 99; return false; }
  if (e.type === 'villager' && (n[3] || doorHere(0) || doorHere(1))) { for (let k = 0; k < 2; k++) { const b = w.get(n[0], n[1] + k, n[2]); if (b > 0 && REG[b].shape === 'door' && !(w.getMeta(n[0], n[1] + k, n[2]) & 4) && l < 1.6) { setBlockNet(w, n[0], n[1] + k, n[2], b, w.getMeta(n[0], n[1] + k, n[2]) | 4); nav.opened = [n[0], n[1], n[2], e.age]; playSound('chest_open', n[0], n[1], n[2], 0.4); } } }
  if (nav.opened && e.age - nav.opened[3] > 30 && Math.hypot(nav.opened[0] + 0.5 - e.x, nav.opened[2] + 0.5 - e.z) > 1.8 && !doorBusy(nav.opened)) { const [ox, oy, oz] = nav.opened; for (let k = 0; k < 2; k++) { const b = w.get(ox, oy + k, oz); if (b > 0 && REG[b].shape === 'door' && (w.getMeta(ox, oy + k, oz) & 4)) setBlockNet(w, ox, oy + k, oz, b, w.getMeta(ox, oy + k, oz) & ~4); } nav.opened = null; }
  const reachR = Math.max(0.35, (e.w || 0.6) * 0.5);
  if (l < reachR && Math.abs(n[1] - e.y) < 1.2) { nav.i++; return true; }
  faceTo(e, cx, cz); e.vx = lerp(e.vx, ddx / (l || 1) * speed, 0.35); e.vz = lerp(e.vz, ddz / (l || 1) * speed, 0.35);
  // alineación lateral firme cerca del nodo (puertas abiertas, pasillos de 1 bloque): corrige el eje perpendicular directamente
  if (l < 1.5) { if (Math.abs(ddz) > Math.abs(ddx) * 1.5 && Math.abs(ddx) > 0.01) e.vx = clamp(ddx * 10, -speed, speed); else if (Math.abs(ddx) > Math.abs(ddz) * 1.5 && Math.abs(ddz) > 0.01) e.vz = clamp(ddz * 10, -speed, speed); }
  // saltar si el siguiente nodo está más alto
  if (n[1] > e.y + 0.4 && e.onGround && l < 1.4) e.vy = 10;
  // atascado: no avanza → saltar y volver a calcular
  const prog = Math.hypot(e.x - (nav.lx ?? e.x), e.z - (nav.lz ?? e.z)); nav.lx = e.x; nav.lz = e.z;
  if (prog < speed * dt * 0.15) { nav.stuck++; nav.stuckT = (nav.stuckT || 0) + 1; if (nav.stuckT > 60 && e.onGround) { e.vy = 10; nav.stuckT = 0; } } else { nav.stuck = Math.max(0, nav.stuck - 1); nav.stuckT = 0; }
  e.navT = e.age; // el navegador decide los saltos (sin salto automático al chocar)
  return true;
}
// centro del espacio libre de una celda: si hay un panel fino (puerta abierta, trampilla abierta) a un lado, se desplaza al hueco
const _nb = [];
function nodeCenter(w, x, y, z) {
  let x0 = x, x1 = x + 1, z0 = z, z1 = z + 1; const E = 0.02;
  for (let k = 0; k < 2; k++) {
    const b = w.get(x, y + k, z); if (b <= 0 || !REG[b] || !REG[b].shape) continue; _nb.length = 0; blockBoxes(b, w.getMeta(x, y + k, z), x, y + k, z, _nb, w);
    for (const q of _nb) {
      if (q[2] <= z + E && q[5] >= z + 1 - E && q[3] - q[0] < 0.5) { if (q[0] <= x + E) x0 = Math.max(x0, q[3]); else x1 = Math.min(x1, q[0]); }
      else if (q[0] <= x + E && q[3] >= x + 1 - E && q[5] - q[2] < 0.5) { if (q[2] <= z + E) z0 = Math.max(z0, q[5]); else z1 = Math.min(z1, q[2]); }
    }
  }
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}
// ¿hay alguien en el hueco de la puerta o a punto de cruzarla? (no se cierra en la cara de otro)
function doorBusy(d) { const p = G.player; if (p && Math.abs(p.x - d[0] - 0.5) < 1.3 && Math.abs(p.z - d[2] - 0.5) < 1.3 && Math.abs(p.y - d[1]) < 2) return true; for (const o of G.entities.values()) if (o instanceof Mob && !o.dead && Math.abs(o.x - d[0] - 0.5) < 1.3 && Math.abs(o.z - d[2] - 0.5) < 1.3 && Math.abs(o.y - d[1]) < 2) return true; return false; }
// depuración: imprime el camino de una entidad
function debugPath(e) { const n = e && e.nav; if (!n || !n.path) return null; return { full: n.full, i: n.i, path: n.path.map(p => p.slice(0, 3).join(',')).join(' → ') }; }
// ------------------------------------------------------------ objetivos de mobs pacíficos
// devuelve { x, z, sp, stop } o null (vagar normal). Aldeanos: huyen de zombis/illagers y de noche van a su cama.
// Animales: siguen al jugador que sostiene su comida (como en el original).
const MOB_FOOD = { cow: ['wheat'], sheep: ['wheat'], goat: ['wheat'], mooshroom: ['wheat'], pig: ['carrot', 'potato', 'beetroot'], chicken: ['wheat_seeds', 'melon_seeds', 'pumpkin_seeds', 'beetroot_seeds'], rabbit: ['carrot', 'dandelion', 'golden_carrot'], horse: ['wheat', 'apple', 'golden_carrot'], cat: ['cod', 'salmon'] };
const VILLAGER_FEAR = new Set(['zombie', 'husk', 'drowned', 'zombie_villager', 'pillager', 'vindicator', 'evoker', 'ravager', 'vex']);
function passiveGoal(e, w) {
  if (SETTINGS.pathfinding === false) return null;
  if (e.type === 'villager') {
    if (e.age % 10 === 0 || e._fear === undefined) { // amenaza más cercana (cada medio segundo)
      let best = null, bd = 64; for (const o of G.entities.values()) if (o instanceof Mob && VILLAGER_FEAR.has(o.type) && !o.dead && o.dim === e.dim) { const dd = (o.x - e.x) ** 2 + (o.z - e.z) ** 2; if (dd < bd) { bd = dd; best = o; } }
      e._fear = best;
    }
    const f = e._fear; if (f && !f.dead && !f.removed) { const dx = e.x - f.x, dz = e.z - f.z, l = Math.hypot(dx, dz) || 1; if (l < 10) return { x: e.x + dx / l * 8, z: e.z + dz / l * 8, sp: 1.5, stop: 0 }; }
    if (!isDay()) {
      if (!e.bed || (e.age % 400 === 0 && w.get(e.bed[0], e.bed[1], e.bed[2]) !== ID.bed)) e.bed = (e.age % 100 === 0 || !e._bedT) ? findBedNear(w, e) : e.bed;
      e._bedT = 1;
      if (e.bed) return { x: e.bed[0] + 0.5, z: e.bed[2] + 0.5, sp: 0.6, stop: 1.4 };
    }
    return null;
  }
  const food = MOB_FOOD[e.type]; if (!food) return null;
  const p = G.player; if (!p || p.dead || p.dim !== e.dim) return null;
  const dd = Math.hypot(p.x - e.x, p.z - e.z); if (dd > 10 || Math.abs(p.y - e.y) > 4) return null;
  const s = p.held && p.held(); if (!s || !REG[s.id] || !food.includes(REG[s.id].name)) return null;
  return { x: p.x, z: p.z, sp: 0.8, stop: 2.2, look: p };
}
// busca una cama cerca (radio 20, ±5 de altura); barrido barato por columnas
function findBedNear(w, e) {
  const x0 = Math.floor(e.x), y0 = Math.floor(e.y), z0 = Math.floor(e.z); let best = null, bd = 1e9;
  for (let dx = -20; dx <= 20; dx++) for (let dz = -20; dz <= 20; dz++) { const d2 = dx * dx + dz * dz; if (d2 >= bd || d2 > 400) continue; for (let dy = -5; dy <= 5; dy++) if (w.get(x0 + dx, y0 + dy, z0 + dz) === ID.bed) { bd = d2; best = [x0 + dx, y0 + dy, z0 + dz]; break; } }
  return best;
}
