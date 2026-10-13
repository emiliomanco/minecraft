// ============================================================================
//  Fuego y humo como fluido (Euler) en la GPU, brasas que propagan y fuegos que se funden
// ============================================================================
// Alrededor del grupo de fuegos más cercano se simula una rejilla de 48×64×48 celdas de 1/3 de bloque:
// velocidad, humo, temperatura y reacción (la llama). Cada bloque que arde inyecta combustible en la cara que
// toca la llama (suelo, pared o techo), así la llama nace pegada a lo que se quema. El calor empuja hacia arriba
// (flotación), el humo pesa, la presión se proyecta (fluido incompresible) y los bloques sólidos frenan el flujo.
// Varios fuegos juntos suman calor en la misma rejilla: sus llamas se unen en una sola más alta y más intensa.
// Se dibuja con raymarching (emisión de cuerpo negro de la llama + humo iluminado). Las cajas procedurales de
// l_vfx.js siguen dibujando los fuegos que quedan fuera de la rejilla.
const EF = { ok: false, gl: null, NX: 48, NY: 64, NZ: 48, CS: 1 / 3, TW: 8, AW: 384, AH: 384, org: [0, 0, 0], active: false, acc: 0, srcT: 0, solT: 0, cur: 0, scur: 0, pcur: 0, world: null, nsrc: 0 };
const GLSL_EFHEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D u_vel, u_scal, u_p, u_div, u_sol, u_src; uniform float u_dt, u_time; uniform vec2 u_wind;
const int NX=48, NY=64, NZ=48; const float AW=384.0;
ivec2 at(ivec3 c){ return ivec2((c.y&7)*NX+c.x,(c.y>>3)*NZ+c.z); }
ivec3 cellOf(){ ivec2 f=ivec2(gl_FragCoord.xy); int tx=f.x/NX, ty=f.y/NZ; return ivec3(f.x-tx*NX,ty*8+tx,f.y-ty*NZ); }
bool inside(ivec3 c){ return c.x>=0&&c.y>=0&&c.z>=0&&c.x<NX&&c.y<NY&&c.z<NZ; }
vec4 F(sampler2D s, ivec3 c){ c=clamp(c,ivec3(0),ivec3(NX-1,NY-1,NZ-1)); return texelFetch(s,at(c),0); }
float SOL(ivec3 c){ if(!inside(c)) return c.y<0?1.0:0.0; return texelFetch(u_sol,at(c),0).r; }
// muestreo trilineal en unidades de celda (centros en i+0.5)
vec4 S(sampler2D s, vec3 p){ p=clamp(p,vec3(0.5),vec3(float(NX)-0.5,float(NY)-0.5,float(NZ)-0.5)); float y=p.y-0.5; int j0=int(floor(y)); float fy=y-float(j0); int j1=min(j0+1,NY-1);
  vec2 a0=(vec2(float((j0&7)*NX),float((j0>>3)*NZ))+p.xz)/AW, a1=(vec2(float((j1&7)*NX),float((j1>>3)*NZ))+p.xz)/AW; return mix(texture(s,a0),texture(s,a1),fy); }
float h13(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
`;
// 1) advección de la velocidad + flotación + fuentes + turbulencia
const FS_EFVEL = GLSL_EFHEAD + `out vec4 o;
void main(){ ivec3 c=cellOf(); if(SOL(c)>0.5){ o=vec4(0.0); return; }
  vec3 p=vec3(c)+0.5; vec3 v=F(u_vel,c).xyz; vec3 b=p-v*u_dt*3.0; vec3 nv=S(u_vel,b).xyz;
  vec4 s=F(u_scal,c); float src=texelFetch(u_src,at(c),0).r;
  nv.y+=(s.g*18.0-s.r*0.35)*u_dt; if(nv.y>8.0) nv.y=8.0; // flotación: el calor sube, el humo frío pesa
  nv.xz+=u_wind*0.6*u_dt*clamp(float(c.y)/20.0,0.0,1.0); // algo de viento arriba
  // turbulencia: remolinos donde hay calor (lenguas que se separan y ondulan)
  vec3 q=vec3(c)*0.35+vec3(0.0,-u_time*3.0,0.0); float tt=floor(u_time*8.0);
  vec3 r=vec3(h13(floor(q)+tt),h13(floor(q)+tt+7.1),h13(floor(q)+tt+13.7))-0.5; nv+=r*vec3(9.0,3.0,9.0)*s.g*u_dt;
  nv.y+=src*2.5*u_dt;
  o=vec4(nv*0.995,0.0); }`;
// 2) divergencia
const FS_EFDIV = GLSL_EFHEAD + `out vec4 o;
float vc(ivec3 c, int ax){ if(SOL(c)>0.5) return 0.0; vec3 v=F(u_vel,c).xyz; return ax==0?v.x:ax==1?v.y:v.z; }
void main(){ ivec3 c=cellOf(); float d=(vc(c+ivec3(1,0,0),0)-vc(c-ivec3(1,0,0),0)+vc(c+ivec3(0,1,0),1)-vc(c-ivec3(0,1,0),1)+vc(c+ivec3(0,0,1),2)-vc(c-ivec3(0,0,1),2))*0.5; o=vec4(d,0.0,0.0,0.0); }`;
// 3) presión (Jacobi)
const FS_EFJAC = GLSL_EFHEAD + `out vec4 o;
float pc(ivec3 c, float pself){ if(SOL(c)>0.5) return pself; if(c.y>=NY) return 0.0; return F(u_p,c).r; }
void main(){ ivec3 c=cellOf(); float ps=F(u_p,c).r;
  float s=pc(c+ivec3(1,0,0),ps)+pc(c-ivec3(1,0,0),ps)+pc(c+ivec3(0,1,0),ps)+pc(c-ivec3(0,1,0),ps)+pc(c+ivec3(0,0,1),ps)+pc(c-ivec3(0,0,1),ps);
  o=vec4((s-F(u_div,c).r)/6.0,0.0,0.0,0.0); }`;
// 4) quitar el gradiente de presión (flujo sin divergencia)
const FS_EFPROJ = GLSL_EFHEAD + `out vec4 o;
float pc(ivec3 c, float pself){ if(SOL(c)>0.5) return pself; return F(u_p,c).r; }
void main(){ ivec3 c=cellOf(); if(SOL(c)>0.5){ o=vec4(0.0); return; } float ps=F(u_p,c).r;
  vec3 g=vec3(pc(c+ivec3(1,0,0),ps)-pc(c-ivec3(1,0,0),ps),pc(c+ivec3(0,1,0),ps)-pc(c-ivec3(0,1,0),ps),pc(c+ivec3(0,0,1),ps)-pc(c-ivec3(0,0,1),ps))*0.5;
  o=vec4(F(u_vel,c).xyz-g,0.0); }`;
// 5) escalares: humo (r), temperatura (g), reacción = llama (b), vapor (a)
const FS_EFSCAL = GLSL_EFHEAD + `out vec4 o;
void main(){ ivec3 c=cellOf(); if(SOL(c)>0.5){ o=vec4(0.0); return; }
  vec3 p=vec3(c)+0.5; vec3 v=F(u_vel,c).xyz; vec4 s=S(u_scal,p-v*u_dt*3.0); float src=texelFetch(u_src,at(c),0).r;
  float reac=max(s.b*0.94,src*(0.75+0.5*h13(vec3(c)+floor(u_time*12.0)))); // la llama se consume rápido; el combustible la renueva en las caras que arden
  float temp=s.g*0.965+reac*0.07+src*0.08;
  float smoke=s.r*0.996+reac*0.035;
  o=vec4(min(smoke,4.0),min(temp,3.0),min(reac,1.5),s.a*0.97); }`;
// dibujo: raymarching de la rejilla
const FS_EFDRAW = `#version 300 es
${'##COMMON##'}
uniform sampler2D u_scal; uniform sampler2D u_depthCopy; uniform mat4 u_invVP; uniform vec3 u_gmin; uniform vec3 u_gsize; uniform vec3 u_camFwd; uniform float u_near; uniform float u_far;
in vec2 v_uv; out vec4 o;
const int NX=48, NY=64, NZ=48; const float AW=384.0;
float linD(float d){ float z=d*2.0-1.0; return 2.0*u_near*u_far/(u_far+u_near-z*(u_far-u_near)); }
vec4 Sm(vec3 p){ p=clamp(p,vec3(0.5),vec3(float(NX)-0.5,float(NY)-0.5,float(NZ)-0.5)); float y=p.y-0.5; int j0=int(floor(y)); float fy=y-float(j0); int j1=min(j0+1,NY-1);
  vec2 a0=(vec2(float((j0&7)*NX),float((j0>>3)*NZ))+p.xz)/AW, a1=(vec2(float((j1&7)*NX),float((j1>>3)*NZ))+p.xz)/AW; return mix(texture(u_scal,a0),texture(u_scal,a1),fy); }
vec3 bb(float t){ vec3 c=vec3(0.5,0.035,0.0)*smoothstep(0.0,0.2,t); c=mix(c,vec3(1.0,0.27,0.02),smoothstep(0.12,0.42,t)); c=mix(c,vec3(1.0,0.58,0.12),smoothstep(0.38,0.75,t)); return mix(c,vec3(1.0,0.86,0.55),smoothstep(0.75,1.1,t)); }
void main(){
  vec4 cc=u_invVP*vec4(v_uv*2.0-1.0,1.0,1.0); vec3 rd=normalize(cc.xyz/cc.w);
  vec3 ir=1.0/rd; vec3 t0=u_gmin*ir, t1=(u_gmin+u_gsize)*ir; vec3 tn=min(t0,t1), tf=max(t0,t1);
  float ta=max(max(tn.x,tn.y),max(tn.z,0.0)), tb=min(min(tf.x,tf.y),tf.z);
  float sd=linD(texture(u_depthCopy,v_uv).r)/max(dot(rd,u_camFwd),1e-3); tb=min(tb,sd);
  if(tb<=ta){ o=vec4(0.0); return; }
  const int N=${'##EFSTEPS##'}; float dt=max((tb-ta)/float(N),0.06); float j=fract(52.9829*fract(dot(gl_FragCoord.xy,vec2(0.06711,0.00584))));
  vec3 col=vec3(0.0); float T=1.0; vec3 scale=vec3(float(NX),float(NY),float(NZ))/u_gsize;
  for(int i=0;i<N;i++){ float t=ta+(float(i)+j)*dt; if(t>tb) break; vec3 p=rd*t; vec4 s=Sm((p-u_gmin)*scale);
    float fl=s.b+max(s.g-0.35,0.0)*0.25, sm=s.r, tp=s.g; if(fl+sm<0.004) continue; // el gas muy caliente también brilla
    float sig=sm*1.4+fl*1.1;
    vec3 em=bb(clamp(tp*0.45+fl*0.55,0.0,1.2))*(1.0-exp(-fl*2.2))*6.0; // se satura suave: lenguas translúcidas, no una losa
    vec3 li=u_amb*0.9+u_sunCol*0.35+bb(0.4)*min(tp,1.5)*1.2; vec3 alb=vec3(0.06,0.055,0.05);
    col+=T*(em+alb*li*sm*1.4)*dt; T*=exp(-sig*dt); if(T<0.02) break; }
  o=vec4(col,1.0-T);
}`;
function efInit() {
  const gl = R.gl; EF.gl = gl; EF.ok = false; if (!R.cfb) return;
  try { const C = (fs) => compileRaw(VS_FLQUAD, fs);
    EF.P = { vel: C(FS_EFVEL), div: C(FS_EFDIV), jac: C(FS_EFJAC), proj: C(FS_EFPROJ), scal: C(FS_EFSCAL), draw: compile(VS_FULL, FS_EFDRAW.replace('##EFSTEPS##', R.q >= 3 ? '56' : '40')) };
  } catch (e) { console.warn('fuego Euler', e); return; }
  const mk = (ifmt, fmt, type, lin) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, EF.AW, EF.AH, 0, fmt, type, null);
    const f = lin ? gl.LINEAR : gl.NEAREST; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const fb = t => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE ? f : null; };
  EF.vel = [mk(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, true), mk(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, true)];
  EF.scal = [mk(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, true), mk(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, true)];
  EF.p = [mk(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, false), mk(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, false)]; EF.div = mk(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, false);
  EF.sol = mk(gl.R8, gl.RED, gl.UNSIGNED_BYTE, false); EF.src = mk(gl.R8, gl.RED, gl.UNSIGNED_BYTE, false);
  EF.fbVel = EF.vel.map(fb); EF.fbScal = EF.scal.map(fb); EF.fbP = EF.p.map(fb); EF.fbDiv = fb(EF.div);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if ([...EF.fbVel, ...EF.fbScal, ...EF.fbP, EF.fbDiv].some(f => !f)) return;
  EF.solData = new Uint8Array(EF.AW * EF.AH); EF.srcData = new Uint8Array(EF.AW * EF.AH);
  EF.ok = true; efClear();
}
function efClear() { const gl = R.gl; for (const f of [...EF.fbVel, ...EF.fbScal, ...EF.fbP, EF.fbDiv]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
// índice en el atlas de la celda (i, j, k)
const efAt = (i, j, k) => ((j >> 3) * EF.NZ + k) * EF.AW + (j & 7) * EF.NX + i;
function efUpload(tex, data) { const gl = R.gl; gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, EF.AW, EF.AH, gl.RED, gl.UNSIGNED_BYTE, data); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); }
// bloques sólidos de la región (cada bloque = 3×3×3 celdas)
function efSolids(w) {
  const D = EF.solData; D.fill(0); const [ox, oy, oz] = EF.org; const BX = EF.NX / 3, BY = Math.ceil(EF.NY / 3), BZ = EF.NZ / 3;
  for (let by = 0; by < BY; by++) for (let bz = 0; bz < BZ; bz++) for (let bx = 0; bx < BX; bx++) {
    const b = w.get(ox + bx, oy + by, oz + bz); if (!(b > 0 && REG[b] && (REG[b].solid || REG[b].liquid) && !REG[b].leaves)) continue;
    for (let j = by * 3; j < Math.min(EF.NY, by * 3 + 3); j++) for (let k = bz * 3; k < bz * 3 + 3; k++) for (let i = bx * 3; i < bx * 3 + 3; i++) D[efAt(i, j, k)] = 255;
  }
  efUpload(EF.sol, D);
}
// combustible: en cada fuego, la capa de celdas pegada a lo que arde (suelo, paredes, techo)
function efSources(w, fires) {
  const D = EF.srcData; D.fill(0); const [ox, oy, oz] = EF.org; let n = 0;
  const fl = id => id > 0 && REG[id] && (REG[id].flammable || REG[id].infiniteFire);
  for (const f of fires) {
    const x = Math.floor(f[0]), y = Math.floor(f[1]), z = Math.floor(f[2]); const bx = x - ox, by = y - oy, bz = z - oz;
    if (bx < 0 || bz < 0 || by < 0 || bx >= EF.NX / 3 || bz >= EF.NZ / 3 || by * 3 + 2 >= EF.NY) continue;
    let burn = 0; if (fl(w.get(x, y - 1, z))) burn |= 1; if (fl(w.get(x + 1, y, z))) burn |= 2; if (fl(w.get(x - 1, y, z))) burn |= 4; if (fl(w.get(x, y, z + 1))) burn |= 8; if (fl(w.get(x, y, z - 1))) burn |= 16; if (fl(w.get(x, y + 1, z))) burn |= 32;
    if (!burn) burn = 1;
    let nb = 0; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if ((dx || dy || dz) && w.get(x + dx, y + dy, z + dz) === ID.fire) nb++;
    const v = Math.min(255, 150 + nb * 14); // fuegos juntos: más calor (se funden en una llama mayor)
    const put = (i, j, k) => { const a = efAt(bx * 3 + i, by * 3 + j, bz * 3 + k); if (D[a] < v) D[a] = v; };
    for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 3; b2++) {
      if (burn & 1) put(a, 0, b2); if (burn & 32) put(a, 2, b2);
      if (burn & 2) put(2, a, b2); if (burn & 4) put(0, a, b2); if (burn & 8) put(a, b2, 2); if (burn & 16) put(a, b2, 0);
    }
    n++;
  }
  efUpload(EF.src, D); return n;
}
function efPass(P, fb) { const gl = R.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, EF.AW, EF.AH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
function efBind(P, name, unit, t) { const gl = R.gl; if (P.u[name] === undefined) return; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(P.u[name], unit); }
function efCommon(P) { const gl = R.gl; if (P.u.u_dt) gl.uniform1f(P.u.u_dt, 1 / 30); if (P.u.u_time) gl.uniform1f(P.u.u_time, performance.now() / 1000); if (P.u.u_wind) gl.uniform2f(P.u.u_wind, (SMK.wind || [0, 0])[0], (SMK.wind || [0, 0])[1]); efBind(P, 'u_sol', 6, EF.sol); efBind(P, 'u_src', 7, EF.src); }
function efStep() {
  const gl = R.gl; let P;
  P = EF.P.vel; gl.useProgram(P.p); efCommon(P); efBind(P, 'u_vel', 0, EF.vel[EF.cur]); efBind(P, 'u_scal', 1, EF.scal[EF.scur]); efPass(P, EF.fbVel[1 - EF.cur]); EF.cur = 1 - EF.cur;
  P = EF.P.div; gl.useProgram(P.p); efCommon(P); efBind(P, 'u_vel', 0, EF.vel[EF.cur]); efPass(P, EF.fbDiv);
  P = EF.P.jac; gl.useProgram(P.p); efCommon(P); efBind(P, 'u_div', 3, EF.div);
  for (let i = 0; i < 12; i++) { efBind(P, 'u_p', 2, EF.p[EF.pcur]); efPass(P, EF.fbP[1 - EF.pcur]); EF.pcur = 1 - EF.pcur; }
  P = EF.P.proj; gl.useProgram(P.p); efCommon(P); efBind(P, 'u_vel', 0, EF.vel[EF.cur]); efBind(P, 'u_p', 2, EF.p[EF.pcur]); efPass(P, EF.fbVel[1 - EF.cur]); EF.cur = 1 - EF.cur;
  P = EF.P.scal; gl.useProgram(P.p); efCommon(P); efBind(P, 'u_vel', 0, EF.vel[EF.cur]); efBind(P, 'u_scal', 1, EF.scal[EF.scur]); efPass(P, EF.fbScal[1 - EF.scur]); EF.scur = 1 - EF.scur;
}
// por cuadro: elegir la región (grupo de fuegos más cercano), actualizar fuentes y dar pasos a 30 Hz
function efUpdate(w, dt) {
  const gl = R.gl; if (!gl || !G.player) return; EF.active = false;
  if (!(typeof vfxVolumetric === 'function' && vfxVolumetric() && vfxCfg().fire.on)) return;
  if (EF.gl !== gl) efInit(); if (!EF.ok) return;
  const fires = G._fires || []; const p = G.player; let best = null, bd = 24 * 24;
  for (const f of fires) { const d = (f[0] - p.x) ** 2 + (f[2] - p.z) ** 2 + ((f[1] - p.y) * 2) ** 2; if (d < bd) { bd = d; best = f; } }
  if (!best && EF.lastT && performance.now() - EF.lastT < 4000) best = EF.lastBest; // sigue un rato tras apagarse (humo que se va)
  if (!best) { EF.world = null; return; }
  if (best !== EF.lastBest || !EF.lastT) { EF.lastBest = best; } if (fires.length) EF.lastT = performance.now();
  // centro: media de los fuegos cercanos al elegido
  let cx = 0, cy = 0, cz = 0, n = 0; for (const f of fires) if (Math.abs(f[0] - best[0]) < 7 && Math.abs(f[2] - best[2]) < 7 && Math.abs(f[1] - best[1]) < 6) { cx += f[0]; cy += f[1]; cz += f[2]; n++; }
  if (n) { cx /= n; cy /= n; cz /= n; } else { cx = best[0]; cy = best[1]; cz = best[2]; }
  const no = [Math.floor(cx) - 8, Math.floor(cy) - 3, Math.floor(cz) - 8];
  const gl2 = gl; gl2.disable(gl.BLEND); gl2.disable(gl.DEPTH_TEST); gl2.depthMask(false); gl2.disable(gl.CULL_FACE); gl2.bindVertexArray(FL.vao || R.emptyVAO);
  if (EF.world !== w || Math.abs(no[0] - EF.org[0]) > 3 || Math.abs(no[1] - EF.org[1]) > 3 || Math.abs(no[2] - EF.org[2]) > 3) { EF.org = no; EF.world = w; efClear(); EF.solT = 0; EF.srcT = 0; }
  EF.solT -= dt; EF.srcT -= dt;
  if (EF.solT <= 0) { efSolids(w); EF.solT = 1; }
  if (EF.srcT <= 0) { EF.nsrc = efSources(w, fires); EF.srcT = 0.25; }
  EF.acc = Math.min(EF.acc + dt, 3 / 30); let k = 0; while (EF.acc >= 1 / 30 && k < 3) { EF.acc -= 1 / 30; efStep(); k++; }
  gl2.bindFramebuffer(gl.FRAMEBUFFER, null); gl2.depthMask(true); gl2.enable(gl.DEPTH_TEST); gl2.enable(gl.CULL_FACE); gl2.bindVertexArray(null); gl2.activeTexture(gl.TEXTURE0);
  EF.active = true;
}
// ¿el fuego (x,y,z) lo dibuja la rejilla?
function efCovers(x, y, z) { if (!EF.active) return false; const o = EF.org; return x >= o[0] + 1 && z >= o[2] + 1 && y >= o[1] && x < o[0] + EF.NX / 3 - 1 && z < o[2] + EF.NZ / 3 - 1 && y < o[1] + EF.NY / 3 - 2; }
function efDraw() {
  if (!EF.active || EF.world !== G.world) return; const gl = R.gl; const P = EF.P.draw; const tg = R.fbo.fl;
  gl.useProgram(P.p); setCommon(P); gl.uniformMatrix4fv(P.u.u_invVP, false, R.invVP); const v = R.view; gl.uniform3f(P.u.u_camFwd, -v[2], -v[6], -v[10]);
  gl.uniform3f(P.u.u_gmin, EF.org[0] - R.cam[0], EF.org[1] - R.cam[1], EF.org[2] - R.cam[2]); gl.uniform3f(P.u.u_gsize, EF.NX * EF.CS, EF.NY * EF.CS, EF.NZ * EF.CS);
  gl.uniform1f(P.u.u_near, R.near); gl.uniform1f(P.u.u_far, R.far);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.fbo.copy.depth); gl.uniform1i(P.u.u_depthCopy, 3);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, EF.scal[EF.scur]); gl.uniform1i(P.u.u_scal, 5);
  gl.bindFramebuffer(gl.FRAMEBUFFER, tg.fb); gl.viewport(0, 0, tg.w, tg.h); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  gl.bindVertexArray(R.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); R.stats.draws++;
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.scene.fb); gl.viewport(0, 0, R.w, R.h); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const C = VFX.progs.comp; gl.useProgram(C.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tg.tex); gl.uniform1i(C.u.u_tex, 0); gl.uniform2f(C.u.u_px, 1 / tg.w, 1 / tg.h);
  gl.drawArrays(gl.TRIANGLES, 0, 3); R.stats.draws++;
  gl.enable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(true);
}
// ---------------------------------------------------------------- brasas: chispas que vuelan con el viento y prenden lejos
const EMB = [];
function emberEmit(w, x, y, z, k) {
  if (EMB.length > 120) return;
  const a = Math.random() * 6.28, s = 0.5 + Math.random() * 2;
  EMB.push({ x: x + 0.5, y: y + 0.8, z: z + 0.5, vx: Math.cos(a) * s, vy: 3 + Math.random() * 4 * k, vz: Math.sin(a) * s, t: 0, life: 2 + Math.random() * 3, dim: w.dim });
}
function emberUpdate(w, dt) {
  if (!EMB.length) return; const wind = (typeof SMK !== 'undefined' && SMK.wind) ? SMK.wind : [0, 0]; const host = !G.net || G.net.role === 'host';
  for (let i = EMB.length - 1; i >= 0; i--) {
    const e = EMB[i]; e.t += dt; if (e.dim !== w.dim || e.t > e.life) { EMB.splice(i, 1); continue; }
    // ligeras: el aire las frena, el viento las lleva, el calor las sube al principio y luego caen
    const dr = Math.exp(-1.4 * dt); e.vx = (e.vx - wind[0] * 2.5) * dr + wind[0] * 2.5; e.vz = (e.vz - wind[1] * 2.5) * dr + wind[1] * 2.5; e.vy = e.vy * Math.exp(-0.8 * dt) - (e.t < 0.6 ? -2 : 4.5) * dt;
    const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt, nz = e.z + e.vz * dt; const b = w.get(Math.floor(nx), Math.floor(ny), Math.floor(nz));
    if (b > 0 && REG[b] && (REG[b].solid || REG[b].liquid || REG[b].leaves)) {
      // contacto: si es inflamable (y no llueve encima) prende un foco nuevo en el hueco de al lado
      if (host && REG[b].flammable && !(G.rainLevel > 0.5 && w.light(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z))[0] >= 15) && Math.random() < 0.3) {
        const ax = Math.floor(e.x), ay = Math.floor(e.y), az = Math.floor(e.z); if (w.get(ax, ay, az) === 0) w.set(ax, ay, az, ID.fire);
      }
      EMB.splice(i, 1); continue;
    }
    e.x = nx; e.y = ny; e.z = nz;
    const glow = 1 - e.t / e.life; P_({ x: e.x, y: e.y, z: e.z, life: 0.08, size: 0.05 + glow * 0.03, add: true, emis: 6 * glow, layer: TEX.spark, r: 1, g: 0.45 + glow * 0.3, b: 0.1 });
  }
}
(R.restoreHooks = R.restoreHooks || []).push(() => { EF.gl = null; EF.ok = false; });
