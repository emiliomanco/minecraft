// ============================================================================
//  Ragdolls: física de muñeco de trapo para mobs y jugador
//  (dinámica basada en posiciones / Verlet, inspirada en «Sable: Ragdolls» y «Physics Mod»)
// ============================================================================
// Cada grupo de partes del modelo (cabeza, torso, brazo...) es un cuerpo rígido representado por 4 partículas:
// el centro y tres puntos a distancia RAG_H sobre sus ejes; 6 distancias fijas lo mantienen rígido y de ahí se
// recupera la orientación. Un punto cualquiera del cuerpo es una combinación lineal de esas 4 partículas, así que
// articulaciones, colisiones y fricción se resuelven moviendo las partículas con pesos (PBD generalizado).
const RAG_H = 0.25, RAG_G = 26;
const RAG = { list: [] };
// opciones (el menú de físicas las podrá cambiar): activado, duración del cadáver, umbral de empujón y de caída
function ragCfg() { const o = SETTINGS.physics && SETTINGS.physics.ragdoll; return Object.assign({ on: true, corpse: 4, knock: 6, fall: 20, max: 20 }, o || {}); }
function ragdollsOn() { return R.q > 0 && ragCfg().on; }

// ---- vectores pequeños
const rv = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] };

// partes del modelo de una entidad (incluye la armadura del jugador) y su escala
function ragModelOf(e) {
  if (e.type === 'player') return { parts: MODELS.steve.concat(playerArmorParts(e)), scale: 0.9375, tint: [1, 1, 1, 1] };
  const d = MOB[e.type]; if (!d) return null; const parts = MODELS[d.model]; if (!parts) return null;
  let tint = d.tint ? [...d.tint, 1] : [1, 1, 1, 1]; if (e.type === 'sheep' && e.color) tint = [...e.color, 1];
  return { parts, scale: (MODEL_SCALE[d.model] || 1) * (d.scale || 1), tint, emis: (e.type === 'blaze' || e.type === 'magma_cube') ? 0.6 : 0 };
}
// transformación mundial de una parte en la pose actual (igual que drawModel, sin la escala de la caja)
function ragPartFrame(pt, e, x, y, z, yaw, scale, t) {
  const m = M4.create(); M4.ident(m); M4.translate(m, x, y, z); M4.rotY(m, yaw); const sc = scale / 16; M4.scale(m, sc, sc, sc);
  M4.translate(m, pt.p[0], pt.p[1], pt.p[2]); const off = partOffset(pt, e, t); if (off) M4.translate(m, off[0], off[1], off[2]);
  const pivot = M4.xform(m, 0, 0, 0);
  const r = partRot(pt, e, t); if (r[1]) M4.rotY(m, r[1]); if (r[0]) M4.rotX(m, r[0]); if (r[2]) M4.rotZ(m, r[2]);
  const c = M4.xform(m, pt.o[0] + pt.s[0] / 2, pt.o[1] + pt.s[1] / 2, pt.o[2] + pt.s[2] / 2);
  const ax = [rv.norm([m[0], m[1], m[2]]), rv.norm([m[4], m[5], m[6]]), rv.norm([m[8], m[9], m[10]])];
  return { c: [c[0], c[1], c[2]], ax, half: [pt.s[0] * sc / 2, pt.s[1] * sc / 2, pt.s[2] * sc / 2], pivot: [pivot[0], pivot[1], pivot[2]] };
}
// límites de giro de cada articulación respecto del torso (radianes)
const RAG_LIMIT = { head: 0.9, dhead: 0.9, legR: 1.5, legL: 1.5, legFR: 1.3, legFL: 1.3, legBR: 1.3, legBL: 1.3, wingR: 1.6, wingL: 1.6 };

function startRagdoll(e, imp, alive, dur) {
  if (!ragdollsOn() || e.ragdoll || e.removed) return null;
  const M = ragModelOf(e); if (!M) return null;
  const cfg = ragCfg();
  // límite de ragdolls activos: se descartan los cadáveres más viejos
  while (RAG.list.length >= cfg.max) { const old = RAG.list.shift(); if (old.entity) old.entity.ragdoll = null; }
  const t = performance.now() / 1000;
  const yaw = e.yaw || 0, x = e.x, y = e.y - (e.sneaking ? 0.12 : 0), z = e.z;
  // agrupar partes por papel: las que comparten papel (p. ej. cabeza + nariz) forman un solo cuerpo
  const groups = new Map();
  for (const pt of M.parts) { const key = pt.r + (pt.k !== undefined ? '#' + pt.k : ''); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(pt); }
  const bodies = [];
  for (const [key, pts] of groups) {
    const F = ragPartFrame(pts[0], e, x, y, z, yaw, M.scale, t);
    const b = { key, role: pts[0].r, parts: [], half: F.half, pivot: F.pivot, p: new Float64Array(12), q: new Float64Array(12), contact: 0 };
    const c = F.c, ax = F.ax;
    const set = (i, v) => { b.p[i * 3] = v[0]; b.p[i * 3 + 1] = v[1]; b.p[i * 3 + 2] = v[2]; };
    set(0, c); set(1, rv.add(c, rv.mul(ax[0], RAG_H))); set(2, rv.add(c, rv.mul(ax[1], RAG_H))); set(3, rv.add(c, rv.mul(ax[2], RAG_H)));
    for (const pt of pts) { // cada caja del cuerpo en coordenadas locales del cuerpo
      const G2 = ragPartFrame(pt, e, x, y, z, yaw, M.scale, t); const d = rv.sub(G2.c, c);
      b.parts.push({ pt, off: [rv.dot(d, ax[0]), rv.dot(d, ax[1]), rv.dot(d, ax[2])], rot: [0, 1, 2].map(i => [rv.dot(G2.ax[i], ax[0]), rv.dot(G2.ax[i], ax[1]), rv.dot(G2.ax[i], ax[2])]), half: G2.half });
    }
    bodies.push(b);
  }
  let root = bodies.find(b => b.role === 'body') || bodies[0];
  // articulaciones: cada cuerpo se une al torso en su pivote (hombro, cadera, cuello...)
  const joints = [];
  for (const b of bodies) {
    if (b === root) continue;
    const pa = ragLocal(root, b.pivot), pb = ragLocal(b, b.pivot);
    const lim = RAG_LIMIT[b.role] ?? (b.role.startsWith('arm') ? 2.7 : b.role === 'body' ? 0.25 : 1.2);
    // dirección de reposo del cuerpo (pivote → centro) en el marco del torso, para limitar el ángulo
    const dir = rv.norm(rv.sub(ragCenter(b), b.pivot)); const ra = ragAxes(root);
    joints.push({ a: root, b, la: pa, lb: pb, lim, rest: [rv.dot(dir, ra[0]), rv.dot(dir, ra[1]), rv.dot(dir, ra[2])], len: rv.len(rv.sub(ragCenter(b), b.pivot)) });
  }
  // velocidad inicial: la de la entidad + el impulso del golpe, con un poco de giro
  const v = [(e.vx || 0) + (imp ? imp[0] : 0), (e.vy || 0) + (imp ? imp[1] : 0), (e.vz || 0) + (imp ? imp[2] : 0)];
  const dt = 1 / 60;
  for (const b of bodies) {
    const spin = imp ? rv.len(imp) * 0.04 : 0; const jit = () => (Math.random() - 0.5) * spin;
    for (let i = 0; i < 4; i++) { b.q[i * 3] = b.p[i * 3] - (v[0] + jit()) * dt; b.q[i * 3 + 1] = b.p[i * 3 + 1] - (v[1] + jit()) * dt; b.q[i * 3 + 2] = b.p[i * 3 + 2] - (v[2] + jit()) * dt; }
  }
  const rd = { entity: e, dim: e.dim, world: e.world || G.world, model: M, bodies, joints, root, alive: !!alive, t: 0, dur: dur ?? (alive ? 1.8 : cfg.corpse), sleep: 0, still: 0, maxImpact: 0, fallDmg: !!alive, isPlayer: e === G.player };
  e.ragdoll = rd; RAG.list.push(rd);
  return rd;
}
// ---- marco de un cuerpo a partir de sus 4 partículas
function ragCenter(b) { return [b.p[0], b.p[1], b.p[2]]; }
function ragAxes(b) {
  const c = ragCenter(b); let x = rv.sub([b.p[3], b.p[4], b.p[5]], c), y = rv.sub([b.p[6], b.p[7], b.p[8]], c);
  x = rv.norm(x); y = rv.norm(rv.sub(y, rv.mul(x, rv.dot(y, x)))); const z = rv.cross(x, y); return [x, y, z];
}
function ragLocal(b, w) { const c = ragCenter(b), ax = ragAxes(b), d = rv.sub(w, c); return [rv.dot(d, ax[0]), rv.dot(d, ax[1]), rv.dot(d, ax[2])]; }
// pesos de un punto local (lx,ly,lz) sobre las 4 partículas
function ragW(l) { const h = 1 / RAG_H; return [1 - (l[0] + l[1] + l[2]) * h, l[0] * h, l[1] * h, l[2] * h]; }
function ragPoint(b, w) { const p = b.p; return [w[0] * p[0] + w[1] * p[3] + w[2] * p[6] + w[3] * p[9], w[0] * p[1] + w[1] * p[4] + w[2] * p[7] + w[3] * p[10], w[0] * p[2] + w[1] * p[5] + w[2] * p[8] + w[3] * p[11]]; }
function ragMove(b, w, d, s) { for (let i = 0; i < 4; i++) { const k = w[i] * s; b.p[i * 3] += d[0] * k; b.p[i * 3 + 1] += d[1] * k; b.p[i * 3 + 2] += d[2] * k; } }
const RAG_W2 = w => w[0] * w[0] + w[1] * w[1] + w[2] * w[2] + w[3] * w[3];
// rigidez: centro-eje = H, eje-eje = H·√2
const RAG_PAIRS = [[0, 1, RAG_H], [0, 2, RAG_H], [0, 3, RAG_H], [1, 2, RAG_H * Math.SQRT2], [1, 3, RAG_H * Math.SQRT2], [2, 3, RAG_H * Math.SQRT2]];
function ragRigid(b) {
  const p = b.p;
  for (const [i, j, L] of RAG_PAIRS) { const dx = p[j * 3] - p[i * 3], dy = p[j * 3 + 1] - p[i * 3 + 1], dz = p[j * 3 + 2] - p[i * 3 + 2]; const d = Math.hypot(dx, dy, dz) || 1e-6; const k = (d - L) / d * 0.5; p[i * 3] += dx * k; p[i * 3 + 1] += dy * k; p[i * 3 + 2] += dz * k; p[j * 3] -= dx * k; p[j * 3 + 1] -= dy * k; p[j * 3 + 2] -= dz * k; }
}
// ---- colisión de un punto con el mundo de bloques: devuelve [normal, profundidad] o null
const _rbx = [];
function ragHit(w, q) {
  const bx = Math.floor(q[0]), by = Math.floor(q[1]), bz = Math.floor(q[2]); const id = w.get(bx, by, bz); if (id <= 0) return null;
  const d = REG[id]; if (!d || !d.solid) return null;
  _rbx.length = 0; blockBoxes(id, w.getMeta(bx, by, bz), bx, by, bz, _rbx, w);
  for (const bb of _rbx) {
    if (q[0] <= bb[0] || q[0] >= bb[3] || q[1] <= bb[1] || q[1] >= bb[4] || q[2] <= bb[2] || q[2] >= bb[5]) continue;
    // salir por la cara más cercana que dé a un hueco (preferir hacia arriba)
    const opts = [[q[1] - bb[1], 0, -1, 0], [bb[4] - q[1] - 0.02, 0, 1, 0], [q[0] - bb[0], -1, 0, 0], [bb[3] - q[0], 1, 0, 0], [q[2] - bb[2], 0, 0, -1], [bb[5] - q[2], 0, 0, 1]];
    let best = null;
    for (const o of opts) { const nb = w.get(bx + o[1], by + o[2], bz + o[3]); const free = !(nb > 0 && REG[nb] && REG[nb].solid && !REG[nb].shape && !REG[nb].box && REG[nb].render !== 'snow'); const cost = o[0] + (free ? 0 : 0.6); if (!best || cost < best[0]) best = [cost, o]; }
    const o = best[1]; return [[o[1], o[2], o[3]], o[0] + 0.001];
  }
  return null;
}
// esquinas de las cajas de un cuerpo (pesos precalculados al primer uso)
function ragCorners(b) {
  if (b.corners) return b.corners; const out = [];
  for (const P of b.parts) { const h = P.half; for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) for (let sz = -1; sz <= 1; sz += 2) { const lx = P.off[0] + (P.rot[0][0] * h[0] * sx + P.rot[1][0] * h[1] * sy + P.rot[2][0] * h[2] * sz), ly = P.off[1] + (P.rot[0][1] * h[0] * sx + P.rot[1][1] * h[1] * sy + P.rot[2][1] * h[2] * sz), lz = P.off[2] + (P.rot[0][2] * h[0] * sx + P.rot[1][2] * h[1] * sy + P.rot[2][2] * h[2] * sz); out.push(ragW([lx * 0.97, ly * 0.97, lz * 0.97])); } }
  b.corners = out; return out;
}
function ragStep(rd, dt) {
  const w = rd.world; const g = RAG_G * dt * dt;
  for (const b of rd.bodies) {
    const c = ragCenter(b); const L = w.get(Math.floor(c[0]), Math.floor(c[1]), Math.floor(c[2])); const inLiq = L > 0 && REG[L] && REG[L].liquid;
    const damp = inLiq ? 0.9 : 0.995, gg = inLiq ? -g * 0.15 : g;
    for (let i = 0; i < 4; i++) { const k = i * 3; for (let a = 0; a < 3; a++) { const v = (b.p[k + a] - b.q[k + a]) * damp; b.q[k + a] = b.p[k + a]; b.p[k + a] += v; } b.p[k + 1] -= gg; }
  }
  for (let it = 0; it < 5; it++) {
    for (const b of rd.bodies) ragRigid(b);
    for (const J of rd.joints) {
      const wa = ragW(J.la), wb = ragW(J.lb); const pa = ragPoint(J.a, wa), pb = ragPoint(J.b, wb); const d = rv.sub(pb, pa); const s = RAG_W2(wa) + RAG_W2(wb);
      ragMove(J.a, wa, d, 1 / s); ragMove(J.b, wb, d, -1 / s);
      // límite de ángulo: la dirección pivote→centro del cuerpo no puede alejarse más de J.lim de la de reposo
      const ra = ragAxes(J.a), rest = rv.add(rv.add(rv.mul(ra[0], J.rest[0]), rv.mul(ra[1], J.rest[1])), rv.mul(ra[2], J.rest[2]));
      const piv = ragPoint(J.b, wb), cb = ragCenter(J.b), dir = rv.norm(rv.sub(cb, piv)); const cos = rv.dot(dir, rest);
      if (cos < Math.cos(J.lim)) {
        const axis = rv.norm(rv.cross(rest, dir)); const tgt = rv.add(rv.mul(rest, Math.cos(J.lim)), rv.mul(rv.cross(axis, rest), Math.sin(J.lim)));
        const want = rv.add(piv, rv.mul(tgt, J.len)); const dd = rv.mul(rv.sub(want, cb), 0.5);
        for (let i = 0; i < 4; i++) { J.b.p[i * 3] += dd[0]; J.b.p[i * 3 + 1] += dd[1]; J.b.p[i * 3 + 2] += dd[2]; }
        // el giro hay que aplicarlo al cuerpo entero: se reajusta la articulación en la siguiente iteración
      }
    }
    // colisión con bloques + fricción en el punto de contacto
    for (const b of rd.bodies) {
      b.contact = Math.max(0, b.contact - 1);
      for (const cw of ragCorners(b)) {
        const q = ragPoint(b, cw); const hit = ragHit(w, q); if (!hit) continue;
        const [n, depth] = hit; const s = 1 / RAG_W2(cw); ragMove(b, cw, rv.mul(n, depth), s); b.contact = 3;
        if (it === 4) { // fricción: frenar la velocidad tangencial del punto (en las posiciones previas)
          let vx = 0, vy = 0, vz = 0; for (let i = 0; i < 4; i++) { vx += cw[i] * (b.p[i * 3] - b.q[i * 3]); vy += cw[i] * (b.p[i * 3 + 1] - b.q[i * 3 + 1]); vz += cw[i] * (b.p[i * 3 + 2] - b.q[i * 3 + 2]); }
          const vn = vx * n[0] + vy * n[1] + vz * n[2]; const imp = Math.abs(vn) / dt; if (imp > rd.maxImpact) rd.maxImpact = imp;
          const tx = vx - n[0] * vn, ty = vy - n[1] * vn, tz = vz - n[2] * vn; const mu = 0.8 * s;
          // rebote casi nulo: anular la velocidad normal entrante
          const nn = vn < 0 ? vn * s : 0;
          for (let i = 0; i < 4; i++) { b.q[i * 3] += cw[i] * (tx * mu + n[0] * nn); b.q[i * 3 + 1] += cw[i] * (ty * mu + n[1] * nn); b.q[i * 3 + 2] += cw[i] * (tz * mu + n[2] * nn); }
        }
      }
    }
  }
}
function ragUpdate(dt) {
  if (!RAG.list.length) return;
  dt = Math.min(dt, 0.1); // a pocos FPS se subdivide en vez de ir a cámara lenta
  for (let i = RAG.list.length - 1; i >= 0; i--) {
    const rd = RAG.list[i]; const e = rd.entity;
    if (e && rd.isPlayer && !rd.alive && !e.dead) { if (e.ragdoll === rd) e.ragdoll = null; RAG.list.splice(i, 1); continue; } // reapareció
    if (e && (e.removed || e.ragdoll !== rd)) { if (e.ragdoll === rd) e.ragdoll = null; rd.entity = null; if (rd.alive) { RAG.list.splice(i, 1); continue; } }
    rd.t += dt;
    // dormir cuando todo está quieto
    let mv = 0; for (const b of rd.bodies) for (let k = 0; k < 12; k++) mv = Math.max(mv, Math.abs(b.p[k] - b.q[k]));
    if (mv < 0.0015 && rd.t > 0.6) rd.still += dt; else rd.still = 0;
    if (rd.still < 0.8) { const n = clamp(Math.ceil(dt * 90), 1, 9); for (let s = 0; s < n; s++) ragStep(rd, dt / n); }
    // caída: el golpe contra el suelo hace daño a las entidades vivas en ragdoll (la física normal está en pausa)
    if (rd.alive && e && rd.fallDmg && rd.maxImpact > 12) { const dmg = Math.floor(rd.maxImpact * rd.maxImpact / (2 * RAG_G) - 3); rd.fallDmg = false; if (dmg > 0) { if (e === G.player) e.damage(dmg, 'fall'); else hurtEntity(e, dmg, null, 0, 0, 0, 'fall'); playSound('fall', e.x, e.y, e.z, 0.8); } }
    const c = ragCenter(rd.root);
    if (e && rd.alive) {
      // la entidad sigue al torso; se levanta al terminar (o al morir pasa a cadáver)
      e.x = e.px = c[0]; e.z = e.pz = c[2]; e.y = e.py = ragGround(rd.world, c); e.vx = e.vy = e.vz = 0; e.fallDist = 0;
      if (e.dead) { rd.alive = false; rd.t = 0; rd.dur = ragCfg().corpse; }
      else if (rd.t > rd.dur && (rd.still > 0.15 || rd.t > rd.dur + 2)) { endRagdoll(rd); RAG.list.splice(i, 1); continue; }
    }
    if (!rd.alive && rd.t > rd.dur) { for (let k = 0; k < 6; k++) smoke(c[0] + (Math.random() - 0.5), c[1] + Math.random() * 0.6, c[2] + (Math.random() - 0.5), { r: 0.75, g: 0.75, b: 0.75, a: 0.5, size: 0.5, life: 1.2 }); if (e && e.ragdoll === rd) e.ragdoll = null; RAG.list.splice(i, 1); }
  }
}
// altura del suelo bajo un punto (para dejar a la entidad de pie donde quedó el torso)
function ragGround(w, c) { let y = Math.floor(c[1]); for (let k = 0; k < 6; k++, y--) { const b = w.get(Math.floor(c[0]), y, Math.floor(c[2])); if (b > 0 && REG[b] && REG[b].solid) return y + 1; } return c[1] - 0.6; }
function endRagdoll(rd) {
  const e = rd.entity; if (!e) return; e.ragdoll = null;
  const c = ragCenter(rd.root); const fwd = ragAxes(rd.root)[2]; e.yaw = Math.atan2(fwd[0], fwd[2]); // se levanta mirando hacia donde quedó la cabeza
  e.y = e.py = ragGround(rd.world, c) + 0.01; e.vx = e.vy = e.vz = 0; e.onGround = false;
}
// tecla de ragdoll: dejarse caer / levantarse
function playerRagdollToggle() {
  const p = G.player; if (!p || p.dead) return;
  if (p.ragdoll) { const rd = p.ragdoll; rd.dur = 0; rd.still = 1; return; }
  if (!ragdollsOn()) { chatMsg(R.q === 0 ? 'Los ragdolls necesitan gráficos Normales o mejores.' : 'Los ragdolls están desactivados en Opciones.', '#ccc'); return; }
  const f = lookDir(p); startRagdoll(p, [f[0] * 2, 1, f[2] * 2], true, 1e9);
}
// golpe fuerte / explosión: ragdoll temporal si el empujón supera el umbral
function ragKnock(e, kx, ky, kz) { if (e.ragdoll || !ragdollsOn()) return; const k = Math.hypot(kx, ky, kz); if (k < ragCfg().knock) return; startRagdoll(e, [kx * 0.3, ky * 0.3, kz * 0.3], true, 1.2 + Math.min(1.5, k * 0.08)); }
// caída rápida: el cuerpo se suelta en el aire y el impacto decide el daño
function ragFallCheck(e, vy) { if (e.ragdoll || !ragdollsOn() || e.flying || e.gliding) return; if (-vy > ragCfg().fall && !e.onGround) startRagdoll(e, null, true, 1.6); }
// ---- dibujo
function drawRagdolls(dim, selfFirstPerson) {
  if (!RAG.list.length) return;
  const m = M4.create();
  for (const rd of RAG.list) {
    if (rd.dim !== dim) continue;
    const c = ragCenter(rd.root); const L = rd.world.light(Math.floor(c[0]), Math.floor(c[1] + 0.3), Math.floor(c[2]));
    const flash = (!rd.alive && rd.t < 0.35) || (rd.entity && rd.entity.hurtTime > 0) ? [0.7, 0, 0, 0.45] : null;
    for (const b of rd.bodies) {
      if (selfFirstPerson && rd.isPlayer && (b.role === 'head')) continue; // la cámara está dentro de la cabeza
      const bc = ragCenter(b), ax = ragAxes(b);
      for (const P of b.parts) {
        const o = P.off; const cx = bc[0] + ax[0][0] * o[0] + ax[1][0] * o[1] + ax[2][0] * o[2] - R.cam[0], cy = bc[1] + ax[0][1] * o[0] + ax[1][1] * o[1] + ax[2][1] * o[2] - R.cam[1], cz = bc[2] + ax[0][2] * o[0] + ax[1][2] * o[1] + ax[2][2] * o[2] - R.cam[2];
        // ejes de la caja = ejes del cuerpo · rotación local de la caja
        const A = [0, 1, 2].map(i => { const r = P.rot[i]; return [ax[0][0] * r[0] + ax[1][0] * r[1] + ax[2][0] * r[2], ax[0][1] * r[0] + ax[1][1] * r[1] + ax[2][1] * r[2], ax[0][2] * r[0] + ax[1][2] * r[1] + ax[2][2] * r[2]]; });
        const h = P.half;
        m[0] = A[0][0] * h[0] * 2; m[1] = A[0][1] * h[0] * 2; m[2] = A[0][2] * h[0] * 2; m[3] = 0;
        m[4] = A[1][0] * h[1] * 2; m[5] = A[1][1] * h[1] * 2; m[6] = A[1][2] * h[1] * 2; m[7] = 0;
        m[8] = A[2][0] * h[2] * 2; m[9] = A[2][1] * h[2] * 2; m[10] = A[2][2] * h[2] * 2; m[11] = 0;
        m[12] = cx - (A[0][0] * h[0] + A[1][0] * h[1] + A[2][0] * h[2]); m[13] = cy - (A[0][1] * h[0] + A[1][1] * h[1] + A[2][1] * h[2]); m[14] = cz - (A[0][2] * h[0] + A[1][2] * h[1] + A[2][2] * h[2]); m[15] = 1;
        drawBox(m, P.pt.t, L, rd.model.tint, flash, rd.model.emis || 0);
      }
    }
  }
}
// cámara en primera persona pegada a la cabeza del ragdoll del jugador
function ragdollCamera(p) {
  const rd = p.ragdoll; if (!rd) return null; const hb = rd.bodies.find(b => b.role === 'head'); if (!hb) return null;
  const ax = ragAxes(hb), c = ragCenter(hb); const f = rv.mul(ax[2], -1); // el frente del modelo es −Z
  return { eye: [c[0] + ax[1][0] * 0.05, c[1] + ax[1][1] * 0.05, c[2] + ax[1][2] * 0.05], yaw: Math.atan2(-f[0], -f[2]), pitch: Math.asin(clamp(f[1], -1, 1)), roll: Math.asin(clamp(ax[0][1], -1, 1)) * 0.8 };
}
