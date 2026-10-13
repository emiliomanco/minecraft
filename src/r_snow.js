// ============================================================================
//  Nieve como material granular: se rompe en terrones que ruedan y se asientan, y el calor la derrite en agua
// ============================================================================
// Al minarla o con una explosión la nieve no desaparece: se parte en terrones (cuerpos rígidos pequeños con
// rozamiento) que, al pararse, se vuelven a sumar como capas de nieve donde caen. Cerca del fuego, la lava
// (quieta o en movimiento), antorchas y agua que corre, la nieve y el hielo se funden en agua líquida que entra
// en la simulación del fluido (o, sin ella, se empapa en el suelo).
const SNOWF = { acc: new Map(), t: 0 };
// terrones de un bloque o capa de nieve; dir = velocidad extra (golpe, explosión)
function snowFragments(w, x, y, z, id, meta, vx = 0, vy = 0, vz = 0) {
  if (typeof spawnDebris !== 'function') return;
  const vol = id === ID.snow_block ? 1 : Math.max(1, meta) / 8; const n = Math.max(2, Math.round(vol * [5, 8, 12, 14][R.q || 0]));
  const top = id === ID.snow_block ? 1 : Math.max(1, meta) / 8;
  for (let i = 0; i < n; i++) {
    const s = Math.cbrt(vol / n) * (0.75 + Math.random() * 0.5); const sz = clamp(s, 0.12, 0.42);
    const e = spawnDebris(w.dim, ID.snow_block, 0, x + 0.15 + Math.random() * 0.7, y + Math.random() * top * 0.8 + sz / 2, z + 0.15 + Math.random() * 0.7,
      vx + (Math.random() - 0.5) * 2.2, vy + 1 + Math.random() * 2.5, vz + (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, false);
    e.snow = true; e.sz = sz; e.w = sz; e.h = sz; e.vol = sz * sz * sz;
  }
}
// un terrón que se paró: su volumen se suma a la nieve del sitio (cada 1/8 de bloque, una capa)
function snowFragRest(w, e) {
  const x = Math.floor(e.x), z = Math.floor(e.z); let y = Math.floor(e.y - e.sz / 2 + 0.05);
  if (Math.random() >= e.vol * 8 * 0.85) return; // redondeo al azar: en promedio se conserva la nieve (algo se compacta al desmoronarse)
  let b = w.get(x, y, z);
  if (b === ID.snow) { const m = Math.max(1, w.getMeta(x, y, z)); if (m >= 7) setBlockNet(w, x, y, z, ID.snow_block, 0); else setBlockNet(w, x, y, z, ID.snow, m + 1); return; }
  if (b === 0 || (b > 0 && REG[b].replace && !REG[b].liquid)) { const dn = w.get(x, y - 1, z); if (dn > 0 && (T_FULL[dn] || dn === ID.snow_block)) setBlockNet(w, x, y, z, ID.snow, 1); else if (dn === ID.snow) { const m = Math.max(1, w.getMeta(x, y - 1, z)); setBlockNet(w, x, y - 1, z, m >= 7 ? ID.snow_block : ID.snow, m >= 7 ? 0 : m + 1); } }
}
// derretir: la nieve suelta tiene ~1/3 de agua; sale como fluido si la simulación está activa
function snowMelt(w, x, y, z) {
  const b = w.get(x, y, z); let water = 0;
  if (b === ID.snow) { const m = Math.max(1, w.getMeta(x, y, z)); setBlockNet(w, x, y, z, m <= 1 ? 0 : ID.snow, m <= 1 ? 0 : m - 1); water = 3; }
  else if (b === ID.snow_block) { setBlockNet(w, x, y, z, ID.snow, 7); water = 3; }
  else if (b === ID.ice || b === ID.packed_ice) { setBlockNet(w, x, y, z, 0); water = b === ID.ice ? 64 : 32; }
  else return false;
  if (typeof flCanSim === 'function' && flCanSim(w, x, y, z)) { const h = b === ID.snow ? 0.1 : 0.5; for (let i = 0; i < water; i++) flSpawn(x + 0.2 + Math.random() * 0.6, y + h + Math.random() * 0.3, z + 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3, 3); }
  else if (water >= 32) { const cv = cellVol(w, x, y, z, 1); if (cv >= 0) w.set(x, y, z, ID.water, liqMeta(water >= 64 ? 8 : 4, false, false) | (typeof LIQ_PLACED !== 'undefined' ? LIQ_PLACED : 0)); }
  if (Math.random() < 0.4) P_({ x: x + 0.5, y: y + 0.6, z: z + 0.5, vx: 0, vy: 0.6, vz: 0, life: 1.6, size: 0.25, layer: TEX.soft, r: 0.85, g: 0.88, b: 0.92, a: 0.35, grav: -0.5 }); // vaho
  return true;
}
// fuentes de calor (de los emisores de los chunks cercanos y de la lava en movimiento): cada segundo, unas muestras alrededor
const SNOW_HEAT = new Map();
function heatMeltTick(w) {
  if (!w || w.dim === 'nether' || !G.player || (G.net && G.net.role === 'client')) return;
  if (!SNOW_HEAT.size) for (const [n, r, p] of [['fire', 2.6, 0.5], ['soul_fire', 2.6, 0.5], ['campfire', 2.6, 0.45], ['lava', 2.6, 0.45], ['magma_block', 1.6, 0.2], ['torch', 1.4, 0.06], ['lantern', 1.4, 0.05], ['jack_o_lantern', 1.3, 0.04], ['furnace', 1.3, 0.05]])
    if (ID[n] !== undefined) SNOW_HEAT.set(ID[n], [r, p]);
  const p = G.player; const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4; const src = [];
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const c = w.chunk(pcx + dx, pcz + dz); if (!c || !c.emitters) continue; const E = c.emitters;
    for (let i = 0; i < E.length; i += 4) { const h = SNOW_HEAT.get(E[i + 3]); if (h) src.push(E[i] + 0.5, E[i + 1] + 0.5, E[i + 2] + 0.5, h[0], h[1]); } }
  if (typeof FL !== 'undefined' && FL.lavaPts) for (const a of FL.lavaPts) src.push(a[0], a[1] + 0.3, a[2], 2.4, 0.5);
  // agua que corre (partículas rápidas): derrite poco a poco lo que toca
  if (typeof FL !== 'undefined' && FL.occ) for (const c of FL.occ.values()) if (c.nw >= 6 && c.vmax > 1.2) src.push(c.x + 0.5, c.y + 0.5, c.z + 0.5, 1.2, 0.08);
  let budget = 40;
  for (let i = 0; i < src.length && budget > 0; i += 5) {
    const r = src[i + 3], pr = src[i + 4]; const tries = Math.ceil(r * r * 1.5);
    for (let k = 0; k < tries && budget > 0; k++) {
      const x = Math.floor(src[i] + (Math.random() * 2 - 1) * r), y = Math.floor(src[i + 1] + (Math.random() * 2 - 1) * r * 0.7), z = Math.floor(src[i + 2] + (Math.random() * 2 - 1) * r);
      const b = w.get(x, y, z); if (b !== ID.snow && b !== ID.snow_block && b !== ID.ice && b !== ID.packed_ice) continue;
      const d = Math.hypot(x + 0.5 - src[i], y + 0.5 - src[i + 1], z + 0.5 - src[i + 2]); if (d > r) continue;
      if (Math.random() < pr * (1 - d / r) * 4) { snowMelt(w, x, y, z); budget--; }
    }
  }
}
