// ============================================================================
//  Tubificador3000: tubos huecos dibujados a mano (una pluma 3D) por los que corre el fluido de partículas
// ============================================================================
// Un tubo es una línea de puntos libre (cualquier ángulo, no va por bloques) con un diámetro interior medido en
// partículas: fino 6, medio 12, ancho 24. No crea bloques ni partículas. Por dentro es hueco y el fluido lo recorre
// aunque cruce bloques; la pared no deja pasar de fuera a dentro ni al revés, y por las bocas se entra y se sale.
const TUBES = { list: [], next: 1, ver: 0 }; // { id, dim, n (diámetro en partículas), pts: [[x, y, z], ...] }
const TUBE_N = { fino: 6, medio: 12, ancho: 24 };
const TUBE_MODES = ['fino', 'medio', 'ancho', 'borrar'];
const TUBE_MODE_NAME = { fino: 'tubo fino', medio: 'tubo medio', ancho: 'tubo ancho', borrar: 'eliminar' };
const TUBE_MAXPTS = 40000;
const PEN = { tube: null, lastUse: 0, eraseT: 0, sndT: 0 };
function tubeR(n) { return n * (typeof FL_S === 'number' ? FL_S : 1 / 12) / 2; } // radio interior (cambia con el tamaño de PBF)
function tubeWall(r) { return 0.03 + 0.12 * r; } // grosor de la pared (el mismo que usa el shader)
function tubeMode(s) { return s && TUBE_MODES.includes(s.mode) ? s.mode : 'fino'; }
function tubeChanged(t) { TUBES.ver++; if (t) { tubeFreeMesh(t); t.extP = null; } }
const tv = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] };
// punto más cercano de un tramo a un punto
function tubeSegPt(p, a, b) { const ab = tv.sub(b, a); const t = clamp(tv.dot(tv.sub(p, a), ab) / Math.max(tv.dot(ab, ab), 1e-9), 0, 1); return tv.add(a, tv.mul(ab, t)); }
// puntos más cercanos entre dos tramos (p0-p1 y q0-q1): [s, t, distancia]
function tubeSegSeg(p0, p1, q0, q1) {
  const d1 = tv.sub(p1, p0), d2 = tv.sub(q1, q0), r = tv.sub(p0, q0); const a = tv.dot(d1, d1), e = tv.dot(d2, d2), f = tv.dot(d2, r);
  let s, t; if (a < 1e-9 && e < 1e-9) { s = t = 0; } else if (a < 1e-9) { s = 0; t = clamp(f / e, 0, 1); } else { const c = tv.dot(d1, r);
    if (e < 1e-9) { t = 0; s = clamp(-c / a, 0, 1); } else { const b = tv.dot(d1, d2), den = a * e - b * b; s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0; t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); } } }
  return [s, t, tv.len(tv.sub(tv.add(p0, tv.mul(d1, s)), tv.add(q0, tv.mul(d2, t))))];
}
// punta de la pluma: delante de los ojos; si hay un bloque más cerca, se queda pegada a su superficie
function tubeTip(p, r) {
  const dir = lookDir(p); const h = G.hit; let d = 3 + r;
  if (h && !h.ent && typeof h.t === 'number') d = Math.min(d, h.id === ID.tube_adapter ? h.t : h.t - r - tubeWall(r) - 0.03); // en un adaptador, la boca toca su cara
  d = Math.max(0.9, d); return [p.x + dir[0] * d, p.eye + dir[1] * d, p.z + dir[2] * d];
}
// clic derecho mantenido: dibujar (o borrar) mientras se mantiene
function tubeUse(p, s) {
  if (G.gameMode === 'spectator') return; const mode = tubeMode(s); PEN.lastUse = performance.now(); p.swing = Math.max(p.swing || 0, 0.01);
  if (mode === 'borrar') { tubeErase(p); return; }
  const n = TUBE_N[mode], r = tubeR(n), tip = tubeTip(p, r);
  if (!PEN.tube || !TUBES.list.includes(PEN.tube)) { // empezar uno nuevo, o seguir uno del mismo grosor desde su boca
    let t = null; const near = Math.max(0.5, r * 1.2);
    for (const u of TUBES.list) { if (u.dim !== p.dim || u.n !== n || u.pts.length < 2) continue;
      if (tv.len(tv.sub(u.pts[u.pts.length - 1], tip)) < near) { t = u; break; }
      if (tv.len(tv.sub(u.pts[0], tip)) < near) { u.pts.reverse(); t = u; break; } }
    if (!t) { t = { id: TUBES.next++, dim: p.dim, n, pts: [tip] }; TUBES.list.push(t); }
    PEN.tube = t; tubeChanged(t); playSound('click', tip[0], tip[1], tip[2], 0.3); return;
  }
  const t = PEN.tube, last = t.pts[t.pts.length - 1], step = Math.max(0.2, r * 0.5), d = tv.len(tv.sub(tip, last));
  if (d < step) return;
  if (tubeCount() >= TUBE_MAXPTS) { showActionMsg('Tubificador3000: demasiados tubos (bórralos con el modo eliminar)'); return; }
  const k = Math.min(30, Math.floor(d / step)); for (let i = 1; i <= k; i++) t.pts.push(tv.add(last, tv.mul(tv.sub(tip, last), i / k)));
  tubeChanged(t);
  const now = performance.now(); if (now - PEN.sndT > 140) { PEN.sndT = now; playSound('hit', tip[0], tip[1], tip[2], 0.12, ID.glass); }
}
function tubeCount() { let c = 0; for (const t of TUBES.list) c += t.pts.length; return c; }
// se suelta el clic derecho (o se cambia de objeto): el trazo termina; los de un solo punto no cuentan
function tubeTick(use) {
  if (PEN.tube && (!use || performance.now() - PEN.lastUse > 200)) { const t = PEN.tube; PEN.tube = null; if (t.pts.length < 2) tubeRemove(t); else tubeNetSend(); }
}
function tubeRemove(t) { const i = TUBES.list.indexOf(t); if (i >= 0) TUBES.list.splice(i, 1); tubeChanged(t); }
// tubo al que apunta la mirada (hasta 6 bloques o el primer bloque): { t, i (tramo), pt (punto del eje), d (distancia) }
function tubePick(p) {
  const dir = lookDir(p), eye = [p.x, p.eye, p.z]; let reach = 6; const h = G.hit; if (h && !h.ent && typeof h.t === 'number') reach = Math.min(reach, h.t + 0.3);
  const end = tv.add(eye, tv.mul(dir, reach)); let best = null;
  for (const t of TUBES.list) { if (t.dim !== p.dim || t.pts.length < 2) continue; const r = tubeR(t.n), ro = r + tubeWall(r) + 0.12;
    for (let i = 0; i < t.pts.length - 1; i++) { const a = t.pts[i], b = t.pts[i + 1]; const [s, u, d] = tubeSegSeg(eye, end, a, b); if (d > ro) continue;
      const along = s * reach; if (!best || along < best.along) best = { t, i, along, pt: tv.add(a, tv.mul(tv.sub(b, a), u)) }; } }
  return best;
}
// modo eliminar: quita la sección del tubo a la que apuntas (los tramos cerca de ese punto), no el tubo entero; lo que
// queda a cada lado sigue como tubos separados, con bocas abiertas
function tubeErase(p) {
  const now = performance.now(); if (now - PEN.eraseT < 70) return; PEN.eraseT = now;
  const hit = tubePick(p); if (!hit) return; const t = hit.t, r = tubeR(t.n), rad = Math.max(0.35, r * 0.9);
  const keep = []; for (let j = 0; j < t.pts.length - 1; j++) keep.push(tv.len(tv.sub(tubeSegPt(hit.pt, t.pts[j], t.pts[j + 1]), hit.pt)) > rad);
  const pieces = []; let cur = null;
  for (let j = 0; j < keep.length; j++) { if (keep[j]) { if (!cur) { cur = [t.pts[j]]; pieces.push(cur); } cur.push(t.pts[j + 1]); } else cur = null; }
  tubeRemove(t); for (const pts of pieces) if (pts.length >= 2) TUBES.list.push({ id: TUBES.next++, dim: t.dim, n: t.n, pts });
  if (PEN.tube === t) PEN.tube = null; tubeNetSend();
  for (let k = 0; k < 6; k++) P_({ x: hit.pt[0], y: hit.pt[1], z: hit.pt[2], vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, life: 0.5, size: 0.06, layer: TEX.spark, r: 0.8, g: 0.95, b: 1 });
  playSound('break', hit.pt[0], hit.pt[1], hit.pt[2], 0.35, ID.glass);
}
// golpear el aire con el tubificador en la mano: siguiente modo
function tubeNextMode(p, s) {
  const i = TUBE_MODES.indexOf(tubeMode(s)); s.mode = TUBE_MODES[(i + 1) % TUBE_MODES.length]; p.swing = 0.01;
  const m = s.mode; showActionMsg('Tubificador3000: ' + TUBE_MODE_NAME[m] + (m === 'borrar' ? '' : ' (' + TUBE_N[m] + ' partículas de diámetro)')); showItemName(); playSound('click', p.x, p.eye, p.z, 0.4);
}
// ---------------------------------------------------------------- adaptadores de tubos
// Un adaptador es un bloque sólido en el que, donde le llega un tubo, queda un hueco exacto del tamaño del tubo: si la
// boca de un tubo toca su cara (o apunta a ella a menos de su radio + pared + 0,6 bloques, sin otro bloque en medio), el
// tubo se prolonga en línea recta por dentro del adaptador (o de varios seguidos, hasta 16) y su boca pasa a la otra
// cara. Así el líquido entra y sale del tubo sin escaparse por el hueco entre el tubo y los bloques.
// devuelve el punto de salida, null si no hay adaptador, undefined si falta un chunk por cargar
function tubeExt(w, M, d, r) {
  const gap = r + tubeWall(r) + 0.6; let inA = false;
  for (let s = 0; s <= gap + 16; s += 0.04) {
    const x = M[0] + d[0] * s, y = M[1] + d[1] * s, z = M[2] + d[2] * s; const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    if (!w.chunk(bx >> 4, bz >> 4)) return undefined;
    const b = w.get(bx, by, bz);
    if (b === ID.tube_adapter) { inA = true; continue; }
    if (inA) return [x + d[0] * 0.04, y + d[1] * 0.04, z + d[2] * 0.04]; // salió por la otra cara: ahí queda la boca
    if (s > gap) return null;
    if (b > 0 && REG[b] && REG[b].solid && !REG[b].liquid) return null; // otro bloque en medio
  }
  return null;
}
// dirección de una boca: la de los últimos ~0,6 bloques del tubo (un tramo corto de la pluma puede torcerse)
function tubeEndDir(P, first) {
  const n = P.length; const e = first ? P[0] : P[n - 1]; let q = e;
  for (let k = 1; k < n; k++) { q = first ? P[k] : P[n - 1 - k]; if (tv.len(tv.sub(e, q)) >= 0.6) break; }
  return tv.norm(tv.sub(e, q));
}
// puntos del tubo con sus prolongaciones por los adaptadores (lo que usan la simulación y el dibujo)
function tubePtsW(t) {
  if (t.extP) return t.extP; const w = G.worlds && G.worlds[t.dim]; if (!w || t.pts.length < 2) return t.pts;
  const P = t.pts, r = tubeR(t.n); const a = tubeExt(w, P[0], tubeEndDir(P, true), r), b = tubeExt(w, P[P.length - 1], tubeEndDir(P, false), r);
  const out = a || b ? [...(a ? [a] : []), ...P, ...(b ? [b] : [])] : P;
  if (a !== undefined && b !== undefined) t.extP = out; else TUBES.recheck = true; // falta un chunk: volver a mirar
  return out;
}
// un bloque cambió (o pasó un rato: chunks recién cargados, cambios por red o por /set): rehacer las prolongaciones
function tubeOnBlock(w, x, y, z) { for (const t of TUBES.list) { if (t.dim !== w.dim) continue; const m = tubeR(t.n) + 19; for (const e of [t.pts[0], t.pts[t.pts.length - 1]]) if (e && Math.abs(e[0] - x) < m && Math.abs(e[1] - y) < m && Math.abs(e[2] - z) < m) { TUBES.recheck = true; return; } } }
function tubeExtCheck() {
  const now = performance.now(); if (!TUBES.recheck && now - (TUBES.chkT || 0) < 1500) return; TUBES.recheck = false; TUBES.chkT = now;
  for (const t of TUBES.list) { const old = t.extP; t.extP = null; const P = tubePtsW(t);
    const same = old && old.length === P.length && old.every((q, i) => q[0] === P[i][0] && q[1] === P[i][1] && q[2] === P[i][2]);
    if (same) t.extP = old; else { TUBES.ver++; tubeFreeMesh(t); } }
}
// ---------------------------------------------------------------- datos para el shader del fluido
// Tramos de los tubos de la dimensión simulada, en coordenadas de la región, repartidos en celdas de 2 bloques
const TUBEG = { key: '', n: 0, TD: [1, 1, 1], cell: null, list: null, seg: null };
function tubeTex(t, ifmt, fmt, w, h, data) { const gl = R.gl; gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.FLOAT, data); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.bindTexture(gl.TEXTURE_2D, null); }
function tubeGpuSync() {
  const gl = R.gl;
  if (!TUBEG.cell || TUBEG.gl !== gl) { TUBEG.gl = gl; TUBEG.cell = gl.createTexture(); TUBEG.list = gl.createTexture(); TUBEG.seg = gl.createTexture(); TUBEG.key = '';
    tubeTex(TUBEG.cell, gl.RG32F, gl.RG, 1, 1, new Float32Array(2)); tubeTex(TUBEG.list, gl.R32F, gl.RED, 1, 1, new Float32Array(1)); tubeTex(TUBEG.seg, gl.RGBA32F, gl.RGBA, 2, 1, new Float32Array(8)); }
  const w = FL.world; if (!w) { TUBEG.n = 0; return; }
  tubeExtCheck(); const key = TUBES.ver + '|' + FL.org.join(',') + '|' + w.dim + '|' + FL_S; if (key === TUBEG.key) return; TUBEG.key = key;
  const [vx, vy, vz] = FL.vdim, o = FL.org; const TD = [vx >> 1, vy >> 1, vz >> 1]; const NC = TD[0] * TD[1] * TD[2];
  const segs = []; const lists = new Map(); let over = 0;
  for (const t of TUBES.list) { if (t.dim !== w.dim || t.pts.length < 2) continue; const r = tubeR(t.n), m = r + tubeWall(r) + 0.7; // margen: lo que se mueve una partícula en un paso
    const TP = tubePtsW(t); for (let i = 0; i < TP.length - 1; i++) { const a = TP[i], b = TP[i + 1];
      const lo = [0, 1, 2].map(k => Math.min(a[k], b[k]) - m - o[k]), hi = [0, 1, 2].map(k => Math.max(a[k], b[k]) + m - o[k]);
      if (hi[0] < 0 || hi[1] < 0 || hi[2] < 0 || lo[0] > vx || lo[1] > vy || lo[2] > vz) continue;
      const si = segs.length / 8; const fl = (i === 0 ? 1 : 0) | (i === TP.length - 2 ? 2 : 0); // bocas abiertas: el primer y el último tramo
      segs.push(a[0] - o[0], a[1] - o[1], a[2] - o[2], r, b[0] - o[0], b[1] - o[1], b[2] - o[2], fl);
      const c0 = lo.map((v, k) => clamp(Math.floor(v / 2), 0, TD[k] - 1)), c1 = hi.map((v, k) => clamp(Math.floor(v / 2), 0, TD[k] - 1));
      for (let z = c0[2]; z <= c1[2]; z++) for (let y = c0[1]; y <= c1[1]; y++) for (let x = c0[0]; x <= c1[0]; x++) { const c = x + TD[0] * (y + TD[1] * z); let L = lists.get(c); if (!L) lists.set(c, L = []); if (L.length < 48) L.push(si); else over++; }
    } }
  TUBEG.n = segs.length / 8; TUBEG.TD = TD; if (over) console.warn('tubos: celdas con más de 48 tramos', over);
  if (!TUBEG.n) return;
  const ch = Math.ceil(NC / 256), C = new Float32Array(256 * ch * 2); const L = [];
  for (const [c, l] of lists) { C[c * 2] = L.length; C[c * 2 + 1] = l.length; for (const s of l) L.push(s); }
  const lr = Math.max(1, Math.ceil(L.length / 1024)), LA = new Float32Array(1024 * lr); LA.set(L);
  const sr = Math.max(1, Math.ceil(TUBEG.n * 2 / 1024)), SA = new Float32Array(1024 * sr * 4); SA.set(segs);
  tubeTex(TUBEG.cell, gl.RG32F, gl.RG, 256, ch, C); tubeTex(TUBEG.list, gl.R32F, gl.RED, 1024, lr, LA); tubeTex(TUBEG.seg, gl.RGBA32F, gl.RGBA, 1024, sr, SA);
}
function tubeBind(P) { // llamado desde flCommon
  const gl = R.gl, u = P.u; tubeGpuSync(); gl.uniform1i(u.u_tOn, TUBEG.n > 0 ? 1 : 0); if (u.u_tdim) gl.uniform3i(u.u_tdim, TUBEG.TD[0], TUBEG.TD[1], TUBEG.TD[2]);
  flBindTex(P, 'u_tcell', 11, TUBEG.cell); flBindTex(P, 'u_tlist', 13, TUBEG.list); flBindTex(P, 'u_tseg', 14, TUBEG.seg);
}
// ---------------------------------------------------------------- dibujo: vidrio transparente con reflejo en los bordes
const VS_TUBE = `#version 300 es
precision highp float; layout(location=0) in vec3 a_p; layout(location=1) in vec3 a_n; uniform mat4 u_vp; uniform vec3 u_off; out vec3 v_n; out vec3 v_p;
void main(){ vec3 p=a_p+u_off; v_p=p; v_n=a_n; gl_Position=u_vp*vec4(p,1.0); }`;
const FS_TUBE = `#version 300 es
precision highp float; in vec3 v_n; in vec3 v_p; uniform vec3 u_sun; uniform float u_k, u_day; uniform vec4 u_tint; out vec4 o;
void main(){ vec3 n=normalize(v_n); vec3 vd=normalize(-v_p); if(dot(n,vd)<0.0) n=-n; float fr=pow(1.0-clamp(dot(n,vd),0.0,1.0),3.0);
  vec3 L=normalize(u_sun); float dif=0.6+0.4*max(dot(n,L),0.0); float sp=pow(max(dot(n,normalize(L+vd)),0.0),70.0)*u_day;
  vec3 col=u_tint.rgb*dif*mix(0.35,1.0,u_day); o=vec4((col+sp*1.5)*u_k, clamp(u_tint.a+0.5*fr+sp*0.6,0.0,0.95)); }`;
function tubeFreeMesh(t) { const m = t.mesh; if (!m) return; const gl = R.gl; if (gl) { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); gl.deleteVertexArray(m.vao); } t.mesh = null; }
function tubeMesh(t) {
  const gl = R.gl; const P = tubePtsW(t), n = P.length; if (n < 2) return null; const r = tubeR(t.n), ro = r + tubeWall(r); const K = r >= 0.45 ? 18 : 12; const o = P[0];
  const T = P.map((q, i) => tv.norm(tv.sub(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)])));
  let N = Math.abs(T[0][1]) < 0.9 ? tv.norm(tv.cross(T[0], [0, 1, 0])) : tv.norm(tv.cross(T[0], [1, 0, 0]));
  const V = [], I = []; const ring = (c, rad, Nn, B, nrm) => { for (let k = 0; k < K; k++) { const a = k / K * Math.PI * 2; const d = tv.add(tv.mul(Nn, Math.cos(a)), tv.mul(B, Math.sin(a))); const q = tv.add(tv.sub(c, o), tv.mul(d, rad)); const nn = nrm || d; V.push(q[0], q[1], q[2], nn[0], nn[1], nn[2]); } };
  const frames = [];
  for (let i = 0; i < n; i++) { N = tv.norm(tv.sub(N, tv.mul(T[i], tv.dot(N, T[i])))); const B = tv.cross(T[i], N); frames.push([N, B]); ring(P[i], ro, N, B); } // marco de transporte paralelo (sin giros)
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < K; k++) { const a = i * K + k, b = i * K + (k + 1) % K, c = a + K, d = b + K; I.push(a, c, b, b, c, d); }
  // las bocas: un aro entre la pared interior y la exterior
  for (const [i, sg] of [[0, -1], [n - 1, 1]]) { const base = V.length / 6; const [Nn, B] = frames[i]; ring(P[i], r, Nn, B, tv.mul(T[i], sg)); const outer = i * K;
    for (let k = 0; k < K; k++) { const a = outer + k, b = outer + (k + 1) % K, c = base + k, d = base + (k + 1) % K; I.push(a, c, b, b, c, d); } }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(I), gl.STATIC_DRAW); gl.bindVertexArray(null);
  return { vao, vb, ib, count: I.length, o, r };
}
function tubeDraw() {
  const p = G.player; if (!p || !TUBES.list.length) return; const gl = R.gl; tubeExtCheck();
  if (!R.progs.tube) R.progs.tube = compile(VS_TUBE, FS_TUBE); const P = R.progs.tube; gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.u.u_vp, false, R.vp); const s = ENV.sunReal || [0.3, 0.8, 0.2]; gl.uniform3f(P.u.u_sun, s[0], s[1], s[2]); const day = p.dim === 'overworld' ? (ENV.day ?? 1) : 0.6;
  gl.uniform1f(P.u.u_day, day); gl.uniform1f(P.u.u_k, 0.85 / Math.max(0.15, R.expo || 1)); gl.uniform4f(P.u.u_tint, 0.80, 0.93, 1.0, 0.10);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const t of TUBES.list) { if (t.dim !== p.dim || t.pts.length < 2) continue; const q = t.pts[0]; if (Math.abs(q[0] - p.x) > 300 || Math.abs(q[2] - p.z) > 300) continue;
    if (t.mesh && t.mesh.r !== tubeR(t.n)) tubeFreeMesh(t); if (!t.mesh) t.mesh = tubeMesh(t); const m = t.mesh; if (!m) continue;
    gl.uniform3f(P.u.u_off, m.o[0] - R.cam[0], m.o[1] - R.cam[1], m.o[2] - R.cam[2]); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); R.stats.draws++; }
  gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
}
// guía con el tubificador en la mano: aro en la punta de la pluma (modos de tubo) o la sección que se borraría
function tubeGuide() {
  const p = G.player; const s = p && p.held(); if (!s || !REG[s.id].tubeTool || G.gameMode === 'spectator') return; const mode = tubeMode(s);
  const circ = (c, rad, nrm, col) => { const a0 = Math.abs(nrm[1]) < 0.9 ? tv.norm(tv.cross(nrm, [0, 1, 0])) : tv.norm(tv.cross(nrm, [1, 0, 0])); const b0 = tv.cross(nrm, a0); const L = []; const K = 24;
    for (let k = 0; k < K; k++) { for (const j of [k, k + 1]) { const a = j / K * Math.PI * 2; const q = tv.add(c, tv.add(tv.mul(a0, Math.cos(a) * rad), tv.mul(b0, Math.sin(a) * rad))); L.push(q[0] - R.cam[0], q[1] - R.cam[1], q[2] - R.cam[2]); } }
    drawLines(L, col); };
  const dir = lookDir(p);
  if (mode === 'borrar') { const h = tubePick(p); if (!h) return; const r = tubeR(h.t.n); const a = h.t.pts[h.i], b = h.t.pts[h.i + 1]; circ(h.pt, r + tubeWall(r) + 0.05, tv.norm(tv.sub(b, a)), [1, 0.3, 0.3, 1]); return; }
  const r = tubeR(TUBE_N[mode]); const tip = tubeTip(p, r); circ(tip, r, dir, [0.7, 0.95, 1, 0.9]); circ(tip, r + tubeWall(r), dir, [1, 1, 1, 0.5]);
}
// ---------------------------------------------------------------- guardar/cargar (con el mundo)
function tubeSerialize() { return TUBES.list.filter(t => t.pts.length >= 2).map(t => ({ d: t.dim, n: t.n, p: t.pts.flat().map(v => +v.toFixed(3)) })); }
// multijugador: la lista entera viaja al terminar cada trazo o borrado (el anfitrión la reenvía a los demás)
function tubeNetSend(except) { if (!G.net) return; const m = { t: 'tubes', l: tubeSerialize() }; if (except) netBroadcast(m, except); else netSend(m); }
function tubeNetRecv(l) { const cur = PEN.tube; tubeRestore(l); if (cur && cur.pts.length) { TUBES.list.push(cur); PEN.tube = cur; } } // sin cortar el trazo que se está dibujando
function tubeRestore(data) {
  for (const t of TUBES.list) tubeFreeMesh(t); TUBES.list = []; PEN.tube = null;
  if (Array.isArray(data)) for (const o of data) { if (!o || !Array.isArray(o.p) || o.p.length < 6) continue; const pts = []; for (let i = 0; i + 2 < o.p.length; i += 3) pts.push([+o.p[i], +o.p[i + 1], +o.p[i + 2]]);
    TUBES.list.push({ id: TUBES.next++, dim: o.d || 'overworld', n: [6, 12, 24].includes(o.n) ? o.n : 6, pts }); }
  tubeChanged(null);
}
