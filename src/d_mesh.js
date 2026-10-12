// ============================================================================
//  Iluminación (BFS) y mallado de chunks
// ============================================================================
const F_CUT = 8, F_LEAF = 16, F_PLANT = 32, F_WATER = 64, F_LAVA = 128, F_EMIS = 256, F_PORTAL = 512, F_ENDP = 1024, F_SNOW = 2048, F_FIRE = 4096, F_GLASS = 8192, F_FOLI = 16384;
// tablas rápidas
const T_OPQ = new Uint8Array(65536), T_ATT = new Uint8Array(65536), T_EMIT = new Uint8Array(65536), T_SKYPASS = new Uint8Array(65536), T_FULL = new Uint8Array(65536); const B_PAD = 65535;
function buildTables() {
  for (let i = 0; i < ITEM_BASE; i++) {
    const d = REG[i]; if (!d) { T_OPQ[i] = 1; continue; }
    T_OPQ[i] = d.opaque && d.render === 'cube' ? 1 : 0; T_FULL[i] = T_OPQ[i];
    T_ATT[i] = d.liquid === 1 ? 1 : d.liquid === 2 ? 14 : d.att || 0; T_EMIT[i] = d.light || 0;
    T_SKYPASS[i] = (!T_OPQ[i] && !T_ATT[i]) ? 1 : 0;
  }
  T_OPQ[B_PAD] = 1; T_FULL[B_PAD] = 1;
}
const LP = 14, LR = 16 + LP * 2 + 2, LRR = LR * LR;
let regB = null, regM = null, regS = null, regL = null, regH = 0, lq = new Int32Array(1 << 21);
// compactación de la nieve: por columna, 8x8 subceldas con la profundidad pisada en 1/64 de bloque (Uint8Array(64))
// regSC = región 18x18 columnas (el chunk y un borde de 1) × 64, o null si no hay nada pisado cerca
let regSC = null;
function buildSnowRegion(world, ch) {
  let any = false; for (let dz = -1; dz <= 1 && !any; dz++) for (let dx = -1; dx <= 1 && !any; dx++) { const c = world.chunk(ch.cx + dx, ch.cz + dz); if (c && c.snowC && c.snowC.size) any = true; }
  if (!any) { regSC = null; return; }
  regSC = new Uint8Array(18 * 18 * 64);
  for (let lz = 0; lz < 18; lz++) for (let lx = 0; lx < 18; lx++) {
    const wx = ch.cx * 16 + lx - 1, wz = ch.cz * 16 + lz - 1; const c = world.chunk(wx >> 4, wz >> 4); if (!c || !c.snowC) continue;
    const a = c.snowC.get((wx & 15) | ((wz & 15) << 4)); if (a) regSC.set(a, (lz * 18 + lx) * 64);
  }
}
function buildRegion(world, ch) {
  buildSnowRegion(world, ch);
  const H = world.H; const size = LRR * (H + 2);
  if (!regB || regH !== H) { regB = new Uint16Array(size); regM = new Uint8Array(size); regS = new Uint8Array(size); regL = new Uint8Array(size); regH = H; }
  regB.fill(B_PAD); regM.fill(0);
  const bx = ch.cx * 16 - LP - 1, bz = ch.cz * 16 - LP - 1;
  for (let lz = 1; lz < LR - 1; lz++) {
    const wz = bz + lz; const ccz = wz >> 4;
    for (let lx = 1; lx < LR - 1; lx++) {
      const wx = bx + lx; const c = world.chunk(wx >> 4, ccz); if (!c) continue;
      const base = (wx & 15) | ((wz & 15) << 4); const cb = c.blocks, cm = c.meta;
      let ri = (LR + lz) * LR + lx; const near = lx >= LP - 1 && lx <= LP + 18 && lz >= LP - 1 && lz <= LP + 18; // meta del chunk ±2 columnas (superficies suaves)
      for (let y = 0; y < H; y++, ri += LRR) { const v = cb[base | (y << 8)]; regB[ri] = v; if (near && v) regM[ri] = cm[base | (y << 8)]; }
    }
  }
}
function computeLight(world, ch) {
  const H = world.H; regS.fill(0); regL.fill(0);
  let qh = 0, qt = 0; const QM = lq.length - 1;
  if (world.dim === 'overworld') {
    const hm = new Int16Array(LRR).fill(H);
    for (let lz = 1; lz < LR - 1; lz++) for (let lx = 1; lx < LR - 1; lx++) {
      let y = H - 1; let i = ((y + 1) * LR + lz) * LR + lx;
      while (y >= 0 && T_SKYPASS[regB[i]]) { regS[i] = 15; y--; i -= LRR; }
      hm[lz * LR + lx] = y;
    }
    for (let lz = 1; lz < LR - 1; lz++) for (let lx = 1; lx < LR - 1; lx++) {
      const h = hm[lz * LR + lx]; const m = Math.max(hm[lz * LR + lx - 1], hm[lz * LR + lx + 1], hm[(lz - 1) * LR + lx], hm[(lz + 1) * LR + lx]);
      const top = Math.min(H - 1, Math.max(h + 1, m));
      for (let y = h + 1; y <= top; y++) { const i = ((y + 1) * LR + lz) * LR + lx; if (regS[i] === 15) { lq[qt++ & QM] = i; } }
    }
    while (qh !== qt) {
      const i = lq[qh++ & QM]; const v = regS[i]; if (v <= 1) continue;
      for (let k = 0; k < 6; k++) {
        const j = k === 0 ? i + 1 : k === 1 ? i - 1 : k === 2 ? i + LR : k === 3 ? i - LR : k === 4 ? i + LRR : i - LRR;
        const b = regB[j]; if (T_OPQ[b]) continue; const nv = v - 1 - T_ATT[b];
        if (nv > regS[j]) { regS[j] = nv; lq[qt++ & QM] = j; }
      }
    }
  }
  qh = qt = 0;
  const n = regB.length;
  for (let i = LRR; i < n - LRR; i++) { const e = T_EMIT[regB[i]]; if (e) { regL[i] = e; lq[qt++ & QM] = i; } }
  while (qh !== qt) {
    const i = lq[qh++ & QM]; const v = regL[i]; if (v <= 1) continue;
    for (let k = 0; k < 6; k++) {
      const j = k === 0 ? i + 1 : k === 1 ? i - 1 : k === 2 ? i + LR : k === 3 ? i - LR : k === 4 ? i + LRR : i - LRR;
      const b = regB[j]; if (T_OPQ[b]) continue; const nv = v - 1 - (T_ATT[b] > 3 ? 3 : T_ATT[b]);
      if (nv > regL[j]) { regL[j] = nv; lq[qt++ & QM] = j; }
    }
  }
  // copiar al chunk
  if (!ch.light || ch.light.length !== 256 * H) ch.light = new Uint8Array(256 * H);
  const L = ch.light;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    let ri = (LR + z + LP + 1) * LR + x + LP + 1;
    for (let y = 0; y < H; y++, ri += LRR) L[x | z << 4 | y << 8] = (regS[ri] << 4) | regL[ri];
  }
}
// ---------------------------------------------------------- buffers
class MeshBuf {
  constructor() { this.pos = new Float32Array(3 * 8192); this.tex = new Uint16Array(4 * 8192); this.lit = new Uint8Array(4 * 8192); this.idx = new Uint32Array(6 * 2048); this.nv = 0; this.ni = 0; }
  reset() { this.nv = 0; this.ni = 0; }
  grow() {
    const g = (a, n) => { const b = new a.constructor(a.length * 2); b.set(a); return b; };
    if ((this.nv + 64) * 3 > this.pos.length) { this.pos = g(this.pos); this.tex = g(this.tex); this.lit = g(this.lit); }
    if (this.ni + 96 > this.idx.length) this.idx = g(this.idx);
  }
  ensure(nv, ni) { // espacio para nv vértices e ni índices más (rejillas de superficie grandes)
    while ((this.nv + nv) * 3 > this.pos.length) { const g = a => { const b = new a.constructor(a.length * 2); b.set(a); return b; }; this.pos = g(this.pos); this.tex = g(this.tex); this.lit = g(this.lit); }
    while (this.ni + ni > this.idx.length) { const b = new Uint32Array(this.idx.length * 2); b.set(this.idx); this.idx = b; }
  }
  v(x, y, z, u, v, layer, flags, sky, blk, ao, tint) {
    const n = this.nv++; this.pos[n * 3] = x; this.pos[n * 3 + 1] = y; this.pos[n * 3 + 2] = z;
    this.tex[n * 4] = u * 256; this.tex[n * 4 + 1] = v * 256; this.tex[n * 4 + 2] = layer; this.tex[n * 4 + 3] = flags;
    this.lit[n * 4] = sky * 17; this.lit[n * 4 + 1] = blk * 17; this.lit[n * 4 + 2] = ao * 85; this.lit[n * 4 + 3] = tint;
  }
  quad(flip) { const b = this.nv - 4; const I = this.idx; let k = this.ni; if (!flip) { I[k++] = b; I[k++] = b + 1; I[k++] = b + 2; I[k++] = b; I[k++] = b + 2; I[k++] = b + 3; } else { I[k++] = b + 1; I[k++] = b + 2; I[k++] = b + 3; I[k++] = b + 1; I[k++] = b + 3; I[k++] = b; } this.ni = k; }
  quad2() { this.quad(false); const b = this.nv - 4; const I = this.idx; let k = this.ni; I[k++] = b; I[k++] = b + 2; I[k++] = b + 1; I[k++] = b; I[k++] = b + 3; I[k++] = b + 2; this.ni = k; }
  out() { return { pos: this.pos.slice(0, this.nv * 3), tex: this.tex.slice(0, this.nv * 4), lit: this.lit.slice(0, this.nv * 4), idx: this.idx.slice(0, this.ni), count: this.ni }; }
}
const MB_O = new MeshBuf(), MB_T = new MeshBuf(), MB_W = new MeshBuf(), MB_F = new MeshBuf();
// agua: superficies y después los chorros (en el mismo búfer; 'fall' marca dónde empiezan). Los chorros se dibujan en una
// segunda pasada para que refracten una copia de la escena que ya tiene el lago delante/detrás
function outWater(W, F) {
  if (!F.nv) { const o = W.out(); o.fall = o.count; return o; }
  const nv = W.nv + F.nv, ni = W.ni + F.ni;
  const pos = new Float32Array(nv * 3), tex = new Uint16Array(nv * 4), lit = new Uint8Array(nv * 4), idx = new Uint32Array(ni);
  pos.set(W.pos.subarray(0, W.nv * 3)); pos.set(F.pos.subarray(0, F.nv * 3), W.nv * 3);
  tex.set(W.tex.subarray(0, W.nv * 4)); tex.set(F.tex.subarray(0, F.nv * 4), W.nv * 4);
  lit.set(W.lit.subarray(0, W.nv * 4)); lit.set(F.lit.subarray(0, F.nv * 4), W.nv * 4);
  idx.set(W.idx.subarray(0, W.ni)); for (let k = 0; k < F.ni; k++) idx[W.ni + k] = F.idx[k] + W.nv;
  return { pos, tex, lit, idx, count: ni, fall: W.ni };
}
const FACE = [
  { n: [1, 0, 0], a: 0, t1: 2, t2: 1, c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], a: 0, t1: 2, t2: 1, c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], a: 1, t1: 0, t2: 2, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], a: 1, t1: 0, t2: 2, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], a: 2, t1: 0, t2: 1, c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], a: 2, t1: 0, t2: 1, c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
];
function faceUV(f, x, y, z) { switch (f) { case 0: return [1 - z, 1 - y]; case 1: return [z, 1 - y]; case 2: return [x, z]; case 3: return [x, 1 - z]; case 4: return [x, 1 - y]; default: return [1 - x, 1 - y]; } }

// ---------------------------------------------------------- formas compuestas (escaleras, puertas, vallas...)
const PANEL = [[0, 0, 0, 16, 16, 3], [13, 0, 0, 16, 16, 16], [0, 0, 13, 16, 16, 16], [0, 0, 0, 3, 16, 16]]; // lados: -z, +x, +z, -x
const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function connects(d, nb) {
  if (nb <= 0 || nb === B_PAD) return false; const n = REG[nb]; if (!n) return false;
  if (T_FULL[nb]) return true;
  if (d.shape === 'fence') return n.shape === 'fence' || n.shape === 'gate';
  if (d.shape === 'wall') return n.shape === 'wall';
  if (d.shape === 'pane') return n.shape === 'pane';
  return false;
}
// devuelve cajas en 1/16. nb(dx,dz) -> id del vecino en el mismo nivel
function shapeBoxes(d, meta, nb, forCollision) {
  const f = meta & 3; const out = [];
  switch (d.shape) {
    case 'stairs': {
      const up = meta & 4; out.push(up ? [0, 8, 0, 16, 16, 16] : [0, 0, 0, 16, 8, 16]);
      const t = [[0, 0, 0, 16, 8, 8], [8, 0, 0, 16, 8, 16], [0, 0, 8, 16, 8, 16], [0, 0, 0, 8, 8, 16]][f].slice(); if (!up) { t[1] += 8; t[4] += 8; } out.push(t); break;
    }
    case 'door': { const open = meta & 4; const side = (f + 2) % 4; out.push(PANEL[open ? (side + 1) % 4 : side]); break; }
    case 'trapdoor': { if (meta & 4) out.push(PANEL[(f + 2) % 4]); else out.push(meta & 8 ? [0, 13, 0, 16, 16, 16] : [0, 0, 0, 16, 3, 16]); break; }
    case 'gate': { const ax = f & 1; if (meta & 4) { out.push(ax ? [0, 0, 6, 2, 16, 10] : [6, 0, 0, 10, 16, 2]); out.push(ax ? [14, 0, 6, 16, 16, 10] : [6, 0, 14, 10, 16, 16]); } else out.push(ax ? [7, 0, 0, 9, 16, 16] : [0, 0, 7, 16, 16, 9]); break; }
    case 'fence': case 'wall': case 'pane': {
      const pw = d.shape === 'wall' ? 4 : d.shape === 'fence' ? 2 : 1, aw = d.shape === 'wall' ? 3 : 1;
      out.push([8 - pw, 0, 8 - pw, 8 + pw, 16, 8 + pw]);
      for (let i = 0; i < 4; i++) {
        if (!connects(d, nb(DIR4[i][0], DIR4[i][1]))) continue;
        const [dx, dz] = DIR4[i]; const lo = (a, s) => a < 0 ? 0 : a > 0 ? 8 + s : 8 - s, hi = (a, s) => a < 0 ? 8 - s : a > 0 ? 16 : 8 + s;
        if (d.shape === 'fence' && !forCollision) { for (const [y0, y1] of [[6, 9], [12, 15]]) out.push([lo(dx, aw), y0, lo(dz, aw), hi(dx, aw), y1, hi(dz, aw)]); }
        else out.push([lo(dx, aw), 0, lo(dz, aw), hi(dx, aw), d.shape === 'wall' ? 14 : 16, hi(dz, aw)]);
      }
      break;
    }
  }
  return out;
}
const ORIENT_FRONT = [5, 0, 4, 1];
const OPP = [1, 0, 3, 2, 5, 4];
function faceLayer(d, f, meta) {
  if (d.orient) { const fr = ORIENT_FRONT[meta & 3]; if (f === fr) return d.faces[5]; if (f === OPP[fr]) return d.faces[4]; if (f >= 4 || f <= 1) return d.faces[0]; }
  if (d.log && meta) { const ax = meta === 1 ? 0 : 2; if (FACE[f].a === ax) return d.faces[2]; return d.faces[0]; }
  return d.faces[f];
}
let MESH_QUALITY = 2;
function buildMesh(world, ch) { buildRegion(world, ch); return meshRegion(world, ch); }
function meshRegion(world, ch) {
  computeLight(world, ch);
  const O = MB_O, T = MB_T; O.reset(); T.reset(); MB_W.reset(); MB_F.reset();
  const H = world.H; const top = Math.min(H - 1, ch.top + 1);
  const fancy = MESH_QUALITY >= 1;
  const bxw = ch.cx * 16, bzw = ch.cz * 16; const EM = []; let EMlava = 0;
  for (let y = 0; y <= top; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const ri = ((y + 1) * LR + z + LP + 1) * LR + x + LP + 1; const id = regB[ri]; if (!id) continue;
    const d = REG[id]; if (!d || d.render === 'none') continue;
    const meta = regM[ri];
    // emisores (fuego, antorchas, lava...): la lava tiene su propio cupo para que un lago subterráneo no deje sin efectos a los fuegos y antorchas del chunk
    if (d.liquid === 1 && EM.length < 4096 && liqFall(ri) && isLiqB(regB[ri - LRR], 1) && !liqFall(ri - LRR)) EM.push(bxw + x, y - 1, bzw + z, ID.water); // chorro que cae en una poza
    if (d.light >= 10 && EM.length < 4096 && (d.render !== 'cube' || d.liquid || id === ID.magma_block) && (!d.liquid || (regB[ri + LRR] === 0 && (EMlava++ < 96)))) EM.push(bxw + x, y, bzw + z, id);
    if (id === ID.snow_block && airLike(regB[ri + LRR])) {
      emitSurface(O, SK_SNOW, x, y, z, ri, ch, bxw, bzw);
      const nri = ri - LRR; if (!T_FULL[regB[nri]]) emitFace(O, 3, x, y, z, ri, nri, faceLayer(d, 3, meta), F_SNOW, 0, 0, 0, 1, null);
    } else if (d.render === 'cube') {
      const B = d.trans === 2 ? T : O; let flags = 0;
      if (d.trans === 1) flags |= F_CUT; if (d.wave === 1 && fancy) flags |= F_LEAF; if (d.leaves || d.wave) flags |= F_FOLI;
      if (d.emissive) flags |= F_EMIS; if (d.portal === 1) flags |= F_PORTAL; if (d.endPortal) flags |= F_ENDP; if (d.trans === 2) flags |= F_GLASS;
      for (let f = 0; f < 6; f++) {
        const F = FACE[f]; const nri = ri + F.n[0] + F.n[1] * LRR + F.n[2] * LR; const nb = regB[nri];
        if (T_FULL[nb]) continue;
        if (nb === id && (d.cullSelf || (!fancy && d.leaves))) continue;
        if (f === 2 && nb === ID.snow && !d.trans) continue;
        const nd = REG[nb]; if (nd && d.trans === 2 && nd.trans === 2 && d.cullSelf && nd.cullSelf && nb !== id && d.portal) continue;
        const layer = faceLayer(d, f, meta); emitFace(B, f, x, y, z, ri, nri, layer, flags, tintFor(d, f, ch, x, z), d.log && meta ? 1 : 0, 0, 1, null);
      }
    } else if (d.render === 'fire') {
      // el fuego no tiene malla: se dibuja con llamas volumétricas (drawFlames) y partículas
    } else if (d.render === 'cross') {
      const li = ri; const sky = regS[li], blk = regL[li]; const layer = d.stages ? d.stages[Math.min(3, meta >> 1)] : d.faces[0];
      let flags = F_CUT | 6 | F_FOLI; if (d.emissive) flags |= F_EMIS; if (d.render === 'fire') flags |= F_FIRE;
      const tint = d.tint ? (d.tint === 1 ? 1 + ch.biomes[x | z << 4] : 64 + ch.biomes[x | z << 4]) : 0;
      const h = d.render === 'fire' ? 1.2 : 1; const wv = d.wave === 2 ? F_PLANT : 0;
      const r = hash2(7, bxw + x, bzw + z); const ox = d.render === 'cross' && d.id !== ID.sugar_cane ? (r - 0.5) * 0.3 : 0, oz = d.render === 'cross' ? (hash2(9, bxw + x, bzw + z) - 0.5) * 0.3 : 0;
      const B = d.render === 'fire' ? T : O;
      for (let k = 0; k < 2; k++) {
        const a = k ? [0.15, 0.85] : [0.15, 0.15], b = k ? [0.85, 0.15] : [0.85, 0.85];
        B.grow();
        B.v(x + a[0] + ox, y, z + a[1] + oz, 0, 1, layer, flags, sky, blk, 3, tint);
        B.v(x + b[0] + ox, y, z + b[1] + oz, 1, 1, layer, flags, sky, blk, 3, tint);
        B.v(x + b[0] + ox, y + h, z + b[1] + oz, 1, 0, layer, flags | wv, sky, blk, 3, tint);
        B.v(x + a[0] + ox, y + h, z + a[1] + oz, 0, 0, layer, flags | wv, sky, blk, 3, tint);
        B.quad2();
      }
      if (d.inWater) emitLiquidCell(MB_W, SK_WATER, x, y, z, ri, ch, bxw, bzw);
    } else if (d.render === 'box') {
      emitBox(d, x, y, z, ri, meta, ch);
    } else if (d.render === 'shape') {
      const boxes = shapeBoxes(d, meta, (dx, dz) => regB[ri + dx + dz * LR]); const lay = d.shape === 'door' && (meta & 8) ? d.layerTop : undefined;
      for (const b of boxes) emitBox(d, x, y, z, ri, meta, ch, b, lay);
    } else if (d.render === 'liquid') {
      emitLiquidCell(d.liquid === 1 ? MB_W : O, d.liquid, x, y, z, ri, ch, bxw, bzw);
    } else if (d.render === 'snow') {
      emitSurface(O, SK_SNOW, x, y, z, ri, ch, bxw, bzw);
    }
  }
  ch.emitters = EM;
  return { o: O.out(), t: T.out(), w: outWater(MB_W, MB_F) };
}
function tintFor(d, f, ch, x, z) {
  if (d.tintTop && f === 2) return 1 + ch.biomes[x | z << 4];
  if (d.tint === 2) return 64 + ch.biomes[x | z << 4];
  if (d.tint === 1) return 1 + ch.biomes[x | z << 4];
  return 0;
}
function cellLight(i) { return [regS[i], regL[i]]; }
function emitFace(B, f, x, y, z, ri, nri, layer, flags, tint, rot, h0, h1, box) {
  B.grow(); const F = FACE[f]; const d1 = F.t1 === 0 ? 1 : F.t1 === 1 ? LRR : LR, d2 = F.t2 === 0 ? 1 : F.t2 === 1 ? LRR : LR;
  const aos = [0, 0, 0, 0]; const base = B.nv;
  for (let k = 0; k < 4; k++) {
    const c = F.c[k]; const s1 = c[F.t1] ? d1 : -d1, s2 = c[F.t2] ? d2 : -d2;
    const a = regB[nri + s1], b = regB[nri + s2], cc = regB[nri + s1 + s2];
    const o1 = T_FULL[a], o2 = T_FULL[b], o3 = T_FULL[cc];
    const ao = (o1 && o2) ? 0 : 3 - (o1 + o2 + o3);
    let sk = regS[nri], bl = regL[nri], n = 1;
    if (T_FULL[regB[nri]]) { sk = regS[ri]; bl = regL[ri]; }
    if (!o1) { sk += regS[nri + s1]; bl += regL[nri + s1]; n++; }
    if (!o2) { sk += regS[nri + s2]; bl += regL[nri + s2]; n++; }
    if (!o3 && !(o1 && o2)) { sk += regS[nri + s1 + s2]; bl += regL[nri + s1 + s2]; n++; }
    aos[k] = ao;
    let px = c[0], py = c[1], pz = c[2];
    let [u, v] = faceUV(f, px, py, pz); if (rot) { const t = u; u = v; v = t; }
    B.v(x + px, y + py, z + pz, u, v, layer, flags | f, sk / n, bl / n, ao, tint);
  }
  B.quad(aos[0] + aos[2] < aos[1] + aos[3]);
}
function emitBox(d, x, y, z, ri, meta, ch, boxOv, layerOv) {
  let [x0, y0, z0, x1, y1, z1] = (boxOv || d.box).map(v => v / 16);
  if ((d.id === ID.torch) && meta >= 1 && meta <= 4) { const o = [[0, 0.32], [-0.32, 0], [0, -0.32], [0.32, 0]][meta - 1]; x0 += o[0]; x1 += o[0]; z0 += o[1]; z1 += o[1]; y0 += 0.2; y1 += 0.2; }
  if (d.id === ID.pointed_dripstone && meta === 1) { /* colgante: misma caja */ }
  const sky = Math.max(regS[ri], regS[ri + LRR]), blk = Math.max(regL[ri], regL[ri + LRR]);
  const B = d.trans === 2 || d.endPortal ? MB_T : MB_O; let flags = (d.trans === 1 || d.id === ID.torch || d.id === ID.lantern || d.id === ID.soul_lantern || d.id === ID.lily_pad || d.id === ID.rail) ? F_CUT : 0;
  if (d.emissive) flags |= F_EMIS; if (d.endPortal) flags |= F_ENDP;
  const tint = d.tint === 2 ? 64 + ch.biomes[x | z << 4] : 0;
  const P = [[x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], [x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], [x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], [x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0]];
  for (let f = 0; f < 6; f++) {
    const F = FACE[f]; const atEdge = (f === 0 && x1 >= 1) || (f === 1 && x0 <= 0) || (f === 2 && y1 >= 1) || (f === 3 && y0 <= 0) || (f === 4 && z1 >= 1) || (f === 5 && z0 <= 0);
    if (atEdge) { const nb = regB[ri + F.n[0] + F.n[1] * LRR + F.n[2] * LR]; if (T_FULL[nb]) continue; }
    if (d.endPortal && f !== 2) continue;
    const layer = layerOv !== undefined ? layerOv : faceLayer(d, f, meta); B.grow(); const p = P[f]; const ao = (f === 3) ? 2 : 3;
    const shadeSide = f === 2 ? 1 : 0.92;
    for (let k = 0; k < 4; k++) {
      const px = p[k * 3], py = p[k * 3 + 1], pz = p[k * 3 + 2];
      let [u, v] = faceUV(f, px, py, pz); if (d.id === ID.torch || d.id === ID.end_rod) { if (f !== 2 && f !== 3) { v = 1 - (py - y0) / 1; } }
      B.v(x + px, y + py, z + pz, u, v, layer, flags | f, sky * shadeSide, blk, ao, tint);
    }
    B.quad(false);
  }
}
// ============================================================================
//  Superficies realistas: agua, lava y nieve (sin escalones ni caras cúbicas)
//  Cada celda de superficie arma una rejilla de control 3x3 (esquinas, aristas, centro) y dibuja una
//  superficie de Bézier cuadrática. Las alturas compartidas salen de surfContrib(), que depende solo de la
//  celda vecina (no de quién pregunta): celdas vecinas generan los mismos vértices en sus bordes, sin grietas,
//  también entre niveles distintos (rampas en vez de escalones) y entre chunks.
// ============================================================================
const F_SURF = 32768; // vértice con normal suave en u,v y flujo en la capa
const SK_WATER = 1, SK_LAVA = 2, SK_SNOW = 3;
const SURF_SHORE = [0, 0.0, 0.16, 0.03]; // altura del borde libre: agua = menisco fino, lava = lóbulo viscoso, nieve = borde redondeado
function isLiqB(b, liq) { const d = REG[b]; return !!d && (d.liquid === liq || (liq === 1 && !!d.inWater)); }
function airLike(b) { if (b === 0) return true; const d = REG[b]; return !!d && !d.solid && !d.liquid; }
// chorro que cae: celda «cubierta» (LIQ_FALL = mismo líquido encima) que tiene aire a algún lado; dentro de un lago
// todas las celdas sumergidas llevan LIQ_FALL y NO son chorros
function liqFall(j) { const d = REG[regB[j]]; if (!d || d.inWater || !(regM[j] & LIQ_FALL)) return false; return airLike(regB[j + 1]) || airLike(regB[j - 1]) || airLike(regB[j + LR]) || airLike(regB[j - LR]); }
// volumen «asentado» para dibujar: el simulador deja lagos con un damero de 7/8 y 8/8 (y la lava con escalones de 1-2);
// si la celda y sus 4 vecinas son el mismo líquido (o roca) y casi iguales, se dibuja el máximo: superficie lisa
function liqAmtVis(j) {
  const d = REG[regB[j]]; if (!d) return 8; if (d.inWater) return 8; const liq = d.liquid; const a = liqAmt(regM[j]); if (a >= 8) return 8;
  let mx = a, mn = a;
  for (const o of [1, -1, LR, -LR]) { const k = j + o, b = regB[k]; if (isLiqB(b, liq) && !liqFall(k)) { const an = REG[b].inWater ? 8 : liqAmt(regM[k]); if (an > mx) mx = an; if (an < mn) mn = an; } else if (!T_FULL[b]) return a; }
  return mx - mn <= (liq === 2 ? 2 : 1) ? mx : a;
}
// altura de la superficie dentro de su celda: la misma que usa la física (liquidSurface)
function liqTopH(j) { const u = regB[j + LRR]; if (T_FULL[u]) return 1; if (u === ID.ice || u === ID.packed_ice) return 0.995; return liqAmtVis(j) / 8 * 0.92; }
// nivel de la columna de líquido que contiene j, relativo a la capa de j (sube por las celdas llenas, no por chorros)
function liqLevelUp(j, liq) { let n = 0; while (n < 4) { const u = j + LRR; if (!isLiqB(regB[u], liq) || liqFall(u)) break; j = u; n++; } return n + liqTopH(j); }
// nivel de nieve de una celda (relativo a su capa) o -9 si no es nieve
function snowLevel(j) { const b = regB[j]; if (b === ID.snow) return Math.max(1, regM[j]) / 8; if (b === ID.snow_block) { const u = regB[j + LRR]; return u === ID.snow ? 1 + Math.max(1, regM[j + LRR]) / 8 : u === ID.snow_block ? 2 : 1; } return -9; }
// aportación de la celda j a una esquina/arista compartida (NaN = pared, no cuenta)
function surfContrib(j, kind) {
  const b = regB[j];
  if (kind !== SK_SNOW) {
    if (isLiqB(b, kind) && !liqFall(j)) return liqLevelUp(j, kind);
    if (airLike(b) || isLiqB(b, kind)) { // aire, plantas o un chorro que cae: la superficie baja hacia el nivel de abajo o hasta el suelo
      const dn = j - LRR; if (isLiqB(regB[dn], kind) && !liqFall(dn)) return liqTopH(dn) - 1;
      const dd = REG[regB[dn]]; return dd && dd.solid ? SURF_SHORE[kind] : 0;
    }
    const u = j + LRR; return isLiqB(regB[u], kind) && !liqFall(u) ? 1 + liqLevelUp(u, kind) : NaN;
  }
  const sl = snowLevel(j); if (sl > -9) return sl;
  if (airLike(b)) { const dn = j - LRR, sd = snowLevel(dn); if (sd > -9) return sd - 1; const dd = REG[regB[dn]]; return dd && dd.solid ? SURF_SHORE[SK_SNOW] : 0.05; }
  const su = snowLevel(j + LRR); return su > -9 ? 1 + su : NaN;
}
// orilla seca (aire sobre suelo, al nivel de la celda): en el agua manda, la superficie llega al suelo (menisco fino)
function dryShore(j, kind) { if (kind !== SK_WATER) return false; const b = regB[j]; if (!airLike(b)) return false; const dn = REG[regB[j - LRR]]; return !!dn && dn.solid; }
function surfCorner(kind, ri, dx, dz) { let s = 0, n = 0, dry = false; for (let b = dz - 1; b <= dz; b++) for (let a = dx - 1; a <= dx; a++) { const j = ri + a + b * LR; if (dryShore(j, kind)) dry = true; const v = surfContrib(j, kind); if (v === v) { s += v; n++; } } return dry ? SURF_SHORE[kind] + 0.01 : n ? s / n : 0; }
function surfEdge(kind, ri, off) { if (dryShore(ri + off, kind)) return SURF_SHORE[kind] + 0.01; const v0 = surfContrib(ri, kind), v1 = surfContrib(ri + off, kind); return v1 === v1 ? (v0 + v1) * 0.5 : v0; }
const _SP = new Float32Array(9), _SO = new Float32Array(3);
// rejilla de control 3x3: [fila z][columna x]
function surfCtrl(kind, ri) { const P = _SP; P[0] = surfCorner(kind, ri, 0, 0); P[1] = surfEdge(kind, ri, -LR); P[2] = surfCorner(kind, ri, 1, 0); P[3] = surfEdge(kind, ri, -1); P[4] = surfContrib(ri, kind); P[5] = surfEdge(kind, ri, 1); P[6] = surfCorner(kind, ri, 0, 1); P[7] = surfEdge(kind, ri, LR); P[8] = surfCorner(kind, ri, 1, 1); return P; }
// Bézier cuadrática: o = [altura, dh/du, dh/dv]
function surfBez(P, u, v, o) {
  const a0 = (1 - u) * (1 - u), a1 = 2 * u * (1 - u), a2 = u * u, da0 = -2 * (1 - u), da1 = 2 - 4 * u, da2 = 2 * u;
  const b0 = (1 - v) * (1 - v), b1 = 2 * v * (1 - v), b2 = v * v, db0 = -2 * (1 - v), db1 = 2 - 4 * v, db2 = 2 * v;
  const r0 = a0 * P[0] + a1 * P[1] + a2 * P[2], r1 = a0 * P[3] + a1 * P[4] + a2 * P[5], r2 = a0 * P[6] + a1 * P[7] + a2 * P[8];
  const d0 = da0 * P[0] + da1 * P[1] + da2 * P[2], d1 = da0 * P[3] + da1 * P[4] + da2 * P[5], d2 = da0 * P[6] + da1 * P[7] + da2 * P[8];
  o[0] = b0 * r0 + b1 * r1 + b2 * r2; o[1] = b0 * d0 + b1 * d1 + b2 * d2; o[2] = db0 * r0 + db1 * r1 + db2 * r2;
}
// codificación: normal (nx,nz) en u,v (0..1 → -1..1); flujo (fx,fz en -63..63) en la capa
const surfFlow = (fx, fz) => (clamp(Math.round(fx), -63, 63) + 64) | ((clamp(Math.round(fz), -63, 63) + 64) << 7);
// ondulación suave de la nieve (en coordenadas de mundo, continua entre celdas)
function vnoise2(x, z, sd) { const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(sd, ix, iz), b = hash2(sd, ix + 1, iz), c = hash2(sd, ix, iz + 1), d = hash2(sd, ix + 1, iz + 1); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; }
function snowUndul(wx, wz) { return vnoise2(wx / 2.3 + wz * 0.12, wz / 2.3, 71) * 0.06 + vnoise2(wx / 0.9, wz / 0.9, 73) * 0.022; } // dunas suaves algo estiradas por el viento
// luz por vértice: interpolación bilineal entre los centros de las 4 celdas vecinas (sin cuadros de luz en superficies lisas)
const _SL = new Float32Array(2);
function surfLight(ri, u, v) {
  const px = u - 0.5, pz = v - 0.5; const ix = px < 0 ? -1 : 0, iz = pz < 0 ? -1 : 0; const fx = px - ix, fz = pz - iz;
  let s = 0, b = 0, w = 0;
  for (let c = 0; c < 4; c++) { const dx = ix + (c & 1), dz = iz + (c >> 1); const wt = ((c & 1) ? fx : 1 - fx) * ((c >> 1) ? fz : 1 - fz); if (wt <= 1e-4) continue; const j = ri + dx + dz * LR; if (T_FULL[regB[j]]) continue; s += Math.max(regS[j], regS[j + LRR]) * wt; b += Math.max(regL[j], regL[j + LRR]) * wt; w += wt; }
  if (w > 0) { _SL[0] = s / w; _SL[1] = b / w; } else { _SL[0] = Math.max(regS[ri], regS[ri + LRR]); _SL[1] = Math.max(regL[ri], regL[ri + LRR]); }
  return _SL;
}
// escalón tapado por nieve (bloque sólido con nieve encima): su borde no debe asomar por la rampa de nieve
// escalón tapado por la nieve junto a un vértice: arriba del bloque de este nivel (1) o del de abajo (0). Mirar los dos niveles hace que
// dos celdas a distinta altura que comparten un vértice pidan la misma altura absoluta (sin grietas en las terrazas)
function snowStepTop(c) {
  const sl = snowLevel(c);
  if (sl <= -9) { const d = REG[regB[c]]; if (d && d.solid && snowLevel(c + LRR) > -9) return 1; }
  if (sl > -9) { const d = REG[regB[c - LRR]]; if (d && d.solid && snowLevel(c - LRR) <= -9) return 0; }
  return -9;
}
// celda de agua o lava: superficie suave, chorro cayendo (tubo) o nada (si está cubierta)
function emitLiquidCell(B, kind, x, y, z, ri, ch, bxw, bzw) {
  if (liqFall(ri)) { emitFall(B === MB_W ? MB_F : B, kind, x, y, z, ri, ch); return; }
  const u = ri + LRR; if ((isLiqB(regB[u], kind) && !liqFall(u)) || T_FULL[regB[u]]) { emitLiquidSides(B, kind, x, y, z, ri, ch, null); return; } // cubierta por más líquido o por un bloque: solo lados contra cristal
  emitSurface(B, kind, x, y, z, ri, ch, bxw, bzw);
}
function liqTint(kind, ri, ch, x, z) { if (kind !== SK_WATER) return 0; const m = regM[ri]; const d = REG[regB[ri]]; return d && !d.inWater && (m & LIQ_OCEAN) ? 1 + ch.biomes[x | z << 4] : 200; }
// superficie de una celda (agua, lava o nieve)
function emitSurface(B, kind, x, y, z, ri, ch, bxw, bzw) {
  const P = surfCtrl(kind, ri);
  // agua bajo una capa de hielo: plana, pegada al hielo (sin promediar con el agua abierta de al lado, que la haría subir dentro del bloque)
  if (kind === SK_WATER) { const ub = regB[ri + LRR]; if (ub === ID.ice || ub === ID.packed_ice) P.fill(0.995); }
  let mn = P[0], mx = P[0]; for (let k = 1; k < 9; k++) { if (P[k] < mn) mn = P[k]; if (P[k] > mx) mx = P[k]; }
  const flat = mx - mn < 0.012;
  const snow = kind === SK_SNOW;
  // ¿pisadas en la nieve de esta columna o al lado? entonces rejilla fina para que las huellas tengan forma
  let pressed = false; if (snow && regSC && MESH_QUALITY >= 1) { for (let dz = -1; dz <= 1 && !pressed; dz++) for (let dx = -1; dx <= 1 && !pressed; dx++) { const o = ((z + dz + 1) * 18 + (x + dx + 1)) * 64; for (let k = 0; k < 64; k++) if (regSC[o + k]) { pressed = true; break; } } }
  let N;
  if (snow) N = pressed ? (MESH_QUALITY >= 2 ? 8 : 4) : MESH_QUALITY >= 2 ? (flat ? 2 : 4) : MESH_QUALITY >= 1 ? 2 : 1;
  else N = flat ? 1 : MESH_QUALITY >= 2 ? 4 : MESH_QUALITY >= 1 ? 2 : 1;
  const up = ri + LRR; const sky = Math.max(regS[ri], regS[up]), blk = Math.max(regL[ri], regL[up]);
  const fl = F_SURF | 2 | (kind === SK_WATER ? F_WATER : kind === SK_LAVA ? (F_LAVA | F_EMIS) : F_SNOW);
  const tint = liqTint(kind, ri, ch, x, z); const ocean = tint > 0 && tint < 200;
  const M = N + 1; const hs = new Float32Array(M * M), gx = new Float32Array(M * M), gz = new Float32Array(M * M), cs = snow ? new Float32Array(M * M) : null;
  const o = _SO;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const uu = i / N, vv = j / N; surfBez(P, uu, vv, o); let h = o[0], dx = o[1], dz = o[2];
    if (snow) { const wx = bxw + x + uu, wz = bzw + z + vv; const e = 0.05; const n0 = snowUndul(wx, wz); h += n0; dx += (snowUndul(wx + e, wz) - n0) / e; dz += (snowUndul(wx, wz + e) - n0) / e; }
    if (snow && (i === 0 || i === N || j === 0 || j === N)) { // vértice en el borde: por encima de los escalones que tapa
      let top = -9; const xs = i === 0 ? [-1, 0] : i === N ? [0, 1] : [0], zs = j === 0 ? [-1, 0] : j === N ? [0, 1] : [0];
      for (const a of xs) for (const b of zs) { const t2 = snowStepTop(ri + a + b * LR); if (t2 > top) top = t2; }
      if (top > -9 && h < top + 0.05) h = top + 0.05;
    }
    const k = j * M + i; hs[k] = h; gx[k] = dx; gz[k] = dz;
  }
  if (pressed) { // hundimiento de las huellas (media de las subceldas que tocan el vértice) y un reborde levantado alrededor
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const k = j * M + i; const gx8 = x * 8 + Math.round(i / N * 8), gz8 = z * 8 + Math.round(j / N * 8);
      let c = 0, wsum = 0, ring = 0; for (let b = -2; b <= 1; b++) for (let a = -2; a <= 1; a++) { const inner = a >= -1 && a <= 0 && b >= -1 && b <= 0; const v = snowCompAt(gx8 + a, gz8 + b); const wg = inner ? 1 : 0.3; c += v * wg; wsum += wg; if (!inner) ring = Math.max(ring, v); }
      c /= wsum; const lim = Math.max(0, hs[k] - 0.02); hs[k] -= Math.min(c, lim); hs[k] += Math.max(0, ring * 0.5 - c) * 0.18; cs[k] = Math.min(1, c / Math.max(0.05, lim));
    }
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) { const k = j * M + i; const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N, j + 1); gx[k] = (hs[j * M + i1] - hs[j * M + i0]) / ((i1 - i0) / N); gz[k] = (hs[j1 * M + i] - hs[j0 * M + i]) / ((j1 - j0) / N); }
  }
  B.ensure(M * M, N * N * 6); const base = B.nv;
  let depth = 3; if (kind === SK_WATER) { let n = 0, j2 = ri - LRR; while (n < 14 && isLiqB(regB[j2], 1)) { n++; j2 -= LRR; } depth = Math.min(15, n + hs[0]); }
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const k = j * M + i; const l = Math.hypot(gx[k], 1, gz[k]); const nx = -gx[k] / l, nz = -gz[k] / l;
    // flujo: cuesta abajo según la pendiente (agua y lava); el océano no fluye (tiene oleaje)
    let flow = kind === SK_SNOW || ocean ? surfFlow(0, 0) : surfFlow(-gx[k] * 40, -gz[k] * 40);
    if (kind === SK_WATER && (i === 0 || i === N) && (j === 0 || j === N)) { // esquina: fracción de celdas de mar alrededor → cuánto oleaje lleva
      let oc = 0, wn = 0; for (let b = (j ? 0 : -1); b <= (j ? 1 : 0); b++) for (let a = (i ? 0 : -1); a <= (i ? 1 : 0); a++) { const c = ri + a + b * LR; const bb = regB[c]; if (isLiqB(bb, 1)) { wn++; const dd = REG[bb]; if (dd.inWater ? ocean : (regM[c] & LIQ_OCEAN)) oc++; } }
      if (oc > 0 && oc < wn) flow = 16384 | Math.round(oc / wn * 255); else if (oc > 0) flow = 16384 | 255;
    } else if (ocean) flow = 16384 | 255;
    const L = surfLight(ri, i / N, j / N);
    B.v(x + i / N, y + hs[k], z + j / N, nx * 0.5 + 0.5, nz * 0.5 + 0.5, flow, fl, L[0], L[1], snow ? 3 - cs[k] * 1.5 : kind === SK_WATER ? depth / 5 : 3, tint);
  }
  const I = B.idx; let q = B.ni;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = base + j * M + i, b = a + 1, c = a + M + 1, d = a + M; I[q++] = d; I[q++] = c; I[q++] = b; I[q++] = d; I[q++] = b; I[q++] = a; }
  B.ni = q;
  if (snow || kind === SK_LAVA) emitSurfSides(B, kind, x, y, z, ri, P, N, fl, sky, blk, tint, hs);
  else emitLiquidSides(B, kind, x, y, z, ri, ch, P, N, tint);
}
// lados de una superficie de nieve o lava: donde el borde queda en el aire (bajada, borde libre) se baja hasta la base
// de la celda con un perfil redondeado (la lava además abomba hacia fuera, como un frente de colada)
function emitSnowSkirt(B, x, y, z, P, N, hs, s, fl, sky, blk, tint) {
  const [nx, nz, x0, z0, ex, ez] = SIDES4[s]; const o = _SO; const M = N + 1;
  B.ensure((N + 1) * 2, N * 12); const base = B.nv;
  for (let i = 0; i <= N; i++) {
    const t = i / N; const uu = x0 + ex * t, vv = z0 + ez * t; surfBez(P, uu, vv, o); const top = hs[Math.round(vv * N) * M + Math.round(uu * N)];
    const l = Math.hypot(o[1], 1, o[2]); const nu = -o[1] / l * 0.5 + 0.5, nv = -o[2] / l * 0.5 + 0.5;
    B.v(x + uu, y + top - 0.4, z + vv, nu, nv, surfFlow(0, 0), fl, sky, blk, 3, tint);
    B.v(x + uu, y + top, z + vv, nu, nv, surfFlow(0, 0), fl, sky, blk, 3, tint);
  }
  const I = B.idx; let q = B.ni; // las dos caras: la rendija puede verse desde cualquier lado
  for (let i = 0; i < N; i++) { const a = base + i * 2, b2 = a + 1, c = a + 3, d = a + 2; I[q++] = a; I[q++] = c; I[q++] = d; I[q++] = a; I[q++] = b2; I[q++] = c; I[q++] = a; I[q++] = d; I[q++] = c; I[q++] = a; I[q++] = c; I[q++] = b2; }
  B.ni = q;
}
const SIDES4 = [[1, 0, 1, 0, 0, 1], [-1, 0, 0, 0, 0, 1], [0, 1, 0, 1, 1, 0], [0, -1, 0, 0, 1, 0]]; // [nx, nz, x0, z0, dx, dz] del borde
function emitSurfSides(B, kind, x, y, z, ri, P, N, fl, sky, blk, tint, hs) {
  const o = _SO; const M = N + 1;
  for (let s = 0; s < 4; s++) {
    const [nx, nz, x0, z0, ex, ez] = SIDES4[s]; const j = ri + nx + nz * LR; const b = regB[j];
    if (T_FULL[b]) continue;
    if (kind === SK_SNOW) {
      if (snowLevel(j) > -9) continue; // la nieve vecina continúa la superficie al mismo nivel
      // la vecina sigue un nivel más abajo: cada celda calcula las esquinas en su propio marco y en los rincones entre tres niveles
      // pueden no coincidir; un faldón vertical bajo el borde de la celda de arriba tapa esas rendijas
      if (airLike(b) && snowLevel(j - LRR) > -9) { emitSnowSkirt(B, x, y, z, P, N, hs, s, fl, Math.max(sky, regS[j]), Math.max(blk, regL[j]), tint); continue; }
    }
    else { if (isLiqB(b, kind)) continue; if (airLike(b) && isLiqB(regB[j - LRR], kind)) continue; }
    const sk = Math.max(sky, regS[j]), bl = Math.max(blk, regL[j]);
    const bulge = kind === SK_LAVA ? 0.07 : 0.0; const R = 3; // filas: base, medio, borde
    B.ensure((N + 1) * (R + 1), N * R * 6); const base = B.nv;
    for (let i = 0; i <= N; i++) {
      const t = i / N; const uu = x0 + ex * t, vv = z0 + ez * t; surfBez(P, uu, vv, o);
      // la arista de arriba es la misma que la de la superficie (con ondulación, escalones y pisadas): sin rendija entre lado y manto
      const top = Math.max(0.02, hs ? hs[Math.round(vv * N) * M + Math.round(uu * N)] : o[0]);
      // normal de la superficie en el borde (para fundir el sombreado del lado con el de arriba)
      const l = Math.hypot(o[1], 1, o[2]); const snx = -o[1] / l, snz = -o[2] / l;
      for (let r = 0; r <= R; r++) {
        const f = r / R; const a = f * Math.PI * 0.5; // perfil de cuarto de elipse: abajo vertical, arriba se curva hacia la superficie
        // la base entra un poco en el suelo: sin parpadeo con la cara de arriba del bloque
        const hh = r === 0 ? -0.03 : top * Math.sin(a); const out = bulge * Math.cos(a) * Math.sin(a) * 2 + (kind === SK_SNOW ? 0.015 * Math.cos(a) : 0);
        const wn = Math.sin(a); let vx = nx * (1 - wn) + snx * wn, vz = nz * (1 - wn) + snz * wn; const vl = Math.hypot(vx, vz); if (vl > 1) { vx /= vl; vz /= vl; }
        B.v(x + uu + nx * out, y + hh, z + vv + nz * out, clamp(vx * 0.5 + 0.5, 0, 1), clamp(vz * 0.5 + 0.5, 0, 1), surfFlow(0, 0), fl, sk, bl, 3, tint);
      }
    }
    const I = B.idx; let q = B.ni; // orientación hacia fuera (la lava y la nieve se dibujan con culling)
    for (let i = 0; i < N; i++) for (let r = 0; r < R; r++) { const a = base + i * (R + 1) + r, b2 = a + 1, c = a + R + 2, d = a + R + 1;
      if (s === 0 || s === 3) { I[q++] = a; I[q++] = c; I[q++] = d; I[q++] = a; I[q++] = b2; I[q++] = c; } else { I[q++] = a; I[q++] = d; I[q++] = c; I[q++] = a; I[q++] = c; I[q++] = b2; } }
    B.ni = q;
  }
}
// lados del agua: solo contra sólidos transparentes (cristal, vallas...) o en bordes libres (caída), siguiendo la curva de la superficie
function emitLiquidSides(B, kind, x, y, z, ri, ch, P, N, tint) {
  const sky = regS[ri], blk = regL[ri]; const fl = (kind === SK_WATER ? F_WATER : (F_LAVA | F_EMIS));
  if (tint === undefined) tint = liqTint(kind, ri, ch, x, z);
  const o = _SO; const full = !P;
  for (let s = 0; s < 4; s++) {
    const [nx, nz, x0, z0, ex, ez] = SIDES4[s]; const j = ri + nx + nz * LR; const b = regB[j];
    if (T_FULL[b] || isLiqB(b, kind)) continue;
    if (full && airLike(b)) continue; // bajo la superficie, junto al aire: el agua de al lado ya cae
    if (airLike(b) && isLiqB(regB[j - LRR], kind) && !liqFall(j - LRR)) continue; // continúa en el nivel de abajo (rampa)
    const sk = Math.max(sky, regS[j]), bl = Math.max(blk, regL[j]); const n = full ? 1 : N;
    B.ensure((n + 1) * 2, n * 6); const base = B.nv; const face = s === 0 ? 0 : s === 1 ? 1 : s === 2 ? 4 : 5;
    for (let i = 0; i <= n; i++) { const t = i / n; const uu = x0 + ex * t, vv = z0 + ez * t; let top = 1; if (!full) { surfBez(P, uu, vv, o); top = Math.max(0.01, o[0]); }
      B.v(x + uu, y, z + vv, uu, 1, 0, fl | face, sk, bl, 3, tint); B.v(x + uu, y + top, z + vv, uu, 1 - Math.min(1, top), 0, fl | face, sk, bl, 3, tint); }
    const I = B.idx; let q = B.ni;
    for (let i = 0; i < n; i++) { const a = base + i * 2, b2 = a + 1, c = a + 3, d = a + 2; if (s === 0 || s === 3) { I[q++] = a; I[q++] = c; I[q++] = d; I[q++] = a; I[q++] = b2; I[q++] = c; } else { I[q++] = a; I[q++] = d; I[q++] = c; I[q++] = a; I[q++] = c; I[q++] = b2; } }
    B.ni = q;
  }
}
// chorro que cae: tubo redondeado y continuo (no un cubo), que nace inclinado desde el borde de la fuente y entra en la poza de abajo
function emitFall(B, kind, x, y, z, ri, ch) {
  const amt = liqAmt(regM[ri]); let drop = 0; { let j2 = ri + LRR; while (drop < 14 && liqFall(j2)) { drop++; j2 += LRR; } }
  const r0 = amt <= 3 ? 0.16 : amt <= 6 ? 0.25 : 0.34; const r = r0 * Math.pow(1 + drop * 1.6, -0.25); const S = MESH_QUALITY >= 2 ? 10 : MESH_QUALITY >= 1 ? 6 : 4;
  const dn = ri - LRR, up = ri + LRR;
  let y0 = 0, y1 = 1;
  if (isLiqB(regB[dn], kind) && !liqFall(dn)) y0 = liqTopH(dn) - 1 - 0.06; // entra en la superficie de la poza
  if (isLiqB(regB[up], kind) && !liqFall(up)) y1 = 1 + liqTopH(up) * 0.6; // nace de una fuente justo encima
  // desplazar la parte de arriba hacia la fuente lateral (el agua sale por el borde)
  let ox = 0, oz = 0; if (!isLiqB(regB[up], kind)) { for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = ri + dx + dz * LR; if (isLiqB(regB[j], kind) && !liqFall(j)) { ox += dx * 0.32; oz += dz * 0.32; } } }
  const upFall = isLiqB(regB[up], kind) && liqFall(up); const topR = upFall ? r : r * 0.85;
  const sky = Math.max(regS[ri], regS[up]), blk = regL[ri]; const fl = F_SURF | 0 | (kind === SK_WATER ? F_WATER : (F_LAVA | F_EMIS)); const tint = kind === SK_WATER ? 201 : 0;
  // chorros contiguos (una orilla larga que se vacía): la sección se estira hacia el vecino y se convierte en una cortina continua
  const st = [liqFall(ri + 1), liqFall(ri - 1), liqFall(ri + LR), liqFall(ri - LR)];
  const curtX = st[0] || st[1], curtZ = st[2] || st[3]; const S2 = (curtX || curtZ) && MESH_QUALITY >= 1 ? S + 4 : S;
  const Rw = 3; B.ensure((S2 + 1) * (Rw + 1), S2 * Rw * 6); const base = B.nv;
  for (let k = 0; k <= S2; k++) {
    const a = k / S2 * Math.PI * 2; const ca = Math.cos(a), sa = Math.sin(a);
    for (let rr = 0; rr <= Rw; rr++) {
      const f = rr / Rw; const yy = y0 + (y1 - y0) * f; const tf = f * f; const cx = 0.5 + ox * tf, cz = 0.5 + oz * tf; const rad = r + (topR - r) * f;
      // semiejes por cuadrante: hasta el borde de la celda si hay chorro al lado (cortina), más fina en perpendicular
      const hx = ca > 0 ? (st[0] ? 0.53 : rad) : (st[1] ? 0.53 : rad), hz = sa > 0 ? (st[2] ? 0.53 : rad) : (st[3] ? 0.53 : rad);
      const thin = (curtX && !curtZ) ? [1, 0.7] : (curtZ && !curtX) ? [0.7, 1] : [1, 1];
      const ex = hx * (curtZ && !st[ca > 0 ? 0 : 1] ? thin[0] : 1), ez = hz * (curtX && !st[sa > 0 ? 2 : 3] ? thin[1] : 1);
      const nl = Math.hypot(ca / Math.max(ex, 0.05), sa / Math.max(ez, 0.05)) || 1; const nx = ca / Math.max(ex, 0.05) / nl, nz = sa / Math.max(ez, 0.05) / nl;
      B.v(x + cx + ca * ex, y + yy, z + cz + sa * ez, nx * 0.5 + 0.5, nz * 0.5 + 0.5, surfFlow(0, 0), fl, sky, blk, Math.min(15, drop + f) / 5, tint);
    }
  }
  const I = B.idx; let q = B.ni;
  for (let k = 0; k < S2; k++) for (let rr = 0; rr < Rw; rr++) { const a = base + k * (Rw + 1) + rr, b = a + 1, c = a + Rw + 2, d = a + Rw + 1; I[q++] = a; I[q++] = b; I[q++] = c; I[q++] = a; I[q++] = c; I[q++] = d; }
  B.ni = q;
}
// profundidad pisada (bloques) en la subcelda (gx,gz) del chunk, en unidades de 1/8 de bloque (puede salir 1 columna fuera)
function snowCompAt(gx, gz) { if (!regSC) return 0; const lx = (gx >> 3) + 1, lz = (gz >> 3) + 1; if (lx < 0 || lz < 0 || lx > 17 || lz > 17) return 0; return regSC[(lz * 18 + lx) * 64 + (gz & 7) * 8 + (gx & 7)] / 64; }
