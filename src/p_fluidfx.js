// ============================================================================
//  Ondas del agua: simulación de la ecuación de onda en GPU alrededor de la cámara.
//  Lo que se mueve en el agua (jugador, mobs, objetos, flechas, chorros que caen) deja estelas y anillos
//  que se propagan, se reflejan y se apagan; FS_WATER usa el gradiente de la altura como relieve.
// ============================================================================
const RIP = { N: 256, size: 64, tex: null, fb: null, cur: 0, ox: 0, oz: 0, prog: null, gl: null, acc: 0, imps: [], ok: false, dummy: null, last: null };
const VS_RIP = `#version 300 es
layout(location=0) in vec2 a; out vec2 v_uv; void main(){ v_uv=a*0.5+0.5; gl_Position=vec4(a,0.0,1.0); }`;
const FS_RIP = `#version 300 es
precision highp float; uniform sampler2D u_prev; uniform vec2 u_shift; uniform vec4 u_imp[16]; uniform int u_n; uniform float u_px;
in vec2 v_uv; out vec4 o;
void main(){
  vec2 uv=v_uv+u_shift; // la rejilla sigue a la cámara
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ o=vec4(0.0); return; }
  vec2 s=texture(u_prev,uv).rg; float h=s.r, hp=s.g;
  float l=texture(u_prev,uv-vec2(u_px,0.0)).r, r=texture(u_prev,uv+vec2(u_px,0.0)).r, d=texture(u_prev,uv-vec2(0.0,u_px)).r, u=texture(u_prev,uv+vec2(0.0,u_px)).r;
  float hn=(2.0*h-hp+0.18*(l+r+d+u-4.0*h))*0.986; // ecuación de onda con amortiguación
  for(int i=0;i<16;i++){ if(i>=u_n) break; vec2 dd=(v_uv-u_imp[i].xy)/u_imp[i].z; hn+=u_imp[i].w*exp(-dot(dd,dd)); }
  float e=min(min(v_uv.x,1.0-v_uv.x),min(v_uv.y,1.0-v_uv.y)); hn*=smoothstep(0.0,0.06,e); // bordes absorbentes
  o=vec4(clamp(hn,-4.0,4.0),h,0.0,1.0);
}`;
function ripInit() {
  const gl = R.gl; RIP.gl = gl; RIP.ok = false;
  // textura vacía: el sampler del agua siempre necesita algo válido en su unidad
  RIP.dummy = gl.createTexture(); gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, RIP.dummy); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); gl.activeTexture(gl.TEXTURE0);
  if (!R.cfb) return;
  try { RIP.prog = compileRaw(VS_RIP, FS_RIP); } catch (e) { console.warn('ondas', e); return; }
  RIP.tex = []; RIP.fb = [];
  for (let i = 0; i < 2; i++) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, RIP.N, RIP.N, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); return; }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); RIP.tex.push(t); RIP.fb.push(fb);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  RIP.quad = gl.createVertexArray(); gl.bindVertexArray(RIP.quad); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
  RIP.ok = true;
}
// programa sin el bloque común (shaders de pantalla completa)
function compileRaw(vs, fs) {
  const gl = R.gl; const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
// impulso en la superficie: x,z del mundo, radio (bloques), fuerza (+ hunde / - levanta)
function ripImpulse(x, z, rad, str) { if (RIP.ok && R.q >= 2 && RIP.imps.length < 64) RIP.imps.push(x, z, rad, str); }
// avanza la simulación (a 40 pasos por segundo) y deja la textura lista para FS_WATER
function ripUpdate(dt) {
  const gl = R.gl; if (!gl) return;
  if (RIP.gl !== gl) ripInit();
  if (!RIP.ok || R.q < 2 || !G.player) { RIP.imps.length = 0; return; }
  const cam = R.cam; const px = RIP.size / RIP.N;
  // origen alineado a la rejilla: al moverse la cámara se desplaza el contenido un número entero de celdas
  const nox = Math.floor((cam[0] - RIP.size / 2) / px) * px, noz = Math.floor((cam[2] - RIP.size / 2) / px) * px;
  let shx = (nox - RIP.ox) / RIP.size, shz = (noz - RIP.oz) / RIP.size;
  if (Math.abs(shx) > 0.5 || Math.abs(shz) > 0.5) { shx = 0; shz = 0; for (const fb of RIP.fb) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } }
  RIP.ox = nox; RIP.oz = noz;
  RIP.acc = Math.min(0.1, RIP.acc + dt); let steps = 0;
  const P = RIP.prog; gl.useProgram(P.p); gl.bindVertexArray(RIP.quad); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.viewport(0, 0, RIP.N, RIP.N);
  gl.uniform1f(P.u.u_px, 1 / RIP.N);
  while (RIP.acc >= 1 / 40 && steps < 3) {
    RIP.acc -= 1 / 40;
    const src = RIP.cur, dst = 1 - src;
    gl.bindFramebuffer(gl.FRAMEBUFFER, RIP.fb[dst]); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, RIP.tex[src]); gl.uniform1i(P.u.u_prev, 0);
    gl.uniform2f(P.u.u_shift, steps === 0 ? shx : 0, steps === 0 ? shz : 0);
    // impulsos (solo en el primer paso del cuadro)
    const arr = new Float32Array(64); let n = 0;
    if (steps === 0) for (let i = 0; i + 3 < RIP.imps.length && n < 16; i += 4) { arr[n * 4] = (RIP.imps[i] - RIP.ox) / RIP.size; arr[n * 4 + 1] = (RIP.imps[i + 1] - RIP.oz) / RIP.size; arr[n * 4 + 2] = Math.max(px * 1.5, RIP.imps[i + 2]) / RIP.size; arr[n * 4 + 3] = RIP.imps[i + 3]; n++; }
    gl.uniform4fv(P.u.u_imp, arr); gl.uniform1i(P.u.u_n, n);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); RIP.cur = dst; steps++;
  }
  if (steps) RIP.imps.length = 0;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null); gl.enable(gl.DEPTH_TEST);
}
// enlaza la textura de ondas al programa del agua (unidad 7)
function ripBind(P) {
  const gl = R.gl; if (!P.u.u_ripple) return; if (RIP.gl !== gl) ripInit();
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, RIP.ok && R.q >= 2 ? RIP.tex[RIP.cur] : RIP.dummy); gl.uniform1i(P.u.u_ripple, 7);
  if (P.u.u_ripRect) gl.uniform4f(P.u.u_ripRect, RIP.ox, RIP.oz, 1 / RIP.size, RIP.ok && R.q >= 2 ? 1 : 0);
  gl.activeTexture(gl.TEXTURE0);
}
// fuentes de ondas: entidades que se mueven en el agua o caen en ella, chorros que caen en una poza
function ripSources(w, dt) {
  if (!w || !G.player) return; // las salpicaduras van en cualquier calidad; las ondas solo con la simulación activa
  const cam = R.cam; const half = RIP.size / 2 - 2;
  const near = e => Math.abs(e.x - cam[0]) < half && Math.abs(e.z - cam[2]) < half;
  const consider = (e, rad, mass) => {
    const bx = Math.floor(e.x), bz = Math.floor(e.z); let by = Math.floor(e.y + 0.05); let sy = -1;
    for (let k = 0; k < 3; k++) { const b = w.get(bx, by + k, bz); if (b > 0 && REG[b] && (REG[b].liquid === 1 || REG[b].inWater)) sy = by + k + liquidSurface(w, bx, by + k, bz); }
    if (sy < 0) { e._wIn = false; return; }
    const top = e.y + (e.h || 0.5), wasIn = e._wIn; const inS = e.y < sy + 0.05 && top > sy - 0.3; // cruza la superficie
    e._wIn = e.y < sy;
    if (!inS) return;
    const sp = Math.hypot(e.vx || 0, e.vz || 0);
    if (!wasIn && e._wIn && (e.vy || 0) < -2) { const k = Math.min(3, -(e.vy) / 6) * mass; ripImpulse(e.x, e.z, rad * 1.4, 1.4 * k); if (typeof waterSplash === 'function') waterSplash(w, e.x, sy, e.z, k); }
    else if (sp > 0.4) { e._wT = (e._wT || 0) + dt; if (e._wT > 0.07) { e._wT = 0; ripImpulse(e.x - (e.vx || 0) * 0.05, e.z - (e.vz || 0) * 0.05, rad, Math.min(0.7, sp * 0.09) * mass); } }
    else if (Math.random() < dt * 2) ripImpulse(e.x, e.z, rad * 0.8, 0.12 * mass); // flotando: un leve balanceo
  };
  const p = G.player; if (p && !p.dead && near(p) && G.gameMode !== 'spectator') consider(p, 0.45, 1);
  for (const e of G.entities.values()) { if (e.removed || e.dead || e.dim !== p.dim || !near(e)) continue; if (e.type === 'item') consider(e, 0.2, 0.35); else if (e instanceof Mob) consider(e, Math.max(0.3, (e.w || 0.6) * 0.6), Math.min(2, (e.w || 0.6) * 1.2)); else if (e instanceof Projectile) consider(e, 0.15, 0.4); }
  if (!RIP.ok || R.q < 2) return;
  // chorros que caen en una poza: agitación constante en el punto de impacto
  const pcx = Math.floor(cam[0]) >> 4, pcz = Math.floor(cam[2]) >> 4;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const c = w.chunk(pcx + dx, pcz + dz); if (!c || !c.emitters) continue; const E = c.emitters; for (let i = 0; i < E.length; i += 4) if (E[i + 3] === ID.water && Math.random() < dt * 14) ripImpulse(E[i] + 0.5 + (Math.random() - 0.5) * 0.5, E[i + 2] + 0.5 + (Math.random() - 0.5) * 0.5, 0.35, 0.45 + Math.random() * 0.4); }
}
// salpicadura al caer algo al agua: gotas proporcionales a la velocidad y sonido
function waterSplash(w, x, y, z, k) {
  const n = Math.round([3, 8, 14][SETTINGS.particles ?? 2] * Math.min(2.5, k));
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = (1 + Math.random() * 2.5) * Math.min(1.8, 0.6 + k * 0.5); P_({ x: x + Math.cos(a) * 0.25, y: y + 0.05, z: z + Math.sin(a) * 0.25, vx: Math.cos(a) * s, vy: (2.5 + Math.random() * 3.5) * Math.min(1.6, 0.6 + k * 0.4), vz: Math.sin(a) * s, life: 0.6 + Math.random() * 0.5, size: 0.06 + Math.random() * 0.08, r: 0.8, g: 0.9, b: 1, a: 0.8, grav: 18, collide: true, layer: TEX.drip, fluid: 1 }); }
  if (k > 0.3) playSound('splash', x, y, z, Math.min(1, 0.3 + k * 0.3));
}
(R.restoreHooks = R.restoreHooks || []).push(() => { RIP.gl = null; RIP.ok = false; });
