// ============================================================================
//  Explosiones: bloques que salen volando como cuerpos rígidos y vuelven a ser
//  bloques donde caen, y bola de fuego volumétrica (raymarching)
// ============================================================================
function boomCfg() { const o = SETTINGS.physics && SETTINGS.physics.explosions; return Object.assign({ on: true, debris: 1, place: true }, o || {}); }
const DEB = { list: [], maxQ: [12, 40, 70, 90] };
// ¿este bloque sale volando? (los líquidos, plantas, antorchas, fuego y contenedores no)
function debrisOk(b) {
  const d = REG[b]; if (!d || !d.isBlock || d.liquid || d.ui || d.portal || d.endPortal) return false;
  if (d.render === 'cross' || d.render === 'fire' || d.render === 'none' || d.render === 'snow') return false;
  if (b === ID.bedrock || b === ID.tnt || d.trans === 2 || d.leaves) return false; // el cristal y el hielo se rompen en esquirlas; las hojas se deshacen
  if (d.render === 'box' && d.box && (d.box[4] - d.box[1]) < 6) return false; // cosas planas (alfombras, raíles...) no
  return true;
}
// matriz de rotación 3x3 (por columnas) a partir de eje-ángulo
function rotAxis(ax, ay, az, a) { const c = Math.cos(a), s = Math.sin(a), t = 1 - c; return [t * ax * ax + c, t * ax * ay + s * az, t * ax * az - s * ay, t * ax * ay - s * az, t * ay * ay + c, t * ay * az + s * ax, t * ax * az + s * ay, t * ay * az - s * ax, t * az * az + c]; }
function mul3(a, b) { const r = new Array(9); for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) r[c * 3 + rr] = a[rr] * b[c * 3] + a[3 + rr] * b[c * 3 + 1] + a[6 + rr] * b[c * 3 + 2]; return r; }
function ortho3(m) { // Gram-Schmidt para que la rotación no se deforme con el tiempo
  let x = [m[0], m[1], m[2]], y = [m[3], m[4], m[5]]; let l = Math.hypot(...x); x = x.map(v => v / l);
  const d = x[0] * y[0] + x[1] * y[1] + x[2] * y[2]; y = [y[0] - x[0] * d, y[1] - x[1] * d, y[2] - x[2] * d]; l = Math.hypot(...y); y = y.map(v => v / l);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]; return [...x, ...y, ...z];
}
function spawnDebris(dim, b, meta, x, y, z, vx, vy, vz, wx, wy, wz, visual) {
  const e = { dim, b, meta, x, y, z, vx, vy, vz, wx, wy, wz, rot: [1, 0, 0, 0, 1, 0, 0, 0, 1], w: 0.8, h: 0.8, step: 0, onGround: false, rest: 0, age: 0, visual: !!visual };
  DEB.list.push(e); return e;
}
// llamado desde explode(): decide qué bloques salen volando (devuelve true si se encarga del bloque)
function debrisFromExplosion(world, bx, by, bz, b, x, y, z, power, n) {
  if (!boomCfg().on || !debrisOk(b)) return false;
  const max = Math.round(DEB.maxQ[R.q] * boomCfg().debris); if (n >= max || DEB.list.length > 260) return false;
  const cx = bx + 0.5, cy = by + 0.5, cz = bz + 0.5; let dx = cx - x, dy = cy - y, dz = cz - z; const d = Math.hypot(dx, dy, dz) || 0.5;
  dx /= d; dy /= d; dz /= d; const sp = clamp(power * 7 / (0.6 + d * 0.55), 4, 26) * (0.7 + Math.random() * 0.6);
  const vx = dx * sp + (Math.random() - 0.5) * 3, vy = Math.max(dy, 0.15) * sp + 4 + Math.random() * 4, vz = dz * sp + (Math.random() - 0.5) * 3;
  const wx = (Math.random() - 0.5) * 16, wy = (Math.random() - 0.5) * 16, wz = (Math.random() - 0.5) * 16;
  const meta = world.getMeta(bx, by, bz);
  spawnDebris(world.dim, b, meta, cx, cy - 0.4, cz, vx, vy, vz, wx, wy, wz, false);
  if (G.net && G.net.role === 'host') { (DEB.netOut || (DEB.netOut = [])).push([b, meta, +cx.toFixed(2), +(cy - 0.4).toFixed(2), +cz.toFixed(2), +vx.toFixed(2), +vy.toFixed(2), +vz.toFixed(2), +wx.toFixed(1), +wy.toFixed(1), +wz.toFixed(1)]); }
  return true;
}
function debrisNetFlush(dim) { if (DEB.netOut && DEB.netOut.length && G.net && G.net.role === 'host') netBroadcast({ t: 'deb', d: dim, l: DEB.netOut }); DEB.netOut = null; }
function debrisNetRecv(m) { for (const a of m.l) spawnDebris(m.d, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], true); }
// busca una celda libre cerca de donde quedó el bloque y lo vuelve a colocar
function debrisPlace(w, e) {
  const x0 = Math.floor(e.x), y0 = Math.floor(e.y + 0.2), z0 = Math.floor(e.z);
  const free = (x, y, z) => { const b = w.get(x, y, z); return b === 0 || (b > 0 && REG[b] && (REG[b].replace || REG[b].liquid) && b !== ID.lava); };
  const cand = [[0, 0, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 2, 0], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]];
  for (const [dx, dy, dz] of cand) {
    const x = x0 + dx, y = y0 + dy, z = z0 + dz; if (y < 1 || y >= w.H - 1) continue; if (!free(x, y, z)) continue;
    let meta = REG[e.b].log ? (Math.abs(e.rot[4]) > 0.7 ? 0 : Math.abs(e.rot[1]) > 0.7 ? 1 : 2) : (REG[e.b].shape ? 0 : e.meta); // los troncos quedan en la dirección en que cayeron
    setBlockNet(w, x, y, z, e.b, meta); return true;
  }
  return false;
}
function debrisHitEntities(e, sp) {
  for (const o of [...G.entities.values(), G.player]) {
    if (!o || o.dead || o.removed || o.dim !== e.dim || o.type === 'item' || o instanceof Projectile) continue;
    const hw = (o.w || 0.6) / 2 + 0.4; if (Math.abs(o.x - e.x) > hw || Math.abs(o.z - e.z) > hw || e.y + 0.4 < o.y || e.y - 0.4 > o.y + (o.h || 1.8)) continue;
    const dmg = Math.ceil((sp - 7) / 3); hurtEntity(o, dmg, null, e.vx * 0.25, 3, e.vz * 0.25, 'explosion'); e.vx *= 0.4; e.vz *= 0.4; e.hitT = 0.5; return;
  }
}
function debrisUpdate(dt) {
  if (!DEB.list.length) return; dt = Math.min(dt, 0.05);
  const host = !G.net || G.net.role === 'host';
  for (let i = DEB.list.length - 1; i >= 0; i--) {
    const e = DEB.list[i]; const w = G.worlds && G.worlds[e.dim]; if (!w) { DEB.list.splice(i, 1); continue; }
    e.age += dt; if (e.hitT) e.hitT = Math.max(0, e.hitT - dt);
    // gravedad, aire
    e.vy -= 26 * dt; const drag = Math.exp(-0.15 * dt); e.vx *= drag; e.vz *= drag; e.vy = Math.max(e.vy, -45);
    const vxB = e.vx, vyB = e.vy, vzB = e.vz;
    // moveEntity trabaja con la base de la caja: y = centro - h/2
    e.y -= e.h / 2; moveEntity(w, e, e.vx * dt, e.vy * dt, e.vz * dt); e.y += e.h / 2;
    // rebotes con poca energía (restitución ~0,3) y giro al chocar
    if (e.vc && vyB < -3) { e.vy = -vyB * 0.28; e.wx += vzB * 0.9; e.wz -= vxB * 0.9; playSound('step_stone', e.x, e.y, e.z, Math.min(0.5, -vyB * 0.03)); if (Math.random() < 0.5) blockParticles(w, e.x - 0.5, e.y - 0.5, e.z - 0.5, e.b, 4, 2); }
    if (e.hc) { if (Math.abs(vxB) > 1 && e.vx === 0) e.vx = -vxB * 0.25; if (Math.abs(vzB) > 1 && e.vz === 0) e.vz = -vzB * 0.25; e.wy += (Math.random() - 0.5) * 6; }
    if (e.onGround) { const f = Math.exp(-7 * dt); e.vx *= f; e.vz *= f; e.wx *= Math.exp(-5 * dt); e.wy *= Math.exp(-5 * dt); e.wz *= Math.exp(-5 * dt); }
    // girar
    const wl = Math.hypot(e.wx, e.wy, e.wz); if (wl > 0.01) { e.rot = mul3(rotAxis(e.wx / wl, e.wy / wl, e.wz / wl, wl * dt), e.rot); if (((e.age * 60) | 0) % 30 === 0) e.rot = ortho3(e.rot); }
    const sp = Math.hypot(e.vx, e.vy, e.vz);
    if (host && sp > 9 && !e.hitT && ((e.age * 20) | 0) % 2 === 0) debrisHitEntities(e, sp);
    // en reposo → vuelve a ser bloque
    if (e.onGround && sp < 0.8 && wl < 2.5) e.rest += dt; else e.rest = 0;
    const done = e.rest > 0.35 || e.age > 12 || e.y < -10;
    if (done) {
      DEB.list.splice(i, 1);
      if (!e.visual && host) { if (!(boomCfg().place && debrisPlace(w, e))) dropBlockItems(w, Math.floor(e.x), Math.floor(e.y), Math.floor(e.z), e.b, null, true); }
    }
  }
}
// dibujo: cubos texturizados girando (también en la pasada de sombras, porque se llama desde drawAllEntities)
const _dm = new Float32Array(16);
function drawDebris(dim) {
  if (!DEB.list.length) return; const m = _dm, cam = R.cam;
  for (const e of DEB.list) {
    if (e.dim !== dim) continue; const r = e.rot; const d = REG[e.b]; if (!d || !d.faces) continue;
    const L = G.worlds[dim].light(Math.floor(e.x), Math.floor(e.y + 0.5), Math.floor(e.z));
    const s = 0.98; m[0] = r[0] * s; m[1] = r[1] * s; m[2] = r[2] * s; m[3] = 0; m[4] = r[3] * s; m[5] = r[4] * s; m[6] = r[5] * s; m[7] = 0; m[8] = r[6] * s; m[9] = r[7] * s; m[10] = r[8] * s; m[11] = 0;
    m[12] = e.x - cam[0] - (m[0] + m[4] + m[8]) * 0.5; m[13] = e.y - cam[1] - (m[1] + m[5] + m[9]) * 0.5; m[14] = e.z - cam[2] - (m[2] + m[6] + m[10]) * 0.5; m[15] = 1;
    drawBox(m, d.faces, L, d.tint || d.tintTop ? [0.55, 0.72, 0.36, 1] : null, null, d.emissive ? 0.6 : 0);
  }
}
// ---------------------------------------------------------------- bola de fuego volumétrica
const BOOM = { list: [], prog: null, vao: null, buf: null, data: new Float32Array(8 * 16) };
const VS_BOOM = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec4 i_a; layout(location=2) in vec4 i_b;
uniform mat4 u_vp; out vec3 v_p; flat out vec4 v_a; flat out vec4 v_b;
void main(){ float R=i_a.w; vec3 c=i_a.xyz+vec3(0.0,R*0.35,0.0); vec3 p=c+(a_pos*2.0-1.0)*vec3(R,R*1.35,R); v_p=p; v_a=i_a; v_b=i_b; gl_Position=u_vp*vec4(p,1.0); }`;
const FS_BOOM = `#version 300 es
${'##COMMON##'}
precision highp sampler3D;
uniform sampler3D u_noise; uniform sampler2D u_depthCopy; uniform vec2 u_res; uniform float u_near; uniform float u_far; uniform vec3 u_camFwd;
in vec3 v_p; flat in vec4 v_a; flat in vec4 v_b; out vec4 o;
float linD(float d){ float z=d*2.0-1.0; return 2.0*u_near*u_far/(u_far+u_near-z*(u_far-u_near)); }
float n3(vec3 p){ return texture(u_noise,p*0.125).r; }
vec3 bb(float t){ vec3 c=vec3(0.45,0.03,0.0)*smoothstep(0.0,0.15,t); c=mix(c,vec3(1.0,0.25,0.02),smoothstep(0.1,0.4,t)); c=mix(c,vec3(1.0,0.6,0.15),smoothstep(0.38,0.7,t)); return mix(c,vec3(1.0,0.92,0.75),smoothstep(0.7,1.05,t)); }
void main(){
  float Rm=v_a.w, age=v_b.x, seed=v_b.y; vec3 rd=normalize(v_p);
  float grow=1.0-exp(-age*9.0); float r=Rm*(0.25+0.75*grow); vec3 c=v_a.xyz+vec3(0.0,age*Rm*0.18+r*0.15,0.0);
  // intersección con el elipsoide (algo más alto que ancho: la bola sube)
  vec3 sc=vec3(1.0,0.85,1.0); vec3 oc=-c/sc, dd=rd/sc; float A=dot(dd,dd), B=dot(oc,dd), C=dot(oc,oc)-r*r*1.1; float D=B*B-A*C; if(D<0.0) discard;
  float sq=sqrt(D); float ta=max((-B-sq)/A,0.0), tb=(-B+sq)/A;
  float sd=linD(texture(u_depthCopy,gl_FragCoord.xy/u_res).r)/max(dot(rd,u_camFwd),1e-3); tb=min(tb,sd); if(tb<=ta) discard;
  const int N=${'##BSTEPS##'}; float dt=(tb-ta)/float(N); float j=fract(52.9829*fract(dot(gl_FragCoord.xy,vec2(0.06711,0.00584))));
  float heat0=exp(-age*1.05); vec3 col=vec3(0.0); float T=1.0;
  for(int i=0;i<N;i++){
    vec3 p=rd*(ta+(float(i)+j)*dt); vec3 q=(p-c)/sc; float l=length(q)/r;
    vec3 wp=(p+u_camPos)*0.55+seed*7.0; vec3 w2=vec3(n3(wp*0.5+age*0.8),n3(wp*0.5+3.1-age*0.6),n3(wp*0.5+6.7))-0.5;
    float n=n3(wp+w2*2.5+vec3(0.0,-age*2.2,0.0))*0.6+n3(wp*2.1+w2)*0.4;
    float den=smoothstep(1.05,0.55,l+(n-0.5)*0.75); if(den<0.01) continue;
    float temp=heat0*(1.45-l*0.85)+(n-0.5)*0.5*heat0; temp=clamp(temp,0.0,1.1);
    float soot=den*(1.0-smoothstep(0.08,0.38,temp))*(0.4+0.8*(1.0-heat0)); // donde se enfría (sobre todo el borde y al final), hollín oscuro
    float sig=den*(0.6+soot*2.2)*1.3;
    vec3 em=bb(temp)*smoothstep(0.05,0.35,temp)*(2.0+temp*6.5);
    vec3 dark=vec3(0.06,0.055,0.05)*(u_amb*1.4+u_sunCol*0.3+em*0.1);
    col+=T*(em*den+dark*soot)*dt*1.6; T*=exp(-sig*dt); if(T<0.02) break;
  }
  o=vec4(col,1.0-T);
}`;
function boomInitGL() {
  const gl = R.gl; BOOM.prog = null; BOOM.gl = gl; BOOM.q = R.q;
  try { BOOM.prog = compile(VS_BOOM, FS_BOOM.replace('##BSTEPS##', R.q >= 3 ? '40' : '26')); } catch (e) { console.error('BOOM', e); BOOM.failed = true; return; }
  const pos = [], idx = []; for (let i = 0; i < 8; i++) pos.push(i & 1, (i >> 1) & 1, (i >> 2) & 1);
  for (const f of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) idx.push(f[0], f[1], f[2], f[0], f[2], f[3]);
  BOOM.vao = gl.createVertexArray(); gl.bindVertexArray(BOOM.vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  BOOM.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, BOOM.buf); gl.bufferData(gl.ARRAY_BUFFER, BOOM.data.byteLength, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 2; i++) { gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 32, i * 16); gl.vertexAttribDivisor(1 + i, 1); }
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
}
function boomVolumetric() { return R.q >= 2 && !!R.fbo.copy && !!R.fbo.fl && !BOOM.failed && typeof VFX !== 'undefined' && VFX.noise; }
function boomAdd(dim, x, y, z, power) { BOOM.list.push({ dim, x, y, z, R: 1.2 + power * 0.85, t: 0, seed: Math.random() * 10, dur: 2.2 + power * 0.25 }); if (BOOM.list.length > 12) BOOM.list.shift(); }
function boomUpdate(dt) { for (let i = BOOM.list.length - 1; i >= 0; i--) { const b = BOOM.list[i]; b.t += dt; if (b.t > b.dur) BOOM.list.splice(i, 1); } }
function drawBooms() {
  if (!BOOM.list.length || !boomVolumetric() || !G.player) return;
  if (BOOM.gl !== R.gl || BOOM.q !== R.q || !BOOM.prog) { boomInitGL(); if (!BOOM.prog) return; }
  const gl = R.gl, P = BOOM.prog, fl = R.fbo.fl, cam = R.cam, D = BOOM.data; let n = 0;
  for (const b of BOOM.list) { if (b.dim !== G.player.dim || n >= 16) continue; const o = n * 8; D[o] = b.x - cam[0]; D[o + 1] = b.y - cam[1]; D[o + 2] = b.z - cam[2]; D[o + 3] = b.R; D[o + 4] = b.t; D[o + 5] = b.seed; D[o + 6] = 0; D[o + 7] = 0; n++; }
  if (!n) return;
  gl.useProgram(P.p); setCommon(P); gl.uniformMatrix4fv(P.u.u_vp, false, R.vp); const v = R.view; gl.uniform3f(P.u.u_camFwd, -v[2], -v[6], -v[10]);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.fbo.copy.depth); gl.uniform1i(P.u.u_depthCopy, 3); gl.uniform2f(P.u.u_res, fl.w, fl.h); gl.uniform1f(P.u.u_near, R.near); gl.uniform1f(P.u.u_far, R.far);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, VFX.noise); gl.uniform1i(P.u.u_noise, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fl.fb); gl.viewport(0, 0, fl.w, fl.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(BOOM.vao); gl.bindBuffer(gl.ARRAY_BUFFER, BOOM.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, D, 0, n * 8);
  gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, n); R.stats.draws++; gl.cullFace(gl.BACK);
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.scene.fb); gl.viewport(0, 0, R.w, R.h); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const C = VFX.progs.comp; gl.useProgram(C.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fl.tex); gl.uniform1i(C.u.u_tex, 0); gl.uniform2f(C.u.u_px, 1 / fl.w, 1 / fl.h);
  gl.bindVertexArray(R.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); R.stats.draws++;
  gl.enable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(true);
}
// onda expansiva: distorsión en pantalla (calidad Alta+) para la explosión más reciente cercana
function boomShock() {
  const b = BOOM.list[BOOM.list.length - 1]; if (!b || R.q < 2 || !G.player || b.dim !== G.player.dim || b.t > 0.6) return [0, 0, 0, 0];
  const s = M4.xform(R.vp, b.x - R.cam[0], b.y + 0.5 - R.cam[1], b.z - R.cam[2]); if (s[3] <= 0) return [0, 0, 0, 0];
  const dist = Math.max(1, s[3]); const rad = (b.t * 34) / dist * (R.proj[5] * 0.5); const str = 0.025 * (1 - b.t / 0.6) * Math.min(1, b.R / 4) * Math.min(1, 25 / dist);
  return [s[0] * 0.5 + 0.5, s[1] * 0.5 + 0.5, rad, str];
}
(R.restoreHooks = R.restoreHooks || []).push(() => { BOOM.prog = null; BOOM.gl = null; });
