// ============================================================================
//  Pieles de las entidades
//  Un atlas de 1024×1024 con una piel por mob (64×64, o más grande para los mobs enormes), pintada por código como
//  pixel art. Cada caja del modelo (w×h×d píxeles) toma sus seis caras de la piel con la distribución clásica:
//  arriba y abajo en la primera fila; derecha, frente, izquierda y detrás en la segunda. Así cada cara tiene su
//  dibujo a su resolución real (antes cada cara era una textura de bloque de 16×16 estirada).
// ============================================================================
const SKIN = { W: 1024, H: 1024, data: null, slots: {}, cx: 0, cy: 0, rowH: 0, tex: null, gl: null, ver: 0, upVer: -1 };
function skinAlloc(name, w, h) { // estanterías: de izquierda a derecha, filas de la altura del más alto
  if (SKIN.slots[name]) return SKIN.slots[name];
  if (!SKIN.data) SKIN.data = new Uint8ClampedArray(SKIN.W * SKIN.H * 4);
  if (SKIN.cx + w > SKIN.W) { SKIN.cx = 0; SKIN.cy += SKIN.rowH; SKIN.rowH = 0; }
  const s = { name, x: SKIN.cx, y: SKIN.cy, w, h }; SKIN.cx += w; SKIN.rowH = Math.max(SKIN.rowH, h); SKIN.slots[name] = s; SKIN.ver++; return s;
}
// regiones [x, y, w, h] de las caras de una caja con origen (u, v), en el orden de las caras del cubo:
// 0 +x (derecha del mob), 1 −x (izquierda), 2 arriba, 3 abajo, 4 +z (detrás), 5 −z (frente; los mobs miran a −z)
function boxRegions(u, v, w, h, d) { return [[u, v + d, d, h], [u + d + w, v + d, d, h], [u + d, v, w, d], [u + d + w, v, w, d], [u + 2 * d + w, v + d, w, h], [u + d, v + d, w, h]]; }
const SK_FACE = { right: 0, left: 1, top: 2, bottom: 3, back: 4, front: 5 };
const shd = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
class SkinP {
  constructor(name, w = 64, h = 64) { this.s = skinAlloc(name, w, h); this.r = mulberry32(hashStr('skin:' + name)); this.name = name; }
  set(x, y, c, a) {
    x = Math.floor(x); y = Math.floor(y); const s = this.s; if (x < 0 || y < 0 || x >= s.w || y >= s.h) return;
    const i = ((s.y + y) * SKIN.W + s.x + x) * 4, D = SKIN.data; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = a ?? (c.length > 3 ? c[3] : 255);
  }
  get(x, y) { const s = this.s; const i = ((s.y + y) * SKIN.W + s.x + x) * 4, D = SKIN.data; return [D[i], D[i + 1], D[i + 2], D[i + 3]]; }
  // rectángulo con ruido de v niveles; sh oscurece hacia abajo (0..1)
  rect(x, y, w, h, c, v = 0, sh = 0) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = (this.r() - 0.5) * 2 * v, f = 1 - sh * (h > 1 ? j / (h - 1) : 0); this.set(x + i, y + j, [c[0] * f + k, c[1] * f + k, c[2] * f + k], c[3]); } }
  clear(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, [0, 0, 0], 0); }
  // manchas: n píxeles sueltos de otro color dentro de la región
  speck(x, y, w, h, c, n, v = 10) { for (let i = 0; i < n; i++) { const k = (this.r() - 0.5) * v; this.set(x + this.r() * w, y + this.r() * h, [c[0] + k, c[1] + k, c[2] + k]); } }
  // borrones: grupos de 2-5 píxeles
  blot(x, y, w, h, c, n, size = 3) { for (let i = 0; i < n; i++) { let px = x + Math.floor(this.r() * w), py = y + Math.floor(this.r() * h); for (let j = 0; j < size; j++) { if (px >= x && px < x + w && py >= y && py < y + h) this.set(px, py, c); if (this.r() < 0.5) px += this.r() < 0.5 ? -1 : 1; else py += this.r() < 0.5 ? -1 : 1; } } }
  // pinta una caja: spec.base (color), spec.v (ruido), spec.sh (sombra vertical en los lados) y, por cara, un color o
  // una función (P, x, y, w, h) que dibuja encima; spec.all se llama en todas las caras, spec.sides en las cuatro laterales
  box(u, v, w, h, d, spec = {}) {
    const R = boxRegions(u, v, w, h, d); const base = spec.base || [200, 200, 200]; const nv = spec.v ?? 8;
    for (const [name, f] of Object.entries(SK_FACE)) {
      const [x, y, fw, fh] = R[f]; const o = spec[name]; const side = f !== 2 && f !== 3;
      const col = Array.isArray(o) ? o : (side && Array.isArray(spec.sides) ? spec.sides : (f === 2 && spec.topC) || (f === 3 && spec.bottomC) || base);
      if (spec.clear) this.clear(x, y, fw, fh); else this.rect(x, y, fw, fh, col, nv, side ? (spec.sh ?? 0) : 0);
      if (typeof spec.all === 'function') spec.all(this, x, y, fw, fh, f);
      if (side && typeof spec.sides === 'function') spec.sides(this, x, y, fw, fh, f);
      if (typeof o === 'function') o(this, x, y, fw, fh, f);
    }
    return this;
  }
  // reserva sitio para una caja dentro de esta piel (estanterías); devuelve [u, v]
  alloc(w, h, d) { const rw = 2 * d + 2 * w, rh = d + h; this.ax = this.ax || 0; this.ay = this.ay || 0; this.arh = this.arh || 0;
    if (this.ax + rw > this.s.w) { this.ax = 0; this.ay += this.arh; this.arh = 0; }
    const uv = [this.ax, this.ay]; this.ax += rw; this.arh = Math.max(this.arh, rh); if (this.ay + rh > this.s.h) console.warn('piel llena', this.name); return uv; }
  // UV de la caja en el atlas (24 floats: x0,y0,x1,y1 por cara)
  uv(u, v, w, h, d) { const R = boxRegions(u, v, w, h, d); const o = new Float32Array(24); const e = 0.01, s = this.s;
    for (let f = 0; f < 6; f++) { const [x, y, fw, fh] = R[f]; o[f * 4] = (s.x + x + e) / SKIN.W; o[f * 4 + 1] = (s.y + y + e) / SKIN.H; o[f * 4 + 2] = (s.x + x + Math.max(fw, 0.02) - e) / SKIN.W; o[f * 4 + 3] = (s.y + y + Math.max(fh, 0.02) - e) / SKIN.H; }
    return o; }
  // pieza del modelo: tamaño s, pivote p, desplazamiento o (como part()), origen de la piel [u, v], papel r para la animación
  part(s, p, o, uv, r, k, extra) {
    const w = Math.ceil(s[0]), h = Math.ceil(s[1]), d = Math.ceil(s[2]);
    return Object.assign({ s, p, o, t: { uv: this.uv(uv[0], uv[1], w, h, d) }, r, k }, extra || {});
  }
  // pinta y crea la pieza a la vez
  bp(s, p, o, uv, r, spec, k, extra) { const w = Math.ceil(s[0]), h = Math.ceil(s[1]), d = Math.ceil(s[2]); if (!uv) uv = this.alloc(w, h, d); this.box(uv[0], uv[1], w, h, d, spec); return this.part(s, p, o, uv, r, k, extra); }
  // varias piezas iguales con la misma piel (patas, brazos): se pinta una vez
  same(s, list, spec) { const w = Math.ceil(s[0]), h = Math.ceil(s[1]), d = Math.ceil(s[2]); const uv = this.alloc(w, h, d); this.box(uv[0], uv[1], w, h, d, spec); return list.map(([p, o, r, k, extra]) => this.part(s, p, o, uv, r, k, extra)); }
}
// textura en la GPU (se sube la primera vez que se dibuja una pieza con piel, y otra vez si se pinta algo nuevo)
function skinBind(P) {
  const gl = R.gl; if (!SKIN.data) { SKIN.data = new Uint8ClampedArray(SKIN.W * SKIN.H * 4); }
  if (SKIN.gl !== gl || !SKIN.tex) { SKIN.gl = gl; SKIN.tex = gl.createTexture(); SKIN.upVer = -1; }
  gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, SKIN.tex);
  if (SKIN.upVer !== SKIN.ver) {
    SKIN.upVer = SKIN.ver; gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SKIN.W, SKIN.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(SKIN.data.buffer));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 2); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  if (P && P.u.u_skin) gl.uniform1i(P.u.u_skin, 13);
  gl.activeTexture(gl.TEXTURE0);
}
(R.restoreHooks = R.restoreHooks || []).push(() => { SKIN.tex = null; SKIN.gl = null; });

// cara f de una pieza con piel como lienzo 2D (vista previa del jugador en el inventario)
const SKIN_IMG = new Map();
function skinFaceCanvas(pt, f) {
  const k = pt.t.uv; const key = k[f * 4] + ',' + k[f * 4 + 1] + ',' + f; if (SKIN_IMG.has(key)) return SKIN_IMG.get(key);
  const x0 = Math.floor(k[f * 4] * SKIN.W), y0 = Math.floor(k[f * 4 + 1] * SKIN.H), x1 = Math.round(k[f * 4 + 2] * SKIN.W), y1 = Math.round(k[f * 4 + 3] * SKIN.H);
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); const im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((y0 + y) * SKIN.W + x0 + x) * 4, o = (y * w + x) * 4; for (let c = 0; c < 4; c++) im.data[o + c] = SKIN.data[i + c]; }
  g.putImageData(im, 0, 0); SKIN_IMG.set(key, cv); return cv;
}
// ---------------------------------------------------------------- piezas de dibujo comunes
const SKC = { black: [20, 20, 22], white: [235, 235, 235], eyeW: [240, 240, 240] };
// ojos 2×1 (blanco + pupila) en una cara frontal; pup: color de la pupila; inner: la pupila hacia dentro
function skEyes(P, x, y, w, ey, pup, opts = {}) {
  const gap = opts.gap ?? 2, ew = opts.w ?? 2; const lx = x + Math.floor((w - gap) / 2) - ew, rx = x + Math.ceil((w + gap) / 2);
  for (const [ex, inner] of [[lx, 1], [rx, 0]]) { for (let i = 0; i < ew; i++) P.set(ex + i, ey, opts.white || SKC.eyeW); P.set(ex + (inner ? ew - 1 : 0), ey, pup); if (opts.tall) for (let i = 0; i < ew; i++) P.set(ex + i, ey + 1, i === (inner ? ew - 1 : 0) ? pup : (opts.white || SKC.eyeW)); }
}
// pelo: tapa la parte de arriba de los lados y la frente
function skHair(P, x, y, w, h, f, c, front = 2, side = 3) { if (f === 2) P.rect(x, y, w, h, c, 8); else if (f === 5) { P.rect(x, y, w, front, c, 8); P.set(x, y + front, c); P.set(x + w - 1, y + front, c); } else if (f === 3) { } else P.rect(x, y, w, f === 4 ? h - 1 : side, c, 8); }
