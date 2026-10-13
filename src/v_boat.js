// ============================================================================
//  Botes: cuerpo rígido que flota por puntos del casco (empuje de Arquímedes en cada uno),
//  así que se inclina con las olas, cabecea y puede volcar si una ola grande lo tumba.
//  Volcado: el jugador se mete debajo y le pega para enderezarlo, o lo rompe y lo vuelve a poner.
// ============================================================================
const BOAT_L = 2.3, BOAT_W = 1.25, BOAT_H = 0.6;
// puntos del casco (locales: x = babor/estribor, y = arriba, z = proa(-)/popa(+)); los de la borda flotan si está volcado
const BOAT_PTS = [];
for (const z of [-1, -0.33, 0.33, 1]) for (const x of [-1, 1]) BOAT_PTS.push([x * BOAT_W * 0.45, 0, z * BOAT_L * 0.45, 1]);
for (const z of [-1, 1]) BOAT_PTS.push([0, 0, z * BOAT_L * 0.5, 1]);
for (const z of [-1, 0, 1]) for (const x of [-1, 1]) BOAT_PTS.push([x * BOAT_W * 0.5, BOAT_H, z * BOAT_L * 0.45, 0.45]);
class Boat extends Entity {
  constructor(dim, x, y, z, yaw) {
    super('boat', dim, x, y, z); this.isBoat = true; this.w = BOAT_W + 0.1; this.h = BOAT_H; this.hp = 3; this.rider = null; this.hits = 0;
    this.yaw = yaw || 0; this.rot = boatRotYaw(this.yaw); this.prot = this.rot.slice(); this.wx = 0; this.wy = 0; this.wz = 0; this.capsized = false; this.rest = 0;
  }
}
function boatRotYaw(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; } // columnas: derecha, arriba, atrás (−adelante)
const bMul = (r, v) => [r[0] * v[0] + r[3] * v[1] + r[6] * v[2], r[1] * v[0] + r[4] * v[1] + r[7] * v[2], r[2] * v[0] + r[5] * v[1] + r[8] * v[2]];
// superficie del agua en (x,z) cerca de y (mar con olas y calma de orilla, agua quieta o partículas); NaN si no hay
function boatSurf(w, x, y, z) {
  const bx = Math.floor(x), bz = Math.floor(z), cy = Math.floor(y);
  for (let yy = cy + 1; yy >= cy - 2; yy--) {
    const b = w.get(bx, yy, bz); if (b <= 0 || !(REG[b].liquid === 1 || REG[b].inWater)) continue;
    if (isOceanTop(w, bx, yy, bz)) return yy + 0.92 + oceanWaveAt(x, z).h * oceanShoreW(w, x, yy, z);
    const up = w.get(bx, yy + 1, bz); if (up > 0 && REG[up].liquid === 1) continue;
    return yy + liquidSurface(w, bx, yy, bz);
  }
  if (typeof flSurfIn === 'function') for (let yy = cy + 1; yy >= cy - 1; yy--) { const s = flSurfIn(w, bx, yy, bz); if (s > 0.05) return yy + s; }
  return NaN;
}
function boatTick(e, dt, w) {
  e.prot = e.rot.slice();
  const n = 4; const h = dt / n;
  for (let s = 0; s < n; s++) boatStep(e, h, w);
  e.yaw = Math.atan2(e.rot[6], e.rot[8]);
  if (e.rider && (e.rider.dead || e.rider.removed || e.rider.boat !== e)) { e.rider = null; e.ctl = null; }
  const up = e.rot[4]; const was = e.capsized; e.capsized = was ? up < 0.6 : up < 0.3; // de lado o boca abajo: volcado (histéresis)
  if (e.capsized && !was) { if (e.rider) boatDismount(e.rider, true); playSound('splash', e.x, e.y, e.z, 0.8); }
  if (e.hurtTime > 0) e.hurtTime--;
  if (e.y < -64) e.removed = true;
}
function boatStep(e, h, w) {
  const R = e.rot; let fx = 0, fy = -9.8, fz = 0, tx = 0, ty = 0, tz = 0; let wet = 0, ux = 0, uz = 0;
  const kB = 9.8 / (10 * 0.15); // con unos 10 puntos hundidos 0,15 se equilibra: más reserva de flotación (aguanta olas y peso, pero inundado de lado o volcado sí se hunde más)
  for (const P of BOAT_PTS) {
    const r = bMul(R, P); const px = e.x + r[0], py = e.y + r[1], pz = e.z + r[2];
    // velocidad del punto: v + ω × r
    const vx = e.vx + e.wy * r[2] - e.wz * r[1], vy = e.vy + e.wz * r[0] - e.wx * r[2], vz = e.vz + e.wx * r[1] - e.wy * r[0];
    let Fx = 0, Fy = 0, Fz = 0;
    const s = boatSurf(w, px, py, pz);
    if (s === s && s > py) { const d = Math.min(s - py, 0.7); Fy += kB * d * P[3]; Fx -= vx * 0.9; Fy -= vy * 1.6; Fz -= vz * 0.9; wet++;
      const ow = isOceanTop(w, Math.floor(px), Math.floor(s - 0.92), Math.floor(pz)) ? oceanWaveAt(px, pz) : null; if (ow) { ux += ow.ux; uz += ow.uz; } }
    // contacto con bloques sólidos: empuja hacia fuera (sobre todo hacia arriba) y frena
    const b = w.get(Math.floor(px), Math.floor(py), Math.floor(pz));
    if (b > 0 && REG[b].solid) { const top = Math.floor(py) + 1; const pen = top - py; if (pen < 0.55) { Fy += pen * 120 - Math.min(0, vy) * 8; Fx -= vx * 4; Fz -= vz * 4; } else { Fx -= vx * 14 + r[0] * 6; Fz -= vz * 14 + r[2] * 6; } }
    fx += Fx; fy += Fy; fz += Fz; tx += r[1] * Fz - r[2] * Fy; ty += r[2] * Fx - r[0] * Fz; tz += r[0] * Fy - r[1] * Fx;
  }
  if (wet) { fx += (ux / wet - e.vx) * 0.6; fz += (uz / wet - e.vz) * 0.6; }
  // remos del jinete
  if (e.rider && !e.capsized && e.ctl) { const c = e.ctl; const fwd = [-R[6], 0, -R[8]]; const th = (c.f ? 12 : 0) - (c.b ? 6 : 0); /* el doble que al principio (iban muy lentos) */ fx += fwd[0] * th * (wet ? 1 : 0.04); fz += fwd[2] * th * (wet ? 1 : 0.04); ty += ((c.l ? 1 : 0) - (c.r ? 1 : 0)) * 5 * (wet ? 1 : 0.3); }
  if (e.rider) fy -= 2.5; // peso del jinete (centro de masa más alto: vuelca antes)
  const I = [1.1, 1.6, 0.55]; // inercia: cabeceo (x) cuesta más que el balanceo (z)
  e.vx += fx * h; e.vy += fy * h; e.vz += fz * h;
  e.wx += tx / I[0] * h; e.wy += ty / I[1] * h; e.wz += tz / I[2] * h;
  const dmp = Math.exp(-(wet ? 1.2 : 0.3) * h); e.wx *= dmp; e.wy *= Math.exp(-(wet ? 2.2 : 0.5) * h); e.wz *= dmp;
  const sp = Math.hypot(e.vx, e.vy, e.vz); if (sp > 14) { e.vx *= 14 / sp; e.vy *= 14 / sp; e.vz *= 14 / sp; }
  e.x += e.vx * h; e.y += e.vy * h; e.z += e.vz * h;
  // integrar la rotación (Rodrigues) y reortogonalizar
  const wl = Math.hypot(e.wx, e.wy, e.wz); if (wl > 1e-6) { const a = wl * h; e.rot = ortho3(mul3(rotAxis(e.wx / wl, e.wy / wl, e.wz / wl, a), e.rot)); }
}
// ---- montar / bajar
function boatMount(p, e) {
  if (e.capsized) { showActionMsg('El bote está volcado: métete debajo y golpéalo para enderezarlo'); return; }
  if (e.rider && e.rider !== p) return;
  if (e.proxy) { netSend({ t: 'boat', a: 'mount', id: e.hostId }); p._boatOffT = 0; return; } // lo confirma el anfitrión (lista de entidades) p.boat = e; e.rider = p; e.ctl = null; p.vx = p.vy = p.vz = 0;
}
function boatDismount(p, thrown) {
  const e = p.boat; if (!e) return; p.boat = null; e.rider = null; e.ctl = null;
  if (p.remotePlayer) return; // jugador remoto en el anfitrión: su posición la manda su cliente
  if (e.proxy) { netSend({ t: 'boat', a: 'off', id: e.hostId }); p._boatOffT = performance.now(); p._bctl = -1; }
  const R = e.rot; p.x = e.x + R[0] * 1.1; p.z = e.z + R[2] * 1.1; p.y = e.y + (thrown ? 0.2 : 0.8); p.vx = e.vx; p.vy = thrown ? 1.5 : 2; p.vz = e.vz; p.fallDist = 0;
}
// el jugador va sentado: sigue al bote; W/S reman, A/D giran; agacharse para bajar
function boatRide(p, dt, input, a = 1) {
  const e = p.boat; if (!e || e.removed || e.dim !== p.dim) { p.boat = null; return; }
  if (input.sneak) { boatDismount(p); return; }
  if (e.proxy) { const k = (input.f ? 1 : 0) | (input.b ? 2 : 0) | (input.l ? 4 : 0) | (input.r ? 8 : 0); if (k !== p._bctl) { p._bctl = k; netSend({ t: 'boat', a: 'ctl', id: e.hostId, k }); } }
  else e.ctl = input;
  const s = bMul(e.rot, [0, 0.25, 0.15]);
  p.x = lerp(e.px, e.x, a) + s[0]; p.y = lerp(e.py, e.y, a) + s[1]; p.z = lerp(e.pz, e.z, a) + s[2]; p.vx = e.vx; p.vy = e.vy; p.vz = e.vz; p.onGround = true; p.fallDist = 0; p.inWater = false; p.eyeInWater = false;
}
// golpe al bote: desde debajo (cabeza bajo el casco) lo endereza; si no, a los tres golpes se rompe y suelta el objeto
function boatHit(e, p, under, creative) {
  if (under === undefined) under = Math.hypot(p.x - e.x, p.z - e.z) < 1.6 && p.eye < e.y + 0.4;
  if (creative === undefined) creative = G.gameMode === 'creative';
  if (e.proxy) { netSend({ t: 'boat', a: 'hit', id: e.hostId, u: under ? 1 : 0, cr: creative ? 1 : 0 }); playSound('hit', e.x, e.y, e.z, 0.6, ID.oak_planks); return; }
  if (e.capsized && under) {
    e.rot = boatRotYaw(e.yaw); e.wx = e.wz = 0; e.wy = 0; e.vy = 3; e.y += 0.3; e.capsized = false;
    playSound('splash', e.x, e.y, e.z, 0.7); if (p === G.player) showActionMsg('Bote enderezado'); return;
  }
  e.hits++; e.hurtTime = 6; e.wz += (Math.random() - 0.5) * 1.5; playSound('hit', e.x, e.y, e.z, 0.6, ID.oak_planks);
  if (e.hits >= 3 || creative) {
    if (e.rider) boatDismount(e.rider); e.removed = true;
    if (!creative) dropItem(e.dim, e.x, e.y + 0.5, e.z, { id: ID.oak_boat, c: 1 }, 0, 2, 0);
    playSound('break', e.x, e.y, e.z, 0.8, ID.oak_planks);
  }
}
// colocar: apuntando a agua (o a un bloque) con el bote en la mano
function boatPlace(p, w) {
  const d = lookDir(p); const hit = raycast(w, p.x, p.eye, p.z, d[0], d[1], d[2], 5, true); if (!hit) return false;
  const x = hit.x + 0.5, z = hit.z + 0.5; const bd = REG[hit.id]; let y;
  if (bd && (bd.liquid === 1 || bd.inWater)) { const s = boatSurf(w, x, hit.y + 0.5, z); y = (s === s ? s : hit.y + 1) - 0.15; }
  else y = hit.y + 1 + (hit.n ? 0 : 0);
  if (w.solidAt(Math.floor(x), Math.floor(y + 0.3), Math.floor(z))) return false;
  if (G.net && G.net.role === 'client') netSend({ t: 'boat', a: 'place', d: p.dim, x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3), yw: +p.yaw.toFixed(3) });
  else { const e = new Boat(p.dim, x, y, z, p.yaw); G.entities.set(e.id, e); } playSound('place', x, y, z, 0.7, ID.oak_planks); return true;
}
// ---- dibujo: casco con cajas (fondo, costados, proa, popa y banco)
const BOAT_BOXES = [
  [-0.5, 0, -0.5, 1, 0.12, 1],                  // fondo
  [-0.5, 0.12, -0.5, 0.1, 0.48, 1], [0.4, 0.12, -0.5, 0.1, 0.48, 1], // costados
  [-0.4, 0.12, -0.5, 0.8, 0.48, 0.07], [-0.4, 0.12, 0.43, 0.8, 0.48, 0.07], // proa y popa
  [-0.4, 0.3, -0.05, 0.8, 0.08, 0.12]           // banco
];
const _bm = new Float32Array(16);
function drawBoat(e, x, y, z, light, alpha) {
  const cam = R.cam; const r0 = e.prot || e.rot, r1 = e.rot; const r = r1.map((v, i) => lerp(r0[i], v, alpha));
  const flash = e.hurtTime > 0 ? [0.7, 0, 0, 0.35] : null; const L = TEX.boat_wood;
  for (const [ox, oy, oz, sx, sy, sz] of BOAT_BOXES) {
    const S = [sx * BOAT_W, sy * BOAT_H / 0.6, sz * BOAT_L]; const o = [ox * BOAT_W, oy * BOAT_H / 0.6 - 0.12, oz * BOAT_L];
    const m = _bm; for (let c = 0; c < 3; c++) { m[c * 4] = r[c * 3] * S[c]; m[c * 4 + 1] = r[c * 3 + 1] * S[c]; m[c * 4 + 2] = r[c * 3 + 2] * S[c]; m[c * 4 + 3] = 0; }
    const t = bMul(r, o); m[12] = x + t[0] - cam[0]; m[13] = y + t[1] - cam[1]; m[14] = z + t[2] - cam[2]; m[15] = 1;
    drawBox(m, L, light, null, flash, 0);
  }
}
// ---- multijugador: el anfitrión simula; los clientes ven réplicas y mandan sus acciones
// anfitrión: mensaje de un cliente (c.ent es su jugador remoto)
function boatNetRecv(c, m) {
  const pl = c.ent; if (!pl) return;
  if (m.a === 'place') { if (G.worlds && G.worlds[m.d]) { const e = new Boat(m.d, m.x, m.y, m.z, m.yw); G.entities.set(e.id, e); } return; }
  const e = G.entities.get(m.id); if (!e || !e.isBoat || e.removed) return;
  if (m.a === 'mount') { if (!e.capsized && (!e.rider || e.rider === pl)) { if (pl.boat && pl.boat !== e && pl.boat.rider === pl) pl.boat.rider = null; e.rider = pl; pl.boat = e; e.ctl = null; } }
  else if (m.a === 'off') { if (e.rider === pl) { e.rider = null; e.ctl = null; } if (pl.boat === e) pl.boat = null; }
  else if (m.a === 'ctl') { if (e.rider === pl) e.ctl = { f: m.k & 1, b: m.k & 2, l: m.k & 4, r: m.k & 8 }; }
  else if (m.a === 'hit') boatHit(e, pl, !!m.u, !!m.cr);
}
// anfitrión: datos del bote para la lista de entidades
function boatNetState(e, o) { o.r = e.rot.map(v => +v.toFixed(3)); o.cp = e.capsized ? 1 : 0; o.ht = e.hurtTime; o.rd = e.rider ? e.rider.id : 0; }
// cliente: aplicar el estado recibido a la réplica y al propio jugador (montado / tirado al agua)
function boatNetApply(e, o) {
  e.tr = o.r; e.hurtTime = o.ht || 0; const was = e.capsized; e.capsized = !!o.cp; const p = G.player; if (!p) return;
  const mine = o.rd === G.myNetId; e.rider = mine ? p : null;
  if (mine && p.boat !== e && performance.now() - (p._boatOffT || 0) > 1500) { p.boat = e; p._bctl = -1; p.vx = p.vy = p.vz = 0; }
  else if (!mine && p.boat === e) { p.boat = null; p._bctl = -1; const R = e.rot; p.x = e.x + R[0] * 1.1; p.z = e.z + R[2] * 1.1; p.y = e.y + 0.3; p.vy = 1.5; p.fallDist = 0; }
  if (e.capsized && !was) playSound('splash', e.x, e.y, e.z, 0.8);
}
