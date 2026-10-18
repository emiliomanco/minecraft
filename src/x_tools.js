// ============================================================================
//  Lanzallamas y esponja
//  · Lanzallamas: como el extintor, pero el chorro es combustible ardiendo. Prende lo inflamable, a los mobs y la
//    dinamita; el calor evapora el agua del fluido continuo a la que se apunta un rato. El agua que descansa sobre
//    un bloque que conduce el calor (hierro, oro, cobre…) con fuego, lava o el chorro justo debajo también hierve.
//  · Esponja (objeto): con el clic derecho mantenido borra el agua y la lava que mira: partículas del fluido continuo
//    y también el líquido normal (lagos, ríos, lava; el mar vuelve a rellenar lo que se le quita)
//    alrededor de donde se apunta. No toca el agua normal ni los océanos.
// ============================================================================
const FLAMER = { heat: new Map(), hot: new Map(), scanT: 0, sent: 0 };
let HEAT_COND = null;
function heatConductor(b) {
  if (!HEAT_COND) { HEAT_COND = new Set(); for (const n in ID) { const id = ID[n]; if (!(id > 0) || !REG[id] || !REG[id].isBlock) continue;
    if (/^(iron_block|gold_block|netherite_block|raw_iron_block|raw_gold_block|cauldron|anvil|iron_trapdoor|iron_bars|lodestone)$/.test(n) || (/copper/.test(n) && !/ore/.test(n))) HEAT_COND.add(id); } }
  return HEAT_COND.has(b);
}
// ¿hay una fuente de calor en esta celda? (fuego, lava, magma, fogata)
function heatSourceAt(w, x, y, z) { const b = w.get(x, y, z); return b > 0 && (b === ID.fire || b === ID.soul_fire || b === ID.lava || b === ID.magma_block || b === ID.campfire || b === ID.soul_campfire); }
// llamado cada cuadro mientras se mantiene el clic derecho con el lanzallamas
function sprayFlamethrower(p) {
  const now = performance.now(); const dt = Math.min(0.1, (now - (p._flameT || now - 16)) / 1000); p._flameT = now;
  const dir = lookDir(p); const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const o = [p.x + dir[0] * 0.7 + rx * 0.25, p.eye - 0.3 + dir[1] * 0.7, p.z + dir[2] * 0.7 + rz * 0.25];
  flamerEmit(p.world, o, dir, dt, p);
  // en multijugador el anfitrión simula los efectos: se le manda el chorro (unas 20 veces por segundo)
  if (G.net && G.net.role === 'client' && now - FLAMER.sent > 50) { FLAMER.sent = now; netSend({ t: 'flm', o: o.map(v => +v.toFixed(2)), dir: dir.map(v => +v.toFixed(3)), dt: 0.05 }); }
  p._flameAcc = (p._flameAcc || 0) + dt; if (p._flameAcc > 0.25) { p._flameAcc = 0; if (G.gameMode !== 'creative') { damageItem(p.inv, p.sel, 1); updateHUD(); } }
}
function flamerEmit(w, o, dir, dt, owner) {
  // bajo el agua no arde: solo vapor
  if (liquidAt(w, o[0], o[1], o[2]) === 1) { if (Math.random() < dt * 10) smoke(o[0], o[1], o[2], { r: 0.9, g: 0.9, b: 0.95, a: 0.3, life: 1 }); return; }
  const n = Math.max(1, Math.round(dt * [30, 45, 65][SETTINGS.particles ?? 2]));
  for (let i = 0; i < n; i++) {
    const sp = 12 + Math.random() * 4, j = 0.07, t0 = Math.random() * dt; // repartidas a lo largo del cuadro: chorro continuo
    const vx = (dir[0] + (Math.random() - 0.5) * j * 2) * sp, vy = (dir[1] + (Math.random() - 0.5) * j * 2) * sp, vz = (dir[2] + (Math.random() - 0.5) * j * 2) * sp;
    const q = P_({ x: o[0] + vx * t0, y: o[1] + vy * t0, z: o[2] + vz * t0, vx, vy, vz, life: 0.55 + Math.random() * 0.35, size: 0.16 + Math.random() * 0.1, grow: 2.4 + Math.random(),
      r: 1, g: 0.95, b: 0.7, a: 0.95, add: true, emis: 5, drag: 2.6, grav: -2.2, collide: true, layer: TEX['flame_' + ((Math.random() * 3) | 0)], rot: Math.random() * 6, vrot: (Math.random() - 0.5) * 6 });
    if (q) { q.flamer = true; q.dim = w.dim; q.owner = owner; }
  }
  if (Math.random() < dt * 5) playSound('ignite', o[0], o[1], o[2], 0.22);
  if (typeof vfxSmokeEmit === 'function' && Math.random() < dt * 3) vfxSmokeEmit(o[0] + dir[0] * 4, o[1] + dir[1] * 4 + 0.6, o[2] + dir[2] * 4, 0.5, 0.8, 0);
}
// cada partícula del chorro, cada cuadro (desde updateParticles)
function flamerAt(w, q, dt) {
  const t = 1 - q.life / q.max; // 0 al salir de la boquilla, 1 al apagarse: de blanco amarillento a naranja oscuro
  q.g = 0.95 - t * 0.6; q.b = Math.max(0.04, 0.7 - t * 1.4); q.emis = 5 * (1 - t * 0.8);
  if (G.net && G.net.role === 'client') return; // los efectos los simula el anfitrión
  const bx = Math.floor(q.x), by = Math.floor(q.y), bz = Math.floor(q.z); const b = w.get(bx, by, bz); const d = b > 0 ? REG[b] : null;
  // agua quieta: la llama se apaga y la calienta (el océano no se acaba)
  if (d && d.liquid) { if (b === ID.water && !(w.getMeta(bx, by, bz) & LIQ_OCEAN)) flamerHeat(bx, by, bz, true, 0.05); q.life = 0; return; }
  // agua del fluido continuo
  if (typeof FL !== 'undefined' && FL.occ && FL.world === w) { const c = FL.occ.get(FLK(bx, by, bz)); if (c && c.idx.length >= 3) { if (c.nw >= c.nl) flamerHeat(bx, by, bz, false, 0.05); q.life = 0; return; } }
  // plantas y cosas inflamables que no son sólidas (pasto, flores…): arden
  if (d && d.flammable && !d.solid && Math.random() < 0.1) { setBlockNet(w, bx, by, bz, ID.fire); return; }
  // bloque que toca: el vecino sólido de la cara a la que está pegada (tras chocar, la partícula ya rebotó)
  const fx = q.x - bx, fy = q.y - by, fz = q.z - bz; const cand = [];
  if (fy < 0.3) cand.push([bx, by - 1, bz]); else if (fy > 0.7) cand.push([bx, by + 1, bz]);
  if (fx < 0.3) cand.push([bx - 1, by, bz]); else if (fx > 0.7) cand.push([bx + 1, by, bz]);
  if (fz < 0.3) cand.push([bx, by, bz - 1]); else if (fz > 0.7) cand.push([bx, by, bz + 1]);
  for (const [hx, hy, hz] of cand) { const hb = w.get(hx, hy, hz); const hd = hb > 0 ? REG[hb] : null; if (!hd || !hd.solid) continue;
    if (hb === ID.tnt) { if (Math.random() < 0.05) { setBlockNet(w, hx, hy, hz, 0); igniteTNT(w, hx, hy, hz); } }
    else if (heatConductor(hb)) FLAMER.hot.set(FLK(hx, hy, hz), performance.now() + 1500);
    const air = b === 0 || (d && d.replace && !d.liquid);
    if (air && (hd.flammable ? Math.random() < 0.08 : hy < by && Math.random() < 0.006)) setBlockNet(w, bx, by, bz, ID.fire); /* lo que no arde solo coge un fuego breve encima */
    break; }
  // entidades alcanzadas: se prenden y se queman
  if (Math.random() < 0.5) for (const e of G.entities.values()) {
    if (e === q.owner || e.removed || e.dead || e.dim !== q.dim || e.isBoat || e.type === 'item' || e instanceof Projectile) continue;
    const hw = (e.w || 0.6) / 2 + 0.2; if (Math.abs(e.x - q.x) > hw || Math.abs(e.z - q.z) > hw || q.y < e.y - 0.2 || q.y > e.y + (e.h || 1.8) + 0.2) continue;
    if (e.def && e.def.fireImmune) continue;
    e.fire = Math.max(e.fire || 0, 120); if (!(e.invul > 0)) hurtEntity(e, 2, q.owner || null, 0, 0, 0, 'fire');
  }
  const P = G.player; if (P && q.owner !== P && !P.dead && P.dim === q.dim && G.gameMode === 'survival' && Math.abs(P.x - q.x) < 0.5 && Math.abs(P.z - q.z) < 0.5 && q.y > P.y - 0.2 && q.y < P.y + 2) { P.fire = Math.max(P.fire || 0, 120); }
}
// calor acumulado en una celda con agua (s: agua quieta en bloque; si no, partículas del fluido continuo)
function flamerHeat(x, y, z, s, a) {
  const k = (s ? 's' : 'p') + x + ',' + y + ',' + z; let h = FLAMER.heat.get(k);
  if (!h) { h = { x, y, z, s, h: 0, acc: 0, part: 0 }; FLAMER.heat.set(k, h); } h.h = Math.min(6, h.h + a);
}
// cada cuadro (tiempo del mundo: con /tick freeze no hierve nada)
function flamerTick(w, dt) {
  if (!dt || (G.net && G.net.role === 'client')) return; const now = performance.now();
  // agua (partículas) sobre un conductor con una fuente de calor justo debajo, o calentado por el chorro
  if ((FLAMER.scanT -= dt) <= 0) { FLAMER.scanT = 0.25;
    if (typeof FL !== 'undefined' && FL.occ && FL.world === w) for (const c of FL.occ.values()) {
      if (c.nw < 3) continue; const cb = w.get(c.x, c.y - 1, c.z); if (!heatConductor(cb)) continue;
      if (heatSourceAt(w, c.x, c.y - 2, c.z) || (FLAMER.hot.get(FLK(c.x, c.y - 1, c.z)) || 0) > now) flamerHeat(c.x, c.y, c.z, false, 0.25 * 0.9);
    }
    for (const [k, t] of FLAMER.hot) if (t < now) FLAMER.hot.delete(k);
  }
  // el calor se va perdiendo; pasado un umbral el agua hierve y se evapora (más deprisa cuanto más caliente)
  for (const [k, h] of FLAMER.heat) {
    h.h -= dt * 0.5; if (h.h <= 0) { FLAMER.heat.delete(k); continue; }
    if (h.h < 2.5) continue;
    h.acc += dt * (h.h - 2) * 14 * (h.s ? 1 : FL_PPB / 216); const n = Math.floor(h.acc); if (n <= 0) continue; h.acc -= n; // (partículas pequeñas: más por segundo, mismo volumen)
    if (!(h.s ? flamerBoilStatic(w, h, n) : flamerBoil(w, h, n))) FLAMER.heat.delete(k);
  }
}
function steamPuff(w, x, y, z, k) {
  if (Math.random() < 0.5) smoke(x + Math.random(), y, z + Math.random(), { r: 0.92, g: 0.93, b: 0.95, a: 0.35, vy: 1.4 + Math.random(), life: 1.4, grow: 1.4 });
  if (typeof vfxSmokeEmit === 'function' && Math.random() < 0.3) vfxSmokeEmit(x + 0.5, y + 0.3, z + 0.5, 0.2 * k, 0.9, 2);
  if (Math.random() < 0.06) playSound('fizz', x + 0.5, y, z + 0.5, 0.35);
}
// evapora n partículas de agua de la celda (o de la de debajo si esta ya se vació); false si no queda agua
function flamerBoil(w, h, n) {
  if (typeof FL === 'undefined' || !FL.occ) return false;
  let c = FL.occ.get(FLK(h.x, h.y, h.z)); if (!c || !c.idx.length) c = FL.occ.get(FLK(h.x, h.y - 1, h.z)); if (!c || !c.idx.length) return false;
  let k = 0; for (let j = c.idx.length - 1; j >= 0 && k < n; j--) { const i = c.idx[j]; const ph = FL.phase[i]; if (ph && ph !== 2 && ph !== 4) { flKill(i); c.idx.splice(j, 1); c.nw = Math.max(0, c.nw - 1); k++; } }
  if (k) steamPuff(w, c.x, Math.max(c.y, c.top), c.z, k);
  return k > 0;
}
// agua quieta en bloque: cada 27 "partículas" (un octavo de bloque) baja un nivel
function flamerBoilStatic(w, h, n) {
  const b = w.get(h.x, h.y, h.z); if (b !== ID.water) return false; const m = w.getMeta(h.x, h.y, h.z); if (m & LIQ_OCEAN) return false;
  h.part += n; steamPuff(w, h.x, h.y + 0.9, h.z, n);
  while (h.part >= 27) { h.part -= 27; const a = liqAmt(w.getMeta(h.x, h.y, h.z)) - 1;
    if (a <= 0) { setBlockNet(w, h.x, h.y, h.z, 0); return false; }
    setBlockNet(w, h.x, h.y, h.z, ID.water, liqMeta(a, false, false) | (m & 16)); }
  return true;
}
// ------------------------------------------------------------ difusor
// Agua y lava (la miel y la leche no tienen versión normal). Modo «Líquido»: las partículas a las que apunta pasan a
// líquido normal (con el mismo volumen); modo «PBF»: el líquido normal pasa a partículas. Sin durabilidad.
const DIFF = { last: 0 };
function diffuserUse(p, s) {
  const pt = fluidAim(p); const mode = s && s.mode === 'pbf' ? 'pbf' : 'liquid'; p.swing = Math.max(p.swing || 0, 0.01);
  if (G.net && G.net.role === 'client') { const now = performance.now(); if (now - (FLAMER.sentD || 0) > 100) { FLAMER.sentD = now; netSend({ t: 'dif', p: pt.map(v => +v.toFixed(2)), m: mode }); } return; }
  const n = diffuserAt(p.world, pt, mode, 1.6); if (n && Math.random() < 0.3) playSound(mode === 'pbf' ? 'splash' : 'bucket', pt[0], pt[1], pt[2], 0.25);
}
function diffuserAt(w, pt, mode, r) {
  const now = performance.now(); if (now - DIFF.last < 100) return 0; DIFF.last = now;
  if (typeof FL === 'undefined' || !flCanSim(w)) { if (w === G.world) showActionMsg('El difusor necesita el fluido continuo (calidad Alta o Ultra con partículas activadas)'); return 0; }
  const ri = Math.ceil(r), cx = Math.floor(pt[0]), cy = Math.floor(pt[1]), cz = Math.floor(pt[2]); let n = 0;
  if (mode === 'pbf') { // líquido normal → partículas
    for (let dy = ri; dy >= -ri; dy--) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
      const x = cx + dx, y = cy + dy, z = cz + dz; const b = w.get(x, y, z); if (b !== ID.water && b !== ID.lava) continue;
      if ((x + 0.5 - pt[0]) ** 2 + (y + 0.5 - pt[1]) ** 2 + (z + 0.5 - pt[2]) ** 2 > (r + 0.5) ** 2 || !flCanSim(w, x, y, z)) continue;
      const a = liqAmt(w.getMeta(x, y, z)); if (flFree() < a / 8 * FL_PPB + 1000 || n >= 6) return n;
      w.set(x, y, z, 0); flSpawnCell(w, x, y, z, a, b === ID.water ? 3 : 2, 0, 0, 0); n++;
    }
    return n;
  }
  if (!FL.rb.ready) return 0; const P = FL.rb.pos, o = FL.rb.orgNow; // partículas → líquido normal
  for (let dy = -ri; dy <= ri; dy++) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
    const c = FL.occ.get(FLK(cx + dx, cy + dy, cz + dz)); if (!c || !c.idx.length) continue;
    for (let j = c.idx.length - 1; j >= 0; j--) { const i = c.idx[j]; const ph = FL.phase[i]; if (!ph) { c.idx.splice(j, 1); continue; } if (ph >= 4) continue; // miel y leche: no compatibles
      const k = i * 4; const x = P[k] + o[0], y = P[k + 1] + o[1], z = P[k + 2] + o[2];
      if ((x - pt[0]) ** 2 + (y - pt[1]) ** 2 + (z - pt[2]) ** 2 > r * r) continue;
      flExitVol(w, Math.floor(x), Math.floor(y), Math.floor(z), ph); flKill(i); c.idx.splice(j, 1); n++; }
  }
  return n;
}
// punto al que apunta una herramienta de líquidos: la primera celda con partículas o con líquido en la mirada (hasta 5
// bloques) o, si no hay, delante del bloque que se mira
function fluidAim(p) {
  const w = p.world, dir = lookDir(p); let pt = null;
  for (let t = 0.4; t < 5; t += 0.2) {
    const x = p.x + dir[0] * t, y = p.eye + dir[1] * t, z = p.z + dir[2] * t; const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    const c = typeof FL !== 'undefined' && FL.occ && FL.occ.get(FLK(bx, by, bz)); if (c && c.idx.length) { pt = [x, y, z]; break; }
    const b = w.get(bx, by, bz); if (b > 0 && REG[b].liquid) { pt = [x, y, z]; break; }
    if (b > 0 && REG[b].solid) { pt = [x - dir[0] * 0.4, y - dir[1] * 0.4, z - dir[2] * 0.4]; break; }
  }
  return pt || [p.x + dir[0] * 2, p.eye + dir[1] * 2, p.z + dir[2] * 2];
}
// ------------------------------------------------------------ esponja
function spongeUse(p) {
  const now = performance.now();
  const w = p.world, dir = lookDir(p); let pt = null;
  // punto: la primera celda con partículas o con líquido en la mirada (hasta 5 bloques) o, si no hay, delante del bloque que se mira
  for (let t = 0.4; t < 5; t += 0.2) {
    const x = p.x + dir[0] * t, y = p.eye + dir[1] * t, z = p.z + dir[2] * t; const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    const c = FL.occ && FL.occ.get(FLK(bx, by, bz)); if (c && c.idx.length) { pt = [x, y, z]; break; }
    const b = w.get(bx, by, bz); if (b > 0 && REG[b].liquid) { pt = [x, y, z]; break; }
    if (b > 0 && REG[b].solid) { pt = [x - dir[0] * 0.4, y - dir[1] * 0.4, z - dir[2] * 0.4]; break; }
  }
  if (!pt) pt = [p.x + dir[0] * 2, p.eye + dir[1] * 2, p.z + dir[2] * 2];
  p.swing = Math.max(p.swing || 0, 0.01);
  if (G.net && G.net.role === 'client') { if (now - (FLAMER.sentS || 0) > 80) { FLAMER.sentS = now; netSend({ t: 'spg', p: pt.map(v => +v.toFixed(2)) }); } return; }
  const n = spongeAt(w, pt, 1.6);
  if (n && Math.random() < 0.3) playSound('splash', pt[0], pt[1], pt[2], 0.25);
}
// borra el líquido normal (celdas de agua o lava) a menos de r del punto, como mucho cada 0,1 s; devuelve cuántas
const SPONGE = { last: 0 };
function spongeStatic(w, pt, r) {
  const now = performance.now(); if (now - SPONGE.last < 100) return 0; SPONGE.last = now;
  const ri = Math.ceil(r), R2 = (r + 0.5) * (r + 0.5); let n = 0; const cx = Math.floor(pt[0]), cy = Math.floor(pt[1]), cz = Math.floor(pt[2]);
  for (let dy = -ri; dy <= ri; dy++) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
    const x = cx + dx, y = cy + dy, z = cz + dz; const b = w.get(x, y, z); if (!(b > 0 && REG[b].liquid)) continue;
    const ex = x + 0.5 - pt[0], ey = y + 0.5 - pt[1], ez = z + 0.5 - pt[2]; if (ex * ex + ey * ey + ez * ez > R2) continue;
    w.set(x, y, z, 0); n++;
  }
  return n;
}
// borra las partículas del fluido continuo y el líquido normal a menos de r del punto; devuelve cuántas partículas/celdas
function spongeAt(w, pt, r) {
  const ns = spongeStatic(w, pt, r);
  if (typeof FL === 'undefined' || !FL.ok || FL.world !== w || !FL.rb.ready) return ns;
  const P = FL.rb.pos, o = FL.rb.orgNow; const R2 = r * r; const ri = Math.ceil(r); let n = 0;
  const cx = Math.floor(pt[0]), cy = Math.floor(pt[1]), cz = Math.floor(pt[2]);
  for (let dy = -ri; dy <= ri; dy++) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
    const c = FL.occ.get(FLK(cx + dx, cy + dy, cz + dz)); if (!c || !c.idx.length) continue;
    for (let j = c.idx.length - 1; j >= 0; j--) { const i = c.idx[j]; if (!FL.phase[i]) { c.idx.splice(j, 1); continue; } const k = i * 4;
      const ex = P[k] + o[0] - pt[0], ey = P[k + 1] + o[1] - pt[1], ez = P[k + 2] + o[2] - pt[2];
      if (ex * ex + ey * ey + ez * ez < R2) { flKill(i); c.idx.splice(j, 1); n++; } }
  }
  n += ns * FL_PPB / 8;
  if (n) for (let i = 0; i < Math.min(6, n / 20); i++) P_({ x: pt[0] + (Math.random() - 0.5) * r, y: pt[1] + (Math.random() - 0.5) * r, z: pt[2] + (Math.random() - 0.5) * r, vy: 0.5, life: 0.5, size: 0.08, r: 0.6, g: 0.75, b: 1, a: 0.6, grav: 4, layer: TEX.drip });
  return n;
}
