// ============================================================================
//  Lógica de juego: recetas, interacción, fluidos, portales, ticks, spawns, comandos
// ============================================================================
// ------------------------------------------------------------ RECETAS
const TAGS = {
  '#planks': REG.filter(d => d && d.planks).map(d => d.id),
  '#stone': [ID.cobblestone, ID.cobbled_deepslate, ID.blackstone],
  '#coal': [ID.coal, ID.charcoal], '#wool': REG.filter(d => d && d.name.endsWith('_wool')).map(d => d.id),
  '#sand': [ID.sand, ID.red_sand], '#logs': REG.filter(d => d && d.log).map(d => d.id), '#soul': [ID.soul_sand, ID.soul_soil],
};
const RECIPES = [];
function shaped(res, n, rows, keys) { RECIPES.push({ res, n, rows, keys }); }
function shapeless(res, n, ings) { RECIPES.push({ res, n, ings }); }
function ingMatch(k, id) { if (k === undefined || k === null) return id === null; if (id === null) return false; if (k[0] === '#') return TAGS[k].includes(id); return ID[k] === id; }
// troncos -> tablones
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry']) shapeless(w + '_planks', 4, [w + '_log']);
shapeless('crimson_planks', 4, ['crimson_stem']); shapeless('warped_planks', 4, ['warped_stem']);
shaped('stick', 4, ['P', 'P'], { P: '#planks' });
shaped('crafting_table', 1, ['PP', 'PP'], { P: '#planks' });
shaped('furnace', 1, ['SSS', 'S S', 'SSS'], { S: '#stone' });
shaped('chest', 1, ['PPP', 'P P', 'PPP'], { P: '#planks' });
shaped('barrel', 1, ['PSP', 'P P', 'PSP'], { P: '#planks', S: 'oak_slab' });
shaped('torch', 4, ['C', 'S'], { C: '#coal', S: 'stick' });
shaped('soul_torch', 4, ['C', 'S', 'X'], { C: '#coal', S: 'stick', X: '#soul' });
shaped('redstone_torch', 1, ['R', 'S'], { R: 'redstone', S: 'stick' });
const TMAT = { wooden: '#planks', stone: '#stone', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };
for (const m in TMAT) {
  const k = { M: TMAT[m], S: 'stick' };
  shaped(m + '_pickaxe', 1, ['MMM', ' S ', ' S '], k); shaped(m + '_axe', 1, ['MM', 'MS', ' S'], k); shaped(m + '_shovel', 1, ['M', 'S', 'S'], k); shaped(m + '_sword', 1, ['M', 'M', 'S'], k); shaped(m + '_hoe', 1, ['MM', ' S', ' S'], k);
}
const AMAT = { leather: 'leather', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };
for (const m in AMAT) { const k = { M: AMAT[m] }; shaped(m + '_helmet', 1, ['MMM', 'M M'], k); shaped(m + '_chestplate', 1, ['M M', 'MMM', 'MMM'], k); shaped(m + '_leggings', 1, ['MMM', 'M M', 'M M'], k); shaped(m + '_boots', 1, ['M M', 'M M'], k); }
shapeless('netherite_ingot', 1, ['netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot']);
for (const [blk, it] of [['iron_block', 'iron_ingot'], ['gold_block', 'gold_ingot'], ['diamond_block', 'diamond'], ['emerald_block', 'emerald'], ['netherite_block', 'netherite_ingot'], ['coal_block', 'coal'], ['lapis_block', 'lapis_lazuli'], ['redstone_block', 'redstone'], ['copper_block', 'copper_ingot'], ['raw_iron_block', 'raw_iron'], ['raw_gold_block', 'raw_gold'], ['hay_block', 'wheat']]) { shaped(blk, 1, ['XXX', 'XXX', 'XXX'], { X: it }); shapeless(it, 9, [blk]); }
shaped('gold_ingot', 1, ['NNN', 'NNN', 'NNN'], { N: 'gold_nugget' }); shapeless('gold_nugget', 9, ['gold_ingot']);
shaped('iron_ingot', 1, ['NNN', 'NNN', 'NNN'], { N: 'iron_nugget' }); shapeless('iron_nugget', 9, ['iron_ingot']);
shaped('bucket', 1, ['I I', ' I '], { I: 'iron_ingot' }); shapeless('flint_and_steel', 1, ['iron_ingot', 'flint']);
shaped('fire_extinguisher', 1, ['INI', 'I I', 'INI'], { I: 'iron_ingot', N: 'iron_nugget' });
shaped('shears', 1, [' I', 'I '], { I: 'iron_ingot' }); shaped('compass', 1, [' I ', 'IRI', ' I '], { I: 'iron_ingot', R: 'redstone' }); shaped('clock', 1, [' G ', 'GRG', ' G '], { G: 'gold_ingot', R: 'redstone' });
shaped('bow', 1, [' TS', 'T S', ' TS'], { T: 'stick', S: 'string' }); shaped('arrow', 4, ['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' });
shaped('crossbow', 1, ['STS', 'TIT', ' S '], { S: 'stick', T: 'string', I: 'iron_ingot' });
shaped('shield', 1, ['PIP', 'PPP', ' P '], { P: '#planks', I: 'iron_ingot' });
shaped('fishing_rod', 1, ['  S', ' ST', 'S T'], { S: 'stick', T: 'string' });
shaped('bed', 1, ['WWW', 'PPP'], { W: '#wool', P: '#planks' });
shaped('glass_bottle', 3, ['G G', ' G '], { G: 'glass' });
shaped('tnt', 1, ['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: '#sand' });
shaped('stone_bricks', 4, ['SS', 'SS'], { S: 'stone' }); shaped('bricks', 1, ['BB', 'BB'], { B: 'brick' }); shaped('sandstone', 1, ['SS', 'SS'], { S: 'sand' });
shaped('chiseled_stone_bricks', 1, ['S', 'S'], { S: 'stone_slab' }); shaped('cut_sandstone', 4, ['SS', 'SS'], { S: 'sandstone' });
shaped('mossy_cobblestone', 1, ['CV'], { C: 'cobblestone', V: 'vine' }); shaped('mossy_stone_bricks', 1, ['CV'], { C: 'stone_bricks', V: 'vine' });
shaped('deepslate_bricks', 4, ['SS', 'SS'], { S: 'cobbled_deepslate' }); shaped('deepslate_tiles', 4, ['SS', 'SS'], { S: 'deepslate_bricks' });
shaped('polished_blackstone_bricks', 4, ['SS', 'SS'], { S: 'blackstone' }); shaped('end_stone_bricks', 4, ['SS', 'SS'], { S: 'end_stone' }); shaped('mud_bricks', 4, ['SS', 'SS'], { S: 'mud' });
shaped('tuff_bricks', 4, ['SS', 'SS'], { S: 'polished_tuff' }); shaped('polished_tuff', 4, ['SS', 'SS'], { S: 'tuff' });
shaped('cut_copper', 4, ['SS', 'SS'], { S: 'copper_block' }); shaped('lightning_rod', 1, ['C', 'C', 'C'], { C: 'copper_ingot' }); shaped('spyglass', 1, ['A', 'C', 'C'], { A: 'amethyst_shard', C: 'copper_ingot' });
shaped('amethyst_block', 1, ['AA', 'AA'], { A: 'amethyst_shard' }); shaped('quartz_block', 1, ['QQ', 'QQ'], { Q: 'quartz' });
shaped('ladder', 3, ['S S', 'SSS', 'S S'], { S: 'stick' }); shaped('oak_fence', 3, ['PSP', 'PSP'], { P: 'oak_planks', S: 'stick' }); shaped('cobblestone_wall', 6, ['CCC', 'CCC'], { C: 'cobblestone' });
shaped('stone_slab', 6, ['SSS'], { S: 'smooth_stone' }); shaped('oak_slab', 6, ['PPP'], { P: 'oak_planks' });
shaped('bookshelf', 1, ['PPP', 'BBB', 'PPP'], { P: '#planks', B: 'book' }); shapeless('book', 1, ['paper', 'paper', 'paper', 'leather']); shaped('paper', 3, ['CCC'], { C: 'sugar_cane_item' }); shapeless('sugar', 1, ['sugar_cane_item']);
shaped('golden_apple', 1, ['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' }); shaped('golden_carrot', 1, ['NNN', 'NCN', 'NNN'], { N: 'gold_nugget', C: 'carrot' });
shaped('bread', 1, ['WWW'], { W: 'wheat' }); shaped('cookie', 8, ['WSW'], { W: 'wheat', S: 'sugar' }); shapeless('pumpkin_pie', 1, ['pumpkin', 'sugar', 'wheat']);
shapeless('mushroom_stew', 1, ['brown_mushroom', 'red_mushroom']);
shapeless('eye_of_ender', 1, ['ender_pearl', 'blaze_powder']); shapeless('blaze_powder', 2, ['blaze_rod']); shapeless('magma_cream', 1, ['slime_ball', 'blaze_powder']);
shapeless('fermented_spider_eye', 1, ['spider_eye', 'brown_mushroom', 'sugar']);
shaped('ender_chest', 1, ['OOO', 'OEO', 'OOO'], { O: 'obsidian', E: 'eye_of_ender' });
shaped('enchanting_table', 1, [' B ', 'DOD', 'OOO'], { B: 'book', D: 'diamond', O: 'obsidian' });
shaped('anvil', 1, ['BBB', ' I ', 'III'], { B: 'iron_block', I: 'iron_ingot' });
shaped('smithing_table', 1, ['II', 'PP', 'PP'], { I: 'iron_ingot', P: '#planks' });
shaped('blast_furnace', 1, ['III', 'IFI', 'SSS'], { I: 'iron_ingot', F: 'furnace', S: 'smooth_stone' }); shaped('smoker', 1, [' L ', 'LFL', ' L '], { L: '#logs', F: 'furnace' });
shaped('lantern', 1, ['NNN', 'NTN', 'NNN'], { N: 'iron_nugget', T: 'torch' }); shaped('soul_lantern', 1, ['NNN', 'NTN', 'NNN'], { N: 'iron_nugget', T: 'soul_torch' });
shaped('glowstone', 1, ['DD', 'DD'], { D: 'glowstone_dust' }); shaped('snow_block', 1, ['SS', 'SS'], { S: 'snowball' }); shaped('snow', 6, ['SSS'], { S: 'snow_block' });
shapeless('jack_o_lantern', 1, ['pumpkin', 'torch']); shaped('white_wool', 1, ['SS', 'SS'], { S: 'string' });
shaped('note_block', 1, ['PPP', 'PRP', 'PPP'], { P: '#planks', R: 'redstone' }); shaped('redstone_lamp', 1, [' R ', 'RGR', ' R '], { R: 'redstone', G: 'glowstone' });
shaped('target', 1, [' R ', 'RHR', ' R '], { R: 'redstone', H: 'hay_block' }); shaped('daylight_detector', 1, ['GGG', 'QQQ', 'SSS'], { G: 'glass', Q: 'quartz', S: 'oak_slab' });
shaped('lever', 1, ['S', 'C'], { S: 'stick', C: 'cobblestone' }); shapeless('stone_button', 1, ['stone']); shaped('stone_pressure_plate', 1, ['SS'], { S: 'stone' });
shapeless('bone_meal', 3, ['bone']); shapeless('firework_rocket', 3, ['paper', 'gunpowder']);
shaped('map', 1, ['PPP', 'PCP', 'PPP'], { P: 'paper', C: 'compass' }); shaped('brush', 1, ['F', 'C', 'S'], { F: 'feather', C: 'copper_ingot', S: 'stick' });
shaped('slime_block', 1, ['SSS', 'SSS', 'SSS'], { S: 'slime_ball' }); shapeless('slime_ball', 9, ['slime_block']);
shaped('honey_block', 1, ['HH', 'HH'], { H: 'honeycomb' }); shaped('honeycomb_block', 1, ['HH', 'HH'], { H: 'honeycomb' });
shaped('scaffolding', 6, ['SSS', 'S S', 'S S'], { S: 'stick' });
shaped('iron_bars', 16, ['III', 'III'], { I: 'iron_ingot' }); shaped('rail', 16, ['I I', 'ISI', 'I I'], { I: 'iron_ingot', S: 'stick' });
shaped('mace', 1, ['H', 'B'], { H: 'heavy_core', B: 'breeze_rod' }); shaped('lead', 2, ['SS ', 'SB ', '  S'], { S: 'string', B: 'slime_ball' });
shapeless('glow_ink_sac', 1, ['ink_sac', 'glowstone_dust']);
shaped('sea_lantern', 1, ['SPS', 'PPP', 'SPS'], { S: 'prismarine_shard', P: 'prismarine_shard' }); shaped('prismarine', 1, ['SS', 'SS'], { S: 'prismarine_shard' });
shaped('purpur_block', 4, ['CC', 'CC'], { C: 'chorus_fruit' }); shaped('purpur_pillar', 1, ['P', 'P'], { P: 'purpur_block' });
shaped('netherite_upgrade', 2, ['DND', 'DSD', 'DDD'], { D: 'diamond', N: 'netherite_upgrade', S: 'netherrack' });
const STAIR_MAT = { oak: 'oak_planks', spruce: 'spruce_planks', birch: 'birch_planks', dark_oak: 'dark_oak_planks', jungle: 'jungle_planks', acacia: 'acacia_planks', cherry: 'cherry_planks', cobblestone: 'cobblestone', stone_brick: 'stone_bricks', sandstone: 'sandstone', brick: 'bricks', nether_brick: 'nether_bricks', blackstone: 'polished_blackstone_bricks', deepslate_brick: 'deepslate_bricks', purpur: 'purpur_block', mud_brick: 'mud_bricks' };
for (const k in STAIR_MAT) shaped(k + '_stairs', 4, ['X  ', 'XX ', 'XXX'], { X: STAIR_MAT[k] });
for (const k of ['oak', 'spruce', 'birch', 'dark_oak']) { shaped(k + '_door', 3, ['XX', 'XX', 'XX'], { X: k + '_planks' }); shaped(k + '_trapdoor', 2, ['XXX', 'XXX'], { X: k + '_planks' }); }
shaped('iron_door', 3, ['XX', 'XX', 'XX'], { X: 'iron_ingot' }); shaped('iron_trapdoor', 1, ['XX', 'XX'], { X: 'iron_ingot' });
shaped('glass_pane', 16, ['GGG', 'GGG'], { G: 'glass' }); shaped('oak_fence_gate', 1, ['SPS', 'SPS'], { S: 'stick', P: 'oak_planks' });
shaped('campfire', 1, [' S ', 'SCS', 'LLL'], { S: 'stick', C: '#coal', L: '#logs' });
shapeless('beetroot_soup', 1, ['beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot']);
function matchRecipe(grid, w) {
  // grid: array w*w de ids o null
  let minX = w, minY = w, maxX = -1, maxY = -1; const ids = [];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const s = grid[y * w + x]; if (s) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); ids.push(s.id); } }
  if (maxX < 0) return null; const gw = maxX - minX + 1, gh = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.ings) { if (r.ings.length !== ids.length) continue; const pool = ids.slice(); let ok = true; for (const k of r.ings) { const i = pool.findIndex(id => ingMatch(k, id)); if (i < 0) { ok = false; break; } pool.splice(i, 1); } if (ok) return r; continue; }
    const rh = r.rows.length, rw = Math.max(...r.rows.map(s => s.length)); if (rw !== gw || rh !== gh) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < gh && ok; y++) for (let x = 0; x < gw && ok; x++) { const ch = (r.rows[y][mirror ? gw - 1 - x : x] || ' '); const s = grid[(y + minY) * w + x + minX]; if (ch === ' ') { if (s) ok = false; } else if (!s || !ingMatch(r.keys[ch], s.id)) ok = false; }
      if (ok) return r;
    }
  }
  return null;
}
const SMELT = {};
function smelt(a, b, kind) { for (const x of [].concat(a)) SMELT[ID[x]] = { out: ID[b], kind }; }
smelt(['raw_iron', 'iron_ore', 'deepslate_iron_ore'], 'iron_ingot', 'ore'); smelt(['raw_gold', 'gold_ore', 'deepslate_gold_ore', 'nether_gold_ore'], 'gold_ingot', 'ore'); smelt(['raw_copper', 'copper_ore', 'deepslate_copper_ore'], 'copper_ingot', 'ore');
smelt('ancient_debris', 'netherite_scrap', 'ore'); smelt(['diamond_ore', 'deepslate_diamond_ore'], 'diamond', 'ore'); smelt(['emerald_ore', 'deepslate_emerald_ore'], 'emerald', 'ore'); smelt(['coal_ore', 'deepslate_coal_ore'], 'coal', 'ore');
smelt(['lapis_ore', 'deepslate_lapis_ore'], 'lapis_lazuli', 'ore'); smelt(['redstone_ore', 'deepslate_redstone_ore'], 'redstone', 'ore'); smelt('nether_quartz_ore', 'quartz', 'ore');
smelt(['sand', 'red_sand'], 'glass'); smelt('cobblestone', 'stone'); smelt('stone', 'smooth_stone'); smelt('cobbled_deepslate', 'deepslate'); smelt('clay_ball', 'brick'); smelt('clay', 'terracotta'); smelt('netherrack', 'nether_bricks'); smelt('wet_sponge', 'sponge'); smelt('stone_bricks', 'cracked_stone_bricks'); smelt('cactus', 'lime_wool');
for (const l of TAGS['#logs']) SMELT[l] = { out: ID.charcoal };
smelt('porkchop', 'cooked_porkchop', 'food'); smelt('beef', 'cooked_beef', 'food'); smelt('chicken', 'cooked_chicken', 'food'); smelt('mutton', 'cooked_mutton', 'food'); smelt('cod', 'cooked_cod', 'food'); smelt('salmon', 'cooked_salmon', 'food'); smelt('potato', 'baked_potato', 'food');
// ------------------------------------------------------------ inventario
function giveItem(p, stack) {
  let c = stack.c; const d = REG[stack.id]; const max = d.stack;
  const inv = p.inv;
  for (let i = 0; i < 36 && c > 0; i++) { const s = inv[i]; if (s && s.id === stack.id && (s.d || 0) === (stack.d || 0) && s.c < max) { const k = Math.min(c, max - s.c); s.c += k; c -= k; } }
  for (let i = 0; i < 36 && c > 0; i++) { if (!inv[i]) { const k = Math.min(c, max); inv[i] = { id: stack.id, c: k, d: stack.d || 0 }; c -= k; } }
  updateHUD(); if (typeof refreshInvUI === 'function') refreshInvUI(); return c;
}
function countItem(p, id) { let n = 0; for (const s of p.inv) if (s && s.id === id) n += s.c; return n; }
function takeItem(p, id, n) { for (let i = 35; i >= 0 && n > 0; i--) { const s = p.inv[i]; if (s && s.id === id) { const k = Math.min(n, s.c); s.c -= k; n -= k; if (s.c <= 0) p.inv[i] = null; } } updateHUD(); }
function consumeHeld(p, n = 1) { if (G.gameMode === 'creative') return; const s = p.inv[p.sel]; if (!s) return; s.c -= n; if (s.c <= 0) p.inv[p.sel] = null; updateHUD(); }
// ------------------------------------------------------------ raycast
function raycast(w, ox, oy, oz, dx, dy, dz, maxD, liquids) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tmx = dx > 0 ? (x + 1 - ox) * tdx : (ox - x) * tdx, tmy = dy > 0 ? (y + 1 - oy) * tdy : (oy - y) * tdy, tmz = dz > 0 ? (z + 1 - oz) * tdz : (oz - z) * tdz;
  let face = [0, 0, 0], t = 0;
  for (let i = 0; i < 200 && t <= maxD; i++) {
    const b = w.get(x, y, z);
    if (b > 0) {
      const d = REG[b];
      if (d.liquid ? (liquids && w.getMeta(x, y, z) === 0) : (d.render !== 'none' && d.render !== 'fire')) {
        if (d.shape) { let best = null; for (const bb of shapeBoxes(d, w.getMeta(x, y, z), (dx, dz) => w.get(x + dx, y, z + dz))) { const hit = rayBox(ox, oy, oz, dx, dy, dz, x + bb[0] / 16, y + bb[1] / 16, z + bb[2] / 16, x + bb[3] / 16, y + bb[4] / 16, z + bb[5] / 16); if (hit && (!best || hit.t < best.t)) best = hit; } if (best && best.t <= maxD) return { x, y, z, id: b, n: best.n, t: best.t }; }
        else if (d.box || d.render === 'snow') { const bb = d.render === 'snow' ? [0, 0, 0, 16, Math.max(1, w.getMeta(x, y, z)) * 2, 16] : d.box; const hit = rayBox(ox, oy, oz, dx, dy, dz, x + bb[0] / 16, y + bb[1] / 16, z + bb[2] / 16, x + bb[3] / 16, y + Math.min(16, bb[4]) / 16, z + bb[5] / 16); if (hit && hit.t <= maxD) return { x, y, z, id: b, n: hit.n, t: hit.t }; }
        else return { x, y, z, id: b, n: face, t };
      }
    }
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; face = [-sx, 0, 0]; } else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; face = [0, -sy, 0]; } else { z += sz; t = tmz; tmz += tdz; face = [0, 0, -sz]; }
  }
  return null;
}
function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = 1e9, n = null; const o = [ox, oy, oz], d = [dx, dy, dz], a = [x0, y0, z0], b = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < a[i] || o[i] > b[i]) return null; continue; }
    let t1 = (a[i] - o[i]) / d[i], t2 = (b[i] - o[i]) / d[i]; let s = -1; if (t1 > t2) { const k = t1; t1 = t2; t2 = k; s = 1; }
    if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[i] = d[i] > 0 ? -1 : 1; } tmax = Math.min(tmax, t2); if (tmin > tmax) return null;
  }
  return { t: tmin, n: n || [0, 1, 0] };
}
function rayEntity(ox, oy, oz, dx, dy, dz, maxD, dim) {
  let best = null, bt = maxD;
  for (const e of G.entities.values()) {
    if (e.dim !== dim || e.removed || e.dead || e.type === 'item' || (e instanceof Projectile && e.type !== 'fireball')) continue;
    const hw = e.w / 2 + 0.1; const h = rayBox(ox, oy, oz, dx, dy, dz, e.x - hw, e.y, e.z - hw, e.x + hw, e.y + e.h, e.z + hw);
    if (h && h.t < bt) { bt = h.t; best = e; }
  }
  return best ? { e: best, t: bt } : null;
}
// ------------------------------------------------------------ minar
function toolFor(stack) { if (!stack) return null; const d = REG[stack.id]; return d.tool || (d.shears ? { type: 'shears', lvl: 0, speed: 2 } : null); }
function canHarvest(bd, tool) { if (!bd.lvl) return true; if (!tool || tool.type !== bd.tool) return false; return tool.lvl >= bd.lvl; }
function breakTime(bd, stack, p) {
  if (bd.hard < 0) return Infinity; if (bd.hard === 0) return 0.05;
  const tool = toolFor(stack); let speed = 1;
  if (tool && (tool.type === bd.tool || (tool.type === 'sword' && bd.id === ID.cobweb) || (tool.type === 'shears' && (bd.leaves || bd.id === ID.cobweb || bd.name.endsWith('wool'))))) speed = tool.type === 'sword' ? 15 : tool.type === 'shears' ? (bd.id === ID.cobweb ? 15 : 5) : tool.speed;
  if (tool && tool.type === 'sword' && bd.leaves) speed = 1.5;
  const ef = enchLvl(stack, 'efficiency'); if (ef && speed > 1) speed += ef * ef + 1;
  if (p.effects.haste) speed *= 1.4;
  if (p.eyeInWater) speed /= 5; if (!p.onGround && !p.flying && !p.inWater) speed /= 5;
  const dmg = speed / bd.hard / (canHarvest(bd, tool) ? 30 : 100);
  return dmg >= 1 ? 0.05 : Math.ceil(1 / dmg) / 20;
}
function dropBlockItems(w, x, y, z, id, stack, explosion) {
  const d = REG[id]; if (!d || G.gameMode === 'creative' && !explosion) return;
  const tool = toolFor(stack);
  if (!explosion && !canHarvest(d, tool)) return;
  if (tool && tool.type === 'shears' && (d.leaves || id === ID.vine || id === ID.tall_grass || id === ID.cobweb)) { dropItem(w.dim, x + 0.5, y + 0.5, z + 0.5, { id: id === ID.cobweb ? ID.cobweb : id, c: 1 }); return; }
  if (d.leaves) { const r = Math.random(); const sap = ID[d.leaves + '_sapling']; if (r < 0.05 && sap) dropItem(w.dim, x + 0.5, y + 0.5, z + 0.5, { id: sap, c: 1 }); else if (r < 0.07) dropItem(w.dim, x + 0.5, y + 0.5, z + 0.5, { id: ID.stick, c: 1 + (Math.random() * 2 | 0) }); if ((d.leaves === 'oak' || d.leaves === 'dark_oak') && Math.random() < 0.005) dropItem(w.dim, x + 0.5, y + 0.5, z + 0.5, { id: ID.apple, c: 1 }); return; }
  if (id === ID.gravel && Math.random() < 0.1) { dropItem(w.dim, x + 0.5, y + 0.5, z + 0.5, { id: ID.flint, c: 1 }); return; }
  if (d.crop) { const m = w.getMeta(x, y, z); const ripe = m >= 7; const D = (n, c) => dropItem(w.dim, x + 0.5, y + 0.5, z + 0.5, { id: ID[n], c });
    if (d.crop === 'wheat') { D('wheat_seeds', 1 + (ripe ? (Math.random() * 3 | 0) : 0)); if (ripe) D('wheat', 1); }
    else if (d.crop === 'carrots') D('carrot', ripe ? 2 + (Math.random() * 3 | 0) : 1);
    else if (d.crop === 'potatoes') D('potato', ripe ? 2 + (Math.random() * 3 | 0) : 1);
    else if (d.crop === 'beetroots') { D('beetroot_seeds', 1 + (ripe ? (Math.random() * 3 | 0) : 0)); if (ripe) D('beetroot', 1); }
    return; }
  if (id === ID.snow) { const m = Math.max(1, w.getMeta(x, y, z)); if (tool && tool.type === 'shovel') dropItem(w.dim, x + 0.5, y + 0.5, z + 0.5, { id: ID.snowball, c: Math.max(1, m >> 1) }); return; }
  if (d.drop === null) return;
  if (d.dropChance && Math.random() > d.dropChance) return;
  let n = d.dropN ? (d.dropN > 1 ? 1 + ((Math.random() * d.dropN) | 0) : 1) : 1;
  const fo = enchLvl(stack, 'fortune'); if (fo && d.drop !== d.name) n *= 1 + ((Math.random() * (fo + 1)) | 0);
  const XPB = { coal_ore: 1, diamond_ore: 5, emerald_ore: 5, lapis_ore: 3, redstone_ore: 2, nether_quartz_ore: 2, nether_gold_ore: 1 }; const xb = XPB[d.name.replace('deepslate_', '')]; if (xb && !explosion && G.player) G.player.xp = (G.player.xp || 0) + xb;
  if (id === ID.redstone_ore || id === ID.deepslate_redstone_ore) n = 4 + (Math.random() * 2 | 0);
  const did = ID[d.drop]; if (did === undefined) return;
  dropItem(w.dim, x + 0.5, y + 0.5, z + 0.5, { id: did, c: n }, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2);
}
// ------------------------------------------------------------ colocar / modificar bloques en red
function setBlockNet(w, x, y, z, id, meta = 0) {
  const ok = w.set(x, y, z, id, meta);
  if (ok && G.net && G.net.role === 'client' && !G.applyingNet) netSend({ t: 'sb', d: w.dim, x, y, z, id, m: meta });
  return ok;
}
const DIRTY_URGENT = new Set();
function markDirty(w, x, z, urgent) {
  const cx = x >> 4, cz = z >> 4;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const c = w.chunk(cx + dx, cz + dz); if (!c) continue;
    const lx = x & 15, lz = z & 15; const edge = (dx === -1 ? lx === 0 : dx === 1 ? lx === 15 : true) && (dz === -1 ? lz === 0 : dz === 1 ? lz === 15 : true);
    c.dirty = true; if ((dx === 0 && dz === 0) || edge) { if (urgent) c.urgent = true; }
  }
}
const NETBATCH = [];
function onBlockSet(w, x, y, z, old, id, meta) {
  markDirty(w, x, z, true);
  if (G.net && G.net.role === 'host' && !G.applyingNet) NETBATCH.push([w.dim, x, y, z, id, meta]);
  if (G.net && G.net.role === 'client') return;
  // fluidos y bloques dependientes
  for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const b = w.get(x + dx, y + dy, z + dz); if (b <= 0) continue; const d = REG[b];
    if (d.liquid) w.scheduleTick(x + dx, y + dy, z + dz, d.liquid === 1 ? 5 : (w.dim === 'nether' ? 10 : 30), 0);
    if (d.gravity) w.scheduleTick(x + dx, y + dy, z + dz, 2, 1);
    if (dy === 1 && needsSupport(d)) w.scheduleTick(x, y + 1, z, 1, 2);
    if (dy !== 0 || dx !== 0 || dz !== 0) if (b === ID.torch || b === ID.soul_torch || b === ID.redstone_torch || b === ID.ladder || b === ID.vine || b === ID.cave_vines || b === ID.weeping_vines || b === ID.pointed_dripstone) w.scheduleTick(x + dx, y + dy, z + dz, 1, 2);
  }
  if (old > 0 && REG[old].shape === 'door' && id !== old) for (const dy of [1, -1]) if (w.get(x, y + dy, z) === old) w.set(x, y + dy, z, 0);
  // romper portal si se rompe el marco
  if ((old === ID.obsidian || old === ID.nether_portal) && id !== ID.nether_portal) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (w.get(x + dx, y + dy, z + dz) === ID.nether_portal) w.scheduleTick(x + dx, y + dy, z + dz, 1, 3);
  // contenedores rotos sueltan contenido
  if (old && REG[old].ui && (REG[old].ui === 'chest' || REG[old].ui === 'furnace') && REG[id] && REG[id].ui !== REG[old].ui) {
    const key = w.dim + ':' + x + ',' + y + ',' + z; const c = G.containers[key];
    if (c) { for (const s of c.items) if (s) dropItem(w.dim, x + 0.5, y + 0.5, z + 0.5, s); delete G.containers[key]; }
  }
  if (old === ID.fire || id === ID.fire) w.scheduleTick(x, y, z, 30 + Math.random() * 40 | 0, 4);
}
function needsSupport(d) { return d.render === 'cross' || d.render === 'snow' || d.id === ID.torch || d.id === ID.soul_torch || d.id === ID.redstone_torch || d.id === ID.wheat || d.id === ID.rail || d.id === ID.lily_pad || d.id === ID.fire || d.id === ID.pink_petals || d.id === ID.stone_pressure_plate || d.id === ID.lever; }
function supported(w, x, y, z, b) {
  const d = REG[b]; const below = w.get(x, y - 1, z);
  if (b === ID.torch || b === ID.soul_torch || b === ID.redstone_torch) { const m = w.getMeta(x, y, z); if (m >= 1 && m <= 4) { const o = [[0, 1], [-1, 0], [0, -1], [1, 0]][m - 1]; const s = w.get(x + o[0], y, z + o[1]); return s !== 0 && (s < 0 || REG[s].solid); } return below !== 0 && (below < 0 || REG[below].solid); }
  if (b === ID.cave_vines || b === ID.weeping_vines) { const a = w.get(x, y + 1, z); return a !== 0 && (a < 0 || REG[a].solid || a === b); }
  if (b === ID.pointed_dripstone && w.getMeta(x, y, z) === 1) { const a = w.get(x, y + 1, z); return a !== 0; }
  if (b === ID.vine || b === ID.ladder) return true;
  if (b === ID.lily_pad) return below === ID.water;
  if (b === ID.kelp || b === ID.seagrass) return below !== 0 && below !== ID.water ? true : below === ID.kelp;
  if (b === ID.sugar_cane) return below === ID.sugar_cane || below === ID.sand || below === ID.dirt || below === ID.grass_block;
  if (b === ID.amethyst_cluster) return true;
  if (b === ID.fire) return below !== 0 && below !== ID.water;
  return below !== 0 && below !== ID.water && below !== ID.lava && (below < 0 || REG[below].solid || REG[below].render === 'box' && REG[below].solid);
}
// ------------------------------------------------------------ ticks de bloques
World.prototype.scheduleTick = function (x, y, z, delay, kind = 0) {
  if (!this.tq) this.tq = new Map();
  const k = x + ',' + y + ',' + z + ',' + kind; if (this.tickSet.has(k)) return; this.tickSet.add(k);
  const t = (G.tick || 0) + Math.max(1, delay | 0); let b = this.tq.get(t); if (!b) { b = []; this.tq.set(t, b); } b.push([x, y, z, kind, k]);
};
function processTicks(w) {
  if (!w.tq) return; const b = w.tq.get(G.tick); if (!b) return; w.tq.delete(G.tick);
  for (const [x, y, z, kind, k] of b) {
    w.tickSet.delete(k); if (!w.chunk(x >> 4, z >> 4)) continue;
    if (kind === 0) fluidTick(w, x, y, z);
    else if (kind === 1) gravityTick(w, x, y, z);
    else if (kind === 2) { const id = w.get(x, y, z); if (id > 0 && !supported(w, x, y, z, id)) { w.set(x, y, z, 0); dropBlockItems(w, x, y, z, id, null, true); } }
    else if (kind === 3) { if (w.get(x, y, z) === ID.nether_portal && !portalValid(w, x, y, z)) { w.set(x, y, z, 0); } }
    else if (kind === 4) fireTick(w, x, y, z);
  }
}
function portalValid(w, x, y, z) {
  const ax = w.getMeta(x, y, z) === 1 ? [0, 1] : [1, 0];
  for (const [dx, dy, dz] of [[ax[0], 0, ax[1]], [-ax[0], 0, -ax[1]], [0, 1, 0], [0, -1, 0]]) { const b = w.get(x + dx, y + dy, z + dz); if (b !== ID.obsidian && b !== ID.nether_portal && b !== ID.crying_obsidian) return false; }
  return true;
}
function gravityTick(w, x, y, z) {
  const b = w.get(x, y, z); if (b <= 0 || !REG[b].gravity) return; const below = w.get(x, y - 1, z);
  if (below === 0 || (below > 0 && (REG[below].replace || REG[below].liquid))) { w.set(x, y, z, 0); const e = new Projectile('falling_block', w.dim, x + 0.5, y, z + 0.5, 0, 0, 0); e.block = b; e.w = 0.98; e.h = 0.98; e.grav = 25; G.entities.set(e.id, e); }
}
function canFlow(b, liq) { if (b === 0) return true; if (b < 0) return false; const d = REG[b]; if (d.liquid) return d.liquid === liq; return d.replace && !d.inWater; }
function fluidTick(w, x, y, z) {
  const id = w.get(x, y, z); if (id <= 0) return; const d = REG[id]; if (!d.liquid) return;
  const liq = d.liquid; const drop = liq === 1 ? 1 : (w.dim === 'nether' ? 1 : 2); const delay = liq === 1 ? 5 : (w.dim === 'nether' ? 10 : 30);
  const other = liq === 1 ? ID.lava : ID.water;
  let meta = w.getMeta(x, y, z); const isSource = meta === 0;
  // interacción lava/agua
  if (liq === 2) { for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) { const nb = w.get(x + dx, y + dy, z + dz); if (nb === ID.water || (nb > 0 && REG[nb].inWater)) { w.set(x, y, z, isSource ? ID.obsidian : ID.cobblestone); fizz(w, x, y, z); return; } } }
  if (w.dim === 'nether' && liq === 1) { w.set(x, y, z, 0); fizz(w, x, y, z); return; }
  if (!isSource) {
    let newLevel = 99; let src = 0; const above = w.get(x, y + 1, z); let falling = false;
    if (above === id || (liq === 1 && above > 0 && REG[above].inWater)) { falling = true; newLevel = 0; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nb = w.get(x + dx, y, z + dz); if (nb === id) { const nm = w.getMeta(x + dx, y, z + dz); const nl = (nm & 8) ? 0 : (nm & 7); if (nm === 0) src++; newLevel = Math.min(newLevel, nl + drop); } }
    if (liq === 1 && src >= 2) { const below = w.get(x, y - 1, z); if ((below > 0 && REG[below].solid) || (below === id && w.getMeta(x, y - 1, z) === 0)) { newLevel = 0; falling = false; } }
    let nm; if (falling) nm = 8; else if (newLevel >= 8) nm = -1; else nm = newLevel === 0 && src >= 2 ? 0 : Math.max(1, newLevel);
    if (nm < 0) { w.set(x, y, z, 0); return; }
    if (nm !== meta) { w.set(x, y, z, id, nm); w.scheduleTick(x, y, z, delay, 0); return; }
  }
  // fluir hacia abajo
  const below = w.get(x, y - 1, z);
  if (below === other || (liq === 2 && below > 0 && REG[below].inWater)) { if (liq === 2) { w.set(x, y - 1, z, ID.stone); fizz(w, x, y - 1, z); } else { w.scheduleTick(x, y - 1, z, 1, 0); } return; }
  if (canFlow(below, liq)) { if (below !== id || w.getMeta(x, y - 1, z) !== 8 && w.getMeta(x, y - 1, z) !== 0) { if (below > 0 && below !== id) dropBlockItems(w, x, y - 1, z, below, null, true); w.set(x, y - 1, z, id, 8); } if (!isSource) return; }
  const level = (meta & 8) ? 0 : (meta & 7); if (level + drop >= 8) return;
  if (!isSource && !(below !== 0 && (below < 0 || REG[below].solid || (below === id && w.getMeta(x, y - 1, z) === 0)))) { if (!(meta & 8)) return; }
  // buscar dirección hacia la caída más cercana
  const range = liq === 1 ? 4 : 2; let best = 99; const dirs = [];
  const costTo = (sx, sz, from, depth) => {
    if (depth > range) return 99; const b2 = w.get(sx, y, sz); if (!canFlow(b2, liq) || (b2 === id && w.getMeta(sx, y, sz) === 0)) return 99;
    const bb = w.get(sx, y - 1, sz); if (canFlow(bb, liq)) return depth;
    let m = 99; for (const [dx, dz, f] of [[1, 0, 0], [-1, 0, 1], [0, 1, 2], [0, -1, 3]]) { if (f === (from ^ 1)) continue; m = Math.min(m, costTo(sx + dx, sz + dz, f, depth + 1)); } return m;
  };
  const D4 = [[1, 0, 0], [-1, 0, 1], [0, 1, 2], [0, -1, 3]];
  for (const [dx, dz, f] of D4) { const c = costTo(x + dx, z + dz, f, 1); if (c < best) { best = c; dirs.length = 0; dirs.push([dx, dz]); } else if (c === best && c < 99) dirs.push([dx, dz]); }
  if (!dirs.length) for (const [dx, dz] of D4) dirs.push([dx, dz]);
  const nl = level + drop;
  for (const [dx, dz] of dirs) {
    const nx = x + dx, nz = z + dz; const nb = w.get(nx, y, nz);
    if (nb === other) { w.scheduleTick(nx, y, nz, 1, 0); if (liq === 2 && w.getMeta(nx, y, nz) !== 0) { w.set(nx, y, nz, ID.cobblestone); fizz(w, nx, y, nz); } continue; }
    if (!canFlow(nb, liq)) continue;
    if (nb === id) { const m = w.getMeta(nx, y, nz); if (m === 0 || (m & 8) || (m & 7) <= nl) continue; }
    if (nb > 0 && nb !== id) dropBlockItems(w, nx, y, nz, nb, null, true);
    w.set(nx, y, nz, id, nl);
  }
}
function fizz(w, x, y, z) { playSound('fizz', x, y, z, 0.5); if (typeof vfxSmokeEmit === 'function') vfxSmokeEmit(x + 0.5, y + 1, z + 0.5, 1.0, 0.6, 2); for (let i = 0; i < 6; i++) smoke(x + Math.random(), y + 1, z + Math.random(), { r: 0.7, g: 0.7, b: 0.7, a: 0.5, size: 0.4, life: 1.2 }); }
function fireTick(w, x, y, z) {
  if (w.get(x, y, z) !== ID.fire) return; const below = w.get(x, y - 1, z);
  if (below > 0 && REG[below].infiniteFire) { return; }
  if (G.rainLevel > 0.5 && w.dim === 'overworld' && w.light(x, y, z)[0] >= 15) { w.set(x, y, z, 0); fizz(w, x, y, z); return; }
  // sin combustible cerca, el fuego se consume poco a poco (no se apaga a golpes)
  let fuel = below > 0 && REG[below].flammable;
  if (!fuel) for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) { const n = w.get(x + ax, y + ay, z + az); if (n > 0 && REG[n].flammable) { fuel = true; break; } }
  if (!fuel && Math.random() < 0.06) { w.set(x, y, z, 0); return; }
  // propagar a vecinos inflamables
  for (let i = 0; i < 3; i++) {
    const dx = (Math.random() * 3 | 0) - 1, dy = (Math.random() * 4 | 0) - 1, dz = (Math.random() * 3 | 0) - 1;
    const b = w.get(x + dx, y + dy, z + dz);
    if (b > 0 && REG[b].flammable && Math.random() < 0.4) { w.set(x + dx, y + dy, z + dz, Math.random() < 0.5 ? ID.fire : 0); }
    else if (b === 0) { let near = false; for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const n = w.get(x + dx + ax, y + dy + ay, z + dz + az); if (n > 0 && REG[n].flammable) near = true; } if (near && Math.random() < 0.3) w.set(x + dx, y + dy, z + dz, ID.fire); }
  }
  if (below > 0 && REG[below].flammable && Math.random() < 0.3) w.set(x, y - 1, z, ID.fire);
  w.scheduleTick(x, y, z, 30 + Math.random() * 40 | 0, 4);
}
// adaptador para generar árboles directamente en el mundo
function worldBuilder(w) {
  return { set: (x, y, z, id, m) => w.set(x, y, z, id, m || 0), get: (x, y, z) => w.get(x, y, z), setIfAir: (x, y, z, id, m) => { const b = w.get(x, y, z); if (b === 0 || (b > 0 && REG[b].replace)) w.set(x, y, z, id, m || 0); }, setIfSolid: (x, y, z, id) => { const b = w.get(x, y, z); if (b > 0 && REG[b].solid) w.set(x, y, z, id); } };
}
function growSapling(w, x, y, z, b) {
  const kind = REG[b].sapling; const S = worldBuilder(w); const r = Math.random; w.set(x, y, z, 0);
  ({ oak: treeOak, birch: treeBirch, spruce: (S, x, y, z, r) => treeSpruce(S, x, y, z, r, false), jungle: treeJungle, acacia: treeAcacia, dark_oak: treeDarkOak, mangrove: treeMangrove, cherry: treeCherry })[kind](S, x, y, z, r);
}
function treeCherry(S, x, y, z, r) { const h = 5 + (r() * 2 | 0); for (let i = 0; i < h; i++) S.set(x, y + i, z, ID.cherry_log); leafBlob(S, x, y + h, z, 3, ID.cherry_leaves, r); }
function randomTicks(w, cx, cz) {
  const c = w.chunk(cx, cz); if (!c) return; const H = w.H;
  for (let s = 0; s < (c.top >> 4) + 1; s++) {
    const x = Math.random() * 16 | 0, z = Math.random() * 16 | 0, y = (s << 4) + (Math.random() * 16 | 0); if (y >= H) continue;
    const b = c.blocks[x | z << 4 | y << 8]; if (!b) continue; const wx = cx * 16 + x, wz = cz * 16 + z; const d = REG[b];
    if (d.sapling) { if (Math.random() < 0.15 && w.light(wx, y + 1, wz)[0] >= 9) growSapling(w, wx, y, wz, b); }
    else if (d.crop) { const m = w.getMeta(wx, y, wz); if (m < 7 && Math.random() < 0.35 && w.light(wx, y, wz)[0] + w.light(wx, y, wz)[1] >= 9) w.set(wx, y, wz, b, m + 1); }
    else if (b === ID.grass_block) { const a = w.get(wx, y + 1, wz); if (a > 0 && T_FULL[a]) w.set(wx, y, wz, ID.dirt); else for (let i = 0; i < 2; i++) { const nx = wx + (Math.random() * 3 | 0) - 1, ny = y + (Math.random() * 3 | 0) - 1, nz = wz + (Math.random() * 3 | 0) - 1; if (w.get(nx, ny, nz) === ID.dirt && w.get(nx, ny + 1, nz) === 0 && w.light(nx, ny + 1, nz)[0] >= 9) w.set(nx, ny, nz, ID.grass_block); } }
    else if (d.leaves && !(w.getMeta(wx, y, wz) & 1)) { let found = false; for (let dx = -4; dx <= 4 && !found; dx++) for (let dy = -4; dy <= 4 && !found; dy++) for (let dz = -4; dz <= 4 && !found; dz++) { const o = w.get(wx + dx, y + dy, wz + dz); if (o > 0 && REG[o].log) found = true; } if (!found) { w.set(wx, y, wz, 0); dropBlockItems(w, wx, y, wz, b, null, true); } }
    else if ((b === ID.sugar_cane || b === ID.cactus) && w.get(wx, y + 1, wz) === 0 && Math.random() < 0.2) { let h = 1; while (w.get(wx, y - h, wz) === b) h++; if (h < 3) w.set(wx, y + 1, wz, b); }
    else if (b === ID.snow && G.rainLevel > 0.5 && BIOMES[c.biomes[x | z << 4]].snow) { const m = w.getMeta(wx, y, wz); if (m < 6 && w.light(wx, y + 1, wz)[0] >= 15) w.set(wx, y, wz, ID.snow, m + 1); }
    else if (b === ID.ice && w.light(wx, y + 1, wz)[1] > 11) w.set(wx, y, wz, ID.water);
    else if (b === ID.farmland && w.get(wx, y + 1, wz) === 0 && Math.random() < 0.05) w.set(wx, y, wz, ID.dirt);
    // capa de nieve nueva al nevar
    if (G.rainLevel > 0.6 && w.dim === 'overworld' && BIOMES[c.biomes[x | z << 4]].snow && Math.random() < 0.3) { let ty = c.top; while (ty > 0 && !c.blocks[x | z << 4 | ty << 8]) ty--; const tb = c.blocks[x | z << 4 | ty << 8]; if (tb && T_FULL[tb] && ty + 1 < H && !c.blocks[x | z << 4 | (ty + 1) << 8]) w.set(wx, ty + 1, wz, ID.snow, 1); }
  }
}
// ------------------------------------------------------------ portales
function tryLightPortal(w, x, y, z) {
  for (const ax of [[1, 0], [0, 1]]) {
    let by = y; while (by > y - 22 && (w.get(x, by - 1, z) === 0 || w.get(x, by - 1, z) === ID.fire)) by--; if (w.get(x, by - 1, z) !== ID.obsidian) continue;
    let lx = x, lz = z; let k = 0; while (k++ < 22 && (w.get(lx - ax[0], by, lz - ax[1]) === 0 || w.get(lx - ax[0], by, lz - ax[1]) === ID.fire)) { lx -= ax[0]; lz -= ax[1]; }
    if (w.get(lx - ax[0], by, lz - ax[1]) !== ID.obsidian) continue;
    let width = 0; while (width < 22 && (w.get(lx + ax[0] * width, by, lz + ax[1] * width) === 0 || w.get(lx + ax[0] * width, by, lz + ax[1] * width) === ID.fire)) width++;
    if (width < 2 || width > 21 || w.get(lx + ax[0] * width, by, lz + ax[1] * width) !== ID.obsidian) continue;
    let height = 0; while (height < 22 && (w.get(lx, by + height, lz) === 0 || w.get(lx, by + height, lz) === ID.fire)) height++;
    if (height < 3 || height > 21) continue;
    let ok = true;
    for (let i = 0; i < width && ok; i++) for (let j = 0; j < height && ok; j++) { const b = w.get(lx + ax[0] * i, by + j, lz + ax[1] * i); if (b !== 0 && b !== ID.fire) ok = false; }
    for (let i = 0; i < width && ok; i++) { if (w.get(lx + ax[0] * i, by - 1, lz + ax[1] * i) !== ID.obsidian || w.get(lx + ax[0] * i, by + height, lz + ax[1] * i) !== ID.obsidian) ok = false; }
    for (let j = 0; j < height && ok; j++) { if (w.get(lx - ax[0], by + j, lz - ax[1]) !== ID.obsidian || w.get(lx + ax[0] * width, by + j, lz + ax[1] * width) !== ID.obsidian) ok = false; }
    if (!ok) continue;
    for (let i = 0; i < width; i++) for (let j = 0; j < height; j++) setBlockNet(w, lx + ax[0] * i, by + j, lz + ax[1] * i, ID.nether_portal, ax[0] ? 0 : 1);
    playSound('portal_ignite', x, y, z, 1); return true;
  }
  return false;
}
function ensureArea(w, x, z, r) { for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) w.ensure((Math.floor(x) >> 4) + dx, (Math.floor(z) >> 4) + dz); }
function travelPortal(p, kind) {
  const from = p.dim; let to, tx, tz, ty;
  if (kind === 1) {
    to = from === 'nether' ? 'overworld' : 'nether'; const f = to === 'nether' ? 1 / 8 : 8; tx = Math.floor(p.x * f); tz = Math.floor(p.z * f);
    const w = G.worlds[to]; ensureArea(w, tx, tz, 2);
    let best = null, bd = 1e9;
    for (let dx = -20; dx <= 20; dx++) for (let dz = -20; dz <= 20; dz++) { const c = w.chunk((tx + dx) >> 4, (tz + dz) >> 4); if (!c) continue; for (let y = 1; y < w.H - 1; y++) if (c.blocks[((tx + dx) & 15) | (((tz + dz) & 15) << 4) | (y << 8)] === ID.nether_portal) { const d = dx * dx + dz * dz + (y - p.y * (to === 'nether' ? 0.5 : 1)) ** 2 * 0.1; if (d < bd) { bd = d; best = [tx + dx, y, tz + dz]; } } }
    if (best) { while (w.get(best[0], best[1] - 1, best[2]) === ID.nether_portal) best[1]--; tx = best[0]; ty = best[1]; tz = best[2]; }
    else {
      // construir portal
      ty = -1; const ylo = to === 'nether' ? 32 : SEA - 2, yhi = to === 'nether' ? 100 : w.H - 10;
      outer: for (let rr = 0; rr < 12; rr++) for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== rr) continue; for (let y = yhi; y >= ylo; y--) { const b = w.get(tx + dx, y - 1, tz + dz); if (b > 0 && REG[b].solid && !REG[b].liquid && w.get(tx + dx, y, tz + dz) === 0 && w.get(tx + dx + 1, y, tz + dz) === 0 && w.get(tx + dx, y + 3, tz + dz) === 0 && w.get(tx + dx + 1, y + 2, tz + dz) === 0) { tx += dx; tz += dz; ty = y; break outer; } } }
      if (ty < 0) ty = to === 'nether' ? 64 : SEA + 5;
      for (let i = -1; i <= 2; i++) for (let j = -1; j <= 3; j++) { const fr = i === -1 || i === 2 || j === -1 || j === 3; setBlockNet(w, tx + i, ty + j, tz, fr ? ID.obsidian : ID.nether_portal, 0); for (const dz of [-1, 1]) if (j >= 0) setBlockNet(w, tx + i, ty + j, tz + dz, 0); }
      for (let i = -1; i <= 2; i++) for (const dz of [-1, 1]) { const b = w.get(tx + i, ty - 1, tz + dz); if (b === 0 || (b > 0 && REG[b].liquid)) setBlockNet(w, tx + i, ty - 1, tz + dz, ID.obsidian); }
    }
    changeDim(p, to, tx + 0.5, ty, tz + 0.5);
  } else if (kind === 2) {
    if (from === 'end') { const s = p.spawn || G.worldSpawn; G.worlds.overworld && ensureArea(G.worlds.overworld, s.x, s.z, 1); changeDim(p, 'overworld', s.x, s.y, s.z); if (G.dragonKilled && !G.creditsShown) { G.creditsShown = true; showCredits(); } return; }
    const w = G.worlds.end; ensureArea(w, 100, 0, 2);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { setBlockNet(w, 100 + dx, 48, dz, ID.obsidian); for (let dy = 1; dy <= 3; dy++) setBlockNet(w, 100 + dx, 48 + dy, dz, 0); }
    changeDim(p, 'end', 100.5, 49, 0.5); if (!G.net || G.net.role === 'host') initEnd();
  } else if (kind === 3) {
    const w = G.worlds.end; const a = Math.atan2(p.z, p.x); let d = 1050; let gx, gz, gy = -1;
    for (let tries = 0; tries < 30 && gy < 0; tries++, d += 40) { gx = Math.round(Math.cos(a) * d); gz = Math.round(Math.sin(a) * d); ensureArea(w, gx, gz, 1); for (let y = w.H - 2; y > 10; y--) if (w.get(gx, y, gz) === ID.end_stone) { gy = y + 1; break; } }
    if (gy < 0) { gy = 70; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) setBlockNet(w, gx + dx, 69, gz + dz, ID.end_stone); }
    p.x = gx + 0.5; p.y = gy; p.z = gz + 0.5; p.vx = p.vy = p.vz = 0; p.portalCool = 100;
  }
}
function changeDim(p, to, x, y, z) {
  p.dim = to; p.x = x; p.y = y; p.z = z; p.px = x; p.py = y; p.pz = z; p.vx = p.vy = p.vz = 0; p.portalT = 0; p.portalCool = 100; p.fallDist = 0;
  if (p === G.player) { G.world = G.worlds[to]; onDimensionChanged(); }
}
function checkEndPortalFrame(w, x, y, z) {
  for (let cx = x - 4; cx <= x + 4; cx++) for (let cz = z - 4; cz <= z + 4; cz++) {
    let ok = true, cnt = 0;
    for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++) { const ring = (Math.abs(dx) === 2) !== (Math.abs(dz) === 2); if (!ring) continue; if (w.get(cx + dx, y, cz + dz) !== ID.end_portal_frame_eye) ok = false; else cnt++; }
    if (ok && cnt === 12) { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setBlockNet(w, cx + dx, y, cz + dz, ID.end_portal); playSound('end_portal', cx, y, cz, 1); showTitle('', 'El portal del End se ha activado'); return true; }
  }
  return false;
}
// ------------------------------------------------------------ generación natural de mobs
function effSkyLight(L) { const darken = Math.round((1 - ENV.day) * 11 + (G.rainLevel || 0) * 3); return Math.max(L[1], L[0] - darken); }
function spawnTick() {
  if (G.net && G.net.role === 'client') return;
  const players = [G.player, ...[...G.entities.values()].filter(e => e.remotePlayer)].filter(p => p && !p.dead);
  const counts = {}; for (const e of G.entities.values()) if (e instanceof Mob) { const k = e.dim + (e.def.hostile ? 'h' : 'p'); counts[k] = (counts[k] || 0) + 1; }
  for (const p of players) {
    const w = G.worlds[p.dim]; if (!w) continue;
    const capH = { overworld: 40, nether: 30, end: 18 }[p.dim];
    if (G.difficulty > 0 && (counts[p.dim + 'h'] || 0) < capH) for (let a = 0; a < 3; a++) {
      const ang = Math.random() * 6.28, d = 24 + Math.random() * 36; const x = Math.floor(p.x + Math.cos(ang) * d), z = Math.floor(p.z + Math.sin(ang) * d);
      if (!w.chunk(x >> 4, z >> 4)) continue; let y = Math.floor(p.y + (Math.random() - 0.5) * 40); y = clamp(y, 2, w.H - 3);
      for (let k = 0; k < 16; k++, y--) { const b = w.get(x, y - 1, z); if (b > 0 && T_FULL[b] && b !== ID.bedrock && w.get(x, y, z) === 0 && w.get(x, y + 1, z) === 0) break; }
      const b0 = w.get(x, y - 1, z); if (!(b0 > 0 && T_FULL[b0]) || w.get(x, y, z) !== 0 || w.get(x, y + 1, z) !== 0) continue;
      const L = w.light(x, y, z); let type = null;
      if (p.dim === 'overworld') {
        if (effSkyLight(L) > 7 || L[1] > 0) continue;
        const cb = w.gen.caveBiome(x, y, z); if (cb === BI.deep_dark) continue;
        const bio = w.biomeAt(x, z); const r = Math.random();
        type = r < 0.32 ? (bio === BI.desert ? 'husk' : 'zombie') : r < 0.58 ? 'skeleton' : r < 0.8 ? 'creeper' : r < 0.96 ? 'spider' : 'enderman';
        if (b0 === ID.sand && liquidAt(w, x, y, z) === 1) type = 'drowned';
      } else if (p.dim === 'nether') {
        if (L[1] > 11) continue; const bio = w.biomeAt(x, z); const r = Math.random();
        if (b0 === ID.nether_bricks) type = r < 0.5 ? 'blaze' : 'wither_skeleton';
        else if (bio === BI.soul_sand_valley) type = r < 0.6 ? 'skeleton' : r < 0.85 ? 'ghast' : 'enderman';
        else if (bio === BI.crimson_forest) type = r < 0.5 ? 'piglin' : r < 0.85 ? 'hoglin' : 'zombified_piglin';
        else if (bio === BI.warped_forest) type = 'enderman';
        else if (bio === BI.basalt_deltas) type = r < 0.75 ? 'magma_cube' : 'ghast';
        else type = r < 0.55 ? 'zombified_piglin' : r < 0.7 ? 'ghast' : r < 0.85 ? 'magma_cube' : r < 0.95 ? 'piglin' : 'enderman';
        if (type === 'ghast') { if (w.get(x, y + 4, z) !== 0 || w.get(x + 2, y + 2, z + 2) !== 0) continue; y += 2; }
      } else { if (b0 !== ID.end_stone) continue; type = 'enderman'; }
      if (!type) continue; const n = type === 'ghast' || type === 'enderman' ? 1 : 1 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) { const m = spawnMob(type, p.dim, x + 0.5 + (i ? (Math.random() - 0.5) * 2 : 0), y, z + 0.5 + (i ? (Math.random() - 0.5) * 2 : 0)); if (m && type === 'skeleton' && w.dim === 'overworld' && Math.random() < 0.05) { } }
      counts[p.dim + 'h'] = (counts[p.dim + 'h'] || 0) + n;
    }
    // pasivos
    if (p.dim === 'overworld' && G.tick % 200 === 0 && (counts['overworldp'] || 0) < 16) {
      const ang = Math.random() * 6.28, d = 28 + Math.random() * 30; const x = Math.floor(p.x + Math.cos(ang) * d), z = Math.floor(p.z + Math.sin(ang) * d);
      if (!w.chunk(x >> 4, z >> 4)) continue; const y = w.surfaceY(x, z) + 1; if (w.get(x, y - 1, z) !== ID.grass_block && w.get(x, y - 1, z) !== ID.snowy_grass) continue; if (w.light(x, y, z)[0] < 9) continue;
      const bio = w.biomeAt(x, z); const kinds = bio === BI.snowy_plains || bio === BI.mountains ? ['goat', 'sheep'] : ['pig', 'cow', 'sheep', 'chicken'];
      const k = kinds[Math.random() * kinds.length | 0]; for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) spawnMob(k, 'overworld', x + 0.5 + (Math.random() - 0.5) * 3, y, z + 0.5 + (Math.random() - 0.5) * 3);
    }
  }
}
function onChunkGenerated(w, c) {
  if (G.net && G.net.role === 'client') return; if (G.mode !== 'game') return;
  const k = w.dim + ':' + c.cx + ',' + c.cz; if (G.spawned.has(k)) return; G.spawned.add(k);
  for (const s of c.spawns || []) { let y = s.y; if (y === undefined) { y = w.surfaceY(Math.floor(s.x), Math.floor(s.z)) + 1; if (y < 2) continue; } const m = spawnMob(s.type, w.dim, s.x, y, s.z); if (m && (MOB[s.type].hostile)) m.persist = true; }
}
function spawnerTick(w, p) {
  const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const c = w.chunk(pcx + dx, pcz + dz); if (!c) continue;
    for (const k in c.spawners) {
      const i = +k; const x = c.cx * 16 + (i & 15), z = c.cz * 16 + ((i >> 4) & 15), y = i >> 8; const b = c.blocks[i]; if (b !== ID.spawner && b !== ID.trial_spawner) continue;
      if (Math.hypot(p.x - x, p.y - y, p.z - z) > 16) continue;
      const type = c.spawners[k]; if (!MOB[type]) continue;
      if (Math.random() < 0.6) P_({ x: x + Math.random(), y: y + Math.random(), z: z + Math.random(), vy: 0.5, life: 0.6, size: 0.15, layer: TEX.flame_0, add: true, emis: 3, r: 1, g: 0.6, b: 0.3 });
      const st = c.spawnerState || (c.spawnerState = {}); const s = st[k] || (st[k] = { t: 100, done: 0 });
      if (b === ID.trial_spawner && s.done >= 6) { if (!s.rewarded) { let alive = 0; for (const e of G.entities.values()) if (e.fromSpawner === k + c.cx + ',' + c.cz && !e.dead && !e.removed) alive++; if (!alive) { s.rewarded = true; dropItem(w.dim, x + 0.5, y + 1.2, z + 0.5, { id: ID.ominous_key, c: 1 }); dropItem(w.dim, x + 0.5, y + 1.2, z + 0.5, rollLoot('trial', Math.random() * 1e9 | 0).find(Boolean)); playSound('levelup', x, y, z, 1); } } continue; }
      if (--s.t > 0) continue; s.t = b === ID.trial_spawner ? 200 : 200 + Math.random() * 600 | 0;
      let near = 0; for (const e of G.entities.values()) if (e.type === type && Math.abs(e.x - x) < 9 && Math.abs(e.z - z) < 9) near++; if (near >= 6) continue;
      for (let n = 0; n < 2 + (Math.random() * 2 | 0); n++) { const sx = x + 0.5 + (Math.random() - 0.5) * 6, sz = z + 0.5 + (Math.random() - 0.5) * 6; const sy = y + (Math.random() * 3 | 0) - 1; if (w.get(Math.floor(sx), sy, Math.floor(sz)) !== 0 || w.get(Math.floor(sx), sy + 1, Math.floor(sz)) !== 0) continue; const m = spawnMob(type, w.dim, sx, sy, sz); if (m) { m.persist = true; m.fromSpawner = k + c.cx + ',' + c.cz; s.done++; for (let i = 0; i < 10; i++) smoke(sx, sy + 1, sz, { size: 0.3, life: 0.8, r: 0.6, g: 0.6, b: 0.6 }); } }
    }
  }
}
// ------------------------------------------------------------ hornos
function furnaceTick() {
  for (const key in G.containers) {
    const c = G.containers[key]; if (c.type !== 'furnace') continue;
    const [dim, pos] = key.split(':'); const w = G.worlds[dim]; if (!w) continue; const [x, y, z] = pos.split(',').map(Number); if (!w.chunk(x >> 4, z >> 4)) continue;
    const blk = w.get(x, y, z); const kind = REG[blk] ? REG[blk].smeltKind : null; const speed = kind ? 2 : 1;
    const inp = c.items[0], fuel = c.items[1], out = c.items[2]; const rec = inp ? SMELT[inp.id] : null;
    const canSmelt = rec && (!kind || rec.kind === kind) && (!out || (out.id === rec.out && out.c < REG[out.id].stack));
    if (c.burn > 0) c.burn -= speed;
    if (c.burn <= 0 && canSmelt && fuel && REG[fuel.id].fuel) { c.burn = c.burnMax = REG[fuel.id].fuel; if (fuel.id === ID.lava_bucket) c.items[1] = { id: ID.bucket, c: 1 }; else { fuel.c--; if (fuel.c <= 0) c.items[1] = null; } }
    if (c.burn > 0 && canSmelt) { c.cook = (c.cook || 0) + speed; if (c.cook >= 200) { c.cook = 0; inp.c--; if (inp.c <= 0) c.items[0] = null; if (out) out.c++; else c.items[2] = { id: rec.out, c: 1 }; c.xp = (c.xp || 0) + 0.2; } }
    else c.cook = Math.max(0, (c.cook || 0) - 2);
    const lit = c.burn > 0; if (blk === ID.furnace && lit) w.set(x, y, z, ID.furnace_lit, w.getMeta(x, y, z)); else if (blk === ID.furnace_lit && !lit) w.set(x, y, z, ID.furnace, w.getMeta(x, y, z));
    if (lit && Math.random() < 0.1 && G.player && G.player.dim === dim) { smoke(x + 0.5, y + 1.1, z + 0.5, { size: 0.3, life: 1.5, r: 0.3, g: 0.3, b: 0.3 }); }
  }
}
// ------------------------------------------------------------ comandos
function runCommand(cmd) {
  const a = cmd.trim().slice(1).split(/\s+/); const c = a[0].toLowerCase(); const p = G.player;
  const allowed = G.cheats !== false || (G.net && G.net.role === 'host');
  if (!allowed && c !== 'help' && c !== 'seed') return chatMsg('Los trucos no están activados en este mundo.', '#f88');
  const num = (v, cur) => v === undefined ? cur : v.startsWith('~') ? cur + (+v.slice(1) || 0) : +v;
  switch (c) {
    case 'help': chatMsg('Comandos: /gamemode, /time, /weather, /tp, /give, /kill, /seed, /summon, /spawnpoint, /difficulty, /locate, /clear, /dimension, /gamerule keepInventory, /effect'); break;
    case 'gamemode': case 'gm': { const m = { survival: 'survival', s: 'survival', '0': 'survival', creative: 'creative', c: 'creative', '1': 'creative', spectator: 'spectator', sp: 'spectator', '3': 'spectator', adventure: 'adventure', a: 'adventure', '2': 'adventure' }[a[1]]; if (!m) return chatMsg('Uso: /gamemode <survival|creative|spectator|adventure>', '#f88'); setGameMode(m); chatMsg('Modo de juego cambiado a ' + ({ survival: 'Supervivencia', creative: 'Creativo', spectator: 'Espectador', adventure: 'Aventura' })[m]); break; }
    case 'time': { if (a[1] === 'set') { const v = { day: 1000, noon: 6000, night: 13000, midnight: 18000, sunrise: 23000, sunset: 12000 }[a[2]] ?? +a[2]; G.time = Math.floor(G.time / 24000) * 24000 + (v || 0); } else if (a[1] === 'add') G.time += +a[2] || 0; else return chatMsg('Hora: ' + (G.time % 24000)); chatMsg('Hora establecida a ' + (G.time % 24000)); if (G.net && G.net.role === 'host') netBroadcast({ t: 'time', v: G.time }); break; }
    case 'weather': G.rain = a[1] === 'rain' || a[1] === 'thunder' ? 1 : 0; G.rainTimer = 12000; chatMsg('Clima: ' + (G.rain ? 'lluvia' : 'despejado')); break;
    case 'tp': case 'teleport': { if (a.length >= 4) { p.x = num(a[1], p.x); p.y = num(a[2], p.y + p.world.yOff) - p.world.yOff; p.z = num(a[3], p.z); p.vy = 0; p.fallDist = 0; chatMsg('Teletransportado'); } else if (a[1]) { const t = [...G.entities.values()].find(e => e.name && e.name.toLowerCase() === a[1].toLowerCase()); if (t) { if (t.dim !== p.dim) changeDim(p, t.dim, t.x, t.y, t.z); else { p.x = t.x; p.y = t.y; p.z = t.z; } } else chatMsg('Jugador no encontrado', '#f88'); } break; }
    case 'give': { const n = a[1] ? a[1].replace('minecraft:', '') : ''; const id = ID[n]; if (id === undefined) return chatMsg('Objeto desconocido: ' + n, '#f88'); const cnt = +a[2] || 1; giveItem(p, { id, c: cnt }); chatMsg('Dado ' + cnt + ' x ' + REG[id].disp); break; }
    case 'kill': p.hp = 0; p.die('void'); break;
    case 'seed': chatMsg('Semilla: [' + G.seedStr + ']'); break;
    case 'summon': { const t = a[1]; if (!MOB[t]) return chatMsg('Mob desconocido: ' + t + '. Disponibles: ' + Object.keys(MOB).join(', '), '#f88'); const x = num(a[2], p.x + 2), y = a[3] !== undefined ? num(a[3], p.y + p.world.yOff) - p.world.yOff : p.y, z = num(a[4], p.z); if (G.net && G.net.role === 'client') netSend({ t: 'summon', ty: t, d: p.dim, x, y, z }); else spawnMob(t, p.dim, x, y, z); chatMsg('Invocado ' + mobName(t)); break; }
    case 'spawnpoint': p.spawn = { x: p.x, y: p.y, z: p.z }; chatMsg('Punto de aparición establecido'); break;
    case 'difficulty': { const v = { peaceful: 0, easy: 1, normal: 2, hard: 3, '0': 0, '1': 1, '2': 2, '3': 3 }[a[1]]; if (v === undefined) return chatMsg('Uso: /difficulty <peaceful|easy|normal|hard>'); G.difficulty = v; chatMsg('Dificultad: ' + DIFFNAMES[v]); break; }
    case 'locate': { const name = (a[2] || a[1] || '').replace('structure', ''); const map = { village: 'village', aldea: 'village', stronghold: 'stronghold', fortaleza: 'stronghold', trial_chambers: 'trial_chambers', ancient_city: 'ancient_city', mansion: 'mansion', monument: 'monument', desert_pyramid: 'desert_pyramid', pyramid: 'desert_pyramid', pillager_outpost: 'pillager_outpost', outpost: 'pillager_outpost', mineshaft: 'mineshaft', shipwreck: 'shipwreck', jungle_temple: 'jungle_temple', fortress: 'nether_fortress', nether_fortress: 'nether_fortress', bastion: 'bastion', bastion_remnant: 'bastion', end_city: 'end_city', ruined_portal: 'ruined_portal', dungeon: 'dungeon' }; const st = map[name]; if (!st) return chatMsg('Estructuras: ' + Object.keys(map).join(', '), '#f88'); const sd = STRUCTS.find(s => s.name === st); if (sd.dim !== p.dim) return chatMsg('Esa estructura no está en esta dimensión.', '#f88'); const r = p.world.gen.structuresNear(st, p.x, p.z); if (!r) return chatMsg('No se encontró cerca.', '#f88'); chatMsg('La estructura más cercana está en X=' + r.x + ' Z=' + r.z + ' (' + Math.round(Math.hypot(r.x - p.x, r.z - p.z)) + ' bloques)', '#8f8'); break; }
    case 'clear': p.inv.fill(null); p.armor.fill(null); updateHUD(); chatMsg('Inventario vaciado'); break;
    case 'dimension': case 'tpdim': { const d = a[1]; if (!G.worlds[d]) return chatMsg('Uso: /dimension <overworld|nether|end>', '#f88'); if (d === 'end') travelPortal(p, 2); else { const w = G.worlds[d]; const x = d === 'nether' ? p.x / 8 : p.x * 8, z = d === 'nether' ? p.z / 8 : p.z * 8; ensureArea(w, x, z, 1); let y = d === 'nether' ? 64 : w.surfaceY(Math.floor(x), Math.floor(z)) + 1; if (d === 'nether') { for (let yy = 40; yy < 110; yy++) if (w.get(Math.floor(x), yy - 1, Math.floor(z)) > 0 && REG[w.get(Math.floor(x), yy - 1, Math.floor(z))].solid && w.get(Math.floor(x), yy, Math.floor(z)) === 0 && w.get(Math.floor(x), yy + 1, Math.floor(z)) === 0) { y = yy; break; } } changeDim(p, d, x, y, z); } break; }
    case 'gamerule': if ((a[1] || '').toLowerCase() === 'keepinventory') { G.keepInventory = a[2] === 'true'; chatMsg('keepInventory = ' + G.keepInventory); } break;
    case 'effect': { const e = a[2] || a[1]; const map = { speed: 'speed', velocidad: 'speed', regeneration: 'regen', jump_boost: 'jump', haste: 'haste', resistance: 'resistance', night_vision: 'night' }; if (map[e]) { p.effects[map[e]] = 20 * (+a[3] || 60); chatMsg('Efecto aplicado: ' + e); } else chatMsg('Efectos: ' + Object.keys(map).join(', ')); break; }
    default: chatMsg('Comando desconocido. Escribe /help', '#f88');
  }
}
const DIFFNAMES = ['Pacífico', 'Fácil', 'Normal', 'Difícil'];
function setGameMode(m) { G.gameMode = m; const p = G.player; if (m !== 'creative' && m !== 'spectator') p.flying = false; if (m === 'spectator') p.flying = true; updateHUD(); if (G.net) netSend({ t: 'gm', m }); }
