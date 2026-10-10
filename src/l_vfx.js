// ============================================================================
//  Efectos volumétricos: fuego (raymarching por celda) y humo (rejilla 3D simulada)
// ============================================================================
// FUEGO: cada bloque de fuego dibuja una caja que cubre su columna; dentro se recorre un campo de densidad
// definido en coordenadas del MUNDO (ruido 3D que sube), anclado a las superficies que arden (suelo, paredes,
// techo). Entre celdas vecinas con fuego no hay borde, así un grupo de fuegos es una sola llamarada continua,
// y la altura crece con la cantidad de fuego alrededor. Se acumula a media resolución y se suma a la escena.
// HUMO: rejilla de 48×40×48 bloques alrededor del jugador simulada en la CPU a 10 Hz: el humo caliente sube,
// los bloques sólidos lo frenan (se acumula bajo techos, llena habitaciones y sale por puertas y ventanas),
// el viento lo arrastra al aire libre y se disipa. Se sube como textura 3D y se dibuja con raymarching
// iluminado por el sol (con sombra propia), el cielo y el resplandor del fuego.
function vfxCfg() { const o = SETTINGS.physics || {}; return { fire: Object.assign({ on: true, height: 1 }, o.fire || {}), smoke: Object.assign({ on: true, amount: 1, life: 1 }, o.smoke || {}) }; }
function vfxVolumetric() { return R.q >= 2 && !!R.fbo.copy && !!R.fbo.fl && !VFX.failed; }

const VFX = { progs: null, noise: null, smokeTex: null, cube: null, fireVAO: null, fireBuf: null, fireData: new Float32Array(8 * 2048) };
// ---------------------------------------------------------------- shaders
const VS_FIREBOX = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec4 i_a; layout(location=2) in vec4 i_b;
uniform mat4 u_vp; out vec3 v_p; flat out vec4 v_a; flat out vec4 v_b;
void main(){ vec3 lo=i_a.xyz+vec3(0.0,-0.08,0.0), hi=i_a.xyz+vec3(1.0,i_a.w,1.0); vec3 p=mix(lo,hi,a_pos); v_p=p; v_a=i_a; v_b=i_b; gl_Position=u_vp*vec4(p,1.0); }`;
const GLSL_FIRE = `
precision highp sampler3D;
uniform sampler3D u_noise;
float n3(vec3 p){ return texture(u_noise,p*0.125).r; }
float bitm(float m, float b){ return mod(floor(m/b+0.001),2.0); }
// densidad y temperatura del fuego en el punto wp (mundo) de la celda c
vec2 fireField(vec3 wp, vec3 c, float H, float burn, float nb, float seed){
  vec3 u=wp-c; float h=u.y; if(h<-0.08||h>H) return vec2(0.0);
  float hn=clamp(h/H,0.0,1.0);
  // borde suave solo hacia celdas abiertas: entre fuegos vecinos el volumen es continuo, y contra una pared
  // (bits 16..128) la llama llega hasta la cara del bloque en vez de quedarse separada flotando
  float e=1.0;
  if(bitm(nb,1.0)+bitm(nb,16.0)<0.5) e*=smoothstep(1.02,0.7,u.x); if(bitm(nb,2.0)+bitm(nb,32.0)<0.5) e*=smoothstep(-0.02,0.3,u.x);
  if(bitm(nb,4.0)+bitm(nb,64.0)<0.5) e*=smoothstep(1.02,0.7,u.z); if(bitm(nb,8.0)+bitm(nb,128.0)<0.5) e*=smoothstep(-0.02,0.3,u.z);
  float wall=0.0; // paredes que arden: el combustible está pegado a la cara, la llama la lame hacia arriba
  if(bitm(burn,2.0)>0.5) wall=max(wall,smoothstep(0.45,0.98,u.x)); if(bitm(burn,4.0)>0.5) wall=max(wall,smoothstep(0.55,0.02,u.x));
  if(bitm(burn,8.0)>0.5) wall=max(wall,smoothstep(0.45,0.98,u.z)); if(bitm(burn,16.0)>0.5) wall=max(wall,smoothstep(0.55,0.02,u.z));
  float ceilF=bitm(burn,32.0)>0.5?smoothstep(H-0.6,H,h)*0.6:0.0;
  float fl=bitm(burn,1.0)>0.5?1.0:0.7;
  vec3 q=wp*vec3(1.6,0.55,1.6)+vec3(0.0,-u_time*2.3,0.0)+seed*5.3;
  vec3 w=vec3(n3(q*0.6+vec3(3.1,-u_time*0.6,1.7)),n3(q*0.6+vec3(7.2,-u_time*0.5,4.4)),0.0)-0.5;
  q.xz+=w.xy*1.3;
  float n=n3(q)*0.55+n3(q*2.07+vec3(0.0,-u_time*1.4,0.0))*0.3+n3(q*4.3)*0.15;
  float base=fl*pow(1.0-hn,1.4)*0.85+wall*(1.0-hn*0.6)*0.85+ceilF;
  // lenguas de fuego: el ruido recorta la densidad también abajo (no una masa lisa) y las puntas se separan
  float d=base+(n-0.56)*1.7-hn*0.22;
  d=smoothstep(0.04,0.55,d)*e*smoothstep(-0.08,0.03,h);
  return vec2(d,clamp(d*(0.78-hn*0.5)+(n-0.5)*0.3+wall*0.08,0.0,1.0));
}
vec3 blackbody(float t){ vec3 c=vec3(0.5,0.035,0.0)*smoothstep(0.0,0.2,t); c=mix(c,vec3(1.0,0.27,0.02),smoothstep(0.12,0.42,t)); c=mix(c,vec3(1.0,0.58,0.12),smoothstep(0.38,0.75,t)); return mix(c,vec3(1.0,0.86,0.55),smoothstep(0.75,1.1,t)); }
`;
const FS_FIREBOX = `#version 300 es
${'##COMMON##'}
${'##FIRE##'}
uniform sampler2D u_depthCopy; uniform vec2 u_res; uniform float u_near; uniform float u_far; uniform vec3 u_camFwd; uniform float u_bright2;
in vec3 v_p; flat in vec4 v_a; flat in vec4 v_b; out vec4 o;
float linD(float d){ float z=d*2.0-1.0; return 2.0*u_near*u_far/(u_far+u_near-z*(u_far-u_near)); }
void main(){
  vec3 rd=normalize(v_p); vec3 lo=v_a.xyz+vec3(0.0,-0.08,0.0), hi=v_a.xyz+vec3(1.0,v_a.w,1.0);
  vec3 ir=1.0/rd; vec3 t0=(lo)*ir, t1=(hi)*ir; vec3 tn=min(t0,t1), tf=max(t0,t1);
  float ta=max(max(tn.x,tn.y),max(tn.z,0.0)), tb=min(min(tf.x,tf.y),tf.z);
  float sd=linD(texture(u_depthCopy,gl_FragCoord.xy/u_res).r)/max(dot(rd,u_camFwd),1e-3); tb=min(tb,sd);
  if(tb<=ta) discard;
  vec3 c=v_a.xyz+u_camPos;
  const int N=${'##FSTEPS##'}; float dt=(tb-ta)/float(N); float j=fract(52.9829*fract(dot(gl_FragCoord.xy,vec2(0.06711,0.00584))));
  vec3 col=vec3(0.0); float T=1.0;
  for(int i=0;i<N;i++){
    vec3 p=rd*(ta+(float(i)+j)*dt); vec2 f=fireField(p+u_camPos,c,v_a.w,v_b.x,v_b.y,v_b.w);
    if(f.x>0.004){ col+=T*blackbody(f.y)*(0.25+f.y*1.4)*f.x*dt*10.0; T*=exp(-f.x*dt*2.2); if(T<0.03) break; } // emisión fuerte (HDR): el fuego siempre es más brillante que lo que tiene detrás
  }
  o=vec4(col*u_bright2,1.0-T);
}`;
const FS_SMOKE = `#version 300 es
${'##COMMON##'}
precision highp sampler3D;
uniform sampler3D u_smoke; uniform sampler3D u_noise; uniform sampler2D u_depthCopy; uniform mat4 u_invVP; uniform vec3 u_gmin; uniform vec3 u_gsize; uniform vec3 u_camFwd; uniform float u_near; uniform float u_far; uniform vec2 u_wind;
in vec2 v_uv; out vec4 o;
float linD(float d){ float z=d*2.0-1.0; return 2.0*u_near*u_far/(u_far+u_near-z*(u_far-u_near)); }
vec4 S(vec3 p){ return texture(u_smoke,vec3((p.x-u_gmin.x)/u_gsize.x,(p.z-u_gmin.z)/u_gsize.z,(p.y-u_gmin.y)/u_gsize.y)); }
void main(){
  vec4 cc=u_invVP*vec4(v_uv*2.0-1.0,1.0,1.0); vec3 rd=normalize(cc.xyz/cc.w);
  vec3 ir=1.0/rd; vec3 t0=u_gmin*ir, t1=(u_gmin+u_gsize)*ir; vec3 tn=min(t0,t1), tf=max(t0,t1);
  float ta=max(max(tn.x,tn.y),max(tn.z,0.0)), tb=min(min(tf.x,tf.y),tf.z);
  float sd=linD(texture(u_depthCopy,v_uv).r)/max(dot(rd,u_camFwd),1e-3); tb=min(tb,sd);
  if(tb<=ta){ o=vec4(0.0); return; }
  const int N=${'##SSTEPS##'}; float len=tb-ta; float dt=max(len/float(N),0.25); float j=fract(52.9829*fract(dot(gl_FragCoord.xy,vec2(0.06711,0.00584)))); // ruido de gradiente entrelazado: estable y suave tras el desenfoque
  vec3 col=vec3(0.0); float T=1.0; vec3 L=normalize(u_sunDir);
  for(int i=0;i<N;i++){
    float t=ta+(float(i)+j)*dt; if(t>tb) break;
    vec3 p=rd*t; vec4 s=S(p); float den=s.r;
    if(den>0.004){
      vec3 wp=p+u_camPos; vec3 q=wp*0.5+vec3(-u_wind.x,-0.45,-u_wind.y)*u_time*0.55;
      vec3 wq=q+(vec3(texture(u_noise,q*0.07).r,texture(u_noise,q*0.07+0.37).r,texture(u_noise,q*0.07+0.71).r)-0.5)*2.4; // remolinos
      float nn=texture(u_noise,wq*0.125).r*0.55+texture(u_noise,wq*0.27).r*0.3+texture(u_noise,wq*0.6).r*0.15;
      den*=smoothstep(0.28,0.78,nn+den*0.12)*1.9; // volutas: zonas densas y huecos en vez de una niebla lisa
      float sig=den*2.2;
      // luz del sol con sombra dentro del propio humo (3 pasos hacia el sol)
      float sh=0.0; for(int k=1;k<=3;k++) sh+=S(p+L*float(k)*0.9).r; float sun=exp(-sh*1.6);
      float steam=clamp(s.g,0.0,1.0); vec3 alb=mix(vec3(0.07,0.065,0.06),vec3(0.82,0.84,0.86),steam);
      float sky=s.a; // luz de cielo de la celda (como los bloques): sol directo solo con cielo pleno
      vec3 li=u_sunCol*sun*0.55*smoothstep(0.85,1.0,sky)+u_amb*1.1*sky*sky+vec3(0.006);
      vec3 em=vec3(1.0,0.36,0.08)*s.b*s.b*1.6; // resplandor del fuego desde abajo
      col+=T*(alb*li+em)*sig*dt; T*=exp(-sig*dt); if(T<0.02) break;
    }
  }
  float a=1.0-T; if(a>0.002) col=applyFog(col/a,rd*mix(ta,tb,0.3),1.0)*a; // niebla de distancia sin teñir lo transparente
  o=vec4(col,a);
}`;
const FS_VFXCOMP = `#version 300 es
precision highp float; uniform sampler2D u_tex; uniform vec2 u_px; in vec2 v_uv; out vec4 o;
void main(){ vec4 c=texture(u_tex,v_uv)*0.4+(texture(u_tex,v_uv+vec2(u_px.x,0.0))+texture(u_tex,v_uv-vec2(u_px.x,0.0))+texture(u_tex,v_uv+vec2(0.0,u_px.y))+texture(u_tex,v_uv-vec2(0.0,u_px.y)))*0.15; o=c; }`;

function vfxInitGL() {
  const gl = R.gl; VFX.progs = null;
  try {
    const fix = (s, n1, n2) => s.replace('##FIRE##', GLSL_FIRE).replace('##FSTEPS##', n1).replace('##SSTEPS##', n2);
    const qq = R.q >= 3 ? ['28', '56'] : ['18', '36'];
    VFX.progs = { fire: compile(VS_FIREBOX, fix(FS_FIREBOX, qq[0], qq[1])), smoke: compile(VS_FULL, fix(FS_SMOKE, qq[0], qq[1])), comp: compile(VS_FULL, FS_VFXCOMP) };
  } catch (e) { console.error('VFX', e); VFX.progs = null; VFX.failed = true; return; }
  // ruido 3D repetible (valor por celda, filtrado trilineal)
  if (!VFX.noise || VFX.noiseGL !== gl) {
    const N = 32, d = new Uint8Array(N * N * N); let s = 1234567; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = s >>> 24; }
    VFX.noise = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, VFX.noise); gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, N, N, N, 0, gl.RED, gl.UNSIGNED_BYTE, d);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // cubo unidad + datos por instancia para las cajas de fuego
    const pos = [], idx = []; for (let i = 0; i < 8; i++) pos.push(i & 1, (i >> 1) & 1, (i >> 2) & 1);
    for (const f of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) idx.push(f[0], f[1], f[2], f[0], f[2], f[3]);
    VFX.fireVAO = gl.createVertexArray(); gl.bindVertexArray(VFX.fireVAO);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    VFX.fireBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, VFX.fireBuf); gl.bufferData(gl.ARRAY_BUFFER, VFX.fireData.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 2; i++) { gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 32, i * 16); gl.vertexAttribDivisor(1 + i, 1); }
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    VFX.smokeTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, VFX.smokeTex); gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, SMK.NX, SMK.NZ, SMK.NY, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    VFX.noiseGL = gl; SMK.uploadAll = true;
  }
}
// ---------------------------------------------------------------- celdas de fuego (cada cuadro)
// datos por instancia: x,y,z (relativos a la cámara al dibujar), altura | máscara de superficies que arden, máscara de vecinos con fuego, cantidad de fuego alrededor, semilla
function vfxFireCell(w, x, y, z, out) {
  const isF = (a, b, c) => w.get(a, b, c) === ID.fire; const fl = id => id > 0 && REG[id] && (REG[id].flammable || REG[id].infiniteFire);
  let burn = 0; if (fl(w.get(x, y - 1, z))) burn |= 1; if (fl(w.get(x + 1, y, z))) burn |= 2; if (fl(w.get(x - 1, y, z))) burn |= 4; if (fl(w.get(x, y, z + 1))) burn |= 8; if (fl(w.get(x, y, z - 1))) burn |= 16; if (fl(w.get(x, y + 1, z))) burn |= 32;
  let nb = 0; if (isF(x + 1, y, z)) nb |= 1; if (isF(x - 1, y, z)) nb |= 2; if (isF(x, y, z + 1)) nb |= 4; if (isF(x, y, z - 1)) nb |= 8;
  const sol = (a, b, c) => { const id = w.get(a, b, c); const d = id > 0 && REG[id]; return d && d.solid && !d.shape && !d.box && d.render === 'cube'; };
  if (sol(x + 1, y, z)) nb |= 16; if (sol(x - 1, y, z)) nb |= 32; if (sol(x, y, z + 1)) nb |= 64; if (sol(x, y, z - 1)) nb |= 128;
  let n = 0; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 1; dy++) if ((dx || dz || dy) && isF(x + dx, y + dy, z + dz)) n++;
  const up = w.get(x, y + 1, z); const roof = up > 0 && REG[up] && REG[up].solid;
  let H = (1.35 + Math.min(1.9, n * 0.085) + (burn & 30 ? 0.35 : 0)) * vfxCfg().fire.height; if (roof) H = Math.min(H, 1.0); // bajo un techo la llama se aplasta contra él
  const s = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) % 997 / 997;
  out.push(x, y, z, H, burn | (roof ? 32 : 0), nb, n, s);
}
function drawFireVolumes(cells) {
  const gl = R.gl; const P = VFX.progs.fire; const fl = R.fbo.fl; const n = Math.min(cells.length / 8, 2048) | 0; if (!n) return false;
  const D = VFX.fireData, cam = R.cam;
  for (let i = 0; i < n; i++) { const o = i * 8, s = i * 8; D[o] = cells[s] - cam[0]; D[o + 1] = cells[s + 1] - cam[1]; D[o + 2] = cells[s + 2] - cam[2]; D[o + 3] = cells[s + 3]; D[o + 4] = cells[s + 4]; D[o + 5] = cells[s + 5]; D[o + 6] = cells[s + 6]; D[o + 7] = cells[s + 7]; }
  gl.useProgram(P.p); setCommon(P); gl.uniformMatrix4fv(P.u.u_vp, false, R.vp); const v = R.view; gl.uniform3f(P.u.u_camFwd, -v[2], -v[6], -v[10]);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.fbo.copy.depth); gl.uniform1i(P.u.u_depthCopy, 3); gl.uniform2f(P.u.u_res, fl.w, fl.h); gl.uniform1f(P.u.u_near, R.near); gl.uniform1f(P.u.u_far, R.far);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, VFX.noise); gl.uniform1i(P.u.u_noise, 4); gl.uniform1f(P.u.u_bright2, 1.0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fl.fb); gl.viewport(0, 0, fl.w, fl.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.bindVertexArray(VFX.fireVAO); gl.bindBuffer(gl.ARRAY_BUFFER, VFX.fireBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, D, 0, n * 8);
  gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, n); R.stats.draws++;
  gl.cullFace(gl.BACK);
  // composición: se suma la emisión a la escena
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.scene.fb); gl.viewport(0, 0, R.w, R.h);
  const C = VFX.progs.comp; gl.useProgram(C.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fl.tex); gl.uniform1i(C.u.u_tex, 0); gl.uniform2f(C.u.u_px, 1 / fl.w, 1 / fl.h);
  gl.bindVertexArray(R.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); R.stats.draws++;
  gl.enable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(true);
  return true;
}
// ---------------------------------------------------------------- humo: simulación
const SMK = { NX: 48, NY: 40, NZ: 48, ox: 0, oy: 0, oz: 0, d: null, w: null, h: null, nd: null, nw: null, nh: null, solid: null, out: null, pend: [], acc: 0, solidT: 0, total: 0, world: null, box: null, wind: [0.6, 0.25], bytes: null, uploadAll: true };
function smokeOn() { return vfxVolumetric() && vfxCfg().smoke.on; }
function vfxSmokeEmit(x, y, z, amount, heat, kind) {
  if (!smokeOn() || !SMK.d) return; if (SMK.pend.length > 4000) return;
  SMK.pend.push(x, y, z, amount * vfxCfg().smoke.amount, heat || 0, kind || 0);
}
function smokeAlloc() { const n = SMK.NX * SMK.NY * SMK.NZ; for (const k of ['d', 'w', 'h', 'nd', 'nw', 'nh']) SMK[k] = new Float32Array(n); SMK.solid = new Uint8Array(n); SMK.out = new Uint8Array(n); SMK.bytes = new Uint8Array(n * 4); }
// mueve la rejilla para que siga al jugador (copiando lo que se solapa)
function smokeRecenter(w, px, py, pz) {
  const nx = Math.floor(px) - (SMK.NX >> 1), ny = Math.floor(py) - 14, nz = Math.floor(pz) - (SMK.NZ >> 1);
  if (SMK.world === w && Math.abs(nx - SMK.ox) < 8 && Math.abs(ny - SMK.oy) < 6 && Math.abs(nz - SMK.oz) < 8) return false;
  const { NX, NY, NZ } = SMK; const old = [SMK.d, SMK.w, SMK.h]; const sx = nx - SMK.ox, sy = ny - SMK.oy, sz = nz - SMK.oz; const same = SMK.world === w;
  const fresh = [new Float32Array(NX * NY * NZ), new Float32Array(NX * NY * NZ), new Float32Array(NX * NY * NZ)];
  if (same) for (let y = 0; y < NY; y++) { const yy = y + sy; if (yy < 0 || yy >= NY) continue; for (let z = 0; z < NZ; z++) { const zz = z + sz; if (zz < 0 || zz >= NZ) continue; for (let x = 0; x < NX; x++) { const xx = x + sx; if (xx < 0 || xx >= NX) continue; const a = x + NX * (z + NZ * y), b = xx + NX * (zz + NZ * yy); for (let k = 0; k < 3; k++) fresh[k][a] = old[k][b]; } } }
  SMK.d = fresh[0]; SMK.w = fresh[1]; SMK.h = fresh[2]; SMK.ox = nx; SMK.oy = ny; SMK.oz = nz; SMK.world = w; SMK.solidT = 0; SMK.uploadAll = true; return true;
}
// celdas sólidas (frenan el humo) y celdas al aire libre (viento, se disipa antes)
function smokeSolids(w) {
  const { NX, NY, NZ, ox, oy, oz } = SMK; const sol = SMK.solid, out = SMK.out; const lit = SMK.lit || (SMK.lit = new Uint8Array(NX * NY * NZ));
  for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) {
    let open = true; const c = w.chunk((ox + x) >> 4, (oz + z) >> 4); const base = ((ox + x) & 15) | (((oz + z) & 15) << 4);
    for (let y = NY - 1; y >= 0; y--) {
      const i = x + NX * (z + NZ * y); const b = w.get(ox + x, oy + y, oz + z); let s = 0;
      if (b > 0) { const d = REG[b]; if (d) { if (d.shape === 'door' || d.shape === 'trapdoor' || d.shape === 'gate') s = (w.getMeta(ox + x, oy + y, oz + z) & 4) ? 0 : 1; else if (d.liquid) s = 1; else if (d.solid && !d.leaves && d.shape !== 'fence' && d.shape !== 'pane' && d.shape !== 'wall' && d.render !== 'snow') s = 1; } }
      sol[i] = s; if (s) open = false; out[i] = open ? 1 : 0;
      // luz de cielo de la celda (0..15): ilumina el humo también dentro de casas con ventanas
      const yy = oy + y; lit[i] = !c || !c.light ? 15 : yy >= w.H ? 15 : yy < 0 ? 0 : (c.light[base | (yy << 8)] >> 4);
    }
  }
}
function smokeStep(w) {
  const { NX, NY, NZ } = SMK; const D = SMK.d, W = SMK.w, Hh = SMK.h, ND = SMK.nd, NW = SMK.nw, NH = SMK.nh, sol = SMK.solid, out = SMK.out; const L = NX * NZ;
  // inyectar
  const pd = SMK.pend; for (let k = 0; k < pd.length; k += 6) { const x = Math.floor(pd[k] - SMK.ox), y = Math.floor(pd[k + 1] - SMK.oy), z = Math.floor(pd[k + 2] - SMK.oz); if (x < 0 || y < 0 || z < 0 || x >= NX || y >= NY || z >= NZ) continue; let i = x + NX * (z + NZ * y); if (sol[i] && y + 1 < NY) i += L; D[i] += pd[k + 3]; Hh[i] = Math.min(2, Hh[i] + pd[k + 4]); if (pd[k + 5] === 2) W[i] += pd[k + 3]; else if (pd[k + 5] === 1) W[i] += pd[k + 3] * 0.45; }
  pd.length = 0;
  ND.set(D); NW.set(W); NH.set(Hh);
  const rain = (G.rainLevel || 0) > 0.3 && w.dim === 'overworld'; const life = vfxCfg().smoke.life;
  const wx = SMK.wind[0], wz = SMK.wind[1]; const wdx = Math.abs(wx) > Math.abs(wz) ? Math.sign(wx) : 0, wdz = wdx ? 0 : Math.sign(wz);
  let total = 0, x0 = NX, x1 = -1, y0 = NY, y1 = -1, z0 = NZ, z1 = -1;
  const mv = (i, j, f) => { const a = D[i] * f; ND[i] -= a; ND[j] += a; const b = W[i] * f; NW[i] -= b; NW[j] += b; const c = Hh[i] * f; NH[i] -= c; NH[j] += c; };
  for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) {
    const i = x + NX * (z + NZ * y); const d = D[i]; if (d < 2e-4) { if (d > 0) { ND[i] = 0; NW[i] = 0; } continue; }
    total += d; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    const heat = Hh[i]; let budget = 0.9;
    // subir (más rápido si está caliente); con techo encima se extiende hacia los lados
    const up = y + 1 < NY ? i + L : -1; const upFree = up >= 0 && !sol[up];
    if (upFree) { const f = Math.min(0.55, 0.22 + heat * 0.25); mv(i, up, f); budget -= f; }
    else if (up < 0) { ND[i] -= d * 0.3; } // sale por arriba de la rejilla
    const side = upFree ? 0.05 : 0.14; // bajo un techo se esparce más
    const nbs = [x + 1 < NX ? i + 1 : -1, x > 0 ? i - 1 : -1, z + 1 < NZ ? i + NX : -1, z > 0 ? i - NX : -1];
    let free = 0; for (const j of nbs) if (j >= 0 && !sol[j]) free++;
    if (free) { const f = Math.min(side, budget / 4); for (const j of nbs) if (j >= 0 && !sol[j]) mv(i, j, f); budget -= f * free; }
    // humo frío y espeso cae un poco
    if (heat < 0.05 && y > 0 && !sol[i - L] && d > 0.6) mv(i, i - L, 0.03);
    // viento al aire libre
    if (out[i] && (wdx || wdz)) { const nx = x + wdx, nz = z + wdz; if (nx >= 0 && nx < NX && nz >= 0 && nz < NZ) { const j = nx + NX * (nz + NZ * y); if (!sol[j]) mv(i, j, Math.min(0.18, budget)); } }
  }
  // disipación: lenta dentro de casas, rápida al aire libre y con lluvia; el calor se enfría
  for (let y = Math.max(0, y0 - 1); y <= Math.min(NY - 1, y1 + 1); y++) for (let z = Math.max(0, z0 - 1); z <= Math.min(NZ - 1, z1 + 1); z++) for (let x = Math.max(0, x0 - 1); x <= Math.min(NX - 1, x1 + 1); x++) {
    const i = x + NX * (z + NZ * y); if (ND[i] <= 0) { ND[i] = 0; NW[i] = 0; NH[i] = 0; continue; }
    const k = (out[i] ? (rain ? 0.93 : 0.975) : 0.996); const kk = Math.pow(k, 1 / life); ND[i] *= kk; NW[i] *= kk * 0.985; NH[i] *= 0.86; if (sol[i]) { ND[i] *= 0.5; }
  }
  SMK.d = ND; SMK.nd = D; SMK.w = NW; SMK.nw = W; SMK.h = NH; SMK.nh = Hh; SMK.total = total;
  SMK.box = x1 >= 0 ? [Math.max(0, x0 - 2), Math.max(0, y0 - 2), Math.max(0, z0 - 2), Math.min(NX - 1, x1 + 2), Math.min(NY - 1, y1 + 2), Math.min(NZ - 1, z1 + 2)] : null;
}
function smokeUpload() {
  const gl = R.gl; const { NX, NY, NZ } = SMK; const B = SMK.bytes, D = SMK.d, W = SMK.w, Hh = SMK.h;
  const all = SMK.uploadAll || !SMK.box; const bx = all ? [0, 0, 0, NX - 1, NY - 1, NZ - 1] : SMK.box; SMK.uploadAll = !SMK.box;
  const w = bx[3] - bx[0] + 1, h = bx[5] - bx[2] + 1, dpt = bx[4] - bx[1] + 1; let o = 0;
  const sub = all ? B : (SMK.subB && SMK.subB.length >= w * h * dpt * 4 ? SMK.subB : (SMK.subB = new Uint8Array(w * h * dpt * 4)));
  for (let y = bx[1]; y <= bx[4]; y++) for (let z = bx[2]; z <= bx[5]; z++) for (let x = bx[0]; x <= bx[3]; x++) { const i = x + NX * (z + NZ * y); const d = D[i]; sub[o++] = Math.min(255, d * 160) | 0; sub[o++] = d > 1e-3 ? Math.min(255, W[i] / d * 255) | 0 : 0; sub[o++] = Math.min(255, Hh[i] * 140) | 0; sub[o++] = SMK.lit ? SMK.lit[i] * 17 : 255; }
  gl.bindTexture(gl.TEXTURE_3D, VFX.smokeTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage3D(gl.TEXTURE_3D, 0, bx[0], bx[2], bx[1], w, h, dpt, gl.RGBA, gl.UNSIGNED_BYTE, sub, 0);
}
function vfxTick(w, dt) {
  if (!smokeOn()) return;
  if (!SMK.d) smokeAlloc();
  const p = G.player; smokeRecenter(w, p.x, p.y, p.z);
  SMK.acc += dt; SMK.solidT -= dt;
  if (SMK.acc < 0.1) return; SMK.acc = 0;
  if (SMK.solidT <= 0) { smokeSolids(w); SMK.solidT = 1.5; }
  // viento suave que cambia despacio
  const t = performance.now() / 60000; SMK.wind = [Math.cos(t * 2.1) * 0.7, Math.sin(t * 1.3) * 0.7];
  if (!SMK.pend.length && SMK.total <= 0) return; // sin humo: ni simular ni subir nada
  const was = SMK.total; smokeStep(w); if (was <= 0) SMK.uploadAll = true; smokeUpload();
}
function drawSmokeVolume() {
  if (!smokeOn() || !SMK.d || SMK.total <= 0.01 || SMK.world !== G.world) return;
  const gl = R.gl; const P = VFX.progs.smoke; const tg = R.fbo.fl;
  gl.useProgram(P.p); setCommon(P); gl.uniformMatrix4fv(P.u.u_invVP, false, R.invVP); const v = R.view; gl.uniform3f(P.u.u_camFwd, -v[2], -v[6], -v[10]);
  gl.uniform3f(P.u.u_gmin, SMK.ox - R.cam[0], SMK.oy - R.cam[1], SMK.oz - R.cam[2]); gl.uniform3f(P.u.u_gsize, SMK.NX, SMK.NY, SMK.NZ); gl.uniform2f(P.u.u_wind, SMK.wind[0], SMK.wind[1]);
  gl.uniform1f(P.u.u_near, R.near); gl.uniform1f(P.u.u_far, R.far);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.fbo.copy.depth); gl.uniform1i(P.u.u_depthCopy, 3);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, VFX.noise); gl.uniform1i(P.u.u_noise, 4);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_3D, VFX.smokeTex); gl.uniform1i(P.u.u_smoke, 5);
  gl.bindFramebuffer(gl.FRAMEBUFFER, tg.fb); gl.viewport(0, 0, tg.w, tg.h); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  gl.bindVertexArray(R.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); R.stats.draws++;
  // sobre la escena: color premultiplicado
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.scene.fb); gl.viewport(0, 0, R.w, R.h); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const C = VFX.progs.comp; gl.useProgram(C.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tg.tex); gl.uniform1i(C.u.u_tex, 0); gl.uniform2f(C.u.u_px, 1 / tg.w, 1 / tg.h);
  gl.drawArrays(gl.TRIANGLES, 0, 3); R.stats.draws++;
  gl.enable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(true);
}
// llamado desde renderWorld tras los translúcidos: fuego volumétrico (o llamas planas en calidad baja) + humo
function drawVFX(opts) {
  if (vfxVolumetric()) {
    if (VFX.q !== R.q || VFX.gl !== R.gl) { VFX.q = R.q; VFX.gl = R.gl; vfxInitGL(); }
    if (VFX.progs) { if (opts.fireCells && opts.fireCells.length) drawFireVolumes(opts.fireCells); drawSmokeVolume(); return; }
  }
  if (opts.flames && opts.flames.length) drawFlames(opts.flames);
}
// si la GPU se reinicia, recrear texturas y programas
(R.restoreHooks = R.restoreHooks || []).push(() => { VFX.noiseGL = null; VFX.q = -1; VFX.progs = null; SMK.uploadAll = true; });
