'use strict';
// ============================================================================
//  MINECRAFT 2  —  núcleo: utilidades, ruido, matemáticas
// ============================================================================
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hash2(seed, x, z) { let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function hash3(seed, x, y, z) { let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 1442695041) ^ Math.imul(z, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function rngFor(seed, a, b, c) { return mulberry32((seed ^ Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul((c || 0) | 0, 83492791)) >>> 0); }

// ---------------------------------------------------------------- Simplex noise
class Noise {
  constructor(seed) {
    const r = mulberry32(seed >>> 0); const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512); this.pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.pm12[i] = this.perm[i] % 12; }
  }
  n2(xin, yin) {
    const F2 = 0.36602540378, G2 = 0.2113248654; const perm = this.perm, pm = this.pm12;
    const s = (xin + yin) * F2; const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2; const x0 = xin - i + t, y0 = yin - j + t;
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255; let n = 0, tt;
    tt = 0.5 - x0 * x0 - y0 * y0; if (tt > 0) { const g = pm[ii + perm[jj]]; tt *= tt; n += tt * tt * (G3[g * 3] * x0 + G3[g * 3 + 1] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1; if (tt > 0) { const g = pm[ii + i1 + perm[jj + j1]]; tt *= tt; n += tt * tt * (G3[g * 3] * x1 + G3[g * 3 + 1] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2; if (tt > 0) { const g = pm[ii + 1 + perm[jj + 1]]; tt *= tt; n += tt * tt * (G3[g * 3] * x2 + G3[g * 3 + 1] * y2); }
    return 70 * n;
  }
  n3(xin, yin, zin) {
    const F3 = 1 / 3, G = 1 / 6; const perm = this.perm, pm = this.pm12;
    const s = (xin + yin + zin) * F3; const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G; const x0 = xin - i + t, y0 = yin - j + t, z0 = zin - k + t;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) { if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
    else { if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } }
    const x1 = x0 - i1 + G, y1 = y0 - j1 + G, z1 = z0 - k1 + G;
    const x2 = x0 - i2 + 2 * G, y2 = y0 - j2 + 2 * G, z2 = z0 - k2 + 2 * G;
    const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
    const ii = i & 255, jj = j & 255, kk = k & 255; let n = 0, tt, g;
    tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0; if (tt > 0) { g = pm[ii + perm[jj + perm[kk]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x0 + G3[g + 1] * y0 + G3[g + 2] * z0); }
    tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1; if (tt > 0) { g = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x1 + G3[g + 1] * y1 + G3[g + 2] * z1); }
    tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2; if (tt > 0) { g = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x2 + G3[g + 1] * y2 + G3[g + 2] * z2); }
    tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3; if (tt > 0) { g = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x3 + G3[g + 1] * y3 + G3[g + 2] * z3); }
    return 32 * n;
  }
  fbm2(x, z, oct, lac = 2, gain = 0.5) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * this.n2(x * f, z * f); n += a; a *= gain; f *= lac; } return s / n; }
  fbm3(x, y, z, oct) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * this.n3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2; } return s / n; }
}
const G3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);

// ---------------------------------------------------------------- mat4
const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  ident(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(o, a, b) {
    const r = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; r[i * 4 + j] = s; }
    o.set(r); return o;
  },
  persp(o, fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); o.fill(0); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
  ortho(o, l, r, b, t, n, f) { o.fill(0); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o; },
  lookAt(o, e, c, up) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0; o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0; o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); o[15] = 1; return o;
  },
  translate(m, x, y, z) { m[12] += m[0] * x + m[4] * y + m[8] * z; m[13] += m[1] * x + m[5] * y + m[9] * z; m[14] += m[2] * x + m[6] * y + m[10] * z; m[15] += m[3] * x + m[7] * y + m[11] * z; return m; },
  scale(m, x, y, z) { for (let i = 0; i < 4; i++) { m[i] *= x; m[4 + i] *= y; m[8 + i] *= z; } return m; },
  rotX(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 4; i++) { const y = m[4 + i], z = m[8 + i]; m[4 + i] = y * c + z * s; m[8 + i] = z * c - y * s; } return m; },
  rotY(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 4; i++) { const x = m[i], z = m[8 + i]; m[i] = x * c - z * s; m[8 + i] = x * s + z * c; } return m; },
  rotZ(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 4; i++) { const x = m[i], y = m[4 + i]; m[i] = x * c + y * s; m[4 + i] = y * c - x * s; } return m; },
  invert(o, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return null; det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det; return o;
  },
  xform(m, x, y, z) { const w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w]; }
};

// ---------------------------------------------------------------- base64 / RLE
function u8ToB64(u8) { let s = ''; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
function b64ToU8(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function rleEncode(arr) {
  const wide = arr instanceof Uint16Array; const out = []; let i = 0; const n = arr.length;
  while (i < n) { const v = arr[i]; let c = 1; while (i + c < n && arr[i + c] === v && c < 255) c++; if (wide) out.push(c, v & 255, v >> 8); else out.push(c, v); i += c; }
  return (wide ? 'W' : '') + u8ToB64(new Uint8Array(out));
}
function rleDecode(b64, len, wide) {
  const W = b64[0] === 'W'; const d = b64ToU8(W ? b64.slice(1) : b64); const out = wide ? new Uint16Array(len) : new Uint8Array(len); let p = 0;
  if (W) { for (let i = 0; i < d.length; i += 3) { out.fill(d[i + 1] | (d[i + 2] << 8), p, p + d[i]); p += d[i]; } }
  else for (let i = 0; i < d.length; i += 2) { out.fill(d[i + 1], p, p + d[i]); p += d[i]; }
  return out;
}

// ---------------------------------------------------------------- settings
const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'KeyC', sprint: 'ShiftLeft',
  inventory: 'KeyE', drop: 'KeyQ', chat: 'KeyT', command: 'Slash', perspective: 'F5', hideHud: 'F1', debug: 'F3',
  attack: 'Mouse0', use: 'Mouse2', pick: 'Mouse1', playerlist: 'Tab', zoom: 'KeyZ', ragdoll: 'KeyG'
};
const KEY_NAMES = { forward: 'Avanzar', back: 'Retroceder', left: 'Izquierda', right: 'Derecha', jump: 'Saltar', sneak: 'Agacharse', sprint: 'Correr', inventory: 'Inventario', drop: 'Soltar objeto', chat: 'Abrir chat', command: 'Abrir comando', perspective: 'Cambiar perspectiva', hideHud: 'Ocultar HUD', debug: 'Menú de depuración (F3)', attack: 'Atacar / Destruir', use: 'Usar objeto / Colocar', pick: 'Elegir bloque', playerlist: 'Lista de jugadores', zoom: 'Zoom (mantener; rueda = acercar)', ragdoll: 'Ragdoll (dejarse caer)' };
const SETTINGS = Object.assign({
  fov: 70, rd: 6, sens: 0.5, vol: 0.7, quality: 2, gui: 2, bob: true, invertY: false, name: 'Jugador' + Math.floor(Math.random() * 900 + 100),
  clouds: true, particles: 2, brightness: 0.5, dynres: true, resScale: 1, gpuPref: 'high-performance', fpsCap: 0, threads: 0
}, (() => { try { return JSON.parse(localStorage.getItem('mc2-settings') || '{}'); } catch (e) { return {}; } })());
SETTINGS.keys = Object.assign({}, DEFAULT_KEYS, SETTINGS.keys || {});
// Ctrl+W (Ctrl + avanzar) cierra la pestaña en el navegador y no se puede bloquear fuera de pantalla completa:
// las acciones de movimiento ya no usan Ctrl por defecto (correr = R o doble toque de W)
// v3: correr = Shift, agacharse = C, zoom = Z (si seguían con los valores por defecto anteriores)
if (!SETTINGS.keysV3) { const K = SETTINGS.keys; if (['KeyR', 'ControlLeft', 'ControlRight'].includes(K.sprint)) K.sprint = 'ShiftLeft'; if (K.sneak === 'ShiftLeft' || /^Control/.test(K.sneak || '')) K.sneak = 'KeyC'; if (K.zoom === 'KeyC' || !K.zoom) K.zoom = 'KeyZ'; SETTINGS.keysV3 = true; SETTINGS.keysV2 = true; try { localStorage.setItem('mc2-settings', JSON.stringify(SETTINGS)); } catch (e) { } }
if (!SETTINGS.keysV2) { for (const k of ['sprint', 'sneak']) if (/^Control/.test(SETTINGS.keys[k] || '')) SETTINGS.keys[k] = DEFAULT_KEYS[k]; SETTINGS.keysV2 = true; try { localStorage.setItem('mc2-settings', JSON.stringify(SETTINGS)); } catch (e) { } }
function saveSettings() { try { localStorage.setItem('mc2-settings', JSON.stringify(SETTINGS)); } catch (e) { } }
function keyLabel(code) {
  if (!code) return '-';
  if (code.startsWith('Mouse')) return ['Botón izq.', 'Botón central', 'Botón der.', 'Botón 4', 'Botón 5'][+code.slice(5)] || code;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({ Space: 'Espacio', ShiftLeft: 'Mayús izq.', ShiftRight: 'Mayús der.', ControlLeft: 'Ctrl izq.', ControlRight: 'Ctrl der.', AltLeft: 'Alt izq.', Tab: 'Tab', Slash: '/', Enter: 'Intro' })[code] || code;
}
