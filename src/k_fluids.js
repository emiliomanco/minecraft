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
function fluidCfg() { const o = SETTINGS.physics || {}; return { finite: (o.liquids && o.liquids.finite) !== false, lavaVisc: (o.liquids && o.liquids.lavaVisc) || 1, ocean: (o.oceans && o.oceans.infinite) !== false }; }
const FLU = { budget: 2500, used: 0, tick: -1, moved: 0 };
function fluidDelay(w, liq, falling) { if (liq === 1) return falling ? 2 : 4; return Math.round((w.dim === 'nether' ? 8 : 26) * fluidCfg().lavaVisc); }
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
  if (G.net && G.net.role === 'client') return; const n = [2, 5, 9][SETTINGS.particles ?? 2];
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
  if (cur === id) { const v = liqAmt(w.getMeta(x, y, z)); const add = Math.min(8 - v, 8); setBlockNet(w, x, y, z, id, liqMeta(v + add, false, false)); const left = 8 - add; if (left > 0 && cellVol(w, x, y + 1, z, liq) === 0) setBlockNet(w, x, y + 1, z, id, liqMeta(left, false, false)); }
  else setBlockNet(w, x, y, z, id, 0);
  if (liq === 1) splashFX(w, x, y, z, 8);
}
// altura de la superficie del líquido dentro de su celda (0..1), para nadar/flotar con volúmenes parciales
function liquidSurface(world, x, y, z) {
  const b = world.get(x, y, z); if (b <= 0) return 0; const d = REG[b]; if (d.inWater) return 1; if (!d.liquid) return 0;
  const up = world.get(x, y + 1, z); if (up > 0 && REG[up] && REG[up].liquid === d.liquid) return 1;
  const m = world.getMeta(x, y, z); if (m & LIQ_FALL) return 1; return liqAmt(m) / 8 * 0.9;
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
