// ============================================================================
//  Fluidos: agua y lava de volumen finito, océano como reserva infinita
// ============================================================================
// Cada celda guarda su volumen en octavos (liqAmt: 1..8) y nunca se crea ni se destruye líquido, salvo el
// océano (LIQ_OCEAN), que es una reserva infinita: rellena los huecos que se le abren al lado o debajo.
// Reglas por celda despierta: 1) caer: llenar la celda de abajo; 2) nivelar: repartir con las vecinas más bajas
// (diferencia ≥ 2 octavos); 3) presión: si solo hay diferencias de 1, buscar dentro del mismo cuerpo de agua
// (BFS corto) una celda 2 octavos más baja y pasarle un octavo directamente — así un lago se vacía de forma
// pareja por un canal en vez de quedar en rampa. Cada movimiento baja la energía, así que siempre se detiene.
// La lava es muy viscosa: actualiza cada ~1,5 s, solo fluye con diferencias ≥ 2, nunca queda más fina de 2/8
// (salvo cayendo) y reacciona con el agua (obsidiana/roca), con lo inflamable (fuego) y con la nieve/hielo.
function fluidCfg() { const o = physCfg('liquids'); return { finite: o.real, lavaVisc: o.lavaVisc || 1, waterSpeed: o.waterSpeed || 1, splash: o.splash !== false, ocean: true }; }
const FLU = { budget: 2500, used: 0, tick: -1, moved: 0 };
function fluidDelay(w, liq, falling) { if (liq === 1) return Math.max(1, Math.round((falling ? 2 : 4) / fluidCfg().waterSpeed)); return Math.round((w.dim === 'nether' ? 8 : 26) * fluidCfg().lavaVisc); }
function isLiq(id) { return id > 0 && REG[id] && REG[id].liquid; }
// volumen de una celda del líquido liq (0 si está vacía y se puede llenar, -1 si es sólida o de otro líquido)
function cellVol(w, x, y, z, liq) {
  const b = w.get(x, y, z); if (b === 0) return 0; if (b < 0) return -1; const d = REG[b];
  if (d.liquid === liq) return liqAmt(w.getMeta(x, y, z)); if (d.liquid) return -1;
  if (d.replace && !d.inWater && !d.solid) return 0; return -1;
}
function isOcean(w, x, y, z) { return w.get(x, y, z) === ID.water && (w.getMeta(x, y, z) & LIQ_OCEAN) !== 0; }
// escribe el volumen nuevo (0 = vaciar); rompe plantas/antorchas que el líquido inunda
function setVol(w, x, y, z, liq, amt, fall) {
  const id = liq === 1 ? ID.water : ID.lava; const b = w.get(x, y, z);
  if (amt <= 0) { if (isLiq(b)) w.set(x, y, z, 0); return; }
  if (b > 0 && !isLiq(b)) { if (liq === 2 && REG[b].flammable) { } dropBlockItems(w, x, y, z, b, null, true); }
  const m = liqMeta(amt, fall, false); if (b !== id || w.getMeta(x, y, z) !== m) w.set(x, y, z, id, m);
  FLU.moved++;
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function shuffled4() { const a = N4.slice(); for (let i = 3; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
// celda vacía donde caería el líquido (para que los charcos de 1/8 se vayan por los bordes)
function dropBelow(w, x, y, z, liq) { const v = cellVol(w, x, y - 1, z, liq); return v >= 0 && v < 8; }
function fluidTick(w, x, y, z) {
  const id = w.get(x, y, z); if (!isLiq(id)) return; const liq = REG[id].liquid;
  if (G.tick !== FLU.tick) { FLU.tick = G.tick; FLU.used = 0; }
  if (FLU.used++ > FLU.budget) { w.scheduleTick(x, y, z, 1 + (Math.random() * 3 | 0), 0); return; } // presupuesto por tick
  const meta = w.getMeta(x, y, z);
  if (liq === 1 && w.dim === 'nether') { w.set(x, y, z, 0); fizz(w, x, y, z); return; }
  if (liq === 2 && lavaReact(w, x, y, z, meta)) return;
  // el agua y la lava normales nunca pasan a partículas (solo el cubo las crea); las partículas sí se funden con ellas al tocarlas
  if (liq === 1 && (meta & LIQ_OCEAN)) return oceanTick(w, x, y, z);
  if (!fluidCfg().finite) return legacyFlow(w, x, y, z, id, liq, meta);
  let a = liqAmt(meta); const delay = fluidDelay(w, liq, false);
  // ¿sigue siendo un chorro? (hay líquido encima)
  const above = w.get(x, y + 1, z); const fallNow = isLiq(above) && REG[above].liquid === liq && !(liq === 1 && (w.getMeta(x, y + 1, z) & LIQ_OCEAN));
  // 1) caer
  const vb = cellVol(w, x, y - 1, z, liq);
  if (vb >= 0 && vb < 8) {
    const mv = Math.min(a, 8 - vb); setVol(w, x, y - 1, z, liq, vb + mv, true); a -= mv;
    if (liq === 1 && vb > 0 && Math.random() < 0.5) splashFX(w, x, y - 1, z, vb + mv);
    setVol(w, x, y, z, liq, a, fallNow); if (a > 0) w.scheduleTick(x, y, z, fluidDelay(w, liq, true), 0);
    return;
  }
  if (liq === 1 && vb < 0 && w.get(x, y - 1, z) === ID.lava) { lavaQuench(w, x, y - 1, z, true); return; }
  // 2) nivelar con las vecinas más bajas
  const minKeep = liq === 2 ? 2 : 1; const diffMin = 2;
  const low = []; let total = a;
  for (const [dx, dz] of shuffled4()) {
    const v = cellVol(w, x + dx, y, z + dz, liq); if (v < 0) { if (liq === 1 && w.get(x + dx, y, z + dz) === ID.lava) lavaQuench(w, x + dx, y, z + dz, false); continue; }
    if (v <= a - diffMin || (a === minKeep && v === 0 && dropBelow(w, x + dx, y, z + dz, liq))) { low.push([dx, dz, v]); total += v; }
  }
  if (low.length && (a > minKeep || low.some(c => c[2] === 0 && dropBelow(w, x + c[0], y, z + c[1], liq)))) {
    if (liq === 2) { // lava: un octavo por vecina y por actualización (viscosa)
      // primero las caídas (la lava baja por la pendiente), y a una celda vacía se le dan 2 octavos de una vez (frente espeso)
      low.sort((p, q) => (dropBelow(w, x + q[0], y, z + q[1], liq) ? 1 : 0) - (dropBelow(w, x + p[0], y, z + p[1], liq) ? 1 : 0));
      let moved = false;
      for (const [dx, dz, v] of low) { const drop = v === 0 && dropBelow(w, x + dx, y, z + dz, liq); const give = drop ? Math.min(a, 2) : (v === 0 ? 2 : 1); if (!drop && a - give < minKeep) continue; setVol(w, x + dx, y, z + dz, liq, v + give, false); a -= give; moved = true; if (a <= 0) break; }
      if (moved) { setVol(w, x, y, z, liq, a, fallNow); w.scheduleTick(x, y, z, delay, 0); } return;
    }
    // agua: reparto igualado entre la celda y sus vecinas más bajas (el resto, al azar)
    const n = low.length + 1; const base = Math.floor(total / n); let rest = total - base * n;
    const want = [base, ...low.map(() => base)]; while (rest > 0) { want[(Math.random() * n) | 0]++; rest--; }
    if (want[0] < 1 && a >= 1 && !low.some(c => dropBelow(w, x + c[0], y, z + c[1], liq))) { want[0] = 1; for (let k = 1; k < n; k++) if (want[k] > low[k - 1][2]) { want[k]--; break; } }
    let changed = false;
    for (let k = 0; k < low.length; k++) { const [dx, dz, v] = low[k]; if (want[k + 1] !== v) { setVol(w, x + dx, y, z + dz, liq, want[k + 1], false); changed = true; } }
    if (want[0] !== a || changed) { setVol(w, x, y, z, liq, want[0], fallNow); w.scheduleTick(x, y, z, delay, 0); }
    return;
  }
  // 3) presión (solo agua): pasar un octavo a una celda del mismo cuerpo 2 octavos más baja
  if (liq === 1 && a >= 2) { const t = pressureTarget(w, x, y, z, a); if (t) { setVol(w, t[0], y, t[1], 1, t[2] + 1, false); setVol(w, x, y, z, 1, a - 1, fallNow); w.scheduleTick(x, y, z, delay, 0); return; } }
  // celda en reposo: actualizar la marca de chorro si cambió
  const fallBit = (meta & LIQ_FALL) !== 0; if (fallBit !== fallNow) w.set(x, y, z, id, liqMeta(a, fallNow, false));
  // 4) una celda llena rodeada de océano pasa a ser océano (tapar y destapar un hueco en el mar no deja un parche quieto)
  if (liq === 1 && a === 8 && y <= SEA) { let oc = 0; for (const [dx, dz] of N4) if (isOcean(w, x + dx, y, z + dz)) oc++; if (oc >= 2 || (oc >= 1 && isOcean(w, x, y + 1, z))) w.set(x, y, z, ID.water, LIQ_OCEAN); }
}
// BFS corto por el mismo cuerpo de agua (misma altura) hasta una celda con ≤ a-2 octavos
function pressureTarget(w, x, y, z, a) {
  const seen = new Set([x + ',' + z]); const q = [[x, z, 0]]; let head = 0;
  while (head < q.length && head < 96) {
    const [cx, cz, d] = q[head++];
    for (const [dx, dz] of N4) {
      const nx = cx + dx, nz = cz + dz; const k = nx + ',' + nz; if (seen.has(k)) continue; seen.add(k);
      const v = cellVol(w, nx, y, nz, 1); if (v < 0) continue;
      if (v <= a - 2 && (v > 0 || d >= 0)) { if (v === 0 && cellVol(w, nx, y - 1, nz, 1) === 0) continue; return [nx, nz, v]; }
      if (v > 0 && d < 18) q.push([nx, nz, d + 1]);
    }
  }
  return null;
}
// el océano rellena lo que se abre a su lado o debajo (hasta el nivel del mar)
function oceanTick(w, x, y, z) {
  if (!fluidCfg().ocean) return;
  const vb = cellVol(w, x, y - 1, z, 1); let did = false;
  if (vb >= 0 && vb < 8) { setVol(w, x, y - 1, z, 1, 8, true); did = true; if (Math.random() < 0.3) splashFX(w, x, y - 1, z, 8); }
  for (const [dx, dz] of N4) { const v = cellVol(w, x + dx, y, z + dz, 1); if (v >= 0 && v < 8 && y <= SEA) { setVol(w, x + dx, y, z + dz, 1, Math.min(8, v + 4), false); did = true; } else if (v < 0 && w.get(x + dx, y, z + dz) === ID.lava) lavaQuench(w, x + dx, y, z + dz, false); }
  if (did) w.scheduleTick(x, y, z, 4, 0);
}
// agua contra lava: la lava se enfría (obsidiana si es espesa, si no piedra/roca) con vapor
function lavaQuench(w, x, y, z, fromAbove) {
  const m = w.getMeta(x, y, z); const amt = liqAmt(m);
  const nb = fromAbove ? ID.stone : (amt >= 6 ? ID.obsidian : ID.cobblestone);
  w.set(x, y, z, nb); fizz(w, x, y, z);
}
// reacciones de la lava: agua al lado/encima, fuego en lo inflamable, derrite nieve y hielo
function lavaReact(w, x, y, z, meta) {
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) {
    const nb = w.get(x + dx, y + dy, z + dz); if (nb <= 0) continue; const d = REG[nb];
    if (nb === ID.water || d.inWater) { lavaQuench(w, x, y, z, dy === 1); return true; }
    if (nb === ID.snow) { w.set(x + dx, y + dy, z + dz, 0); fizz(w, x + dx, y + dy, z + dz); }
    else if (nb === ID.ice || nb === ID.snow_block || nb === ID.packed_ice) { w.set(x + dx, y + dy, z + dz, ID.water, liqMeta(nb === ID.snow_block ? 4 : 8, false, false)); fizz(w, x + dx, y + dy, z + dz); }
  }
  if (Math.random() < 0.3) for (let k = 0; k < 2; k++) { // incendiar alrededor
    const dx = (Math.random() * 3 | 0) - 1, dy = (Math.random() * 2 | 0), dz = (Math.random() * 3 | 0) - 1;
    if (w.get(x + dx, y + dy, z + dz) !== 0) continue; let fuel = false;
    for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) { const n = w.get(x + dx + ax, y + dy + ay, z + dz + az); if (n > 0 && REG[n].flammable) fuel = true; }
    if (fuel) w.set(x + dx, y + dy, z + dz, ID.fire);
  }
  return false;
}
// salpicaduras: gotas que caen (partículas de líquido)
function splashFX(w, x, y, z, amt) {
  if (G.net && G.net.role === 'client') return; if (!fluidCfg().splash) return; const n = [2, 5, 9][SETTINGS.particles ?? 2];
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 2.5; P_({ x: x + 0.5 + Math.cos(a) * 0.3, y: y + Math.min(0.95, amt / 8), z: z + 0.5 + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, life: 0.7 + Math.random() * 0.4, size: 0.07 + Math.random() * 0.07, r: 0.75, g: 0.88, b: 1, a: 0.75, grav: 18, collide: true, layer: TEX.drip, fluid: 1 }); }
}
// modo clásico (opción «Líquidos: como el original»): fuentes infinitas al estilo Minecraft
function legacyFlow(w, x, y, z, id, liq, meta) {
  const a = liqAmt(meta); const vb = cellVol(w, x, y - 1, z, liq);
  if (vb >= 0 && vb < 8) { setVol(w, x, y - 1, z, liq, 8, true); }
  else if (a > 1) for (const [dx, dz] of N4) { const v = cellVol(w, x + dx, y, z + dz, liq); if (v >= 0 && v < a - 1) setVol(w, x + dx, y, z + dz, liq, a - 1, false); }
  // dos fuentes llenas a los lados crean otra (fuente infinita clásica)
  if (liq === 1 && a < 8) { let full = 0; for (const [dx, dz] of N4) if (cellVol(w, x + dx, y, z + dz, 1) === 8) full++; if (full >= 2) setVol(w, x, y, z, 1, 8, false); }
}
// ---- cubos: recoger 8/8 de la celda y sus vecinas del mismo cuerpo; el océano siempre da un cubo lleno
function bucketTake(w, x, y, z) {
  const id = w.get(x, y, z); if (!isLiq(id)) return 0; const liq = REG[id].liquid;
  if (liq === 1 && (w.getMeta(x, y, z) & LIQ_OCEAN)) return liq;
  if (!fluidCfg().finite) { if (liqAmt(w.getMeta(x, y, z)) < 8) return 0; setBlockNet(w, x, y, z, 0); return liq; }
  const cells = []; const seen = new Set(); const q = [[x, y, z]]; let sum = 0;
  while (q.length && cells.length < 40 && sum < 8) {
    const [cx, cy, cz] = q.shift(); const k = cx + ',' + cy + ',' + cz; if (seen.has(k)) continue; seen.add(k);
    if (Math.abs(cx - x) > 3 || Math.abs(cz - z) > 3 || Math.abs(cy - y) > 1) continue;
    if (w.get(cx, cy, cz) !== id) continue; const m = w.getMeta(cx, cy, cz); if (m & LIQ_OCEAN) { cells.push([cx, cy, cz, 99]); sum = 99; break; }
    const v = liqAmt(m); cells.push([cx, cy, cz, v]); sum += v;
    for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) q.push([cx + dx, cy + dy, cz + dz]);
  }
  if (sum < 8) return 0;
  let need = 8;
  for (const [cx, cy, cz, v] of cells) { if (v === 99) { need = 0; break; } const t = Math.min(v, need); need -= t; const left = v - t; if (left <= 0) setBlockNet(w, cx, cy, cz, 0); else setBlockNet(w, cx, cy, cz, id, liqMeta(left, false, false)); if (need <= 0) break; }
  return liq;
}
function bucketPour(w, x, y, z, liq) {
  const id = liq === 1 ? ID.water : ID.lava; const cur = w.get(x, y, z);
  if (cur !== id && typeof flCanSim === 'function' && flCanSim(w, x, y, z)) { // fluido continuo: el cubo vierte partículas
    const b = w.get(x, y, z); if (b > 0 && REG[b].replace) w.set(x, y, z, 0);
    const d = G.player ? lookDir(G.player) : [0, 0, 0]; flSpawnCell(w, x, y, z, 8, liq === 1 ? 3 : 2, d[0] * 1.5, d[1] * 1.5, d[2] * 1.5); if (liq === 1) splashFX(w, x, y, z, 8); return;
  }
  if (cur === id) { const v = liqAmt(w.getMeta(x, y, z)); const add = Math.min(8 - v, 8); setBlockNet(w, x, y, z, id, liqMeta(v + add, false, false)); const left = 8 - add; if (left > 0 && cellVol(w, x, y + 1, z, liq) === 0) setBlockNet(w, x, y + 1, z, id, liqMeta(left, false, false)); }
  else setBlockNet(w, x, y, z, id, 0);
  if (liq === 1) splashFX(w, x, y, z, 8);
}
// altura de la superficie del líquido dentro de su celda (0..1), para nadar/flotar con volúmenes parciales
function liquidSurface(world, x, y, z) {
  const b = world.get(x, y, z); const d = b > 0 ? REG[b] : null; if (d && d.inWater) return 1; if (!d || !d.liquid) return typeof flSurfIn === 'function' ? flSurfIn(world, x, y, z) : 0;
  const up = world.get(x, y + 1, z); if (up > 0 && REG[up] && REG[up].liquid === d.liquid) return 1;
  if (b === ID.water && (world.getMeta(x, y, z) & LIQ_OCEAN)) return clamp(0.92 + oceanWaveAt(x + 0.5, z + 0.5).h * oceanShoreW(world, x + 0.5, y, z + 0.5), 0, 1.6); // mar: con olas y marea
  const m = world.getMeta(x, y, z); if (m & LIQ_FALL) return 1; return liqAmt(m) / 8 * 0.92; // igual que la superficie dibujada (liqTopH)
}
// depuración: suma de volumen (en octavos) de un líquido en una caja
function fluidVolume(w, x0, y0, z0, x1, y1, z1, liq) { let s = 0; for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const b = w.get(x, y, z); if (isLiq(b) && REG[b].liquid === liq) s += liqAmt(w.getMeta(x, y, z)); } return s; }
// partidas antiguas: metas de nivel estilo Minecraft → volumen en octavos; agua de océano marcada según el bioma
function migrateFluidChunk(w, c) {
  const B = c.blocks, M = c.meta; const gen = w.gen; const ocean = new Uint8Array(256);
  if (w.dim === 'overworld' && gen) for (let i = 0; i < 256; i++) { const col = gen.col(c.cx * 16 + (i & 15), c.cz * 16 + (i >> 4)); ocean[i] = !col.lake && !col.river && col.h < SEA && OCEAN_BIOMES.has(col.biome) ? 1 : 0; }
  for (let i = 0; i < B.length; i++) {
    const b = B[i]; if (b !== ID.water && b !== ID.lava) continue; const m = M[i];
    let nm = (m & 8) ? 8 : (m & 7) ? 8 - (m & 7) : 0;
    if (b === ID.water && nm === 0 && ocean[i & 255] && (i >> 8) <= SEA) nm = LIQ_OCEAN;
    M[i] = nm;
  }
}
// ---- océano: oleaje Gerstner y marea, idénticos a los del shader (VS_CHUNK/oceanWave), para flotar con las olas
const OCEAN_W = [[0.81, 0.59, 22.0, 0.42], [0.97, -0.24, 13.0, 0.26], [0.45, 0.89, 8.5, 0.16], [-0.2, 0.98, 5.2, 0.09], [0.7, -0.71, 3.4, 0.05]];
function oceanTide() { return 0.28 * Math.sin(((G.time || 0) % 24000) / 12000 * Math.PI * 2); } // dos mareas por día
const _OWV = { h: 0, ux: 0, uz: 0 };
// desplazamiento de la superficie respecto al nivel quieto (h) y velocidad orbital horizontal del agua (ux, uz)
function oceanWaveAt(x, z) {
  const t = (typeof R !== 'undefined' && R.time) ? R.time : performance.now() / 1000; const A = (0.16 + (G.rainLevel || 0) * 0.55) * (typeof R !== 'undefined' && R.gfxU ? R.gfxU[0] : 1); let h = 0, ux = 0, uz = 0;
  for (let i = 0; i < 5; i++) { const W = OCEAN_W[i]; const k = 6.2832 / W[2], c = Math.sqrt(9.8 / k); const ph = k * (W[0] * x + W[1] * z - c * t * 0.55) + i * 1.7; const a = A * W[3] * 2.2; const s = Math.sin(ph);
    h += a * (Math.pow(s * 0.5 + 0.5, 1.6) * 2 - 1); const om = k * c * 0.55; ux += a * om * s * W[0]; uz += a * om * s * W[1]; }
  _OWV.h = h * 0.85 - A * 1.1 - 0.05 + oceanTide(); _OWV.ux = ux; _OWV.uz = uz; return _OWV;
}
// lo mismo que shoreW (d_mesh) pero contra el mundo: peso del oleaje (0 junto a la orilla) para flotación y nado
const OSHORE = new Map();
function oceanShoreW(w, x, y, z) {
  if (MESH_SHORE <= 0) return 1;
  const key = ((Math.round(x * 4) + 4e5) * 8e5 + Math.round(z * 4) + 4e5) * 512 + y; let r = OSHORE.get(key); if (r !== undefined) return r;
  if (OSHORE.size > 20000) OSHORE.clear();
  const R = Math.min(13, MESH_SHORE + SHORE_RAMP); let best = R + 1;
  for (let b = Math.floor(z - R); b < Math.ceil(z + R); b++) { const dz = Math.max(b - z, 0, z - (b + 1)); if (dz >= best) continue;
    for (let a = Math.floor(x - R); a < Math.ceil(x + R); a++) { const dx = Math.max(a - x, 0, x - (a + 1)); if (dx >= best) continue;
      const bb = w.get(a, y, b); if (bb < 0 || (bb > 0 && (REG[bb].liquid === 1 || REG[bb].inWater))) continue; const d = Math.hypot(dx, dz); if (d < best) best = d; } }
  const t = clamp((best - MESH_SHORE) / SHORE_RAMP, 0, 1); r = t * t * (3 - 2 * t); OSHORE.set(key, r); return r;
}
// celda de mar con aire (o algo no líquido) encima
function isOceanTop(w, x, y, z) { return isOcean(w, x, y, z) && w.get(x, y + 1, z) !== ID.water; }
// altura de la superficie del mar con olas sobre la columna (x,z) cerca de y; NaN si no hay mar
function oceanSurfY(w, x, y, z) {
  const bx = Math.floor(x), bz = Math.floor(z), cy = Math.floor(y);
  for (let yy = cy + 1; yy >= cy - 2; yy--) if (isOceanTop(w, bx, yy, bz)) return yy + 0.92 + oceanWaveAt(x, z).h * oceanShoreW(w, x, yy, z);
  return NaN;
}
// superficie del agua (mar con olas, agua quieta o en movimiento) por encima de un punto sumergido
function waterSurfaceAt(w, x, y, z) {
  const os = oceanSurfY(w, x, y, z); if (os === os) return os;
  const bx = Math.floor(x), bz = Math.floor(z); let by = Math.floor(y); let k = 0;
  while (k < 4 && liquidAt(w, x, by + 1.02, z)) { by++; k++; }
  return by + liquidSurface(w, bx, by, bz);
}
// ---- cubos con capacidad: 10 L (10000 ml) = un bloque de líquido; cada partícula del fluido continuo son 0,08 L
const BUCKET_ML = 10000, ML_PER_EIGHTH = 1250; const ML_PER_PART = BUCKET_ML / 216; // (216 = FL_PPB, que se define después) un cubo (10 L) = un bloque = 216 partículas
function bucketLabel(s) { const d = s && REG[s.id]; if (!d || d.bucket === undefined || !d.bucket) return ''; return ' (' + (((s.ml ?? BUCKET_ML)) / 1000).toFixed(1) + ' L)'; }
const BKT_ACC = new Map();
// recoge hasta `room` ml del líquido que hay en una caja pequeña e invisible alrededor de donde apunta el jugador
// cont: 0 vacío (acepta el primero que encuentre), 1 agua, 2 lava (solo ese). Devuelve { liq, ml }
function bucketCollect(w, p, dir, cont, room) {
  const reach = 5; let c = null, liq = 0, isStatic = false;
  for (let t = 0.4; t <= reach; t += 0.15) {
    const x = p.x + dir[0] * t, y = p.eye + dir[1] * t, z = p.z + dir[2] * t;
    const b = w.get(Math.floor(x), Math.floor(y), Math.floor(z));
    if (b > 0 && REG[b] && REG[b].solid && !REG[b].liquid) break;
    const oc = typeof FL !== 'undefined' && FL.occ && w === FL.world ? FL.occ.get(FLK(Math.floor(x), Math.floor(y), Math.floor(z))) : null;
    if (oc && oc.idx.length >= 2 && y < oc.top + 0.2) { c = [x, y, z]; liq = oc.nl > oc.nw ? 2 : 1; break; }
    const sl = b > 0 && REG[b] ? (REG[b].liquid || (REG[b].inWater ? 1 : 0)) : 0; if (sl) { c = [x, y, z]; liq = sl; isStatic = true; break; }
  }
  if (!c || (cont && cont !== liq)) return { liq: cont, ml: 0 };
  if (!isStatic) { // partículas dentro de la caja (de la última lectura de la GPU)
    const rb = FL.rb, o = rb.orgNow; if (!rb.ready) return { liq, ml: 0 }; const want = Math.min(26, Math.floor(room / ML_PER_PART)); let n = 0;
    const bx = Math.floor(c[0]), by = Math.floor(c[1]), bz = Math.floor(c[2]);
    for (let dy = -1; dy <= 1 && n < want; dy++) for (let dz = -1; dz <= 1 && n < want; dz++) for (let dx = -1; dx <= 1 && n < want; dx++) {
      const cell = FL.occ.get(FLK(bx + dx, by + dy, bz + dz)); if (!cell) continue;
      for (const i of cell.idx) { if (n >= want) break; const ph = FL.phase[i]; if (!ph || (ph === 2) !== (liq === 2) || FL.dying.has(i)) continue; const k = i * 4;
        if (Math.abs(rb.pos[k] + o[0] - c[0]) > 0.6 || Math.abs(rb.pos[k + 1] + o[1] - c[1]) > 0.6 || Math.abs(rb.pos[k + 2] + o[2] - c[2]) > 0.6) continue;
        flKill(i); n++; }
    }
    return { liq, ml: n * ML_PER_PART };
  }
  // agua o lava quieta: 1 L cada décima de segundo; el mar no se gasta; un lago pierde 1/8 de bloque cada 1,25 L
  const x = Math.floor(c[0]), y = Math.floor(c[1]), z = Math.floor(c[2]); const take = Math.min(1000, room);
  if (!(liq === 1 && (w.getMeta(x, y, z) & LIQ_OCEAN))) {
    const k = x + ',' + y + ',' + z; const acc = (BKT_ACC.get(k) || 0) + take;
    if (acc >= ML_PER_EIGHTH) { BKT_ACC.set(k, acc - ML_PER_EIGHTH); let ty = y; const id = w.get(x, y, z); while (w.get(x, ty + 1, z) === id && ty < y + 8) ty++; const m = w.getMeta(x, ty, z); const a = liqAmt(m); if (a <= 1) setBlockNet(w, x, ty, z, 0); else setBlockNet(w, x, ty, z, id, (m & ~7) | (a - 1)); }
    else BKT_ACC.set(k, acc);
  }
  return { liq, ml: take };
}
// vacía de golpe todo el contenido delante del jugador
function bucketPourMl(w, p, dir, hit, liq, ml) {
  let d = 1.6; if (hit && !hit.ent && hit.t !== undefined) d = Math.max(0.6, Math.min(d, hit.t - 0.4));
  const cx = p.x + dir[0] * d, cy = p.eye + dir[1] * d - 0.2, cz = p.z + dir[2] * d;
  if (liq === 1 && p.dim === 'nether') { fizz(w, Math.floor(cx), Math.floor(cy), Math.floor(cz)); return; }
  if (typeof flCanSim === 'function' && flCanSim(w, Math.floor(cx), Math.floor(cy), Math.floor(cz))) {
    const n = Math.max(1, Math.round(ml / ML_PER_PART)); const r = Math.cbrt(n * FL_S * FL_S * FL_S * 3 / (4 * Math.PI)) + 0.05;
    for (let i = 0; i < n; i++) { let ox, oy, oz; do { ox = Math.random() * 2 - 1; oy = Math.random() * 2 - 1; oz = Math.random() * 2 - 1; } while (ox * ox + oy * oy + oz * oz > 1);
      flSpawn(cx + ox * r, cy + oy * r, cz + oz * r, dir[0] * 2.5 + (p.vx || 0), dir[1] * 2.5 + 0.5, dir[2] * 2.5 + (p.vz || 0), liq === 1 ? 3 : 2); }
    if (liq === 1) splashFX(w, Math.floor(cx), Math.floor(cy), Math.floor(cz), 4); return;
  }
  // sin fluido continuo: el volumen va a la celda (octavos)
  const x = Math.floor(cx), y = Math.floor(cy), z = Math.floor(cz); const id = liq === 1 ? ID.water : ID.lava; const cur = w.get(x, y, z);
  if (cur !== 0 && cur !== id && !(cur > 0 && REG[cur].replace)) return;
  const a = Math.max(1, Math.min(8, Math.round(ml / ML_PER_EIGHTH))); const v = cur === id ? liqAmt(w.getMeta(x, y, z)) : 0;
  setBlockNet(w, x, y, z, id, liqMeta(Math.min(8, v + a), false, false) | (liq === 1 ? 16 : 0));
}
