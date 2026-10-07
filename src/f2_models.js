// ============================================================================
//  Modelos de entidades (cajas) y renderizado
// ============================================================================
function L6(t) { // t: string | {all,front,top,bottom,back}
  if (typeof t === 'string') { const l = TEX[t]; return [l, l, l, l, l, l]; }
  const a = TEX[t.all]; return [TEX[t.side || t.all] ?? a, TEX[t.side || t.all] ?? a, TEX[t.top || t.all] ?? a, TEX[t.bottom || t.all] ?? a, TEX[t.back || t.all] ?? a, TEX[t.front || t.all] ?? a];
}
function part(s, p, o, t, r, k) { return { s, p, o, t: L6(t), r, k }; }
function biped(o) {
  const ah = o.armH || 12, lh = o.legH || 12, bw = o.bodyW || 8, bh = o.bodyH || 12, aw = o.armW || 4, hs = o.head || [8, 8, 8];
  const top = lh + bh;
  const P = [
    part(hs, [0, top, 0], [-hs[0] / 2, 0, -hs[2] / 2], { all: o.headT || o.skin, front: o.face, top: o.hair || o.headT || o.skin, back: o.back || o.headT || o.skin }, 'head'),
    part([bw, bh, 4], [0, lh, 0], [-bw / 2, 0, -2], o.shirt, 'body'),
    part([aw, ah, aw], [bw / 2 + aw / 2, top - 2, 0], [-aw / 2, -ah + 2, -aw / 2], o.arm || o.skin, o.armPose || 'armR'),
    part([aw, ah, aw], [-bw / 2 - aw / 2, top - 2, 0], [-aw / 2, -ah + 2, -aw / 2], o.arm || o.skin, o.armPose ? o.armPose + 'L' : 'armL'),
    part([o.legW || 4, lh, o.legW || 4], [2, lh, 0], [-(o.legW || 4) / 2, -lh, -(o.legW || 4) / 2], o.pants, 'legR'),
    part([o.legW || 4, lh, o.legW || 4], [-2, lh, 0], [-(o.legW || 4) / 2, -lh, -(o.legW || 4) / 2], o.pants, 'legL')
  ];
  if (o.nose) P.push(part([2, 4, 2], [0, top, 0], [-1, -1, -hs[2] / 2 - 2], o.skin, 'head'));
  return P;
}
function quad(o) {
  const lh = o.legH, bw = o.bw, bh = o.bh, bl = o.bl, hs = o.head; const lw = o.legW || 4;
  const P = [
    part([bw, bh, bl], [0, lh, 0], [-bw / 2, 0, -bl / 2], { all: o.body, top: o.bodyTop || o.body }, 'body'),
    part(hs, [0, lh + bh * (o.headY || 0.7), -bl / 2], [-hs[0] / 2, -hs[1] / 2, -hs[2] + 2], { all: o.headT || o.body, front: o.face }, 'head'),
  ];
  for (const [x, z, r] of [[bw / 2 - lw / 2, -bl / 2 + lw / 2 + 1, 'legFR'], [-bw / 2 + lw / 2, -bl / 2 + lw / 2 + 1, 'legFL'], [bw / 2 - lw / 2, bl / 2 - lw / 2 - 1, 'legBR'], [-bw / 2 + lw / 2, bl / 2 - lw / 2 - 1, 'legBL']]) P.push(part([lw, lh, lw], [x, lh, z], [-lw / 2, -lh, -lw / 2], o.leg || o.body, r));
  if (o.extra) P.push(...o.extra);
  return P;
}
const MODELS = {
  steve: biped({ skin: 'steve_skin', face: 'steve_face', hair: 'steve_hair', back: 'steve_back', shirt: 'steve_shirt', pants: 'steve_pants', arm: { all: 'steve_skin', top: 'steve_shirt' } }),
  zombie: biped({ skin: 'zombie_skin', face: 'zombie_face', shirt: 'zombie_shirt', pants: 'zombie_pants', armPose: 'armZ' }),
  drowned: biped({ skin: 'drowned_skin', face: 'drowned_face', shirt: 'drowned_skin', pants: 'drowned_skin', armPose: 'armZ' }),
  skeleton: biped({ skin: 'skeleton_bone', face: 'skeleton_face', shirt: 'skeleton_bone', pants: 'skeleton_bone', armW: 2, legW: 2, armPose: 'armB' }),
  villager: biped({ skin: 'villager_skin', face: 'villager_face', hair: 'villager_face', shirt: 'villager_robe', pants: 'villager_robe', arm: 'villager_robe', head: [8, 10, 8], nose: true, armPose: 'armX' }),
  illager: biped({ skin: 'villager_skin', face: 'pillager_face', hair: 'pillager_face', shirt: 'pillager_robe', pants: 'pillager_robe', arm: 'pillager_robe', head: [8, 10, 8], nose: true }),
  piglin: biped({ skin: 'piglin_skin', face: 'piglin_face', shirt: 'villager_robe', pants: 'piglin_skin', head: [10, 8, 8] }),
  enderman: biped({ skin: 'enderman_skin', face: 'enderman_face', shirt: 'enderman_skin', pants: 'enderman_skin', armW: 2, legW: 2, armH: 28, legH: 28, armPose: 'armE' }),
  golem: biped({ skin: 'armor_iron', face: 'villager_face', shirt: 'armor_iron', pants: 'armor_iron', bodyW: 16, bodyH: 14, armW: 6, armH: 28, legW: 6, legH: 16, head: [8, 10, 8], nose: true }),
  warden: biped({ skin: 'warden_skin', face: 'warden_face', shirt: 'warden_skin', pants: 'warden_skin', bodyW: 18, bodyH: 20, armW: 8, armH: 26, legW: 6, legH: 13, head: [16, 14, 10] }),
  creeper: [part([8, 8, 8], [0, 18, 0], [-4, 0, -4], { all: 'creeper_skin', front: 'creeper_face' }, 'head'), part([8, 12, 4], [0, 6, 0], [-4, 0, -2], 'creeper_skin', 'body'),
    part([4, 6, 4], [2, 6, -4], [-2, -6, -2], 'creeper_skin', 'legFR'), part([4, 6, 4], [-2, 6, -4], [-2, -6, -2], 'creeper_skin', 'legFL'), part([4, 6, 4], [2, 6, 4], [-2, -6, -2], 'creeper_skin', 'legBR'), part([4, 6, 4], [-2, 6, 4], [-2, -6, -2], 'creeper_skin', 'legBL')],
  pig: quad({ legH: 6, bw: 10, bh: 8, bl: 16, head: [8, 8, 8], body: 'pig_skin', face: 'pig_face', headY: 0.5 }),
  cow: quad({ legH: 12, bw: 12, bh: 10, bl: 18, head: [8, 8, 6], body: 'cow_skin', face: 'cow_face', leg: 'cow_skin', headY: 0.8 }),
  sheep: quad({ legH: 12, bw: 8, bh: 8, bl: 14, head: [6, 6, 8], body: 'sheep_wool', face: 'sheep_face', headT: 'sheep_skin', leg: 'sheep_skin', headY: 1 }),
  goat: quad({ legH: 10, bw: 8, bh: 10, bl: 14, head: [5, 7, 10], body: 'goat_skin', face: 'goat_face', headY: 1.1, extra: [part([1, 6, 1], [1.5, 26, -6], [-0.5, 0, 0], 'skeleton_bone', 'head'), part([1, 6, 1], [-1.5, 26, -6], [-0.5, 0, 0], 'skeleton_bone', 'head')] }),
  cat: quad({ legH: 6, bw: 4, bh: 5, bl: 14, head: [5, 4, 5], body: 'hay_top', face: 'hay_top', headY: 1, legW: 2, extra: [part([1, 1, 8], [0, 10, 7], [-0.5, 0, 0], 'hay_top', 'tail')] }),
  hoglin: quad({ legH: 10, bw: 14, bh: 12, bl: 22, head: [12, 10, 14], body: 'hoglin_skin', face: 'hoglin_face', headY: 0.6, legW: 6 }),
  chicken: [part([6, 6, 8], [0, 5, 0], [-3, 0, -4], 'chicken_body', 'body'), part([4, 6, 3], [0, 9, -4], [-2, 0, -2], { all: 'chicken_body', front: 'chicken_face' }, 'head'),
    part([4, 2, 2], [0, 9, -4], [-2, 2, -4], 'chicken_beak', 'head'), part([1, 4, 6], [3, 11, 0], [0, -4, -3], 'chicken_body', 'wingR'), part([1, 4, 6], [-3, 11, 0], [-1, -4, -3], 'chicken_body', 'wingL'),
    part([1, 5, 1], [1.5, 5, 1], [-0.5, -5, -0.5], 'chicken_beak', 'legR'), part([1, 5, 1], [-1.5, 5, 1], [-0.5, -5, -0.5], 'chicken_beak', 'legL')],
  spider: (() => { const P = [part([10, 8, 12], [0, 6, 3], [-5, 0, 0], 'spider_body', 'body'), part([6, 6, 6], [0, 7, 0], [-3, 0, -3], 'spider_body', 'body'), part([8, 8, 8], [0, 6, -3], [-4, 0, -8], { all: 'spider_body', front: 'spider_face' }, 'head')];
    for (let i = 0; i < 4; i++) { P.push(part([16, 2, 2], [3, 9, -1 + i * 1], [0, -1, -1], 'spider_body', 'slR', i)); P.push(part([16, 2, 2], [-3, 9, -1 + i * 1], [-16, -1, -1], 'spider_body', 'slL', i)); } return P; })(),
  guardian: [part([12, 12, 16], [0, 0, 0], [-6, 0, -8], { all: 'guardian_skin', front: 'guardian_face' }, 'body'), part([4, 4, 8], [0, 6, 8], [-2, -2, 0], 'guardian_skin', 'tail'), part([3, 3, 6], [0, 6, 16], [-1.5, -1.5, 0], 'guardian_skin', 'tail2')],
  breeze: [part([8, 8, 8], [0, 20, 0], [-4, 0, -4], { all: 'breeze_skin', front: 'breeze_face' }, 'head'), ...[0, 1, 2].map(i => part([2, 10, 2], [0, 10, 0], [Math.cos(i * 2.1) * 4 - 1, 0, Math.sin(i * 2.1) * 4 - 1], 'breeze_skin', 'rod', i)), part([6, 6, 6], [0, 4, 0], [-3, 0, -3], 'breeze_skin', 'rod', 3)],
  ghast: (() => { const P = [part([16, 16, 16], [0, 8, 0], [-8, 0, -8], { all: 'ghast_skin', front: 'ghast_face' }, 'body')]; for (let i = 0; i < 9; i++) P.push(part([2, 9 + (i * 7) % 5, 2], [-5 + (i % 3) * 5, 8, -5 + Math.floor(i / 3) * 5], [-1, -(9 + (i * 7) % 5), -1], 'ghast_skin', 'tent', i)); return P; })(),
  blaze: (() => { const P = [part([8, 8, 8], [0, 20, 0], [-4, 0, -4], { all: 'blaze_skin', front: 'blaze_face' }, 'head')]; for (let i = 0; i < 12; i++) P.push(part([2, 8, 2], [0, i < 4 ? 14 : i < 8 ? 9 : 4, 0], [-1, 0, -1], 'blaze_skin', 'rod', i)); return P; })(),
  magma: [part([16, 16, 16], [0, 0, 0], [-8, 0, -8], { all: 'magma_skin' }, 'slime')],
  silverfish: [part([4, 3, 3], [0, 0, -3], [-2, 0, -1.5], 'stone', 'body'), part([6, 4, 3], [0, 0, 0], [-3, 0, -1.5], 'stone', 'body'), part([4, 3, 3], [0, 0, 3], [-2, 0, -1.5], 'stone', 'tail')],
  shulker: [part([16, 8, 16], [0, 0, 0], [-8, 0, -8], 'shulker_shell', 'body'), part([16, 8, 16], [0, 8, 0], [-8, 0, -8], 'shulker_shell', 'lid'), part([6, 6, 6], [0, 4, 0], [-3, 0, -3], { all: 'shulker_face' }, 'head')],
  crystal: [part([8, 8, 8], [0, 12, 0], [-4, -4, -4], 'crystal_core', 'core'), part([12, 12, 12], [0, 12, 0], [-6, -6, -6], 'crystal', 'cage'), part([16, 16, 16], [0, 12, 0], [-8, -8, -8], 'crystal', 'cage2'), part([12, 4, 12], [0, 0, 0], [-6, 0, -6], 'bedrock', 'base')],
  dragon: (() => {
    const P = [part([24, 24, 64], [0, 0, 0], [-12, 0, -32], 'dragon_skin', 'body')];
    for (let i = 0; i < 5; i++) P.push(part([10, 10, 10], [0, 12, -32 - i * 10], [-5, -5, -10], 'dragon_skin', 'neck', i));
    P.push(part([16, 16, 16], [0, 12, -82], [-8, -8, -16], { all: 'dragon_skin', front: 'dragon_face' }, 'dhead'), part([12, 4, 16], [0, 4, -82], [-6, -4, -32], 'dragon_skin', 'dhead'));
    for (let i = 0; i < 12; i++) P.push(part([10, 10, 10], [0, 12, 32 + i * 10], [-5, -5, 0], 'dragon_skin', 'dtail', i));
    P.push(part([56, 4, 40], [12, 20, -10], [0, -2, -20], 'dragon_wing', 'dwingR'), part([56, 4, 40], [-12, 20, -10], [-56, -2, -20], 'dragon_wing', 'dwingL'));
    P.push(part([8, 24, 8], [10, 4, -20], [-4, -24, -4], 'dragon_skin', 'legFR'), part([8, 24, 8], [-10, 4, -20], [-4, -24, -4], 'dragon_skin', 'legFL'), part([10, 28, 10], [12, 4, 22], [-5, -28, -5], 'dragon_skin', 'legBR'), part([10, 28, 10], [-12, 4, 22], [-5, -28, -5], 'dragon_skin', 'legBL'));
    return P;
  })(),
};
const MODEL_SCALE = { ghast: 4, dragon: 1.4, magma: 1.6, warden: 1, golem: 1, crystal: 1 };
function partRot(pt, e, t, f) {
  const ws = Math.sin(e.walk * 1.4) * 0.9 * e.walkAmt; const r = pt.r;
  switch (r) {
    case 'head': return [-(e.pitch || 0), (e.headRel || 0), 0];
    case 'armR': return [ws + (e.swing ? -Math.sin(e.swing / 6 * Math.PI) * 1.4 : 0), 0, -0.05];
    case 'armL': return [-ws, 0, 0.05];
    case 'armZ': case 'armZL': return [-1.45 + Math.sin(t * 2) * 0.05, 0, 0];
    case 'armB': case 'armBL': return [e.target ? -1.5 : ws * (r === 'armB' ? 1 : -1), r === 'armBL' && e.target ? 0.3 : 0, 0];
    case 'armX': case 'armXL': return [-0.75, 0, 0];
    case 'armE': case 'armEL': return [ws * 0.6 * (r === 'armE' ? 1 : -1), 0, 0];
    case 'legR': case 'legFL': case 'legBR': return [-ws, 0, 0];
    case 'legL': case 'legFR': case 'legBL': return [ws, 0, 0];
    case 'wingR': return [0, 0, e.onGround ? 0 : -Math.abs(Math.sin(t * 20)) * 1.2];
    case 'wingL': return [0, 0, e.onGround ? 0 : Math.abs(Math.sin(t * 20)) * 1.2];
    case 'slR': return [0, -0.6 + pt.k * 0.4 + Math.sin(e.walk * 2 + pt.k) * 0.3 * e.walkAmt, 0.5];
    case 'slL': return [0, 0.6 - pt.k * 0.4 - Math.sin(e.walk * 2 + pt.k) * 0.3 * e.walkAmt, -0.5];
    case 'tail': return [Math.sin(t * 3) * 0.2, Math.sin(t * 4) * 0.4, 0];
    case 'tail2': return [0, Math.sin(t * 4 + 1) * 0.6, 0];
    case 'tent': return [Math.sin(t * 2 + pt.k) * 0.3, 0, Math.cos(t * 1.7 + pt.k) * 0.2];
    case 'lid': return [-(e.open || 0) * 0.6, 0, 0];
    case 'dwingR': return [0, 0, Math.sin(t * 3) * 0.7];
    case 'dwingL': return [0, 0, -Math.sin(t * 3) * 0.7];
    case 'neck': return [Math.sin(t * 1.5 + pt.k * 0.4) * 0.06, 0, 0];
    case 'dtail': return [Math.sin(t * 1.2 + pt.k * 0.5) * 0.05, Math.sin(t + pt.k * 0.4) * 0.08, 0];
    default: return [0, 0, 0];
  }
}
function partOffset(pt, e, t) {
  if (pt.r === 'rod') { const k = pt.k; const a = t * (k < 4 ? 1.5 : k < 8 ? -1.2 : 1) + (k % 4) * Math.PI / 2; const rad = k < 4 ? 8 : k < 8 ? 6 : 4; return [Math.cos(a) * rad, Math.sin(t * 2 + k) * 1, Math.sin(a) * rad]; }
  if (pt.r === 'core' || pt.r === 'cage' || pt.r === 'cage2') return [0, Math.sin(t * 2) * 3, 0];
  return null;
}
// ----------------------------------------------------------------- dibujar
const _mm = M4.create();
function entLight(e) { const w = e.world; if (!w) return [15, 0]; const L = w.light(Math.floor(e.x), Math.floor(e.y + Math.min(1, e.h * 0.5)), Math.floor(e.z)); return L; }
function drawModel(parts, e, x, y, z, yaw, scale, light, tint, flash, t, emis) {
  for (const pt of parts) {
    const m = M4.ident(_mm); M4.translate(m, x - R.cam[0], y - R.cam[1], z - R.cam[2]); M4.rotY(m, yaw); if (e.deathTime) M4.rotZ(m, Math.min(1, e.deathTime / 10) * Math.PI / 2);
    const sc = scale / 16; M4.scale(m, sc, sc, sc);
    M4.translate(m, pt.p[0], pt.p[1], pt.p[2]);
    const off = partOffset(pt, e, t); if (off) M4.translate(m, off[0], off[1], off[2]);
    const r = partRot(pt, e, t);
    if (pt.r === 'core' || pt.r === 'cage' || pt.r === 'cage2') { M4.rotY(m, t * (pt.r === 'cage' ? 1.3 : pt.r === 'cage2' ? -1 : 2)); M4.rotX(m, t * 0.9); }
    if (r[1]) M4.rotY(m, r[1]); if (r[0]) M4.rotX(m, r[0]); if (r[2]) M4.rotZ(m, r[2]);
    M4.translate(m, pt.o[0], pt.o[1], pt.o[2]); M4.scale(m, pt.s[0], pt.s[1], pt.s[2]);
    drawBox(m, pt.t, light, tint, flash, (pt.r === 'core' ? 1 : emis || 0));
  }
}
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function drawEntity(e, alpha, t) {
  const x = lerp(e.px ?? e.x, e.x, alpha), y = lerp(e.py ?? e.y, e.y, alpha), z = lerp(e.pz ?? e.z, e.z, alpha), yaw = lerpAngle(e.pyaw ?? e.yaw, e.yaw, alpha);
  const light = entLight(e); const flash = e.hurtTime > 0 || (e.dead && e.deathTime) ? [0.7, 0, 0, 0.45] : e.fuse > 0 && (e.fuse >> 2) % 2 ? [1, 1, 1, 0.6] : null;
  if (e.type === 'item') return drawItemEnt(e, x, y, z, light, t);
  if (e instanceof Projectile || e.proxyProj) return drawProj(e, x, y, z, yaw, light, t);
  if (e.type === 'player') return drawPlayerModel(e, x, y, z, yaw, light, flash, t);
  const d = MOB[e.type]; if (!d) return;
  const mdl = MODELS[d.model]; if (!mdl) return;
  e.headRel = e.headLook !== undefined ? clamp(lerpAngle(0, e.headLook - yaw, 1), -1, 1) : 0;
  let sc = (MODEL_SCALE[d.model] || 1) * (d.scale || 1);
  let tint = d.tint ? [...d.tint, 1] : [1, 1, 1, 1];
  if (e.type === 'sheep' && e.color) tint = [...e.color, 1];
  if (e.type === 'creeper' && e.fuse > 0) sc *= 1 + e.fuse / 30 * 0.15;
  const emis = (e.type === 'blaze' || e.type === 'magma_cube') ? 0.6 : e.type === 'end_crystal' ? 0.5 : 0;
  if (e.type === 'magma_cube') { const sq = e.onGround ? 1 : 1.2; drawModel(mdl, e, x, y, z, yaw, sc, light, tint, flash, t, emis); return; }
  drawModel(mdl, e, x, y + (d.model === 'ghast' ? Math.sin(t * 1.5) * 0.3 : 0), z, yaw, sc, light, tint, flash, t, emis);
  if (e.type === 'sheep') { /* lana tintada en cuerpo ya */ }
}
function drawPlayerModel(e, x, y, z, yaw, light, flash, t) {
  e.headRel = 0; const sneak = e.sneaking; const yy = y - (sneak ? 0.12 : 0);
  drawModel(MODELS.steve, e, x, yy, z, yaw, 0.9375, light, [1, 1, 1, 1], flash, t);
  // armadura
  const arm = e.armor || [];
  const base = MODELS.steve; const mats = arm.map(a => a ? (REG[a.id].armor ? REG[a.id].armor.mat : null) : null);
  if (mats.some(Boolean)) {
    const overlay = [];
    const L = n => L6('armor_' + (n === 'turtle' ? 'leather' : n));
    if (mats[0]) overlay.push(Object.assign({}, base[0], { s: [9, 9, 9], o: [-4.5, -0.5, -4.5], t: L(mats[0]) }));
    if (mats[1] && arm[1].id !== ID.elytra) { overlay.push(Object.assign({}, base[1], { s: [9, 12.5, 5], o: [-4.5, -0.25, -2.5], t: L(mats[1]) })); overlay.push(Object.assign({}, base[2], { s: [5, 6, 5], o: [-2.5, -4, -2.5], t: L(mats[1]) })); overlay.push(Object.assign({}, base[3], { s: [5, 6, 5], o: [-2.5, -4, -2.5], t: L(mats[1]) })); }
    if (mats[2]) { overlay.push(Object.assign({}, base[4], { s: [4.6, 8, 4.6], o: [-2.3, -8, -2.3], t: L(mats[2]) })); overlay.push(Object.assign({}, base[5], { s: [4.6, 8, 4.6], o: [-2.3, -8, -2.3], t: L(mats[2]) })); }
    if (mats[3]) { overlay.push(Object.assign({}, base[4], { s: [4.8, 4.5, 4.8], o: [-2.4, -12.2, -2.4], t: L(mats[3]) })); overlay.push(Object.assign({}, base[5], { s: [4.8, 4.5, 4.8], o: [-2.4, -12.2, -2.4], t: L(mats[3]) })); }
    drawModel(overlay, e, x, yy, z, yaw, 0.9375, light, [1, 1, 1, 1], flash, t);
  }
  if (arm[1] && arm[1].id === ID.elytra) drawModel([part([10, 20, 2], [0, 22, 2], [-5, -20, 0], 'elytra_tex', e.gliding ? 'none' : 'none')], e, x, yy, z, yaw, 0.9375, light, [1, 1, 1, 1], null, t);
  // objeto en mano
  const h = e.heldItem !== undefined ? e.heldItem : (e.inv ? e.inv[e.sel] : null);
  if (h) { const m = M4.ident(_mm); M4.translate(m, x - R.cam[0], yy - R.cam[1], z - R.cam[2]); M4.rotY(m, yaw); M4.scale(m, 0.9375 / 16, 0.9375 / 16, 0.9375 / 16); M4.translate(m, 6, 12, -4); drawItemModel(h.id ?? h, m, light, 7); }
}
function drawItemModel(id, m, light, size) {
  const d = REG[id]; if (!d) return;
  if (d.isBlock && d.render !== 'cross' && d.render !== 'fire') { const mm = new Float32Array(m); M4.translate(mm, -size / 2, -size / 2, -size / 2); M4.scale(mm, size, size, size); const b = d.box; if (b) { M4.translate(mm, b[0] / 16, b[1] / 16, b[2] / 16); M4.scale(mm, (b[3] - b[0]) / 16, (b[4] - b[1]) / 16, (b[5] - b[2]) / 16); } drawBox(mm, d.faces, light, d.tint || d.tintTop ? [0.55, 0.78, 0.35, 1] : null, null, d.emissive ? 0.6 : 0); }
  else { const mm = new Float32Array(m); M4.translate(mm, -size / 2, -size / 2, -0.5); M4.scale(mm, size * 1.2, size * 1.2, 1); drawBox(mm, d.isBlock ? d.faces[0] : d.icon, light, d.tint ? [0.55, 0.78, 0.35, 1] : null, null, 0, ITEM_UVR); }
}
const ITEM_UVR = new Float32Array([0, 0, 0.0625, 1, 0, 0, 0.0625, 1, 0, 0, 1, 0.0625, 0, 0.9375, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1]);
function drawItemEnt(e, x, y, z, light, t) {
  const m = M4.ident(_mm); const bob = Math.sin(t * 2.5 + e.spin) * 0.08 + 0.12;
  M4.translate(m, x - R.cam[0], y + bob + 0.12 - R.cam[1], z - R.cam[2]); M4.rotY(m, t * 1.5 + e.spin);
  const n = e.stack.c > 16 ? 3 : e.stack.c > 1 ? 2 : 1;
  for (let i = 0; i < n; i++) { const mm = new Float32Array(m); M4.translate(mm, i * 0.06, i * 0.05, i * 0.04); M4.scale(mm, 1 / 16, 1 / 16, 1 / 16); drawItemModel(e.stack.id, mm, light, REG[e.stack.id].isBlock && REG[e.stack.id].render === 'cube' ? 4 : 6); }
}
function drawProj(e, x, y, z, yaw, light, t) {
  const m = M4.ident(_mm); M4.translate(m, x - R.cam[0], y - R.cam[1], z - R.cam[2]);
  const ty = e.type;
  if (ty === 'tnt' || ty === 'falling_block') { M4.translate(m, -0.5, 0, -0.5); const flash = ty === 'tnt' && ((e.fuse >> 2) % 2) ? [1, 1, 1, 0.55] : null; drawBox(m, REG[ty === 'tnt' ? ID.tnt : e.block].faces, light, null, flash); return; }
  if (ty === 'arrow' || ty === 'trident') { M4.rotY(m, e.yaw); M4.rotX(m, e.pitch || 0); M4.translate(m, -0.03, -0.03, -0.25); M4.scale(m, 0.06, 0.06, ty === 'trident' ? 1 : 0.5); drawBox(m, ty === 'trident' ? TEX.prismarine : TEX.arrow_tex, light); return; }
  if (ty === 'fireball' || ty === 'small_fireball') { const s = ty === 'fireball' ? 1 : 0.35; M4.rotY(m, t * 3); M4.rotX(m, t * 2); M4.translate(m, -s / 2, -s / 2, -s / 2); M4.scale(m, s, s, s); drawBox(m, TEX.fireball, [15, 15], null, null, 2); return; }
  if (ty === 'shulker_bullet' || ty === 'wind_charge') { const s = 0.3; M4.rotY(m, t * 4); M4.translate(m, -s / 2, -s / 2, -s / 2); M4.scale(m, s, s, s); drawBox(m, ty === 'wind_charge' ? TEX.breeze_skin : TEX.white, [15, 15], null, null, 1); return; }
  const id = { pearl: ID.ender_pearl, eye: ID.eye_of_ender, snowball: ID.snowball }[ty]; if (id) { M4.rotY(m, R.yawCam || 0); M4.scale(m, 1 / 16, 1 / 16, 1 / 16); drawItemModel(id, m, light, 5); }
}
function drawAllEntities(dim, alpha, selfView) {
  const t = performance.now() / 1000; const cam = R.cam; const rd2 = (SETTINGS.rd * 16) ** 2;
  for (const e of G.entities.values()) {
    if (e.dim !== dim || e.removed) continue; if ((e.x - cam[0]) ** 2 + (e.z - cam[2]) ** 2 > rd2) continue;
    if (e.remotePlayer && e.spectator) continue;
    drawEntity(e, alpha, t);
  }
  if (selfView && G.player) drawEntity(Object.assign(Object.create(Object.getPrototypeOf(G.player)), G.player, { px: G.player.px, heldItem: G.player.held(), pitch: G.player.pitch }), 1, t);
}
// rayos (guardián, curación del dragón)
function entityBeams(dim) {
  const pts = [];
  for (const e of G.entities.values()) {
    if (e.dim !== dim) continue;
    if (e.laserT && e.laser > 0) { pts.push(e.x - R.cam[0], e.y + 0.5 - R.cam[1], e.z - R.cam[2], e.laserT.x - R.cam[0], e.laserT.y + 1.2 - R.cam[1], e.laserT.z - R.cam[2]); }
    if (e.healBeam) { pts.push(e.x - R.cam[0], e.y + 1 - R.cam[1], e.z - R.cam[2], e.healBeam.x - R.cam[0], e.healBeam.y + 1 - R.cam[1], e.healBeam.z - R.cam[2]); }
  }
  return pts;
}
