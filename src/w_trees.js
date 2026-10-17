// ============================================================================
//  Árboles dinámicos (opción del mundo): el árbol es un solo cuerpo. Al romper una rama, todo lo
//  que queda sin unión con la raíz cae de lado (girando sobre el corte) hasta el suelo o hasta chocar
//  con algo, y en ese momento se convierte en madera, palos, brotes (y manzanas). Si se taló por
//  encima de la raíz queda un tocón que con el tiempo vuelve a brotar; los árboles crecen por fases
//  (brote → joven → mediano → adulto).
// ============================================================================
const DYNT = { falling: [], busy: false, queue: [] };
function dynOn(w) { return !!(w && w.gen && w.gen.dynTrees); }
const dynIsLog = b => b > 0 && REG[b] && REG[b].dynLog;
// suelo firme para una raíz (las hojas, plantas y ramas no lo son)
const dynGround = b => b > 0 && REG[b] && REG[b].solid && !REG[b].leaves && !REG[b].dynLog && !REG[b].replace;
// raíz de una rama: la rama más baja de la columna (lo de debajo no es rama)
function dynRootOf(w, x, y, z) { let yy = y; while (yy > 0 && dynIsLog(w.get(x, yy - 1, z))) yy--; return yy; }
// mundo como "S" del generador (con getMeta para no adelgazar ramas al crecer)
function dynWorldS(w) {
  return {
    get: (x, y, z) => w.get(x, y, z), getMeta: (x, y, z) => w.getMeta(x, y, z),
    set: (x, y, z, id, m) => setBlockNet(w, x, y, z, id, m || 0),
    setIfAir: (x, y, z, id, m) => { const b = w.get(x, y, z); if (b === 0 || (b > 0 && REG[b].replace && !REG[b].liquid)) setBlockNet(w, x, y, z, id, m || 0); }
  };
}
// ---- crecimiento: el brote pasa a árbol joven; luego cada fase con los ticks aleatorios
function dynGrowFromSapling(w, x, y, z, sp) {
  if (!ID['dyn_' + sp + '_log']) return false;
  DYNT.busy = true; try { setBlockNet(w, x, y, z, 0); dynTreePlace(dynWorldS(w), x, y, z, sp, 1, w.seed); } finally { DYNT.busy = false; }
  return true;
}
function dynGrowTick(w, x, y, z, b) {
  if (dynIsLog(w.get(x, y - 1, z))) return; // solo la raíz decide
  if (!dynGround(w.get(x, y - 1, z))) return;
  const m = w.getMeta(x, y, z), stage = (m >> 3) & 3, stump = m & 32, sp = REG[b].dynLog;
  if (w.light(x, y + 1, z)[0] < 8 && !stump) return;
  if (stump) { // el tocón rebrota: quita lo que quedó del tronco viejo y nace un árbol joven
    if (Math.random() > 0.35) return;
    DYNT.busy = true; try {
      let yy = y + 1; while (yy < w.H && w.get(x, yy, z) === b) { setBlockNet(w, x, yy, z, 0); yy++; }
      setBlockNet(w, x, y, z, b, (m & 7)); dynTreePlace(dynWorldS(w), x, y, z, sp, 1, w.seed ^ (G.tick | 0));
      setBlockNet(w, x, y, z, b, Math.max(m & 7, w.getMeta(x, y, z) & 7) | (1 << 3));
    } finally { DYNT.busy = false; }
    return;
  }
  if (stage >= 3 || Math.random() > 0.5) return;
  DYNT.busy = true; try { dynTreePlace(dynWorldS(w), x, y, z, sp, stage + 1, w.seed); setBlockNet(w, x, y, z, b, (w.getMeta(x, y, z) & 7) | ((stage + 1) << 3)); } finally { DYNT.busy = false; }
}
// ---- tala: al quitar una rama (a mano, explosión...) se mira qué queda sin unión con la raíz
function dynOnRemoved(w, x, y, z, old) {
  if (DYNT.busy || !dynOn(w) || (G.net && G.net.role === 'client')) return;
  DYNT.queue.push([w, x, y, z, old]);
}
function dynProcessQueue() {
  while (DYNT.queue.length) { const [w, x, y, z, old] = DYNT.queue.shift(); try { dynFell(w, x, y, z, old); } catch (e) { console.error(e); } }
}
function dynFell(w, x, y, z, old) {
  const K = (a, b, c) => a + ',' + b + ',' + c; const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  // ramas unidas a la rota (radio 18, máx. 1500)
  const comp = new Map(); const st = [];
  for (const [dx, dy, dz] of N6) { const a = x + dx, b = y + dy, c = z + dz; if (dynIsLog(w.get(a, b, c))) { comp.set(K(a, b, c), [a, b, c]); st.push([a, b, c]); } }
  while (st.length && comp.size < 1500) { const [a, b, c] = st.pop(); for (const [dx, dy, dz] of N6) { const p = a + dx, q = b + dy, r = c + dz; const k = K(p, q, r); if (comp.has(k) || Math.abs(p - x) > 18 || Math.abs(r - z) > 18 || Math.abs(q - y) > 40) continue; if (dynIsLog(w.get(p, q, r))) { comp.set(k, [p, q, r]); st.push([p, q, r]); } } }
  if (!comp.size) return;
  // lo que sigue unido a una raíz (rama apoyada en suelo firme) se queda
  const kept = new Set(); const st2 = [];
  for (const [k, [a, b, c]] of comp) { if (dynGround(w.get(a, b - 1, c))) { kept.add(k); st2.push([a, b, c]); } }
  while (st2.length) { const [a, b, c] = st2.pop(); for (const [dx, dy, dz] of N6) { const k = K(a + dx, b + dy, c + dz); if (comp.has(k) && !kept.has(k)) { kept.add(k); st2.push([a + dx, b + dy, c + dz]); } } }
  const fall = []; for (const [k, v] of comp) if (!kept.has(k)) fall.push(v);
  if (!fall.length) return;
  // tocón: si el corte fue en el tronco, encima de la raíz que se queda
  let stumped = false; const rb = w.get(x, y - 1, z); if (dynIsLog(rb) && kept.has(K(x, y - 1, z))) { stumped = true; const ry = dynRootOf(w, x, y - 1, z); const rm = w.getMeta(x, ry, z); DYNT.busy = true; setBlockNet(w, x, ry, z, w.get(x, ry, z), (rm & 7) | 32); DYNT.busy = false; }
  // hojas de las ramas que caen (y no de las que quedan)
  const fallSet = new Set(fall.map(v => K(v[0], v[1], v[2]))); const leaves = new Map(); const lq = [];
  for (const [a, b, c] of fall) for (const [dx, dy, dz] of N6) lq.push([a + dx, b + dy, c + dz, 1]);
  const nearKept = (a, b, c) => { for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const k = K(a + dx, b + dy, c + dz); if (kept.has(k)) return true; } return false; };
  while (lq.length && leaves.size < 2500) {
    const [a, b, c, d] = lq.pop(); const k = K(a, b, c); if (leaves.has(k) || fallSet.has(k)) continue; const id = w.get(a, b, c);
    if (!(id > 0 && REG[id].leaves) || (w.getMeta(a, b, c) & 1)) continue; if (kept.size && !stumped && nearKept(a, b, c)) continue; // tronco talado: caen todas; rama cortada: las de lo que queda se quedan
    leaves.set(k, [a, b, c, id]); if (d < 6) for (const [dx, dy, dz] of N6) lq.push([a + dx, b + dy, c + dz, d + 1]);
  }
  // el cuerpo que cae: bloques relativos al punto de giro (encima del corte), girando hacia donde no está el jugador
  const p = G.player; let fx = x + 0.5 - (p ? p.x : x), fz = z + 0.5 - (p ? p.z : z); const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  const trunkCut = fall.some(v => v[0] === x && v[2] === z && v[1] === y + 1);
  const blocks = [];
  for (const [a, b, c] of fall) { const id = w.get(a, b, c); blocks.push({ x: a, y: b, z: c, id, m: w.getMeta(a, b, c) }); }
  for (const [a, b, c, id] of leaves.values()) blocks.push({ x: a, y: b, z: c, id, m: 0 });
  DYNT.busy = true; try { for (const B of blocks) setBlockNet(w, B.x, B.y, B.z, 0); } finally { DYNT.busy = false; }
  const piv = [x + 0.5 + fx * 0.5, y + (trunkCut ? 1 : 0.5), z + 0.5 + fz * 0.5];
  for (const B of blocks) { B.rx = B.x - piv[0]; B.ry = B.y - piv[1]; B.rz = B.z - piv[2]; }
  DYNT.falling.push({ w, dim: w.dim, blocks, piv, ax: [fz, 0, -fx], th: 0, om: 0.25, drop: trunkCut ? 0 : 1, vy: 0, dy: 0, t: 0 });
  playSound('break', x, y, z, 1, ID.oak_log);
}
// rotación de Rodrigues (columnas)
function dynRot(ax, th) {
  const [x, y, z] = ax, c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, t * x * y - s * z, t * y * y + c, t * y * z + s * x, t * x * z + s * y, t * y * z - s * x, t * z * z + c];
}
function dynPos(F, R, B, ox, oy, oz) { const vx = B.rx + ox, vy = B.ry + oy, vz = B.rz + oz; return [F.piv[0] + R[0] * vx + R[3] * vy + R[6] * vz, F.piv[1] + F.dy + R[1] * vx + R[4] * vy + R[7] * vz, F.piv[2] + R[2] * vx + R[5] * vy + R[8] * vz]; }
function dynBlocked(F, R) {
  const w = F.w; let i = 0;
  for (const B of F.blocks) {
    const leafy = REG[B.id] && REG[B.id].leaves; if (leafy && (i++ % 3)) continue;
    if (B.rx * B.rx + B.ry * B.ry + B.rz * B.rz < 2.5) continue; // junto al corte (el tocón)
    const p = dynPos(F, R, B, 0.5, 0.5, 0.5); const bx = Math.floor(p[0]), by = Math.floor(p[1]), bz = Math.floor(p[2]); const b = w.get(bx, by, bz);
    if (b > 0 && REG[b].dynLog && (w.getMeta(bx, by, bz) & 7) < 4) continue; // atraviesa las ramas finas de otros árboles
    if (b > 0 && REG[b].solid && !REG[b].replace && !REG[b].leaves) return true; if (p[1] < 1) return true; // las hojas de otros árboles no lo frenan
  }
  return false;
}
function dynFallingUpdate(dt) {
  dynProcessQueue();
  for (let i = DYNT.falling.length - 1; i >= 0; i--) {
    const F = DYNT.falling[i]; F.t += dt; let done = F.t > 6;
    const n = Math.max(1, Math.ceil(dt / 0.02)); const h = dt / n;
    for (let k = 0; k < n && !done; k++) {
      if (F.drop) { F.vy -= 20 * h; const ody = F.dy; F.dy += F.vy * h; if (dynBlocked(F, dynRot(F.ax, F.th))) { F.dy = ody; done = true; } }
      else { F.om += (1.2 + 9 * Math.sin(F.th)) * h; const oth = F.th; F.th = Math.min(Math.PI / 2, F.th + F.om * h); if (dynBlocked(F, dynRot(F.ax, F.th))) { F.th = oth; done = true; } else if (F.th >= Math.PI / 2) done = true; }
    }
    if (done) { DYNT.last = { t: F.t, th: F.th, dy: F.dy, n: F.blocks.length, drop: F.drop }; dynFallingSettle(F); DYNT.falling.splice(i, 1); }
  }
}
// al tocar el suelo desaparece y deja madera, palos, brotes y manzanas donde cayó cada parte
function dynFallingSettle(F) {
  const R = dynRot(F.ax, F.th); const w = F.w; const out = new Map(); const at = new Map();
  const add = (name, n, p) => { if (!(n > 0) || ID[name] === undefined) return; out.set(name, (out.get(name) || 0) + n); if (!at.has(name)) at.set(name, []); at.get(name).push(p); };
  let wood = 0, woodP = []; let sp = 'oak';
  for (const B of F.blocks) {
    const d = REG[B.id]; if (!d) continue; const p = dynPos(F, R, B, 0.5, 0.5, 0.5);
    if (d.dynLog) { sp = d.dynLog; const ww = DYN_W[B.m & 7] / 16; wood += ww * ww * 1.6; woodP.push(p); if ((B.m & 7) <= 1 && Math.random() < 0.2) add('stick', 1, p); }
    else if (d.leaves) {
      const lsp = d.leaves; if (Math.random() < 0.012) add(lsp + '_sapling', 1, p); if (Math.random() < 0.012) add('stick', 1, p); if ((lsp === 'oak' || lsp === 'dark_oak') && Math.random() < 0.006) add('apple', 1, p);
      if (Math.random() < 0.08) blockParticles(w, Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), B.id, 3, 1.5);
    }
  }
  const nlog = Math.max(woodP.length ? 1 : 0, Math.round(wood)); for (let i = 0; i < nlog; i++) add(sp + '_log', 1, woodP[(i * 7) % woodP.length]);
  if (!out.has(sp + '_sapling') && F.blocks.length > 30 && Math.random() < 0.6) add(sp + '_sapling', 1, woodP[woodP.length - 1] || F.piv);
  for (const [name, n] of out) { const ps = at.get(name); let left = n; let j = 0; while (left > 0) { const c = Math.min(left, 16); const p = ps[(j * 5) % ps.length]; dropItem(F.dim, p[0], p[1] + 0.3, p[2], { id: ID[name], c }, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 10); left -= c; j++; } }
  for (const p of woodP.slice(0, 12)) blockParticles(w, Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), ID[sp + '_log'], 4, 2);
  const c = woodP[Math.floor(woodP.length / 2)] || F.piv; playSound('break', c[0], c[1], c[2], 1, ID.oak_log); playSound('fall', c[0], c[1], c[2], 0.8);
  if (G.player && Math.hypot(G.player.x - c[0], G.player.z - c[2]) < 14) G.shake = Math.max(G.shake || 0, 0.35);
}
// dibujo: cada bloque como caja girada con el árbol (las ramas con su grosor)
const _dtm = new Float32Array(16);
function drawFallingTrees(dim) {
  if (!DYNT.falling.length) return; const cam = R.cam;
  for (const F of DYNT.falling) {
    if (F.dim !== dim) continue; const Rm = dynRot(F.ax, F.th); const L = F.w.light(Math.floor(F.piv[0]), Math.floor(F.piv[1]) + 1, Math.floor(F.piv[2]));
    for (const B of F.blocks) {
      const d = REG[B.id]; if (!d || !d.faces) continue; const s = d.dynLog ? DYN_W[B.m & 7] / 16 : 1; const o = (1 - s) / 2;
      const p = dynPos(F, Rm, B, o, 0, o); const m = _dtm;
      m[0] = Rm[0] * s; m[1] = Rm[1] * s; m[2] = Rm[2] * s; m[3] = 0; m[4] = Rm[3]; m[5] = Rm[4]; m[6] = Rm[5]; m[7] = 0; m[8] = Rm[6] * s; m[9] = Rm[7] * s; m[10] = Rm[8] * s; m[11] = 0;
      m[12] = p[0] - cam[0]; m[13] = p[1] - cam[1]; m[14] = p[2] - cam[2]; m[15] = 1;
      drawBox(m, d.faces, L, d.tint ? [0.48, 0.7, 0.32, 1] : null, null, 0);
    }
  }
}
