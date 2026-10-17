// ============================================================================
//  Fluido continuo: agua y lava como partículas en la GPU (Position Based Fluids)
// ============================================================================
// Cada partícula es un trocito de líquido (1/64 de bloque) que se mueve en espacio continuo: la presión
// (restricción de densidad), la viscosidad (XSPH), la cohesión y las colisiones contra los bloques se resuelven
// en la GPU sobre texturas float. Los bloques solo son colisionadores: un campo 3D de la región alrededor del
// jugador dice qué parte de cada celda es sólida, y cada partícula se barre contra esas cajas en coma flotante.
// Vecinos: claves (celda con hash, índice) ordenadas con una red bitónica y una tabla hash → primera posición.
// Estado por partícula: POS (xyz relativo al origen de la región, fase) y VEL (xyz, temperatura/espuma).
// Fase: 1 agua, 2 lava, 3 agua puesta (de cubo o derramada); +10 absorbida por agua quieta, +20 por lava quieta,
// +30 fuera de la región. Las marcadas se quedan quietas hasta que la CPU las recoge (lectura asíncrona).
const FL = {
  ok: false, gl: null, W: 256, N: 0, rows: 0, TAB: 512,
  hi: 0, alive: 0, ptr: 0, phase: null, spawnQ: [], killQ: [],
  org: [0, 0, 0], vdim: [96, 64, 96], vox: null, voxData: null, voxDirty: [], world: null,
  cur: 0, pcur: 0, kcur: 0, acc: 0, steps: 0, debug: false,
  rho0: 1, mass: 1, eps: 0.08, iters: 3,
  rb: { pbo: null, sync: null, frame: 0, pos: null, vel: null, n: 0, ready: false, org: [0, 0, 0] },
  ents: new Float32Array(32), entV: new Float32Array(32), nEnt: 0
};
const FL_K = 6, FL_S = 1 / FL_K, FL_H = 0.34, FL_R = 0.066, FL_T = 262144, FL_PPB = FL_K * FL_K * FL_K; // 6×6×6 = 216 partículas por bloque, más pequeñas
const GLSL_FLHEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler3D;
uniform sampler2D u_pos, u_vel, u_pred, u_lam, u_key, u_tab; uniform sampler3D u_vox;
uniform ivec3 u_vdim; uniform int u_M; uniform float u_dt, u_kp, u_ks, u_eps;
const float H=0.34, H2=0.1156, RAD=0.066;
uniform float u_time, u_rain, u_tide; uniform vec3 u_org;
// oleaje del mar (el mismo que dibuja VS_CHUNK): x = desplazamiento de la superficie, yz = velocidad orbital horizontal
uniform float u_waveK;
uniform highp sampler2D u_wdist; uniform vec4 u_wdRect; // distancia a la costa (k_fluids/WD): las olas largas van hacia ella
vec3 seaShore(vec2 p){ if(u_wdRect.w<0.5) return vec3(1e4,0.0,0.0); vec2 q=(p-u_wdRect.xy)*u_wdRect.z; ivec2 b=ivec2(floor(q)); vec2 f=q-vec2(b);
  if(b.x<0||b.y<0||b.x>=63||b.y>=63) return vec3(1e4,0.0,0.0);
  float a=texelFetch(u_wdist,b,0).r, c=texelFetch(u_wdist,b+ivec2(1,0),0).r, d=texelFetch(u_wdist,b+ivec2(0,1),0).r, e=texelFetch(u_wdist,b+ivec2(1,1),0).r;
  return vec3(mix(mix(a,c,f.x),mix(d,e,f.x),f.y), mix(c-a,e-d,f.y)*u_wdRect.z, mix(d-a,e-c,f.x)*u_wdRect.z); }
vec3 seaWave(vec2 p){ float A=(0.16+u_rain*0.55)*u_waveK; float h=0.0; vec2 u=vec2(0.0);
  const vec4 W[5]=vec4[5](vec4(0.81,0.59,22.0,0.42),vec4(0.97,-0.24,13.0,0.26),vec4(0.45,0.89,8.5,0.16),vec4(-0.2,0.98,5.2,0.09),vec4(0.7,-0.71,3.4,0.05));
  vec3 sd=seaShore(p); float wf=smoothstep(100.0,150.0,sd.x); vec2 gs=length(sd.yz)>1e-4?-normalize(sd.yz):vec2(0.81,0.59);
  float Sp=sd.x+2.5*sin(p.x*0.045+p.y*0.02)*sin(p.y*0.05-p.x*0.015);
  for(int i=0;i<5;i++){ float k=6.2832/W[i].z; float c=sqrt(9.8/k); float a=A*W[i].w*2.2; float gw=i<3?wf:1.0;
    if(gw>0.001){ vec2 d=W[i].xy; float s=sin(k*(dot(d,p)-c*u_time*0.55)+float(i)*1.7); h+=a*gw*(pow(s*0.5+0.5,1.6)*2.0-1.0); u+=a*gw*k*c*0.55*s*d; }
    if(gw<0.999){ float s=sin(k*(-Sp-c*u_time*0.55)+float(i)*1.7); h+=a*(1.0-gw)*(pow(s*0.5+0.5,1.6)*2.0-1.0); u+=a*(1.0-gw)*k*c*0.55*s*gs; } }
  float v=h*0.85+A*0.2; v=(v<0.0?v*0.5:v)-0.05;
  return vec3(v+u_tide,u); }
ivec2 tc(int i){ return ivec2(i&255, i>>8); }
int idx(){ ivec2 f=ivec2(gl_FragCoord.xy); return f.y*256+f.x; }
uint hashc(ivec3 c){ uvec3 u=uvec3(c+ivec3(4096)); return ((u.x*73856093u)^(u.y*19349663u)^(u.z*83492791u))&262143u; }
float Wp(float r2){ float d=H2-r2; return d>0.0 ? u_kp*d*d*d : 0.0; }
vec3 gradW(vec3 r, float rl){ if(rl<1e-5 || rl>=H) return vec3(0.0); float d=H-rl; return u_ks*d*d*r/rl; }
float vox(ivec3 c){ if(c.x<0||c.y<0||c.z<0||c.x>=u_vdim.x||c.y>=u_vdim.y||c.z>=u_vdim.z) return 0.0; return floor(texelFetch(u_vox,c,0).r*255.0+0.5); }
// parte sólida de la celda en vertical (y0,y1); vacía si y1<=y0
vec2 span(float v){ if(v==1.0) return vec2(0.0,1.0); if(v>=100.0){ float k=v-100.0; float a=floor(k/9.0); return vec2(a,k-a*9.0)/8.0; } return vec2(1.0,0.0); }
// altura del suelo bajo la columna de la celda c (parte sólida de c o tope del bloque de abajo); hueco de 1+ bloques: c.y-1.5
float supH(ivec3 c){ float v=vox(c); if(v>49.5&&v<50.5) return float(c.y)+1.0; vec2 s=span(v); if(s.y>s.x) return float(c.y)+s.y; float vb=vox(c-ivec3(0,1,0)); if(vb>49.5&&vb<50.5) return float(c.y); vec2 b=span(vb); if(b.y>b.x) return float(c.y-1)+b.y; return float(c.y)-1.5; } // 50 = celda de aire ya llena de partículas
// ¿la celda tapa el paso a la altura y? (su parte sólida sube por encima)
bool wallAt(ivec3 c, float y){ vec2 s=span(vox(c)); return s.y>s.x && float(c.y)+s.y>y-RAD+0.02; }
float cmp(vec3 v,int a){ return a==0?v.x:(a==1?v.y:v.z); }
// barrido en un eje de la caja de la partícula (lado 2·RAD) contra las cajas sólidas: hasta dónde puede llegar
float sweepAxis(vec3 p, int ax, float to){
  float from=cmp(p,ax); if(abs(to-from)<1e-7) return to;
  vec3 lo=p-vec3(RAD), hi=p+vec3(RAD); float a0=min(from,to)-RAD, a1=max(from,to)+RAD;
  if(ax==0){ lo.x=a0; hi.x=a1; } else if(ax==1){ lo.y=a0; hi.y=a1; } else { lo.z=a0; hi.z=a1; }
  ivec3 A=ivec3(floor(lo)), B=ivec3(floor(hi-vec3(1e-5)));
  float res=to;
  for(int z=A.z; z<=B.z; z++) for(int y=A.y; y<=B.y; y++) for(int x=A.x; x<=B.x; x++){
    vec2 s=span(vox(ivec3(x,y,z))); if(s.y<=s.x) continue;
    vec3 bmin=vec3(float(x),float(y)+s.x,float(z)), bmax=vec3(float(x+1),float(y)+s.y,float(z+1));
    bool ov=true; // solape en los otros dos ejes (en la posición actual)
    for(int k=0;k<3;k++){ if(k==ax) continue; float c=cmp(p,k); if(c+RAD<=cmp(bmin,k)+1e-5 || c-RAD>=cmp(bmax,k)-1e-5) ov=false; }
    if(!ov) continue;
    if(to>from){ float lim=cmp(bmin,ax)-RAD; if(lim>=from-1e-3) res=min(res,lim); }
    else { float lim=cmp(bmax,ax)+RAD; if(lim<=from+1e-3) res=max(res,lim); }
  }
  return res;
}
vec3 sweep(vec3 p0, vec3 p1){ vec3 p=p0; p.y=sweepAxis(p,1,p1.y); p.x=sweepAxis(p,0,p1.x); p.z=sweepAxis(p,2,p1.z); return p; }
#define NEIGH_BEGIN(P) { ivec3 c0_=ivec3(floor((P)/H)); for(int dz_=-1;dz_<=1;dz_++) for(int dy_=-1;dy_<=1;dy_++) for(int dx_=-1;dx_<=1;dx_++){ uint hh_=hashc(c0_+ivec3(dx_,dy_,dz_)); float st_=texelFetch(u_tab,ivec2(int(hh_&511u),int(hh_>>9u)),0).r; if(st_>1e8) continue; int k_=int(st_); for(int t_=0;t_<40;t_++,k_++){ if(k_>=u_M) break; vec2 kv_=texelFetch(u_key,tc(k_),0).xy; if(uint(kv_.x)!=hh_) break; int j=int(kv_.y);
#define NEIGH_END }}}
`;
const VS_FLQUAD = `#version 300 es
void main(){ vec2 p=vec2(float((gl_VertexID&1)*2-1), float((gl_VertexID>>1)*2-1)); gl_Position=vec4(p,0.0,1.0); }`;
// 1) predicción: gravedad, empuje de entidades, colisión barrida; marca absorción por líquido quieto y salida de la región
const FS_FLPRED = GLSL_FLHEAD + `
uniform vec4 u_ent[8], u_entV[8]; uniform int u_nEnt; out vec4 o;
void main(){
  int i=idx(); vec4 P=texelFetch(u_pos,tc(i),0); if(P.w<0.5 || P.w>=10.0){ o=P; return; }
  vec3 v=texelFetch(u_vel,tc(i),0).xyz; vec3 x=P.xyz;
  // dentro de un bloque (lo pusieron encima): salir por arriba
  { ivec3 c=ivec3(floor(x)); vec2 s=span(vox(c)); if(s.y>s.x && x.y>=float(c.y)+s.x && x.y<float(c.y)+s.y){ x.y=float(c.y)+s.y+RAD+0.01; v=vec3(0.0); } }
  v.y-=9.81*u_dt;
  for(int e=0;e<8;e++){ if(e>=u_nEnt) break; vec4 E=u_ent[e], EV=u_entV[e];
    float t=clamp(x.y-E.y,-EV.w,EV.w); vec3 c=vec3(E.x,E.y+t,E.z); vec3 d=x-c; float dl=length(d);
    if(dl<E.w){ vec3 n=dl>1e-4?d/dl:vec3(0.0,1.0,0.0);
      // encima de la cabeza: resbala hacia los lados (el agua no se queda apilada sobre el jugador)
      if(t>EV.w-0.01){ vec2 h=d.xz; float hl=length(h); h=hl>0.03?h/hl:vec2(cos(float(i)*2.39996),sin(float(i)*2.39996)); n=normalize(n+vec3(h.x,0.0,h.y)*1.6); }
      v=mix(v,EV.xyz*1.1+n*(E.w-dl)*10.0,0.6); } }
  // ladera: en reposo sobre el suelo, buscar (radio 2 bloques) la celda alcanzable más cercana con el suelo más bajo y
  // correr hacia ella; las vecinas del mismo líquido vienen detrás por la cohesión y la viscosidad (XSPH). Si no hay
  // ninguna más baja, la superficie es plana y se queda quieta.
  { ivec3 c=ivec3(floor(x)); float h0=supH(c);
    if(x.y-h0<0.45){
      float best=1e9; vec2 tgt=vec2(0.0);
      for(int dz=-2;dz<=2;dz++) for(int dx=-2;dx<=2;dx++){
        if(dx==0&&dz==0) continue; float dd=float(dx*dx+dz*dz); if(dd>5.0||dd>=best) continue;
        ivec3 n=c+ivec3(dx,0,dz); if(wallAt(n,x.y)) continue;
        ivec3 m=c+ivec3(dx/2,0,dz/2); if((abs(dx)==2||abs(dz)==2) && wallAt(m,x.y)) continue;
        if(abs(dx)==1&&abs(dz)==1 && wallAt(c+ivec3(dx,0,0),x.y) && wallAt(c+ivec3(0,0,dz),x.y)) continue; // esquina cerrada
        if(supH(n)<h0-0.1){ best=dd; tgt=vec2(n.xz)+0.5; } }
      if(best<1e8){ vec2 d=tgt-x.xz; float l=length(d); if(l>1e-3){ float acc=P.w>1.5&&P.w<2.5?2.2:7.0; v.xz+=d/l*acc*u_dt; } }
    } }
  // orilla: junto a (o sobre) el mar, el oleaje arrastra el agua adelante y atrás
  { ivec3 c=ivec3(floor(x)); bool sea=false; for(int k=0;k<6;k++){ ivec3 o2=k==0?ivec3(0,-1,0):k==1?ivec3(1,-1,0):k==2?ivec3(-1,-1,0):k==3?ivec3(0,-1,1):k==4?ivec3(0,-1,-1):ivec3(0,0,0); if(vox(c+o2)==27.0) sea=true; }
    if(sea && P.w>0.5 && P.w<2.5 || sea && P.w>2.5 && P.w<3.5){ vec3 sw=seaWave(x.xz+u_org.xz); v.xz=mix(v.xz,v.xz+sw.yz*2.2,0.25); } }
  float sp=length(v); if(sp>20.0) v*=20.0/sp;
  vec3 x1=sweep(x,x+v*u_dt);
  float ph=P.w;
  if(x1.x<1.0||x1.z<1.0||x1.y<1.0||x1.x>float(u_vdim.x)-1.0||x1.z>float(u_vdim.z)-1.0||x1.y>float(u_vdim.y)-1.0) ph+=30.0;
  else { float vv=vox(ivec3(floor(x1))); float fy=fract(x1.y);
    if(vv>26.5 && vv<27.5){ vec3 sw=seaWave(x1.xz+u_org.xz); if(fy<0.92+sw.x-0.04) ph+=10.0; }
    else if(vv>16.5 && vv<25.5){ float a=vv-16.0; float lv=a>8.5?1.0:a/8.0*0.92; if(fy<lv-0.04) ph+=10.0; }
    else if(vv>32.5 && vv<41.5){ float a=vv-32.0; float lv=a>8.5?1.0:a/8.0*0.92; if(fy<lv-0.04) ph+=20.0; } }
  o=vec4(x1,ph);
}`;
// 2) claves (celda con hash, índice)
const FS_FLKEY = GLSL_FLHEAD + `out vec4 o;
void main(){ int i=idx(); vec4 P=texelFetch(u_pred,tc(i),0); bool ok=P.w>0.5 && P.w<10.0 && i<u_M;
  o=vec4(ok?float(hashc(ivec3(floor(P.xyz/H)))):262144.0, float(i), 0.0, 1.0); }`;
// 3) una etapa de la red bitónica
const FS_FLSORT = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D u_src; uniform int u_k, u_j; out vec4 o;
void main(){ ivec2 f=ivec2(gl_FragCoord.xy); int i=f.y*256+f.x; int p=i^u_j;
  vec2 a=texelFetch(u_src,f,0).xy, b=texelFetch(u_src,ivec2(p&255,p>>8),0).xy;
  bool up=(i&u_k)==0; bool keepMin=(i<p)==up; bool aLess=a.x<b.x || (a.x==b.x && a.y<b.y);
  o=vec4((keepMin==aLess)?a:b,0.0,1.0); }`;
// 4) tabla: primera posición ordenada de cada hash (prueba de profundidad = mínimo)
const VS_FLTAB = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D u_key; uniform int u_M; out float v_k;
void main(){ int k=gl_VertexID; vec2 kv=texelFetch(u_key,ivec2(k&255,k>>8),0).xy; v_k=float(k); gl_PointSize=1.0;
  if(kv.x>=262143.5){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  int h=int(kv.x); vec2 t=(vec2(float(h&511),float(h>>9))+0.5)/512.0; gl_Position=vec4(t*2.0-1.0,float(k)/float(u_M)*2.0-1.0,1.0); }`;
const FS_FLTAB = `#version 300 es
precision highp float; in float v_k; out vec4 o; void main(){ o=vec4(v_k,0.0,0.0,1.0); }`;
// 5) densidad y multiplicador λ
const FS_FLLAM = GLSL_FLHEAD + `out vec4 o;
void main(){ int i=idx(); vec4 Pi=texelFetch(u_pred,tc(i),0); if(Pi.w<0.5||Pi.w>=10.0){ o=vec4(0.0); return; }
  float rho=0.0, sg=0.0; vec3 gi=vec3(0.0);
  NEIGH_BEGIN(Pi.xyz)
    vec4 Pj=texelFetch(u_pred,tc(j),0); vec3 r=Pi.xyz-Pj.xyz; float r2=dot(r,r);
    if(r2<H2){ rho+=Wp(r2); if(j!=i){ vec3 g=gradW(r,sqrt(r2)); gi+=g; sg+=dot(g,g); } }
  NEIGH_END
  float C=max(rho-1.0,0.0); o=vec4(-C/(sg+dot(gi,gi)+u_eps),rho,0.0,1.0); }`;
// 6) corrección de posición
const FS_FLDEL = GLSL_FLHEAD + `uniform float u_sk, u_wq; out vec4 o;
void main(){ int i=idx(); vec4 Pi=texelFetch(u_pred,tc(i),0); if(Pi.w<0.5||Pi.w>=10.0){ o=Pi; return; }
  float li=texelFetch(u_lam,tc(i),0).x; vec3 dp=vec3(0.0);
  NEIGH_BEGIN(Pi.xyz)
    if(j!=i){ vec4 Pj=texelFetch(u_pred,tc(j),0); vec3 r=Pi.xyz-Pj.xyz; float r2=dot(r,r);
      if(r2<H2){ float rl=sqrt(r2); float lj=texelFetch(u_lam,tc(j),0).x; float w=Wp(r2)/u_wq; float sc=-u_sk*w*w*w*w;
        if(rl<1e-4){ r=vec3(fract(float(i)*0.618)-0.5,0.3,fract(float(j)*0.618)-0.5)*1e-3; rl=length(r); }
        dp+=(li+lj+sc)*gradW(r,rl); } }
  NEIGH_END
  float l=length(dp); if(l>0.1) dp*=0.1/l;
  o=vec4(sweep(Pi.xyz,Pi.xyz+dp),Pi.w); }`;
// 7) velocidad, viscosidad XSPH, cohesión, rozamiento y temperatura (escribe POS y VEL)
const FS_FLVEL = GLSL_FLHEAD + `layout(location=0) out vec4 oP; layout(location=1) out vec4 oV;
void main(){ int i=idx(); vec4 Pi=texelFetch(u_pred,tc(i),0); vec4 Xi=texelFetch(u_pos,tc(i),0); vec4 Vi=texelFetch(u_vel,tc(i),0);
  if(Pi.w<0.5){ oP=Xi; oV=Vi; return; }
  if(Pi.w>=10.0){ oP=Pi; oV=vec4(0.0,0.0,0.0,Vi.w); return; }
  float base=Pi.w; bool lava=base>1.5&&base<2.5;
  vec3 vi=(Pi.xyz-Xi.xyz)/u_dt; vec3 acc=vec3(0.0); float ws=0.0; vec3 cen=vec3(0.0); float cn=0.0; float Ts=0.0;
  NEIGH_BEGIN(Pi.xyz)
    if(j!=i){ vec4 Pj=texelFetch(u_pred,tc(j),0); vec3 r=Pi.xyz-Pj.xyz; float r2=dot(r,r);
      if(r2<H2 && (Pj.w>1.5&&Pj.w<2.5)==lava){ vec4 Xj=texelFetch(u_pos,tc(j),0); vec3 vj=(Pj.xyz-Xj.xyz)/u_dt; float w=Wp(r2);
        acc+=(vj-vi)*w; ws+=w; cen+=Pj.xyz; cn+=1.0; Ts+=texelFetch(u_vel,tc(j),0).w*w; } }
  NEIGH_END
  vi+=acc*(lava?0.55:0.02);
  if(cn>0.0){ vec3 tc2=cen/cn-Pi.xyz; float surf=clamp(1.0-cn/26.0,0.0,1.0); vi+=tc2*(lava?9.0:4.0)*surf*u_dt; } // cohesión (tensión superficial)
  // rozamiento con el suelo (la lava se pega, el agua resbala)
  vec2 sb=span(vox(ivec3(floor(Pi.xyz-vec3(0.0,RAD+0.04,0.0))))); float fb=floor(Pi.y-RAD-0.04);
  bool ground=sb.y>sb.x && Pi.y-RAD-0.04<fb+sb.y;
  if(ground) vi.xz*=lava?0.80:(cn<7.0?0.86:0.985); // una película fina se queda pegada (la línea de contacto frena el charco)
  float T=Vi.w;
  if(lava){ vi*=0.985; if(ws>0.0) T=mix(T,Ts/ws,0.15); T=clamp(T-u_dt*(cn<16.0?0.03:0.002),0.35,1.0); }
  else { float sp=length(vi); T=max(T*0.96,clamp((sp-3.0)*0.12,0.0,1.0)*clamp(1.0-cn/22.0,0.0,1.0)); }
  float sp=length(vi); if(sp>20.0) vi*=20.0/sp;
  if(sp<0.45) vi*=mix(0.82,1.0,sp/0.45); // temblor del solver en reposo: se apaga (el líquido quieto queda quieto)
  oP=vec4(Pi.xyz,Pi.w); oV=vec4(vi,T); }`;
// altas y bajas: puntos escritos directamente en POS/VEL
const VS_FLSPAWN = `#version 300 es
precision highp float; layout(location=0) in float a_i; layout(location=1) in vec4 a_p; layout(location=2) in vec4 a_v;
uniform float u_rows; out vec4 v_p; out vec4 v_v;
void main(){ int i=int(a_i+0.5); vec2 t=(vec2(float(i&255),float(i>>8))+0.5)/vec2(256.0,u_rows); gl_Position=vec4(t*2.0-1.0,0.0,1.0); gl_PointSize=1.0; v_p=a_p; v_v=a_v; }`;
const FS_FLSPAWN = `#version 300 es
precision highp float; in vec4 v_p; in vec4 v_v; layout(location=0) out vec4 oP; layout(location=1) out vec4 oV; void main(){ oP=v_p; oV=v_v; }`;
// desplazar todas las partículas (al mover la región con el jugador)
const FS_FLSHIFT = GLSL_FLHEAD + `uniform vec3 u_shift; out vec4 o;
void main(){ int i=idx(); vec4 P=texelFetch(u_pos,tc(i),0); if(P.w>0.5) P.xyz+=u_shift; o=P; }`;
const FS_FLCOPY = GLSL_FLHEAD + `out vec4 o; void main(){ o=texelFetch(u_vel,tc(idx()),0); }`;
// vista de depuración: esferas
const VS_FLDBG = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D u_pos, u_vel; uniform mat4 u_vp; uniform vec3 u_off; uniform vec3 u_cr, u_cu; out vec2 v_q; out vec4 v_c; out vec3 v_w;
void main(){ int i=gl_InstanceID; vec4 P=texelFetch(u_pos,ivec2(i&255,i>>8),0); vec4 V=texelFetch(u_vel,ivec2(i&255,i>>8),0);
  vec2 q=vec2(float(gl_VertexID&1),float(gl_VertexID>>1))*2.0-1.0; v_q=q;
  if(P.w<0.5){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  float ph=mod(P.w,10.0); v_c=ph>1.5&&ph<2.5?vec4(1.0,0.35+0.4*V.w,0.05,1.0):vec4(0.15,0.4,0.9,1.0); if(P.w>=10.0) v_c=vec4(1.0,0.0,1.0,1.0);
  vec3 w=P.xyz+u_off+(u_cr*q.x+u_cu*q.y)*0.13; v_w=w; gl_Position=u_vp*vec4(w,1.0); }`;
const FS_FLDBG = `#version 300 es
precision highp float; in vec2 v_q; in vec4 v_c; out vec4 o; void main(){ float r2=dot(v_q,v_q); if(r2>1.0) discard; float l=0.4+0.6*sqrt(1.0-r2); o=vec4(v_c.rgb*l,1.0); }`;

function flInit() {
  const gl = R.gl; FL.gl = gl; FL.ok = false;
  if (!gl.getExtension('EXT_color_buffer_float')) return;
  FL.N = R.q >= 3 ? 262144 : 131072; FL.rows = FL.N / FL.W;
  const P = {}; const C = (n, vs, fs) => { P[n] = compileRaw(vs, fs); };
  try {
    C('pred', VS_FLQUAD, FS_FLPRED); C('key', VS_FLQUAD, FS_FLKEY); C('sort', VS_FLQUAD, FS_FLSORT); C('tab', VS_FLTAB, FS_FLTAB);
    C('lam', VS_FLQUAD, FS_FLLAM); C('del', VS_FLQUAD, FS_FLDEL); C('vel', VS_FLQUAD, FS_FLVEL); C('spawn', VS_FLSPAWN, FS_FLSPAWN);
    C('shift', VS_FLQUAD, FS_FLSHIFT); C('copy', VS_FLQUAD, FS_FLCOPY); C('dbg', VS_FLDBG, FS_FLDBG);
  } catch (e) { console.warn('fluido continuo', e); return; }
  FL.P = P;
  const tex = (w, h, ifmt, fmt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const fbo = (...ts) => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); ts.forEach((t, k) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(ts.map((t, k) => gl.COLOR_ATTACHMENT0 + k)); const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; return ok ? f : null; };
  const W = FL.W, Hh = FL.rows;
  FL.pos = [tex(W, Hh, gl.RGBA32F, gl.RGBA), tex(W, Hh, gl.RGBA32F, gl.RGBA)]; FL.vel = [tex(W, Hh, gl.RGBA32F, gl.RGBA), tex(W, Hh, gl.RGBA32F, gl.RGBA)];
  FL.pred = [tex(W, Hh, gl.RGBA32F, gl.RGBA), tex(W, Hh, gl.RGBA32F, gl.RGBA)]; FL.key = [tex(W, Hh, gl.RGBA32F, gl.RGBA), tex(W, Hh, gl.RGBA32F, gl.RGBA)];
  FL.lam = tex(W, Hh, gl.RGBA32F, gl.RGBA); FL.tab = tex(FL.TAB, FL.TAB, gl.RGBA32F, gl.RGBA);
  FL.fbPV = [fbo(FL.pos[0], FL.vel[0]), fbo(FL.pos[1], FL.vel[1])]; FL.fbPred = [fbo(FL.pred[0]), fbo(FL.pred[1])]; FL.fbKey = [fbo(FL.key[0]), fbo(FL.key[1])];
  FL.fbLam = fbo(FL.lam); FL.fbPos = [fbo(FL.pos[0]), fbo(FL.pos[1])]; FL.fbVel = [fbo(FL.vel[0]), fbo(FL.vel[1])];
  FL.fbTab = fbo(FL.tab); if (FL.fbTab) { const db = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, db); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, FL.TAB, FL.TAB); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, db); FL.tabDepth = db; }
  const all = [...FL.fbPV, ...FL.fbPred, ...FL.fbKey, FL.fbLam, FL.fbTab, ...FL.fbPos, ...FL.fbVel];
  if (all.some(f => !f)) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); console.warn('fluido continuo: sin destinos float32'); return; }
  for (const f of [...FL.fbPV]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  FL.vao = gl.createVertexArray();
  FL.spVao = gl.createVertexArray(); gl.bindVertexArray(FL.spVao); FL.spBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, FL.spBuf); gl.bufferData(gl.ARRAY_BUFFER, 9 * 4 * 8192, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 36, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 4); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);
  gl.bindVertexArray(null);
  // campo 3D de colisión de la región
  FL.vox = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, FL.vox); const [vx, vy, vz] = FL.vdim; FL.voxData = new Uint8Array(vx * vy * vz);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, vx, vy, vz, 0, gl.RED, gl.UNSIGNED_BYTE, FL.voxData);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, p, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_3D, null);
  // densidad de reposo de la red de partículas (para normalizar el núcleo: ρ0 = 1)
  const h = FL_H, s = FL_S; let raw = 0; const K6 = 315 / (64 * Math.PI * Math.pow(h, 9));
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) for (let c = -4; c <= 4; c++) { const r2 = (a * a + b * b + c * c) * s * s; if (r2 < h * h) raw += K6 * Math.pow(h * h - r2, 3); }
  FL.mass = 1 / raw; FL.kp = FL.mass * K6; FL.ks = -FL.mass * 45 / (Math.PI * Math.pow(h, 6));
  FL.wq = FL.kp * Math.pow(h * h - Math.pow(0.2 * h, 2), 3);
  FL.phase = new Uint8Array(FL.N); FL.spawnFrame = new Int32Array(FL.N); FL.scale = new Uint8Array(FL.N).fill(255); FL.dying = new Map(); FL.rainTag = new Uint8Array(FL.N);
  FL.scaleTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, FL.scaleTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, FL.W, FL.rows, 0, gl.RED, gl.UNSIGNED_BYTE, FL.scale); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); FL.voxLoaded = new Set(); FL.hi = 0; FL.alive = 0; FL.ptr = 0; FL.spawnQ.length = 0; FL.killQ.length = 0; FL.world = null;
  FL.rb.pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, FL.rb.pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, FL.N * 16, gl.STREAM_READ); FL.rb.pbo2 = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, FL.rb.pbo2); gl.bufferData(gl.PIXEL_PACK_BUFFER, FL.N * 16, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  FL.rb.sync = null; FL.rb.ready = false; FL.rb.pos = new Float32Array(FL.N * 4); FL.rb.vel = new Float32Array(FL.N * 4);
  FL.ok = true;
  flRInit(); FL.R.gl = gl; // compilar ya los shaders del render (la primera compilación tarda)
}
// ---------------------------------------------------------------- campo de colisión
let FLVC = null;
function flVoxTable() {
  FLVC = new Uint8Array(REG.length);
  for (let b = 1; b < REG.length; b++) { const d = REG[b]; if (!d) continue;
    if (d.liquid) { FLVC[b] = 0; continue; }
    if (!d.solid) { FLVC[b] = 0; continue; }
    if (d.render === 'box' && d.box && d.box[0] <= 0 && d.box[2] <= 0 && d.box[3] >= 16 && d.box[5] >= 16) { const y0 = Math.round(d.box[1] / 2), y1 = Math.round(d.box[4] / 2); FLVC[b] = y1 > y0 ? 100 + y0 * 9 + y1 : 0; continue; }
    FLVC[b] = 1; }
}
function flVoxVal(cb, cm, i, H) {
  const b = cb[i]; if (!b) return 0; const d = REG[b];
  if (d && d.liquid && (cm[i] & LIQ_PLACED)) return 0;
  if (d && d.liquid) { const up = (i >> 8) + 1 < H ? cb[i + 256] : 0; const cov = up && REG[up] && REG[up].liquid === d.liquid; if (d.liquid === 1 && !cov && (cm[i] & LIQ_OCEAN)) return 27; const a = cov ? 9 : liqAmt(cm[i]); return (d.liquid === 1 ? 16 : 32) + a; }
  if (d && d.inWater) return 16 + 9;
  return FLVC[b];
}
function flVoxFill(w) {
  if (!FLVC) flVoxTable();
  const [vx, vy, vz] = FL.vdim, [ox, oy, oz] = FL.org, D = FL.voxData, H = w.H;
  for (let z = 0; z < vz; z++) { const wz = oz + z; for (let x = 0; x < vx; x++) { const wx = ox + x; const c = w.chunk(wx >> 4, wz >> 4);
    const base = (wx & 15) | ((wz & 15) << 4);
    for (let y = 0; y < vy; y++) { const wy = oy + y; const k = x + vx * (y + vy * z);
      if (!c) { D[k] = 1; continue; } if (wy < 0) { D[k] = 1; continue; } if (wy >= H) { D[k] = 0; continue; }
      D[k] = flVoxVal(c.blocks, c.meta, base | (wy << 8), H); } } }
  const gl = R.gl; gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.bindTexture(gl.TEXTURE_3D, FL.vox); gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, vx, vy, vz, gl.RED, gl.UNSIGNED_BYTE, D); gl.bindTexture(gl.TEXTURE_3D, null); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  FL.voxDirty.length = 0; FL.voxLoaded = new Set(); FL.full = new Set();
  for (let cz = oz >> 4; cz <= (oz + vz - 1) >> 4; cz++) for (let cx = ox >> 4; cx <= (ox + vx - 1) >> 4; cx++) if (w.chunk(cx, cz)) FL.voxLoaded.add(cx + ',' + cz);
}
// chunks que llegaron después de rellenar la región: copiar su parte (una subida por chunk)
function flVoxChunks(w) {
  const [vx, vy, vz] = FL.vdim, [ox, oy, oz] = FL.org, D = FL.voxData, H = w.H; const gl = R.gl; let up = 0;
  for (let cz = oz >> 4; cz <= (oz + vz - 1) >> 4; cz++) for (let cx = ox >> 4; cx <= (ox + vx - 1) >> 4; cx++) {
    const key = cx + ',' + cz; if (FL.voxLoaded.has(key)) continue; const c = w.chunk(cx, cz); if (!c) continue; FL.voxLoaded.add(key);
    const x0 = Math.max(ox, cx * 16), x1 = Math.min(ox + vx, cx * 16 + 16), z0 = Math.max(oz, cz * 16), z1 = Math.min(oz + vz, cz * 16 + 16); if (x1 <= x0 || z1 <= z0) continue;
    const bw = x1 - x0, bd = z1 - z0; const box = new Uint8Array(bw * vy * bd);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) { const base = (x & 15) | ((z & 15) << 4);
      for (let y = 0; y < vy; y++) { const wy = oy + y; const v = wy < 0 ? 1 : wy >= H ? 0 : flVoxVal(c.blocks, c.meta, base | (wy << 8), H);
        D[(x - ox) + vx * (y + vy * (z - oz))] = v; box[(x - x0) + bw * (y + vy * (z - z0))] = v; } }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.bindTexture(gl.TEXTURE_3D, FL.vox); gl.texSubImage3D(gl.TEXTURE_3D, 0, x0 - ox, 0, z0 - oz, bw, vy, bd, gl.RED, gl.UNSIGNED_BYTE, box); gl.bindTexture(gl.TEXTURE_3D, null); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    if (++up >= 4) return; // como mucho 4 por vez
  }
}
// un bloque cambió: actualizar su celda y la de abajo (cubierta o no)
function flOnBlock(w, x, y, z) { if (!FL.ok || w !== FL.world) return; FL.voxDirty.push(x, y, z, x, y - 1, z); }
function flVoxFlush(w) {
  if (!FL.voxDirty.length) return; if (FL.voxDirty.length > 3 * 4000) { flVoxFill(w); return; } const gl = R.gl; const [vx, vy, vz] = FL.vdim, [ox, oy, oz] = FL.org; const one = new Uint8Array(1);
  gl.bindTexture(gl.TEXTURE_3D, FL.vox); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const seen = new Set();
  for (let i = 0; i < FL.voxDirty.length; i += 3) { const x = FL.voxDirty[i] - ox, y = FL.voxDirty[i + 1] - oy, z = FL.voxDirty[i + 2] - oz;
    if (x < 0 || y < 0 || z < 0 || x >= vx || y >= vy || z >= vz) continue; const k = x + vx * (y + vy * z); if (seen.has(k)) continue; seen.add(k);
    const wx = x + ox, wy = y + oy, wz = z + oz; const c = w.chunk(wx >> 4, wz >> 4); const v = c && wy >= 0 && wy < w.H ? flVoxVal(c.blocks, c.meta, (wx & 15) | ((wz & 15) << 4) | (wy << 8), w.H) : 1;
    FL.voxData[k] = v; one[0] = v; gl.texSubImage3D(gl.TEXTURE_3D, 0, x, y, z, 1, 1, 1, gl.RED, gl.UNSIGNED_BYTE, one); }
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); gl.bindTexture(gl.TEXTURE_3D, null); FL.voxDirty.length = 0;
}
// ---------------------------------------------------------------- altas y bajas (API de la CPU)
function flAlloc() { const N = FL.N, ph = FL.phase; while (FL.ptr < N && ph[FL.ptr]) FL.ptr++; if (FL.ptr >= N) return -1; return FL.ptr++; }
// una partícula en coordenadas del mundo; fase 1 agua, 2 lava, 3 agua puesta
function flSpawn(x, y, z, vx, vy, vz, phase, temp) {
  if (!FL.ok) return -1; const i = flAlloc(); if (i < 0) return -1; FL.phase[i] = phase; FL.spawnFrame[i] = FL.frame + 1; FL.alive++; if (i + 1 > FL.hi) FL.hi = i + 1;
  FL.spawnQ.push(i, x - FL.org[0], y - FL.org[1], z - FL.org[2], phase, vx, vy, vz, temp ?? (phase === 2 ? 1 : 0)); return i;
}
function flKill(i) { if (!FL.phase[i]) return; FL.phase[i] = 0; if (FL.rainTag) FL.rainTag[i] = 0; if (FL.scale[i] !== 255) { FL.scale[i] = 255; FL.scaleDirty = true; } FL.alive--; if (i < FL.ptr) FL.ptr = i; FL.killQ.push(i, 0, -1000, 0, 0, 0, 0, 0, 0); }
// rellena una caja del mundo con partículas en red (separación FL_S) con un poco de desorden; devuelve cuántas
function flSpawnBox(x0, y0, z0, x1, y1, z1, phase, vx = 0, vy = 0, vz = 0) {
  let n = 0; const s = FL_S;
  for (let y = y0 + s / 2; y < y1; y += s) for (let z = z0 + s / 2; z < z1; z += s) for (let x = x0 + s / 2; x < x1; x += s) {
    const j = () => (Math.random() - 0.5) * 0.03; if (flSpawn(x + j(), y + j(), z + j(), vx, vy, vz, phase) < 0) return n; n++; }
  return n;
}
function flFlushQueues() {
  const gl = R.gl; const q = FL.killQ.concat(FL.spawnQ); FL.killQ.length = 0; FL.spawnQ.length = 0; if (!q.length) return;
  const P = FL.P.spawn; gl.useProgram(P.p); gl.uniform1f(P.u.u_rows, FL.rows); gl.bindVertexArray(FL.spVao); gl.bindBuffer(gl.ARRAY_BUFFER, FL.spBuf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, FL.fbPV[FL.cur]); gl.viewport(0, 0, FL.W, FL.rows);
  for (let o = 0; o < q.length; o += 9 * 8192) { const part = new Float32Array(q.slice(o, o + 9 * 8192)); gl.bufferSubData(gl.ARRAY_BUFFER, 0, part); gl.drawArrays(gl.POINTS, 0, part.length / 9); }
  gl.bindVertexArray(null);
}
// ---------------------------------------------------------------- un paso de simulación
function flBindTex(P, name, unit, t, target) { const gl = R.gl; if (P.u[name] === undefined) return; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target || gl.TEXTURE_2D, t); gl.uniform1i(P.u[name], unit); }
function flCommon(P) { const gl = R.gl; const u = P.u;
  if (u.u_vdim) gl.uniform3i(u.u_vdim, FL.vdim[0], FL.vdim[1], FL.vdim[2]); if (u.u_M) gl.uniform1i(u.u_M, FL.M); if (u.u_dt) gl.uniform1f(u.u_dt, FL.dt);
  if (u.u_time) { gl.uniform1f(u.u_time, R.time || performance.now() / 1000); gl.uniform1f(u.u_rain, G.rainLevel || 0); gl.uniform1f(u.u_tide, oceanTide()); }
  if (u.u_waveK) gl.uniform1f(u.u_waveK, R.gfxU ? R.gfxU[0] : 1);
  if (u.u_org) gl.uniform3f(u.u_org, FL.org[0], FL.org[1], FL.org[2]);
  if (u.u_kp) gl.uniform1f(u.u_kp, FL.kp); if (u.u_ks) gl.uniform1f(u.u_ks, FL.ks); if (u.u_eps) gl.uniform1f(u.u_eps, FL.eps);
  flBindTex(P, 'u_vox', 8, FL.vox, gl.TEXTURE_3D); if (u.u_wdist) wdBind(P); }
function flPass(P, fb, rows) { const gl = R.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, FL.W, rows); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
function flStep() {
  const gl = R.gl; const rows = FL.M / FL.W; const T = FL.pos, V = FL.vel;
  // 1) predicción
  let P = FL.P.pred; gl.useProgram(P.p); flCommon(P);
  flBindTex(P, 'u_pos', 0, T[FL.cur]); flBindTex(P, 'u_vel', 1, V[FL.cur]);
  gl.uniform4fv(P.u.u_ent, FL.ents); gl.uniform4fv(P.u.u_entV, FL.entV); gl.uniform1i(P.u.u_nEnt, FL.nEnt);
  flPass(P, FL.fbPred[0], rows); FL.pcur = 0;
  // 2) claves
  P = FL.P.key; gl.useProgram(P.p); flCommon(P); flBindTex(P, 'u_pred', 2, FL.pred[0]); flPass(P, FL.fbKey[0], rows); FL.kcur = 0;
  // 3) ordenar
  P = FL.P.sort; gl.useProgram(P.p);
  for (let k = 2; k <= FL.M; k <<= 1) for (let j = k >> 1; j > 0; j >>= 1) {
    flBindTex(P, 'u_src', 0, FL.key[FL.kcur]); gl.uniform1i(P.u.u_k, k); gl.uniform1i(P.u.u_j, j); flPass(P, FL.fbKey[1 - FL.kcur], rows); FL.kcur = 1 - FL.kcur; }
  // 4) tabla hash → primera posición
  P = FL.P.tab; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, FL.fbTab); gl.viewport(0, 0, FL.TAB, FL.TAB);
  gl.clearColor(1e9, 0, 0, 0); gl.clearDepth(1); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  flBindTex(P, 'u_key', 0, FL.key[FL.kcur]); gl.uniform1i(P.u.u_M, FL.M); gl.drawArrays(gl.POINTS, 0, FL.M);
  gl.disable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  // 5-6) iteraciones del solver
  for (let it = 0; it < FL.iters; it++) {
    P = FL.P.lam; gl.useProgram(P.p); flCommon(P); flBindTex(P, 'u_pred', 2, FL.pred[FL.pcur]); flBindTex(P, 'u_key', 4, FL.key[FL.kcur]); flBindTex(P, 'u_tab', 5, FL.tab); flPass(P, FL.fbLam, rows);
    P = FL.P.del; gl.useProgram(P.p); flCommon(P); flBindTex(P, 'u_pred', 2, FL.pred[FL.pcur]); flBindTex(P, 'u_lam', 3, FL.lam); flBindTex(P, 'u_key', 4, FL.key[FL.kcur]); flBindTex(P, 'u_tab', 5, FL.tab);
    gl.uniform1f(P.u.u_sk, 0.0015); gl.uniform1f(P.u.u_wq, FL.wq); flPass(P, FL.fbPred[1 - FL.pcur], rows); FL.pcur = 1 - FL.pcur;
  }
  // 7) velocidades → POS/VEL nuevos (las filas sin simular se copian tal cual)
  P = FL.P.vel; gl.useProgram(P.p); flCommon(P); flBindTex(P, 'u_pred', 2, FL.pred[FL.pcur]); flBindTex(P, 'u_pos', 0, T[FL.cur]); flBindTex(P, 'u_vel', 1, V[FL.cur]); flBindTex(P, 'u_key', 4, FL.key[FL.kcur]); flBindTex(P, 'u_tab', 5, FL.tab);
  flPass(P, FL.fbPV[1 - FL.cur], rows);
  FL.cur = 1 - FL.cur; FL.steps++;
}
// mover la región con el jugador (múltiplos de 8 bloques)
function flRecenter(w, px, py, pz, force) {
  const [vx, vy, vz] = FL.vdim; const nx = Math.floor((px - vx / 2) / 8) * 8, ny = Math.floor((py - vy / 2) / 8) * 8, nz = Math.floor((pz - vz / 2) / 8) * 8;
  const [ox, oy, oz] = FL.org; if (!force && FL.world === w && Math.abs(nx - ox) < 16 && Math.abs(ny - oy) < 12 && Math.abs(nz - oz) < 16) return;
  const gl = R.gl;
  if (FL.world === w && FL.hi > 0) { // desplazar las partículas al nuevo origen
    let P = FL.P.shift; gl.useProgram(P.p); flCommon(P); gl.bindVertexArray(FL.vao); flBindTex(P, 'u_pos', 0, FL.pos[FL.cur]); gl.uniform3f(P.u.u_shift, ox - nx, oy - ny, oz - nz);
    flPass(P, FL.fbPos[1 - FL.cur], FL.rows);
    P = FL.P.copy; gl.useProgram(P.p); flBindTex(P, 'u_vel', 1, FL.vel[FL.cur]); flPass(P, FL.fbVel[1 - FL.cur], FL.rows); FL.cur = 1 - FL.cur;
  } else if (FL.world !== w) { for (let i = 0; i < FL.hi; i++) if (FL.phase[i]) flKill(i); FL.hi = 0; FL.ptr = 0; FL.alive = 0; FL.killQ.length = 0;
    for (const f of FL.fbPV) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } }
  FL.org = [nx, ny, nz]; FL.world = w; FL.rb.ready = false; FL.rb.sync = null; flVoxFill(w);
}
// avance por cuadro (a 60 pasos por segundo como mucho 2 por cuadro)
function flUpdate(dt, w) {
  const gl = R.gl; if (!gl || !G.player) return;
  if (FL.gl !== gl) flInit();
  if (!FL.ok || R.q < 2) return;
  flOceanFillTick();
  const p = G.player; FL.frame++; flRecenter(w, p.x, p.y, p.z, false);
  if (FL.pending && FL.pending.dim === w.dim) { const a = FL.pending.p; FL.pending = null; for (let i = 0; i + 4 < a.length; i += 5) if (flSpawn(a[i], a[i + 1], a[i + 2], 0, 0, 0, a[i + 3], a[i + 4]) < 0) break; }
  if (FL.frame % 20 === 0) flVoxChunks(w);
  flVoxFlush(w);
  while (FL.hi > 0 && !FL.phase[FL.hi - 1]) FL.hi--;
  const hasWork = FL.hi > 0 || FL.spawnQ.length || FL.killQ.length; if (!hasWork) return;
  gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  if (dt > 0) flDyingTick(); flScaleUpload(); // congelado (/tick freeze o pausa): ni se encogen ni se absorben
  flFlushQueues();
  FL.M = Math.max(256, 1 << Math.ceil(Math.log2(Math.max(1, FL.hi))));
  flEntities(w);
  gl.bindVertexArray(FL.vao);
  FL.acc = Math.min(FL.acc + dt, 2 / 60); FL.dt = 1 / 60; let n = 0;
  while (FL.acc >= FL.dt * 0.999 && n < 2) { FL.acc -= FL.dt; flStep(); n++; }
  if (dt > 0) flReadback();
  gl.bindVertexArray(null); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  gl.activeTexture(gl.TEXTURE0);
}
// cápsulas de las entidades cercanas (empujan el líquido)
function flEntities(w) {
  const E = FL.ents, V = FL.entV; let n = 0; const o = FL.org;
  const add = (e, r, hh, cy = hh) => { if (n >= 8) return; const k = n * 4; E[k] = e.x - o[0]; E[k + 1] = e.y + cy - o[1]; E[k + 2] = e.z - o[2]; E[k + 3] = r; V[k] = e.vx || 0; V[k + 1] = e.vy || 0; V[k + 2] = e.vz || 0; V[k + 3] = hh; n++; };
  const p = G.player; if (p && !p.dead && G.gameMode !== 'spectator') { if (typeof broomColliders === 'function') broomColliders(add); add(p, 0.35, 0.55, 0.9); } // cápsula de 0 a 1,8: no sobresale por encima de la cabeza
  for (const e of G.entities.values()) { if (n >= 8) break; if (e.removed || e.dead || e.dim !== p.dim) continue; if (Math.abs(e.x - p.x) > 24 || Math.abs(e.z - p.z) > 24) continue; if (e instanceof Mob) { const r = Math.max(0.25, (e.w || 0.6) * 0.5), h = e.h || 1.8; add(e, r, Math.max(0.02, h * 0.5 - r), h * 0.5); } else if (e.type === 'item') add(e, 0.15, 0.12); }
  FL.nEnt = n;
}
// lectura asíncrona de POS y VEL (cada ~6 cuadros); FL.rb.pos/vel quedan con la última foto (coordenadas del mundo en flParticles)
function flReadback() {
  const gl = R.gl; const rb = FL.rb;
  if (rb.sync) {
    const st = gl.getSyncParameter(rb.sync, gl.SYNC_STATUS);
    if (st !== gl.SIGNALED) return;
    gl.deleteSync(rb.sync); rb.sync = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, rb.pbo); const n = rb.n;
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rb.pos, 0, n * 4); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, rb.pbo2); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rb.vel, 0, n * 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); rb.ready = true; rb.count = n; rb.orgNow = rb.orgPending; rb.frameAt = rb.framePending; rb.stamp = performance.now();
    if (typeof flAfterReadback === 'function') flAfterReadback();
    return;
  }
  if (++rb.frame < 6) return; rb.frame = 0;
  const rows = Math.ceil(FL.hi / FL.W); if (!rows) return; const n = rows * FL.W;
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, rb.pbo);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, FL.fbPV[FL.cur]);
  gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0, 0, FL.W, rows, gl.RGBA, gl.FLOAT, 0);
  gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, rb.pbo2); gl.readPixels(0, 0, FL.W, rows, gl.RGBA, gl.FLOAT, 0);
  gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  rb.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); rb.n = n; rb.orgPending = FL.org.slice(); rb.framePending = FL.frame; gl.flush();
}
// vista de depuración (esferas)
function flDrawDebug() {
  if (!FL.ok || !FL.hi || !FL.debug) return; const gl = R.gl; const P = FL.P.dbg; gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.u.u_vp, false, R.vp); gl.uniform3f(P.u.u_off, FL.org[0] - R.cam[0], FL.org[1] - R.cam[1], FL.org[2] - R.cam[2]);
  const v = R.view; gl.uniform3f(P.u.u_cr, v[0], v[4], v[8]); gl.uniform3f(P.u.u_cu, v[1], v[5], v[9]);
  flBindTex(P, 'u_pos', 0, FL.pos[FL.cur]); flBindTex(P, 'u_vel', 1, FL.vel[FL.cur]);
  gl.bindVertexArray(FL.vao); gl.disable(gl.CULL_FACE); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, FL.hi); gl.enable(gl.CULL_FACE); gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
}
(R.restoreHooks = R.restoreHooks || []).push(() => { FL.gl = null; FL.ok = false; });
// ============================================================================
//  Render del fluido continuo en espacio de pantalla
// ============================================================================
// 1) profundidad de la esfera más cercana de cada píxel (y su fase); 2) grosor acumulado (agua, lava, calor, espuma);
// 3) suavizado bilateral de la profundidad → una superficie continua sin bolitas; 4) composición: normal reconstruida,
// refracción (IOR 1,333) de la escena, absorción de Beer-Lambert por el grosor, Fresnel, brillo del sol; la lava,
// opaca y emisiva (cuerpo negro según su temperatura) con costra que se enfría.
const VS_FLSPH = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D u_pos, u_vel, u_lam; uniform sampler2D u_scl; uniform mat4 u_view, u_proj; uniform vec3 u_off; uniform float u_rad;
out vec2 v_q; out vec3 v_ce; out float v_ph; out float v_t; out float v_s; out float v_r;
void main(){ int i=gl_InstanceID; vec4 P=texelFetch(u_pos,ivec2(i&255,i>>8),0); vec4 V=texelFetch(u_vel,ivec2(i&255,i>>8),0);
  vec2 q=vec2(float(gl_VertexID&1),float(gl_VertexID>>1))*2.0-1.0; v_q=q;
  float ph=mod(P.w,10.0); if(P.w<0.5 || P.w>=30.0){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  v_ph=ph>1.5&&ph<2.5?2.0:1.0; v_t=V.w; v_s=length(V.xyz);
  // gotas sueltas (poca densidad alrededor): más pequeñas y blancas, como salpicaduras
  float rho=texelFetch(u_lam,ivec2(i&255,i>>8),0).y; float iso=1.0-smoothstep(0.22,0.36,rho); if(P.w>=10.0) iso=0.0;
  v_t=max(v_t,iso*(v_ph>1.5?0.0:0.8));
  float scl=texelFetch(u_scl,ivec2(i&255,i>>8),0).r; // al desaparecer: se encoge y se hunde en el suelo
  vec3 ce=mat3(u_view)*(P.xyz+u_off-vec3(0.0,(1.0-scl)*0.12,0.0)); v_ce=ce; float r=u_rad*(v_ph>1.5?1.15:1.0)*mix(1.0,0.45,iso)*scl; v_r=r; if(scl<0.02){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  gl_Position=u_proj*vec4(ce+vec3(q*r*1.05,0.0),1.0); }`;
const FS_FLDEPTH = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D u_depthCopy; uniform mat4 u_proj; uniform float u_rad, u_near, u_far; uniform vec2 u_res;
in vec2 v_q; in vec3 v_ce; in float v_ph; in float v_t; in float v_s; in float v_r; out vec4 o;
float linD(float d){ float z=d*2.0-1.0; return 2.0*u_near*u_far/(u_far+u_near-z*(u_far-u_near)); }
void main(){ float r2=dot(v_q,v_q); if(r2>1.0) discard; float r=v_r;
  vec3 e=v_ce+vec3(v_q*r,sqrt(1.0-r2)*r); float d=-e.z; if(d<=0.05) discard;
  float sd=linD(texture(u_depthCopy,gl_FragCoord.xy/u_res).r); if(d>sd+0.02) discard;
  vec4 c=u_proj*vec4(e,1.0); gl_FragDepth=c.z/c.w*0.5+0.5; o=vec4(d,v_ph,0.0,1.0); }`;
const FS_FLTHICK = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D u_depthCopy; uniform float u_rad, u_near, u_far; uniform vec2 u_res;
in vec2 v_q; in vec3 v_ce; in float v_ph; in float v_t; in float v_s; in float v_r; out vec4 o;
float linD(float d){ float z=d*2.0-1.0; return 2.0*u_near*u_far/(u_far+u_near-z*(u_far-u_near)); }
void main(){ float r2=dot(v_q,v_q); if(r2>1.0) discard; float r=v_r;
  float sd=linD(texture(u_depthCopy,gl_FragCoord.xy/u_res).r); if(-v_ce.z-r>sd) discard;
  float th=2.0*r*sqrt(1.0-r2)*0.6; // la red de partículas deja huecos: cada esfera aporta algo menos que su cuerda
  o=v_ph>1.5?vec4(0.0,th,th*v_t,th*min(v_s,4.0)*0.25):vec4(th,0.0,0.0,th*v_t); }`;
// suavizado bilateral separable (en profundidad lineal; respeta saltos grandes)
const FS_FLSMOOTH = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D u_src; uniform vec2 u_dir; uniform float u_ps; uniform float u_wr; out vec4 o;
void main(){ ivec2 f=ivec2(gl_FragCoord.xy); vec4 c=texelFetch(u_src,f,0); float d=c.x; if(d<=0.0){ o=c; return; }
  float rp=clamp(u_wr*u_ps/d,1.0,16.0); float sig=rp*0.5; float sd=0.09+d*0.004;
  float sum=d, ws=1.0; int n=int(ceil(rp)); ivec2 sz=textureSize(u_src,0);
  for(int k=1;k<=16;k++){ if(k>n) break; float fk=float(k); float g=exp(-fk*fk/(2.0*sig*sig));
    for(int s=-1;s<=1;s+=2){ ivec2 q=clamp(f+ivec2(u_dir*fk*float(s)),ivec2(0),sz-1); float dj=texelFetch(u_src,q,0).x; if(dj<=0.0) continue;
      float dd=(dj-d)/sd; float w=g*exp(-dd*dd); sum+=dj*w; ws+=w; } }
  o=vec4(sum/ws,c.y,0.0,1.0); }`;
const FS_FLCOMP = `#version 300 es
precision highp float; precision highp sampler2D;
##COMMON##
uniform sampler2D u_fd, u_ft, u_sceneCopy; uniform mat4 u_proj, u_view; uniform vec2 u_res; uniform float u_ss; uniform float u_camIn; out vec4 o;
vec3 vor(vec2 p, float tt){ vec2 i=floor(p), f=fract(p); float d1=8.0, d2=8.0, id=0.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)); vec2 h=vec2(hash12(i+g),hash12(i+g+17.31)); vec2 r=g+0.5+0.42*sin(tt+6.2831*h)-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; id=hash12(i+g+3.7); } else if(d<d2) d2=d; }
  return vec3(sqrt(d1),sqrt(d2),id); }
vec3 eyeAt(ivec2 p, float d){ vec2 uv=(vec2(p)+0.5)/(u_res*u_ss); vec2 nd=uv*2.0-1.0; return vec3(nd.x/u_proj[0][0],nd.y/u_proj[1][1],-1.0)*d; }
void main(){
  ivec2 hp=ivec2(gl_FragCoord.xy*u_ss); ivec2 sz=textureSize(u_fd,0); hp=min(hp,sz-1);
  vec4 F=texelFetch(u_fd,hp,0); float d=F.x; if(d<=0.0) discard;
  float db=d; { vec2 q=gl_FragCoord.xy*u_ss-0.5; ivec2 b=ivec2(floor(q)); vec2 f=fract(q); float ws=0.0, s=0.0;
    for(int k=0;k<4;k++){ ivec2 o2=ivec2(k&1,k>>1); float dk=texelFetch(u_fd,clamp(b+o2,ivec2(0),sz-1),0).x; if(dk<=0.0||abs(dk-d)>0.25) continue;
      float w=(o2.x==1?f.x:1.0-f.x)*(o2.y==1?f.y:1.0-f.y)+1e-4; s+=dk*w; ws+=w; } if(ws>0.0) db=s/ws; }
  vec4 Th=texture(u_ft,gl_FragCoord.xy/u_res); float tw=Th.r, tl=Th.g;
  bool lava=F.y>1.5; if((lava?tl:tw)<0.004 && !(u_camIn>0.5 && !lava)) discard;
  // normal: diferencias con el vecino de menor salto en cada eje
  vec3 P=eyeAt(hp,d);
  float dxp=texelFetch(u_fd,min(hp+ivec2(1,0),sz-1),0).x, dxm=texelFetch(u_fd,max(hp-ivec2(1,0),ivec2(0)),0).x;
  float dyp=texelFetch(u_fd,min(hp+ivec2(0,1),sz-1),0).x, dym=texelFetch(u_fd,max(hp-ivec2(0,1),ivec2(0)),0).x;
  vec3 ddx=(dxp>0.0 && (abs(dxp-d)<abs(dxm-d) || dxm<=0.0)) ? eyeAt(hp+ivec2(1,0),dxp)-P : (dxm>0.0 ? P-eyeAt(hp-ivec2(1,0),dxm) : vec3(1e-3,0.0,0.0));
  vec3 ddy=(dyp>0.0 && (abs(dyp-d)<abs(dym-d) || dym<=0.0)) ? eyeAt(hp+ivec2(0,1),dyp)-P : (dym>0.0 ? P-eyeAt(hp-ivec2(0,1),dym) : vec3(0.0,1e-3,0.0));
  vec3 Ne=normalize(cross(ddx,ddy)); if(Ne.z<0.0) Ne=-Ne;
  vec2 ndf=gl_FragCoord.xy/u_res*2.0-1.0; vec3 Pf=vec3(ndf.x/u_proj[0][0],ndf.y/u_proj[1][1],-1.0)*db; // posición en este píxel (resolución completa)
  mat3 iv=transpose(mat3(u_view)); vec3 N=normalize(iv*Ne); vec3 wp=iv*Pf; vec3 V=normalize(wp);
  float NdV=clamp(dot(N,-V),0.0,1.0);
  float sh=u_dim==0?getShadow(wp,N):0.0; vec3 Lsun=u_sunCol*sh;
  vec3 col; float alpha=1.0;
  if(!lava && u_camIn>0.5){
    // con la cámara dentro del agua: solo se ve la superficie desde abajo (la profundidad es la más lejana de cada píxel),
    // con la escena de detrás desviada y reflexión total interna al mirar de lado; la niebla submarina hace el resto
    vec2 suv=gl_FragCoord.xy/u_res; vec3 behind=texture(u_sceneCopy,clamp(suv+Ne.xy*0.03,0.001,0.999)).rgb;
    float tir=smoothstep(0.45,0.2,NdV); col=mix(behind,u_fogCol*1.5+u_amb*0.04*u_camSky,tir);
  } else if(!lava){
    vec2 suv=gl_FragCoord.xy/u_res; vec2 off=Ne.xy*clamp(tw,0.0,1.2)*0.035; // refracción (IOR 1,333): desvía según la normal y el grosor
    vec3 behind=texture(u_sceneCopy,clamp(suv+off,0.001,0.999)).rgb;
    vec3 sA=vec3(0.60,0.16,0.19), sS=vec3(0.014,0.024,0.017), sT=sA+sS;
    vec3 Tv=exp(-sT*tw*1.3);
    vec3 lightIn=u_amb*0.9*u_camSky+Lsun*0.8+dynLights(wp)*0.3;
    vec3 refr=behind*Tv+lightIn*(sS/sT)*(1.0-Tv)*1.15;
    vec3 R=reflect(V,N); if(R.y<0.02) R.y=0.02+abs(R.y)*0.2; R=normalize(R);
    vec3 refl=mix(skyColor(R),skyColorK(normalize(vec3(R.x,0.02,R.z)),0.0)*vec3(0.32,0.36,0.3)*0.5,smoothstep(0.16,0.0,R.y)*0.7)*mix(0.03,1.0,u_camSky*u_camSky);
    float fres=0.02+0.98*pow(1.0-NdV,5.0);
    col=mix(refr,refl,fres);
    // brillo del sol (GGX)
    float a=0.06; vec3 Hh=normalize(u_sunDir-V); float NdH=max(dot(N,Hh),0.0), NdL=max(dot(N,u_sunDir),0.0); float a2=a*a; float dd=NdH*NdH*(a2-1.0)+1.0;
    float D=a2/(3.14159*dd*dd); float Vis=0.5/max(NdL*sqrt(NdV*NdV*(1.0-a2)+a2)+NdV*sqrt(NdL*NdL*(1.0-a2)+a2),1e-4); float Fh=0.02+0.98*pow(1.0-max(dot(Hh,-V),0.0),5.0);
    col+=Lsun*D*Vis*Fh*NdL;
    // espuma y salpicaduras (agua rápida y dispersa)
    float foam=clamp(Th.a/max(tw,1e-3),0.0,1.0); foam*=0.6+0.4*vnoise(wp.xz*6.0+u_camPos.xz*6.0+u_time);
    col=mix(col,(u_amb*0.9+Lsun*0.6*max(N.y,0.3))*0.85,foam*0.85);
    alpha=smoothstep(0.004,0.06,tw); // borde fino: se funde con lo de detrás
    col=mix(texture(u_sceneCopy,suv).rgb,col,alpha);
  } else {
    float T=clamp(Th.b/max(tl,1e-3),0.0,1.0), spd=clamp(Th.a/max(tl,1e-3),0.0,1.0)*4.0; vec3 wq=wp+u_camPos;
    vec2 p=(wq.xz+vec2(wq.y*0.37))*1.05; vec3 va=vor(p,u_time*0.05); float e=va.y-va.x, pid=va.z;
    float hot=clamp(0.55+min(spd,2.5)*0.15+(T-0.9)*0.8+(fbm(wq.xz*0.28+vec2(u_time*0.02,-u_time*0.015))-0.5)*1.2,0.0,1.0);
    float cw=0.1+0.26*hot*hot; float wd=max(cw,fwidth(e)*1.5); float cov=clamp((1.0-smoothstep(0.0,wd,e))*(cw/wd),0.0,1.0); cov*=mix(0.45,1.0,sqrt(NdV));
    float pool=smoothstep(0.45,0.8,hot)*(1.0-smoothstep(0.0,0.4,e)*0.55);
    float molten=clamp(max(cov,pool),0.0,1.0);
    float Tc=1010.0+260.0*(1.0-smoothstep(0.0,0.3,e))*(0.35+0.65*hot), Tm=1230.0+210.0*hot+60.0*pool;
    vec3 Ec=vec3(1.0,0.6*pow(clamp((Tc-700.0)/1100.0,0.0,1.0),1.6),0.5*pow(clamp((Tc-1300.0)/1500.0,0.0,1.0),2.0))*pow(Tc/1300.0,9.0)*5.0;
    vec3 Em=vec3(1.0,0.6*pow(clamp((Tm-700.0)/1100.0,0.0,1.0),1.6),0.5*pow(clamp((Tm-1300.0)/1500.0,0.0,1.0),2.0))*pow(Tm/1300.0,9.0)*5.0;
    vec3 alb=mix(vec3(0.05,0.022,0.012),vec3(0.08,0.035,0.018),pid)*(0.7+0.6*vnoise(wq.xz*7.0));
    vec3 dif=alb*(Lsun*max(dot(N,u_sunDir),0.0)+u_amb*(0.55+0.45*N.y)*u_camSky+dynLights(wp)*0.4);
    vec3 R=reflect(V,N); dif+=Lsun*pow(max(dot(R,u_sunDir),0.0),24.0)*0.08;
    col=dif*(1.0-molten)+mix(Ec,Em,molten);
    alpha=smoothstep(0.004,0.03,tl); col=mix(texture(u_sceneCopy,gl_FragCoord.xy/u_res).rgb,col,alpha);
  }
  col=applyFog(col,wp,1.0);
  vec4 c=u_proj*vec4(Pf,1.0); gl_FragDepth=c.z/c.w*0.5+0.5;
  o=vec4(col,lava?2.0:1.0);
}`;
function flRInit() {
  const gl = R.gl; const S = FL.R = { ok: false };
  try { S.sph = compileRaw(VS_FLSPH, FS_FLDEPTH); S.thick = compileRaw(VS_FLSPH, FS_FLTHICK); S.smooth = compileRaw(VS_FLQUAD, FS_FLSMOOTH); S.comp = compile(VS_FLQUAD, FS_FLCOMP); }
  catch (e) { console.warn('render del fluido', e); return; }
  S.ok = true; S.w = 0; S.h = 0;
}
function flRTargets() {
  const gl = R.gl, S = FL.R; const ss = R.q >= 3 ? 1 : 0.5; const w = Math.max(1, Math.round(R.w * ss)), h = Math.max(1, Math.round(R.h * ss));
  if (S.w === w && S.h === h && S.ss === ss) return; S.w = w; S.h = h; S.ss = ss;
  for (const k of ['fdA', 'fdB', 'fth']) if (S[k]) { gl.deleteFramebuffer(S[k].fb); gl.deleteTexture(S[k].tex); if (S[k].rb) gl.deleteRenderbuffer(S[k].rb); }
  const mk = (ifmt, fmt, type, depth, lin) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    const f = lin ? gl.LINEAR : gl.NEAREST; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); let rb = null;
    if (depth) { rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb); }
    return { tex: t, fb, rb }; };
  S.fdA = mk(gl.RG32F, gl.RG, gl.FLOAT, true, false); S.fdB = mk(gl.RG32F, gl.RG, gl.FLOAT, false, false); S.fth = mk(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, false, true);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
// dibuja el fluido sobre la escena (después del agua quieta); deja enlazado el framebuffer de la escena
function flRender() {
  if (!FL.ok || !FL.hi || R.q < 2 || !R.fbo.copy || FL.world !== G.world) return;
  const gl = R.gl; if (!FL.R || FL.R.gl !== gl) { flRInit(); FL.R.gl = gl; } const S = FL.R; if (!S.ok) return;
  flRTargets();
  // la escena con el agua quieta y las cascadas, para refractarla (la profundidad copiada sigue siendo la opaca)
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, R.fbo.scene.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.fbo.copy.fb);
  const K = FL.rskip || 0;
  if (!(K & 16)) gl.blitFramebuffer(0, 0, R.w, R.h, 0, 0, R.w, R.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  const off = [FL.org[0] - R.cam[0], FL.org[1] - R.cam[1], FL.org[2] - R.cam[2]]; const rad = 0.13;
  gl.bindVertexArray(FL.vao); gl.disable(gl.CULL_FACE);
  const sphU = P => { gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.u_view, false, R.view); gl.uniformMatrix4fv(P.u.u_proj, false, R.proj); gl.uniform3f(P.u.u_off, off[0], off[1], off[2]); gl.uniform1f(P.u.u_rad, rad);
    flBindTex(P, 'u_pos', 0, FL.pos[FL.cur]); flBindTex(P, 'u_vel', 1, FL.vel[FL.cur]); flBindTex(P, 'u_lam', 2, FL.lam); flBindTex(P, 'u_scl', 9, FL.scaleTex); flBindTex(P, 'u_depthCopy', 3, R.fbo.copy.depth);
    if (P.u.u_near) { gl.uniform1f(P.u.u_near, R.near); gl.uniform1f(P.u.u_far, R.far); } if (P.u.u_res) gl.uniform2f(P.u.u_res, S.w, S.h); };
  // 1) profundidad (desde dentro del agua, la más lejana: es donde el rayo sale del líquido, no la bolita más cercana)
  const camIn = typeof flLiquidAt === 'function' && flLiquidAt(G.world, R.cam[0], R.cam[1], R.cam[2]) === 1; FL.camIn = camIn;
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.fdA.fb); gl.viewport(0, 0, S.w, S.h); gl.clearColor(0, 0, 0, 0); gl.clearDepth(camIn ? 0 : 1); gl.enable(gl.DEPTH_TEST); gl.depthFunc(camIn ? gl.GREATER : gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); sphU(S.sph); if (!(K & 1)) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, FL.hi); gl.depthFunc(gl.LESS); gl.clearDepth(1);
  // 2) grosor
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.fth.fb); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  sphU(S.thick); if (!(K & 2)) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, FL.hi); gl.disable(gl.BLEND);
  // 3) suavizado (2 vueltas horizontal + vertical)
  const P = S.smooth; gl.useProgram(P.p); gl.uniform1f(P.u.u_ps, R.proj[5] * 0.5 * S.h); gl.uniform1f(P.u.u_wr, rad * 3.2);
  if (!(K & 4)) for (let it = 0; it < 3; it++) for (const [dx, dy, src, dst] of [[1, 0, S.fdA, S.fdB], [0, 1, S.fdB, S.fdA]]) { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); flBindTex(P, 'u_src', 0, src.tex); gl.uniform2f(P.u.u_dir, dx, dy); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  // 4) composición sobre la escena, con prueba de profundidad contra lo ya dibujado (agua quieta incluida)
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.scene.fb); gl.viewport(0, 0, R.w, R.h); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
  const C = S.comp; gl.useProgram(C.p); setCommon(C); gl.uniformMatrix4fv(C.u.u_proj, false, R.proj); gl.uniformMatrix4fv(C.u.u_view, false, R.view); gl.uniform2f(C.u.u_res, R.w, R.h); gl.uniform1f(C.u.u_ss, S.ss); if (C.u.u_camIn) gl.uniform1f(C.u.u_camIn, camIn ? 1 : 0);
  flBindTex(C, 'u_fd', 2, S.fdA.tex); flBindTex(C, 'u_ft', 3, S.fth.tex); flBindTex(C, 'u_sceneCopy', 4, R.fbo.copy.tex);
  if (!(K & 8)) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
}
// ============================================================================
//  Integración con el mundo
// ============================================================================
// El líquido normal (lagos, mar, charcos asentados) sigue guardado en las celdas como volumen, fluye con las reglas
// de siempre (k_fluids) y nunca se convierte en partículas: solo el cubo las crea. Las partículas que se calman se
// vuelven a guardar como volumen nivelado, y las que tocan agua o lava normal se suman a ella (el mar las absorbe
// sin límite). Así no hay idas y vueltas entre los dos estados.
// El agua puesta con cubo (o derramada) lleva LIQ_PLACED: sobre tierra, pasto, hojas, arena… se va filtrando.
const LIQ_PLACED = 16;
let FL_POROUS = null;
function flPorous(b) {
  if (!FL_POROUS) { FL_POROUS = new Set(); for (const n of ['grass_block', 'dirt', 'coarse_dirt', 'rooted_dirt', 'podzol', 'mycelium', 'farmland', 'dirt_path', 'sand', 'red_sand', 'gravel', 'moss_block', 'mud', 'clay', 'soul_sand', 'soul_soil', 'snow_block'])
    if (ID[n] !== undefined) FL_POROUS.add(ID[n]); for (let b2 = 1; b2 < REG.length; b2++) if (REG[b2] && REG[b2].leaves) FL_POROUS.add(b2); }
  return FL_POROUS.has(b);
}
function flCanSim(w, x, y, z) {
  if (!FL.ok || R.q < 2 || !G.player || w !== G.world || FL.world !== w || (G.net && G.net.role === 'client')) return false;
  const o = SETTINGS.physics; if (o && o.liquids && o.liquids.continuous === false) return false;
  if (x === undefined) return true;
  const [ox, oy, oz] = FL.org, [vx, vy, vz] = FL.vdim; return x >= ox + 3 && y >= oy + 3 && z >= oz + 3 && x < ox + vx - 3 && y < oy + vy - 3 && z < oz + vz - 3;
}
function flFree() { return FL.N - FL.alive; }
function flSetStatic(w, x, y, z, liq, amt, placed) {
  const id = liq === 1 ? ID.water : ID.lava; const b = w.get(x, y, z);
  if (amt <= 0) { if (b > 0 && REG[b].liquid) w.set(x, y, z, 0); return; }
  if (b > 0 && !REG[b].liquid && REG[b].replace) dropBlockItems(w, x, y, z, b, null, true);
  const m = liqMeta(Math.min(8, amt), false, false) | (placed && liq === 1 ? LIQ_PLACED : 0);
  if (b !== id || w.getMeta(x, y, z) !== m) w.set(x, y, z, id, m);
}
// a octavos de líquido en la celda → partículas (FL_K×FL_K por capa, de abajo arriba)
function flSpawnCell(w, x, y, z, a, phase, vx, vy, vz) {
  const n = Math.min(FL_PPB, Math.round(a / 8 * FL_PPB)); const s = FL_S; let k = 0; const KK = FL_K * FL_K;
  const order = []; for (let i = 0; i < KK; i++) order.push(i);
  for (let layer = 0; layer < FL_K && k < n; layer++) {
    for (let i = KK - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
    for (let q = 0; q < KK && k < n; q++, k++) { const gx = order[q] % FL_K, gz = (order[q] / FL_K) | 0; const jt = () => (Math.random() - 0.5) * 0.03;
      flSpawn(x + (gx + 0.5) * s + jt(), y + (layer + 0.5) * s + jt(), z + (gz + 0.5) * s + jt(), vx + jt() * 5, vy, vz + jt() * 5, phase); }
  }
  return k;
}
// el hueco ya lleno de partículas no vuelve a pedir agua al mar (las partículas cuentan como líquido): pasado un
// segundo se convierte en mar igualmente y las partículas que quedan dentro se funden con él
FL.oceanFill = [];
function flOceanFillTick() {
  const L = FL.oceanFill; if (!L.length) return;
  while (L.length && G.tick - L[0][0] > 20) { const [, w, x, y, z] = L.shift(); const b = w.get(x, y, z); if (y <= SEA && (b === 0 || (b > 0 && REG[b].liquid === 1 && !(w.getMeta(x, y, z) & LIQ_OCEAN)))) w.set(x, y, z, ID.water, LIQ_OCEAN); }
}
// ---------------------------------------------------------------- lo que hacen las partículas (tras cada lectura)
const FLK = (x, y, z) => ((x + 32768) * 65536 + (z + 32768)) * 512 + (y + 64);
FL.frame = 0; FL.spawnFrame = null; FL.calm = new Map(); FL.acc2 = new Map(); FL.occ = new Map();
function flAbsorb(w, x, y, z, base, flag) {
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z); const b = w.get(bx, by, bz);
  const lavaP = base === 2; const into = flag === 1 ? 1 : 2; // líquido quieto en el que entró
  if (b <= 0 || !REG[b] || (REG[b].liquid !== into && !(into === 1 && REG[b].inWater))) return;
  if (into === 1 && (w.getMeta(bx, by, bz) & LIQ_OCEAN)) { if (lavaP) flQuenchAcc(w, bx, by, bz, true); return; } // el mar se lo traga
  if (lavaP !== (into === 2)) { flQuenchAcc(w, bx, by, bz, lavaP); return; }
  // sumar 1/8 de bloque cada 8 partículas, en lo más alto de la columna de ese líquido
  const k = FLK(bx, by, bz); const v = (FL.acc2.get(k) || 0) + 1; if (v < FL_PPB / 8) { FL.acc2.set(k, v); return; } FL.acc2.set(k, v - FL_PPB / 8);
  let ty = by; while (ty < by + 8 && w.get(bx, ty + 1, bz) === b) ty++;
  const m = w.getMeta(bx, ty, bz); const a = liqAmt(m); const placed = (m & LIQ_PLACED) !== 0 || base === 3;
  if (a < 8) flSetStatic(w, bx, ty, bz, into, a + 1, placed);
  else if (cellVol(w, bx, ty + 1, bz, into) === 0) flSetStatic(w, bx, ty + 1, bz, into, 1, placed);
}
// celdas de aire ya llenas de partículas: en la textura de vóxeles valen 50 (para chocar siguen siendo aire), así el
// shader no manda más líquido hacia un hueco que ya está lleno (la búsqueda de "lo más bajo" las ve como suelo)
FL.full = new Set();
function flMarkFull(occ) {
  const gl = R.gl; const [vx, vy, vz] = FL.vdim, [ox, oy, oz] = FL.org; const D = FL.voxData; const want = new Set(); const one = new Uint8Array(1);
  for (const c of occ.values()) { if (c.idx.length < FL_PPB * 0.6) continue; const x = c.x - ox, y = c.y - oy, z = c.z - oz; if (x < 0 || y < 0 || z < 0 || x >= vx || y >= vy || z >= vz) continue; const k = x + vx * (y + vy * z); if (D[k] === 0 || D[k] === 50) want.add(k); }
  let changed = false; gl.bindTexture(gl.TEXTURE_3D, FL.vox); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const put = (k, v) => { D[k] = v; one[0] = v; const x = k % vx, y = Math.floor(k / vx) % vy, z = Math.floor(k / (vx * vy)); gl.texSubImage3D(gl.TEXTURE_3D, 0, x, y, z, 1, 1, 1, gl.RED, gl.UNSIGNED_BYTE, one); changed = true; };
  for (const k of FL.full) if (!want.has(k) && D[k] === 50) put(k, 0);
  for (const k of want) if (D[k] !== 50) put(k, 50);
  FL.full = want; gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); gl.bindTexture(gl.TEXTURE_3D, null);
}
// agua y lava que se tocan: la lava se enfría en piedra (obsidiana si había mucha)
function flQuenchAcc(w, x, y, z, lavaInWater) {
  const k = FLK(x, y, z) + 0.5; const v = (FL.acc2.get(k) || 0) + 1; if (v < (lavaInWater ? 24 : 16)) { FL.acc2.set(k, v); return; } FL.acc2.delete(k);
  const b = w.get(x, y, z);
  if (lavaInWater) { if (b > 0 && REG[b].liquid === 1 && !(w.getMeta(x, y, z) & LIQ_OCEAN)) w.set(x, y, z, ID.cobblestone); else if (w.get(x, y - 1, z) <= 0 || (w.get(x, y - 1, z) > 0 && REG[w.get(x, y - 1, z)].liquid)) { } }
  else if (b === ID.lava) w.set(x, y, z, liqAmt(w.getMeta(x, y, z)) >= 6 ? ID.obsidian : ID.cobblestone);
  fizz(w, x, y, z);
}
function flAfterReadback() {
  const rb = FL.rb, w = FL.world; if (!w || !FL.spawnFrame) return; const n = rb.count, o = rb.orgNow, P = rb.pos, V = rb.vel, F = rb.frameAt;
  const now = (G.wclock ?? performance.now() / 1000) * 1000; const dtR = Math.min(1, (now - (FL.lastRB || now)) / 1000); FL.lastRB = now;
  const occ = new Map();
  for (let i = 0; i < n; i++) {
    const ph = FL.phase[i]; if (!ph || FL.spawnFrame[i] > F) continue; const k4 = i * 4; const pw = P[k4 + 3]; if (pw < 0.5) continue;
    const flag = Math.floor(pw / 10 + 1e-4); const base = Math.round(pw - flag * 10);
    const x = P[k4] + o[0], y = P[k4 + 1] + o[1], z = P[k4 + 2] + o[2];
    if (flag === 1 || flag === 2) { flAbsorb(w, x, y, z, base, flag); flKill(i); if (flag === 1 && Math.random() < 0.3 && typeof ripImpulse === 'function') { const sp = Math.hypot(V[k4], V[k4 + 1], V[k4 + 2]); ripImpulse(x, z, 0.3 + sp * 0.04, Math.min(1.4, 0.15 + sp * 0.18)); } continue; }
    if (flag >= 3) { // salió de la región: guardarla como volumen donde esté (cada 8, un octavo)
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z); const liq = base === 2 ? 2 : 1; const k = FLK(bx, by, bz) + 0.25; const v = (FL.acc2.get(k) || 0) + 1;
      if (v >= FL_PPB / 8) { FL.acc2.set(k, v - FL_PPB / 8); const cv = cellVol(w, bx, by, bz, liq); if (cv >= 0 && cv < 8) flSetStatic(w, bx, by, bz, liq, cv + 1, base === 3); } else FL.acc2.set(k, v);
      flKill(i); continue; }
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z); const key = FLK(bx, by, bz);
    let c = occ.get(key); if (!c) { c = { x: bx, y: by, z: bz, nw: 0, nl: 0, np: 0, top: -1e9, vx: 0, vy: 0, vz: 0, vmax: 0, idx: [] }; occ.set(key, c); }
    const vx = V[k4], vy = V[k4 + 1], vz = V[k4 + 2]; const sp = Math.hypot(vx, vy, vz);
    if (base === 2) c.nl++; else { c.nw++; if (base === 3) c.np++; }
    if (y > c.top) c.top = y; c.vx += vx; c.vy += vy; c.vz += vz; c.vs = (c.vs || 0) + sp; if (sp > c.vmax) c.vmax = sp; c.idx.push(i);
  }
  for (const c of occ.values()) { const m = c.idx.length; c.vx /= m; c.vy /= m; c.vz /= m; }
  FL.occ = occ; flMarkFull(occ);
  // la lava en movimiento ilumina (las celdas con más lava, como luces dinámicas)
  FL.lavaPts = []; for (const c of occ.values()) if (c.nl >= 12) FL.lavaPts.push([c.x + 0.5, c.y, c.z + 0.5]);
  // agua y lava en la misma celda
  for (const c of occ.values()) if (c.nw > 0 && c.nl > 0) {
    const b = w.get(c.x, c.y, c.z); if (b === 0 || (b > 0 && REG[b].replace && !REG[b].solid)) w.set(c.x, c.y, c.z, c.nl >= 24 ? ID.obsidian : ID.cobblestone);
    fizz(w, c.x, c.y, c.z); for (const i of c.idx) flKill(i); c.idx.length = 0; c.nw = c.nl = 0;
  }
  // el agua apaga el fuego que toca (vapor)
  for (const c of occ.values()) if (c.nw >= 3) for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const fx = c.x + dx, fy = c.y + dy, fz = c.z + dz; if (w.get(fx, fy, fz) === ID.fire) { w.set(fx, fy, fz, 0); fizz(w, fx, fy, fz); if (typeof vfxSmokeEmit === 'function') vfxSmokeEmit(fx + 0.5, fy + 0.6, fz + 0.5, 0.8, 0.3, 2); } }
  // la lava incendia lo inflamable que toca
  for (const c of occ.values()) if (c.nl >= 4 && Math.random() < 0.08) {
    const dx = (Math.random() * 3 | 0) - 1, dy = (Math.random() * 2 | 0), dz = (Math.random() * 3 | 0) - 1; const fx = c.x + dx, fy = c.y + dy, fz = c.z + dz;
    if (w.get(fx, fy, fz) !== 0) continue; let fuel = false; for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) { const nb = w.get(fx + ax, fy + ay, fz + az); if (nb > 0 && REG[nb].flammable) fuel = true; }
    if (fuel) w.set(fx, fy, fz, ID.fire);
  }
  // calma por celda
  const calm = new Map(); for (const [k, c] of occ) { if (!c.idx.length) continue; const lim = c.nl > c.nw ? 0.1 : 0.18; calm.set(k, c.vs / c.idx.length < lim ? (FL.calm.get(k) || 0) + dtR : 0); } FL.calm = calm;
  // grupos conectados en calma → volumen nivelado en las celdas (o se evaporan si son cuatro gotas)
  const seen = new Set();
  for (const [k0, c0] of occ) {
    if (seen.has(k0) || !c0.idx.length) continue; const comp = []; const q = [c0]; seen.add(k0); let nCalm = 0; const lava = c0.nl > c0.nw;
    while (q.length) { const c = q.pop(); comp.push(c); if ((calm.get(FLK(c.x, c.y, c.z)) || 0) >= (lava ? 2.5 : 1.2)) nCalm++;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const kk = FLK(c.x + dx, c.y + dy, c.z + dz); if (seen.has(kk)) continue; const cc = occ.get(kk); if (!cc || !cc.idx.length || (cc.nl > cc.nw) !== lava) continue; seen.add(kk); q.push(cc); } }
    if (nCalm < comp.length * 0.8) continue;
    flSoak(w, comp, lava, dtR);
  }
}
function flDepositComp(w, comp, lava) {
  let tot = 0, np = 0; for (const c of comp) { tot += c.idx.length; np += c.np; }
  const kill = () => { for (const c of comp) { for (const i of c.idx) flKill(i); c.idx.length = 0; } };
  if (tot < 6) { kill(); return; } // gotitas sueltas: se evaporan / empapan
  const liq = lava ? 2 : 1; const placed = !lava && np * 2 >= tot;
  // columnas: base = celda más baja con partículas; volumen total repartido para una superficie plana (nivel L)
  const cols = new Map(); for (const c of comp) { const k = c.x * 65536 + c.z; const e = cols.get(k); if (!e) cols.set(k, { x: c.x, z: c.z, base: c.y }); else if (c.y < e.base) e.base = c.y; }
  const V = tot / 64; let list = [...cols.values()];
  if (V / list.length < 1 / 8) { let cx = 0, cz = 0; for (const e of list) { cx += e.x; cz += e.z; } cx /= list.length; cz /= list.length;
    list.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)); list = list.slice(0, Math.max(1, Math.floor(V * 8))); }
  for (const e of list) { let hgt = 0; while (hgt < 8) { const v = cellVol(w, e.x, e.base + hgt, e.z, liq); if (v < 0) break; hgt++; } e.cap = hgt; }
  let lo = Math.min(...list.map(e => e.base)), hi = Math.max(...list.map(e => e.base + e.cap));
  const vol = L => { let s = 0; for (const e of list) s += Math.max(0, Math.min(L - e.base, e.cap)); return s; };
  if (vol(hi) < V) hi = hi; else for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (vol(m) < V) lo = m; else hi = m; }
  const L = (lo + hi) / 2;
  kill();
  for (const e of list) {
    const hgt = Math.min(L - e.base, e.cap); if (hgt < 1 / 16) continue;
    for (let y = 0; y < Math.ceil(hgt); y++) { const fill = Math.min(1, hgt - y); const amt = Math.round(fill * 8); if (amt <= 0) break;
      const cv = cellVol(w, e.x, e.base + y, e.z, liq); if (cv < 0) break; flSetStatic(w, e.x, e.base + y, e.z, liq, Math.max(cv, amt), placed);
      if (placed) w.scheduleTick(e.x, e.base + y, e.z, 60 + (Math.random() * 40 | 0), 0); }
  }
}
// charco en calma: el agua sobre suelo poroso (tierra, pasto, hojas, arena…) se filtra poco a poco; la lava se queda
function flSoak(w, comp, lava, dtR) {
  if (lava || !G.doWaterDespawn) return; // /gamerule doWaterDespawn (apagado por defecto)
  for (const c of comp) { if (!c.idx.length) continue; const below = w.get(c.x, c.y - 1, c.z); const here = w.get(c.x, c.y, c.z); const g = (below > 0 && flPorous(below)) || (here > 0 && flPorous(here)); if (!g) continue;
    let n = Math.max(1, Math.round(c.idx.length * dtR * 0.08));
    for (const i of c.idx) { if (n <= 0) break; if (!FL.dying.has(i)) { FL.dying.set(i, (G.wclock ?? performance.now() / 1000) * 1000); n--; } } }
}
// la desaparición: la partícula se encoge (y se hunde en el suelo) durante ~1,2 s y luego se quita
function flDyingTick() {
  if (!FL.dying.size && FL.alive <= FL.N * 0.92) return; const now = (G.wclock ?? performance.now() / 1000) * 1000; let dirty = false;
  for (const [i, t0] of FL.dying) { const k = (now - t0) / 1200; if (!FL.phase[i] || k >= 1) { FL.dying.delete(i); FL.scale[i] = 255; if (FL.phase[i]) flKill(i); dirty = true; continue; } const v = Math.round(255 * (1 - k)); if (FL.scale[i] !== v) { FL.scale[i] = v; dirty = true; } }
  // demasiadas partículas: las más viejas se van filtrando también
  if (FL.alive > FL.N * 0.92) { let n = 64; for (let i = 0; i < FL.hi && n > 0; i++) if (FL.phase[i] && !FL.dying.has(i)) { FL.dying.set(i, now); n--; } }
  if (dirty) FL.scaleDirty = true;
}
function flScaleUpload() {
  if (!FL.scaleDirty) return; FL.scaleDirty = false; const gl = R.gl; const rows = Math.max(1, Math.ceil(FL.hi / FL.W));
  gl.bindTexture(gl.TEXTURE_2D, FL.scaleTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FL.W, rows, gl.RED, gl.UNSIGNED_BYTE, FL.scale, 0); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
}
// guardar/cargar: las partículas sobreviven a cerrar el mundo (posición en el mundo, fase y temperatura)
function flSerialize() {
  if (!FL.ok || !FL.rb.ready || !FL.world) return null; const rb = FL.rb, o = rb.orgNow; const out = [];
  for (let i = 0; i < rb.count; i++) { const ph = FL.phase[i]; if (!ph || FL.dying.has(i)) continue; const k = i * 4; if (rb.pos[k + 3] < 0.5 || rb.pos[k + 3] >= 10) continue;
    out.push(+(rb.pos[k] + o[0]).toFixed(2), +(rb.pos[k + 1] + o[1]).toFixed(2), +(rb.pos[k + 2] + o[2]).toFixed(2), ph, +rb.vel[k + 3].toFixed(2)); if (out.length > 5 * 60000) break; }
  return { dim: FL.world.dim, p: out };
}
function flRestore(data) { FL.pending = data; }
// consultas para la física de las entidades (de la última lectura)
// ¿celda con líquido de verdad? Pocas partículas sueltas sin nada debajo (gotas sobre la cabeza, salpicaduras) no cuentan
function flCellWet(world, c) {
  const n = c.idx.length; if (n < 5) return false; if (n >= FL_PPB * 0.5) return true;
  const b = world.get(c.x, c.y - 1, c.z); if (b < 0 || (b > 0 && (REG[b].solid || REG[b].liquid))) return true;
  const d = FL.occ.get(FLK(c.x, c.y - 1, c.z)); return !!d && d.idx.length >= FL_PPB * 0.3;
}
function flLiquidAt(world, x, y, z) {
  if (world !== FL.world || !FL.occ.size) return 0; const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z); const c = FL.occ.get(FLK(bx, by, bz));
  if (c && y < c.top + 0.12 && flCellWet(world, c)) return c.nl > c.nw ? 2 : 1;
  const u = FL.occ.get(FLK(bx, by + 1, bz)); if (u && c && c.idx.length >= 5 && flCellWet(world, u) && flCellWet(world, c)) return u.nl > u.nw ? 2 : 1; // la celda de arriba también tiene: estamos dentro
  return 0;
}
function flSurfIn(world, bx, by, bz) {
  if (world !== FL.world) return 0; const c = FL.occ.get(FLK(bx, by, bz)); if (!c || c.idx.length < 5) return 0;
  const u = FL.occ.get(FLK(bx, by + 1, bz)); if (u && u.idx.length >= 5) return 1; return clamp(c.top + 0.12 - by, 0, 1);
}
function flFlowAt(world, bx, by, bz) { if (world !== FL.world) return null; const c = FL.occ.get(FLK(bx, by, bz)); return c && c.idx.length >= 5 ? [c.vx, c.vy, c.vz] : null; }
function flDepositAll_old(w) {
  if (!FL.ok || w !== FL.world || !FL.rb.ready) return; FL.calm = new Map(); const occ = FL.occ; const seen = new Set();
  for (const [k0, c0] of occ) { if (seen.has(k0) || !c0.idx.length) continue; const comp = []; const q = [c0]; seen.add(k0); const lava = c0.nl > c0.nw;
    while (q.length) { const c = q.pop(); comp.push(c); for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const kk = FLK(c.x + dx, c.y + dy, c.z + dz); if (seen.has(kk)) continue; const cc = occ.get(kk); if (!cc || !cc.idx.length || (cc.nl > cc.nw) !== lava) continue; seen.add(kk); q.push(cc); } }
    flDepositComp(w, comp, lava); }
}
// pruebas: avanzar n pasos de golpe
function flAdvance(n) {
  const gl = R.gl; if (!FL.ok) return 0; gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  flVoxFlush(FL.world); flFlushQueues(); FL.M = Math.max(256, 1 << Math.ceil(Math.log2(Math.max(1, FL.hi)))); FL.dt = 1 / 60; gl.bindVertexArray(FL.vao);
  for (let i = 0; i < n; i++) flStep();
  gl.bindVertexArray(null); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); return FL.steps;
}
// cubo vacío sobre líquido en movimiento: recoge 64 partículas (un bloque) alrededor del primer punto con líquido del rayo
function flBucketTake(w, ox, oy, oz, d, maxT) {
  if (!FL.ok || w !== FL.world || !FL.occ.size) return 0;
  for (let t = 0.3; t < Math.min(5, maxT + 0.3); t += 0.25) {
    const x = ox + d[0] * t, y = oy + d[1] * t, z = oz + d[2] * t; const liq = flLiquidAt(w, x, y, z); if (!liq) continue;
    // juntar índices de esa celda y sus vecinas, más cercanos primero
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z); const cand = [];
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const c = FL.occ.get(FLK(bx + dx, by + dy, bz + dz)); if (!c) continue;
      for (const i of c.idx) if (FL.phase[i] && ((FL.phase[i] === 2) === (liq === 2))) cand.push([i, dx * dx + dy * dy + dz * dz]); }
    if (cand.length < 48) return 0; // no llega a un cubo
    cand.sort((a, b) => a[1] - b[1]); for (let k = 0; k < Math.min(64, cand.length); k++) flKill(cand[k][0]);
    for (const c of FL.occ.values()) c.idx = c.idx.filter(i => FL.phase[i]);
    return liq;
  }
  return 0;
}
// ---------------------------------------------------------------- charcos de lluvia
// Con lluvia, en los huecos del suelo que ven el cielo (cerca del jugador) y en algunas manchas del suelo llano van
// cayendo partículas de agua que forman charcos; cuando deja de llover se evaporan poco a poco (no dependen de
// /gamerule doWaterDespawn: es agua de lluvia). Solo con el fluido continuo activo.
const RAINP = { sites: [], siteT: 0, n: 0, countT: 0, acc: 0 };
function rainSurf(w, x, z, y0) { // bloque sólido más alto bajo el cielo abierto en la columna (o NaN)
  for (let y = y0 + 16; y > y0 - 14; y--) { const b = w.get(x, y, z); if (b === 0) continue; const d = b > 0 ? REG[b] : null; if (!d || d.liquid || !d.solid || d.leaves || !T_FULL[b]) return NaN; return w.light(x, y + 1, z)[0] >= 15 ? y : NaN; }
  return NaN;
}
function rainPuddleTick(w, dt) {
  if (!dt || !FL.rainTag || w.dim !== 'overworld' || !flCanSim(w)) return;
  const p = G.player; const rl = G.rainLevel || 0; const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
  // cuántas hay (cada 2 s)
  if ((RAINP.countT -= dt) <= 0) { RAINP.countT = 2; let n = 0; for (let i = 0; i < FL.hi; i++) if (FL.rainTag[i]) n++; RAINP.n = n; }
  if (rl < 0.15) { // sin lluvia: se evaporan (un 2,5 % por segundo, encogiéndose)
    if (!RAINP.n) return; RAINP.acc += dt * 0.025 * RAINP.n; let k = Math.floor(RAINP.acc); if (k <= 0) return; RAINP.acc -= k; const now = (G.wclock ?? performance.now() / 1000) * 1000;
    for (let i = 0; i < FL.hi && k > 0; i++) if (FL.rainTag[i] && FL.phase[i] && !FL.dying.has(i)) { FL.dying.set(i, now); FL.rainTag[i] = 0; RAINP.n--; k--; }
    return;
  }
  // sitios para charcos (cada 2 s): huecos (dos o más vecinos más altos) y manchas fijas del suelo llano
  if ((RAINP.siteT -= dt) <= 0) { RAINP.siteT = 2; const out = [];
    for (let t = 0; t < 70 && out.length < 24; t++) {
      const x = px + ((Math.random() * 29) | 0) - 14, z = pz + ((Math.random() * 29) | 0) - 14; const y = rainSurf(w, x, z, py); if (y !== y) continue;
      if (!flCanSim(w, x, y + 1, z)) continue; const bio = BIOMES[w.biomeAt(x, z)]; if (!bio || bio.snow || bio.id === BI.desert || bio.id === BI.savanna) continue;
      let hi = 0, lo = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const b = w.get(x + dx, y + 1, z + dz); if (b > 0 && REG[b].solid) hi++; else if (rainSurf(w, x + dx, z + dz, py) < y) lo++; }
      if (lo > 0) continue; // el agua se escurriría
      if (hi >= 2 || (hashStr(x + ':' + z) % 19) === 0) out.push([x, y + 1, z]);
    }
    if (out.length) RAINP.sites = out.concat(RAINP.sites.filter(s => Math.abs(s[0] - px) < 16 && Math.abs(s[2] - pz) < 16)).slice(0, 32);
  }
  if (!RAINP.sites.length || RAINP.n > 9000 || flFree() < 20000) return;
  // gotas que caen en los sitios (hasta unas 150 por charco)
  RAINP.acc += dt * rl * 260; let k = Math.floor(RAINP.acc); RAINP.acc -= k;
  while (k-- > 0) {
    const s = RAINP.sites[(Math.random() * RAINP.sites.length) | 0]; const c = FL.occ.get(FLK(s[0], s[1], s[2])); if (c && c.idx.length > 150) continue;
    const i = flSpawn(s[0] + 0.12 + Math.random() * 0.76, s[1] + 0.08 + Math.random() * 0.25, s[2] + 0.12 + Math.random() * 0.76, 0, -2, 0, 1); if (i < 0) break; FL.rainTag[i] = 1; RAINP.n++;
  }
}

