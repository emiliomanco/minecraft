// ============================================================================
//  Entidades: física, jugador, mobs, objetos, proyectiles, partículas, explosiones
// ============================================================================
const G = { tick: 0, time: 1000, worlds: null, world: null, player: null, entities: new Map(), mode: 'menu', gameMode: 'survival', difficulty: 2, seed: 0, net: null, particles: [], rain: 0, rainLevel: 0, rainTimer: 12000, containers: {}, spawned: new Set(), dragonKilled: false, endInit: false, shake: 0, paused: false };
let nextEid = 1;
// ------------------------------------------------------------ colisiones
function blockBoxes(id, meta, x, y, z, out) {
  if (id < 0) { out.push([x, y, z, x + 1, y + 1, z + 1]); return; }
  const d = REG[id]; if (!d || !d.solid) return;
  if (d.render === 'snow') { const h = (Math.max(1, meta) - 1) / 8; if (h > 0) out.push([x, y, z, x + 1, y + h, z + 1]); return; }
  if (d.box) { const b = d.box; const top = d.fenceH ? d.fenceH : b[4] / 16; out.push([x + b[0] / 16, y + b[1] / 16, z + b[2] / 16, x + b[3] / 16, y + top, z + b[5] / 16]); return; }
  if (d.id === ID.cactus) { out.push([x + 1 / 16, y, z + 1 / 16, x + 15 / 16, y + 1, z + 15 / 16]); return; }
  out.push([x, y, z, x + 1, y + 1, z + 1]);
}
const _bx = [];
function collect(world, x0, y0, z0, x1, y1, z1) {
  _bx.length = 0;
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let z = Math.floor(z0); z <= Math.floor(z1); z++) for (let y = Math.floor(y0) - 1; y <= Math.floor(y1); y++) {
    const id = world.get(x, y, z); if (id === 0) continue; blockBoxes(id, world.getMeta(x, y, z), x, y, z, _bx);
  }
  return _bx;
}
function moveEntity(world, e, dx, dy, dz) {
  const hw = e.w / 2; const eps = 1e-5;
  let bx0 = e.x - hw, by0 = e.y, bz0 = e.z - hw, bx1 = e.x + hw, by1 = e.y + e.h, bz1 = e.z + hw;
  const boxes = collect(world, Math.min(bx0, bx0 + dx) - 1, Math.min(by0, by0 + dy), Math.min(bz0, bz0 + dz) - 1, Math.max(bx1, bx1 + dx) + 1, Math.max(by1, by1 + dy) + 1, Math.max(bz1, bz1 + dz) + 1);
  const ody = dy, odx = dx, odz = dz;
  for (const b of boxes) if (bx1 > b[0] + eps && bx0 < b[3] - eps && bz1 > b[2] + eps && bz0 < b[5] - eps) { if (dy < 0 && by0 >= b[4] - eps) dy = Math.max(dy, b[4] - by0); else if (dy > 0 && by1 <= b[1] + eps) dy = Math.min(dy, b[1] - by1); }
  by0 += dy; by1 += dy;
  for (const b of boxes) if (by1 > b[1] + eps && by0 < b[4] - eps && bz1 > b[2] + eps && bz0 < b[5] - eps) { if (dx < 0 && bx0 >= b[3] - eps) dx = Math.max(dx, b[3] - bx0); else if (dx > 0 && bx1 <= b[0] + eps) dx = Math.min(dx, b[0] - bx1); }
  bx0 += dx; bx1 += dx;
  for (const b of boxes) if (by1 > b[1] + eps && by0 < b[4] - eps && bx1 > b[0] + eps && bx0 < b[3] - eps) { if (dz < 0 && bz0 >= b[5] - eps) dz = Math.max(dz, b[5] - bz0); else if (dz > 0 && bz1 <= b[2] + eps) dz = Math.min(dz, b[2] - bz1); }
  // escalón automático (losas, nieve, caminos)
  if ((dx !== odx || dz !== odz) && e.onGround && e.step) {
    let up = 0; for (const b of boxes) { const ox = e.x + odx, oz = e.z + odz; if (ox + hw > b[0] && ox - hw < b[3] && oz + hw > b[2] && oz - hw < b[5] && b[4] > e.y && b[4] - e.y <= e.step + eps) up = Math.max(up, b[4] - e.y); }
    if (up > 0) { let free = true; const nx = e.x + odx, nz = e.z + odz; for (const b of boxes) if (nx + hw > b[0] + eps && nx - hw < b[3] - eps && nz + hw > b[2] + eps && nz - hw < b[5] - eps && e.y + up + e.h > b[1] + eps && e.y + up < b[4] - eps) free = false; if (free) { e.x = nx; e.z = nz; e.y += up + dy; e.hc = false; e.vc = false; e.onGround = true; return; } }
  }
  e.x += dx; e.y += dy; e.z += dz;
  e.hc = (dx !== odx) || (dz !== odz); e.vc = dy !== ody;
  e.onGround = ody < 0 && dy !== ody;
  if (dx !== odx) e.vx = 0; if (dz !== odz) e.vz = 0; if (dy !== ody) e.vy = 0;
}
function blockAt(world, x, y, z) { return world.get(Math.floor(x), Math.floor(y), Math.floor(z)); }
function liquidAt(world, x, y, z) { const b = blockAt(world, x, y, z); if (b <= 0) return 0; const d = REG[b]; return d.liquid || (d.inWater ? 1 : 0); }
function entityInBlock(world, e, pred) {
  const hw = e.w / 2 - 0.001;
  for (let x = Math.floor(e.x - hw); x <= Math.floor(e.x + hw); x++) for (let z = Math.floor(e.z - hw); z <= Math.floor(e.z + hw); z++) for (let y = Math.floor(e.y); y <= Math.floor(e.y + e.h - 0.01); y++) { const b = world.get(x, y, z); if (b > 0 && pred(REG[b], x, y, z)) return { x, y, z, b }; }
  return null;
}
function flowVec(world, x, y, z) {
  const b = world.get(x, y, z); if (b !== ID.water && b !== ID.lava) return [0, 0];
  const lv = j => { if (j <= 0) return -1; return j; };
  const m0 = world.getMeta(x, y, z) & 7; let fx = 0, fz = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nb = world.get(x + dx, y, z + dz); if (nb === b) { const m = world.getMeta(x + dx, y, z + dz) & 7; fx += dx * (m - m0); fz += dz * (m - m0); } else if (nb === 0 || (nb > 0 && !REG[nb].solid)) { if (world.get(x + dx, y - 1, z + dz) === b) { fx += dx * 2; fz += dz * 2; } } }
  const l = Math.hypot(fx, fz); return l ? [fx / l, fz / l] : [0, 0];
}

// ------------------------------------------------------------ Entidad base
class Entity {
  constructor(type, dim, x, y, z) {
    this.id = nextEid++; this.type = type; this.dim = dim; this.x = x; this.y = y; this.z = z; this.px = x; this.py = y; this.pz = z;
    this.vx = 0; this.vy = 0; this.vz = 0; this.yaw = 0; this.pitch = 0; this.pyaw = 0; this.headYaw = 0; this.w = 0.6; this.h = 1.8; this.onGround = false;
    this.hp = 20; this.maxHp = 20; this.dead = false; this.removed = false; this.age = 0; this.hurtTime = 0; this.invul = 0; this.fire = 0; this.walk = 0; this.walkAmt = 0; this.step = 0.6; this.deathTime = 0; this.fallDist = 0;
  }
  get world() { return G.worlds ? G.worlds[this.dim] : null; }
  savePrev() { this.px = this.x; this.py = this.y; this.pz = this.z; this.pyaw = this.yaw; this.pwalk = this.walk; }
}
// ------------------------------------------------------------ Definición de mobs
const MOB = {
  pig: { hp: 10, w: 0.9, h: 0.9, speed: 2.5, ai: 'passive', model: 'pig', drops: [['porkchop', 1, 3, 'cooked_porkchop']] },
  cow: { hp: 10, w: 0.9, h: 1.4, speed: 2.2, ai: 'passive', model: 'cow', drops: [['beef', 1, 3, 'cooked_beef'], ['leather', 0, 2]] },
  sheep: { hp: 8, w: 0.9, h: 1.3, speed: 2.3, ai: 'passive', model: 'sheep', drops: [['white_wool', 1, 1], ['mutton', 1, 2, 'cooked_mutton']] },
  chicken: { hp: 4, w: 0.4, h: 0.7, speed: 2.5, ai: 'passive', model: 'chicken', drops: [['chicken', 1, 1, 'cooked_chicken'], ['feather', 0, 2]] },
  goat: { hp: 10, w: 0.9, h: 1.3, speed: 2.6, ai: 'passive', model: 'goat', drops: [] },
  cat: { hp: 10, w: 0.6, h: 0.7, speed: 3, ai: 'passive', model: 'cat', drops: [['string', 0, 2]] },
  villager: { hp: 20, w: 0.6, h: 1.95, speed: 2, ai: 'passive', model: 'villager', drops: [] },
  iron_golem: { hp: 100, w: 1.4, h: 2.7, speed: 2.2, ai: 'golem', dmg: 15, model: 'golem', drops: [['iron_ingot', 3, 5], ['poppy', 0, 2]] },
  zombie: { hp: 20, w: 0.6, h: 1.95, speed: 2.3, ai: 'melee', dmg: 3, model: 'zombie', burns: true, hostile: true, drops: [['rotten_flesh', 0, 2], ['iron_ingot', 0, 1, null, 0.03], ['carrot', 0, 1, null, 0.03], ['potato', 0, 1, null, 0.03]] },
  husk: { hp: 20, w: 0.6, h: 1.95, speed: 2.3, ai: 'melee', dmg: 3, model: 'zombie', tint: [0.95, 0.85, 0.6], hostile: true, drops: [['rotten_flesh', 0, 2]] },
  drowned: { hp: 20, w: 0.6, h: 1.95, speed: 2.3, ai: 'melee', dmg: 3, model: 'drowned', burns: true, hostile: true, swim: true, drops: [['rotten_flesh', 0, 2], ['copper_ingot', 0, 1, null, 0.11], ['trident', 0, 1, null, 0.04]] },
  skeleton: { hp: 20, w: 0.6, h: 1.99, speed: 2.4, ai: 'ranged', dmg: 4, model: 'skeleton', burns: true, hostile: true, drops: [['bone', 0, 2], ['arrow', 0, 2]] },
  creeper: { hp: 20, w: 0.6, h: 1.7, speed: 2.4, ai: 'creeper', model: 'creeper', hostile: true, drops: [['gunpowder', 0, 2]] },
  spider: { hp: 16, w: 1.4, h: 0.9, speed: 3.2, ai: 'melee', dmg: 2, model: 'spider', hostile: true, climb: true, drops: [['string', 0, 2], ['spider_eye', 0, 1, null, 0.33]] },
  cave_spider: { hp: 12, w: 0.7, h: 0.5, speed: 3.4, ai: 'melee', dmg: 2, model: 'spider', scale: 0.7, tint: [0.4, 0.6, 0.8], hostile: true, climb: true, drops: [['string', 0, 2]] },
  enderman: { hp: 40, w: 0.6, h: 2.9, speed: 3.3, ai: 'enderman', dmg: 7, model: 'enderman', drops: [['ender_pearl', 0, 1, null, 0.6]] },
  silverfish: { hp: 8, w: 0.4, h: 0.3, speed: 3, ai: 'melee', dmg: 1, model: 'silverfish', hostile: true, drops: [] },
  pillager: { hp: 24, w: 0.6, h: 1.95, speed: 2.6, ai: 'ranged', dmg: 4, model: 'illager', hostile: true, drops: [['arrow', 0, 2], ['crossbow', 0, 1, null, 0.08]] },
  vindicator: { hp: 24, w: 0.6, h: 1.95, speed: 2.8, ai: 'melee', dmg: 13, model: 'illager', hostile: true, drops: [['emerald', 0, 1]] },
  evoker: { hp: 24, w: 0.6, h: 1.95, speed: 2.4, ai: 'evoker', dmg: 6, model: 'illager', tint: [0.9, 0.9, 1.0], hostile: true, drops: [['totem', 1, 1], ['emerald', 0, 1]] },
  guardian: { hp: 30, w: 0.85, h: 0.85, speed: 3, ai: 'guardian', dmg: 6, model: 'guardian', hostile: true, swim: true, noGrav: true, drops: [['prismarine_shard', 0, 2], ['cod', 0, 1]] },
  elder_guardian: { hp: 80, w: 2, h: 2, speed: 2, ai: 'guardian', dmg: 8, model: 'guardian', scale: 2.35, tint: [0.85, 0.85, 0.8], hostile: true, swim: true, noGrav: true, boss: 'Guardián anciano', drops: [['wet_sponge', 1, 1], ['prismarine_shard', 0, 2]] },
  warden: { hp: 500, w: 0.9, h: 2.9, speed: 2.4, ai: 'warden', dmg: 30, model: 'warden', hostile: true, drops: [['sculk_sensor', 1, 1]] },
  breeze: { hp: 30, w: 0.6, h: 1.77, speed: 3, ai: 'breeze', dmg: 1, model: 'breeze', hostile: true, drops: [['breeze_rod', 1, 2]] },
  zombified_piglin: { hp: 20, w: 0.6, h: 1.95, speed: 2.3, ai: 'neutral', dmg: 5, model: 'piglin', tint: [0.9, 1.0, 0.85], drops: [['rotten_flesh', 0, 1], ['gold_nugget', 0, 1], ['gold_ingot', 0, 1, null, 0.025]] },
  piglin: { hp: 16, w: 0.6, h: 1.95, speed: 2.6, ai: 'piglin', dmg: 5, model: 'piglin', drops: [['gold_ingot', 0, 1, null, 0.2]] },
  piglin_brute: { hp: 50, w: 0.6, h: 1.95, speed: 2.8, ai: 'melee', dmg: 9, model: 'piglin', tint: [0.8, 0.7, 0.55], hostile: true, drops: [['golden_axe', 0, 1, null, 0.08]] },
  hoglin: { hp: 40, w: 1.4, h: 1.4, speed: 2.4, ai: 'melee', dmg: 6, model: 'hoglin', hostile: true, drops: [['porkchop', 2, 4, 'cooked_porkchop'], ['leather', 0, 1]] },
  ghast: { hp: 10, w: 4, h: 4, speed: 2, ai: 'ghast', model: 'ghast', hostile: true, noGrav: true, fireImmune: true, drops: [['ghast_tear', 0, 1], ['gunpowder', 0, 2]] },
  blaze: { hp: 20, w: 0.6, h: 1.8, speed: 2.3, ai: 'blaze', dmg: 6, model: 'blaze', hostile: true, noGrav: true, fireImmune: true, drops: [['blaze_rod', 1, 1, null, 0.7]] },
  magma_cube: { hp: 16, w: 1.6, h: 1.6, speed: 2.5, ai: 'slime', dmg: 6, model: 'magma', hostile: true, fireImmune: true, drops: [['magma_cream', 0, 1, null, 0.5]] },
  wither_skeleton: { hp: 20, w: 0.7, h: 2.4, speed: 2.5, ai: 'melee', dmg: 8, model: 'skeleton', tint: [0.25, 0.25, 0.27], scale: 1.2, hostile: true, fireImmune: true, drops: [['coal', 0, 1], ['bone', 0, 2]] },
  shulker: { hp: 30, w: 1, h: 1, speed: 0, ai: 'shulker', model: 'shulker', hostile: true, noGrav: true, drops: [['shulker_shell', 0, 1, null, 0.5]] },
  ender_dragon: { hp: 200, w: 8, h: 4, speed: 12, ai: 'dragon', dmg: 10, model: 'dragon', hostile: true, noGrav: true, fireImmune: true, boss: 'Ender Dragon', drops: [] },
  end_crystal: { hp: 1, w: 2, h: 2, speed: 0, ai: 'crystal', model: 'crystal', noGrav: true, fireImmune: true, drops: [] },
};
class Mob extends Entity {
  constructor(type, dim, x, y, z) {
    super(type, dim, x, y, z); const d = MOB[type]; this.def = d; this.hp = this.maxHp = d.hp; this.w = d.w; this.h = d.h; this.target = null; this.wander = null; this.timer = 0; this.cool = 0; this.panic = 0; this.angry = 0; this.fuse = 0; this.yaw = Math.random() * 6.28; this.persist = false; this.color = null;
    if (type === 'sheep') { const r = Math.random(); this.color = r < 0.8 ? [1, 1, 1] : r < 0.9 ? [0.3, 0.3, 0.32] : r < 0.95 ? [0.5, 0.35, 0.2] : [1, 0.7, 0.8]; }
  }
}
function spawnMob(type, dim, x, y, z) {
  if (!MOB[type]) return null; const m = new Mob(type, dim, x, y, z); G.entities.set(m.id, m);
  if (type === 'ender_dragon') { m.phase = 'circle'; m.ang = 0; }
  return m;
}
// ------------------------------------------------------------ objetos y proyectiles
class ItemEnt extends Entity {
  constructor(dim, x, y, z, stack) { super('item', dim, x, y, z); this.stack = stack; this.w = 0.25; this.h = 0.25; this.pickup = 10; this.step = 0; this.spin = Math.random() * 6; }
}
function dropItem(dim, x, y, z, stack, vx, vy, vz, delay) {
  if (!stack || stack.c <= 0) return null;
  if (G.net && G.net.role === 'client') { netSend({ t: 'drop', d: dim, x, y, z, s: stack, vx: vx || 0, vy: vy || 0, vz: vz || 0 }); return null; }
  const e = new ItemEnt(dim, x, y, z, { id: stack.id, c: stack.c, d: stack.d || 0 });
  e.vx = vx !== undefined ? vx : (Math.random() - 0.5) * 2; e.vy = vy !== undefined ? vy : 3; e.vz = vz !== undefined ? vz : (Math.random() - 0.5) * 2;
  if (delay !== undefined) e.pickup = delay; G.entities.set(e.id, e); return e;
}
class Projectile extends Entity {
  constructor(type, dim, x, y, z, vx, vy, vz, owner) { super(type, dim, x, y, z); this.vx = vx; this.vy = vy; this.vz = vz; this.owner = owner; this.w = 0.25; this.h = 0.25; this.stuck = false; this.step = 0; this.grav = { arrow: 20, pearl: 12, snowball: 12, eye: 0, fireball: 0, small_fireball: 0, wind_charge: 0, shulker_bullet: 0, trident: 20 }[type] ?? 12; }
}
function shoot(type, dim, x, y, z, vx, vy, vz, owner, extra) {
  if (G.net && G.net.role === 'client' && owner === G.player) { netSend({ t: 'proj', ty: type, d: dim, x, y, z, vx, vy, vz, ex: extra }); if (type !== 'eye') return null; }
  const p = new Projectile(type, dim, x, y, z, vx, vy, vz, owner); if (extra) Object.assign(p, extra); p.yaw = Math.atan2(-vx, -vz); G.entities.set(p.id, p); return p;
}
// ------------------------------------------------------------ partículas
const PART_TEX = {};
function P_(o) { if (G.particles.length > [600, 1800, 4000][SETTINGS.particles ?? 2]) return null; const p = Object.assign({ vx: 0, vy: 0, vz: 0, life: 1, max: 1, size: 0.2, grow: 0, r: 1, g: 1, b: 1, a: 1, fade: 1, add: false, emis: 0, grav: 0, drag: 0, rot: 0, vrot: 0, soft: 0, uv: null, collide: false, layer: TEX.soft }, o); p.max = p.life; G.particles.push(p); return p; }
function blockParticles(world, x, y, z, id, n = 14, speed = 2) {
  const d = REG[id]; if (!d || id === 0) return; const layer = d.faces ? d.faces[0] : d.icon;
  for (let i = 0; i < n; i++) { const u = Math.random() * 0.75, v = Math.random() * 0.75; P_({ x: x + Math.random(), y: y + Math.random(), z: z + Math.random(), vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed * 1.2, vz: (Math.random() - 0.5) * speed, life: 0.6 + Math.random() * 0.6, size: 0.1 + Math.random() * 0.08, layer, uv: [u, v, u + 0.25, v + 0.25], grav: 18, collide: true, fade: 0, light: world.light(x, y + 1, z) }); }
}
function smoke(x, y, z, o = {}) { return P_(Object.assign({ x, y, z, vx: (Math.random() - 0.5) * 0.4, vy: 0.8 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.4, life: 2.5 + Math.random() * 2, size: 0.5 + Math.random() * 0.4, grow: 0.9, r: 0.18, g: 0.17, b: 0.16, a: 0.55, layer: TEX['smoke_' + ((Math.random() * 4) | 0)], rot: Math.random() * 6, vrot: (Math.random() - 0.5) * 0.6, drag: 0.4, soft: 1.2 }, o)); }
function flame(x, y, z, o = {}) { return P_(Object.assign({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 0.3, life: 0.5 + Math.random() * 0.4, size: 0.35 + Math.random() * 0.3, grow: -0.3, r: 1, g: 0.55, b: 0.2, a: 1, add: true, emis: 4, layer: TEX['flame_' + ((Math.random() * 3) | 0)], rot: (Math.random() - 0.5) * 0.4, soft: 0.3 }, o)); }
function updateParticles(dt, world) {
  const L = G.particles; let j = 0;
  for (let i = 0; i < L.length; i++) {
    const p = L[i]; p.life -= dt; if (p.life <= 0) continue;
    p.vy -= p.grav * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
    if (p.wind) { p.vx += 0.25 * dt; }
    let nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
    if (p.collide && world) { const b = world.get(Math.floor(nx), Math.floor(ny), Math.floor(nz)); if (b > 0 && REG[b].solid) { if (p.vy < 0) { ny = Math.floor(ny) + 1.001; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; } else { p.vx *= -0.3; p.vz *= -0.3; nx = p.x; nz = p.z; } } }
    p.x = nx; p.y = ny; p.z = nz; p.size = Math.max(0.01, p.size + p.grow * dt); p.rot += p.vrot * dt;
    const t = p.life / p.max; p.aCur = p.a * (p.fade ? Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 6 + 0.2) : 1);
    if (p.cool) { const k = Math.min(1, (1 - t) * 1.6); p.g = lerp(p.g0, p.cg, k); p.b = lerp(p.b0, p.cb, k); p.r = lerp(p.r0, p.cr, k); p.emis = k > 0.55 ? 0 : 3.2 * (1 - k / 0.55) + 0.6; }
    L[j++] = p;
  }
  L.length = j;
}
function particleList() { return G.particles.map(p => ({ x: p.x, y: p.y, z: p.z, size: p.size, r: p.r * (p.light ? 0.3 + p.light[0] / 15 * 0.7 : 1), g: p.g * (p.light ? 0.3 + p.light[0] / 15 * 0.7 : 1), b: p.b * (p.light ? 0.3 + p.light[0] / 15 * 0.7 : 1), a: p.aCur ?? p.a, uv: p.uv, rot: p.rot, layer: p.layer, emis: p.emis, add: p.add, soft: p.soft || (p.uv ? 0 : 0.01) })); }
// ------------------------------------------------------------ EXPLOSIONES realistas
function explode(world, x, y, z, power, fire, source) {
  if (G.net && G.net.role === 'client') return;
  const broken = new Map();
  if (power > 0.5 && !(source && source.noGrief)) {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
      if (i !== 0 && i !== 15 && j !== 0 && j !== 15 && k !== 0 && k !== 15) continue;
      let dx = i / 15 * 2 - 1, dy = j / 15 * 2 - 1, dz = k / 15 * 2 - 1; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      let s = power * (0.7 + Math.random() * 0.6); let px = x, py = y, pz = z;
      while (s > 0) {
        const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz); const b = world.get(bx, by, bz);
        if (b > 0) { const d = REG[b]; s -= ((d.liquid ? 100 : d.blast) / 5 + 0.3) * 0.3 * (d.liquid ? 1 : 1); if (s > 0 && !d.liquid) broken.set(bx + ',' + by + ',' + bz, [bx, by, bz, b]); }
        else if (b < 0) break;
        px += dx * 0.3; py += dy * 0.3; pz += dz * 0.3; s -= 0.225;
      }
    }
  }
  let debris = 0; const q = SETTINGS.particles ?? 2;
  for (const [bx, by, bz, b] of broken.values()) {
    if (b === ID.tnt) { world.set(bx, by, bz, 0); const t = new Projectile('tnt', world.dim, bx + 0.5, by, bz + 0.5, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2); t.fuse = 10 + Math.random() * 20; t.grav = 20; t.w = 0.98; t.h = 0.98; G.entities.set(t.id, t); continue; }
    world.set(bx, by, bz, 0);
    if (Math.random() < 1 / power) dropBlockItems(world, bx, by, bz, b, null, true);
    if (debris < [8, 25, 60][q] && Math.random() < 0.6) {
      debris++; const d = REG[b]; const dir = [bx + 0.5 - x, by + 0.5 - y + 0.8, bz + 0.5 - z]; const l = Math.hypot(...dir) || 1; const sp = 6 + Math.random() * 10;
      const u = Math.random() * 0.5, v = Math.random() * 0.5;
      P_({ x: bx + 0.5, y: by + 0.5, z: bz + 0.5, vx: dir[0] / l * sp, vy: dir[1] / l * sp + 4, vz: dir[2] / l * sp, life: 2 + Math.random() * 2, size: 0.25 + Math.random() * 0.25, layer: d.faces ? d.faces[0] : 0, uv: [u, v, u + 0.5, v + 0.5], grav: 22, collide: true, fade: 0, rot: Math.random() * 6, vrot: (Math.random() - 0.5) * 12, light: [15, 0] });
    }
    if (fire && Math.random() < 0.33 && world.get(bx, by - 1, bz) > 0 && REG[world.get(bx, by - 1, bz)].solid) world.set(bx, by, bz, ID.fire);
  }
  // daño a entidades
  const rad = power * 2;
  for (const e of [...G.entities.values(), ...(G.player ? [G.player] : [])]) {
    if (e.dim !== world.dim || e.removed || e === source) continue;
    const dx = e.x - x, dy = e.y + e.h / 2 - y, dz = e.z - z; const d = Math.hypot(dx, dy, dz); if (d > rad) continue;
    const imp = (1 - d / rad); const dmg = Math.floor((imp * imp + imp) / 2 * 7 * rad + 1);
    const kl = d || 1; const kb = imp * 12;
    if (e.type === 'item') { if (Math.random() < 0.7) e.removed = true; continue; }
    if (e.type === 'end_crystal') { e.hp = 0; continue; }
    hurtEntity(e, dmg, source, dx / kl * kb, Math.max(4, dy / kl * kb + 4), dz / kl * kb, 'explosion');
  }
  explosionFX(world.dim, x, y, z, power);
  if (G.net && G.net.role === 'host') netBroadcast({ t: 'fx', k: 'boom', d: world.dim, x, y, z, p: power });
}
function explosionFX(dim, x, y, z, power) {
  playSound('explode', x, y, z, 1);
  if (!G.player || G.player.dim !== dim) return;
  const q = SETTINGS.particles ?? 2; const m = [0.35, 0.7, 1][q];
  const d = Math.hypot(G.player.x - x, G.player.y - y, G.player.z - z); G.shake = Math.max(G.shake, clamp(power * 2.5 / (d + 1), 0, 1.5));
  R.plights.push({ x, y: y + 1, z, r: power * 5, c: [3.5, 1.7, 0.6], life: 0.6, max: 0.6, kind: 'flash' });
  // bola de fuego central
  for (let i = 0; i < 70 * m * power / 4; i++) {
    const a = Math.random() * 6.28, b = Math.acos(Math.random() * 2 - 1), s = (1 + Math.random() * 3.5) * power / 4;
    const p = P_({ x: x + (Math.random() - 0.5), y: y + 0.5 + (Math.random() - 0.5), z: z + (Math.random() - 0.5), vx: Math.cos(a) * Math.sin(b) * s * 2, vy: Math.abs(Math.cos(b)) * s * 2 + 1.5, vz: Math.sin(a) * Math.sin(b) * s * 2, life: 0.7 + Math.random() * 0.8, size: (0.8 + Math.random() * 1.4) * power / 4 * 1.5, grow: 1.6 * power / 4, add: false, emis: 3.2, r: 1, g: 0.45 + Math.random() * 0.3, b: 0.12, a: 0.95, layer: TEX['smoke_' + ((Math.random() * 4) | 0)], rot: Math.random() * 6, vrot: (Math.random() - 0.5) * 2, drag: 2.2, soft: 1 });
    if (p) { p.cool = true; p.r0 = 1; p.g0 = p.g; p.b0 = 0.12; p.cr = 0.09; p.cg = 0.08; p.cb = 0.07; }
  }
  // columna de humo oscuro y espeso
  for (let i = 0; i < 55 * m * power / 4; i++) {
    const a = Math.random() * 6.28, r = Math.random() * power * 0.6;
    smoke(x + Math.cos(a) * r, y + Math.random() * power * 0.6, z + Math.sin(a) * r, { vx: Math.cos(a) * (1 + Math.random() * 3), vy: 1.5 + Math.random() * 3.5, vz: Math.sin(a) * (1 + Math.random() * 3), life: 3.5 + Math.random() * 4, size: (1.2 + Math.random() * 1.6) * power / 4 * 1.4, grow: 1.1, r: 0.11, g: 0.1, b: 0.095, a: 0.75, drag: 1.1, wind: true, soft: 1.5 });
  }
  // anillo de polvo a ras de suelo
  for (let i = 0; i < 30 * m; i++) { const a = i / (30 * m) * 6.28; smoke(x, y, z, { vx: Math.cos(a) * (6 + Math.random() * 4), vy: 0.3, vz: Math.sin(a) * (6 + Math.random() * 4), size: 0.9 * power / 4 + 0.5, grow: 1.4, r: 0.42, g: 0.37, b: 0.3, a: 0.5, life: 2 + Math.random(), drag: 2.5 }); }
  // chispas y brasas
  for (let i = 0; i < 90 * m; i++) { const a = Math.random() * 6.28, b = Math.random() * 3.14, s = 6 + Math.random() * 14; P_({ x, y: y + 0.5, z, vx: Math.cos(a) * Math.sin(b) * s, vy: Math.abs(Math.cos(b)) * s + 3, vz: Math.sin(a) * Math.sin(b) * s, life: 0.8 + Math.random() * 1.6, size: 0.06 + Math.random() * 0.08, add: true, emis: 8, r: 1, g: 0.7, b: 0.3, layer: TEX.ember, grav: 14, drag: 0.6, collide: true }); }
}
function fireFX(world, x, y, z, dt) {
  const q = SETTINGS.particles ?? 2; const k = [0.3, 0.7, 1][q];
  if (Math.random() < 6 * dt * k) flame(x + 0.2 + Math.random() * 0.6, y + 0.1 + Math.random() * 0.4, z + 0.2 + Math.random() * 0.6, { size: 0.45 + Math.random() * 0.4, vy: 1.2 + Math.random() });
  if (Math.random() < 2.8 * dt * k) smoke(x + 0.5, y + 0.9, z + 0.5, { r: 0.09, g: 0.085, b: 0.08, a: 0.6, size: 0.6 + Math.random() * 0.5, grow: 0.8, life: 3 + Math.random() * 3, vy: 1.6 + Math.random(), wind: true });
  if (Math.random() < 1.5 * dt * k) P_({ x: x + Math.random(), y: y + 0.5, z: z + Math.random(), vx: (Math.random() - 0.5), vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5), life: 1 + Math.random(), size: 0.05, add: true, emis: 8, r: 1, g: 0.6, b: 0.2, layer: TEX.ember, grav: -0.5, drag: 0.3 });
}
// ------------------------------------------------------------ daño
function hurtEntity(e, amount, attacker, kx = 0, ky = 0, kz = 0, cause) {
  if (e.dead || e.removed) return false;
  if (e === G.player) return G.player.damage(amount, cause, attacker, kx, ky, kz);
  if (e.remotePlayer) { netSendTo(e.conn, { t: 'hurt', a: amount, kx, ky, kz, c: cause }); return true; }
  if (e.proxy) { netSend({ t: 'atk', id: e.hostId || e.id, a: amount, kx, ky, kz }); e.hurtTime = 10; return true; }
  if (e.invul > 0 && cause !== 'explosion') return false;
  if (e.def && e.def.fireImmune && (cause === 'fire' || cause === 'lava')) return false;
  if (e.type === 'ender_dragon' && cause === 'explosion') amount *= 0.25;
  e.hp -= amount; e.hurtTime = 10; e.invul = 10;
  e.vx += kx; e.vy += ky; e.vz += kz;
  if (e.def) {
    if (e.def.ai === 'passive') e.panic = 60;
    if (attacker && (e.def.ai === 'neutral' || e.def.ai === 'enderman' || e.def.ai === 'golem' || e.def.ai === 'piglin' || e.def.hostile)) { e.target = attacker; e.angry = 600; }
    if (e.def.ai === 'neutral' && attacker) for (const o of G.entities.values()) if (o.type === e.type && Math.hypot(o.x - e.x, o.z - e.z) < 20) { o.target = attacker; o.angry = 600; }
    if (e.def.ai === 'enderman' && Math.random() < 0.6) endermanTeleport(e);
    playSound('hurt_mob', e.x, e.y, e.z, 0.6);
  }
  if (e.hp <= 0) { e.dead = true; e.deathTime = 0; e.killer = attacker; }
  return true;
}
function endermanTeleport(e) {
  const w = e.world; for (let t = 0; t < 16; t++) {
    const nx = Math.floor(e.x + (Math.random() - 0.5) * 32), nz = Math.floor(e.z + (Math.random() - 0.5) * 32); let ny = Math.floor(e.y + 8);
    for (; ny > Math.floor(e.y) - 16; ny--) { const b = w.get(nx, ny, nz); if (b > 0 && REG[b].solid && !REG[b].liquid) break; }
    if (w.get(nx, ny + 1, nz) === 0 && w.get(nx, ny + 2, nz) === 0 && w.get(nx, ny + 3, nz) === 0) { for (let i = 0; i < 20; i++) P_({ x: e.x + (Math.random() - 0.5), y: e.y + Math.random() * 3, z: e.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, life: 1, size: 0.12, layer: TEX.portal_p, add: true, emis: 3, r: 0.8, g: 0.3, b: 1 }); e.x = nx + 0.5; e.y = ny + 1; e.z = nz + 0.5; e.px = e.x; e.py = e.y; e.pz = e.z; playSound('portal', e.x, e.y, e.z, 0.5); return; }
  }
}
function mobDie(e) {
  if (e.dropped) return; e.dropped = true; const d = e.def;
  if (!d) return;
  for (const [name, a, b, cooked, ch] of d.drops) { if (ch !== undefined && Math.random() > ch) continue; const n = a + ((Math.random() * (b - a + 1)) | 0); if (n > 0) dropItem(e.dim, e.x, e.y + 0.5, e.z, { id: ID[(e.fire > 0 && cooked) ? cooked : name], c: n }); }
  if (e.type === 'sheep' && e.color && e.color[0] < 0.4) { /* oveja negra */ }
  for (let i = 0; i < 12; i++) smoke(e.x + (Math.random() - 0.5) * e.w, e.y + Math.random() * e.h, e.z + (Math.random() - 0.5) * e.w, { r: 0.75, g: 0.75, b: 0.75, a: 0.6, size: 0.3, life: 1, vy: 0.5 });
  if (e.type === 'ender_dragon') onDragonDeath(e);
}
// ------------------------------------------------------------ JUGADOR
class Player extends Entity {
  constructor(name) {
    super('player', 'overworld', 0, 100, 0); this.name = name; this.inv = new Array(36).fill(null); this.armor = [null, null, null, null]; this.offhand = null; this.ender = new Array(27).fill(null);
    this.sel = 0; this.food = 20; this.sat = 5; this.exh = 0; this.air = 300; this.spawn = null; this.flying = false; this.sprinting = false; this.sneaking = false;
    this.regenT = 0; this.starveT = 0; this.portalT = 0; this.portalCool = 0; this.eatT = 0; this.bowT = 0; this.gliding = false; this.xp = 0; this.level = 0; this.step = 0.6; this.swing = 0; this.lastHurt = 0;
    this.hp = this.maxHp = 20; this.w = 0.6; this.h = 1.8; this.effects = {};
  }
  get eye() { return this.y + (this.sneaking ? 1.27 : 1.62); }
  held() { return this.inv[this.sel]; }
  armorPts() { let p = 0; for (const a of this.armor) if (a) { const d = REG[a.id]; if (d.armor) p += d.armor.pts; } return p; }
  damage(amount, cause, attacker, kx = 0, ky = 0, kz = 0) {
    if (this.dead || G.gameMode === 'creative' || G.gameMode === 'spectator') { if (cause === 'void' && G.gameMode !== 'spectator') { } else return false; }
    if (this.invul > 0 && cause !== 'void' && cause !== 'starve' && cause !== 'drown') return false;
    if (cause !== 'void' && cause !== 'starve' && cause !== 'fall' && cause !== 'drown' && cause !== 'fire' && cause !== 'lava') {
      const pts = this.armorPts(); let tough = 0; for (const a of this.armor) if (a && REG[a.id].armor) tough += REG[a.id].armor.tough || 0;
      amount = amount * (1 - Math.min(20, Math.max(pts / 5, pts - amount / (2 + tough / 4))) / 25);
      for (let i = 0; i < 4; i++) if (this.armor[i]) damageItem(this.armor, i, 1);
    }
    if (cause === 'fall') { const b = this.armor[3]; }
    if (attacker && attacker.def && G.difficulty === 1) amount *= 0.5; if (attacker && attacker.def && G.difficulty === 3) amount *= 1.5;
    if (G.difficulty === 0 && attacker && attacker.def) return false;
    if (this.effects.resistance) amount *= 0.6;
    this.hp -= amount; this.invul = 10; this.hurtTime = 10; this.vx += kx; this.vy += ky; this.vz += kz; this.lastHurt = performance.now();
    this.exh += 0.1; playSound('hurt', this.x, this.y, this.z, 1); flashHurt();
    if (this.hp <= 0) {
      const tot = this.offhand && this.offhand.id === ID.totem ? 'off' : (this.held() && this.held().id === ID.totem ? 'main' : null);
      if (tot) { if (tot === 'off') this.offhand = null; else this.inv[this.sel] = null; this.hp = 1; this.effects.regen = 900; this.effects.absorb = 100; showTitle('', '¡El tótem te ha salvado!'); for (let i = 0; i < 60; i++) P_({ x: this.x, y: this.y + 1, z: this.z, vx: (Math.random() - 0.5) * 8, vy: Math.random() * 8, vz: (Math.random() - 0.5) * 8, life: 1.5, size: 0.15, layer: TEX.spark, add: true, emis: 4, r: Math.random() < 0.5 ? 1 : 0.4, g: 1, b: 0.3, grav: 6 }); updateHUD(); return true; }
      this.die(cause, attacker);
    }
    updateHUD(); return true;
  }
  die(cause, attacker) {
    this.dead = true; this.hp = 0;
    const msgs = { fall: 'cayó desde muy alto', lava: 'intentó nadar en lava', fire: 'ardió hasta morir', drown: 'se ahogó', starve: 'murió de hambre', explosion: 'voló por los aires', void: 'cayó al vacío', cactus: 'murió pinchado' };
    const msg = this.name + ' ' + (msgs[cause] || (attacker && attacker.type ? 'fue asesinado por ' + mobName(attacker.type) : 'murió'));
    if (G.gameMode === 'survival' && !G.keepInventory) { for (const arr of [this.inv, this.armor]) for (let i = 0; i < arr.length; i++) if (arr[i]) { dropItem(this.dim, this.x, this.y + 1, this.z, arr[i], (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4, 40); arr[i] = null; } }
    showDeath(msg); chatMsg(msg, '#ff8080'); if (G.net) netSend({ t: 'chat', m: msg, sys: true });
  }
}
function mobName(t) { return ({ zombie: 'Zombi', skeleton: 'Esqueleto', creeper: 'Creeper', spider: 'Araña', enderman: 'Enderman', blaze: 'Blaze', ghast: 'Ghast', ender_dragon: 'Ender Dragon', warden: 'Warden', pillager: 'Saqueador', vindicator: 'Vindicador', evoker: 'Invocador', guardian: 'Guardián', piglin: 'Piglin', zombified_piglin: 'Piglin zombificado', hoglin: 'Hoglin', wither_skeleton: 'Esqueleto wither', drowned: 'Ahogado', husk: 'Zombi momificado', magma_cube: 'Cubo de magma', shulker: 'Shulker', breeze: 'Breeze', cave_spider: 'Araña de cueva', silverfish: 'Lepisma', iron_golem: 'Gólem de hierro', player: 'Jugador' })[t] || t; }
function damageItem(arr, i, n) {
  const s = arr[i]; if (!s || G.gameMode === 'creative') return; const d = REG[s.id]; if (!d.dur) return;
  s.d = (s.d || 0) + n; if (s.d >= d.dur) { arr[i] = null; playSound('break_item', G.player.x, G.player.y, G.player.z, 0.8); }
}
// ------------------------------------------------------------ física del jugador
function updatePlayerPhysics(p, dt, input) {
  const w = p.world; if (!w) return;
  const creative = G.gameMode === 'creative', spectator = G.gameMode === 'spectator';
  const feet = blockAt(w, p.x, p.y + 0.1, p.z), mid = blockAt(w, p.x, p.y + 0.9, p.z), eyeB = blockAt(w, p.x, p.eye, p.z);
  const liq = b => b > 0 ? (REG[b].liquid || (REG[b].inWater ? 1 : 0)) : 0;
  p.inWater = liq(feet) === 1 || liq(mid) === 1; p.inLava = liq(feet) === 2 || liq(mid) === 2; p.eyeInWater = liq(eyeB) === 1; p.eyeInLava = liq(eyeB) === 2;
  const climb = entityInBlock(w, p, d => d.climb);
  const web = entityInBlock(w, p, d => d.slow);
  const below = blockAt(w, p.x, p.y - 0.05, p.z); const bd = below > 0 ? REG[below] : null;
  // dirección deseada
  let fx = 0, fz = 0; if (input.f) fz -= 1; if (input.b) fz += 1; if (input.l) fx -= 1; if (input.r) fx += 1;
  const len = Math.hypot(fx, fz); if (len) { fx /= len; fz /= len; }
  const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
  let wx = fx * c + fz * s, wz = -fx * s + fz * c;
  p.sneaking = input.sneak && !p.flying; p.sprinting = input.sprint && input.f && !p.sneaking && (p.food > 6 || creative) && !p.inWater;
  if (p.flying || spectator) {
    const sp = (p.sprinting ? 21.6 : 10.9) * (spectator ? 1.4 : 1);
    p.vx = lerp(p.vx, wx * sp, Math.min(1, dt * 8)); p.vz = lerp(p.vz, wz * sp, Math.min(1, dt * 8));
    p.vy = lerp(p.vy, (input.jump ? 8 : 0) - (input.sneak ? 8 : 0), Math.min(1, dt * 10));
    if (spectator) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; } else { moveEntity(w, p, p.vx * dt, p.vy * dt, p.vz * dt); if (p.onGround) p.flying = false; }
    p.fallDist = 0; return;
  }
  // élitros
  const elytra = p.armor[1] && p.armor[1].id === ID.elytra;
  if (p.gliding && (!elytra || p.onGround || p.inWater)) p.gliding = false;
  if (p.gliding) {
    const lx = -Math.sin(p.yaw) * Math.cos(p.pitch), ly = Math.sin(p.pitch), lz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    const sp = Math.hypot(p.vx, p.vy, p.vz); p.vy -= 16 * dt * (1 - Math.cos(p.pitch) * 0.75);
    const hs = Math.hypot(p.vx, p.vz); const tgt = Math.max(sp, 6);
    if (ly < 0) { p.vy += -ly * 0.1 * hs * dt * 20 * 0.05; }
    p.vx = lerp(p.vx, lx * tgt, dt * 1.6); p.vz = lerp(p.vz, lz * tgt, dt * 1.6); p.vy = lerp(p.vy, ly * tgt, dt * 0.6);
    if (p.boost > 0) { p.boost -= dt; p.vx += lx * 30 * dt; p.vy += ly * 30 * dt; p.vz += lz * 30 * dt; const m = Math.hypot(p.vx, p.vy, p.vz); if (m > 33) { p.vx *= 33 / m; p.vy *= 33 / m; p.vz *= 33 / m; } if (Math.random() < 0.6) smoke(p.x, p.y, p.z, { size: 0.3, life: 0.8, r: 0.8, g: 0.8, b: 0.8, a: 0.4 }); }
    const before = Math.hypot(p.vx, p.vz); moveEntity(w, p, p.vx * dt, p.vy * dt, p.vz * dt);
    if (p.hc && before > 10) p.damage((before - 10) * 0.5, 'fall');
    p.fallDist = 0; return;
  }
  let speed = p.sneaking ? 1.31 : p.sprinting ? 5.61 : 4.317; if (p.effects.speed) speed *= 1.4;
  if (input.useHeld) speed *= 0.2;
  if (web) speed *= 0.25; if (bd && bd.slowWalk) speed *= 0.45;
  if (p.inWater || p.inLava) {
    const sw = p.inLava ? 1.0 : (input.sprint && input.f ? 5.6 : 2.2);
    p.vx = lerp(p.vx, wx * sw, Math.min(1, dt * 5)); p.vz = lerp(p.vz, wz * sw, Math.min(1, dt * 5));
    if (p.inWater && input.sprint && input.f && p.eyeInWater) { const ly = Math.sin(p.pitch); p.vy = lerp(p.vy, ly * 5, dt * 4); }
    else { p.vy -= (p.inLava ? 6 : 4) * dt; if (input.jump) p.vy = lerp(p.vy, p.inLava ? 2 : 3.6, dt * 8); else if (input.sneak) p.vy = lerp(p.vy, -3, dt * 4); p.vy = Math.max(p.vy, -3.5); p.vy *= Math.exp(-2 * dt); }
    const fv = flowVec(w, Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z)); p.vx += fv[0] * 6 * dt; p.vz += fv[1] * 6 * dt;
    // salir del agua saltando bordes
    const before = p.hc; moveEntity(w, p, p.vx * dt, p.vy * dt, p.vz * dt); if (p.hc && input.jump) p.vy = 5.5;
    p.fallDist = 0;
  } else {
    const slip = bd && bd.slip; const accel = p.onGround ? (slip ? 1.5 : 14) : 2.5;
    p.vx = lerp(p.vx, wx * speed, Math.min(1, dt * accel)); p.vz = lerp(p.vz, wz * speed, Math.min(1, dt * accel));
    if (climb) {
      p.vy = Math.max(p.vy, -2.4); if (p.hc || input.jump) p.vy = 2.4; if (p.sneaking) p.vy = Math.max(p.vy, 0);
      p.fallDist = 0;
    }
    p.vy -= 32 * dt; if (web) p.vy = Math.max(p.vy, -1); p.vy = Math.max(p.vy, -78);
    if (input.jump && p.onGround && !p.jumpCool) { p.vy = p.effects.jump ? 11 : 9; if (p.sprinting) { p.vx += -Math.sin(p.yaw) * 2; p.vz += -Math.cos(p.yaw) * 2; } p.exh += p.sprinting ? 0.2 : 0.05; p.jumpCool = 0.1; if (bd && bd.sticky) p.vy = 4; }
    if (p.jumpCool) p.jumpCool = Math.max(0, p.jumpCool - dt);
    // agacharse: no caer por bordes
    let mx = p.vx * dt, mz = p.vz * dt;
    if (p.sneaking && p.onGround) {
      const supported = (x, z) => { const hw = p.w / 2 - 0.01; for (const [ax, az] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) { const b = w.get(Math.floor(x + ax), Math.floor(p.y - 0.6), Math.floor(z + az)); if (b !== 0 && (b < 0 || REG[b].solid)) return true; } return false; };
      if (!supported(p.x + mx, p.z)) mx = 0; if (!supported(p.x, p.z + mz)) mz = 0; if (!supported(p.x + mx, p.z + mz)) { mx = 0; mz = 0; }
    }
    const vyBefore = p.vy; const wasGround = p.onGround;
    moveEntity(w, p, mx, p.vy * dt, mz);
    if (p.vy < 0 || vyBefore < 0) p.fallDist += Math.max(0, -vyBefore * dt);
    if (p.onGround) {
      const land = blockAt(w, p.x, p.y - 0.05, p.z); const ld = land > 0 ? REG[land] : null;
      if (ld && ld.bouncy && !p.sneaking && vyBefore < -3) { p.vy = -vyBefore * 0.8; p.onGround = false; p.fallDist = 0; }
      else if (p.fallDist > 3.2) { let dmg = Math.floor(p.fallDist - 3); if (land === ID.hay_block) dmg = Math.floor(dmg * 0.2); if (ld && (ld.sticky || ld.bouncy)) dmg = 0; if (dmg > 0) { p.damage(dmg, 'fall'); playSound('fall', p.x, p.y, p.z, 1); blockParticles(w, Math.floor(p.x), Math.floor(p.y - 1), Math.floor(p.z), land, 10, 2); } }
      p.fallDist = 0;
      if (land === ID.snow && Math.random() < 0.06 && (Math.abs(p.vx) + Math.abs(p.vz)) > 1) { const sx = Math.floor(p.x), sy = Math.floor(p.y - 0.05), sz = Math.floor(p.z); const m = w.getMeta(sx, sy, sz); if (m > 2) { w.set(sx, sy, sz, ID.snow, m - 1); } }
    }
  }
  // distancia caminada para animación / sonidos
  const hd = Math.hypot(p.x - p.px, p.z - p.pz); p.walk += hd; p.walkAmt = lerp(p.walkAmt, Math.min(1, hd / dt / 4.3), Math.min(1, dt * 10));
  if (p.onGround && hd > 0) { p.stepAcc = (p.stepAcc || 0) + hd; if (p.stepAcc > 1.8) { p.stepAcc = 0; playSound('step', p.x, p.y, p.z, 0.25, below); if (p.sprinting) p.exh += 0.1 * 1.8; } }
  if (p.y < -64) p.damage(4, 'void');
}
// ------------------------------------------------------------ Tick de jugador (20 Hz)
function playerTick(p) {
  const w = p.world; if (!w || p.dead) return;
  if (p.invul > 0) p.invul--; if (p.hurtTime > 0) p.hurtTime--;
  for (const k in p.effects) { if (--p.effects[k] <= 0) delete p.effects[k]; }
  if (p.effects.regen && G.tick % 25 === 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1);
  if (p.effects.levitation) p.vy = 2;
  const survival = G.gameMode === 'survival' || G.gameMode === 'adventure';
  // aire
  if (p.eyeInWater && survival && !(p.armor[0] && p.armor[0].id === ID.turtle_helmet && p.air > 0 && G.tick % 2)) { p.air--; if (p.air <= -20) { p.air = 0; p.damage(2, 'drown'); } } else p.air = Math.min(300, p.air + 5);
  // fuego/lava
  if (p.inLava && survival) { p.fire = 300; if (G.tick % 10 === 0) p.damage(4, 'lava'); }
  const fireB = entityInBlock(w, p, d => d.id === ID.fire); if (fireB && survival) { p.fire = Math.max(p.fire, 160); if (G.tick % 10 === 0) p.damage(1, 'fire'); }
  if (p.fire > 0) { p.fire--; if (p.inWater) p.fire = 0; if (survival && G.tick % 20 === 0 && !p.inLava) p.damage(1, 'fire'); if (Math.random() < 0.5) flame(p.x + (Math.random() - 0.5) * 0.6, p.y + Math.random() * 1.6, p.z + (Math.random() - 0.5) * 0.6, { size: 0.35 }); }
  const hurtB = entityInBlock(w, p, d => d.id === ID.cactus); const under = blockAt(w, p.x, p.y - 0.1, p.z);
  if ((hurtB || (under === ID.magma_block && !p.sneaking)) && survival && G.tick % 10 === 0) p.damage(1, under === ID.magma_block ? 'fire' : 'cactus');
  if (!survival) { p.food = 20; p.air = 300; return; }
  // hambre
  if (p.exh >= 4) { p.exh -= 4; if (p.sat > 0) p.sat = Math.max(0, p.sat - 1); else if (G.difficulty > 0) p.food = Math.max(0, p.food - 1); }
  if (p.food >= 18 && p.hp < p.maxHp) { if (++p.regenT >= (p.food >= 20 && p.sat > 0 ? 10 : 80)) { p.regenT = 0; p.hp = Math.min(p.maxHp, p.hp + 1); p.exh += 6; } }
  else if (G.difficulty === 0 && p.hp < p.maxHp && G.tick % 20 === 0) p.hp++;
  if (p.food <= 0) { if (++p.starveT >= 80) { p.starveT = 0; if (p.hp > (G.difficulty >= 3 ? 0 : G.difficulty === 2 ? 1 : 10)) p.damage(1, 'starve'); } }
}
// ------------------------------------------------------------ IA y tick de entidades
function nearestPlayer(e, maxD) {
  let best = null, bd = maxD * maxD; for (const p of allPlayers()) { if (p.dim !== e.dim || p.dead || p.creative) continue; const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2 + (p.z - e.z) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
function allPlayers() { const a = []; if (G.player && !G.player.dead && G.gameMode !== 'creative' && G.gameMode !== 'spectator') a.push(G.player); for (const e of G.entities.values()) if (e.remotePlayer && !e.dead && !e.creative) a.push(e); return a; }
function lineOfSight(w, x0, y0, z0, x1, y1, z1) {
  const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0); const n = Math.ceil(d * 2);
  for (let i = 1; i < n; i++) { const t = i / n; const b = w.get(Math.floor(lerp(x0, x1, t)), Math.floor(lerp(y0, y1, t)), Math.floor(lerp(z0, z1, t))); if (b < 0 || (b > 0 && T_OPQ[b])) return false; }
  return true;
}
function faceTo(e, tx, tz, rate = 0.3) { const ty = Math.atan2(-(tx - e.x), -(tz - e.z)); let d = ty - e.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; e.yaw += d * rate; }
function walkTo(e, tx, tz, speed, dt) {
  const dx = tx - e.x, dz = tz - e.z; const l = Math.hypot(dx, dz); if (l < 0.3) { e.vx *= 0.5; e.vz *= 0.5; return; }
  faceTo(e, tx, tz); e.vx = lerp(e.vx, dx / l * speed, 0.3); e.vz = lerp(e.vz, dz / l * speed, 0.3);
}
function isDay() { const t = G.time % 24000; return t < 12500 || t > 23500; }
function entityTick(e, dt) {
  e.savePrev(); e.age++;
  const w = e.world; if (!w) { e.removed = true; return; }
  const cx = Math.floor(e.x) >> 4, cz = Math.floor(e.z) >> 4; if (!w.chunk(cx, cz)) return; // congelado fuera de zona cargada
  if (e.type === 'item') return itemTick(e, dt, w);
  if (e instanceof Projectile) return projTick(e, dt, w);
  if (!(e instanceof Mob)) return;
  const d = e.def;
  if (e.hurtTime > 0) e.hurtTime--; if (e.invul > 0) e.invul--;
  if (e.dead) { e.deathTime++; if (e.deathTime === 1) mobDie(e); if (e.deathTime > (e.type === 'ender_dragon' ? 100 : 20)) e.removed = true; if (e.type === 'ender_dragon') { e.y += 0.1; if (e.deathTime % 3 === 0) explosionFX(e.dim, e.x + (Math.random() - 0.5) * 8, e.y + Math.random() * 4, e.z + (Math.random() - 0.5) * 8, 2); } return; }
  // medio
  const feet = liquidAt(w, e.x, e.y + 0.2, e.z); e.inWater = feet === 1; e.inLava = feet === 2;
  if (e.inLava && !d.fireImmune) { e.fire = 300; if (e.age % 10 === 0) hurtEntity(e, 4, null, 0, 0, 0, 'lava'); }
  if (e.fire > 0) { e.fire--; if (e.inWater) e.fire = 0; if (e.age % 20 === 0 && !d.fireImmune) hurtEntity(e, 1, null, 0, 0, 0, 'fire'); if (Math.random() < 0.3) flame(e.x, e.y + Math.random() * e.h, e.z, { size: 0.3 }); }
  if (d.burns && w.dim === 'overworld' && isDay() && !e.inWater && (G.rainLevel || 0) < 0.5 && e.age % 20 === 0) { const L = w.light(Math.floor(e.x), Math.floor(e.y + e.h), Math.floor(e.z)); if (L[0] >= 15 && e.target !== null || L[0] >= 15) e.fire = Math.max(e.fire, 160); }
  // despawn
  if (d.hostile && !e.persist && !d.boss && e.type !== 'shulker') { const p = nearestPlayerAny(e); if (!p || Math.hypot(p.x - e.x, p.z - e.z) > 128) e.removed = true; else if (Math.hypot(p.x - e.x, p.z - e.z) > 40 && Math.random() < 1 / 800) e.removed = true; }
  if (d.hostile && G.difficulty === 0 && !d.boss) e.removed = true;
  if (e.cool > 0) e.cool--;
  const ai = d.ai; const sp = d.speed; e.ground = e.onGround;
  let tgt = null;
  if (d.hostile || e.angry > 0 || ai === 'golem') {
    if (e.angry > 0) e.angry--;
    tgt = e.target && !e.target.dead && !e.target.removed && e.target.dim === e.dim && (e.angry > 0 || d.hostile) ? e.target : null;
    if (tgt && Math.hypot(tgt.x - e.x, tgt.z - e.z) > 40) { tgt = null; e.target = null; }
    if (!tgt && d.hostile && ai !== 'piglin') { tgt = nearestPlayer(e, ai === 'ghast' ? 64 : ai === 'warden' ? 24 : 18); if (tgt && ai !== 'ghast' && ai !== 'guardian' && !lineOfSight(w, e.x, e.y + e.h * 0.85, e.z, tgt.x, tgt.y + 1.5, tgt.z) && Math.random() < 0.8) tgt = null; e.target = tgt; }
  }
  if (ai === 'piglin') { if (!tgt) { const p = nearestPlayer(e, 12); if (p && !(p.armor ? p.armor.some(a => a && REG[a.id].armor && REG[a.id].armor.mat === 'golden') : false)) { e.target = p; tgt = p; e.angry = 400; } } }
  if (ai === 'golem') { if (!tgt || tgt.type === 'player') { let best = null, bd = 256; for (const o of G.entities.values()) if (o instanceof Mob && o.def.hostile && !o.dead && o.dim === e.dim) { const dd = (o.x - e.x) ** 2 + (o.z - e.z) ** 2; if (dd < bd) { bd = dd; best = o; } } if (best) tgt = best; } }
  if (ai === 'enderman') {
    if (!tgt) { for (const p of allPlayers()) { if (p.dim !== e.dim) continue; const dx = e.x - p.x, dy = e.y + 2.6 - (p.eye || p.y + 1.6), dz = e.z - p.z; const l = Math.hypot(dx, dy, dz); if (l > 40) continue; const lx = -Math.sin(p.yaw) * Math.cos(p.pitch), ly = Math.sin(p.pitch), lz = -Math.cos(p.yaw) * Math.cos(p.pitch); if ((dx * lx + dy * ly + dz * lz) / l > 0.985 && lineOfSight(w, p.x, p.y + 1.6, p.z, e.x, e.y + 2.6, e.z)) { e.target = p; e.angry = 600; tgt = p; playSound('enderman', e.x, e.y, e.z, 1); } } }
    if (e.inWater || ((G.rainLevel || 0) > 0.5 && w.dim === 'overworld')) { if (e.age % 10 === 0) { hurtEntity(e, 1, null); endermanTeleport(e); } }
    if (Math.random() < 0.005) for (let i = 0; i < 2; i++) P_({ x: e.x + (Math.random() - 0.5), y: e.y + Math.random() * 3, z: e.z + (Math.random() - 0.5), vx: (Math.random() - 0.5), vy: -0.5, vz: (Math.random() - 0.5), life: 1.5, size: 0.08, layer: TEX.portal_p, add: true, emis: 3, r: 0.8, g: 0.3, b: 1 });
  }
  // comportamientos
  const dist = tgt ? Math.hypot(tgt.x - e.x, tgt.z - e.z) : 99, dy = tgt ? tgt.y - e.y : 0;
  if (ai === 'dragon') return dragonTick(e, dt, w);
  if (ai === 'crystal') { e.yaw += 0.05; if (e.hp <= 0 && !e.exploded) { e.exploded = true; e.removed = true; explode(w, e.x, e.y + 1, e.z, 6, true, e); } return; }
  if (ai === 'shulker') { e.vx = e.vz = 0; e.vy = 0; if (tgt && dist < 16 && e.cool <= 0) { e.cool = 40 + Math.random() * 40; shoot('shulker_bullet', e.dim, e.x, e.y + 0.6, e.z, 0, 0, 0, e, { target: tgt }); } e.open = tgt && dist < 16 ? Math.min(1, (e.open || 0) + 0.1) : Math.max(0, (e.open || 0) - 0.05); return; }
  if (ai === 'ghast' || ai === 'blaze') {
    if (!e.wander || e.age % 60 === 0) e.wander = [e.x + (Math.random() - 0.5) * 20, (tgt ? tgt.y + (ai === 'ghast' ? 8 : 2) : e.y) + (Math.random() - 0.5) * 4, e.z + (Math.random() - 0.5) * 20];
    const hov = ai === 'blaze' && tgt ? [tgt.x + Math.cos(e.age * 0.03) * 6, tgt.y + 2.5, tgt.z + Math.sin(e.age * 0.03) * 6] : e.wander;
    e.vx = lerp(e.vx, clamp(hov[0] - e.x, -1, 1) * sp, 0.05); e.vy = lerp(e.vy, clamp(hov[1] - e.y, -1, 1) * sp * 0.6, 0.05); e.vz = lerp(e.vz, clamp(hov[2] - e.z, -1, 1) * sp, 0.05);
    if (tgt) faceTo(e, tgt.x, tgt.z, 0.2);
    if (tgt && dist < (ai === 'ghast' ? 64 : 40) && e.cool <= 0 && lineOfSight(w, e.x, e.y + e.h / 2, e.z, tgt.x, tgt.y + 1, tgt.z)) {
      const dx = tgt.x - e.x, dy2 = tgt.y + 1 - (e.y + e.h / 2), dz = tgt.z - e.z; const l = Math.hypot(dx, dy2, dz);
      if (ai === 'ghast') { e.cool = 60 + Math.random() * 40; e.charge = 10; playSound('ghast', e.x, e.y, e.z, 1); shoot('fireball', e.dim, e.x + dx / l * 2.5, e.y + 2, e.z + dz / l * 2.5, dx / l * 16, dy2 / l * 16, dz / l * 16, e); }
      else { e.cool = 60; for (let i = 0; i < 3; i++) setTimeoutTick(i * 6, () => { if (!e.dead) shoot('small_fireball', e.dim, e.x, e.y + 1.4, e.z, dx / l * 18 + (Math.random() - 0.5) * 2, dy2 / l * 18, dz / l * 18 + (Math.random() - 0.5) * 2, e); }); }
    }
    if (ai === 'blaze' && Math.random() < 0.3) smoke(e.x, e.y + 0.5, e.z, { r: 0.1, g: 0.1, b: 0.1, size: 0.3, life: 1 });
    moveEntity(w, e, e.vx * dt, e.vy * dt, e.vz * dt); return;
  }
  if (ai === 'guardian') {
    if (!e.inWater) { e.vy -= 20 * dt; if (e.onGround && Math.random() < 0.1) { e.vy = 5; e.vx = (Math.random() - 0.5) * 3; e.vz = (Math.random() - 0.5) * 3; } moveEntity(w, e, e.vx * dt, e.vy * dt, e.vz * dt); return; }
    if (tgt && dist < 16) { faceTo(e, tgt.x, tgt.z, 0.3); e.vx *= 0.9; e.vz *= 0.9; e.vy *= 0.9; e.laser = (e.laser || 0) + 1; e.laserT = tgt; if (e.laser >= 50) { e.laser = 0; hurtEntity(tgt, d.dmg, e); } }
    else { e.laser = 0; e.laserT = null; if (!e.wander || e.age % 80 === 0) e.wander = [e.x + (Math.random() - 0.5) * 14, e.y + (Math.random() - 0.5) * 6, e.z + (Math.random() - 0.5) * 14]; e.vx = lerp(e.vx, clamp(e.wander[0] - e.x, -1, 1) * sp, 0.05); e.vy = lerp(e.vy, clamp(e.wander[1] - e.y, -1, 1) * sp * 0.5, 0.05); e.vz = lerp(e.vz, clamp(e.wander[2] - e.z, -1, 1) * sp, 0.05); faceTo(e, e.wander[0], e.wander[2], 0.1); }
    moveEntity(w, e, e.vx * dt, e.vy * dt, e.vz * dt); if (liquidAt(w, e.x, e.y + e.h, e.z) !== 1 && e.vy > 0) e.vy = 0; return;
  }
  // terrestres
  let moving = false;
  if (tgt && (ai === 'melee' || ai === 'neutral' || ai === 'enderman' || ai === 'golem' || ai === 'piglin' || ai === 'warden' || ai === 'slime' || ai === 'creeper' || ai === 'evoker' || ai === 'breeze')) {
    const reach = (e.w / 2 + 0.9) + (tgt.w || 0.6) / 2;
    if (ai === 'creeper') {
      if (dist < 3.2 && Math.abs(dy) < 3) { e.fuse++; if (e.fuse === 1) playSound('fuse', e.x, e.y, e.z, 1); e.vx *= 0.5; e.vz *= 0.5; if (e.fuse >= 30) { e.removed = true; explode(w, e.x, e.y + 0.8, e.z, 3, false, e); return; } }
      else { e.fuse = Math.max(0, e.fuse - 1); walkTo(e, tgt.x, tgt.z, sp, dt); moving = true; }
    } else if (ai === 'evoker') {
      if (dist < 10) { const ax = e.x - tgt.x, az = e.z - tgt.z; walkTo(e, e.x + ax, e.z + az, sp, dt); moving = true; } faceTo(e, tgt.x, tgt.z);
      if (e.cool <= 0 && dist < 16) { e.cool = 100; for (let i = 0; i < 8; i++) { const fx = lerp(e.x, tgt.x, i / 7), fz = lerp(e.z, tgt.z, i / 7); setTimeoutTick(i * 2, () => { for (let k = 0; k < 6; k++) P_({ x: fx + (Math.random() - 0.5), y: tgt.y + Math.random(), z: fz + (Math.random() - 0.5), vy: 3, life: 0.6, size: 0.2, layer: TEX.spark, add: true, emis: 3, r: 0.8, g: 0.8, b: 0.6, grav: 4 }); if (Math.hypot(tgt.x - fx, tgt.z - fz) < 1.2) hurtEntity(tgt, 6, e); }); } }
    } else if (ai === 'breeze') {
      faceTo(e, tgt.x, tgt.z); if (e.onGround && Math.random() < 0.04) { e.vy = 9; e.vx = (Math.random() - 0.5) * 8; e.vz = (Math.random() - 0.5) * 8; }
      if (e.cool <= 0 && dist < 20) { e.cool = 40; const dx = tgt.x - e.x, dy2 = tgt.y + 1 - e.y - 1.2, dz = tgt.z - e.z; const l = Math.hypot(dx, dy2, dz); shoot('wind_charge', e.dim, e.x, e.y + 1.2, e.z, dx / l * 14, dy2 / l * 14, dz / l * 14, e); }
    } else if (ai === 'slime') {
      if (e.onGround && e.cool <= 0) { e.cool = 20 + Math.random() * 20; faceTo(e, tgt.x, tgt.z, 1); const l = dist || 1; e.vx = (tgt.x - e.x) / l * 5; e.vz = (tgt.z - e.z) / l * 5; e.vy = 8; }
      if (dist < reach && Math.abs(dy) < 2 && e.age % 10 === 0) hurtEntity(tgt, d.dmg, e, (tgt.x - e.x) / (dist || 1) * 4, 3, (tgt.z - e.z) / (dist || 1) * 4);
    } else {
      if (ai === 'warden' && e.cool <= 0 && dist > 4 && dist < 15) { e.cool = 100; e.boom = 20; setTimeoutTick(20, () => { if (e.dead) return; const ttt = e.target; if (ttt && Math.hypot(ttt.x - e.x, ttt.z - e.z) < 16) { hurtEntity(ttt, 10, e, (ttt.x - e.x) * 0.8, 5, (ttt.z - e.z) * 0.8); for (let i = 0; i < 16; i++) { const t = i / 15; P_({ x: lerp(e.x, ttt.x, t), y: lerp(e.y + 2, ttt.y + 1, t), z: lerp(e.z, ttt.z, t), life: 0.6, size: 0.6 + t, grow: 2, layer: TEX.bubble_p, add: true, emis: 2, r: 0.3, g: 0.9, b: 1 }); } playSound('sonic', e.x, e.y, e.z, 1); } }); }
      if (dist > reach * 0.8) { walkTo(e, tgt.x, tgt.z, sp * (d.hostile && !isDay() ? 1.1 : 1), dt); moving = true; } else { faceTo(e, tgt.x, tgt.z); e.vx *= 0.6; e.vz *= 0.6; }
      if (dist < reach && Math.abs(dy) < 2.2 && e.cool <= 0) { e.cool = ai === 'warden' ? 30 : 20; e.swing = 6; const l = dist || 1; hurtEntity(tgt, d.dmg, e, (tgt.x - e.x) / l * (ai === 'golem' ? 2 : 5), ai === 'golem' ? 9 : ai === 'hoglin' ? 7 : 3, (tgt.z - e.z) / l * (ai === 'golem' ? 2 : 5)); if (e.type === 'cave_spider' && tgt.effects) tgt.effects.poison = 140; }
    }
    if (d.climb && e.hc) e.vy = 3;
  } else if (tgt && ai === 'ranged') {
    faceTo(e, tgt.x, tgt.z);
    if (dist > 12) { walkTo(e, tgt.x, tgt.z, sp, dt); moving = true; } else if (dist < 5) { walkTo(e, e.x - (tgt.x - e.x), e.z - (tgt.z - e.z), sp, dt); moving = true; } else { const sx = Math.cos(e.age * 0.05) * sp * 0.6; e.vx = lerp(e.vx, -Math.cos(e.yaw) * sx, 0.2); e.vz = lerp(e.vz, Math.sin(e.yaw) * sx, 0.2); moving = true; }
    if (e.cool <= 0 && dist < 16 && lineOfSight(w, e.x, e.y + 1.5, e.z, tgt.x, tgt.y + 1.5, tgt.z)) {
      e.cool = 40 + Math.random() * 20; const dx = tgt.x - e.x, dz = tgt.z - e.z, dyy = tgt.y + 1.2 - (e.y + 1.5); const l = Math.hypot(dx, dz);
      const v = 22; const a = shoot('arrow', e.dim, e.x + dx / l * 0.6, e.y + 1.5, e.z + dz / l * 0.6, dx / l * v + (Math.random() - 0.5) * 1.5, dyy / l * v + l * 0.55 + (Math.random() - 0.5), dz / l * v + (Math.random() - 0.5) * 1.5, e); if (a) a.dmg = d.dmg; playSound('bow', e.x, e.y, e.z, 0.8);
    }
  } else {
    // vagar
    if (e.panic > 0) { e.panic--; if (!e.wander || e.age % 20 === 0) e.wander = [e.x + (Math.random() - 0.5) * 16, e.z + (Math.random() - 0.5) * 16]; walkTo(e, e.wander[0], e.wander[1], sp * 1.6, dt); moving = true; }
    else {
      if (!e.wander && Math.random() < (ai === 'passive' ? 0.01 : 0.02)) e.wander = [e.x + (Math.random() - 0.5) * 14, e.z + (Math.random() - 0.5) * 14];
      if (e.wander) { walkTo(e, e.wander[0], e.wander[1], sp * 0.5, dt); moving = true; if (Math.hypot(e.wander[0] - e.x, e.wander[1] - e.z) < 0.6 || e.age % 200 === 0) e.wander = null; }
      else { e.vx *= 0.5; e.vz *= 0.5; if (Math.random() < 0.02) e.yaw += (Math.random() - 0.5); }
      // mirar al jugador cercano
      if (G.player && G.player.dim === e.dim && Math.hypot(G.player.x - e.x, G.player.z - e.z) < 6 && Math.random() < 0.3) e.headLook = Math.atan2(-(G.player.x - e.x), -(G.player.z - e.z));
    }
  }
  // físicas
  if (e.inWater || e.inLava) {
    if (d.swim) { if (tgt) e.vy = lerp(e.vy, clamp(tgt.y - e.y, -1, 1) * 2, 0.1); else e.vy *= 0.9; }
    else { e.vy = lerp(e.vy, 2.5, 0.2); }
    e.vx *= 0.8; e.vz *= 0.8;
    const fv = flowVec(w, Math.floor(e.x), Math.floor(e.y + 0.2), Math.floor(e.z)); e.vx += fv[0] * 0.3; e.vz += fv[1] * 0.3;
  } else if (!d.noGrav) e.vy -= 32 * dt;
  if (moving && e.hc && e.onGround) e.vy = 8.5;
  if (e.onGround) { e.vx *= 0.82; e.vz *= 0.82; }
  e.vy = Math.max(e.vy, -60);
  const vyB = e.vy; moveEntity(w, e, e.vx * dt, e.vy * dt, e.vz * dt);
  if (vyB < 0 && !e.onGround) e.fallDist += -vyB * dt;
  if (e.onGround) { if (e.fallDist > 3.5 && !d.climb && e.type !== 'chicken' && e.type !== 'cat') hurtEntity(e, Math.floor(e.fallDist - 3), null, 0, 0, 0, 'fall'); e.fallDist = 0; }
  if (e.type === 'chicken' && !e.onGround && e.vy < -2) e.vy = -2;
  const hd = Math.hypot(e.x - e.px, e.z - e.pz); e.walk += hd * 1.5; e.walkAmt = lerp(e.walkAmt, Math.min(1, hd / dt / 3), 0.3);
  if (e.y < -64) e.removed = true;
  if (e.swing > 0) e.swing--;
  if (Math.random() < 0.002) playSound('mob_' + e.type, e.x, e.y, e.z, 0.5);
}
function nearestPlayerAny(e) { let best = null, bd = 1e18; const list = [G.player, ...[...G.entities.values()].filter(o => o.remotePlayer)]; for (const p of list) { if (!p || p.dim !== e.dim) continue; const d = (p.x - e.x) ** 2 + (p.z - e.z) ** 2; if (d < bd) { bd = d; best = p; } } return best; }
const TICK_TIMERS = [];
function setTimeoutTick(n, fn) { TICK_TIMERS.push({ t: G.tick + n, fn }); }
function runTickTimers() { for (let i = TICK_TIMERS.length - 1; i >= 0; i--) if (TICK_TIMERS[i].t <= G.tick) { const f = TICK_TIMERS[i].fn; TICK_TIMERS.splice(i, 1); try { f(); } catch (err) { console.error(err); } } }
// ---------------------------------------------------------- objetos
function itemTick(e, dt, w) {
  if (e.pickup > 0) e.pickup--;
  const inW = liquidAt(w, e.x, e.y + 0.1, e.z);
  if (inW) { e.vy = lerp(e.vy, 1, 0.2); e.vx *= 0.9; e.vz *= 0.9; const fv = flowVec(w, Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)); e.vx += fv[0] * 0.5; e.vz += fv[1] * 0.5; if (inW === 2 && !(e.stack.id === ID.netherite_ingot || REG[e.stack.id].name.startsWith('netherite'))) { e.removed = true; smoke(e.x, e.y, e.z, { size: 0.3 }); return; } }
  else e.vy -= 20 * dt;
  if (e.onGround) { e.vx *= 0.6; e.vz *= 0.6; }
  // dentro de un bloque sólido: empujar arriba
  const b = blockAt(w, e.x, e.y + 0.1, e.z); if (b > 0 && T_FULL[b]) { e.y += 0.2; e.vy = 1; }
  moveEntity(w, e, e.vx * dt, e.vy * dt, e.vz * dt);
  if (e.age > 6000) e.removed = true;
  // fusionar
  if (e.age % 20 === 0) for (const o of G.entities.values()) { if (o === e || o.type !== 'item' || o.removed || o.dim !== e.dim) continue; if (o.stack.id === e.stack.id && !o.stack.d && !e.stack.d && Math.abs(o.x - e.x) < 1 && Math.abs(o.y - e.y) < 0.6 && Math.abs(o.z - e.z) < 1 && o.stack.c + e.stack.c <= REG[e.stack.id].stack) { e.stack.c += o.stack.c; o.removed = true; } }
  if (e.pickup > 0) return;
  // recoger
  const pls = [G.player, ...[...G.entities.values()].filter(o => o.remotePlayer)];
  for (const p of pls) {
    if (!p || p.dead || p.dim !== e.dim) continue; if (Math.abs(p.x - e.x) > 1.2 || Math.abs(p.z - e.z) > 1.2 || e.y < p.y - 0.6 || e.y > p.y + 2) continue;
    if (p === G.player) { const left = giveItem(p, e.stack); if (left < e.stack.c) { playSound('pop', e.x, e.y, e.z, 0.4); e.stack.c = left; if (left <= 0) e.removed = true; pickupAnim(e, p); } }
    else if (p.remotePlayer) { netSendTo(p.conn, { t: 'give', s: e.stack }); e.removed = true; }
    if (e.removed) break;
  }
}
function pickupAnim(e, p) { for (let i = 0; i < 3; i++) P_({ x: e.x, y: e.y + 0.2, z: e.z, vx: (p.x - e.x) * 4, vy: (p.y + 1 - e.y) * 4, vz: (p.z - e.z) * 4, life: 0.2, size: 0.12, layer: REG[e.stack.id].isBlock ? REG[e.stack.id].faces[0] : REG[e.stack.id].icon }); }
// ---------------------------------------------------------- proyectiles
function projTick(e, dt, w) {
  const t = e.type;
  if (t === 'tnt') { e.fuse--; e.vy -= 20 * dt; e.vx *= 0.95; e.vz *= 0.95; moveEntity(w, e, e.vx * dt, e.vy * dt, e.vz * dt); if (Math.random() < 0.6) smoke(e.x, e.y + 1, e.z, { size: 0.2, life: 0.8, r: 0.6, g: 0.6, b: 0.6, a: 0.5 }); if (e.fuse <= 0) { e.removed = true; explode(w, e.x, e.y + 0.5, e.z, 4, false, e); } return; }
  if (t === 'falling_block') { e.vy -= 25 * dt; e.vy = Math.max(e.vy, -40); moveEntity(w, e, 0, e.vy * dt, 0); if (e.onGround || e.age > 600) { e.removed = true; const bx = Math.floor(e.x), by = Math.floor(e.y + 0.1), bz = Math.floor(e.z); const cur = w.get(bx, by, bz); if (cur === 0 || (cur > 0 && REG[cur].replace)) w.set(bx, by, bz, e.block); else dropItem(e.dim, e.x, e.y, e.z, { id: e.block, c: 1 }); } return; }
  if (t === 'eye') { e.life = (e.life || 0) + 1; const dx = e.tx - e.x, dz = e.tz - e.z; const l = Math.hypot(dx, dz) || 1; e.vx = dx / l * 8; e.vz = dz / l * 8; e.vy = e.life < 20 ? 3 : -0.5; e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; P_({ x: e.x, y: e.y, z: e.z, life: 0.8, size: 0.1, layer: TEX.portal_p, add: true, emis: 3, r: 0.4, g: 1, b: 0.6 }); if (e.life > 50) { e.removed = true; if (Math.random() < 0.8) dropItem(e.dim, e.x, e.y, e.z, { id: ID.eye_of_ender, c: 1 }); else for (let i = 0; i < 12; i++) smoke(e.x, e.y, e.z, { size: 0.2, life: 1, r: 0.5, g: 0.8, b: 0.6 }); } return; }
  if (e.stuck) { e.stuckT = (e.stuckT || 0) + 1; if (e.stuckT > 1200) e.removed = true; if (t === 'arrow' && e.owner === G.player && G.player && Math.hypot(G.player.x - e.x, G.player.y + 1 - e.y, G.player.z - e.z) < 1.5 && e.pickable !== false) { if (G.gameMode !== 'creative') giveItem(G.player, { id: ID.arrow, c: 1 }); e.removed = true; playSound('pop', e.x, e.y, e.z, 0.4); } return; }
  if (t === 'shulker_bullet' && e.target) { const dx = e.target.x - e.x, dy = e.target.y + 1 - e.y, dz = e.target.z - e.z; const l = Math.hypot(dx, dy, dz) || 1; e.vx = lerp(e.vx, dx / l * 7, 0.08); e.vy = lerp(e.vy, dy / l * 7, 0.08); e.vz = lerp(e.vz, dz / l * 7, 0.08); P_({ x: e.x, y: e.y, z: e.z, life: 0.5, size: 0.1, layer: TEX.spark, add: true, emis: 2, r: 1, g: 1, b: 0.8 }); if (e.age > 300) e.removed = true; }
  if (t === 'fireball' || t === 'small_fireball') { flame(e.x, e.y, e.z, { size: t === 'fireball' ? 0.8 : 0.35, vy: 0.3, life: 0.3 }); if (Math.random() < 0.5) smoke(e.x, e.y, e.z, { size: 0.4, life: 1.2 }); if (e.age > 200) e.removed = true; }
  if (t === 'wind_charge') { P_({ x: e.x, y: e.y, z: e.z, life: 0.4, size: 0.4, grow: 1, layer: TEX.soft, r: 0.85, g: 0.9, b: 1, a: 0.4 }); if (e.age > 100) e.removed = true; }
  e.vy -= e.grav * dt; if (t === 'arrow' || t === 'trident') { e.yaw = Math.atan2(-e.vx, -e.vz); e.pitch = Math.atan2(e.vy, Math.hypot(e.vx, e.vz)); }
  const inW = liquidAt(w, e.x, e.y, e.z); if (inW === 1) { e.vx *= 0.95; e.vy *= 0.95; e.vz *= 0.95; if (t === 'fireball' || t === 'small_fireball') { e.removed = true; smoke(e.x, e.y, e.z); return; } }
  // colisión con entidades
  const steps = Math.ceil(Math.hypot(e.vx, e.vy, e.vz) * dt / 0.25) || 1;
  for (let s = 0; s < steps; s++) {
    const nx = e.x + e.vx * dt / steps, ny = e.y + e.vy * dt / steps, nz = e.z + e.vz * dt / steps;
    for (const o of [...G.entities.values(), G.player]) {
      if (!o || o === e || o === e.owner || o.removed || o.dead || o.dim !== e.dim || o.type === 'item' || o instanceof Projectile) continue;
      if (o === G.player && (G.gameMode === 'creative' || G.gameMode === 'spectator')) continue;
      const hw = o.w / 2 + 0.15; if (nx > o.x - hw && nx < o.x + hw && nz > o.z - hw && nz < o.z + hw && ny > o.y - 0.1 && ny < o.y + o.h + 0.1) { projHit(e, w, o, nx, ny, nz); return; }
    }
    const b = w.get(Math.floor(nx), Math.floor(ny), Math.floor(nz));
    if (b !== 0 && (b < 0 || (REG[b].solid && !REG[b].liquid))) { projHit(e, w, null, nx, ny, nz, b); return; }
    e.x = nx; e.y = ny; e.z = nz;
  }
  if (e.y < -70) e.removed = true;
}
function projHit(e, w, o, x, y, z, b) {
  const t = e.type; const sp = Math.hypot(e.vx, e.vy, e.vz);
  if (t === 'arrow' || t === 'trident') {
    if (o) { const dmg = e.dmg || Math.ceil(sp / 60 * 9 * (e.power || 1)) + (t === 'trident' ? 6 : 0); if (o.type === 'enderman') { endermanTeleport(o); return; } hurtEntity(o, dmg, e.owner, e.vx * 0.15, 3, e.vz * 0.15); if (e.flame) o.fire = 100; e.removed = true; if (t === 'trident' && e.owner === G.player) giveItem(G.player, { id: ID.trident, c: 1, d: e.itemD || 0 }); playSound('hit', x, y, z, 0.6); return; }
    e.stuck = true; e.x = x; e.y = y; e.z = z; playSound('arrow_hit', x, y, z, 0.5); if (b === ID.target) chatMsg('¡Diana!', '#ffd'); if (t === 'trident' && e.owner === G.player) { e.removed = true; giveItem(G.player, { id: ID.trident, c: 1, d: e.itemD || 0 }); } return;
  }
  e.removed = true;
  if (t === 'fireball') { explode(w, x, y, z, 1, true, e); return; }
  if (t === 'small_fireball') { if (o) { hurtEntity(o, 5, e.owner); o.fire = 100; } else { const fx = Math.floor(x - e.vx * 0.01), fy = Math.floor(y - e.vy * 0.02), fz = Math.floor(z - e.vz * 0.01); if (w.get(fx, fy, fz) === 0) w.set(fx, fy, fz, ID.fire); } for (let i = 0; i < 6; i++) flame(x, y, z, { size: 0.3, vy: 1 }); return; }
  if (t === 'pearl') { const ow = e.owner; for (let i = 0; i < 24; i++) P_({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 1, size: 0.1, layer: TEX.portal_p, add: true, emis: 3, r: 0.6, g: 0.3, b: 1 }); if (ow === G.player) { ow.x = x; ow.y = y + 0.2; ow.z = z; ow.vy = 0; ow.fallDist = 0; ow.damage(5, 'fall'); playSound('portal', x, y, z, 0.6); } else if (ow && ow.remotePlayer) netSendTo(ow.conn, { t: 'tp', x, y: y + 0.2, z }); return; }
  if (t === 'snowball') { if (o) hurtEntity(o, o.type === 'blaze' ? 3 : 0.01, e.owner, e.vx * 0.1, 2, e.vz * 0.1); for (let i = 0; i < 8; i++) P_({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 0.6, size: 0.1, layer: TEX.snow, grav: 10 }); return; }
  if (t === 'wind_charge') { for (const p of [G.player, ...G.entities.values()]) { if (!p || p.dim !== e.dim || p.removed || p instanceof Projectile) continue; const d = Math.hypot(p.x - x, p.y - y, p.z - z); if (d < 3) { const k = (3 - d) * 4; if (p === G.player) { p.vx += (p.x - x) / (d || 1) * k; p.vy += 8; p.vz += (p.z - z) / (d || 1) * k; p.damage(1, 'explosion', e.owner); } else { p.vx += (p.x - x) * k; p.vy += 6; p.vz += (p.z - z) * k; } } } for (let i = 0; i < 20; i++) P_({ x, y, z, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, vz: (Math.random() - 0.5) * 8, life: 0.5, size: 0.4, grow: 2, layer: TEX.soft, r: 0.85, g: 0.9, b: 1, a: 0.4, drag: 3 }); return; }
  if (t === 'shulker_bullet') { if (o) { hurtEntity(o, 4, e.owner); if (o === G.player) o.effects.levitation = 40; } return; }
}
// ------------------------------------------------------------ dragón
function dragonTick(e, dt, w) {
  e.ang = (e.ang || 0) + dt * 0.35; const pl = nearestPlayer(e, 150);
  if (!e.phaseT) e.phaseT = 0; e.phaseT++;
  let tx, ty, tz;
  if (e.phase === 'charge' && pl) { tx = pl.x; ty = pl.y + 1; tz = pl.z; if (e.phaseT > 120 || Math.hypot(tx - e.x, tz - e.z) < 3) { e.phase = 'circle'; e.phaseT = 0; } }
  else if (e.phase === 'perch') { tx = 0; ty = (w.surfaceY(0, 0) || 64) + 3; tz = 0; if (e.phaseT > 200) { e.phase = 'circle'; e.phaseT = 0; } if (pl && e.phaseT % 30 === 0) { for (let i = 0; i < 30; i++) P_({ x: pl.x + (Math.random() - 0.5) * 4, y: pl.y + 0.3, z: pl.z + (Math.random() - 0.5) * 4, vy: 0.4, life: 3, size: 0.8, grow: 0.3, layer: TEX.soft, r: 0.8, g: 0.2, b: 0.9, a: 0.35, add: true, emis: 2 }); setTimeoutTick(20, () => { if (pl.dim === 'end' && Math.hypot(pl.x - tx, pl.z - tz) < 40) hurtEntity(pl, 3, e, 0, 0, 0, 'magic'); }); } }
  else { tx = Math.cos(e.ang) * 50; tz = Math.sin(e.ang) * 50; ty = 85 + Math.sin(e.ang * 2) * 8; if (e.phaseT > 300 && pl) { e.phase = Math.random() < 0.65 ? 'charge' : 'perch'; e.phaseT = 0; } }
  const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z; const l = Math.hypot(dx, dy, dz) || 1; const sp = e.phase === 'charge' ? 18 : 12;
  e.vx = lerp(e.vx, dx / l * sp, 0.04); e.vy = lerp(e.vy, dy / l * sp, 0.04); e.vz = lerp(e.vz, dz / l * sp, 0.04);
  e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; e.yaw = Math.atan2(-e.vx, -e.vz); e.walk += dt * 3;
  // destruye bloques no resistentes al atravesarlos
  if (e.age % 2 === 0) for (let x = -3; x <= 3; x++) for (let y = 0; y <= 3; y++) for (let z = -3; z <= 3; z++) { const b = w.get(Math.floor(e.x + x), Math.floor(e.y + y), Math.floor(e.z + z)); if (b > 0 && ![ID.end_stone, ID.obsidian, ID.bedrock, ID.iron_bars, ID.end_portal, ID.end_stone_bricks].includes(b)) w.set(Math.floor(e.x + x), Math.floor(e.y + y), Math.floor(e.z + z), 0); }
  for (const p of allPlayers()) if (p.dim === 'end' && Math.abs(p.x - e.x) < 4 && Math.abs(p.z - e.z) < 4 && p.y > e.y - 2 && p.y < e.y + 4 && e.cool <= 0) { e.cool = 20; hurtEntity(p, MOB.ender_dragon.dmg, e, (p.x - e.x) * 2, 8, (p.z - e.z) * 2); }
  // cristales curan
  e.healBeam = null; for (const c of G.entities.values()) if (c.type === 'end_crystal' && !c.removed && c.dim === 'end' && Math.hypot(c.x - e.x, c.y - e.y, c.z - e.z) < 40) { e.healBeam = c; if (e.age % 10 === 0) e.hp = Math.min(e.maxHp, e.hp + 1); break; }
  if (e.cool > 0) e.cool--;
}
function onDragonDeath(e) {
  G.dragonKilled = true; const w = G.worlds.end; let y = 60; for (let yy = 100; yy > 20; yy--) { const b = w.get(0, yy, 0); if (b === ID.end_stone) { y = yy + 1; break; } }
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) { const d = Math.hypot(dx, dz); if (d > 4.5) continue; w.set(dx, y - 1, dz, ID.bedrock); if (d < 3.3) w.set(dx, y, dz, ID.end_portal); else w.set(dx, y, dz, ID.bedrock); }
  for (let k = 0; k < 4; k++) w.set(0, y + k, 0, ID.bedrock); w.set(0, y + 4, 0, ID.dragon_egg);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) w.set(dx, y + 2, dz, ID.torch, 0);
  // acceso a las islas exteriores
  const ga = Math.random() * 6.28; const gx = Math.round(Math.cos(ga) * 96), gz = Math.round(Math.sin(ga) * 96); w.set(gx, 75, gz, ID.end_gateway); G.gateway = [gx, 75, gz];
  showTitle('¡Victoria!', 'Has derrotado al Ender Dragon'); chatMsg('El Ender Dragon ha sido derrotado. ¡El portal de salida está abierto!', '#e0a0ff');
  for (const p of allPlayers()) if (p === G.player) { G.player.xp += 12000; }
}
function initEnd() {
  if (G.endInit) return; G.endInit = true;
  const w = G.worlds.end; for (const p of endPillars(w.seed)) { const c = spawnMob('end_crystal', 'end', p.x + 0.5, p.h + 2, p.z + 0.5); }
  if (!G.dragonKilled) { const d = spawnMob('ender_dragon', 'end', 0, 90, 40); }
}
