// ============================================================================
//  Mundo, chunks, generación procedural por semilla, biomas y estructuras
// ============================================================================
const DIMS = {
  overworld: { H: 256, yOff: -64, name: 'minecraft:overworld' },
  nether: { H: 128, yOff: 0, name: 'minecraft:the_nether' },
  end: { H: 128, yOff: 0, name: 'minecraft:the_end' }
};
const SEA = 126;          // nivel del mar interno (y=62 visible)
const DEEP = 64;          // y=0 visible: límite deepslate
// Biomas -----------------------------------------------------------------
const BIOMES = [];
function defBiome(name, o) { const b = Object.assign({ id: BIOMES.length, name, grass: [0.55, 0.74, 0.33], foliage: [0.45, 0.66, 0.25], top: ID.grass_block, fill: ID.dirt, snow: false, temp: 0.8, water: [0.25, 0.46, 0.85] }, o); BIOMES.push(b); return b.id; }
const BI = {};
BI.ocean = defBiome('ocean', { top: ID.sand, fill: ID.sand });
BI.deep_ocean = defBiome('deep_ocean', { top: ID.gravel, fill: ID.gravel });
BI.frozen_ocean = defBiome('frozen_ocean', { top: ID.gravel, fill: ID.gravel, snow: true, temp: 0, water: [0.22, 0.36, 0.8] });
BI.warm_ocean = defBiome('warm_ocean', { top: ID.sand, fill: ID.sand, water: [0.2, 0.62, 0.85] });
BI.river = defBiome('river', { top: ID.sand, fill: ID.dirt });
BI.frozen_river = defBiome('frozen_river', { top: ID.gravel, fill: ID.dirt, snow: true, temp: 0 });
BI.beach = defBiome('beach', { top: ID.sand, fill: ID.sand });
BI.snowy_beach = defBiome('snowy_beach', { top: ID.sand, fill: ID.sand, snow: true, temp: 0 });
BI.plains = defBiome('plains', { grass: [0.57, 0.74, 0.35] });
BI.sunflower_plains = defBiome('sunflower_plains', { grass: [0.57, 0.74, 0.35] });
BI.forest = defBiome('forest', { grass: [0.47, 0.70, 0.29], foliage: [0.38, 0.62, 0.2] });
BI.birch_forest = defBiome('birch_forest', { grass: [0.53, 0.73, 0.34], foliage: [0.5, 0.67, 0.33] });
BI.dark_forest = defBiome('dark_forest', { grass: [0.31, 0.48, 0.16], foliage: [0.28, 0.45, 0.13] });
BI.taiga = defBiome('taiga', { grass: [0.53, 0.72, 0.48], foliage: [0.41, 0.62, 0.38], temp: 0.25 });
BI.snowy_taiga = defBiome('snowy_taiga', { grass: [0.5, 0.65, 0.55], foliage: [0.38, 0.55, 0.45], snow: true, temp: -0.5, top: ID.snowy_grass });
BI.snowy_plains = defBiome('snowy_plains', { grass: [0.5, 0.7, 0.55], snow: true, temp: 0, top: ID.snowy_grass });
BI.mangrove_swamp = defBiome('mangrove_swamp', { grass: [0.41, 0.48, 0.21], foliage: [0.36, 0.48, 0.15], top: ID.mud, fill: ID.mud, water: [0.23, 0.42, 0.35] });
BI.desert = defBiome('desert', { grass: [0.75, 0.72, 0.42], top: ID.sand, fill: ID.sand, temp: 2 });
BI.savanna = defBiome('savanna', { grass: [0.75, 0.72, 0.36], foliage: [0.68, 0.65, 0.25], temp: 1.2 });
BI.jungle = defBiome('jungle', { grass: [0.35, 0.8, 0.18], foliage: [0.26, 0.75, 0.1], temp: 0.95 });
BI.mountains = defBiome('windswept_hills', { grass: [0.54, 0.71, 0.5], top: ID.grass_block, temp: 0.2 });
BI.snowy_peaks = defBiome('snowy_slopes', { top: ID.snow_block, fill: ID.stone, snow: true, temp: -0.3 });
BI.jagged_peaks = defBiome('jagged_peaks', { top: ID.snow_block, fill: ID.stone, snow: true, temp: -0.7 });
BI.lush_caves = defBiome('lush_caves');
BI.dripstone_caves = defBiome('dripstone_caves');
BI.deep_dark = defBiome('deep_dark');
BI.nether_wastes = defBiome('nether_wastes');
BI.soul_sand_valley = defBiome('soul_sand_valley');
BI.crimson_forest = defBiome('crimson_forest');
BI.warped_forest = defBiome('warped_forest');
BI.basalt_deltas = defBiome('basalt_deltas');
BI.the_end = defBiome('the_end');
BI.end_highlands = defBiome('end_highlands');
BI.small_end_islands = defBiome('small_end_islands');

// ======================================================================= Chunk
class Chunk {
  constructor(world, cx, cz) {
    this.world = world; this.cx = cx; this.cz = cz; this.H = world.H;
    this.blocks = new Uint8Array(256 * this.H); this.meta = new Uint8Array(256 * this.H);
    this.light = null; this.biomes = new Uint8Array(256); this.loot = {}; this.spawners = {};
    this.dirty = true; this.modified = false; this.mesh = null; this.top = 0; this.spawns = null;
  }
  calcTop() { const b = this.blocks; let y = this.H - 1; for (; y > 0; y--) { const o = y << 8; let any = false; for (let i = 0; i < 256; i++) if (b[o + i]) { any = true; break; } if (any) break; } this.top = y; }
}
const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

// ======================================================================= World
class World {
  constructor(dim, seed) {
    this.dim = dim; this.seed = seed >>> 0; this.H = DIMS[dim].H; this.yOff = DIMS[dim].yOff;
    this.chunks = new Map(); this.gen = new Generator(dim, this.seed);
    this.ticks = []; this.tickSet = new Set(); this.saved = {}; // saved: key -> {b,m}
  }
  chunk(cx, cz) { return this.chunks.get(ckey(cx, cz)); }
  ensure(cx, cz) {
    const k = ckey(cx, cz); let c = this.chunks.get(k); if (c) return c;
    c = new Chunk(this, cx, cz);
    const sv = this.saved[k];
    this.gen.generate(c);
    if (sv) { c.blocks = rleDecode(sv.b, 256 * this.H); c.meta = rleDecode(sv.m, 256 * this.H); c.modified = true; c.loot = sv.loot || {}; c.spawners = sv.sp || c.spawners; delete this.saved[k]; c.calcTop(); }
    this.chunks.set(k, c);
    if (typeof onChunkGenerated === 'function') onChunkGenerated(this, c);
    return c;
  }
  get(x, y, z) { if (y < 0) return ID.bedrock; if (y >= this.H) return 0; const c = this.chunks.get(ckey(x >> 4, z >> 4)); if (!c) return -1; return c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)]; }
  getMeta(x, y, z) { if (y < 0 || y >= this.H) return 0; const c = this.chunks.get(ckey(x >> 4, z >> 4)); if (!c) return 0; return c.meta[(x & 15) | ((z & 15) << 4) | (y << 8)]; }
  set(x, y, z, id, meta = 0, silent) {
    if (y < 0 || y >= this.H) return false; const c = this.chunks.get(ckey(x >> 4, z >> 4)); if (!c) return false;
    const i = (x & 15) | ((z & 15) << 4) | (y << 8); const old = c.blocks[i], om = c.meta[i];
    if (old === id && om === meta) return false;
    c.blocks[i] = id; c.meta[i] = meta; c.modified = true; if (y > c.top && id) c.top = y;
    if (!silent && typeof onBlockSet === 'function') onBlockSet(this, x, y, z, old, id, meta);
    return true;
  }
  setMeta(x, y, z, m) { const c = this.chunks.get(ckey(x >> 4, z >> 4)); if (!c) return; c.meta[(x & 15) | ((z & 15) << 4) | (y << 8)] = m; c.modified = true; }
  light(x, y, z) { // devuelve [sky, block] 0..15
    if (y >= this.H) return [15, 0]; if (y < 0) return [0, 0];
    const c = this.chunks.get(ckey(x >> 4, z >> 4)); if (!c || !c.light) return [this.dim === 'overworld' ? 15 : 0, 0];
    const v = c.light[(x & 15) | ((z & 15) << 4) | (y << 8)]; return [v >> 4, v & 15];
  }
  solidAt(x, y, z) { const b = this.get(x, y, z); if (b < 0) return true; return REG[b].solid; }
  biomeAt(x, z) { const c = this.chunk(x >> 4, z >> 4); return c ? c.biomes[(x & 15) | ((z & 15) << 4)] : 0; }
  surfaceY(x, z) { for (let y = this.H - 1; y > 0; y--) { const b = this.get(x, y, z); if (b > 0 && REG[b].solid) return y; } return 0; }
  scheduleTick(x, y, z, delay, kind = 0) { const k = x + ',' + y + ',' + z + ',' + kind; if (this.tickSet.has(k)) return; this.tickSet.add(k); this.ticks.push({ x, y, z, t: (G.tick || 0) + delay, kind, k }); }
}

// ============================================================ Generador
class Generator {
  constructor(dim, seed) {
    this.dim = dim; this.seed = seed; this.H = DIMS[dim].H;
    const n = s => new Noise((seed ^ hashStr(dim + s)) >>> 0);
    this.nC = n('cont'); this.nE = n('ero'); this.nP = n('peaks'); this.nD = n('detail'); this.nT = n('temp'); this.nHm = n('hum');
    this.nR = n('river'); this.nL = n('lake'); this.nC1 = n('cave1'); this.nC2 = n('cave2'); this.nC3 = n('cave3'); this.nCB = n('cavebiome'); this.nCB2 = n('cavebiome2');
    this.nV = n('variety'); this.nS = n('snow'); this.nDS = n('deepslate'); this.nW = n('weird');
    this.structCache = new Map(); this.colCache = new Map();
  }
  // ------------------------------------------------------------ overworld columna
  rawHeight(x, z) {
    const c = this.nC.fbm2(x * 0.0011, z * 0.0011, 4) * 1.3;
    const e = this.nE.fbm2(x * 0.0021, z * 0.0021, 3);
    const pk = 1 - Math.abs(this.nP.fbm2(x * 0.0032, z * 0.0032, 4));
    const d = this.nD.fbm2(x * 0.011, z * 0.011, 3);
    let base;
    if (c < -0.35) base = SEA - 40 + (Math.max(c, -0.7) + 0.7) / 0.35 * 20;
    else if (c < -0.12) base = SEA - 20 + (c + 0.35) / 0.23 * 18;
    else if (c < -0.04) base = SEA - 2 + (c + 0.12) / 0.08 * 5;
    else base = SEA + 3 + (c + 0.04) * 28;
    const hill = 1 - smooth(clamp((e + 0.5) / 0.8, 0, 1));
    const mountain = clamp((c + 0.02) * 3.2, 0, 1) * clamp((-e - 0.02) * 2.6, 0, 1);
    const mh = mountain * Math.pow(pk, 2.2) * 100;
    return { h: base + d * (2.5 + 7 * hill) + mh, c, e, d, mountain: mh };
  }
  col(x, z) {
    const key = x * 100003 + z; let r = this.colCache.get(key); if (r) return r;
    if (this.colCache.size > 60000) this.colCache.clear();
    const R = this.rawHeight(x, z); let h = R.h; const c = R.c;
    const T = this.nT.fbm2(x * 0.0008, z * 0.0008, 3) * 1.6 + this.nW.n2(x * 0.01, z * 0.01) * 0.04;
    const Hm = this.nHm.fbm2(x * 0.0009, z * 0.0009, 3) * 1.6;
    // ríos
    let river = false; const rv = Math.abs(this.nR.fbm2(x * 0.0013, z * 0.0013, 3));
    if (c > -0.18 && rv < 0.065 && R.mountain < 40) { const t = smooth(clamp((rv - 0.018) / 0.047, 0, 1)); const rh = SEA - 3 - (1 - t) * 2.5; if (h > rh) h = lerp(rh, h, t * t); if (rv < 0.032) river = true; }
    // pantano de manglares: aplanar
    let swamp = Hm > 0.32 && T > 0.05 && T < 0.5 && h > SEA - 4 && h < SEA + 9 && R.mountain < 2;
    if (swamp) h = lerp(h, SEA - 0.6 + R.d * 3, 0.85);
    // lagos
    let lake = 0; if (!river && R.mountain < 6 && c > -0.04) {
      const gx = Math.floor(x / 96), gz = Math.floor(z / 96);
      for (let ox = 0; ox <= 1 && !lake; ox++) for (let oz = 0; oz <= 1 && !lake; oz++) {
        const cx = gx + (((x % 96) + 96) % 96 < 48 ? ox - 1 : ox), cz = gz + (((z % 96) + 96) % 96 < 48 ? oz - 1 : oz);
        const rr = rngFor(this.seed, cx, cz, 77); if (rr() > 0.38) continue;
        const lx = cx * 96 + 20 + rr() * 56, lz = cz * 96 + 20 + rr() * 56, rad = 7 + rr() * 9;
        const dist = Math.hypot(x - lx, z - lz) / (rad * (0.85 + this.nL.n2(x * 0.08, z * 0.08) * 0.25));
        if (dist < 1) { const lvl = Math.floor(this.rawHeight(lx | 0, lz | 0).h) - 1; if (lvl > SEA + 1 && lvl < SEA + 40) { const dep = (1 - dist) * 7 + 1; if (h > lvl - dep) h = lvl - dep; lake = lvl; } }
      }
    }
    h = Math.floor(clamp(h, 8, this.H - 20));
    let b;
    if (h < SEA - 1 && !river) {
      if (h < SEA - 16) b = T < -0.45 ? BI.frozen_ocean : BI.deep_ocean; else b = T < -0.45 ? BI.frozen_ocean : T > 0.55 ? BI.warm_ocean : BI.ocean;
    } else if (river) b = T < -0.45 ? BI.frozen_river : BI.river;
    else if (swamp) b = BI.mangrove_swamp;
    else if (h <= SEA + 2 && c < -0.02 && R.mountain < 2) b = T < -0.45 ? BI.snowy_beach : BI.beach;
    else if (R.mountain > 30) b = h > SEA + 90 ? BI.jagged_peaks : h > SEA + 62 ? BI.snowy_peaks : BI.mountains;
    else if (T < -0.45) b = Hm > 0.05 ? BI.snowy_taiga : BI.snowy_plains;
    else if (T < -0.15) b = BI.taiga;
    else if (T < 0.25) b = Hm < -0.3 ? BI.plains : Hm < 0.0 ? BI.forest : Hm < 0.3 ? BI.birch_forest : BI.dark_forest;
    else if (T < 0.5) b = Hm < -0.15 ? BI.plains : Hm < 0.2 ? BI.forest : BI.dark_forest;
    else b = Hm < -0.12 ? BI.desert : Hm < 0.18 ? BI.savanna : BI.jungle;
    if (b === BI.plains && this.nV.n2(x * 0.004, z * 0.004) > 0.55) b = BI.sunflower_plains;
    r = { h, biome: b, river, lake, swamp, T, Hm, mountain: R.mountain };
    this.colCache.set(key, r); return r;
  }
  caveBiome(x, y, z) {
    if (this.dim !== 'overworld') return -1;
    const a = this.nCB.n2(x * 0.004, z * 0.004), b = this.nCB2.n2(x * 0.005 + 50, z * 0.005);
    if (y < DEEP - 8 && a > 0.38) return BI.deep_dark;
    if (y < SEA - 20 && a < -0.35) return BI.lush_caves;
    if (y < SEA - 12 && b > 0.42) return BI.dripstone_caves;
    return -1;
  }
  generate(ch) {
    ch.spawns = [];
    if (this.dim === 'overworld') this.genOverworld(ch);
    else if (this.dim === 'nether') this.genNether(ch);
    else this.genEnd(ch);
    this.genStructures(ch);
    ch.calcTop();
  }
  // ------------------------------------------------------------ OVERWORLD
  genOverworld(ch) {
    const B = ch.blocks, M = ch.meta, H = this.H, x0 = ch.cx * 16, z0 = ch.cz * 16;
    const r = rngFor(this.seed, ch.cx, ch.cz, 1);
    const cols = new Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { const c = this.col(x0 + x, z0 + z); cols[x | z << 4] = c; ch.biomes[x | z << 4] = c.biome; }
    // cuevas: rejilla 4x4x4 interpolada
    const GX = 5, GY = (H >> 2) + 1; const cave = new Float32Array(GX * GX * GY), cheese = new Float32Array(GX * GX * GY);
    for (let gx = 0; gx < GX; gx++) for (let gz = 0; gz < GX; gz++) for (let gy = 0; gy < GY; gy++) {
      const wx = x0 + gx * 4, wz = z0 + gz * 4, wy = gy * 4; const i = (gy * GX + gz) * GX + gx;
      const a = this.nC1.n3(wx * 0.022, wy * 0.035, wz * 0.022), b = this.nC2.n3(wx * 0.022 + 31, wy * 0.035, wz * 0.022);
      cave[i] = a * a + b * b;
      cheese[i] = this.nC3.fbm3(wx * 0.011, wy * 0.018, wz * 0.011, 2) + (wy < 40 ? 0.08 : 0) - (wy > SEA - 30 ? (wy - SEA + 30) * 0.02 : 0);
    }
    const sample = (arr, x, y, z) => {
      const fx = x / 4, fy = y / 4, fz = z / 4; const ix = Math.min(fx | 0, 3), iy = Math.min(fy | 0, GY - 2), iz = Math.min(fz | 0, 3);
      const tx = fx - ix, ty = fy - iy, tz = fz - iz; const g = (a, b, c) => arr[((iy + b) * GX + iz + c) * GX + ix + a];
      return lerp(lerp(lerp(g(0, 0, 0), g(1, 0, 0), tx), lerp(g(0, 0, 1), g(1, 0, 1), tx), tz), lerp(lerp(g(0, 1, 0), g(1, 1, 0), tx), lerp(g(0, 1, 1), g(1, 1, 1), tx), tz), ty);
    };
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ci = cols[x | z << 4]; const h = ci.h; const bio = BIOMES[ci.biome]; const wx = x0 + x, wz = z0 + z;
      const dsl = DEEP + Math.round(this.nDS.n2(wx * 0.1, wz * 0.1) * 3);
      const waterTop = ci.lake ? ci.lake : SEA;
      const fillDepth = bio.top === ID.sand && ci.biome === BI.desert ? 5 : 3 + ((hash2(this.seed, wx, wz) * 2) | 0);
      const cliff = ci.mountain > 20 && Math.abs(this.col(wx + 1, wz).h - h) + Math.abs(this.col(wx, wz + 1).h - h) > 4;
      for (let y = 0; y <= Math.max(h, waterTop); y++) {
        const i = x | z << 4 | y << 8; let id;
        if (y <= 4 && (y === 0 || hash3(this.seed, wx, y, wz) < 0.8 - y * 0.18)) { B[i] = ID.bedrock; continue; }
        if (y > h) { if (y <= waterTop) { id = ID.water; if (y === waterTop && bio.snow && (ci.biome === BI.frozen_ocean || ci.biome === BI.frozen_river || ci.biome === BI.snowy_plains || ci.biome === BI.snowy_taiga) && this.nS.n2(wx * 0.05, wz * 0.05) > -0.3) id = ID.ice; B[i] = id; } continue; }
        if (y === h) id = (h < waterTop) ? (ci.river || ci.lake ? (hash2(this.seed + 5, wx, wz) < 0.3 ? ID.gravel : hash2(this.seed + 6, wx, wz) < 0.12 ? ID.clay : ID.sand) : (ci.biome === BI.mangrove_swamp ? ID.mud : bio.top === ID.grass_block || bio.top === ID.snowy_grass ? (h > SEA - 6 ? ID.sand : ID.gravel) : bio.top)) : bio.top;
        else if (y > h - fillDepth) id = (h < waterTop && bio.fill === ID.dirt) ? ID.sand : bio.fill;
        else id = y < dsl ? ID.deepslate : ID.stone;
        if (ci.biome === BI.desert && y <= h - fillDepth && y > h - fillDepth - 4) id = ID.sandstone;
        if ((ci.biome === BI.beach || ci.biome === BI.ocean) && y <= h - 3 && y > h - 6) id = ID.sandstone;
        if (cliff && y > h - 4) id = ID.stone;
        if ((ci.biome === BI.mountains) && y === h && h > SEA + 70) id = ID.snowy_grass;
        if ((ci.biome === BI.snowy_peaks || ci.biome === BI.jagged_peaks) && y > h - 3) id = (y === h && cliff) ? ID.stone : (ci.biome === BI.jagged_peaks && y < h ? ID.packed_ice : ID.snow_block);
        // variedades de piedra
        if (id === ID.stone) { const v = this.nV.n3(wx * 0.05, y * 0.05, wz * 0.05); if (v > 0.55) id = ID.granite; else if (v < -0.58) id = ID.diorite; else if (v > 0.42 && v < 0.46) id = ID.andesite; }
        if (id === ID.deepslate) { const v = this.nV.n3(wx * 0.06 + 99, y * 0.06, wz * 0.06); if (v > 0.6) id = ID.tuff; }
        B[i] = id;
      }
      // tallar cuevas
      const top = h - (h < SEA + 2 ? 6 : 0);
      for (let y = 5; y < top; y++) {
        const i = x | z << 4 | y << 8;
        const cv = sample(cave, x, y, z), chz = sample(cheese, x, y, z);
        let carve = cv < 0.0065 + (y < DEEP ? 0.003 : 0) || (chz > 0.42 && y < SEA - 18);
        if (!carve) continue;
        if (y >= h - 1 && (ci.biome === BI.desert || h < SEA + 3)) continue;
        B[i] = y < 11 ? ID.lava : 0;
      }
      // superficie: nieve, plantas
      const sy = h + 1;
      if (sy < H && B[x | z << 4 | sy << 8] === 0 && B[x | z << 4 | h << 8] !== 0 && h >= waterTop) {
        const top = B[x | z << 4 | h << 8];
        if (bio.snow && (top === ID.snowy_grass || top === ID.snow_block || top === ID.sand || top === ID.stone || top === ID.packed_ice)) {
          const depth = clamp(Math.round(2 + this.nS.fbm2(wx * 0.06, wz * 0.06, 2) * 5 + this.nS.n2(wx * 0.3, wz * 0.3)), 1, 7);
          B[x | z << 4 | sy << 8] = ID.snow; M[x | z << 4 | sy << 8] = depth;
        } else if (top === ID.grass_block) {
          const rr = r();
          const grassy = { [BI.plains]: 0.3, [BI.sunflower_plains]: 0.35, [BI.forest]: 0.15, [BI.birch_forest]: 0.15, [BI.dark_forest]: 0.1, [BI.taiga]: 0.18, [BI.savanna]: 0.4, [BI.jungle]: 0.45, [BI.mountains]: 0.12, [BI.mangrove_swamp]: 0.1 }[ci.biome] || 0.05;
          if (rr < grassy) B[x | z << 4 | sy << 8] = (ci.biome === BI.taiga || ci.biome === BI.jungle) && r() < 0.4 ? ID.fern : ID.tall_grass;
          else if (rr < grassy + 0.02) B[x | z << 4 | sy << 8] = [ID.poppy, ID.dandelion, ID.oxeye_daisy, ID.cornflower, ci.biome === BI.mangrove_swamp ? ID.blue_orchid : ID.dandelion][(r() * 5) | 0];
          else if (ci.biome === BI.dark_forest && rr < grassy + 0.03) B[x | z << 4 | sy << 8] = r() < 0.5 ? ID.red_mushroom : ID.brown_mushroom;
          else if (ci.biome === BI.jungle && rr < grassy + 0.025 && r() < 0.3) { B[x | z << 4 | sy << 8] = ID.melon; }
          else if ((ci.biome === BI.plains || ci.biome === BI.taiga) && rr > 0.9985) B[x | z << 4 | sy << 8] = ID.pumpkin;
        } else if (top === ID.sand && ci.biome === BI.desert) {
          const rr = r();
          if (rr < 0.006 && x > 0 && x < 15 && z > 0 && z < 15) { const hh = 1 + (r() * 3) | 0; for (let k = 0; k < hh; k++) if (sy + k < H) B[x | z << 4 | (sy + k) << 8] = ID.cactus; }
          else if (rr < 0.012) B[x | z << 4 | sy << 8] = ID.dead_bush;
        } else if ((top === ID.sand || top === ID.dirt || top === ID.grass_block) && h === waterTop - 0 && r() < 0.03) { /* */ }
      }
      // caña de azúcar en orillas, algas y pasto marino
      if (h === SEA && B[x | z << 4 | (h + 1) << 8] === 0 && (B[x | z << 4 | h << 8] === ID.sand || B[x | z << 4 | h << 8] === ID.grass_block) && r() < 0.04) {
        const near = cols[(Math.min(15, x + 1)) | z << 4].h < SEA || cols[Math.max(0, x - 1) | z << 4].h < SEA || cols[x | Math.min(15, z + 1) << 4].h < SEA || cols[x | Math.max(0, z - 1) << 4].h < SEA;
        if (near) { const hh = 1 + (r() * 3) | 0; for (let k = 1; k <= hh; k++) B[x | z << 4 | (h + k) << 8] = ID.sugar_cane; }
      }
      if (h < waterTop - 1 && !ci.lake) {
        const rr = r(); const above = x | z << 4 | (h + 1) << 8;
        if (B[above] === ID.water) {
          if (rr < 0.12 && ci.biome !== BI.frozen_ocean) B[above] = ID.seagrass;
          else if (rr < 0.17 && ci.biome !== BI.frozen_ocean && h < SEA - 4) { const hh = 2 + (r() * Math.min(10, waterTop - h - 3)) | 0; for (let k = 1; k <= hh; k++) if (B[x | z << 4 | (h + k) << 8] === ID.water) B[x | z << 4 | (h + k) << 8] = ID.kelp; }
        }
      }
      if (ci.biome === BI.mangrove_swamp && h === SEA - 1 && r() < 0.05 && B[x | z << 4 | (h + 2) << 8] === 0) B[x | z << 4 | (h + 2) << 8] = ID.lily_pad;
    }
    // biomas de cueva y decoración subterránea
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = x0 + x, wz = z0 + z; const h = cols[x | z << 4].h;
      for (let y = 6; y < h - 4; y++) {
        const i = x | z << 4 | y << 8;
        if (B[i] !== 0) continue;
        const below = B[i - 256], above = B[i + 256];
        const cb = this.caveBiome(wx, y, wz); if (cb < 0) { if (below === ID.stone && r() < 0.01 && y < SEA - 10) B[i] = r() < 0.5 ? ID.brown_mushroom : 0; continue; }
        const floor = below !== 0 && below !== ID.water && below !== ID.lava && REG[below].solid, ceil = above !== 0 && REG[above].solid && above !== ID.bedrock;
        if (cb === BI.lush_caves) {
          if (floor) { B[i - 256] = r() < 0.08 ? ID.clay : ID.moss_block; const rr = r(); if (rr < 0.25) B[i] = ID.tall_grass; else if (rr < 0.3) B[i] = ID.azalea_leaves; else if (rr < 0.33 && y < SEA - 25) { B[i] = ID.water; } }
          if (ceil) { if (r() < 0.25) B[i + 256] = ID.moss_block; if (r() < 0.12) { const len = 1 + (r() * 5) | 0; for (let k = 0; k < len && B[i - k * 256] === 0 && y - k > 6; k++) B[i - k * 256] = ID.cave_vines; } }
        } else if (cb === BI.dripstone_caves) {
          if (floor && r() < 0.5) { B[i - 256] = ID.dripstone_block; if (r() < 0.18) { const len = 1 + (r() * 3) | 0; for (let k = 0; k < len && B[i + k * 256] === 0; k++) B[i + k * 256] = ID.pointed_dripstone; } }
          if (ceil && r() < 0.5) { B[i + 256] = ID.dripstone_block; if (r() < 0.18) { const len = 1 + (r() * 4) | 0; for (let k = 0; k < len && B[i - k * 256] === 0; k++) { B[i - k * 256] = ID.pointed_dripstone; M[i - k * 256] = 1; } } }
        } else if (cb === BI.deep_dark) {
          if (floor) { if (r() < 0.75) B[i - 256] = ID.sculk; if (r() < 0.012) B[i] = ID.sculk_sensor; }
          if (ceil && r() < 0.3) B[i + 256] = ID.sculk;
        }
      }
    }
    // menas
    const ore = (id, dId, tries, size, ymin, ymax, peak) => {
      for (let t = 0; t < tries; t++) {
        let x = (r() * 16) | 0, z = (r() * 16) | 0; let y;
        if (peak !== undefined) { const a = r(), b = r(); y = Math.round(ymin + (a + b) / 2 * (ymax - ymin)); } else y = (ymin + r() * (ymax - ymin)) | 0;
        for (let k = 0; k < size; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < H) { const i = x | z << 4 | y << 8; const b = B[i]; if (b === ID.stone || b === ID.granite || b === ID.diorite || b === ID.andesite) B[i] = id; else if ((b === ID.deepslate || b === ID.tuff) && dId) B[i] = dId; }
          const d = (r() * 6) | 0; if (d === 0) x++; else if (d === 1) x--; else if (d === 2) z++; else if (d === 3) z--; else if (d === 4) y++; else y--;
        }
      }
    };
    const Y = v => v + 64;
    ore(ID.coal_ore, ID.deepslate_coal_ore, 20, 14, Y(0), Y(192)); ore(ID.coal_ore, null, 6, 10, Y(70), Y(190));
    ore(ID.iron_ore, ID.deepslate_iron_ore, 12, 9, Y(-24), Y(56), 1); ore(ID.iron_ore, null, 6, 9, Y(80), Y(250));
    ore(ID.copper_ore, ID.deepslate_copper_ore, 10, 10, Y(-16), Y(112), 1);
    ore(ID.gold_ore, ID.deepslate_gold_ore, 4, 8, Y(-64), Y(32), 1);
    ore(ID.redstone_ore, ID.deepslate_redstone_ore, 6, 8, Y(-64), Y(15));
    ore(ID.lapis_ore, ID.deepslate_lapis_ore, 3, 7, Y(-32), Y(32), 1);
    ore(ID.diamond_ore, ID.deepslate_diamond_ore, 4, 6, Y(-64), Y(16));
    ore(ID.gravel, ID.tuff, 4, 25, Y(-50), Y(120)); ore(ID.dirt, null, 3, 25, Y(0), Y(140));
    if (cols[136].mountain > 20) ore(ID.emerald_ore, ID.deepslate_emerald_ore, 4, 1, Y(-16), Y(250));
    // árboles (incluyendo los que cruzan desde chunks vecinos)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.treesFor(ch, ch.cx + dx, ch.cz + dz);
    // mobs pacíficos al generar
    const sr = rngFor(this.seed, ch.cx, ch.cz, 5);
    if (sr() < 0.12) {
      const ci = cols[136]; const b = ci.biome; if (ci.h >= SEA && b !== BI.desert && b !== BI.river && b !== BI.beach) {
        const kinds = b === BI.snowy_plains || b === BI.snowy_peaks || b === BI.jagged_peaks || b === BI.mountains ? ['goat', 'sheep'] : b === BI.jungle ? ['chicken', 'pig'] : ['pig', 'cow', 'sheep', 'chicken'];
        const k = kinds[(sr() * kinds.length) | 0]; for (let i = 0; i < 2 + sr() * 3; i++) ch.spawns.push({ type: k, x: x0 + 2 + sr() * 12, z: z0 + 2 + sr() * 12 });
      }
    }
  }
  treesFor(ch, tcx, tcz) {
    const r = rngFor(this.seed, tcx, tcz, 2); const x0 = tcx * 16, z0 = tcz * 16;
    const mid = this.col(x0 + 8, z0 + 8); const b = mid.biome;
    const dens = { [BI.forest]: 9, [BI.birch_forest]: 8, [BI.dark_forest]: 12, [BI.taiga]: 8, [BI.snowy_taiga]: 6, [BI.jungle]: 14, [BI.savanna]: 1.2, [BI.plains]: 0.25, [BI.sunflower_plains]: 0.2, [BI.mangrove_swamp]: 5, [BI.mountains]: 1.5, [BI.snowy_plains]: 0.15 }[b] || 0;
    let n = Math.floor(dens) + (r() < dens % 1 ? 1 : 0);
    const S = new SB(ch, this);
    for (let i = 0; i < n; i++) {
      const tx = x0 + ((r() * 16) | 0), tz = z0 + ((r() * 16) | 0); const c = this.col(tx, tz);
      const rr = r(); const tr = mulberry32((this.seed ^ Math.imul(tx, 7919) ^ Math.imul(tz, 104729)) >>> 0);
      if (c.biome === BI.mangrove_swamp) { if (c.h >= SEA - 3) treeMangrove(S, tx, c.h + 1, tz, tr); continue; }
      if (c.h < SEA || c.river || c.lake) continue;
      if (c.biome !== b && dens < 1) continue;
      const y = c.h + 1; const snow = BIOMES[c.biome].snow;
      switch (c.biome) {
        case BI.forest: rr < 0.25 ? treeBirch(S, tx, y, tz, tr) : rr < 0.3 ? treeBigOak(S, tx, y, tz, tr) : treeOak(S, tx, y, tz, tr); break;
        case BI.birch_forest: rr < 0.85 ? treeBirch(S, tx, y, tz, tr, rr < 0.2) : treeOak(S, tx, y, tz, tr); break;
        case BI.dark_forest: rr < 0.7 ? treeDarkOak(S, tx, y, tz, tr) : rr < 0.8 ? treeHugeMushroom(S, tx, y, tz, tr) : treeOak(S, tx, y, tz, tr); break;
        case BI.taiga: case BI.snowy_taiga: case BI.snowy_plains: case BI.mountains: treeSpruce(S, tx, y, tz, tr, snow); break;
        case BI.jungle: rr < 0.12 ? treeJungleGiant(S, tx, y, tz, tr) : rr < 0.55 ? treeJungle(S, tx, y, tz, tr) : treeBush(S, tx, y, tz, tr); break;
        case BI.savanna: treeAcacia(S, tx, y, tz, tr); break;
        default: rr < 0.1 ? treeBigOak(S, tx, y, tz, tr) : treeOak(S, tx, y, tz, tr);
      }
    }
  }
  // ------------------------------------------------------------ NETHER
  netherBiome(x, z) {
    const a = this.nT.fbm2(x * 0.004, z * 0.004, 2), b = this.nHm.fbm2(x * 0.004, z * 0.004, 2);
    if (a > 0.25) return b > 0 ? BI.crimson_forest : BI.basalt_deltas;
    if (a < -0.25) return b > 0 ? BI.warped_forest : BI.soul_sand_valley;
    if (b > 0.4) return BI.soul_sand_valley; if (b < -0.4) return BI.crimson_forest;
    return BI.nether_wastes;
  }
  genNether(ch) {
    const B = ch.blocks, M = ch.meta, H = this.H, x0 = ch.cx * 16, z0 = ch.cz * 16; const r = rngFor(this.seed, ch.cx, ch.cz, 3);
    const GX = 5, GY = (H >> 3) + 1; const den = new Float32Array(GX * GX * GY);
    for (let gx = 0; gx < GX; gx++) for (let gz = 0; gz < GX; gz++) for (let gy = 0; gy < GY; gy++) {
      const wx = x0 + gx * 4, wz = z0 + gz * 4, wy = gy * 8;
      let d = this.nC1.fbm3(wx * 0.012, wy * 0.022, wz * 0.012, 3) * 1.2;
      d += wy < 30 ? (30 - wy) * 0.05 : 0; d += wy > 96 ? (wy - 96) * 0.06 : 0; d -= 0.12;
      den[(gy * GX + gz) * GX + gx] = d;
    }
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = x0 + x, wz = z0 + z; const bio = this.netherBiome(wx, wz); ch.biomes[x | z << 4] = bio;
      for (let y = 0; y < H; y++) {
        const i = x | z << 4 | y << 8;
        if (y === 0 || y === H - 1 || (y < 5 && hash3(this.seed, wx, y, wz) < 0.7 - y * 0.15) || (y > H - 6 && hash3(this.seed, wx, y, wz) < 0.7 - (H - 1 - y) * 0.15)) { B[i] = ID.bedrock; continue; }
        const fx = x / 4, fz = z / 4, fy = y / 8; const ix = Math.min(fx | 0, 3), iz = Math.min(fz | 0, 3), iy = Math.min(fy | 0, GY - 2); const tx = fx - ix, ty = fy - iy, tz = fz - iz;
        const g = (a, b, c) => den[((iy + b) * GX + iz + c) * GX + ix + a];
        const d = lerp(lerp(lerp(g(0, 0, 0), g(1, 0, 0), tx), lerp(g(0, 0, 1), g(1, 0, 1), tx), tz), lerp(lerp(g(0, 1, 0), g(1, 1, 0), tx), lerp(g(0, 1, 1), g(1, 1, 1), tx), tz), ty);
        if (d > 0) {
          let id = ID.netherrack;
          if (bio === BI.basalt_deltas) id = this.nV.n3(wx * 0.08, y * 0.08, wz * 0.08) > 0 ? ID.basalt : ID.blackstone;
          else if (bio === BI.soul_sand_valley && d < 0.25) id = this.nV.n2(wx * 0.1, wz * 0.1) > 0 ? ID.soul_sand : ID.soul_soil;
          B[i] = id;
        } else B[i] = y <= 32 ? ID.lava : 0;
      }
      // superficie y techos
      for (let y = 2; y < H - 2; y++) {
        const i = x | z << 4 | y << 8;
        if (B[i] === 0 && B[i - 256] !== 0 && B[i - 256] !== ID.lava && B[i - 256] !== ID.bedrock) {
          const below = i - 256;
          if (bio === BI.crimson_forest) { B[below] = ID.crimson_nylium; const rr = r(); if (rr < 0.12) B[i] = ID.crimson_roots; else if (rr < 0.14) B[i] = ID.crimson_fungus; }
          else if (bio === BI.warped_forest) { B[below] = ID.warped_nylium; const rr = r(); if (rr < 0.12) B[i] = ID.warped_roots; else if (rr < 0.14) B[i] = ID.warped_fungus; }
          else if (bio === BI.soul_sand_valley) { B[below] = r() < 0.6 ? ID.soul_sand : ID.soul_soil; if (r() < 0.004) B[i] = ID.fire; }
          else if (bio === BI.basalt_deltas) { if (r() < 0.06) B[below] = ID.magma_block; else if (r() < 0.08) B[below] = ID.lava; }
          else { if (r() < 0.01) B[i] = ID.fire; if (y < 36 && r() < 0.2) B[below] = ID.magma_block; if (r() < 0.015) B[i] = r() < 0.5 ? ID.red_mushroom : ID.brown_mushroom; }
        }
        if (B[i] === 0 && B[i + 256] !== 0 && B[i + 256] !== ID.bedrock && B[i + 256] !== ID.lava) {
          if ((bio === BI.nether_wastes || bio === BI.crimson_forest) && r() < 0.02) { const s = 2 + (r() * 5) | 0; for (let k = 0; k < s && y - k > 1; k++) if (B[i - k * 256] === 0) B[i - k * 256] = ID.glowstone; }
          if (bio === BI.crimson_forest && r() < 0.05) { const s = 1 + (r() * 6) | 0; for (let k = 0; k < s && y - k > 1 && B[i - k * 256] === 0; k++) B[i - k * 256] = ID.weeping_vines; }
          if (bio === BI.warped_forest && r() < 0.008) { const s = 2 + (r() * 3) | 0; for (let k = 0; k < s && y - k > 1; k++) if (B[i - k * 256] === 0) B[i - k * 256] = ID.shroomlight; }
        }
      }
      if (bio === BI.basalt_deltas && r() < 0.03) { // columnas de basalto
        let y = 33; while (y < H - 4 && B[x | z << 4 | y << 8] !== 0) y++; const hh = 2 + (r() * 8) | 0; for (let k = 0; k < hh; k++) if (B[x | z << 4 | (y + k) << 8] === 0) B[x | z << 4 | (y + k) << 8] = ID.basalt;
      }
    }
    // menas del nether
    for (let t = 0; t < 16; t++) { const x = (r() * 16) | 0, z = (r() * 16) | 0, y = 10 + (r() * 108) | 0; for (let k = 0; k < 6; k++) { const i = ((x + k % 2) & 15) | ((z + (k >> 1) % 2) & 15) << 4 | Math.min(H - 2, y + (k >> 2)) << 8; if (B[i] === ID.netherrack) B[i] = ID.nether_quartz_ore; } }
    for (let t = 0; t < 10; t++) { const x = (r() * 16) | 0, z = (r() * 16) | 0, y = 10 + (r() * 108) | 0; for (let k = 0; k < 5; k++) { const i = ((x + k % 2) & 15) | ((z + (k >> 1) % 2) & 15) << 4 | Math.min(H - 2, y + (k >> 2)) << 8; if (B[i] === ID.netherrack) B[i] = ID.nether_gold_ore; } }
    for (let t = 0; t < 2; t++) { const x = (r() * 16) | 0, z = (r() * 16) | 0, y = 8 + (r() * 14) | 0; const i = x | z << 4 | y << 8; if (B[i] === ID.netherrack || B[i] === ID.basalt || B[i] === ID.blackstone) B[i] = ID.ancient_debris; if (r() < 0.4) { const j = (x ^ 1) | z << 4 | y << 8; if (B[j] === ID.netherrack) B[j] = ID.ancient_debris; } }
    for (let t = 0; t < 4; t++) { const x = (r() * 16) | 0, z = (r() * 16) | 0, y = 10 + (r() * 100) | 0; const i = x | z << 4 | y << 8; if (B[i] === ID.netherrack) B[i] = ID.gravel; }
    // árboles hongo
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const tcx = ch.cx + dx, tcz = ch.cz + dz; const rr = rngFor(this.seed, tcx, tcz, 4); const S = new SB(ch, this);
      for (let i = 0; i < 6; i++) {
        const tx = tcx * 16 + ((rr() * 16) | 0), tz = tcz * 16 + ((rr() * 16) | 0); const bio = this.netherBiome(tx, tz);
        if (bio !== BI.crimson_forest && bio !== BI.warped_forest) continue;
        // buscar suelo determinista con ruido: usamos densidad a varias alturas
        const fy = this.netherFloor(tx, tz); if (fy < 0) continue;
        treeFungus(S, tx, fy + 1, tz, mulberry32((tx * 31 + tz * 17) ^ this.seed), bio === BI.crimson_forest);
      }
    }
  }
  netherDensity(x, y, z) { let d = this.nC1.fbm3(x * 0.012, y * 0.022, z * 0.012, 3) * 1.2; d += y < 30 ? (30 - y) * 0.05 : 0; d += y > 96 ? (y - 96) * 0.06 : 0; return d - 0.12; }
  netherFloor(x, z) { for (let y = 34; y < 100; y++) if (this.netherDensity(x, y - 1, z) > 0.05 && this.netherDensity(x, y, z) < -0.05 && this.netherDensity(x, y + 4, z) < 0) return y - 1; return -1; }
  // ------------------------------------------------------------ END
  genEnd(ch) {
    const B = ch.blocks, H = this.H, x0 = ch.cx * 16, z0 = ch.cz * 16;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = x0 + x, wz = z0 + z; const d = Math.hypot(wx, wz);
      let top = -1, bot = 0;
      if (d < 110) {
        const R = 85 + this.nD.n2(wx * 0.02, wz * 0.02) * 18;
        if (d < R) { const t = d / R; top = Math.floor(62 + this.nD.n2(wx * 0.05, wz * 0.05) * 2 - t * t * 6); bot = Math.floor(top - (1 - t * t) * 45 - 4); }
        ch.biomes[x | z << 4] = BI.the_end;
      } else if (d > 900) {
        const n = this.nC.fbm2(wx * 0.006, wz * 0.006, 4) + this.nE.n2(wx * 0.02, wz * 0.02) * 0.2;
        if (n > 0.18) { const t = (n - 0.18) * 3; top = Math.floor(58 + t * 22 + this.nD.n2(wx * 0.05, wz * 0.05) * 3); bot = Math.floor(top - 6 - t * 30); }
        ch.biomes[x | z << 4] = n > 0.3 ? BI.end_highlands : BI.small_end_islands;
      } else ch.biomes[x | z << 4] = BI.small_end_islands;
      if (top > 0) for (let y = Math.max(1, bot); y <= Math.min(top, H - 2); y++) B[x | z << 4 | y << 8] = ID.end_stone;
      if (d > 900 && top > 0 && hash2(this.seed, wx, wz) < 0.004) { // plantas coral
        const r = mulberry32(wx * 7 + wz * 13); const hh = 3 + (r() * 6) | 0; for (let k = 1; k <= hh && top + k < H; k++) B[x | z << 4 | (top + k) << 8] = k === hh ? ID.chorus_flower : ID.chorus_plant;
      }
    }
    // pilares de obsidiana
    const S = new SB(ch, this);
    for (const p of endPillars(this.seed)) {
      if (Math.abs(p.x - x0 - 8) > 16 || Math.abs(p.z - z0 - 8) > 16) continue;
      for (let y = 30; y <= p.h; y++) for (let dx = -p.r; dx <= p.r; dx++) for (let dz = -p.r; dz <= p.r; dz++) if (dx * dx + dz * dz <= p.r * p.r + 1) S.set(p.x + dx, y, p.z + dz, ID.obsidian);
      S.set(p.x, p.h + 1, p.z, ID.bedrock);
      if (p.caged) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 1; dy <= 4; dy++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2 || dy === 4) S.set(p.x + dx, p.h + dy, p.z + dz, ID.iron_bars);
    }
    // plataforma de llegada
    if (Math.abs(100 - x0 - 8) < 12 && Math.abs(0 - z0 - 8) < 12) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { S.set(100 + dx, 48, dz, ID.obsidian); for (let dy = 1; dy <= 3; dy++) S.set(100 + dx, 48 + dy, dz, 0); }
  }
  // ------------------------------------------------------------ ESTRUCTURAS
  genStructures(ch) {
    for (const st of STRUCTS) {
      if (st.dim !== this.dim) continue;
      if (st.fixed) { for (const c of st.fixed(this)) this.tryBuild(ch, st, c); continue; }
      const sp = st.spacing * 16, R = st.radius;
      const rx0 = Math.floor((ch.cx * 16 - R) / sp), rx1 = Math.floor((ch.cx * 16 + 16 + R) / sp);
      const rz0 = Math.floor((ch.cz * 16 - R) / sp), rz1 = Math.floor((ch.cz * 16 + 16 + R) / sp);
      for (let rx = rx0; rx <= rx1; rx++) for (let rz = rz0; rz <= rz1; rz++) {
        const c = this.candidate(st, rx, rz);
        if (c) this.tryBuild(ch, st, c);
      }
    }
  }
  candidate(st, rx, rz) {
    const key = st.name + rx + ',' + rz; let c = this.structCache.get(key);
    if (c === undefined) {
      const sp = st.spacing * 16; const r = rngFor(this.seed, rx, rz, hashStr(st.name)); const sep = st.sep || 4;
      const x = rx * sp + 8 + Math.floor(r() * (st.spacing - sep)) * 16, z = rz * sp + 8 + Math.floor(r() * (st.spacing - sep)) * 16;
      c = (r() < (st.chance || 1)) ? st.place(this, x, z, r) : null; if (c) { c.x = c.x ?? x; c.z = c.z ?? z; c.seed = (r() * 4294967296) >>> 0; }
      this.structCache.set(key, c);
    }
    return c;
  }
  tryBuild(ch, st, c) {
    const R = c.radius || st.radius;
    if (c.x + R < ch.cx * 16 || c.x - R > ch.cx * 16 + 15 || c.z + R < ch.cz * 16 || c.z - R > ch.cz * 16 + 15) return;
    const S = new SB(ch, this); S.water = !!c.water;
    st.build(S, c, mulberry32(c.seed));
  }
  structuresNear(name, x, z) { // para el ojo de ender y localización
    const st = STRUCTS.find(s => s.name === name); if (!st) return null;
    if (st.fixed) { let best = null, bd = 1e18; for (const c of st.fixed(this)) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; } } return best; }
    const sp = st.spacing * 16; const rx0 = Math.floor(x / sp), rz0 = Math.floor(z / sp);
    for (let ring = 0; ring < 40; ring++) { let best = null, bd = 1e18;
      for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue; const c = this.candidate(st, rx0 + dx, rz0 + dz); if (c) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; } } }
      if (best) return best; }
    return null;
  }
}

// ---------------------------------------------------------------- builder
class SB {
  constructor(ch, gen) { this.c = ch; this.gen = gen; this.x0 = ch.cx * 16; this.z0 = ch.cz * 16; this.H = ch.H; this.water = false; }
  inside(x, y, z) { return x >= this.x0 && x < this.x0 + 16 && z >= this.z0 && z < this.z0 + 16 && y >= 0 && y < this.H; }
  set(x, y, z, id, meta = 0) { if (!this.inside(x, y, z)) return; const i = (x - this.x0) | (z - this.z0) << 4 | y << 8; if (id === 0 && this.water && y <= SEA) id = ID.water; this.c.blocks[i] = id; this.c.meta[i] = meta; }
  setIfAir(x, y, z, id, meta = 0) { const b = this.get(x, y, z); if (b === 0 || b === ID.water || (b > 0 && REG[b].replace)) this.set(x, y, z, id, meta); }
  setIfSolid(x, y, z, id) { const b = this.get(x, y, z); if (b > 0 && REG[b].solid) this.set(x, y, z, id); }
  get(x, y, z) { if (!this.inside(x, y, z)) return -1; return this.c.blocks[(x - this.x0) | (z - this.z0) << 4 | y << 8]; }
  fill(x0, y0, z0, x1, y1, z1, id, meta = 0) {
    const ax = Math.max(Math.min(x0, x1), this.x0), bx = Math.min(Math.max(x0, x1), this.x0 + 15), az = Math.max(Math.min(z0, z1), this.z0), bz = Math.min(Math.max(z0, z1), this.z0 + 15);
    if (ax > bx || az > bz) return; const ay = Math.max(0, Math.min(y0, y1)), by = Math.min(this.H - 1, Math.max(y0, y1));
    for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) this.set(x, y, z, id, meta);
  }
  fillFn(x0, y0, z0, x1, y1, z1, fn) {
    const ax = Math.max(Math.min(x0, x1), this.x0), bx = Math.min(Math.max(x0, x1), this.x0 + 15), az = Math.max(Math.min(z0, z1), this.z0), bz = Math.min(Math.max(z0, z1), this.z0 + 15);
    if (ax > bx || az > bz) return; const ay = Math.max(0, Math.min(y0, y1)), by = Math.min(this.H - 1, Math.max(y0, y1));
    for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) { const id = fn(x, y, z); if (id !== undefined && id !== null) this.set(x, y, z, id); }
  }
  hollow(x0, y0, z0, x1, y1, z1, wall, inner = 0) { this.fillFn(x0, y0, z0, x1, y1, z1, (x, y, z) => (x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1) ? (typeof wall === 'function' ? wall(x, y, z) : wall) : inner); }
  chest(x, y, z, table, meta = 0) { if (!this.inside(x, y, z)) return; this.set(x, y, z, ID.chest, meta); this.c.loot[(x - this.x0) | (z - this.z0) << 4 | y << 8] = table; }
  spawner(x, y, z, mob, trial) { if (!this.inside(x, y, z)) return; this.set(x, y, z, trial ? ID.trial_spawner : ID.spawner); this.c.spawners[(x - this.x0) | (z - this.z0) << 4 | y << 8] = mob; }
  mob(type, x, y, z) { if (!this.inside(Math.floor(x), Math.floor(y), Math.floor(z))) return; this.c.spawns.push({ type, x, y, z }); }
  colH(x, z) { return this.gen.col(x, z).h; }
  foundation(x, z, y, id) { for (let yy = y - 1; yy > y - 12 && yy > 0; yy--) { const b = this.get(x, yy, z); if (b > 0 && REG[b].solid && b !== ID.water) break; this.set(x, yy, z, id); } }
}

// ---------------------------------------------------------------- árboles
function leafBlob(S, cx, cy, cz, rad, id, r, round = true) {
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
    const d = dx * dx + dy * dy * 1.6 + dz * dz; if (d > rad * rad + 0.5) continue; if (round && d > rad * rad - 1 && r() < 0.35) continue;
    S.setIfAir(cx + dx, cy + dy, cz + dz, id);
  }
}
function trunk(S, x, y, z, h, id) { for (let i = 0; i < h; i++) S.set(x, y + i, z, id); S.setIfSolid(x, y - 1, z, ID.dirt); }
function treeOak(S, x, y, z, r) { const h = 4 + (r() * 3) | 0; for (let dy = h - 3; dy <= h; dy++) { const rad = dy >= h - 1 ? 1 : 2; for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) { if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy === h || r() < 0.5)) continue; S.setIfAir(x + dx, y + dy, z + dz, ID.oak_leaves); } } trunk(S, x, y, z, h, ID.oak_log); if (r() < 0.04) S.setIfAir(x + 1, y + h - 2, z, ID.oak_leaves); }
function treeBigOak(S, x, y, z, r) { const h = 7 + (r() * 5) | 0; trunk(S, x, y, z, h, ID.oak_log); leafBlob(S, x, y + h - 1, z, 3, ID.oak_leaves, r); for (let i = 0; i < 3; i++) { const a = r() * 6.28, l = 2 + r() * 2; const bx = Math.round(x + Math.cos(a) * l), bz = Math.round(z + Math.sin(a) * l), by = y + h - 3 - ((r() * 2) | 0); S.set(Math.round(x + Math.cos(a) * l * 0.5), by - 1, Math.round(z + Math.sin(a) * l * 0.5), ID.oak_log); S.set(bx, by, bz, ID.oak_log); leafBlob(S, bx, by + 1, bz, 2, ID.oak_leaves, r); } }
function treeBirch(S, x, y, z, r, tall) { const h = 5 + (r() * 3) | 0 + (tall ? 4 : 0); for (let dy = h - 3; dy <= h; dy++) { const rad = dy >= h - 1 ? 1 : 2; for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) { if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy === h || r() < 0.5)) continue; S.setIfAir(x + dx, y + dy, z + dz, ID.birch_leaves); } } trunk(S, x, y, z, h, ID.birch_log); }
function treeSpruce(S, x, y, z, r, snow) {
  const h = 7 + (r() * 6) | 0; let rad = 0; const top = y + h;
  for (let yy = top; yy >= y + 2; yy--) { const k = top - yy; rad = k === 0 ? 0 : (k % 2 === 1 ? Math.min(3, 1 + (k >> 2)) : Math.max(1, Math.min(3, (k >> 2)))); for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) { if (Math.abs(dx) + Math.abs(dz) > rad + (rad > 1 ? 1 : 0)) continue; S.setIfAir(x + dx, yy, z + dz, ID.spruce_leaves); if (snow && r() < 0.6) S.setIfAir(x + dx, yy + 1, z + dz, ID.snow); } }
  S.setIfAir(x, top + 1, z, ID.spruce_leaves); trunk(S, x, y, z, h, ID.spruce_log);
}
function treeDarkOak(S, x, y, z, r) {
  const h = 6 + (r() * 3) | 0; for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) trunk(S, x + dx, y, z + dz, h, ID.dark_oak_log);
  for (let dy = h - 2; dy <= h + 1; dy++) { const rad = dy === h + 1 ? 2 : 3 + (dy === h - 1 ? 1 : 0); for (let dx = -rad; dx <= rad + 1; dx++) for (let dz = -rad; dz <= rad + 1; dz++) { if ((Math.abs(dx - 0.5) + Math.abs(dz - 0.5)) > rad + 1.6 && r() < 0.7) continue; S.setIfAir(x + dx, y + dy, z + dz, ID.dark_oak_leaves); } }
}
function treeHugeMushroom(S, x, y, z, r) { const red = r() < 0.5; const h = 5 + (r() * 2) | 0; for (let i = 0; i < h; i++) S.set(x, y + i, z, ID.mushroom_stem || ID.birch_log); const cap = red ? ID.red_wool : ID.brown_wool; if (red) { for (let dy = h - 3; dy <= h; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if ((Math.abs(dx) === 2 || Math.abs(dz) === 2 || dy === h) && !(Math.abs(dx) === 2 && Math.abs(dz) === 2)) S.setIfAir(x + dx, y + dy, z + dz, cap); } else for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (!(Math.abs(dx) === 3 && Math.abs(dz) === 3)) S.setIfAir(x + dx, y + h, z + dz, cap); }
function treeJungle(S, x, y, z, r) { const h = 6 + (r() * 5) | 0; trunk(S, x, y, z, h, ID.jungle_log); leafBlob(S, x, y + h, z, 2, ID.jungle_leaves, r); for (let i = 0; i < h - 1; i++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (r() < 0.25) S.setIfAir(x + dx, y + i, z + dz, ID.vine); if (r() < 0.3) { S.setIfAir(x + 1, y + 3, z, ID.jungle_leaves); } }
function treeJungleGiant(S, x, y, z, r) { const h = 16 + (r() * 12) | 0; for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) trunk(S, x + dx, y, z + dz, h, ID.jungle_log); leafBlob(S, x, y + h, z, 4, ID.jungle_leaves, r); for (let i = 0; i < 3; i++) { const yy = y + h - 4 - i * 4; const a = r() * 6.28; const bx = Math.round(x + Math.cos(a) * 3), bz = Math.round(z + Math.sin(a) * 3); S.set(bx, yy, bz, ID.jungle_log); leafBlob(S, bx, yy + 1, bz, 2, ID.jungle_leaves, r); } for (let i = 2; i < h; i++) for (const [dx, dz] of [[-1, 0], [2, 0], [0, -1], [0, 2]]) if (r() < 0.4) S.setIfAir(x + dx, y + i, z + dz, ID.vine); }
function treeBush(S, x, y, z, r) { S.set(x, y, z, ID.jungle_log); leafBlob(S, x, y + 1, z, 2, ID.oak_leaves, r); }
function treeAcacia(S, x, y, z, r) {
  const h = 4 + (r() * 2) | 0; const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][(r() * 4) | 0]; let cx = x, cz = z;
  for (let i = 0; i < h; i++) { if (i >= h - 2) { cx += dir[0]; cz += dir[1]; } S.set(cx, y + i, cz, ID.acacia_log); }
  S.setIfSolid(x, y - 1, z, ID.dirt); const ty = y + h;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) + Math.abs(dz) <= 4) S.setIfAir(cx + dx, ty - 1, cz + dz, ID.acacia_leaves);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) + Math.abs(dz) <= 2) S.setIfAir(cx + dx, ty, cz + dz, ID.acacia_leaves);
}
function treeMangrove(S, x, y, z, r) {
  const h = 6 + (r() * 4) | 0; const base = y + 2;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) { for (let k = 0; k < 4; k++) { const rx = x + dx * (k > 1 ? 2 : 1), rz = z + dz * (k > 1 ? 2 : 1); S.setIfAir(rx, base - k, rz, ID.mangrove_roots); } }
  for (let i = 0; i < h; i++) S.set(x, base + i, z, ID.mangrove_log); leafBlob(S, x, base + h, z, 3, ID.mangrove_leaves, r);
  for (let i = 0; i < 4; i++) { const lx = x + ((r() * 7) | 0) - 3, lz = z + ((r() * 7) | 0) - 3; for (let k = 1; k < 4; k++) S.setIfAir(lx, base + h - 2 - k, lz, ID.vine); }
}
function treeFungus(S, x, y, z, r, crimson) {
  const h = 5 + (r() * 8) | 0; const stem = crimson ? ID.crimson_stem : ID.warped_stem, wart = crimson ? ID.nether_wart_block : ID.warped_wart_block;
  for (let i = 0; i < h; i++) S.set(x, y + i, z, stem);
  for (let dy = -3; dy <= 0; dy++) { const rad = dy === 0 ? 1 : 2 + (dy < -1 ? 1 : 0); for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) { if (dy < 0 && Math.abs(dx) < rad && Math.abs(dz) < rad) continue; S.setIfAir(x + dx, y + h + dy, z + dz, r() < 0.08 ? ID.shroomlight : wart); } }
  S.setIfAir(x, y + h, z, wart);
}
function endPillars(seed) {
  const r = mulberry32(seed ^ 0xE4D); const out = []; const off = r() * Math.PI * 2;
  for (let i = 0; i < 10; i++) { const a = off + i / 10 * Math.PI * 2; out.push({ x: Math.round(Math.cos(a) * 42), z: Math.round(Math.sin(a) * 42), r: 2 + (i % 4), h: 76 + i * 3 + ((r() * 3) | 0), caged: i === 1 || i === 6 }); }
  return out;
}

// ================================================================ ESTRUCTURAS
const STRUCTS = [];
function defStruct(o) { STRUCTS.push(o); }
const VMAT = {
  plains: { log: 'oak_log', planks: 'oak_planks', base: 'cobblestone', roof: 'oak_planks', path: 'dirt_path' },
  desert: { log: 'cut_sandstone', planks: 'sandstone', base: 'sandstone', roof: 'cut_sandstone', path: 'dirt_path' },
  savanna: { log: 'acacia_log', planks: 'acacia_planks', base: 'cobblestone', roof: 'acacia_planks', path: 'dirt_path' },
  taiga: { log: 'spruce_log', planks: 'spruce_planks', base: 'cobblestone', roof: 'spruce_planks', path: 'dirt_path' },
  snowy: { log: 'spruce_log', planks: 'spruce_planks', base: 'stone_bricks', roof: 'snow_block', path: 'dirt_path' }
};
function flatEnough(gen, x, z, rad, maxd) { const h0 = gen.col(x, z).h; for (const [dx, dz] of [[rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad, rad], [-rad, -rad]]) if (Math.abs(gen.col(x + dx, z + dz).h - h0) > maxd) return false; return true; }
// 1. ALDEA ---------------------------------------------------------
defStruct({
  name: 'village', dim: 'overworld', spacing: 26, radius: 64, sep: 6,
  place(gen, x, z) {
    const c = gen.col(x, z); const b = c.biome; let style = null;
    if (b === BI.plains || b === BI.sunflower_plains) style = 'plains'; else if (b === BI.desert) style = 'desert'; else if (b === BI.savanna) style = 'savanna'; else if (b === BI.taiga) style = 'taiga'; else if (b === BI.snowy_plains) style = 'snowy';
    if (!style || c.h < SEA + 1 || c.river || !flatEnough(gen, x, z, 24, 8)) return null; return { style };
  },
  build(S, c, r) {
    const M = {}; for (const k in VMAT[c.style]) M[k] = ID[VMAT[c.style][k]];
    const cy = S.colH(c.x, c.z);
    // pozo
    S.fill(c.x - 2, cy, c.z - 2, c.x + 1, cy, c.z + 1, ID.cobblestone);
    S.fill(c.x - 1, cy, c.z - 1, c.x, cy, c.z, ID.water); S.fill(c.x - 1, cy - 4, c.z - 1, c.x, cy - 1, c.z, ID.water);
    for (const [dx, dz] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) { S.fill(c.x + dx, cy + 1, c.z + dz, c.x + dx, cy + 2, c.z + dz, ID.oak_fence); }
    S.fill(c.x - 2, cy + 3, c.z - 2, c.x + 1, cy + 3, c.z + 1, ID.cobblestone); S.fill(c.x - 2, cy + 1, c.z - 2, c.x + 1, cy + 2, c.z + 1, 0); for (const [dx, dz] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) S.fill(c.x + dx, cy + 1, c.z + dz, c.x + dx, cy + 2, c.z + dz, ID.oak_fence);
    // calles y casas
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let houseN = 0;
    for (const [dx, dz] of dirs) {
      const len = 22 + (r() * 16) | 0;
      for (let i = 3; i < len; i++) {
        const px = c.x + dx * i, pz = c.z + dz * i;
        for (let w = -1; w <= 1; w++) { const qx = px + (dz !== 0 ? w : 0), qz = pz + (dx !== 0 ? w : 0); const h = S.colH(qx, qz); if (h >= SEA) { S.set(qx, h, qz, h === SEA ? M.planks : M.path); for (let k = 1; k <= 2; k++) S.setIfAir(qx, h + k, qz, 0); } else S.set(qx, SEA, qz, M.planks); }
        if (i % 7 === 5) for (const side of [-1, 1]) {
          const kind = r(); const off = 4 + (kind < 0.3 ? 1 : 0);
          const hx = px + (dz !== 0 ? side * off : 0), hz = pz + (dx !== 0 ? side * off : 0);
          const doorDir = dz !== 0 ? [-side, 0] : [0, -side];
          if (kind < 0.62) villageHouse(S, hx, hz, M, r, doorDir, houseN++, c.style, kind < 0.25 ? 4 : 3);
          else if (kind < 0.85) villageFarm(S, hx, hz, r);
          else { const h = S.colH(hx, hz); S.set(hx, h + 1, hz, ID.oak_fence); S.set(hx, h + 2, hz, ID.oak_fence); S.set(hx, h + 3, hz, ID.wool_lamp || ID.glowstone); }
        }
      }
    }
    // aldeanos y gólem
    for (let i = 0; i < 6; i++) { const vx = c.x + (r() - 0.5) * 30, vz = c.z + (r() - 0.5) * 30; S.mob('villager', vx, S.colH(vx | 0, vz | 0) + 1, vz); }
    S.mob('iron_golem', c.x + 3.5, cy + 1, c.z + 3.5);
    if (c.style === 'plains') for (let i = 0; i < 3; i++) S.mob('cat', c.x + (r() - 0.5) * 20, cy + 1, c.z + (r() - 0.5) * 20);
  }
});
function villageHouse(S, x, z, M, r, door, n, style, half) {
  const y = S.colH(x, z) + 1; const x0 = x - half, x1 = x + half, z0 = z - half, z1 = z + half, h = 4 + (half > 3 ? 1 : 0);
  for (let xx = x0; xx <= x1; xx++) for (let zz = z0; zz <= z1; zz++) { S.foundation(xx, zz, y, M.base); S.set(xx, y - 1, zz, M.base); }
  S.fillFn(x0, y, z0, x1, y + h, z1, (xx, yy, zz) => {
    const edgeX = xx === x0 || xx === x1, edgeZ = zz === z0 || zz === z1;
    if (edgeX && edgeZ) return M.log; if (edgeX || edgeZ) { if (yy === y + 1 && ((xx === x && edgeZ) || (zz === z && edgeX)) && style !== 'desert') return ID.glass; if (yy === y + 2 && ((xx === x && edgeZ) || (zz === z && edgeX))) return ID.glass; return yy === y ? M.base : M.planks; } return 0;
  });
  // techo a dos aguas
  for (let k = 0; k <= half + 1; k++) for (let zz = z0 - 1; zz <= z1 + 1; zz++) { S.set(x0 - 1 + k, y + h + 1 + k, zz, M.roof); S.set(x1 + 1 - k, y + h + 1 + k, zz, M.roof); }
  for (let k = 0; k <= half; k++) for (let xx = x0 + k; xx <= x1 - k; xx++) { S.set(xx, y + h + 1 + k, z0, M.planks); S.set(xx, y + h + 1 + k, z1, M.planks); if (k > 0) for (let zz = z0 + 1; zz < z1; zz++) S.set(xx, y + h + 1 + k, zz, 0); }
  for (let xx = x0 + 1; xx < x1; xx++) for (let zz = z0 + 1; zz < z1; zz++) { S.set(xx, y + h, zz, 0); S.set(xx, y - 1, zz, M.planks); }
  if (style === 'desert') S.fill(x0, y + h + 1, z0, x1, y + h + 8, z1, 0), S.fill(x0, y + h, z0, x1, y + h, z1, M.roof);
  // puerta
  const dx = x + door[0] * half, dz = z + door[1] * half; S.set(dx, y, dz, 0); S.set(dx, y + 1, dz, 0);
  S.set(dx + door[0], y - 1, dz + door[1], M.path);
  // interior
  S.set(x0 + 1, y, z0 + 1, ID.bed); S.set(x1 - 1, y, z0 + 1, n % 3 === 0 ? ID.crafting_table : n % 3 === 1 ? ID.furnace : ID.smithing_table);
  S.chest(x1 - 1, y, z1 - 1, 'village'); S.set(x0 + 1, y + 2, z1 - 1, ID.torch);
  if (half > 3) { S.set(x0 + 1, y, z1 - 1, ID.bookshelf); S.set(x0 + 2, y, z1 - 1, ID.bookshelf); }
}
function villageFarm(S, x, z, r) {
  const y = S.colH(x, z); for (let dx = -3; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) {
    const edge = Math.abs(dx) === 3 || Math.abs(dz) === 2; if (edge) { S.set(x + dx, y, z + dz, ID.oak_log); S.set(x + dx, y + 1, z + dz, 0); }
    else if (dz === 0) S.set(x + dx, y, z + dz, ID.water); else { S.set(x + dx, y, z + dz, ID.farmland); S.set(x + dx, y + 1, z + dz, ID.wheat, 4 + ((r() * 4) | 0)); }
  }
}
// 2. FORTALEZA (STRONGHOLD) ---------------------------------------
function strongholdSpots(gen) {
  if (gen._sh) return gen._sh; const r = mulberry32(gen.seed ^ 0x5701); const a0 = r() * Math.PI * 2; const out = [];
  for (let i = 0; i < 3; i++) { const a = a0 + i * Math.PI * 2 / 3, d = 640 + r() * 400; out.push({ x: Math.round(Math.cos(a) * d / 16) * 16 + 8, z: Math.round(Math.sin(a) * d / 16) * 16 + 8, seed: (r() * 4e9) >>> 0, radius: 56 }); }
  return (gen._sh = out);
}
defStruct({
  name: 'stronghold', dim: 'overworld', radius: 56, fixed: strongholdSpots,
  build(S, c, r) {
    const y = 60; const bricks = (x, yy, z) => { const h = hash3(c.seed, x, yy, z); return h < 0.15 ? ID.mossy_stone_bricks : h < 0.28 ? ID.cracked_stone_bricks : ID.stone_bricks; };
    // sala del portal
    const px = c.x, pz = c.z;
    S.hollow(px - 6, y, pz - 8, px + 6, y + 8, pz + 8, bricks);
    S.fill(px - 5, y + 1, pz - 7, px + 5, y + 7, pz + 7, 0);
    S.fill(px - 2, y, pz - 2, px + 2, y, pz + 2, ID.lava); S.fill(px - 3, y + 1, pz - 3, px + 3, y + 1, pz + 3, ID.stone_bricks);
    S.fill(px - 3, y + 2, pz - 3, px + 3, y + 2, pz + 3, 0);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const ring = (Math.abs(dx) === 2) !== (Math.abs(dz) === 2); if (ring) S.set(px + dx, y + 2, pz + dz, r() < 0.1 ? ID.end_portal_frame_eye : ID.end_portal_frame, (dz === -2 ? 0 : dz === 2 ? 2 : dx === -2 ? 3 : 1));
      else if (Math.abs(dx) < 2 && Math.abs(dz) < 2) S.set(px + dx, y + 1, pz + dz, ID.lava);
    }
    S.fill(px - 1, y + 2, pz + 5, px + 1, y + 2, pz + 5, ID.stone_bricks); S.spawner(px, y + 2, pz + 5, 'silverfish');
    S.set(px - 5, y + 4, pz, ID.torch); S.set(px + 5, y + 4, pz, ID.torch);
    // pasillos en cruz
    const corridor = (x0, z0, x1, z1) => { S.fillFn(Math.min(x0, x1) - 2, y, Math.min(z0, z1) - 2, Math.max(x0, x1) + 2, y + 4, Math.max(z0, z1) + 2, (x, yy, z) => { const inX = x0 === x1 ? Math.abs(x - x0) < 2 : true, inZ = z0 === z1 ? Math.abs(z - z0) < 2 : true; if (yy > y && yy < y + 4 && inX && inZ) return 0; return bricks(x, yy, z); }); };
    corridor(px, pz - 9, px, pz - 36); corridor(px - 30, pz - 36, px + 30, pz - 36); corridor(px - 30, pz - 36, px - 30, pz + 30); corridor(px + 30, pz - 36, px + 30, pz + 10);
    S.fill(px - 1, y + 1, pz - 9, px + 1, y + 3, pz - 8, 0);
    // biblioteca
    const lx = px - 30, lz = pz + 20; S.hollow(lx - 7, y, lz - 6, lx + 7, y + 7, lz + 6, bricks); S.fill(lx - 6, y + 1, lz - 5, lx + 6, y + 6, lz + 5, 0);
    for (let dx = -6; dx <= 6; dx++) for (let k = 1; k <= 5; k++) { if (dx % 3 !== 0) { S.set(lx + dx, y + k, lz - 5, ID.bookshelf); S.set(lx + dx, y + k, lz + 5, ID.bookshelf); } }
    S.fill(lx - 1, y + 1, lz - 6, lx + 1, y + 3, lz - 6, 0); S.chest(lx, y + 1, lz + 3, 'stronghold_library'); S.set(lx + 4, y + 3, lz, ID.torch);
    // sala con cofre
    const cx2 = px + 30, cz2 = pz + 14; S.hollow(cx2 - 4, y, cz2 - 4, cx2 + 4, y + 5, cz2 + 4, bricks); S.fill(cx2 - 3, y + 1, cz2 - 3, cx2 + 3, y + 4, cz2 + 3, 0); S.fill(cx2 - 1, y + 1, cz2 - 4, cx2 + 1, y + 3, cz2 - 4, 0);
    S.chest(cx2, y + 1, cz2 + 2, 'stronghold'); S.set(cx2 + 2, y + 3, cz2, ID.torch);
    // escalera de caracol hasta la superficie
    const sx = px, sz = pz - 36 - 3; const top = S.colH(sx, sz);
    if (top > y + 6) { S.fillFn(sx - 3, y, sz - 3, sx + 3, top + 1, sz + 3, (x, yy, z) => { const e = Math.abs(x - sx) === 3 || Math.abs(z - sz) === 3; if (e) return yy > top - 1 ? undefined : bricks(x, yy, z); if (x === sx && z === sz) return ID.stone_bricks; const ang = Math.atan2(z - sz, x - sx); const step = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8); return ((yy - y) % 8) === step ? ID.stone_bricks : 0; }); S.fill(sx - 1, y + 1, sz + 3, sx + 1, y + 3, sz + 3, 0); }
  }
});
// 3. CÁMARAS DE DESAFÍO -------------------------------------------
defStruct({
  name: 'trial_chambers', dim: 'overworld', spacing: 34, radius: 34, sep: 8,
  place(gen, x, z) { const c = gen.col(x, z); if (c.h < SEA - 20) return null; return { y: 64 - 20 + 64 - 64 + 0 + 44 }; },
  build(S, c, r) {
    const y = c.y; const T = (x, yy, z) => { const h = hash3(c.seed, x, yy, z); return h < 0.6 ? ID.tuff_bricks : h < 0.8 ? ID.polished_tuff : h < 0.92 ? ID.chiseled_tuff : ID.cut_copper; };
    // sala central
    S.hollow(c.x - 12, y, c.z - 12, c.x + 12, y + 12, c.z + 12, T);
    S.fill(c.x - 11, y + 1, c.z - 11, c.x + 11, y + 11, c.z + 11, 0);
    S.fill(c.x - 11, y, c.z - 11, c.x + 11, y, c.z + 11, ID.polished_tuff);
    for (let dx = -11; dx <= 11; dx += 2) for (let dz = -11; dz <= 11; dz += 2) if ((dx + dz) % 4 === 0) S.set(c.x + dx, y, c.z + dz, ID.oxidized_cut_copper);
    S.fill(c.x - 4, y + 1, c.z - 4, c.x + 4, y + 2, c.z + 4, ID.tuff_bricks); S.fill(c.x - 3, y + 2, c.z - 3, c.x + 3, y + 2, c.z + 3, ID.polished_tuff);
    S.spawner(c.x - 7, y + 1, c.z - 7, 'breeze', true); S.spawner(c.x + 7, y + 1, c.z + 7, 'zombie', true); S.spawner(c.x + 7, y + 1, c.z - 7, 'skeleton', true);
    S.set(c.x, y + 3, c.z, ID.vault); S.set(c.x + 2, y + 3, c.z, ID.vault);
    for (const [dx, dz] of [[-11, 0], [11, 0], [0, -11], [0, 11]]) { S.set(c.x + dx, y + 8, c.z + dz, ID.copper_grate); S.set(c.x + dx * 0.9 | 0, y + 9, c.z + dz * 0.9 | 0, ID.lantern); }
    for (let k = -11; k <= 11; k += 5) { S.set(c.x + k, y + 11, c.z, ID.copper_grate); S.set(c.x + k, y + 10, c.z, ID.lantern); }
    // pasillos con habitaciones
    const corr = (dx, dz) => { for (let i = 12; i < 30; i++) { const x = c.x + dx * i, z = c.z + dz * i; S.fillFn(x - (dz ? 2 : 0), y, z - (dx ? 2 : 0), x + (dz ? 2 : 0), y + 4, z + (dx ? 2 : 0), (xx, yy, zz) => { const side = dz ? Math.abs(xx - x) === 2 : Math.abs(zz - z) === 2; return (yy === y || yy === y + 4 || side) ? T(xx, yy, zz) : 0; }); if (i % 6 === 0) S.set(x, y + 3, z, ID.lantern); } };
    corr(1, 0); corr(-1, 0); corr(0, 1); corr(0, -1);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rx = c.x + dx * 30, rz = c.z + dz * 30; S.hollow(rx - 4, y, rz - 4, rx + 4, y + 6, rz + 4, T); S.fill(rx - 3, y + 1, rz - 3, rx + 3, y + 5, rz + 3, 0); S.fill(rx - (dz ? 1 : 4), y + 1, rz - (dx ? 1 : 4), rx + (dz ? 1 : 4), y + 3, rz + (dx ? 1 : 4), 0); S.chest(rx + 2, y + 1, rz + 2, 'trial'); S.spawner(rx - 2, y + 1, rz - 2, ['zombie', 'spider', 'skeleton', 'breeze'][(r() * 4) | 0], true); S.set(rx, y + 5, rz, ID.lantern); }
  }
});
// 4. CIUDAD ANTIGUA -----------------------------------------------
defStruct({
  name: 'ancient_city', dim: 'overworld', spacing: 30, radius: 52, sep: 6,
  place(gen, x, z) { if (gen.caveBiome(x, 20, z) !== BI.deep_dark) return null; return { y: 13 }; },
  build(S, c, r) {
    const y = c.y; const D = (x, yy, z) => { const h = hash3(c.seed, x, yy, z); return h < 0.45 ? ID.deepslate_bricks : h < 0.75 ? ID.deepslate_tiles : h < 0.9 ? ID.cobbled_deepslate : ID.sculk; };
    // gran caverna
    S.fillFn(c.x - 50, y, c.z - 40, c.x + 50, y + 28, c.z + 40, (x, yy, z) => { const dx = (x - c.x) / 50, dz = (z - c.z) / 40, dy = (yy - y) / 28; const d = dx * dx + dz * dz + dy * dy * 0.9; if (yy === y) return d < 1.05 ? D(x, yy, z) : undefined; return d < 1 ? 0 : undefined; });
    // portal central de pizarra reforzada
    for (let dx = -10; dx <= 10; dx++) for (let k = 0; k < 4; k++) { S.set(c.x + dx, y + k, c.z, D(c.x + dx, y + k, c.z)); }
    S.fillFn(c.x - 9, y + 4, c.z - 1, c.x + 9, y + 20, c.z + 1, (x, yy, z) => { const dx = Math.abs(x - c.x); const inner = dx < 5 && yy < y + 15; if (inner) return 0; if (dx > 8) return undefined; return (dx === 5 || dx === 8 || yy === y + 15 || yy === y + 20) ? ID.reinforced_deepslate : D(x, yy, z); });
    S.fill(c.x - 4, y + 4, c.z, c.x + 4, y + 14, c.z, 0);
    // edificios y calles
    for (let i = 0; i < 14; i++) {
      const bx = c.x + Math.round((r() - 0.5) * 80), bz = c.z + Math.round((r() - 0.5) * 60); if (Math.abs(bx - c.x) < 12 && Math.abs(bz - c.z) < 6) continue;
      const w = 2 + (r() * 3) | 0, d = 2 + (r() * 3) | 0, h = 3 + (r() * 5) | 0;
      S.fillFn(bx - w, y + 1, bz - d, bx + w, y + h, bz + d, (x, yy, z) => (x === bx - w || x === bx + w || z === bz - d || z === bz + d || yy === y + h) ? (r() < 0.12 ? undefined : D(x, yy, z)) : 0);
      S.set(bx, y + 1, bz - d, 0); S.set(bx, y + 2, bz - d, 0);
      if (r() < 0.6) S.chest(bx, y + 1, bz, 'ancient_city'); S.set(bx + w - 1, y + 1, bz + d - 1, ID.soul_lantern);
      if (r() < 0.5) S.set(bx - w + 1, y + 1, bz + d - 1, ID.sculk_sensor);
    }
    for (let i = 0; i < 40; i++) { const x = c.x + Math.round((r() - 0.5) * 90), z = c.z + Math.round((r() - 0.5) * 70); if (S.get(x, y + 1, z) === 0) { const t = r(); S.set(x, y + 1, z, t < 0.35 ? ID.sculk_sensor : t < 0.6 ? ID.soul_lantern : t < 0.7 ? ID.candle || ID.soul_lantern : ID.sculk); } }
    for (let x = c.x - 40; x <= c.x + 40; x += 1) { S.set(x, y, c.z + 8, ID.deepslate_tiles); S.set(x, y, c.z - 8, ID.deepslate_tiles); }
  }
});
// 5. MANSIÓN DEL BOSQUE -------------------------------------------
defStruct({
  name: 'mansion', dim: 'overworld', spacing: 40, radius: 26, sep: 10,
  place(gen, x, z) { const c = gen.col(x, z); if (c.biome !== BI.dark_forest || !flatEnough(gen, x, z, 14, 10)) return null; return {}; },
  build(S, c, r) {
    const y = S.colH(c.x, c.z) + 1; const W = 18, D = 14;
    const x0 = c.x - W, x1 = c.x + W, z0 = c.z - D, z1 = c.z + D;
    S.fill(x0 - 1, y + 1, z0 - 1, x1 + 1, y + 24, z1 + 1, 0);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { S.foundation(x, z, y, ID.cobblestone); S.set(x, y - 1, z, ID.cobblestone); }
    for (let f = 0; f < 3; f++) {
      const fy = y + f * 6;
      S.fillFn(x0, fy, z0, x1, fy + 5, z1, (x, yy, z) => {
        const ex = x === x0 || x === x1, ez = z === z0 || z === z1;
        if (yy === fy) return f === 0 ? ID.cobblestone : ID.dark_oak_planks;
        if (ex && ez) return ID.dark_oak_log;
        if (ex || ez) { if ((yy === fy + 2 || yy === fy + 3) && ((ex ? z : x) % 4 === 0)) return ID.glass; return f === 0 ? ID.cobblestone : (yy === fy + 5 ? ID.dark_oak_log : ID.dark_oak_planks); }
        if (yy === fy + 1 && hash3(c.seed, x, yy, z) < 0.04) return ID.red_wool;
        if (x === c.x && yy < fy + 5 && Math.abs(z - c.z) > 2) return ID.birch_planks;
        if (z === c.z && yy < fy + 5 && Math.abs(x - c.x) > 2 && Math.abs(x - c.x) % 9 !== 0) return ID.birch_planks;
        return 0;
      });
      for (let k = 0; k < 4; k++) { const rx = c.x + (k % 2 ? 9 : -9), rz = c.z + (k < 2 ? 7 : -7); S.set(rx, fy + 4, rz, ID.lantern); if (r() < 0.5) S.chest(rx + 2, fy + 1, rz, 'mansion'); if (r() < 0.5) S.set(rx - 2, fy + 1, rz, ID.bookshelf); S.mob(r() < 0.6 ? 'vindicator' : 'evoker', rx, fy + 1, rz - 2); }
      S.fill(c.x - 1, fy + 1, z0, c.x + 1, fy + 3, z0, f === 0 ? 0 : ID.dark_oak_planks);
      if (f > 0) S.fill(c.x - 1, fy, c.z - 1, c.x + 1, fy, c.z + 1, 0);
      for (let s = 0; s < 6; s++) S.set(c.x - 1 + (s % 3), fy + 1 + (s >> 1), c.z + 2, ID.dark_oak_planks);
    }
    for (let k = 0; k <= 6; k++) S.fill(x0 - 1 + k, y + 18 + k, z0 - 1 + k, x1 + 1 - k, y + 18 + k, z1 + 1 - k, ID.dark_oak_planks);
    S.fill(x0 + 1, y + 18, z0 + 1, x1 - 1, y + 18, z1 - 1, ID.dark_oak_planks);
  }
});
// 6. MONUMENTO OCEÁNICO -------------------------------------------
defStruct({
  name: 'monument', dim: 'overworld', spacing: 32, radius: 30, sep: 6,
  place(gen, x, z) { const c = gen.col(x, z); if (c.biome !== BI.deep_ocean) return null; return { water: true }; },
  build(S, c, r) {
    const y = SEA - 23; const W = 27; const P = (x, yy, z) => { const h = hash3(c.seed, x, yy, z); return h < 0.5 ? ID.prismarine_bricks : h < 0.8 ? ID.prismarine : ID.dark_prismarine; };
    S.fillFn(c.x - W, y - 6, c.z - W, c.x + W, y, c.z + W, (x, yy, z) => yy === y ? P(x, yy, z) : (S.get(x, yy, z) === ID.water || S.get(x, yy, z) === 0 ? P(x, yy, z) : undefined));
    S.fillFn(c.x - W + 1, y + 1, c.z - W + 1, c.x + W - 1, y + 12, c.z + W - 1, (x, yy, z) => {
      const ax = Math.abs(x - c.x), az = Math.abs(z - c.z); const m = Math.max(ax, az); const lvl = yy - y;
      if (m > W - 2 - Math.max(0, lvl - 6) * 2) return ID.water;
      const wall = m === W - 2 - Math.max(0, lvl - 6) * 2; if (wall) return (lvl % 4 === 2 && (x + z) % 5 === 0) ? ID.sea_lantern : P(x, yy, z);
      if (lvl === 6 && m < W - 4) return ID.dark_prismarine;
      if (m < 6 && lvl < 10) { if (m < 2 && lvl >= 2 && lvl < 4) return ID.gold_block; return (m === 5 || lvl === 9) ? P(x, yy, z) : ID.water; }
      if ((ax % 8 === 0 && az % 8 === 0) && lvl < 6) return ID.dark_prismarine;
      return ID.water;
    });
    S.fill(c.x - 2, y + 1, c.z - W + 1, c.x + 2, y + 4, c.z - W + 3, ID.water);
    for (let k = 0; k < 4; k++) S.set(c.x + (k % 2 ? 8 : -8), y + 13, c.z + (k < 2 ? 8 : -8), ID.sea_lantern);
    for (let i = 0; i < 6; i++) S.mob('guardian', c.x + (r() - 0.5) * 40, y + 3 + r() * 8, c.z + (r() - 0.5) * 40);
    S.mob('elder_guardian', c.x + 0.5, y + 7, c.z + 0.5);
    S.set(c.x + 3, y + 7, c.z + 3, ID.wet_sponge); S.set(c.x - 3, y + 7, c.z - 3, ID.sponge);
  }
});
// 7. PIRÁMIDE DEL DESIERTO ----------------------------------------
defStruct({
  name: 'desert_pyramid', dim: 'overworld', spacing: 30, radius: 13, sep: 6,
  place(gen, x, z) { const c = gen.col(x, z); if (c.biome !== BI.desert) return null; return {}; },
  build(S, c, r) {
    const y = S.colH(c.x, c.z); const R = 10;
    for (let x = c.x - R; x <= c.x + R; x++) for (let z = c.z - R; z <= c.z + R; z++) S.foundation(x, z, y, ID.sandstone);
    for (let k = 0; k <= R; k++) S.fillFn(c.x - R + k, y + k, c.z - R + k, c.x + R - k, y + k, c.z + R - k, (x, yy, z) => (Math.abs(x - c.x) === R - k || Math.abs(z - c.z) === R - k || k === 0 || k === R) ? (k % 4 === 2 ? ID.orange_terracotta : ID.sandstone) : 0);
    S.fill(c.x - R + 1, y + 1, c.z - R + 1, c.x + R - 1, y + 6, c.z + R - 1, 0);
    S.fill(c.x - R + 1, y + 1, c.z - R + 1, c.x + R - 1, y + 1, c.z + R - 1, ID.sandstone);
    for (const [tx, tz] of [[c.x - R, c.z - R], [c.x + R - 4, c.z - R]]) S.fill(tx, y, tz, tx + 4, y + 10, tz + 4, ID.cut_sandstone);
    S.fill(c.x - 1, y + 1, c.z - R, c.x + 1, y + 3, c.z - R + 1, 0);
    S.set(c.x, y + 1, c.z, ID.blue_terracotta); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) S.set(c.x + dx, y + 1, c.z + dz, ID.orange_terracotta);
    S.fill(c.x - 4, y - 12, c.z - 4, c.x + 4, y - 1, c.z + 4, ID.sandstone); S.fill(c.x - 3, y - 11, c.z - 3, c.x + 3, y - 2, c.z + 3, 0);
    S.fill(c.x - 1, y - 2, c.z - 1, c.x + 1, y, c.z + 1, 0); S.set(c.x, y + 1, c.z, 0);
    S.chest(c.x, y - 11, c.z - 3, 'desert_pyramid'); S.chest(c.x, y - 11, c.z + 3, 'desert_pyramid'); S.chest(c.x - 3, y - 11, c.z, 'desert_pyramid'); S.chest(c.x + 3, y - 11, c.z, 'desert_pyramid');
    S.fill(c.x - 1, y - 13, c.z - 1, c.x + 1, y - 13, c.z + 1, ID.tnt);
    S.set(c.x, y - 11, c.z, ID.stone_slab);
  }
});
// 8. PUESTO DE SAQUEADORES ----------------------------------------
defStruct({
  name: 'pillager_outpost', dim: 'overworld', spacing: 30, radius: 10, sep: 6, chance: 0.6,
  place(gen, x, z) { const c = gen.col(x, z); const ok = [BI.plains, BI.savanna, BI.taiga, BI.desert, BI.snowy_plains, BI.sunflower_plains]; if (!ok.includes(c.biome) || c.h < SEA + 1) return null; return {}; },
  build(S, c, r) {
    const y = S.colH(c.x, c.z) + 1; const R = 4;
    for (let x = c.x - R; x <= c.x + R; x++) for (let z = c.z - R; z <= c.z + R; z++) S.foundation(x, z, y, ID.cobblestone);
    for (let f = 0; f < 4; f++) { const fy = y + f * 5; S.fillFn(c.x - R, fy, c.z - R, c.x + R, fy + 4, c.z + R, (x, yy, z) => { const ex = Math.abs(x - c.x) === R, ez = Math.abs(z - c.z) === R; if (yy === fy) return f === 0 ? ID.cobblestone : ID.birch_planks; if (ex && ez) return ID.dark_oak_log; if (ex || ez) return (yy === fy + 2 && (x === c.x || z === c.z)) ? 0 : ID.birch_planks; return 0; }); S.set(c.x - R + 1, fy + 3, c.z, ID.torch); }
    S.fill(c.x - R - 1, y + 20, c.z - R - 1, c.x + R + 1, y + 20, c.z + R + 1, ID.dark_oak_planks); S.fill(c.x - R, y + 21, c.z - R, c.x + R, y + 21, c.z + R, 0);
    for (const [dx, dz] of [[-R - 1, -R - 1], [R + 1, -R - 1], [-R - 1, R + 1], [R + 1, R + 1]]) S.fill(c.x + dx, y + 21, c.z + dz, c.x + dx, y + 22, c.z + dz, ID.dark_oak_fence);
    S.chest(c.x, y + 21, c.z, 'outpost'); S.fill(c.x, y, c.z - R, c.x, y + 1, c.z - R, 0);
    for (let k = 1; k < 20; k++) S.set(c.x + R - 1, y + k, c.z + R - 1, ID.ladder);
    for (let k = 0; k < 20; k += 5) S.fill(c.x + R - 1, y + k, c.z + R - 1, c.x + R - 1, y + k, c.z + R - 1, 0);
    for (let i = 0; i < 5; i++) S.mob('pillager', c.x + (r() - 0.5) * 16, y + (i === 0 ? 21 : 0), c.z + (r() - 0.5) * 16);
  }
});
// 9. POZOS DE MINA ------------------------------------------------
defStruct({
  name: 'mineshaft', dim: 'overworld', spacing: 10, radius: 50, sep: 2, chance: 0.5,
  place(gen, x, z) { return { y: 40 + ((hash2(gen.seed, x, z) * 50) | 0) }; },
  build(S, c, r) {
    const segs = []; const grow = (x, y, z, dx, dz, depth) => { if (depth > 5) return; const len = 12 + (r() * 24) | 0; segs.push([x, y, z, dx, dz, len]); const ex = x + dx * len, ez = z + dz * len; if (Math.abs(ex - c.x) > 44 || Math.abs(ez - c.z) > 44) return; const n = 1 + (r() * 2.2) | 0; for (let i = 0; i < n; i++) { const t = r() < 0.5 ? [dz, dx] : [-dz, -dx]; grow(ex, y + (r() < 0.2 ? (r() < 0.5 ? 4 : -4) : 0), ez, ...(r() < 0.6 ? t : [dx, dz]), depth + 1); } };
    S.fill(c.x - 4, c.y, c.z - 4, c.x + 4, c.y + 4, c.z + 4, 0); S.fill(c.x - 4, c.y - 1, c.z - 4, c.x + 4, c.y - 1, c.z + 4, ID.dirt);
    grow(c.x, c.y, c.z, 1, 0, 0); grow(c.x, c.y, c.z, -1, 0, 0); grow(c.x, c.y, c.z, 0, 1, 0);
    for (const [x, y, z, dx, dz, len] of segs) {
      for (let i = 0; i <= len; i++) {
        const px = x + dx * i, pz = z + dz * i;
        for (let w = -1; w <= 1; w++) for (let h = 0; h < 3; h++) { const qx = px + (dz ? w : 0), qz = pz + (dx ? w : 0); const b = S.get(qx, y + h, qz); if (b !== ID.water && b !== ID.lava) S.set(qx, y + h, qz, (h === 0 && w === 0 && hash3(c.seed, qx, y, qz) < 0.7) ? ID.rail : (hash3(c.seed + 1, qx, y + h, qz) < 0.025 ? ID.cobweb : 0)); }
        for (let w = -1; w <= 1; w++) { const qx = px + (dz ? w : 0), qz = pz + (dx ? w : 0); const b = S.get(qx, y - 1, qz); if (b === 0 || b === ID.water || b === ID.lava) S.set(qx, y - 1, qz, ID.oak_planks); }
        if (i % 4 === 0) { const a = [px + (dz ? -1 : 0), pz + (dx ? -1 : 0)], b = [px + (dz ? 1 : 0), pz + (dx ? 1 : 0)]; S.set(a[0], y, a[1], ID.oak_fence); S.set(a[0], y + 1, a[1], ID.oak_fence); S.set(b[0], y, b[1], ID.oak_fence); S.set(b[0], y + 1, b[1], ID.oak_fence); for (let w = -1; w <= 1; w++) S.set(px + (dz ? w : 0), y + 2, pz + (dx ? w : 0), ID.oak_planks); if (i % 12 === 0) S.set(px, y + 1, pz, 0), S.set(a[0], y + 2, a[1], ID.oak_planks); if (i % 8 === 4 && hash3(c.seed, px, y, pz) < 0.2) S.set(px + (dz ? 1 : 0), y + 1, pz + (dx ? 1 : 0), ID.torch); }
        if (i === (len >> 1) && hash3(c.seed, px, y, pz) < 0.35) S.chest(px + (dz ? 1 : 0), y, pz + (dx ? 1 : 0), 'mineshaft');
        if (i === (len >> 2) && hash3(c.seed + 9, px, y, pz) < 0.12) { S.spawner(px, y, pz, 'cave_spider'); for (let k = 0; k < 12; k++) S.setIfAir(px + ((r() * 5) | 0) - 2, y + ((r() * 3) | 0), pz + ((r() * 5) | 0) - 2, ID.cobweb); }
      }
    }
  }
});
// 10. BARCOS NAUFRAGADOS -------------------------------------------
defStruct({
  name: 'shipwreck', dim: 'overworld', spacing: 16, radius: 14, sep: 4, chance: 0.6,
  place(gen, x, z) { const c = gen.col(x, z); if (![BI.ocean, BI.deep_ocean, BI.warm_ocean, BI.beach, BI.frozen_ocean].includes(c.biome)) return null; return { water: true, rot: hash2(gen.seed, x, z) < 0.5 }; },
  build(S, c, r) {
    const y = S.colH(c.x, c.z); const L = 11; const P = ID.spruce_planks, P2 = ID.oak_planks, LOG = ID.spruce_log;
    const put = (a, h, b, id) => { if (c.rot) S.set(c.x + b, y + h, c.z + a, id); else S.set(c.x + a, y + h, c.z + b, id); };
    const broken = (a, h, b) => hash3(c.seed, a, h, b) < 0.18;
    for (let a = -L; a <= L; a++) {
      const taper = Math.max(0, Math.abs(a) - (L - 4)); const w = 3 - taper;
      for (let h = 0; h <= 4; h++) { const ww = h === 0 ? w - 1 : w; for (let b = -ww; b <= ww; b++) { const shell = h === 0 || Math.abs(b) === ww || (h === 2 && Math.abs(a) < L - 2); if (shell) { if (!broken(a, h, b)) put(a, h, b, h === 2 ? P2 : P); } else put(a, h, b, 0); } }
    }
    for (let h = 3; h < 12; h++) if (!broken(0, h, 99)) put(0, h, 0, LOG); for (let b = -3; b <= 3; b++) put(0, 9, b, LOG);
    put(-L + 3, 1, 0, ID.chest); const cx = c.rot ? c.x : c.x - L + 3, cz = c.rot ? c.z - L + 3 : c.z; S.chest(cx, y + 1, cz, 'shipwreck');
    const cx2 = c.rot ? c.x : c.x + L - 3, cz2 = c.rot ? c.z + L - 3 : c.z; S.chest(cx2, y + 1, cz2, 'shipwreck_treasure');
  }
});
// 11. TEMPLO DE LA JUNGLA -----------------------------------------
defStruct({
  name: 'jungle_temple', dim: 'overworld', spacing: 30, radius: 10, sep: 6,
  place(gen, x, z) { const c = gen.col(x, z); if (c.biome !== BI.jungle) return null; return {}; },
  build(S, c, r) {
    const y = S.colH(c.x, c.z); const M = (x, yy, z) => hash3(c.seed, x, yy, z) < 0.45 ? ID.mossy_cobblestone : ID.cobblestone;
    for (let x = c.x - 6; x <= c.x + 6; x++) for (let z = c.z - 7; z <= c.z + 7; z++) S.foundation(x, z, y, ID.cobblestone);
    S.hollow(c.x - 6, y - 4, c.z - 7, c.x + 6, y + 4, c.z + 7, M); S.fill(c.x - 5, y - 3, c.z - 6, c.x + 5, y + 3, c.z + 6, 0);
    S.fill(c.x - 6, y, c.z - 7, c.x + 6, y, c.z + 7, ID.cobblestone); S.fill(c.x - 5, y + 1, c.z - 6, c.x + 5, y + 3, c.z + 6, 0);
    S.hollow(c.x - 4, y + 4, c.z - 5, c.x + 4, y + 8, c.z + 5, M); S.fill(c.x - 3, y + 5, c.z - 4, c.x + 3, y + 7, c.z + 4, 0);
    for (let x = c.x - 6; x <= c.x + 6; x += 2) { S.set(x, y + 4, c.z - 7, ID.chiseled_stone_bricks); S.set(x, y + 4, c.z + 7, ID.chiseled_stone_bricks); }
    S.fill(c.x - 1, y + 1, c.z - 7, c.x + 1, y + 3, c.z - 7, 0);
    S.fill(c.x - 1, y - 3, c.z, c.x + 1, y, c.z + 1, 0); S.chest(c.x + 4, y - 3, c.z + 5, 'jungle_temple'); S.chest(c.x - 4, y + 1, c.z + 5, 'jungle_temple');
    for (let i = 0; i < 30; i++) { const x = c.x + ((r() * 15) | 0) - 7, z = c.z + ((r() * 17) | 0) - 8; for (let k = 0; k < 4; k++) S.setIfAir(x, y + 6 - k, z, ID.vine); }
  }
});
// extra: mazmorras y portales en ruinas ---------------------------
defStruct({
  name: 'dungeon', dim: 'overworld', spacing: 6, radius: 5, sep: 1, chance: 0.4,
  place(gen, x, z) { const c = gen.col(x, z); return { y: 20 + ((hash2(gen.seed, x, z) * (c.h - 40)) | 0) }; },
  build(S, c, r) { S.hollow(c.x - 4, c.y - 1, c.z - 4, c.x + 4, c.y + 4, c.z + 4, (x, yy, z) => yy === c.y - 1 && hash3(c.seed, x, yy, z) < 0.6 ? ID.mossy_cobblestone : ID.cobblestone); S.spawner(c.x, c.y, c.z, ['zombie', 'skeleton', 'spider', 'zombie'][(r() * 4) | 0]); S.chest(c.x + 3, c.y, c.z, 'dungeon'); if (r() < 0.5) S.chest(c.x - 3, c.y, c.z, 'dungeon'); }
});
defStruct({
  name: 'ruined_portal', dim: 'overworld', spacing: 24, radius: 6, sep: 4,
  place(gen, x, z) { const c = gen.col(x, z); if (c.h < SEA) return null; return {}; },
  build(S, c, r) {
    const y = S.colH(c.x, c.z); for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (r() < 0.7) S.set(c.x + dx, y, c.z + dz, r() < 0.5 ? ID.netherrack : ID.stone_bricks);
    for (let dx = -2; dx <= 1; dx++) for (let dy = 0; dy <= 4; dy++) { const edge = dx === -2 || dx === 1 || dy === 0 || dy === 4; if (edge && r() < 0.75) S.set(c.x + dx, y + dy, c.z, r() < 0.15 ? ID.crying_obsidian : ID.obsidian); }
    S.chest(c.x + 2, y + 1, c.z + 1, 'ruined_portal'); S.set(c.x - 3, y + 1, c.z - 2, ID.magma_block);
  }
});
// 12. FORTALEZA DEL NETHER ----------------------------------------
defStruct({
  name: 'nether_fortress', dim: 'nether', spacing: 16, radius: 64, sep: 4, chance: 0.55,
  place(gen, x, z) { return { y: 60 + ((hash2(gen.seed, x, z) * 10) | 0) }; },
  build(S, c, r) {
    const y = c.y; const NB = ID.nether_bricks;
    const bridge = (dx, dz, len) => {
      for (let i = -len; i <= len; i++) {
        const px = c.x + dx * i, pz = c.z + dz * i;
        for (let w = -2; w <= 2; w++) { const qx = px + (dz ? w : 0), qz = pz + (dx ? w : 0); S.set(qx, y, qz, NB); S.set(qx, y - 1, qz, NB); for (let h = 1; h <= 4; h++) S.set(qx, y + h, qz, Math.abs(w) === 2 && h === 1 ? ID.nether_brick_fence : (Math.abs(w) === 2 && i % 6 === 0 && h <= 3) ? NB : 0); }
        if (i % 12 === 0) for (let w = -2; w <= 2; w++) for (let yy = y - 2; yy > 10; yy--) { const qx = px + (dz ? w : 0), qz = pz + (dx ? w : 0); const b = S.get(qx, yy, qz); if (b === -1) break; if (b !== 0 && b !== ID.lava) break; S.set(qx, yy, qz, NB); }
      }
    };
    bridge(1, 0, 60); bridge(0, 1, 60);
    // sala central con generadores de blaze
    S.hollow(c.x - 6, y, c.z - 6, c.x + 6, y + 7, c.z + 6, NB); S.fill(c.x - 5, y + 1, c.z - 5, c.x + 5, y + 6, c.z + 5, 0);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) S.fill(c.x + dx * 6 - (dz ? 1 : 0), y + 1, c.z + dz * 6 - (dx ? 1 : 0), c.x + dx * 6 + (dz ? 1 : 0), y + 3, c.z + dz * 6 + (dx ? 1 : 0), 0);
    S.spawner(c.x, y + 1, c.z, 'blaze'); S.chest(c.x + 4, y + 1, c.z + 4, 'fortress'); S.chest(c.x - 4, y + 1, c.z - 4, 'fortress');
    // torres
    for (const [tx, tz] of [[c.x + 36, c.z], [c.x - 36, c.z], [c.x, c.z + 36], [c.x, c.z - 36]]) { S.hollow(tx - 4, y, tz - 4, tx + 4, y + 10, tz + 4, NB); S.fill(tx - 3, y + 1, tz - 3, tx + 3, y + 9, tz + 3, 0); S.fill(tx - 4, y + 1, tz - 1, tx + 4, y + 3, tz + 1, 0); S.fill(tx - 1, y + 1, tz - 4, tx + 1, y + 3, tz + 4, 0); if (r() < 0.6) S.spawner(tx, y + 1, tz, 'blaze'); S.chest(tx + 2, y + 1, tz + 2, 'fortress'); S.mob('wither_skeleton', tx - 2, y + 1, tz - 2); }
    for (let i = 0; i < 3; i++) S.mob('blaze', c.x + (r() - 0.5) * 10, y + 2, c.z + (r() - 0.5) * 10);
  }
});
// 13. BASTIÓN EN RUINAS -------------------------------------------
defStruct({
  name: 'bastion', dim: 'nether', spacing: 18, radius: 26, sep: 5, chance: 0.55,
  place(gen, x, z) { const b = gen.netherBiome(x, z); if (b === BI.basalt_deltas) return null; return { y: 34 }; },
  build(S, c, r) {
    const y = c.y; const BS = (x, yy, z) => { const h = hash3(c.seed, x, yy, z); return h < 0.55 ? ID.polished_blackstone_bricks : h < 0.85 ? ID.blackstone : ID.gilded_blackstone; };
    S.fillFn(c.x - 22, y - 4, c.z - 22, c.x + 22, y + 26, c.z + 22, (x, yy, z) => { const ax = Math.abs(x - c.x), az = Math.abs(z - c.z); const m = Math.max(ax, az); if (yy < y) return BS(x, yy, z); if (m === 22 || m === 21) return (yy < y + 22 && !(yy > y + 2 && yy < y + 6 && (ax < 2 || az < 2))) ? BS(x, yy, z) : (yy === y + 22 ? BS(x, yy, z) : 0); if (m < 8) { if (m === 7 && yy < y + 16 && !(yy < y + 4 && (ax < 2 || az < 2))) return BS(x, yy, z); if (yy === y + 8 || yy === y + 16) return BS(x, yy, z); return 0; } if (yy === y || yy === y + 10) return BS(x, yy, z); return 0; });
    for (let k = 0; k < 3; k++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) S.set(c.x + dx, y + 9 + k * 0, c.z + dz, ID.gold_block);
    S.fill(c.x - 1, y + 9, c.z - 1, c.x + 1, y + 9, c.z + 1, ID.gold_block);
    for (const [dx, dz] of [[4, 4], [-4, -4], [4, -4], [-4, 4]]) S.chest(c.x + dx, y + 9, c.z + dz, 'bastion');
    S.chest(c.x + 14, y + 1, c.z, 'bastion'); S.chest(c.x - 14, y + 11, c.z, 'bastion');
    for (let i = 0; i < 5; i++) S.set(c.x + ((r() * 30) | 0) - 15, y + 1, c.z + ((r() * 30) | 0) - 15, ID.gold_block);
    for (let i = 0; i < 6; i++) S.mob(i < 2 ? 'piglin_brute' : 'piglin', c.x + (r() - 0.5) * 30, y + 1, c.z + (r() - 0.5) * 30);
    S.fill(c.x - 3, y + 1, c.z - 3, c.x + 3, y + 1, c.z + 3, ID.lava); S.fill(c.x - 2, y + 1, c.z - 2, c.x + 2, y + 1, c.z + 2, ID.blackstone);
  }
});
// 14. CIUDAD DEL END + 15. BARCO DEL END ---------------------------
defStruct({
  name: 'end_city', dim: 'end', spacing: 20, radius: 40, sep: 5, chance: 0.7,
  place(gen, x, z) { if (Math.hypot(x, z) < 1000) return null; const n = gen.nC.fbm2(x * 0.006, z * 0.006, 4); if (n < 0.28) return null; const t = (n - 0.18) * 3; const y = Math.floor(58 + t * 22 + gen.nD.n2(x * 0.05, z * 0.05) * 3); return { y: y + 1, ship: hash2(gen.seed, x, z) < 0.6 }; },
  build(S, c, r) {
    const P = ID.purpur_block, PP = ID.purpur_pillar, EB = ID.end_stone_bricks;
    let y = c.y; let size = 6;
    for (let f = 0; f < 5; f++) {
      const h = 6 + (f === 0 ? 2 : 0);
      S.fillFn(c.x - size, y, c.z - size, c.x + size, y + h, c.z + size, (x, yy, z) => { const ax = Math.abs(x - c.x), az = Math.abs(z - c.z); const ex = ax === size, ez = az === size; if (yy === y || yy === y + h) return (ex || ez) ? EB : P; if (ex && ez) return PP; if (ex || ez) return (yy === y + 3 && (ax < 2 || az < 2)) ? ID.glass : P; return 0; });
      S.set(c.x + size - 1, y + h - 1, c.z + size - 1, ID.end_rod); S.set(c.x - size + 1, y + h - 1, c.z - size + 1, ID.end_rod);
      if (f > 0) S.fill(c.x - 1, y, c.z - 1, c.x + 1, y, c.z + 1, 0);
      for (let s = 0; s < h; s++) S.set(c.x - 1 + ((s % 4) < 2 ? 0 : 2), y + 1 + s, c.z + ((s % 2) ? 1 : -1), P);
      if (f % 2 === 1) S.chest(c.x + size - 2, y + 1, c.z, 'end_city');
      if (f === 2 || f === 4) S.mob('shulker', c.x - size + 1.5, y + 1, c.z + 0.5);
      y += h; size = Math.max(3, size - 1);
    }
    for (let k = 0; k < 4; k++) S.set(c.x, y + 1 + k, c.z, ID.end_rod);
    if (c.ship) {
      const sx = c.x + 26, sy = c.y + 14, sz = c.z; const L = 12;
      for (let a = -L; a <= L; a++) { const t = Math.max(0, Math.abs(a) - (L - 5)); const w = 3 - Math.min(2, t >> 1); for (let h = 0; h <= 4; h++) { const ww = h === 0 ? w - 1 : w; for (let b = -ww; b <= ww; b++) { const shell = h === 0 || Math.abs(b) === ww; S.set(sx + a, sy + h, sz + b, shell ? (h === 4 ? EB : P) : 0); } } }
      for (let h = 4; h < 14; h++) S.set(sx, sy + h, sz, PP); for (let b = -4; b <= 4; b++) S.set(sx, sy + 11, sz + b, P); S.set(sx + 2, sy + 12, sz, ID.end_rod);
      S.chest(sx - L + 4, sy + 1, sz, 'end_ship'); S.chest(sx - L + 4, sy + 1, sz + 1, 'end_city'); S.set(sx + L - 1, sy + 3, sz, ID.dragon_egg ? ID.purpur_pillar : 0);
      S.mob('shulker', sx + 4, sy + 1, sz);
    }
  }
});

// ================================================================ BOTÍN
const LOOT = {
  village: [['bread', 1, 4, 5], ['apple', 1, 3, 4], ['iron_ingot', 1, 3, 3], ['wheat', 2, 6, 4], ['emerald', 1, 2, 2], ['oak_sapling', 1, 3, 2], ['iron_pickaxe', 1, 1, 1], ['leather_chestplate', 1, 1, 1], ['torch', 2, 8, 3]],
  stronghold: [['ender_pearl', 1, 2, 3], ['iron_ingot', 1, 5, 4], ['gold_ingot', 1, 3, 3], ['diamond', 1, 3, 2], ['bread', 1, 3, 3], ['iron_sword', 1, 1, 1], ['iron_chestplate', 1, 1, 1], ['apple', 1, 3, 3]],
  stronghold_library: [['paper', 2, 7, 5], ['ender_pearl', 1, 1, 1], ['diamond', 1, 1, 1], ['emerald', 1, 1, 1]],
  trial: [['ominous_key', 1, 1, 3], ['diamond', 1, 2, 2], ['golden_apple', 1, 1, 2], ['emerald', 2, 5, 3], ['arrow', 4, 12, 3], ['iron_ingot', 2, 5, 3], ['bread', 2, 4, 3]],
  vault: [['diamond', 1, 3, 3], ['emerald', 3, 8, 3], ['golden_apple', 1, 2, 2], ['diamond_axe', 1, 1, 1], ['shield', 1, 1, 2], ['totem', 1, 1, 1], ['iron_chestplate', 1, 1, 2]],
  ancient_city: [['echo_shard', 1, 3, 4], ['diamond', 1, 3, 3], ['golden_apple', 1, 2, 3], ['diamond_leggings', 1, 1, 1], ['diamond_hoe', 1, 1, 2], ['coal', 6, 15, 4], ['bone', 1, 15, 4], ['ender_pearl', 1, 3, 2], ['netherite_upgrade', 1, 1, 1]],
  mansion: [['diamond_chestplate', 1, 1, 1], ['diamond_hoe', 1, 1, 1], ['iron_ingot', 1, 5, 4], ['gold_ingot', 1, 4, 3], ['golden_apple', 1, 1, 2], ['totem', 1, 1, 1], ['bread', 1, 4, 4], ['redstone', 1, 4, 3]],
  desert_pyramid: [['bone', 4, 8, 5], ['rotten_flesh', 3, 7, 5], ['gold_ingot', 2, 7, 4], ['iron_ingot', 1, 5, 4], ['emerald', 1, 3, 3], ['diamond', 1, 3, 2], ['golden_apple', 1, 1, 2], ['saddle', 1, 1, 2], ['gunpowder', 1, 8, 4]],
  outpost: [['arrow', 2, 7, 3], ['wheat', 3, 5, 3], ['iron_ingot', 1, 3, 2], ['bow', 1, 1, 2], ['dark_oak_log', 2, 3, 2], ['emerald', 1, 2, 1]],
  mineshaft: [['rail', 4, 8, 4], ['torch', 1, 16, 4], ['iron_ingot', 1, 5, 4], ['gold_ingot', 1, 3, 3], ['redstone', 4, 9, 3], ['lapis_lazuli', 4, 9, 3], ['diamond', 1, 2, 1], ['coal', 3, 8, 4], ['bread', 1, 3, 3]],
  shipwreck: [['paper', 1, 10, 4], ['coal', 2, 8, 3], ['wheat', 4, 10, 3], ['rotten_flesh', 2, 10, 3], ['leather_helmet', 1, 1, 1], ['bread', 1, 3, 2]],
  shipwreck_treasure: [['iron_ingot', 3, 8, 4], ['gold_ingot', 1, 5, 3], ['emerald', 1, 5, 3], ['diamond', 1, 1, 1], ['gold_nugget', 1, 10, 3], ['heart_of_the_sea', 1, 1, 2], ['lapis_lazuli', 1, 10, 3]],
  jungle_temple: [['bone', 4, 8, 4], ['gold_ingot', 2, 7, 3], ['iron_ingot', 1, 5, 3], ['emerald', 1, 3, 2], ['diamond', 1, 3, 2], ['saddle', 1, 1, 1], ['rotten_flesh', 3, 7, 3]],
  dungeon: [['bread', 1, 2, 4], ['saddle', 1, 1, 2], ['iron_ingot', 1, 4, 3], ['gold_ingot', 1, 4, 2], ['string', 1, 4, 3], ['gunpowder', 1, 4, 3], ['golden_apple', 1, 1, 1], ['bucket', 1, 1, 2], ['redstone', 1, 4, 2]],
  ruined_portal: [['obsidian', 1, 3, 4], ['flint_and_steel', 1, 1, 3], ['gold_nugget', 4, 18, 3], ['golden_apple', 1, 1, 1], ['golden_sword', 1, 1, 2], ['golden_helmet', 1, 1, 2], ['gold_ingot', 2, 6, 2], ['flint', 1, 4, 3]],
  fortress: [['gold_ingot', 1, 3, 4], ['iron_ingot', 1, 5, 3], ['diamond', 1, 3, 2], ['golden_sword', 1, 1, 2], ['golden_chestplate', 1, 1, 2], ['flint_and_steel', 1, 1, 2], ['obsidian', 2, 4, 2], ['saddle', 1, 1, 2]],
  bastion: [['netherite_scrap', 1, 1, 2], ['ancient_debris', 1, 2, 2], ['gold_block', 1, 3, 2], ['gold_ingot', 4, 9, 4], ['diamond', 1, 3, 2], ['netherite_upgrade', 1, 1, 2], ['diamond_pickaxe', 1, 1, 1], ['golden_apple', 1, 2, 2], ['crying_obsidian', 2, 6, 2], ['iron_ingot', 3, 8, 3]],
  end_city: [['diamond', 2, 7, 4], ['iron_ingot', 4, 8, 4], ['gold_ingot', 2, 7, 4], ['emerald', 2, 6, 2], ['diamond_sword', 1, 1, 2], ['diamond_chestplate', 1, 1, 2], ['diamond_helmet', 1, 1, 2], ['iron_pickaxe', 1, 1, 2]],
  end_ship: [['elytra', 1, 1, 100], ['diamond', 2, 5, 3], ['golden_apple', 1, 2, 2]],
};
function rollLoot(table, seed) {
  const T = LOOT[table] || LOOT.dungeon; const r = mulberry32(seed >>> 0); const items = new Array(27).fill(null);
  const total = T.reduce((s, e) => s + e[3], 0); const n = table === 'end_ship' ? 3 : 4 + ((r() * 5) | 0);
  for (let i = 0; i < n; i++) {
    let k = r() * total; let e = T[0]; for (const t of T) { k -= t[3]; if (k <= 0) { e = t; break; } }
    if (table === 'end_ship' && i === 0) e = T[0];
    const id = ID[e[0]]; if (id === undefined) continue; const cnt = e[1] + ((r() * (e[2] - e[1] + 1)) | 0);
    let slot = (r() * 27) | 0; let tries = 0; while (items[slot] && tries++ < 30) slot = (r() * 27) | 0;
    items[slot] = { id, c: Math.min(cnt, REG[id].stack), d: 0 };
  }
  return items;
}
