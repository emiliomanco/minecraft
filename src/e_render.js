// ============================================================================
//  Renderizador WebGL2 con "shaders integrados"
// ============================================================================
const R = { gl: null, q: 2, dyn: 1, progs: {}, fbo: {}, w: 1, h: 1, view: M4.create(), proj: M4.create(), vp: M4.create(), invVP: M4.create(), shadowVP: M4.create(), cam: [0, 0, 0], camDir: [0, 0, -1], stats: { chunks: 0, tris: 0, draws: 0 }, plights: [], gpu: '', maxAniso: 0 };
const GLSL_COMMON = `
precision highp float; precision highp int; precision highp sampler2DArray; precision highp sampler2DShadow;
uniform vec3 u_sunDir; uniform vec3 u_sunReal; uniform vec3 u_sunCol; uniform vec3 u_amb; uniform vec3 u_camPos;
uniform float u_time; uniform int u_dim; uniform float u_rain; uniform vec3 u_fogCol; uniform vec2 u_fog; uniform float u_under; uniform float u_bright; uniform float u_expo;
uniform sampler2DShadow u_shadow; uniform mat4 u_shadowVP; uniform float u_shadowOn; uniform float u_shadowTexel;
uniform sampler2DShadow u_shadow2; uniform mat4 u_shadowVP2; uniform float u_shadowTexel2; uniform float u_shadowFar;
uniform vec4 u_lp[8]; uniform vec3 u_lc[8]; uniform int u_nl;
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p3){ p3=fract(p3*.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<(Q>=3?5:4);i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
vec3 skyColorK(vec3 d, float sunK){
  if(u_dim==1) return u_fogCol;
  if(u_dim==2) return vec3(0.025,0.018,0.04);
  float sh=u_sunReal.y; float day=smoothstep(-0.22,0.3,sh);
  // radiancia del cielo en las mismas unidades que la luz del sol (un suelo blanco al sol ≈ 3): cénit azul profundo, horizonte claro
  vec3 zen=mix(vec3(0.003,0.005,0.014),vec3(0.13,0.36,1.0)*1.55,day);
  vec3 hor=mix(vec3(0.016,0.022,0.045),vec3(0.58,0.78,1.0)*1.85,day);
  float up=clamp(d.y,0.0,1.0); vec3 c=mix(hor,zen,pow(up,0.42));
  float sunset=exp(-abs(sh+0.03)*6.5);
  vec2 sd=normalize(u_sunReal.xz+vec2(1e-4)); vec2 vd=normalize(d.xz+vec2(1e-4)); float tw=pow(max(dot(sd,vd),0.0),3.0);
  c=mix(c,vec3(1.0,0.38,0.10)*1.4,clamp(sunset*(0.22+0.78*tw)*pow(1.0-up,3.0),0.0,1.0));
  c+=vec3(0.75,0.3,0.55)*0.10*sunset*(1.0-up)*(1.0-tw);
  float mu=max(dot(d,u_sunReal),0.0); vec3 glow=mix(vec3(1.0,0.45,0.15),vec3(1.0,0.9,0.75),day);
  c+=glow*(pow(mu,10.0)*0.35+pow(mu,90.0)*0.8)*smoothstep(-0.25,0.05,sh)*sunK;
  if(d.y<0.0) c=mix(c,hor*0.35,smoothstep(0.0,-0.35,d.y));
  float g=dot(c,vec3(0.3,0.55,0.15)); c=mix(c,vec3(g)*0.55,u_rain*0.75);
  return c;
}
vec3 skyColor(vec3 d){ return skyColorK(d,1.0); }
// sombras en 2 cascadas: cercana (nítida, alrededor del jugador) y lejana (terreno distante); PCF suave
const vec2 PD[12]=vec2[12](vec2(-0.326,-0.406),vec2(-0.840,-0.074),vec2(-0.696,0.457),vec2(-0.203,0.621),vec2(0.962,-0.195),vec2(0.473,-0.480),vec2(0.519,0.767),vec2(0.185,-0.893),vec2(0.507,0.064),vec2(0.896,0.412),vec2(-0.322,-0.933),vec2(-0.792,-0.598));
float shadowPCF(sampler2DShadow sm, vec3 c, float tx, float b){
#if Q>=3
  // rotación aleatoria por texel (GLSL_COMMON también va en vertex shaders: no se puede usar gl_FragCoord)
  float r=hash12(c.xy*4096.0)*6.2832; mat2 R=mat2(cos(r),-sin(r),sin(r),cos(r)); float sum=0.0;
  for(int i=0;i<12;i++) sum+=texture(sm,vec3(c.xy+R*PD[i]*tx*1.8,c.z-b)); return sum/12.0;
#elif Q>=2
  float sum=0.0; for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) sum+=texture(sm,vec3(c.xy+vec2(float(i),float(j))*tx*1.2,c.z-b)); return sum/9.0;
#else
  return texture(sm,vec3(c.xy,c.z-b));
#endif
}
float getShadow(vec3 p, vec3 N){
  if(u_shadowOn<0.5) return 1.0;
  vec4 s=u_shadowVP*vec4(p+N*0.06,1.0); vec3 c=s.xyz/s.w*0.5+0.5;
  float e=max(abs(c.x-0.5),abs(c.y-0.5))*2.0;
  float nearS=(e<1.0&&c.z<=1.0)?shadowPCF(u_shadow,c,u_shadowTexel,0.0006):1.0;
  if(u_shadowFar<0.5) return mix(nearS,1.0,smoothstep(0.8,1.0,e));
  vec4 s2=u_shadowVP2*vec4(p+N*0.2,1.0); vec3 c2=s2.xyz/s2.w*0.5+0.5;
  float e2=max(abs(c2.x-0.5),abs(c2.y-0.5))*2.0;
  float farS=1.0; if(e2<1.0&&c2.z<=1.0&&e>0.7) farS=mix(shadowPCF(u_shadow2,c2,u_shadowTexel2,0.0012),1.0,smoothstep(0.85,1.0,e2));
  return mix(nearS,farS,smoothstep(0.7,0.95,e));
}
vec3 dynLights(vec3 p){ vec3 s=vec3(0); for(int i=0;i<8;i++){ if(i>=u_nl) break; float d=length(u_lp[i].xyz-p); float a=max(0.0,1.0-d/u_lp[i].w); s+=u_lc[i]*a*a; } return s; }
uniform float u_camSky;
vec3 applyFog(vec3 col, vec3 p, float sv){
  float d=length(p);
  if(u_under>0.5){ float f=1.0-exp(-d*0.09); return mix(col,u_fogCol,clamp(f,0.0,1.0)); }
  float f=smoothstep(u_fog.x,u_fog.y,d);
  // la niebla solo toma el color del cielo (y el brillo del sol) donde hay cielo visible
  float vis=min(sv,u_camSky);
  vec3 cave=vec3(0.006,0.007,0.010)+u_amb*0.015;
  vec3 fc = u_dim==0 ? mix(cave,skyColorK(normalize(p),0.2),vis) : u_fogCol; // sin el halo del sol: un bloque delante del sol no debe brillar
  if(u_dim==0){ float aer=1.0-exp(-d*0.0011*(1.0+u_rain*3.0)); f=max(f,aer*0.5*vis); }
  else f=max(f,1.0-exp(-d*(u_dim==1?0.012:0.004)));
  return mix(col,fc,clamp(f,0.0,1.0));
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
`;
const VS_CHUNK = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in uvec4 a_tex; layout(location=2) in vec4 a_lit;
uniform mat4 u_vp; uniform vec3 u_off; uniform vec3 u_grass[48]; uniform vec3 u_foli[48];
${'##COMMON##'}
out vec3 v_pos; out vec3 v_uv; flat out uint v_flags; out vec3 v_lit; out vec3 v_tint; out vec3 v_world; flat out uint v_snowN;
void main(){
  vec3 p=a_pos+u_off; vec3 w=p+u_camPos; uint fl=a_tex.w;
  if((fl&16u)!=0u){ p.x+=sin(u_time*1.6+w.z*0.7+w.y*0.5)*0.035*(1.0+u_rain); p.z+=cos(u_time*1.3+w.x*0.6)*0.03*(1.0+u_rain); p.y+=sin(u_time*1.9+w.x+w.z)*0.015; }
  if((fl&32u)!=0u){ p.x+=sin(u_time*2.1+w.x*0.4+w.z*0.3)*0.09*(1.0+u_rain); p.z+=cos(u_time*1.7+w.z*0.5)*0.07*(1.0+u_rain); }
  uint tc=uint(a_lit.w*255.0+0.5);
  if((fl&64u)!=0u && (fl&7u)==2u){
    float amp = (tc==1u||tc==2u||tc==4u) ? 0.16 : 0.05;
    p.y+=(sin(u_time*1.3+w.x*0.55+w.z*0.25)*0.6+sin(u_time*1.9-w.z*0.8+w.x*0.3)*0.4)*amp - amp - 0.06;
  }
  if((fl&2048u)!=0u){ }
  v_pos=p; v_world=w; v_uv=vec3(vec2(a_tex.xy)/256.0,float(a_tex.z)); v_flags=fl; v_lit=a_lit.xyz;
  v_tint=vec3(1.0); if(tc>=64u) v_tint=pow(u_foli[min(tc-64u,47u)],vec3(2.2)); else if(tc>=1u) v_tint=pow(u_grass[min(tc-1u,47u)],vec3(2.2));
  if((fl&64u)!=0u) v_tint=vec3(1.0);
  v_snowN=tc; if((fl&2048u)!=0u) v_tint=vec3(1.0);
  gl_Position=u_vp*vec4(p,1.0);
}`;
const FS_CHUNK = `#version 300 es
${'##COMMON##'}
uniform sampler2DArray u_tex; uniform float u_pass;
in vec3 v_pos; in vec3 v_uv; flat in uint v_flags; in vec3 v_lit; in vec3 v_tint; in vec3 v_world; flat in uint v_snowN;
out vec4 o;
const vec3 NR[7]=vec3[7](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1),vec3(0,1,0));
void main(){
  uint fl=v_flags; uint fi=fl&7u; vec2 uv=v_uv.xy;
  if((fl&128u)!=0u){ uv+=vec2(sin(u_time*0.35+v_world.z*0.4+uv.y*3.0),cos(u_time*0.3+v_world.x*0.4+uv.x*3.0))*0.12; }
  if((fl&512u)!=0u){ vec2 c=uv-0.5; float a=u_time*1.5+length(c)*6.0; uv=vec2(c.x*cos(a)-c.y*sin(a),c.x*sin(a)+c.y*cos(a))+0.5; }
  if((fl&4096u)!=0u){ uv.y=fract(uv.y+u_time*0.9); uv.x+=sin(u_time*7.0+v_world.y*3.0)*0.04; }
  vec4 t=texture(u_tex,vec3(uv,v_uv.z));
  if((fl&8u)!=0u && t.a<0.4) discard;
  vec3 alb=pow(t.rgb,vec3(2.2))*v_tint; float alpha=t.a;
  vec3 N=NR[min(fi,6u)];
  if((fl&2048u)!=0u && fi==2u){ vec2 nn=vec2(float(v_snowN>>4u),float(v_snowN&15u))/15.0*2.0-1.0; N=normalize(vec3(nn.x,sqrt(max(0.05,1.0-dot(nn,nn))),nn.y)); }
  float sky=v_lit.x, blk=v_lit.y, ao=v_lit.z; ao=mix(0.32,1.0,ao); ao*=ao;
  vec3 V=normalize(v_pos);
  vec3 col;
  if((fl&1024u)!=0u){ // portal del End: campo estelar
    vec2 sp=gl_FragCoord.xy/600.0; vec3 s=vec3(0.01,0.02,0.04);
    for(int i=1;i<5;i++){ float fi2=float(i); vec2 q=sp*(1.0+fi2*0.6)+vec2(u_time*0.02*fi2,-u_time*0.015*fi2); float h=hash12(floor(q*90.0)); s+=vec3(0.2+0.1*fi2,0.6,0.55+0.1*fi2)*step(0.985,h)*(2.0/fi2); }
    o=vec4(applyFog(s*1.6,v_pos,smoothstep(0.3,1.0,sky)),1.0); return;
  }
  float NdL=dot(N,u_sunDir); float direct=0.0;
  if(u_dim==0){
    float vis=smoothstep(0.5,0.93,sky); float sh=vis>0.0?getShadow(v_pos,N):0.0;
    direct=max(NdL,0.0)*sh*vis;
    if((fl&16384u)!=0u) direct+=max(-NdL,0.0)*0.45*sh*vis + 0.15*sh*vis;
  }
  vec3 amb = u_dim==0 ? u_amb*(0.55+0.45*(N.y*0.5+0.5))*(sky*sky) : u_amb*(0.75+0.25*(N.y*0.5+0.5));
  amb+=vec3(0.008+0.03*u_bright);
  vec3 torch=vec3(1.0,0.6,0.3)*pow(blk,2.3)*1.7 + dynLights(v_pos);
  col=alb*(u_sunCol*direct+(amb+torch)*ao);
  if((fl&2048u)!=0u){ // nieve: dispersión subsuperficial + destellos
    col=mix(col,col*vec3(0.82,0.9,1.08),1.0-direct);
    vec3 R=reflect(V,N); float h=hash13(floor(v_world*28.0+floor(u_time*0.0)));
    col+=u_sunCol*direct*step(0.988,h)*pow(max(dot(R,u_sunDir),0.0),6.0)*2.5;
    col+=u_sunCol*direct*pow(max(dot(R,u_sunDir),0.0),20.0)*0.25;
  }
  if((fl&256u)!=0u) col=alb*2.4+col*0.3;
  if((fl&128u)!=0u){
    vec2 q=v_world.xz*0.9+vec2(v_world.y*0.3); float t=u_time*0.25;
    float n1=fbm(q*1.3+vec2(t,-t*0.7)); float n2=fbm(q*3.1-vec2(t*1.3,t*0.4)+n1*2.0);
    float crust=smoothstep(0.42,0.62,n2); float hot=pow(1.0-crust,2.0);
    vec3 lc=mix(vec3(1.0,0.32,0.03),vec3(1.0,0.85,0.35),smoothstep(0.3,0.0,abs(n1-0.5)))*3.2*(0.85+0.15*sin(u_time*2.0+n1*6.0));
    col=mix(lc,vec3(0.10,0.035,0.02)*(0.5+u_amb),crust*0.85)+vec3(0.6,0.12,0.0)*hot*0.6;
  }
  if((fl&4096u)!=0u){ col=alb*4.0; alpha=t.a; }
  if((fl&512u)!=0u){ col=alb*2.2; alpha=0.75; }
  if((fl&8192u)!=0u){ vec3 R=reflect(V,N); float fr=0.04+0.96*pow(1.0-max(dot(-V,N),0.0),5.0); col=mix(col,skyColor(R)*sky,fr*0.6); col+=u_sunCol*pow(max(dot(R,u_sunDir),0.0),120.0)*direct*2.0; alpha=max(alpha,0.35+fr*0.5); }
  col=applyFog(col,v_pos,smoothstep(0.3,1.0,sky));
#if Q==0
  col=aces(col*u_expo); col=pow(col,vec3(1.0/2.2));
#endif
  o=vec4(col,u_pass>0.5?alpha:1.0);
}`;
const FS_WATER = `#version 300 es
${'##COMMON##'}
uniform sampler2DArray u_tex; uniform sampler2D u_sceneCopy; uniform sampler2D u_depthCopy; uniform vec2 u_res; uniform mat4 u_proj; uniform mat4 u_view; uniform float u_near; uniform float u_far;
in vec3 v_pos; in vec3 v_uv; flat in uint v_flags; in vec3 v_lit; in vec3 v_tint; in vec3 v_world;
out vec4 o;
float linD(float d){ float z=d*2.0-1.0; return 2.0*u_near*u_far/(u_far+u_near-z*(u_far-u_near)); }
float wh(vec2 p){ float t=u_time;
  float h=sin(dot(p,vec2(0.9,0.4))*0.9+t*1.4)*0.30+sin(dot(p,vec2(-0.5,0.8))*1.3+t*1.8)*0.22+sin(dot(p,vec2(0.2,-1.0))*2.4+t*2.6)*0.12;
  h+=(vnoise(p*1.8+vec2(t*0.6,t*0.4))-0.5)*0.35+(vnoise(p*4.5-vec2(t*0.9,-t*0.7))-0.5)*0.16+(vnoise(p*11.0+vec2(t*1.4,t))-0.5)*0.06; return h; }
void main(){
  uint fi=v_flags&7u; float sky=v_lit.x; vec3 V=normalize(v_pos);
  vec3 N=vec3(0,1,0);
  if(fi==2u||fi==3u){ vec2 p=v_world.xz; float e=0.08; float h0=wh(p); N=normalize(vec3(-(wh(p+vec2(e,0))-h0)/e*0.22,1.0,-(wh(p+vec2(0,e))-h0)/e*0.22)); if(fi==3u) N=-N; }
  else { const vec3 NR[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1)); N=NR[fi]; N=normalize(N+vec3(sin(v_world.y*3.0+u_time*2.0)*0.05,0,cos(v_world.y*3.0+u_time*2.0)*0.05)); }
  float NdV=max(dot(-V,N),0.0); float fres=0.02+0.98*pow(1.0-NdV,5.0); if(u_under>0.5) fres=0.0;
  vec3 waterCol=vec3(0.02,0.11,0.16); vec3 absorb=vec3(0.45,0.09,0.06);
  float vis=smoothstep(0.5,0.93,sky); float sh=u_dim==0?getShadow(v_pos,vec3(0,1,0))*vis:0.0;
  vec3 refl; vec3 R=reflect(V,N); if(R.y<0.02) R.y=0.02+abs(R.y)*0.2; R=normalize(R);
  refl=skyColor(R)*mix(0.05,1.0,sky*sky);
  vec2 suv=gl_FragCoord.xy/u_res;
  vec3 refr;
#if Q>=2
  float dScene=linD(texture(u_depthCopy,suv).r); float dHere=linD(gl_FragCoord.z);
  vec2 off=N.xz*0.06*clamp((dScene-dHere)*0.25,0.0,1.0)/(1.0+dHere*0.05);
  vec2 ruv=suv+off; float dS2=linD(texture(u_depthCopy,ruv).r); if(dS2<dHere) ruv=suv;
  float thick=max(linD(texture(u_depthCopy,ruv).r)-dHere,0.0); if(u_under>0.5) thick=0.5;
  vec3 behind=texture(u_sceneCopy,ruv).rgb;
  vec3 tr=exp(-absorb*thick*0.9);
  refr=behind*tr+waterCol*(u_amb+u_sunCol*0.25*sh)*(1.0-tr)*mix(0.15,1.0,sky*sky);
  // caústicas
  float ca=pow(abs(sin(wh(v_world.xz*0.7)*6.0)),8.0); refr+=behind*ca*0.25*exp(-thick*0.2)*sh;
#if Q>=3
  vec3 vp=(u_view*vec4(v_pos,1.0)).xyz; vec3 vr=normalize(mat3(u_view)*R);
  float stepL=0.6; vec3 ray=vp; bool hit=false; vec2 huv=vec2(0);
  int STEPS = 32;
  for(int i=0;i<40;i++){ if(i>=STEPS) break; ray+=vr*stepL; stepL*=1.18; vec4 c=u_proj*vec4(ray,1.0); vec2 uv2=c.xy/c.w*0.5+0.5; if(uv2.x<0.0||uv2.x>1.0||uv2.y<0.0||uv2.y>1.0||c.w<0.0) break; float sd=linD(texture(u_depthCopy,uv2).r); float rd=-ray.z; if(rd>sd+0.05 && rd-sd<stepL*2.0+0.5){ hit=true; huv=uv2; break; } }
  if(hit && u_under<0.5){ float edge=1.0-smoothstep(0.75,1.0,max(abs(huv.x-0.5),abs(huv.y-0.5))*2.0); refl=mix(refl,texture(u_sceneCopy,huv).rgb,edge); }
#endif
#else
  refr=waterCol*(u_amb+u_sunCol*0.3*sh)*mix(0.2,1.0,sky*sky)*3.0;
#endif
  vec3 col=mix(refr,refl,fres);
  float spec=pow(max(dot(R,u_sunDir),0.0),280.0)*12.0+pow(max(dot(R,u_sunDir),0.0),40.0)*0.35;
  col+=u_sunCol*spec*sh;
  col+=(vec3(1.0,0.6,0.3)*pow(v_lit.y,2.3)*0.5+dynLights(v_pos))*0.4;
  // espuma en orillas
#if Q>=2
  float foam=1.0-smoothstep(0.0,0.35,thick); if(fi==2u && u_under<0.5) col+=vec3(0.75)*foam*vnoise(v_world.xz*6.0+u_time)*0.6*(u_amb.b+0.2);
#endif
  col=applyFog(col,v_pos,smoothstep(0.3,1.0,sky));
#if Q>=2
  o=vec4(col,1.0);
#else
  col=aces(col*u_expo); col=pow(col,vec3(1.0/2.2));
  o=vec4(col,mix(0.72,0.95,fres));
#endif
}`;
const VS_SHADOW = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in uvec4 a_tex;
uniform mat4 u_vp; uniform vec3 u_off; uniform float u_time;
out vec3 v_uv; flat out uint v_fl;
void main(){ vec3 p=a_pos+u_off; v_uv=vec3(vec2(a_tex.xy)/256.0,float(a_tex.z)); v_fl=a_tex.w; gl_Position=u_vp*vec4(p,1.0); }`;
const FS_SHADOW = `#version 300 es
precision highp float; precision highp sampler2DArray; uniform sampler2DArray u_tex; in vec3 v_uv; flat in uint v_fl; out vec4 o;
void main(){ if((v_fl&8u)!=0u){ if(texture(u_tex,v_uv).a<0.4) discard; } o=vec4(1); }`;
const VS_SHADOWBOX = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec2 a_uv; layout(location=2) in float a_face;
uniform mat4 u_vp; uniform mat4 u_model; uniform int u_layers[6]; uniform vec4 u_uvr[6]; out vec3 v_uv;
void main(){ int f=int(a_face+0.5); vec4 r=u_uvr[f]; v_uv=vec3(mix(r.xy,r.zw,a_uv),float(u_layers[f])); gl_Position=u_vp*u_model*vec4(a_pos,1.0); }`;
const FS_SHADOWBOX = `#version 300 es
precision highp float; precision highp sampler2DArray; uniform sampler2DArray u_tex; in vec3 v_uv; out vec4 o; void main(){ if(texture(u_tex,v_uv).a<0.3) discard; o=vec4(1); }`;
const VS_FULL = `#version 300 es
out vec2 v_uv; void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); v_uv=p; gl_Position=vec4(p*2.0-1.0,1.0,1.0); }`;
const FS_SKY = `#version 300 es
${'##COMMON##'}
uniform mat4 u_invVP; uniform vec3 u_moonDir; uniform float u_cloudsOn;
in vec2 v_uv; out vec4 o;
float cloudD(vec2 p){ float c=fbm(p*0.0024+vec2(u_time*0.004,u_time*0.0015)); float cov=0.48-u_rain*0.2; return smoothstep(cov,cov+0.28,c); }
void main(){
  vec4 w=u_invVP*vec4(v_uv*2.0-1.0,1.0,1.0); vec3 d=normalize(w.xyz/w.w);
  vec3 col=skyColor(d);
  if(u_dim==0){
    float day=smoothstep(-0.2,0.25,u_sunReal.y);
    // estrellas
    vec3 sd=d*180.0; float st=step(0.9975,hash13(floor(sd))); col+=vec3(0.9,0.95,1.0)*st*(1.0-day)*1.4*(1.0-u_rain)*smoothstep(0.0,0.2,d.y);
    // sol cuadrado
    vec3 up=abs(u_sunReal.z)<0.99?vec3(0,0,1):vec3(1,0,0); vec3 ta=normalize(cross(up,u_sunReal)), tb=cross(u_sunReal,ta);
    float sz=dot(d,u_sunReal); vec2 q=vec2(dot(d,ta),dot(d,tb))/max(sz,1e-3);
    if(sz>0.0){ float m=max(abs(q.x),abs(q.y)); col+=vec3(1.0,0.92,0.75)*smoothstep(0.065,0.055,m)*28.0*(1.0-u_rain*0.9)*(0.4+0.6*day); }
    float mz=dot(d,u_moonDir); vec3 ma=normalize(cross(up,u_moonDir)), mb=cross(u_moonDir,ma); vec2 mq=vec2(dot(d,ma),dot(d,mb))/max(mz,1e-3);
    if(mz>0.0){ float m=max(abs(mq.x),abs(mq.y)); float tex=0.75+0.25*hash12(floor(mq*60.0)); col+=vec3(0.75,0.8,0.9)*smoothstep(0.045,0.04,m)*3.0*tex*(1.0-u_rain); col+=vec3(0.15,0.2,0.3)*pow(max(mz,0.0),60.0)*0.4; }
    // nubes volumétricas aproximadas (2 capas)
    if(u_cloudsOn>0.5 && d.y>0.0){
      float cy=200.0-u_camPos.y; float t=cy/d.y;
      if(t>0.0 && t<9000.0){
        vec2 p=u_camPos.xz+d.xz*t; float den=cloudD(p);
#if Q>=3
        float den2=cloudD(p*1.7+vec2(400.0)); den=max(den,den2*0.8);
#endif
        if(den>0.0){
          vec3 sdir=u_sunDir; float l=cloudD(p+sdir.xz*45.0); float light=exp(-l*1.6);
          float mu=max(dot(d,u_sunReal),0.0);
          vec3 cc=u_amb*1.4+u_sunCol*(0.35+0.65*light)*0.75+u_sunCol*pow(mu,6.0)*0.7*(1.0-den);
          cc=mix(cc,vec3(dot(cc,vec3(0.33)))*0.7,u_rain*0.6);
          float fade=exp(-t*0.00025); col=mix(col,cc,den*fade*0.95);
        }
      }
    }
  } else if(u_dim==2){
    vec3 sd=d*200.0; col+=vec3(0.7,0.6,0.9)*step(0.996,hash13(floor(sd)))*1.2;
    col+=vec3(0.2,0.05,0.3)*fbm(d.xz*3.0/(abs(d.y)+0.3)+u_time*0.01)*0.4;
  }
#if Q==0
  col=aces(col*u_expo); col=pow(col,vec3(1.0/2.2));
#endif
  o=vec4(col,1.0);
}`;
const VS_BOX = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec2 a_uv; layout(location=2) in float a_face;
uniform mat4 u_vp; uniform mat4 u_model; uniform int u_layers[6]; uniform vec4 u_uvr[6];
out vec3 v_pos; out vec3 v_uv; out vec3 v_n;
const vec3 NR[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));
void main(){ int f=int(a_face+0.5); vec4 wp=u_model*vec4(a_pos,1.0); v_pos=wp.xyz; vec4 r=u_uvr[f]; v_uv=vec3(mix(r.xy,r.zw,a_uv),float(u_layers[f])); v_n=normalize(mat3(u_model)*NR[f]); gl_Position=u_vp*wp; }`;
const FS_BOX = `#version 300 es
${'##COMMON##'}
uniform sampler2DArray u_tex; uniform vec4 u_tint; uniform vec2 u_light; uniform vec4 u_flash; uniform float u_emis; uniform float u_mode;
in vec3 v_pos; in vec3 v_uv; in vec3 v_n; out vec4 o;
void main(){
  vec4 t=texture(u_tex,v_uv); if(t.a<0.1) discard;
  if(u_mode>0.5){ o=vec4(t.rgb*0.0,t.a*0.6); return; }
  vec3 alb=pow(t.rgb,vec3(2.2))*u_tint.rgb; vec3 N=normalize(v_n);
  float sky=u_light.x, blk=u_light.y; float direct=0.0;
  if(u_dim==0){ float vis=smoothstep(0.5,0.93,sky); direct=max(dot(N,u_sunDir),0.0)*(vis>0.0?getShadow(v_pos,N):0.0)*vis; }
  vec3 amb=u_dim==0?u_amb*(0.6+0.4*(N.y*0.5+0.5))*sky*sky:u_amb; amb+=vec3(0.01+0.03*u_bright);
  vec3 col=alb*(u_sunCol*direct+amb+vec3(1.0,0.6,0.3)*pow(blk,2.3)*1.7+dynLights(v_pos));
  col=mix(col,u_flash.rgb,u_flash.a); col+=alb*u_emis*2.0;
  col=applyFog(col,v_pos,smoothstep(0.3,1.0,u_light.x));
#if Q==0
  col=aces(col*u_expo); col=pow(col,vec3(1.0/2.2));
#endif
  o=vec4(col,t.a*u_tint.a);
}`;
const VS_PART = `#version 300 es
layout(location=0) in vec2 a_corner; layout(location=1) in vec4 i_pos; layout(location=2) in vec4 i_col; layout(location=3) in vec4 i_uv; layout(location=4) in vec4 i_misc;
uniform mat4 u_vp; uniform vec3 u_right; uniform vec3 u_up;
out vec3 v_uv; out vec4 v_col; out vec3 v_pos; out float v_emis; out float v_soft;
void main(){ float s=i_pos.w; float r=i_misc.x; vec2 c=a_corner-0.5; vec2 rc=vec2(c.x*cos(r)-c.y*sin(r),c.x*sin(r)+c.y*cos(r));
  vec3 p=i_pos.xyz+(u_right*rc.x+u_up*rc.y)*s; v_pos=p; v_uv=vec3(mix(i_uv.xy,i_uv.zw,a_corner.xy*vec2(1,1)),i_misc.y); v_uv.y=mix(i_uv.w,i_uv.y,a_corner.y);
  v_col=i_col; v_emis=i_misc.z; v_soft=i_misc.w; gl_Position=u_vp*vec4(p,1.0); }`;
const FS_PART = `#version 300 es
${'##COMMON##'}
uniform sampler2DArray u_tex; uniform sampler2D u_depthCopy; uniform vec2 u_res; uniform float u_near; uniform float u_far; uniform float u_soft; uniform float u_add;
in vec3 v_uv; in vec4 v_col; in vec3 v_pos; in float v_emis; in float v_soft; out vec4 o;
vec4 texBil(vec3 q){ vec2 p=clamp(q.xy,0.0,1.0)*16.0-0.5; vec2 f=fract(p); ivec2 i=ivec2(floor(p)); int L=int(q.z+0.5);
  vec4 a=texelFetch(u_tex,ivec3(clamp(i,0,15),L),0), b=texelFetch(u_tex,ivec3(clamp(i+ivec2(1,0),0,15),L),0), c=texelFetch(u_tex,ivec3(clamp(i+ivec2(0,1),0,15),L),0), d=texelFetch(u_tex,ivec3(clamp(i+ivec2(1,1),0,15),L),0);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float linD(float d){ float z=d*2.0-1.0; return 2.0*u_near*u_far/(u_far+u_near-z*(u_far-u_near)); }
void main(){
  vec4 t=v_soft>0.0?texBil(v_uv):texture(u_tex,v_uv); float a=t.a*v_col.a; if(a<0.004) discard;
  vec3 c=pow(t.rgb,vec3(2.2))*v_col.rgb;
  if(v_emis<0.5){ c*= v_soft>0.0 ? (u_amb*0.9+u_sunCol*0.3+vec3(0.02)) : (u_amb*1.2+u_sunCol*0.45+vec3(0.03)); }
  else c*=v_emis;
#if Q>=2
  if(u_soft>0.5 && v_soft>0.0){ float sd=linD(texture(u_depthCopy,gl_FragCoord.xy/u_res).r); float pd=linD(gl_FragCoord.z); a*=clamp((sd-pd)/v_soft,0.0,1.0); }
#endif
  if(v_emis<0.5) c=applyFog(c,v_pos,1.0);
#if Q==0
  c=aces(c*u_expo); c=pow(c,vec3(1.0/2.2));
#endif
  o=u_add>0.5?vec4(c*a,a):vec4(c,a);
}`;
// ---- llamas volumétricas (estilo render de Blender): billboard cilíndrico + ruido fbm animado con rampa de cuerpo negro
const VS_FLAME = `#version 300 es
layout(location=0) in vec2 a_corner; layout(location=1) in vec4 i_pos; layout(location=2) in vec4 i_col;
uniform mat4 u_vp; uniform vec3 u_camFwd;
out vec2 v_uv; out vec3 v_pos; out float v_seed; out float v_int;
void main(){ vec3 b=i_pos.xyz; vec2 d=b.xz; float l=length(d); d=l>1e-3?d/l:vec2(1.0,0.0); vec3 right=vec3(-d.y,0.0,d.x);
  float w=i_pos.w, h=i_col.x;
  float lean=clamp(-u_camFwd.y,0.0,1.0); vec3 tilt=normalize(mix(vec3(0.0,1.0,0.0),normalize(vec3(-u_camFwd.x,0.0,-u_camFwd.z)+vec3(1e-4)),lean*0.75));
  vec3 p=b+right*(a_corner.x-0.5)*w+tilt*a_corner.y*h;
  v_uv=a_corner; v_pos=p; v_seed=i_col.y; v_int=i_col.z; gl_Position=u_vp*vec4(p,1.0); }`;
const FS_FLAME = `#version 300 es
${'##COMMON##'}
uniform sampler2D u_depthCopy; uniform vec2 u_res; uniform float u_near; uniform float u_far; uniform float u_soft; uniform float u_dens;
in vec2 v_uv; in vec3 v_pos; in float v_seed; in float v_int; out vec4 o;
float linD(float d){ float z=d*2.0-1.0; return 2.0*u_near*u_far/(u_far+u_near-z*(u_far-u_near)); }
void main(){
  float x=v_uv.x-0.5, y=v_uv.y, t=u_time+v_seed*31.0;
  vec2 q=vec2(x*2.6+v_seed*13.0, y*1.7-t*2.1);
  float n1=fbm(q), n2=fbm(q*2.3+vec2(n1*2.2,-t*1.6)), n3=vnoise(vec2(x*9.0,y*6.0-t*5.0));
  float xd=x+(n1-0.5)*0.5*y+sin(t*3.1+y*6.0)*0.035*y;
  float wdt=0.40*pow(max(1.0-y,0.0),0.8)*(0.7+0.6*n2)+0.02;
  float body=clamp(1.0-abs(xd)/wdt,0.0,1.0);
  float top=1.0-smoothstep(0.25,1.0,y+(n2-0.5)*0.7+(n3-0.5)*0.15);
  float d=body*top*smoothstep(0.0,0.06,y+0.02);
  d=pow(d,0.75)*v_int*(1.15+0.25*sin(t*7.0+v_seed*20.0)*0.4);
  if(d<0.015) discard;
#if Q>=2
  // modo densidad: solo se acumula la densidad; el color se aplica después sobre la suma (FS_FLAMECOMP)
  if(u_dens>0.5){ float sd=linD(texture(u_depthCopy,gl_FragCoord.xy/u_res).r); float pd=linD(gl_FragCoord.z); o=vec4(d*0.55*clamp((sd-pd)/0.3,0.0,1.0),0.0,0.0,1.0); return; }
#endif
  vec3 c=vec3(0.45,0.03,0.0)*smoothstep(0.0,0.2,d);
  c=mix(c,vec3(1.0,0.28,0.02),smoothstep(0.12,0.45,d));
  c=mix(c,vec3(1.0,0.62,0.16),smoothstep(0.4,0.75,d));
  c=mix(c,vec3(1.0,0.88,0.6),smoothstep(0.85,1.25,d));
  float a=smoothstep(0.0,0.35,d);
#if Q>=2
  if(u_soft>0.5){ float sd=linD(texture(u_depthCopy,gl_FragCoord.xy/u_res).r); float pd=linD(gl_FragCoord.z); a*=clamp((sd-pd)/0.3,0.0,1.0); }
#endif
#if Q==0
  c=aces(c*u_expo*1.8); c=pow(c,vec3(1.0/2.2)); o=vec4(c*a,a);
#else
  o=vec4(c*(1.25+0.9*d)*a,a);
#endif
}`;
const FS_FLAMECOMP = `#version 300 es
precision highp float; uniform sampler2D u_fl; uniform vec2 u_px; in vec2 v_uv; out vec4 o;
void main(){
  float D=texture(u_fl,v_uv).r*0.4+(texture(u_fl,v_uv+vec2(u_px.x,0.0)).r+texture(u_fl,v_uv-vec2(u_px.x,0.0)).r+texture(u_fl,v_uv+vec2(0.0,u_px.y)).r+texture(u_fl,v_uv-vec2(0.0,u_px.y)).r)*0.15;
  if(D<0.012) discard;
  vec3 c=vec3(0.45,0.03,0.0)*smoothstep(0.0,0.2,D);
  c=mix(c,vec3(1.0,0.28,0.02),smoothstep(0.12,0.45,D));
  c=mix(c,vec3(1.0,0.58,0.13),smoothstep(0.45,0.9,D));
  c=mix(c,vec3(1.0,0.86,0.55),smoothstep(1.1,1.9,D));
  float a=smoothstep(0.012,0.35,D);
  o=vec4(c*(1.0+0.5*min(D,1.8))*a,a);
}`;
const VS_LINE = `#version 300 es
layout(location=0) in vec3 a_pos; uniform mat4 u_vp; void main(){ gl_Position=u_vp*vec4(a_pos,1.0); }`;
const FS_LINE = `#version 300 es
precision highp float; uniform vec4 u_col; out vec4 o; void main(){ o=u_col; }`;
// exposición: el ojo se adapta a la luminancia media (L) pero solo en parte (p=0.78), así una escena oscura sigue
// viéndose oscura y una nevada al sol no deslumbra. 0.2 ≈ gris medio. u_bmul = opción de brillo, u_fixExp = sin auto exposición
const GLSL_AE = `uniform sampler2D u_adapt; uniform float u_autoExp; uniform float u_fixExp; uniform float u_bmul;
float exposureNow(){ if(u_autoExp>0.5){ float L=texture(u_adapt,vec2(0.5)).r; return clamp(0.2*pow(max(L,1e-4),-0.78),0.1,1.6)*u_bmul; } return u_fixExp; }`;
const FS_BRIGHT = `#version 300 es
precision highp float; uniform sampler2D u_tex; uniform vec2 u_px; in vec2 v_uv; out vec4 o;
${'##AE##'}
void main(){ vec3 c=vec3(0); for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) c+=texture(u_tex,v_uv+vec2(i,j)*u_px).rgb; c/=9.0;
  // solo brillan las fuentes de luz de verdad: el umbral se mide YA expuesto (antes la arena y la nieve al sol "brillaban")
  float l=dot(c,vec3(0.2126,0.7152,0.0722))*exposureNow(); o=vec4(c*smoothstep(1.2,3.5,l),1.0); }`;
const FS_BLUR = `#version 300 es
precision highp float; uniform sampler2D u_tex; uniform vec2 u_dir; in vec2 v_uv; out vec4 o;
void main(){ vec3 c=texture(u_tex,v_uv).rgb*0.227; c+=texture(u_tex,v_uv+u_dir*1.38).rgb*0.316; c+=texture(u_tex,v_uv-u_dir*1.38).rgb*0.316; c+=texture(u_tex,v_uv+u_dir*3.23).rgb*0.07; c+=texture(u_tex,v_uv-u_dir*3.23).rgb*0.07; o=vec4(c,1.0); }`;
const FS_LUM = `#version 300 es
precision highp float; uniform sampler2D u_tex; in vec2 v_uv; out vec4 o;
void main(){ vec3 c=texture(u_tex,v_uv).rgb; float l=dot(c,vec3(0.2126,0.7152,0.0722)); vec2 d=v_uv-0.5; float w=1.0-dot(d,d)*1.2; o=vec4(log(max(l,1e-4))*w,w,0.0,1.0); }`;
const FS_ADAPT = `#version 300 es
precision highp float; uniform sampler2D u_lum; uniform sampler2D u_prev; uniform float u_dt; in vec2 v_uv; out vec4 o;
void main(){ vec2 s=textureLod(u_lum,vec2(0.5),10.0).rg; float cur=exp(s.r/max(s.g,1e-3)); float prev=texture(u_prev,vec2(0.5)).r; if(!(prev>0.0)||prev>100.0) prev=cur;
  float rate=cur>prev?2.2:0.9; float a=1.0-exp(-u_dt*rate); o=vec4(prev+(cur-prev)*a,0.0,0.0,1.0); }`;
const FS_FINAL = `#version 300 es
precision highp float; uniform sampler2D u_scene; uniform sampler2D u_depth; uniform sampler2D u_bloom;
uniform vec2 u_sunUV; uniform float u_sunVis; uniform vec3 u_rayCol; uniform float u_under; uniform float u_time; uniform float u_exposure; uniform float u_q; uniform float u_nether; uniform vec3 u_underCol;
in vec2 v_uv; out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
${'##AE##'}
void main(){
  vec2 uv=v_uv;
  if(u_under>0.5) uv+=vec2(sin(uv.y*20.0+u_time*2.0),cos(uv.x*20.0+u_time*1.7))*0.0025;
  if(u_nether>0.5) uv+=vec2(sin(uv.y*12.0+u_time*3.0),0.0)*0.0008;
  vec3 c=texture(u_scene,uv).rgb;
  if(u_q>=1.0) c+=texture(u_bloom,uv).rgb*0.14;
  if(u_q>=2.0 && u_sunVis>0.001){
    // si el disco del sol está tapado por bloques, no hay rayos ni resplandor
    float occ=0.0; for(int i=0;i<12;i++){ float an=float(i)*0.5236; vec2 sp=u_sunUV+vec2(cos(an),sin(an))*vec2(0.6,1.0)*(i<6?0.012:0.03); occ+=step(0.99999,texture(u_depth,clamp(sp,0.0,1.0)).r); }
    occ+=step(0.99999,texture(u_depth,clamp(u_sunUV,0.0,1.0)).r)*2.0; occ=smoothstep(0.0,0.6,occ/14.0);
    vec2 dl=(u_sunUV-uv)/24.0; vec2 p=uv; float acc=0.0; float w=1.0;
    for(int i=0;i<24;i++){ p+=dl; if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0){ w*=0.94; continue; } acc+=step(0.99999,texture(u_depth,p).r)*w; w*=0.94; }
    float fall=1.0-smoothstep(0.0,0.9,length((uv-u_sunUV)*vec2(1.6,1.0)));
    c+=u_rayCol*acc/24.0*u_sunVis*fall*1.6*occ;
  }
  if(u_under>0.5) c=mix(c,c*u_underCol,0.6);
  c*=u_exposure*exposureNow(); c=aces(c);
  float l=dot(c,vec3(0.2126,0.7152,0.0722)); c=mix(vec3(l),c,0.96); // saturación ligeramente por debajo de neutra
  c=pow(c,vec3(1.0/2.2));
  vec2 vv=v_uv-0.5; c*=1.0-dot(vv,vv)*0.55;
  c+=(fract(sin(dot(v_uv*1000.0+u_time,vec2(12.9898,78.233)))*43758.5453)-0.5)/255.0;
  o=vec4(c,1.0);
}`;

function compile(vs, fs, defs) {
  const gl = R.gl; const pre = '#define Q ' + R.q + '\n';
  const fix = s => s.replace('##COMMON##', GLSL_COMMON).replace('##AE##', GLSL_AE).replace('#version 300 es', '#version 300 es\n' + pre + (defs || ''));
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, fix(s)); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh), fix(s).split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); throw new Error('Shader: ' + gl.getShaderInfoLog(sh)); } return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
// tipo de procesador gráfico según el nombre del renderer: 'cpu' (render por software), 'integrada', 'dedicada' o ''
function gpuKind(name) {
  if (R.software || /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Microsoft Basic|GDI Generic/i.test(name)) return 'cpu';
  if (/NVIDIA|GeForce|Quadro|RTX|GTX|Radeon RX|Radeon Pro|Radeon \d{3,4}|FirePro|Arc\(TM\) A|Intel\(R\) Arc/i.test(name)) return 'dedicada';
  if (/Intel|UHD|Iris|HD Graphics|Radeon\(TM\)|Radeon Graphics|Vega \d+ Graphics|Apple|Mali|Adreno|PowerVR/i.test(name)) return 'integrada';
  return '';
}
function initGL() {
  const cv = $('gl'); const attrs = { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: SETTINGS.gpuPref || 'high-performance', preserveDrawingBuffer: false };
  // 1º pedir un contexto SIN "penalización grave de rendimiento": el navegador lo niega si fuera a dibujar por software (CPU).
  // Así se sabe con certeza si la GPU no se está usando, aunque el nombre del renderer no lo diga.
  let gl = cv.getContext('webgl2', Object.assign({ failIfMajorPerformanceCaveat: true }, attrs)); R.caveat = !gl;
  if (!gl) gl = cv.getContext('webgl2', attrs);
  if (!gl) { alert('Tu navegador no soporta WebGL2. Minecraft 2 necesita WebGL2.'); throw new Error('no webgl2'); }
  R.gl = gl;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info'); R.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); R.vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  R.software = R.caveat || /SwiftShader|llvmpipe|softpipe|Software|Basic Render|GDI Generic/i.test(R.gpu); R.gpuKind = gpuKind(R.gpu);
  // si la GPU se reinicia (driver, suspensión, cuelgue) el contexto se pierde: no dejar que el navegador lo descarte, y reconstruir todo al volver
  if (!R.lostHooked) {
    R.lostHooked = true;
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); R.lost = true; try { chatMsg('La GPU se reinició; recuperando gráficos…', '#fc8'); } catch (err) { } }, false);
    cv.addEventListener('webglcontextrestored', () => { try { restoreGL(); } catch (err) { console.error('restoreGL', err); } }, false);
  }
  initGLResources();
  // modo CPU: si se dibuja por software, bajar todo lo que más cuesta para que siga fluido; se deshace solo cuando vuelve la GPU
  if (R.software && !SETTINGS.cpuMode) { SETTINGS.cpuMode = { quality: SETTINGS.quality, resScale: SETTINGS.resScale, rd: SETTINGS.rd, particles: SETTINGS.particles }; SETTINGS.quality = 0; SETTINGS.resScale = Math.min(SETTINGS.resScale || 1, 0.6); SETTINGS.rd = Math.min(SETTINGS.rd, 4); SETTINGS.particles = Math.min(SETTINGS.particles ?? 2, 1); SETTINGS.dynres = true; saveSettings(); }
  else if (!R.software && SETTINGS.cpuMode) { Object.assign(SETTINGS, SETTINGS.cpuMode); delete SETTINGS.cpuMode; saveSettings(); }
  if (SETTINGS.qualityAuto === undefined) { // primer arranque: elegir calidad según el hardware
    const weak = R.gpuKind !== 'dedicada' || (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 8) <= 4;
    SETTINGS.quality = R.software ? 0 : weak ? 1 : 2; if (weak) { SETTINGS.rd = Math.min(SETTINGS.rd, 5); SETTINGS.particles = 1; }
    SETTINGS.qualityAuto = true; saveSettings();
  }
  setQuality(SETTINGS.quality);
}
// texto con instrucciones para que el navegador use la GPU (se muestra en el chat y en Opciones)
function gpuHelpText() {
  if (R.software) return 'El juego se está dibujando con la CPU: el navegador NO está usando tu tarjeta gráfica (por eso va lento). Para arreglarlo: 1) en chrome://settings/system activa «Usar la aceleración gráfica cuando esté disponible» y cierra Chrome por completo (o abre chrome://restart). 2) Si sigue igual, abre chrome://gpu: si dice «Software only», activa chrome://flags/#ignore-gpu-blocklist y reinicia Chrome; actualiza también los drivers de la tarjeta gráfica. 3) En Windows: Configuración → Sistema → Pantalla → Gráficos → Google Chrome → «Alto rendimiento». Mientras tanto se activó el modo CPU (gráficos rápidos y menos resolución) para que vaya fluido.';
  if (R.gpuKind === 'integrada') return 'Estás usando la gráfica integrada. Si tu PC tiene tarjeta dedicada (NVIDIA/AMD), en Windows ve a Configuración → Sistema → Pantalla → Gráficos → Google Chrome → «Alto rendimiento» y reinicia Chrome.';
  return '';
}
function initGLResources() {
  const gl = R.gl;
  R.cfb = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
  const an = gl.getExtension('EXT_texture_filter_anisotropic'); if (an) { R.anisoExt = an; R.maxAniso = gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT); }
  buildTextureArray();
  // cubo unidad para cajas
  const pos = [], uv = [], face = [], idx = [];
  for (let f = 0; f < 6; f++) { const F = FACE[f]; for (let k = 0; k < 4; k++) { const c = F.c[k]; pos.push(c[0], c[1], c[2]); const [u, v] = faceUV(f, c[0], c[1], c[2]); uv.push(u, v); face.push(f); } const b = f * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  R.cube = gl.createVertexArray(); gl.bindVertexArray(R.cube);
  const vb = (data, loc, n) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); };
  vb(pos, 0, 3); vb(uv, 1, 2); vb(face, 2, 1);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  // partículas
  R.partVAO = gl.createVertexArray(); gl.bindVertexArray(R.partVAO);
  const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  R.partBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, R.partBuf); gl.bufferData(gl.ARRAY_BUFFER, 4 * 16 * 8192, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 64, i * 16); gl.vertexAttribDivisor(1 + i, 1); }
  R.partData = new Float32Array(16 * 8192);
  // líneas
  R.lineVAO = gl.createVertexArray(); gl.bindVertexArray(R.lineVAO); R.lineBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, R.lineBuf); gl.bufferData(gl.ARRAY_BUFFER, 4 * 3 * 4096, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  R.emptyVAO = gl.createVertexArray();
  gl.bindVertexArray(null);
}
// el contexto WebGL volvió tras perderse: todo recurso de GPU anterior ya no existe
function restoreGL() {
  R.fbo = {}; R.progs = {}; R.w = R.h = 0; R.casc = null; R.adI = 0; R.dummyShadow = null; R.adTex = null;
  initGLResources(); setQuality(SETTINGS.quality);
  for (const h of (R.restoreHooks || [])) try { h(); } catch (e) { console.error(e); }
  const worlds = [...Object.values(G.worlds || {}), MENU && MENU.world].filter(Boolean);
  for (const w of worlds) for (const c of w.chunks.values()) { c.mesh = null; c.dirty = true; c.meshPending = false; }
  R.lost = false; try { chatMsg('Gráficos recuperados.', '#8f8'); } catch (e) { }
}
function buildTextureArray() {
  const gl = R.gl; const n = TEXNAMES.length; const data = new Uint8Array(16 * 16 * 4 * n);
  for (let i = 0; i < n; i++) data.set(genTex(TEXNAMES[i]), i * 1024);
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, 3);
  R.texArr = t;
}
function setQuality(q) {
  R.q = clamp(q | 0, 0, 3); const gl = R.gl;
  if (R.q === 2 && !R.cfb) R.q = 1;
  MESH_QUALITY = R.q >= 2 ? 2 : R.q;
  R.progs.chunk = compile(VS_CHUNK, FS_CHUNK); R.progs.water = compile(VS_CHUNK, FS_WATER); R.progs.shadow = compile(VS_SHADOW, FS_SHADOW); R.progs.shadowBox = compile(VS_SHADOWBOX, FS_SHADOWBOX);
  R.progs.sky = compile(VS_FULL, FS_SKY); R.progs.box = compile(VS_BOX, FS_BOX); R.progs.part = compile(VS_PART, FS_PART); R.progs.flame = compile(VS_FLAME, FS_FLAME); R.progs.flameComp = compile(VS_FULL, FS_FLAMECOMP); R.progs.line = compile(VS_LINE, FS_LINE);
  R.progs.bright = compile(VS_FULL, FS_BRIGHT); R.progs.blur = compile(VS_FULL, FS_BLUR); R.progs.final = compile(VS_FULL, FS_FINAL); R.progs.lum = compile(VS_FULL, FS_LUM); R.progs.adapt = compile(VS_FULL, FS_ADAPT);
  R.shadowSize = [0, 1024, 2048, 4096][R.q]; R.shadowSize2 = [0, 0, 2048, 2048][R.q];
  const maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE); if (R.shadowSize > maxT) R.shadowSize = 2048;
  for (const k of ['shadow', 'shadow2']) if (R.fbo[k]) { gl.deleteTexture(R.fbo[k].tex); gl.deleteFramebuffer(R.fbo[k].fb); R.fbo[k] = null; }
  const mkShadow = S => {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, S, S, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, S };
  };
  if (R.shadowSize) R.fbo.shadow = mkShadow(R.shadowSize);
  if (R.shadowSize2) R.fbo.shadow2 = mkShadow(R.shadowSize2);
  // textura vacía para los samplers de sombras sin mapa (un sampler2DShadow siempre necesita una textura de profundidad)
  if (!R.dummyShadow) { const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); R.dummyShadow = tex; }
  R.casc = [null, null];
  if (R.fbo.lum) { freeTarget(R.fbo.lum); R.fbo.ad.forEach(freeTarget); R.fbo.lum = null; R.adTex = null; }
  R.w = 0; resize();
  for (const w of [G.worlds && G.worlds.overworld, G.worlds && G.worlds.nether, G.worlds && G.worlds.end, G.menuWorld]) if (w) for (const c of w.chunks.values()) c.dirty = true;
}
function mkTarget(w, h, hdr, depth) {
  const gl = R.gl; const t = { w, h }; t.fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
  t.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t.tex);
  if (hdr && R.cfb) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
  if (depth) { t.depth = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t.depth); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t.depth, 0); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); return t;
}
function freeTarget(t) { if (!t) return; const gl = R.gl; gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); if (t.depth) gl.deleteTexture(t.depth); }
function resize() {
  const cv = $('gl'); const scale = (R.q === 0 ? Math.min(window.devicePixelRatio || 1, 1) * 0.8 : Math.min(window.devicePixelRatio || 1, R.q >= 3 ? 1.5 : 1)) * (SETTINGS.dynres === false ? 1 : R.dyn) * (SETTINGS.resScale || 1);
  const w = Math.max(1, Math.floor(cv.clientWidth * scale)), h = Math.max(1, Math.floor(cv.clientHeight * scale));
  if (w === R.w && h === R.h) return; R.w = w; R.h = h; cv.width = w; cv.height = h; cv.style.imageRendering = w < cv.clientWidth * (window.devicePixelRatio || 1) - 1 ? 'pixelated' : 'auto';
  for (const k of ['scene', 'copy', 'b1', 'b2', 'fl']) { freeTarget(R.fbo[k]); R.fbo[k] = null; }
  if (R.q >= 1 && R.cfb && !R.fbo.lum) { R.fbo.lum = mkTarget(128, 128, true, false); const gl = R.gl; gl.bindTexture(gl.TEXTURE_2D, R.fbo.lum.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST); R.fbo.ad = [mkTarget(1, 1, true, false), mkTarget(1, 1, true, false)]; R.adI = 0; }
  if (R.q >= 1) {
    R.fbo.scene = mkTarget(w, h, true, true);
    if (R.q >= 2) { R.fbo.copy = mkTarget(w, h, true, true); if (R.cfb) R.fbo.fl = mkTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), true, false); }
    R.fbo.b1 = mkTarget(Math.max(1, w >> 2), Math.max(1, h >> 2), true, false); R.fbo.b2 = mkTarget(Math.max(1, w >> 2), Math.max(1, h >> 2), true, false);
  }
}
// ---------------------------------------------------------- mallas de chunks
function uploadMesh(ch, m) {
  const gl = R.gl; freeMesh(ch); ch.mesh = {};
  for (const k of ['o', 't', 'w']) {
    const d = m[k]; if (!d.count) continue;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const bufs = [];
    const b0 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b0); gl.bufferData(gl.ARRAY_BUFFER, d.pos, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const b1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, d.tex, gl.STATIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribIPointer(1, 4, gl.UNSIGNED_SHORT, 0, 0);
    const b2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b2); gl.bufferData(gl.ARRAY_BUFFER, d.lit, gl.STATIC_DRAW); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null); ch.mesh[k] = { vao, bufs: [b0, b1, b2, ib], count: d.count };
  }
}
function freeMesh(ch) { if (!ch.mesh) return; const gl = R.gl; for (const k of ['o', 't', 'w']) { const m = ch.mesh[k]; if (!m) continue; gl.deleteVertexArray(m.vao); for (const b of m.bufs) gl.deleteBuffer(b); } ch.mesh = null; }
// ---------------------------------------------------------- uniforms de escena
const ENV = { sunDir: [0, 1, 0], sunReal: [0, 1, 0], moonDir: [0, -1, 0], sunCol: [1, 1, 1], amb: [0.3, 0.3, 0.3], fogCol: [0.5, 0.6, 0.8], fog: [100, 120], day: 1 };
const GRASS_U = new Float32Array(48 * 3), FOLI_U = new Float32Array(48 * 3);
// tinte de pasto/hojas: algo menos saturado y más oscuro que el color de bioma (verde oliva natural, no pastel); /0.59 compensa el gris de la textura
const desat = c => { const g = (c[0] + c[1] + c[2]) / 3; return c.map(v => lerp(v, g, 0.3) * 0.78 / 0.59); };
for (const b of BIOMES) { if (b.id >= 48) continue; GRASS_U.set(desat(b.grass), b.id * 3); FOLI_U.set(desat(b.foliage), b.id * 3); }
function computeEnv(dim, camY, under, biome) {
  const t = ((G.time || 0) % 24000) / 24000; const a = t * Math.PI * 2;
  const sun = [Math.cos(a), Math.sin(a), 0.28]; const l = Math.hypot(...sun); sun[0] /= l; sun[1] /= l; sun[2] /= l;
  ENV.sunReal = sun; ENV.moonDir = [-sun[0], -sun[1], -sun[2]];
  const sh = sun[1]; const day = smooth(clamp((sh + 0.15) / 0.4, 0, 1)); ENV.day = day;
  const rain = G.rainLevel || 0;
  if (dim === 'overworld') {
    const useSun = sh > -0.08; ENV.sunDir = useSun ? sun : ENV.moonDir;
    const h = Math.max(0, useSun ? sh : -sh);
    const warm = Math.exp(-h * 5);
    let sc = useSun ? [lerp(2.7, 2.4, warm), lerp(2.5, 1.2, warm), lerp(2.2, 0.45, warm)] : [0.055, 0.07, 0.12]; // luna: tenue y azulada
    const fade = smooth(clamp((h - 0.0) / 0.12, 0, 1)); sc = sc.map(v => v * fade * (1 - rain * 0.85));
    ENV.sunCol = sc;
    ENV.amb = [lerp(0.022, 0.42, day), lerp(0.03, 0.52, day), lerp(0.06, 0.72, day)].map(v => v * (1 - rain * 0.35));
    ENV.fogCol = under ? [0.02, 0.09, 0.13] : [0.6, 0.7, 0.9];
    const rd = SETTINGS.rd * 16; ENV.fog = [rd * 0.6, rd * 0.98];
  } else if (dim === 'nether') {
    ENV.sunDir = [0, 1, 0]; ENV.sunCol = [0, 0, 0];
    const fc = { [BI.soul_sand_valley]: [0.05, 0.16, 0.16], [BI.crimson_forest]: [0.22, 0.03, 0.02], [BI.warped_forest]: [0.06, 0.1, 0.14], [BI.basalt_deltas]: [0.2, 0.17, 0.18] }[biome] || [0.2, 0.04, 0.03];
    ENV.fogCol = fc; ENV.amb = [0.4, 0.27, 0.22]; ENV.fog = [8, 90];
  } else {
    ENV.sunDir = [0, 1, 0]; ENV.sunCol = [0, 0, 0]; ENV.fogCol = [0.04, 0.03, 0.06]; ENV.amb = [0.32, 0.28, 0.4]; ENV.fog = [60, SETTINGS.rd * 16];
  }
  if (under) { ENV.fogCol = [0.015, 0.07, 0.1]; }
}
function setCommon(P) {
  const gl = R.gl, u = P.u;
  if (u.u_sunDir) gl.uniform3fv(u.u_sunDir, ENV.sunDir); if (u.u_sunReal) gl.uniform3fv(u.u_sunReal, ENV.sunReal); if (u.u_sunCol) gl.uniform3fv(u.u_sunCol, ENV.sunCol);
  if (u.u_amb) gl.uniform3fv(u.u_amb, ENV.amb); if (u.u_camPos) gl.uniform3fv(u.u_camPos, R.cam); if (u.u_time) gl.uniform1f(u.u_time, R.time);
  if (u.u_dim) gl.uniform1i(u.u_dim, R.dimIdx); if (u.u_rain) gl.uniform1f(u.u_rain, G.rainLevel || 0); if (u.u_fogCol) gl.uniform3fv(u.u_fogCol, ENV.fogCol);
  if (u.u_fog) gl.uniform2fv(u.u_fog, ENV.fog); if (u.u_under) gl.uniform1f(u.u_under, R.under ? 1 : 0); if (u.u_bright) gl.uniform1f(u.u_bright, SETTINGS.brightness); if (u.u_expo) gl.uniform1f(u.u_expo, R.expo || 0.3); if (u.u_camSky) gl.uniform1f(u.u_camSky, R.camSky ?? 1);
  if (u.u_shadowOn) gl.uniform1f(u.u_shadowOn, R.shadowActive ? 1 : 0); if (u.u_shadowVP) gl.uniformMatrix4fv(u.u_shadowVP, false, R.shadowVP);
  if (u.u_shadowTexel) gl.uniform1f(u.u_shadowTexel, 1 / (R.shadowSize || 1));
  if (u.u_shadow) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.fbo.shadow ? R.fbo.shadow.tex : R.dummyShadow); gl.uniform1i(u.u_shadow, 1); }
  if (u.u_shadow2) { const on = !!(R.shadowActive && R.shadowFarActive && R.fbo.shadow2); gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, on ? R.fbo.shadow2.tex : R.dummyShadow); gl.uniform1i(u.u_shadow2, 6); if (u.u_shadowFar) gl.uniform1f(u.u_shadowFar, on ? 1 : 0); if (u.u_shadowVP2) gl.uniformMatrix4fv(u.u_shadowVP2, false, R.shadowVP2); if (u.u_shadowTexel2) gl.uniform1f(u.u_shadowTexel2, 1 / (R.shadowSize2 || 1)); }
  if (u.u_tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, R.texArr); gl.uniform1i(u.u_tex, 0); }
  if (u.u_nl !== undefined && u.u_nl) { const n = Math.min(8, R.plights.length); gl.uniform1i(u.u_nl, n); if (n) { const lp = new Float32Array(32), lc = new Float32Array(24); R.plights.slice(0, 8).forEach((l, i) => { lp.set([l.x - R.cam[0], l.y - R.cam[1], l.z - R.cam[2], l.r], i * 4); lc.set(l.c, i * 3); }); gl.uniform4fv(u.u_lp, lp); gl.uniform3fv(u.u_lc, lc); } }
  if (u.u_grass) { gl.uniform3fv(u.u_grass, GRASS_U); gl.uniform3fv(u.u_foli, FOLI_U); }
}
function frustumPlanes(m) {
  const p = []; const r = (a, b, c, d) => { const l = Math.hypot(a, b, c); p.push([a / l, b / l, c / l, d / l]); };
  r(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]); r(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
  r(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]); r(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
  r(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]); r(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
  return p;
}
function boxVisible(P, x0, y0, z0, x1, y1, z1) { for (const p of P) { const x = p[0] > 0 ? x1 : x0, y = p[1] > 0 ? y1 : y0, z = p[2] > 0 ? z1 : z0; if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false; } return true; }

// ---------------------------------------------------------- frame
function renderWorld(world, cam, yaw, pitch, opts = {}) {
  if (R.lost) return; // contexto de GPU perdido: esperar a que se restaure
  const gl = R.gl; resize(); R.time = performance.now() / 1000;
  R.dimIdx = world.dim === 'overworld' ? 0 : world.dim === 'nether' ? 1 : 2;
  R.cam = cam; R.under = !!opts.under;
  const fov = (opts.fov || SETTINGS.fov) * Math.PI / 180; const far = Math.max(160, SETTINGS.rd * 16 * 1.6 + 48);
  R.near = 0.05; R.far = far;
  M4.persp(R.proj, fov, R.w / R.h, R.near, far);
  const v = R.view; M4.ident(v); M4.rotX(v, -pitch); M4.rotY(v, -yaw); if (opts.roll) M4.rotZ(v, opts.roll);
  if (opts.bob) { const bm = M4.create(); M4.translate(bm, opts.bob[0], opts.bob[1], 0); M4.mul(v, bm, v); }
  M4.mul(R.vp, R.proj, v);
  const rot = M4.create(); M4.ident(rot); M4.rotX(rot, -pitch); M4.rotY(rot, -yaw); const vpRot = M4.mul(M4.create(), R.proj, rot); M4.invert(R.invVP, vpRot);
  computeEnv(world.dim, cam[1], R.under, opts.biome);
  // exposición fija (sin auto exposición o calidad Rápida): de día al aire libre ~0.22, de noche/cuevas ~1; × opción de brillo
  R.bmul = 0.6 + 0.9 * (SETTINGS.brightness ?? 0.5);
  R.expo = (world.dim === 'overworld' ? lerp(1.0, 0.22, ENV.day * clamp(R.camSky ?? 1, 0, 1)) : world.dim === 'nether' ? 0.55 : 0.7) * R.bmul * (opts.exposure || 1);
  const planes = frustumPlanes(R.vp);
  // chunks visibles
  const vis = []; const rd = SETTINGS.rd; const pcx = Math.floor(cam[0] / 16), pcz = Math.floor(cam[2] / 16);
  for (const c of world.chunks.values()) {
    if (!c.mesh) continue; const dx = c.cx - pcx, dz = c.cz - pcz; if (dx * dx + dz * dz > (rd + 0.5) * (rd + 0.5)) continue;
    const ox = c.cx * 16 - cam[0], oz = c.cz * 16 - cam[2];
    if (!boxVisible(planes, ox, -cam[1], oz, ox + 16, c.top + 2 - cam[1], oz + 16)) { c._vis = false; continue; }
    c._vis = true; c._d = dx * dx + dz * dz; vis.push(c);
  }
  vis.sort((a, b) => a._d - b._d);
  R.stats.chunks = vis.length; R.stats.tris = 0; R.stats.draws = 0;
  // ---------------- sombras
  R.shadowActive = false; R.shadowFarActive = false;
  R.frameN = (R.frameN || 0) + 1;
  if (!R.casc) R.casc = [null, null]; if (!R.shadowVP2) R.shadowVP2 = M4.create();
  const sunOn = world.dim === 'overworld' && ENV.sunCol[0] + ENV.sunCol[1] > 0.02;
  // cascada i: radio en bloques, cada cuántos cuadros se vuelve a dibujar (entre medias se compensa el movimiento de la cámara)
  const cascDef = [{ fbo: R.fbo.shadow, rad: [0, 40, 36, 44][R.q], every: R.q >= 3 ? 1 : 2, vp: R.shadowVP, ents: true },
  { fbo: R.fbo.shadow2, rad: Math.min([0, 0, 144, 192][R.q], SETTINGS.rd * 16 + 16), every: 6, vp: R.shadowVP2, ents: false }];
  for (let ci = 0; ci < 2; ci++) {
    const C = cascDef[ci]; if (!C.fbo || !sunOn || C.rad <= 0) { R.casc[ci] = null; continue; }
    const prev = R.casc[ci]; const S = C.fbo.S;
    const redo = !prev || prev.world !== world || (R.frameN + ci) % C.every === 0 || Math.hypot(cam[0] - prev.cam[0], cam[2] - prev.cam[2]) > C.rad * 0.12 || Math.abs(prev.sun[0] - ENV.sunDir[0]) + Math.abs(prev.sun[1] - ENV.sunDir[1]) > 0.004;
    if (!redo) { const d = M4.create(); M4.translate(d, cam[0] - prev.cam[0], cam[1] - prev.cam[1], cam[2] - prev.cam[2]); M4.mul(C.vp, prev.base, d); }
    else {
      const rad = C.rad, L = ENV.sunDir, texel = rad * 2 / S;
      const up = Math.abs(L[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
      const lv = M4.lookAt(M4.create(), [L[0] * 300, L[1] * 300, L[2] * 300], [0, 0, 0], up);
      // estabilizar: ajustar la cámara al texel en espacio de luz (sin parpadeo al moverse)
      const cw = M4.xform(lv, cam[0], cam[1], cam[2]); const sx = cw[0] - Math.floor(cw[0] / texel) * texel, sy = cw[1] - Math.floor(cw[1] / texel) * texel;
      const pr = M4.ortho(M4.create(), -rad + sx, rad + sx, -rad + sy, rad + sy, 1, 600);
      M4.mul(C.vp, pr, lv);
      gl.bindFramebuffer(gl.FRAMEBUFFER, C.fbo.fb); gl.viewport(0, 0, S, S); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.disable(gl.CULL_FACE); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(ci ? 2.0 : 1.5, ci ? 4.0 : 3.0);
      const P = R.progs.shadow; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.u_vp, false, C.vp);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, R.texArr); gl.uniform1i(P.u.u_tex, 0);
      const scr = Math.ceil(rad / 16) + 1;
      for (const c of world.chunks.values()) {
        if (!c.mesh || !c.mesh.o) continue; if (Math.abs(c.cx - pcx) > scr || Math.abs(c.cz - pcz) > scr) continue;
        gl.uniform3f(P.u.u_off, c.cx * 16 - cam[0], -cam[1], c.cz * 16 - cam[2]); gl.bindVertexArray(c.mesh.o.vao); gl.drawElements(gl.TRIANGLES, c.mesh.o.count, gl.UNSIGNED_INT, 0);
      }
      if (C.ents && opts.drawEntities) { const SB = R.progs.shadowBox; gl.useProgram(SB.p); gl.uniformMatrix4fv(SB.u.u_vp, false, C.vp); gl.uniform1i(SB.u.u_tex, 0); gl.bindVertexArray(R.cube); R.boxProg = SB; try { opts.drawEntities(); } finally { R.boxProg = null; } }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      R.casc[ci] = { cam: cam.slice(), base: new Float32Array(C.vp), world, sun: ENV.sunDir.slice() };
    }
    if (ci === 0) R.shadowActive = true; else R.shadowFarActive = true;
  }
  // ---------------- escena
  const target = R.q >= 1 ? R.fbo.scene : null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, R.w, R.h);
  gl.clearColor(0, 0, 0, 1); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // cielo
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
  { const P = R.progs.sky; gl.useProgram(P.p); setCommon(P); gl.uniformMatrix4fv(P.u.u_invVP, false, R.invVP); gl.uniform3fv(P.u.u_moonDir, ENV.moonDir); gl.uniform1f(P.u.u_cloudsOn, SETTINGS.clouds ? 1 : 0); gl.bindVertexArray(R.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  // opacos
  { const P = R.progs.chunk; gl.useProgram(P.p); setCommon(P); gl.uniformMatrix4fv(P.u.u_vp, false, R.vp); gl.uniform1f(P.u.u_pass, 0);
    for (const c of vis) { const m = c.mesh.o; if (!m) continue; gl.uniform3f(P.u.u_off, c.cx * 16 - cam[0], -cam[1], c.cz * 16 - cam[2]); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); R.stats.tris += m.count / 3; R.stats.draws++; } }
  // entidades
  if (opts.drawEntities) { const P = R.progs.box; gl.useProgram(P.p); setCommon(P); gl.uniformMatrix4fv(P.u.u_vp, false, R.vp); gl.bindVertexArray(R.cube); opts.drawEntities(); }
  if (opts.drawOverlay) opts.drawOverlay(false);
  // copia para agua
  if (R.q >= 2 && R.fbo.copy) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, R.fbo.scene.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.fbo.copy.fb);
    gl.blitFramebuffer(0, 0, R.w, R.h, 0, 0, R.w, R.h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.scene.fb);
  }
  // translúcidos (agua primero sin mezcla en calidad alta)
  { const P = R.progs.water; gl.useProgram(P.p); setCommon(P); gl.uniformMatrix4fv(P.u.u_vp, false, R.vp);
    if (R.q >= 2) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, R.fbo.copy.tex); gl.uniform1i(P.u.u_sceneCopy, 2); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.fbo.copy.depth); gl.uniform1i(P.u.u_depthCopy, 3); gl.uniform2f(P.u.u_res, R.w, R.h); gl.uniformMatrix4fv(P.u.u_proj, false, R.proj); gl.uniformMatrix4fv(P.u.u_view, false, R.view); gl.uniform1f(P.u.u_near, R.near); gl.uniform1f(P.u.u_far, R.far); gl.disable(gl.BLEND); }
    else { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
    gl.disable(gl.CULL_FACE);
    R._transVis = vis.slice().reverse();
    for (const c of R._transVis) { const m = c.mesh.w; if (!m) continue; gl.uniform3f(P.u.u_off, c.cx * 16 - cam[0], -cam[1], c.cz * 16 - cam[2]); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); R.stats.draws++; }
  }
  // segunda pasada: cristal/hielo/portales/fuego (descartando agua en shader de chunk por alfa)
  { const P = R.progs.chunk; gl.useProgram(P.p); setCommon(P); gl.uniformMatrix4fv(P.u.u_vp, false, R.vp); gl.uniform1f(P.u.u_pass, 1);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    for (const c of R._transVis) { const m = c.mesh.t; if (!m) continue; gl.uniform3f(P.u.u_off, c.cx * 16 - cam[0], -cam[1], c.cz * 16 - cam[2]); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); R.stats.draws++; }
  }
  gl.depthMask(true);
  if (opts.drawTranslucentExtra) opts.drawTranslucentExtra();
  // partículas
  drawVFX(opts); // fuego (volumétrico en calidad alta) y humo
  if (opts.particles && opts.particles.length) drawParticles(opts.particles);
  gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  if (opts.drawOverlay) opts.drawOverlay(true);
  if (opts.drawHand) { gl.clear(gl.DEPTH_BUFFER_BIT); opts.drawHand(); }
  // ---------------- post
  if (R.q >= 1) postProcess(world, opts);
}
function postProcess(world, opts) {
  const gl = R.gl; gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.bindVertexArray(R.emptyVAO);
  const bw = R.fbo.b1.w, bh = R.fbo.b1.h;
  // brillo
  const autoOn = !!(R.fbo.lum && SETTINGS.autoExp !== false);
  // uniforms de exposición (GLSL_AE); la textura de adaptación es la del cuadro anterior en la pasada de brillo
  const expoU = (P, fallbackTex) => { const ok = autoOn && R.adTex; gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, ok ? R.adTex : fallbackTex); gl.uniform1i(P.u.u_adapt, 3); gl.uniform1f(P.u.u_autoExp, ok ? 1 : 0); gl.uniform1f(P.u.u_fixExp, R.expo || 0.3); gl.uniform1f(P.u.u_bmul, R.bmul || 1); };
  let P = R.progs.bright; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.b1.fb); gl.viewport(0, 0, bw, bh);
  expoU(P, R.fbo.scene.tex);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.fbo.scene.tex); gl.uniform1i(P.u.u_tex, 0); gl.uniform2f(P.u.u_px, 1 / R.w * 2, 1 / R.h * 2); gl.drawArrays(gl.TRIANGLES, 0, 3);
  P = R.progs.blur; gl.useProgram(P.p); gl.uniform1i(P.u.u_tex, 0);
  for (let i = 0; i < 2; i++) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.b2.fb); gl.bindTexture(gl.TEXTURE_2D, R.fbo.b1.tex); gl.uniform2f(P.u.u_dir, (1 + i) / bw, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.b1.fb); gl.bindTexture(gl.TEXTURE_2D, R.fbo.b2.tex); gl.uniform2f(P.u.u_dir, 0, (1 + i) / bh); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // exposición automática
  const auto = !!(R.fbo.lum && SETTINGS.autoExp !== false);
  if (auto) {
    const now = performance.now(); const dt = Math.min(0.2, (now - (R.adT || now)) / 1000); R.adT = now;
    P = R.progs.lum; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.lum.fb); gl.viewport(0, 0, 128, 128); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.fbo.scene.tex); gl.uniform1i(P.u.u_tex, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, R.fbo.lum.tex); gl.generateMipmap(gl.TEXTURE_2D);
    const src = R.fbo.ad[R.adI], dst = R.fbo.ad[1 - R.adI]; R.adI = 1 - R.adI;
    P = R.progs.adapt; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, 1, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.fbo.lum.tex); gl.uniform1i(P.u.u_lum, 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(P.u.u_prev, 1); gl.uniform1f(P.u.u_dt, dt); gl.drawArrays(gl.TRIANGLES, 0, 3);
    R.adTex = dst.tex;
  }
  // final
  P = R.progs.final; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.w, R.h);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.fbo.scene.tex); gl.uniform1i(P.u.u_scene, 0);
  // la profundidad de la escena se borra antes de dibujar la mano: usar la copia (opacos) para los rayos de sol
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (R.fbo.copy || R.fbo.scene).depth); gl.uniform1i(P.u.u_depth, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, R.fbo.b1.tex); gl.uniform1i(P.u.u_bloom, 2);
  const s = ENV.sunReal; const sp = M4.xform(R.vp, s[0] * 1000, s[1] * 1000, s[2] * 1000);
  let vis = 0; if (sp[3] > 0 && world.dim === 'overworld' && !R.under && (R.camSky ?? 1) > 0.3) { vis = clamp(s[1] * 3 + 0.4, 0, 1) * (1 - (G.rainLevel || 0)); const ex = Math.max(Math.abs(sp[0]), Math.abs(sp[1])); vis *= (1 - smooth(clamp((ex - 1) / 0.6, 0, 1))) * smooth(clamp(((R.camSky ?? 1) - 0.3) / 0.6, 0, 1)); }
  gl.uniform2f(P.u.u_sunUV, sp[0] * 0.5 + 0.5, sp[1] * 0.5 + 0.5); gl.uniform1f(P.u.u_sunVis, vis);
  const warm = Math.exp(-Math.max(0, s[1]) * 4); gl.uniform3f(P.u.u_rayCol, 1.0, lerp(0.85, 0.55, warm), lerp(0.7, 0.3, warm));
  expoU(P, R.fbo.b1.tex);
  gl.uniform1f(P.u.u_under, R.under ? 1 : 0); gl.uniform1f(P.u.u_time, R.time); gl.uniform1f(P.u.u_exposure, opts.exposure || 1.0); gl.uniform1f(P.u.u_q, R.q);
  gl.uniform1f(P.u.u_nether, world.dim === 'nether' ? 1 : 0); gl.uniform3f(P.u.u_underCol, 0.5, 0.85, 1.1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);
}
// ---------------------------------------------------------- dibujar caja
const _m = M4.create(); const UVR_FULL = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);
const _layers = new Int32Array(6);
function drawBox(model, layers, light, tint, flash, emis, uvr) {
  const gl = R.gl; const P = R.boxProg || R.progs.box; const u = P.u;
  gl.uniformMatrix4fv(u.u_model, false, model);
  if (typeof layers === 'number') _layers.fill(layers); else _layers.set(layers); gl.uniform1iv(u.u_layers, _layers);
  gl.uniform4fv(u.u_uvr, uvr || UVR_FULL);
  gl.uniform2f(u.u_light, light ? light[0] / 15 : 1, light ? light[1] / 15 : 0);
  gl.uniform4fv(u.u_tint, tint || [1, 1, 1, 1]); gl.uniform4fv(u.u_flash, flash || [0, 0, 0, 0]); gl.uniform1f(u.u_emis, emis || 0); gl.uniform1f(u.u_mode, 0);
  gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0); R.stats.draws++;
}
// ---------------------------------------------------------- partículas
function drawParticles(list) {
  const gl = R.gl; const P = R.progs.part; gl.useProgram(P.p); setCommon(P);
  gl.uniformMatrix4fv(P.u.u_vp, false, R.vp);
  const v = R.view; gl.uniform3f(P.u.u_right, v[0], v[4], v[8]); gl.uniform3f(P.u.u_up, v[1], v[5], v[9]);
  if (R.q >= 2 && R.fbo.copy) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.fbo.copy.depth); gl.uniform1i(P.u.u_depthCopy, 3); gl.uniform2f(P.u.u_res, R.w, R.h); gl.uniform1f(P.u.u_near, R.near); gl.uniform1f(P.u.u_far, R.far); gl.uniform1f(P.u.u_soft, 1); } else if (P.u.u_soft) gl.uniform1f(P.u.u_soft, 0);
  gl.bindVertexArray(R.partVAO); gl.enable(gl.BLEND); gl.depthMask(false); gl.disable(gl.CULL_FACE);
  const cam = R.cam;
  // ordenar de atrás hacia delante las no aditivas
  const alphaL = [], addL = [];
  for (const p of list) { if (p.add) addL.push(p); else { p._d = (p.x - cam[0]) ** 2 + (p.y - cam[1]) ** 2 + (p.z - cam[2]) ** 2; alphaL.push(p); } }
  alphaL.sort((a, b) => b._d - a._d);
  const fill = arr => { const D = R.partData; let n = 0; for (const p of arr) { if (n >= 8192) break; const o = n * 16; const lf = p.light ? 0.3 + p.light[0] / 15 * 0.7 : 1; D[o] = p.x - cam[0]; D[o + 1] = p.y - cam[1]; D[o + 2] = p.z - cam[2]; D[o + 3] = p.size; D[o + 4] = p.r * lf; D[o + 5] = p.g * lf; D[o + 6] = p.b * lf; D[o + 7] = p.aCur ?? p.a; const uv = p.uv; if (uv) { D[o + 8] = uv[0]; D[o + 9] = uv[1]; D[o + 10] = uv[2]; D[o + 11] = uv[3]; } else { D[o + 8] = 0; D[o + 9] = 0; D[o + 10] = 1; D[o + 11] = 1; } D[o + 12] = p.rot || 0; D[o + 13] = p.layer; D[o + 14] = p.emis || 0; D[o + 15] = p.soft || (uv ? 0 : 0.01); n++; } gl.bindBuffer(gl.ARRAY_BUFFER, R.partBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, D, 0, n * 16); return n; };
  let n = fill(alphaL); if (n) { gl.uniform1f(P.u.u_add, 0); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); }
  n = fill(addL); if (n) { gl.uniform1f(P.u.u_add, 1); gl.blendFunc(gl.ONE, gl.ONE); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); }
  gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}
function drawFlames(F) {
  const gl = R.gl; const P = R.progs.flame; if (!P) return; gl.useProgram(P.p); setCommon(P);
  gl.uniformMatrix4fv(P.u.u_vp, false, R.vp); const v = R.view; gl.uniform3f(P.u.u_camFwd, -v[2], -v[6], -v[10]);
  if (R.q >= 2 && R.fbo.copy) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.fbo.copy.depth); gl.uniform1i(P.u.u_depthCopy, 3); gl.uniform2f(P.u.u_res, R.w, R.h); gl.uniform1f(P.u.u_near, R.near); gl.uniform1f(P.u.u_far, R.far); gl.uniform1f(P.u.u_soft, 1); } else if (P.u.u_soft) gl.uniform1f(P.u.u_soft, 0);
  gl.bindVertexArray(R.partVAO); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
  const D = R.partData, cam = R.cam; let n = 0;
  for (let i = 0; i + 6 < F.length && n < 8192; i += 7) { const o = n * 16; D[o] = F[i] - cam[0]; D[o + 1] = F[i + 1] - cam[1]; D[o + 2] = F[i + 2] - cam[2]; D[o + 3] = F[i + 3]; D[o + 4] = F[i + 4]; D[o + 5] = F[i + 5]; D[o + 6] = F[i + 6]; D[o + 7] = 0; n++; }
  if (!n) { gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); return; }
  gl.bindBuffer(gl.ARRAY_BUFFER, R.partBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, D, 0, n * 16);
  const fl = R.fbo.fl, dens = !!(fl && R.fbo.copy && R.progs.flameComp);
  if (dens) {
    // 1) densidad de todas las llamas sumada en un búfer a media resolución (oclusión manual con la profundidad)
    gl.uniform1f(P.u.u_dens, 1); gl.uniform2f(P.u.u_res, fl.w, fl.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fl.fb); gl.viewport(0, 0, fl.w, fl.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.DEPTH_TEST);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); R.stats.draws++;
    // 2) color de cuerpo negro aplicado sobre la suma: los fuegos cercanos se funden en uno solo
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo.scene.fb); gl.viewport(0, 0, R.w, R.h);
    const C = R.progs.flameComp; gl.useProgram(C.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fl.tex); gl.uniform1i(C.u.u_fl, 0); gl.uniform2f(C.u.u_px, 1 / fl.w, 1 / fl.h);
    gl.bindVertexArray(R.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); R.stats.draws++; gl.enable(gl.DEPTH_TEST);
  } else { if (P.u.u_dens) gl.uniform1f(P.u.u_dens, 0); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); R.stats.draws++; }
  gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}
function drawLines(pts, col) {
  const gl = R.gl; const P = R.progs.line; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.u_vp, false, R.vp); gl.uniform4fv(P.u.u_col, col);
  gl.bindVertexArray(R.lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, R.lineBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(pts)); gl.drawArrays(gl.LINES, 0, pts.length / 3);
}
function boxLines(x0, y0, z0, x1, y1, z1) {
  const c = R.cam; x0 -= c[0]; x1 -= c[0]; y0 -= c[1]; y1 -= c[1]; z0 -= c[2]; z1 -= c[2];
  return [x0, y0, z0, x1, y0, z0, x1, y0, z0, x1, y0, z1, x1, y0, z1, x0, y0, z1, x0, y0, z1, x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y1, z0, x1, y1, z1, x1, y1, z1, x0, y1, z1, x0, y1, z1, x0, y1, z0, x0, y0, z0, x0, y1, z0, x1, y0, z0, x1, y1, z0, x1, y0, z1, x1, y1, z1, x0, y0, z1, x0, y1, z1];
}
