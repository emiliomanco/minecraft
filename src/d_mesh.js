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
function buildRegion(world, ch) {
  const H = world.H; const size = LRR * (H + 2);
  if (!regB || regH !== H) { regB = new Uint16Array(size); regM = new Uint8Array(size); regS = new Uint8Array(size); regL = new Uint8Array(size); regH = H; }
  regB.fill(B_PAD); regM.fill(0);
  const bx = ch.cx * 16 - LP - 1, bz = ch.cz * 16 - LP - 1;
  for (let lz = 1; lz < LR - 1; lz++) {
    const wz = bz + lz; const ccz = wz >> 4;
    for (let lx = 1; lx < LR - 1; lx++) {
      const wx = bx + lx; const c = world.chunk(wx >> 4, ccz); if (!c) continue;
      const base = (wx & 15) | ((wz & 15) << 4); const cb = c.blocks, cm = c.meta;
      let ri = (LR + lz) * LR + lx; const near = lx >= LP && lx <= LP + 17 && lz >= LP && lz <= LP + 17;
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
  v(x, y, z, u, v, layer, flags, sky, blk, ao, tint) {
    const n = this.nv++; this.pos[n * 3] = x; this.pos[n * 3 + 1] = y; this.pos[n * 3 + 2] = z;
    this.tex[n * 4] = u * 256; this.tex[n * 4 + 1] = v * 256; this.tex[n * 4 + 2] = layer; this.tex[n * 4 + 3] = flags;
    this.lit[n * 4] = sky * 17; this.lit[n * 4 + 1] = blk * 17; this.lit[n * 4 + 2] = ao * 85; this.lit[n * 4 + 3] = tint;
  }
  quad(flip) { const b = this.nv - 4; const I = this.idx; let k = this.ni; if (!flip) { I[k++] = b; I[k++] = b + 1; I[k++] = b + 2; I[k++] = b; I[k++] = b + 2; I[k++] = b + 3; } else { I[k++] = b + 1; I[k++] = b + 2; I[k++] = b + 3; I[k++] = b + 1; I[k++] = b + 3; I[k++] = b; } this.ni = k; }
  quad2() { this.quad(false); const b = this.nv - 4; const I = this.idx; let k = this.ni; I[k++] = b; I[k++] = b + 2; I[k++] = b + 1; I[k++] = b; I[k++] = b + 3; I[k++] = b + 2; this.ni = k; }
  out() { return { pos: this.pos.slice(0, this.nv * 3), tex: this.tex.slice(0, this.nv * 4), lit: this.lit.slice(0, this.nv * 4), idx: this.idx.slice(0, this.ni), count: this.ni }; }
}
const MB_O = new MeshBuf(), MB_T = new MeshBuf(), MB_W = new MeshBuf();
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
function liquidHeight(ri, liq) {
  const b = regB[ri]; const d = REG[b];
  const isL = (d && d.liquid === liq) || (liq === 1 && d && d.inWater);
  if (!isL) return -1;
  const up = regB[ri + LRR]; const du = REG[up]; if (du && (du.liquid === liq || (liq === 1 && du.inWater))) return 1;
  if (d.inWater) return 0.89;
  const m = regM[ri]; if (m & 8) return 0.89; return (8 - (m & 7)) / 9;
}
function buildMesh(world, ch) { buildRegion(world, ch); return meshRegion(world, ch); }
function meshRegion(world, ch) {
  computeLight(world, ch);
  const O = MB_O, T = MB_T; O.reset(); T.reset(); MB_W.reset();
  const H = world.H; const top = Math.min(H - 1, ch.top + 1);
  const fancy = MESH_QUALITY >= 1;
  const bxw = ch.cx * 16, bzw = ch.cz * 16; const EM = [];
  for (let y = 0; y <= top; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const ri = ((y + 1) * LR + z + LP + 1) * LR + x + LP + 1; const id = regB[ri]; if (!id) continue;
    const d = REG[id]; if (!d || d.render === 'none') continue;
    const meta = regM[ri];
    if (d.light >= 10 && EM.length < 400 && (d.render !== 'cube' || d.liquid || id === ID.magma_block) && (!d.liquid || regB[ri + LRR] === 0)) EM.push(bxw + x, y, bzw + z, id);
    if (d.render === 'cube') {
      const B = d.trans === 2 ? T : O; let flags = 0;
      if (d.trans === 1) flags |= F_CUT; if (d.wave === 1 && fancy) flags |= F_LEAF; if (d.leaves || d.wave) flags |= F_FOLI;
      if (d.emissive) flags |= F_EMIS; if (d.portal === 1) flags |= F_PORTAL; if (d.endPortal) flags |= F_ENDP; if (d.trans === 2) flags |= F_GLASS;
      for (let f = 0; f < 6; f++) {
        const F = FACE[f]; const nri = ri + F.n[0] + F.n[1] * LRR + F.n[2] * LR; const nb = regB[nri];
        if (T_FULL[nb]) continue;
        if (nb === id && (d.cullSelf || (!fancy && d.leaves))) continue;
        const nd = REG[nb]; if (nd && d.trans === 2 && nd.trans === 2 && d.cullSelf && nd.cullSelf && nb !== id && d.portal) continue;
        const layer = faceLayer(d, f, meta); emitFace(B, f, x, y, z, ri, nri, layer, flags, tintFor(d, f, ch, x, z), d.log && meta ? 1 : 0, 0, 1, null);
      }
    } else if (d.render === 'cross' || d.render === 'fire') {
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
      if (d.inWater) emitLiquid(MB_W, x, y, z, ri, 1, ch, meta);
    } else if (d.render === 'box') {
      emitBox(d, x, y, z, ri, meta, ch);
    } else if (d.render === 'shape') {
      const boxes = shapeBoxes(d, meta, (dx, dz) => regB[ri + dx + dz * LR]); const lay = d.shape === 'door' && (meta & 8) ? d.layerTop : undefined;
      for (const b of boxes) emitBox(d, x, y, z, ri, meta, ch, b, lay);
    } else if (d.render === 'liquid') {
      emitLiquid(d.liquid === 1 ? MB_W : O, x, y, z, ri, d.liquid, ch, meta);
    } else if (d.render === 'snow') {
      emitSnow(O, x, y, z, ri, meta, ch, bxw, bzw);
    }
  }
  ch.emitters = EM;
  return { o: O.out(), t: T.out(), w: MB_W.out() };
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
function emitLiquid(B, x, y, z, ri, liq, ch, meta) {
  const sky = regS[ri], blk = regL[ri];
  const own = liquidHeight(ri, liq) < 0 ? 0.89 : liquidHeight(ri, liq);
  const corner = (dx, dz) => { // dx,dz in {0,1}
    let s = 0, n = 0; for (let a = -1; a <= 0; a++) for (let b = -1; b <= 0; b++) {
      const j = ri + (dx + a) + (dz + b) * LR; const h = liquidHeight(j, liq);
      if (h >= 1) return 1; if (h >= 0) { s += h * (h > 0.85 ? 3 : 1); n += (h > 0.85 ? 3 : 1); } else { const bb = regB[j]; if (!T_FULL[bb]) { n += 0.25; } }
    } return n ? s / n : own;
  };
  const h00 = corner(0, 0), h10 = corner(1, 0), h11 = corner(1, 1), h01 = corner(0, 1);
  const layer = liq === 1 ? TEX.water : TEX.lava; const flags = liq === 1 ? F_WATER : (F_LAVA | F_EMIS);
  const tint = liq === 1 ? 1 + ch.biomes[x | z << 4] : 0;
  const isSame = j => { const b = regB[j]; const d = REG[b]; return d && (d.liquid === liq || (liq === 1 && d.inWater)); };
  const up = ri + LRR;
  B.grow();
  if (!isSame(up)) { // superficie
    const sk = Math.max(sky, regS[up]), bl = Math.max(blk, regL[up]);
    B.v(x, y + h01, z + 1, 0, 1, layer, flags | 2, sk, bl, 3, tint); B.v(x + 1, y + h11, z + 1, 1, 1, layer, flags | 2, sk, bl, 3, tint);
    B.v(x + 1, y + h10, z, 1, 0, layer, flags | 2, sk, bl, 3, tint); B.v(x, y + h00, z, 0, 0, layer, flags | 2, sk, bl, 3, tint);
    B.quad(false); if (liq === 1) { B.grow(); B.v(x, y + h00, z, 0, 0, layer, flags | 3, sk, bl, 3, tint); B.v(x + 1, y + h10, z, 1, 0, layer, flags | 3, sk, bl, 3, tint); B.v(x + 1, y + h11, z + 1, 1, 1, layer, flags | 3, sk, bl, 3, tint); B.v(x, y + h01, z + 1, 0, 1, layer, flags | 3, sk, bl, 3, tint); B.quad(false); }
  }
  const sides = [[0, 1, h11, h10, [1, 1], [1, 0]], [1, -1, h00, h01, [0, 0], [0, 1]], [4, LR, h01, h11, [0, 1], [1, 1]], [5, -LR, h10, h00, [1, 0], [0, 0]]];
  for (const [f, off, ha, hb, ca, cb] of sides) {
    const j = ri + off; if (isSame(j) || T_FULL[regB[j]]) continue;
    B.grow(); const sk = Math.max(sky, regS[j]), bl = Math.max(blk, regL[j]);
    B.v(x + ca[0], y, z + ca[1], 0, 1, layer, flags | f, sk, bl, 3, tint); B.v(x + cb[0], y, z + cb[1], 1, 1, layer, flags | f, sk, bl, 3, tint);
    B.v(x + cb[0], y + hb, z + cb[1], 1, 1 - hb, layer, flags | f, sk, bl, 3, tint); B.v(x + ca[0], y + ha, z + ca[1], 0, 1 - ha, layer, flags | f, sk, bl, 3, tint);
    B.quad(false);
  }
  const dn = ri - LRR; if (!isSame(dn) && !T_FULL[regB[dn]]) { B.grow(); B.v(x, y + 0.001, z, 0, 0, layer, flags | 3, sky, blk, 3, tint); B.v(x + 1, y + 0.001, z, 1, 0, layer, flags | 3, sky, blk, 3, tint); B.v(x + 1, y + 0.001, z + 1, 1, 1, layer, flags | 3, sky, blk, 3, tint); B.v(x, y + 0.001, z + 1, 0, 1, layer, flags | 3, sky, blk, 3, tint); B.quad(false); }
}
// nieve suave: superficie subdividida e interpolada entre vecinos
function snowH(ri) { const b = regB[ri]; if (b === ID.snow) return Math.max(1, regM[ri]) / 8; if (T_FULL[b]) return 1.0; return -1; }
function emitSnow(B, x, y, z, ri, meta, ch, bxw, bzw) {
  const own = Math.max(1, meta) / 8;
  const sh = (dx, dz) => { const h = snowH(ri + dx + dz * LR); if (h < 0) { const below = regB[ri + dx + dz * LR - LRR]; return T_FULL[below] ? 0.02 : 0; } return h; };
  const g = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    let s = 0, n = 0; const cx = i - 1, cz = j - 1;
    if (cx === 0 && cz === 0) { g.push(own); continue; }
    const xs = cx === 0 ? [0] : [0, cx], zs = cz === 0 ? [0] : [0, cz];
    for (const a of xs) for (const b of zs) { const h = (a === 0 && b === 0) ? own : sh(a, b); s += h; n++; }
    g.push(Math.min(1, s / n));
  }
  const sub = MESH_QUALITY >= 2 ? 4 : MESH_QUALITY >= 1 ? 2 : 1;
  const hAt = (u, v) => { // u,v en [0,1]
    const fx = u * 2, fz = v * 2; const ix = Math.min(1, fx | 0), iz = Math.min(1, fz | 0); const tx = fx - ix, tz = fz - iz;
    const a = g[iz * 3 + ix], b = g[iz * 3 + ix + 1], c = g[(iz + 1) * 3 + ix], d = g[(iz + 1) * 3 + ix + 1];
    let h = lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
    const wx = bxw + x + u, wz = bzw + z + v; h += (Math.sin(wx * 2.1 + wz * 0.7) * Math.cos(wz * 1.7 - wx * 0.4)) * 0.035 * Math.min(1, h * 4);
    return Math.max(0.01, h);
  };
  const up = ri + LRR; const sky = Math.max(regS[ri], regS[up]), blk = Math.max(regL[ri], regL[up]); const layer = TEX.snow; const fl = F_SNOW;
  for (let j = 0; j < sub; j++) for (let i = 0; i < sub; i++) {
    const u0 = i / sub, u1 = (i + 1) / sub, v0 = j / sub, v1 = (j + 1) / sub; B.grow();
    B.v(x + u0, y + hAt(u0, v1), z + v1, u0, v1, layer, fl | 2, sky, blk, 3, 0); B.v(x + u1, y + hAt(u1, v1), z + v1, u1, v1, layer, fl | 2, sky, blk, 3, 0);
    B.v(x + u1, y + hAt(u1, v0), z + v0, u1, v0, layer, fl | 2, sky, blk, 3, 0); B.v(x + u0, y + hAt(u0, v0), z + v0, u0, v0, layer, fl | 2, sky, blk, 3, 0);
    B.quad(false);
  }
  // laterales donde no hay vecino
  const sides = [[0, 1, [1, 1], [1, 0]], [1, -1, [0, 0], [0, 1]], [4, LR, [0, 1], [1, 1]], [5, -LR, [1, 0], [0, 0]]];
  for (const [f, off, ca, cb] of sides) {
    const j = ri + off; if (T_FULL[regB[j]] || regB[j] === ID.snow) continue;
    const ha = hAt(ca[0], ca[1]), hb = hAt(cb[0], cb[1]); B.grow();
    B.v(x + ca[0], y, z + ca[1], 0, 1, layer, fl | f, sky, blk, 2, 0); B.v(x + cb[0], y, z + cb[1], 1, 1, layer, fl | f, sky, blk, 2, 0);
    B.v(x + cb[0], y + hb, z + cb[1], 1, 1 - hb, layer, fl | f, sky, blk, 3, 0); B.v(x + ca[0], y + ha, z + ca[1], 0, 1 - ha, layer, fl | f, sky, blk, 3, 0);
    B.quad(false);
  }
}
