// ============================================================================
//  Modelos de entidades (cajas) y renderizado
// ============================================================================
function L6(t) { // t: string | {all,front,top,bottom,back}
  if (typeof t === 'string') { const l = TEX[t]; return [l, l, l, l, l, l]; }
  const a = TEX[t.all]; return [TEX[t.side || t.all] ?? a, TEX[t.side || t.all] ?? a, TEX[t.top || t.all] ?? a, TEX[t.bottom || t.all] ?? a, TEX[t.back || t.all] ?? a, TEX[t.front || t.all] ?? a];
}
function part(s, p, o, t, r, k) { return { s, p, o, t: L6(t), r, k }; }
// modelos con piel propia (f1m_mobs.js); el cristal del End sigue con texturas de bloque
const MODELS = Object.assign({
  crystal: [part([8, 8, 8], [0, 12, 0], [-4, -4, -4], 'crystal_core', 'core'), part([12, 12, 12], [0, 12, 0], [-6, -6, -6], 'crystal', 'cage'), part([16, 16, 16], [0, 12, 0], [-8, -8, -8], 'crystal', 'cage2'), part([12, 4, 12], [0, 0, 0], [-6, 0, -6], 'bedrock', 'base')]
}, skinModels());
MODELS.illager = MODELS.pillager; MODELS.magma = MODELS.magma_cube;
// modelo de una entidad: el de su tipo si tiene uno propio (husk, esqueleto wither…) o el de su familia
function modelFor(e, d) { return MODELS[e.type] || (d && MODELS[d.model]); }
const MODEL_SCALE = { ghast: 4, dragon: 1.4, magma: 1.6, warden: 1, golem: 1, crystal: 1 };
function partRot(pt, e, t, f) {
  const ws = Math.sin(e.walk * 1.4) * 0.9 * e.walkAmt; const r = pt.r;
  switch (r) {
    case 'head': return [(e.pitch || 0), (e.headRel || 0), 0]; // el frente del modelo es −Z: rotX positivo = mirar arriba
    case 'armR': return [ws + (e.swing ? Math.sin(e.swing / 6 * Math.PI) * 1.4 : 0), 0, -0.05];
    case 'armL': return [-ws, 0, 0.05];
    case 'armZ': case 'armZL': return [1.45 + Math.sin(t * 2) * 0.05, 0, 0]; // brazos estirados HACIA DELANTE (antes apuntaban atrás)
    case 'armB': case 'armBL': return [e.target ? 1.5 : ws * (r === 'armB' ? 1 : -1), r === 'armBL' && e.target ? -0.3 : 0, 0];
    case 'armX': case 'armXL': return [0.75, 0, 0];
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
    if (pt.wool && e.sheared) continue; // oveja esquilada: sin lana
    const m = M4.ident(_mm); M4.translate(m, x - R.cam[0], y - R.cam[1], z - R.cam[2]); M4.rotY(m, yaw); if (e.deathTime) M4.rotZ(m, Math.min(1, e.deathTime / 10) * Math.PI / 2);
    const sc = scale / 16; M4.scale(m, sc, sc, sc);
    M4.translate(m, pt.p[0], pt.p[1], pt.p[2]);
    const off = partOffset(pt, e, t); if (off) M4.translate(m, off[0], off[1], off[2]);
    const r = partRot(pt, e, t);
    if (pt.r === 'core' || pt.r === 'cage' || pt.r === 'cage2') { M4.rotY(m, t * (pt.r === 'cage' ? 1.3 : pt.r === 'cage2' ? -1 : 2)); M4.rotX(m, t * 0.9); }
    if (r[1]) M4.rotY(m, r[1]); if (r[0]) M4.rotX(m, r[0]); if (r[2]) M4.rotZ(m, r[2]);
    if (pt.rot) { if (pt.rot[1]) M4.rotY(m, pt.rot[1]); if (pt.rot[0]) M4.rotX(m, pt.rot[0]); if (pt.rot[2]) M4.rotZ(m, pt.rot[2]); } // giro fijo (orejas, cuernos, púas)
    M4.translate(m, pt.o[0], pt.o[1], pt.o[2]); M4.scale(m, pt.s[0], pt.s[1], pt.s[2]);
    drawBox(m, pt.t, light, pt.wool && e.woolTint ? e.woolTint : tint, flash, (pt.r === 'core' ? 1 : emis || 0));
  }
}
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function drawEntity(e, alpha, t) {
  if (e.ragdoll) return; // lo dibuja drawRagdolls
  const x = lerp(e.px ?? e.x, e.x, alpha), y = lerp(e.py ?? e.y, e.y, alpha), z = lerp(e.pz ?? e.z, e.z, alpha), yaw = lerpAngle(e.pyaw ?? e.yaw, e.yaw, alpha);
  const light = entLight(e); const flash = e.hurtTime > 0 || (e.dead && e.deathTime) ? [0.7, 0, 0, 0.45] : e.fuse > 0 && (e.fuse >> 2) % 2 ? [1, 1, 1, 0.6] : null;
  if (e.isBoat) return drawBoat(e, x, y, z, light, alpha);
  if (e.type === 'item') return drawItemEnt(e, x, y, z, light, t);
  if (e instanceof Projectile || e.proxyProj) return drawProj(e, x, y, z, yaw, light, t);
  if (e.type === 'player') return drawPlayerModel(e, x, y, z, yaw, light, flash, t);
  const d = MOB[e.type]; if (!d) return;
  const mdl = modelFor(e, d); if (!mdl) return; const own = !!MODELS[e.type];
  e.headRel = e.headLook !== undefined ? clamp(lerpAngle(0, e.headLook - yaw, 1), -1, 1) : 0;
  let sc = (MODEL_SCALE[d.model] || 1) * (d.scale || 1);
  let tint = d.tint && !own ? [...d.tint, 1] : [1, 1, 1, 1];
  e.woolTint = e.type === 'sheep' && e.color ? [...e.color, 1] : null; // solo la lana se tiñe
  if (e.type === 'creeper' && e.fuse > 0) sc *= 1 + e.fuse / 30 * 0.15;
  const emis = (e.type === 'blaze' || e.type === 'magma_cube') ? 0.6 : e.type === 'end_crystal' ? 0.5 : 0;
  if (e.type === 'magma_cube') { const sq = e.onGround ? 1 : 1.2; drawModel(mdl, e, x, y, z, yaw, sc, light, tint, flash, t, emis); return; }
  drawModel(mdl, e, x, y + (d.model === 'ghast' ? Math.sin(t * 1.5) * 0.3 : 0), z, yaw, sc, light, tint, flash, t, emis);
  if (e.type === 'sheep') { /* lana tintada en cuerpo ya */ }
}
// piezas de armadura del jugador (mismos papeles que el modelo base, así el ragdoll las agrupa con cada miembro)
function playerArmorParts(e) {
  const arm = e.armor || []; const base = MODELS.steve; const mats = arm.map(a => a ? (REG[a.id].armor ? REG[a.id].armor.mat : null) : null);
  const overlay = []; if (!mats.some(Boolean)) return overlay;
  const L = n => L6('armor_' + (n === 'turtle' ? 'leather' : n));
  if (mats[0]) overlay.push(Object.assign({}, base[0], { s: [9, 9, 9], o: [-4.5, -0.5, -4.5], t: L(mats[0]) }));
  if (mats[1] && arm[1].id !== ID.elytra) { overlay.push(Object.assign({}, base[1], { s: [9, 12.5, 5], o: [-4.5, -0.25, -2.5], t: L(mats[1]) })); overlay.push(Object.assign({}, base[2], { s: [5, 6, 5], o: [-2.5, -4, -2.5], t: L(mats[1]) })); overlay.push(Object.assign({}, base[3], { s: [5, 6, 5], o: [-2.5, -4, -2.5], t: L(mats[1]) })); }
  if (mats[2]) { overlay.push(Object.assign({}, base[4], { s: [4.6, 8, 4.6], o: [-2.3, -8, -2.3], t: L(mats[2]) })); overlay.push(Object.assign({}, base[5], { s: [4.6, 8, 4.6], o: [-2.3, -8, -2.3], t: L(mats[2]) })); }
  if (mats[3]) { overlay.push(Object.assign({}, base[4], { s: [4.8, 4.5, 4.8], o: [-2.4, -12.2, -2.4], t: L(mats[3]) })); overlay.push(Object.assign({}, base[5], { s: [4.8, 4.5, 4.8], o: [-2.4, -12.2, -2.4], t: L(mats[3]) })); }
  return overlay;
}
function drawPlayerModel(e, x, y, z, yaw, light, flash, t) {
  e.headRel = 0; const sneak = e.sneaking; const yy = y - (sneak ? 0.12 : 0);
  drawModel(MODELS.steve, e, x, yy, z, yaw, 0.9375, light, [1, 1, 1, 1], flash, t);
  // armadura
  const overlay = playerArmorParts(e);
  if (overlay.length) drawModel(overlay, e, x, yy, z, yaw, 0.9375, light, [1, 1, 1, 1], flash, t);
  const arm = e.armor || [];
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
  const t = G.wclock ?? performance.now() / 1000; const cam = R.cam; const rd2 = (SETTINGS.rd * 16) ** 2;
  for (const e of G.entities.values()) {
    if (e.dim !== dim || e.removed) continue; if ((e.x - cam[0]) ** 2 + (e.z - cam[2]) ** 2 > rd2) continue;
    if (e.remotePlayer && e.spectator) continue;
    drawEntity(e, alpha, t);
  }
  if (typeof drawRagdolls === 'function') drawRagdolls(dim, !selfView);
  if (typeof drawDebris === 'function') drawDebris(dim);
  if (typeof drawFallingTrees === 'function') drawFallingTrees(dim);
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
