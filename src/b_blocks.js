// ============================================================================
//  Registro de bloques, objetos y texturas procedurales
// ============================================================================
const REG = [];          // id -> def
const ID = {};           // name -> id
const TEXNAMES = [];     // layer -> name
const TEX = {};          // name -> layer
function texLayer(name) { if (TEX[name] === undefined) { TEX[name] = TEXNAMES.length; TEXNAMES.push(name); } return TEX[name]; }

let _nextBlock = 0, _nextItem = 256;
// render: cube | cross | liquid | box | snow | none
function defB(name, disp, o = {}) {
  const id = _nextBlock++;
  const d = Object.assign({
    id, name, disp, isBlock: true, solid: true, opaque: true, render: 'cube', trans: 0, hard: 1, tool: null, lvl: 0,
    drop: name, light: 0, liquid: 0, replace: false, att: 0, stack: 64, tint: 0, wave: 0, flammable: false, blast: null
  }, o);
  if (d.render !== 'cube') d.opaque = o.opaque === true;
  if (d.trans) d.opaque = false;
  if (d.box && o.solid === undefined) d.solid = true;
  let t = o.tex || name;
  if (typeof t === 'string') t = { top: t, bottom: t, side: t };
  t = Object.assign({}, t); if (!t.bottom) t.bottom = t.top; if (!t.front) t.front = t.side; if (!t.back) t.back = t.side;
  d.faces = [texLayer(t.side), texLayer(t.side), texLayer(t.top), texLayer(t.bottom), texLayer(t.back), texLayer(t.front)];
  d.texNames = t;
  if (d.blast === null) d.blast = d.hard < 0 ? 3600000 : d.hard * 2.5;
  REG[id] = d; ID[name] = id; return id;
}
function defI(name, disp, o = {}) {
  const id = _nextItem++;
  const d = Object.assign({ id, name, disp, isBlock: false, stack: 64 }, o);
  d.icon = texLayer(o.tex || name);
  REG[id] = d; ID[name] = id; return id;
}
const PL = { solid: false, render: 'cross', hard: 0, replace: false, drop: null };
// -------------------------------------------------------------------- BLOQUES
defB('air', 'Aire', { solid: false, opaque: false, render: 'none', replace: true, drop: null, tex: 'stone' });
defB('stone', 'Piedra', { hard: 1.5, tool: 'pickaxe', lvl: 1, drop: 'cobblestone' });
defB('grass_block', 'Bloque de hierba', { tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hard: 0.6, tool: 'shovel', drop: 'dirt', tintTop: true });
defB('dirt', 'Tierra', { hard: 0.5, tool: 'shovel' });
defB('cobblestone', 'Roca', { hard: 2, tool: 'pickaxe', lvl: 1 });
defB('bedrock', 'Piedra base', { hard: -1, drop: null });
defB('sand', 'Arena', { hard: 0.5, tool: 'shovel', gravity: true });
defB('red_sand', 'Arena roja', { hard: 0.5, tool: 'shovel', gravity: true });
defB('gravel', 'Grava', { hard: 0.6, tool: 'shovel', gravity: true });
defB('clay', 'Arcilla', { hard: 0.6, tool: 'shovel', drop: 'clay_ball', dropN: 4 });
defB('mud', 'Barro', { hard: 0.5, tool: 'shovel' });
defB('granite', 'Granito', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('diorite', 'Diorita', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('andesite', 'Andesita', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('deepslate', 'Pizarra profunda', { tex: { top: 'deepslate_top', side: 'deepslate' }, hard: 3, tool: 'pickaxe', lvl: 1, drop: 'cobbled_deepslate' });
defB('cobbled_deepslate', 'Pizarra profunda labrada', { hard: 3.5, tool: 'pickaxe', lvl: 1 });
defB('deepslate_bricks', 'Ladrillos de pizarra profunda', { hard: 3.5, tool: 'pickaxe', lvl: 1 });
defB('deepslate_tiles', 'Baldosas de pizarra profunda', { hard: 3.5, tool: 'pickaxe', lvl: 1 });
defB('reinforced_deepslate', 'Pizarra profunda reforzada', { hard: -1, drop: null });
defB('tuff', 'Toba', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('tuff_bricks', 'Ladrillos de toba', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('calcite', 'Calcita', { hard: 0.75, tool: 'pickaxe', lvl: 1 });
defB('dripstone_block', 'Bloque de espeleotema', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('pointed_dripstone', 'Espeleotema puntiagudo', { render: 'box', box: [5, 0, 5, 11, 16, 11], hard: 1.5, tool: 'pickaxe', solid: true });
defB('moss_block', 'Bloque de musgo', { hard: 0.1, tool: 'axe' });
defB('azalea_leaves', 'Hojas de azalea', { trans: 1, hard: 0.2, att: 1, wave: 1, drop: null, flammable: true });
defB('cave_vines', 'Enredaderas luminosas', Object.assign({}, PL, { light: 14, drop: 'glow_berries' }));
defB('sculk', 'Sculk', { hard: 0.2, tool: 'hoe', drop: 'sculk' });
defB('sculk_sensor', 'Sensor de sculk', { render: 'box', box: [0, 0, 0, 16, 8, 16], light: 1, hard: 1.5, tex: { top: 'sculk_sensor_top', side: 'sculk_sensor_side', bottom: 'sculk' } });
defB('soul_lantern', 'Farol de almas', { render: 'box', box: [5, 0, 5, 11, 7, 11], light: 10, hard: 3.5, tool: 'pickaxe' });
// troncos / tablones / hojas
for (const [w, dn] of [['oak', 'roble'], ['spruce', 'abeto'], ['birch', 'abedul'], ['jungle', 'jungla'], ['acacia', 'acacia'], ['dark_oak', 'roble oscuro'], ['mangrove', 'mangle']]) {
  defB(w + '_log', 'Tronco de ' + dn, { tex: { top: w + '_log_top', side: w + '_log' }, hard: 2, tool: 'axe', flammable: true, log: true });
  defB(w + '_planks', 'Tablones de ' + dn, { hard: 2, tool: 'axe', flammable: true, planks: true });
  defB(w + '_leaves', 'Hojas de ' + dn, { trans: 1, hard: 0.2, att: 1, wave: 1, drop: null, flammable: true, tint: (w === 'spruce' || w === 'birch') ? 0 : 2, leaves: w });
  defB(w + '_sapling', 'Brote de ' + dn, Object.assign({}, PL, { drop: w + '_sapling', sapling: w }));
}
defB('mangrove_roots', 'Raíces de mangle', { trans: 1, hard: 0.7, tool: 'axe', att: 1 });
defB('glass', 'Cristal', { trans: 1, hard: 0.3, drop: null, cullSelf: true });
defB('water', 'Agua', { solid: false, render: 'liquid', trans: 2, liquid: 1, hard: -2, drop: null, replace: true, att: 2, cullSelf: true });
defB('lava', 'Lava', { solid: false, render: 'liquid', liquid: 2, hard: -2, drop: null, replace: true, light: 15, att: 15, cullSelf: true });
// menas
const ORES = [['coal', 'carbón', 1, 'coal', 1], ['iron', 'hierro', 2, 'raw_iron', 1], ['copper', 'cobre', 2, 'raw_copper', 3], ['gold', 'oro', 3, 'raw_gold', 1], ['redstone', 'redstone', 3, 'redstone', 4], ['lapis', 'lapislázuli', 2, 'lapis_lazuli', 5], ['diamond', 'diamante', 3, 'diamond', 1], ['emerald', 'esmeralda', 3, 'emerald', 1]];
for (const [o, dn, lvl, drop, n] of ORES) {
  defB(o + '_ore', 'Mena de ' + dn, { hard: 3, tool: 'pickaxe', lvl, drop, dropN: n, light: o === 'redstone' ? 0 : 0 });
  defB('deepslate_' + o + '_ore', 'Mena de ' + dn + ' de pizarra profunda', { hard: 4.5, tool: 'pickaxe', lvl, drop, dropN: n });
}
defB('crafting_table', 'Mesa de trabajo', { tex: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side', front: 'crafting_table_front' }, hard: 2.5, tool: 'axe', ui: 'craft', flammable: true });
defB('furnace', 'Horno', { tex: { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, hard: 3.5, tool: 'pickaxe', lvl: 1, ui: 'furnace', orient: true });
defB('furnace_lit', 'Horno encendido', { tex: { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit' }, hard: 3.5, tool: 'pickaxe', lvl: 1, ui: 'furnace', drop: 'furnace', light: 13, orient: true });
defB('chest', 'Cofre', { tex: { top: 'chest_top', side: 'chest_side', front: 'chest_front' }, hard: 2.5, tool: 'axe', ui: 'chest', orient: true });
defB('smithing_table', 'Mesa de herrería', { tex: { top: 'smithing_table_top', bottom: 'smithing_table_bottom', side: 'smithing_table_side' }, hard: 2.5, tool: 'axe', ui: 'smith' });
defB('bookshelf', 'Librería', { tex: { top: 'oak_planks', side: 'bookshelf' }, hard: 1.5, tool: 'axe', flammable: true });
defB('bricks', 'Ladrillos', { hard: 2, tool: 'pickaxe', lvl: 1 });
defB('stone_bricks', 'Ladrillos de piedra', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('mossy_stone_bricks', 'Ladrillos de piedra musgosos', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('cracked_stone_bricks', 'Ladrillos de piedra agrietados', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('chiseled_stone_bricks', 'Ladrillos de piedra cincelados', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('mossy_cobblestone', 'Roca musgosa', { hard: 2, tool: 'pickaxe', lvl: 1 });
defB('smooth_stone', 'Piedra lisa', { hard: 2, tool: 'pickaxe', lvl: 1 });
defB('stone_slab', 'Losa de piedra', { render: 'box', box: [0, 0, 0, 16, 8, 16], tex: 'smooth_stone', hard: 2, tool: 'pickaxe', lvl: 1 });
defB('oak_slab', 'Losa de roble', { render: 'box', box: [0, 0, 0, 16, 8, 16], tex: 'oak_planks', hard: 2, tool: 'axe' });
defB('snow_block', 'Bloque de nieve', { tex: 'snow', hard: 0.2, tool: 'shovel', drop: 'snowball', dropN: 4 });
defB('snow', 'Capa de nieve', { render: 'snow', solid: true, opaque: false, hard: 0.1, tool: 'shovel', drop: 'snowball', replace: true, tex: 'snow' });
defB('snowy_grass', 'Hierba nevada', { tex: { top: 'snow', bottom: 'dirt', side: 'grass_snow_side' }, hard: 0.6, tool: 'shovel', drop: 'dirt' });
defB('ice', 'Hielo', { trans: 2, hard: 0.5, tool: 'pickaxe', drop: null, att: 1, cullSelf: true, slip: true });
defB('packed_ice', 'Hielo compacto', { hard: 0.5, tool: 'pickaxe', drop: null, slip: true });
defB('sandstone', 'Arenisca', { tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' }, hard: 0.8, tool: 'pickaxe', lvl: 1 });
defB('chiseled_sandstone', 'Arenisca cincelada', { tex: { top: 'sandstone_top', side: 'chiseled_sandstone' }, hard: 0.8, tool: 'pickaxe', lvl: 1 });
defB('cut_sandstone', 'Arenisca cortada', { tex: { top: 'sandstone_top', side: 'cut_sandstone' }, hard: 0.8, tool: 'pickaxe', lvl: 1 });
defB('terracotta', 'Terracota', { hard: 1.25, tool: 'pickaxe', lvl: 1 });
defB('orange_terracotta', 'Terracota naranja', { hard: 1.25, tool: 'pickaxe', lvl: 1 });
defB('blue_terracotta', 'Terracota azul', { hard: 1.25, tool: 'pickaxe', lvl: 1 });
defB('cactus', 'Cactus', { tex: { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side' }, hard: 0.4, hurt: 1 });
defB('pumpkin', 'Calabaza', { tex: { top: 'pumpkin_top', side: 'pumpkin_side' }, hard: 1, tool: 'axe' });
defB('jack_o_lantern', 'Calabaza iluminada', { tex: { top: 'pumpkin_top', side: 'pumpkin_side', front: 'jack_o_lantern' }, hard: 1, tool: 'axe', light: 15, orient: true });
defB('melon', 'Sandía', { tex: { top: 'melon_top', side: 'melon_side' }, hard: 1, tool: 'axe', drop: 'melon_slice', dropN: 5 });
defB('hay_block', 'Fardo de heno', { tex: { top: 'hay_top', side: 'hay_side' }, hard: 0.5, flammable: true });
defB('farmland', 'Tierra de cultivo', { render: 'box', box: [0, 0, 0, 16, 15, 16], tex: { top: 'farmland', side: 'dirt' }, hard: 0.6, tool: 'shovel', drop: 'dirt' });
defB('wheat', 'Trigo', Object.assign({}, PL, { drop: 'wheat', dropN: 1 }));
defB('dirt_path', 'Camino de tierra', { render: 'box', box: [0, 0, 0, 16, 15, 16], tex: { top: 'path_top', side: 'path_side', bottom: 'dirt' }, hard: 0.65, tool: 'shovel', drop: 'dirt' });
defB('obsidian', 'Obsidiana', { hard: 50, tool: 'pickaxe', lvl: 4, blast: 3600 });
defB('crying_obsidian', 'Obsidiana llorosa', { hard: 50, tool: 'pickaxe', lvl: 4, light: 10, blast: 3600 });
defB('torch', 'Antorcha', { render: 'box', box: [7, 0, 7, 9, 10, 9], solid: false, light: 14, hard: 0, tex: { top: 'torch_top', side: 'torch', bottom: 'torch' }, emissive: true });
defB('lantern', 'Farol', { render: 'box', box: [5, 0, 5, 11, 7, 11], light: 15, hard: 3.5, tool: 'pickaxe', emissive: true });
defB('end_rod', 'Vara del End', { render: 'box', box: [7, 0, 7, 9, 16, 9], solid: false, light: 14, hard: 0, emissive: true });
defB('fire', 'Fuego', { solid: false, render: 'fire', light: 15, hard: 0, drop: null, replace: true, hurt: 1, emissive: true });
defB('cobweb', 'Telaraña', Object.assign({}, PL, { hard: 4, drop: 'string', slow: true }));
defB('poppy', 'Amapola', PL); defB('dandelion', 'Diente de león', PL); defB('blue_orchid', 'Orquídea azul', PL);
defB('cornflower', 'Aciano', PL); defB('oxeye_daisy', 'Margarita', PL);
defB('tall_grass', 'Hierba alta', Object.assign({}, PL, { replace: true, tint: 1, drop: 'wheat_seeds', dropChance: 0.12, wave: 2 }));
defB('fern', 'Helecho', Object.assign({}, PL, { replace: true, tint: 1, wave: 2 }));
defB('dead_bush', 'Arbusto seco', Object.assign({}, PL, { replace: true, drop: 'stick' }));
defB('brown_mushroom', 'Champiñón marrón', PL); defB('red_mushroom', 'Champiñón rojo', PL);
defB('sugar_cane', 'Caña de azúcar', Object.assign({}, PL, { drop: 'sugar_cane_item' }));
defB('lily_pad', 'Nenúfar', { render: 'box', box: [0, 0, 0, 16, 1, 16], hard: 0, trans: 1, tint: 2, drop: 'lily_pad' });
defB('vine', 'Enredadera', Object.assign({}, PL, { tint: 2, replace: true, drop: null, climb: true }));
defB('ladder', 'Escalera de mano', Object.assign({}, PL, { climb: true, drop: 'ladder', hard: 0.4 }));
defB('iron_bars', 'Barrotes de hierro', { trans: 1, hard: 5, tool: 'pickaxe', cullSelf: true });
defB('oak_fence', 'Valla de roble', { render: 'box', box: [6, 0, 6, 10, 16, 10], tex: 'oak_planks', hard: 2, tool: 'axe', fenceH: 1.5 });
defB('dark_oak_fence', 'Valla de roble oscuro', { render: 'box', box: [6, 0, 6, 10, 16, 10], tex: 'dark_oak_planks', hard: 2, tool: 'axe', fenceH: 1.5 });
defB('rail', 'Raíl', { render: 'box', box: [0, 0, 0, 16, 1, 16], trans: 1, solid: false, hard: 0.7 });
// minerales en bloque
for (const [m, dn] of [['iron', 'hierro'], ['gold', 'oro'], ['diamond', 'diamante'], ['emerald', 'esmeralda'], ['netherite', 'netherita'], ['coal', 'carbón'], ['lapis', 'lapislázuli'], ['redstone', 'redstone'], ['copper', 'cobre']])
  defB(m + '_block', 'Bloque de ' + dn, { hard: m === 'netherite' ? 50 : 5, tool: 'pickaxe', lvl: m === 'netherite' ? 4 : (m === 'iron' || m === 'lapis' || m === 'copper' ? 2 : m === 'coal' || m === 'redstone' ? 1 : 3) });
defB('raw_iron_block', 'Bloque de hierro en bruto', { hard: 5, tool: 'pickaxe', lvl: 2 });
defB('raw_gold_block', 'Bloque de oro en bruto', { hard: 5, tool: 'pickaxe', lvl: 3 });
defB('cut_copper', 'Cobre cortado', { hard: 3, tool: 'pickaxe', lvl: 2 });
defB('oxidized_copper', 'Cobre oxidado', { hard: 3, tool: 'pickaxe', lvl: 2 });
defB('oxidized_cut_copper', 'Cobre cortado oxidado', { hard: 3, tool: 'pickaxe', lvl: 2 });
defB('copper_grate', 'Rejilla de cobre', { trans: 1, hard: 3, tool: 'pickaxe', lvl: 2 });
defB('chiseled_tuff', 'Toba cincelada', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('polished_tuff', 'Toba pulida', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('trial_spawner', 'Generador de desafío', { trans: 1, hard: 50, drop: null, light: 4 });
defB('vault', 'Bóveda', { tex: { top: 'vault_top', side: 'vault_side', front: 'vault_front' }, hard: 50, ui: 'vault', light: 6, drop: null });
// lanas
for (const [c, dn] of [['white', 'blanca'], ['orange', 'naranja'], ['yellow', 'amarilla'], ['lime', 'lima'], ['light_blue', 'azul claro'], ['blue', 'azul'], ['purple', 'morada'], ['red', 'roja'], ['black', 'negra'], ['green', 'verde']])
  defB(c + '_wool', 'Lana ' + dn, { hard: 0.8, flammable: true });
defB('tnt', 'Dinamita', { tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hard: 0, tnt: true });
defB('bed', 'Cama', { render: 'box', box: [0, 0, 0, 16, 9, 16], tex: { top: 'bed_top', side: 'bed_side', bottom: 'oak_planks' }, hard: 0.2, ui: 'bed' });
defB('spawner', 'Generador de monstruos', { trans: 1, hard: 5, tool: 'pickaxe', lvl: 1, drop: null });
defB('sponge', 'Esponja', { hard: 0.6 });
defB('wet_sponge', 'Esponja mojada', { hard: 0.6 });
defB('prismarine', 'Prismarina', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('prismarine_bricks', 'Ladrillos de prismarina', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('dark_prismarine', 'Prismarina oscura', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('sea_lantern', 'Linterna marina', { hard: 0.3, light: 15, emissive: true });
defB('kelp', 'Algas', Object.assign({}, PL, { wave: 2, inWater: true }));
defB('seagrass', 'Pasto marino', Object.assign({}, PL, { wave: 2, inWater: true, replace: true }));
defB('cobblestone_wall', 'Muro de roca', { render: 'box', box: [4, 0, 4, 12, 16, 12], tex: 'cobblestone', hard: 2, tool: 'pickaxe', lvl: 1, fenceH: 1.5 });
// nether
defB('netherrack', 'Netherrack', { hard: 0.4, tool: 'pickaxe', lvl: 1, infiniteFire: true });
defB('soul_sand', 'Arena de almas', { hard: 0.5, tool: 'shovel', slowWalk: true });
defB('soul_soil', 'Tierra de almas', { hard: 0.5, tool: 'shovel' });
defB('glowstone', 'Piedra luminosa', { hard: 0.3, light: 15, drop: 'glowstone_dust', dropN: 3, emissive: true });
defB('nether_bricks', 'Ladrillos del Nether', { hard: 2, tool: 'pickaxe', lvl: 1 });
defB('red_nether_bricks', 'Ladrillos del Nether rojos', { hard: 2, tool: 'pickaxe', lvl: 1 });
defB('nether_brick_fence', 'Valla de ladrillo del Nether', { render: 'box', box: [6, 0, 6, 10, 16, 10], tex: 'nether_bricks', hard: 2, tool: 'pickaxe', lvl: 1, fenceH: 1.5 });
defB('nether_quartz_ore', 'Mena de cuarzo del Nether', { tex: 'nether_quartz_ore', hard: 3, tool: 'pickaxe', lvl: 1, drop: 'quartz' });
defB('nether_gold_ore', 'Mena de oro del Nether', { hard: 3, tool: 'pickaxe', lvl: 1, drop: 'gold_nugget', dropN: 4 });
defB('ancient_debris', 'Escombros ancestrales', { tex: { top: 'ancient_debris_top', side: 'ancient_debris_side' }, hard: 30, tool: 'pickaxe', lvl: 4, blast: 3600 });
defB('magma_block', 'Bloque de magma', { hard: 0.5, tool: 'pickaxe', lvl: 1, light: 3, hurt: 1, emissive: true });
defB('basalt', 'Basalto', { tex: { top: 'basalt_top', side: 'basalt_side' }, hard: 1.25, tool: 'pickaxe', lvl: 1 });
defB('blackstone', 'Piedra negra', { tex: { top: 'blackstone_top', side: 'blackstone' }, hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('polished_blackstone_bricks', 'Ladrillos de piedra negra pulida', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('gilded_blackstone', 'Piedra negra dorada', { hard: 1.5, tool: 'pickaxe', lvl: 1, drop: 'gold_nugget', dropN: 3 });
defB('crimson_nylium', 'Necilio carmesí', { tex: { top: 'crimson_nylium', bottom: 'netherrack', side: 'crimson_nylium_side' }, hard: 0.4, tool: 'pickaxe', drop: 'netherrack' });
defB('warped_nylium', 'Necilio distorsionado', { tex: { top: 'warped_nylium', bottom: 'netherrack', side: 'warped_nylium_side' }, hard: 0.4, tool: 'pickaxe', drop: 'netherrack' });
defB('crimson_stem', 'Tallo carmesí', { tex: { top: 'crimson_stem_top', side: 'crimson_stem' }, hard: 2, tool: 'axe', log: true });
defB('warped_stem', 'Tallo distorsionado', { tex: { top: 'warped_stem_top', side: 'warped_stem' }, hard: 2, tool: 'axe', log: true });
defB('crimson_planks', 'Tablones carmesí', { hard: 2, tool: 'axe', planks: true });
defB('warped_planks', 'Tablones distorsionados', { hard: 2, tool: 'axe', planks: true });
defB('nether_wart_block', 'Bloque de verruga del Nether', { hard: 1, tool: 'hoe' });
defB('warped_wart_block', 'Bloque de verruga distorsionada', { hard: 1, tool: 'hoe' });
defB('shroomlight', 'Brillongo', { hard: 1, light: 15, emissive: true });
defB('crimson_fungus', 'Hongo carmesí', PL); defB('warped_fungus', 'Hongo distorsionado', PL);
defB('crimson_roots', 'Raíces carmesí', Object.assign({}, PL, { replace: true })); defB('warped_roots', 'Raíces distorsionadas', Object.assign({}, PL, { replace: true }));
defB('weeping_vines', 'Enredaderas lloronas', Object.assign({}, PL, { climb: true }));
defB('nether_portal', 'Portal del Nether', { solid: false, trans: 2, hard: -1, light: 11, drop: null, cullSelf: true, portal: 1 });
// end
defB('end_stone', 'Piedra del End', { hard: 3, tool: 'pickaxe', lvl: 1 });
defB('end_stone_bricks', 'Ladrillos de piedra del End', { hard: 3, tool: 'pickaxe', lvl: 1 });
defB('purpur_block', 'Bloque de púrpur', { hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('purpur_pillar', 'Pilar de púrpur', { tex: { top: 'purpur_pillar_top', side: 'purpur_pillar' }, hard: 1.5, tool: 'pickaxe', lvl: 1 });
defB('end_portal_frame', 'Marco del portal del End', { render: 'box', box: [0, 0, 0, 16, 13, 16], tex: { top: 'end_portal_frame_top', bottom: 'end_stone', side: 'end_portal_frame_side' }, hard: -1, drop: null });
defB('end_portal_frame_eye', 'Marco del portal del End (con ojo)', { render: 'box', box: [0, 0, 0, 16, 13, 16], tex: { top: 'end_portal_frame_eye', bottom: 'end_stone', side: 'end_portal_frame_side' }, hard: -1, drop: null, light: 1 });
defB('end_portal', 'Portal del End', { solid: false, render: 'box', box: [0, 0, 0, 16, 12, 16], hard: -1, light: 15, drop: null, portal: 2, opaque: false, endPortal: true });
defB('end_gateway', 'Acceso del End', { solid: false, hard: -1, light: 15, drop: null, portal: 3, endPortal: true });
defB('dragon_egg', 'Huevo de dragón', { hard: 3, gravity: true });
defB('chorus_plant', 'Planta coral', { hard: 0.4, tool: 'axe', drop: 'chorus_fruit' });
defB('chorus_flower', 'Flor coral', { hard: 0.4, tool: 'axe' });

// ---- adicionales esenciales
defB('cherry_log', 'Tronco de cerezo', { tex: { top: 'cherry_log_top', side: 'cherry_log' }, hard: 2, tool: 'axe', flammable: true, log: true });
defB('cherry_planks', 'Tablones de cerezo', { hard: 2, tool: 'axe', flammable: true, planks: true });
defB('cherry_leaves', 'Hojas de cerezo', { trans: 1, hard: 0.2, att: 1, wave: 1, drop: null, flammable: true, leaves: 'cherry' });
defB('cherry_sapling', 'Brote de cerezo', Object.assign({}, PL, { drop: 'cherry_sapling', sapling: 'cherry' }));
defB('pink_petals', 'Pétalos rosas', { render: 'box', box: [0, 0, 0, 16, 1, 16], trans: 1, solid: false, hard: 0, replace: true });
defB('blast_furnace', 'Alto horno', { tex: { top: 'blast_furnace_top', side: 'blast_furnace_side', front: 'blast_furnace_front' }, hard: 3.5, tool: 'pickaxe', lvl: 1, ui: 'furnace', orient: true, smeltKind: 'ore' });
defB('smoker', 'Ahumador', { tex: { top: 'smoker_top', side: 'smoker_side', front: 'smoker_front' }, hard: 3.5, tool: 'axe', ui: 'furnace', orient: true, smeltKind: 'food' });
defB('barrel', 'Barril', { tex: { top: 'barrel_top', bottom: 'barrel_bottom', side: 'barrel_side' }, hard: 2.5, tool: 'axe', ui: 'chest' });
defB('ender_chest', 'Cofre de ender', { tex: { top: 'ender_chest_top', side: 'ender_chest_side', front: 'ender_chest_front' }, hard: 22.5, tool: 'pickaxe', lvl: 1, ui: 'ender', light: 7, orient: true, drop: 'obsidian', dropN: 8 });
defB('soul_torch', 'Antorcha de almas', { render: 'box', box: [7, 0, 7, 9, 10, 9], solid: false, light: 10, hard: 0, tex: { top: 'soul_torch_top', side: 'soul_torch', bottom: 'soul_torch' }, emissive: true });
defB('amethyst_block', 'Bloque de amatista', { hard: 1.5, tool: 'pickaxe' });
defB('budding_amethyst', 'Amatista brotante', { hard: 1.5, tool: 'pickaxe', drop: null });
defB('amethyst_cluster', 'Racimo de amatista', Object.assign({}, PL, { light: 5, drop: 'amethyst_shard', dropN: 4, hard: 1.5, tool: 'pickaxe', emissive: true }));
defB('ochre_froglight', 'Ranaluz ocre', { hard: 0.3, light: 15, emissive: true });
defB('verdant_froglight', 'Ranaluz verdosa', { hard: 0.3, light: 15, emissive: true });
defB('pearlescent_froglight', 'Ranaluz perlada', { hard: 0.3, light: 15, emissive: true });
defB('slime_block', 'Bloque de slime', { trans: 2, hard: 0, bouncy: true, cullSelf: true });
defB('honey_block', 'Bloque de miel', { trans: 2, hard: 0, sticky: true, cullSelf: true });
defB('anvil', 'Yunque', { render: 'box', box: [2, 0, 2, 14, 16, 14], hard: 5, tool: 'pickaxe', lvl: 1, ui: 'anvil' });
defB('enchanting_table', 'Mesa de encantamientos', { render: 'box', box: [0, 0, 0, 16, 12, 16], tex: { top: 'enchanting_table_top', side: 'enchanting_table_side', bottom: 'obsidian' }, hard: 5, tool: 'pickaxe', lvl: 1, light: 7, ui: 'enchant' });
defB('scaffolding', 'Andamio', { trans: 1, hard: 0, climb: true });
defB('note_block', 'Bloque musical', { tex: 'note_block', hard: 0.8, tool: 'axe' });
defB('target', 'Diana', { tex: { top: 'target_top', side: 'target_side' }, hard: 0.5 });
defB('redstone_lamp', 'Lámpara de redstone', { hard: 0.3 });
defB('redstone_torch', 'Antorcha de redstone', { render: 'box', box: [7, 0, 7, 9, 10, 9], solid: false, light: 7, hard: 0, tex: { top: 'redstone_torch_top', side: 'redstone_torch', bottom: 'redstone_torch' }, emissive: true });
defB('lever', 'Palanca', { render: 'box', box: [5, 0, 4, 11, 3, 12], solid: false, hard: 0.5, tex: 'cobblestone' });
defB('stone_button', 'Botón de piedra', { render: 'box', box: [5, 0, 6, 11, 2, 10], solid: false, hard: 0.5, tex: 'stone' });
defB('stone_pressure_plate', 'Placa de presión de piedra', { render: 'box', box: [1, 0, 1, 15, 1, 15], solid: false, hard: 0.5, tex: 'stone' });
defB('lightning_rod', 'Pararrayos', { render: 'box', box: [6, 0, 6, 10, 16, 10], hard: 3, tool: 'pickaxe', tex: 'copper_block' });
defB('daylight_detector', 'Sensor de luz solar', { render: 'box', box: [0, 0, 0, 16, 6, 16], tex: { top: 'daylight_top', side: 'oak_planks' }, hard: 0.2, tool: 'axe' });
defB('mud_bricks', 'Ladrillos de barro', { hard: 1.5, tool: 'pickaxe' });
defB('honeycomb_block', 'Bloque de panal', { hard: 0.6 });
defB('bee_nest', 'Colmena', { tex: { top: 'bee_nest_top', side: 'bee_nest_side', front: 'bee_nest_front' }, hard: 0.3, tool: 'axe', orient: true });
defB('mushroom_stem', 'Tallo de champiñón', { hard: 0.2, tool: 'axe', drop: null });
const BLOCK_COUNT = _nextBlock;
if (BLOCK_COUNT > 255) console.error('Demasiados bloques', BLOCK_COUNT);

// -------------------------------------------------------------------- OBJETOS
defI('stick', 'Palo', { fuel: 100 });
defI('coal', 'Carbón', { fuel: 1600 }); defI('charcoal', 'Carbón vegetal', { fuel: 1600 });
defI('raw_iron', 'Hierro en bruto'); defI('raw_gold', 'Oro en bruto'); defI('raw_copper', 'Cobre en bruto');
defI('iron_ingot', 'Lingote de hierro'); defI('gold_ingot', 'Lingote de oro'); defI('copper_ingot', 'Lingote de cobre');
defI('gold_nugget', 'Pepita de oro'); defI('iron_nugget', 'Pepita de hierro');
defI('diamond', 'Diamante'); defI('emerald', 'Esmeralda'); defI('netherite_scrap', 'Fragmento de netherita'); defI('netherite_ingot', 'Lingote de netherita');
defI('redstone', 'Polvo de redstone'); defI('lapis_lazuli', 'Lapislázuli'); defI('quartz', 'Cuarzo del Nether'); defI('glowstone_dust', 'Polvo de piedra luminosa');
defI('flint', 'Pedernal'); defI('string', 'Cuerda'); defI('feather', 'Pluma'); defI('gunpowder', 'Pólvora'); defI('bone', 'Hueso'); defI('bone_meal', 'Polvo de hueso');
defI('leather', 'Cuero'); defI('rotten_flesh', 'Carne podrida', { food: [4, 0.8] }); defI('ender_pearl', 'Perla de ender', { stack: 16, throwable: 'pearl' });
defI('blaze_rod', 'Vara de blaze', { fuel: 2400 }); defI('blaze_powder', 'Polvo de blaze'); defI('eye_of_ender', 'Ojo de ender', { throwable: 'eye' });
defI('clay_ball', 'Bola de arcilla'); defI('brick', 'Ladrillo'); defI('snowball', 'Bola de nieve', { stack: 16, throwable: 'snowball' });
defI('wheat_seeds', 'Semillas de trigo', { places: 'wheat' }); defI('wheat', 'Trigo'); defI('sugar_cane_item', 'Caña de azúcar', { places: 'sugar_cane', tex: 'sugar_cane' }); defI('paper', 'Papel');
defI('glow_berries', 'Bayas luminosas', { food: [2, 0.4] }); defI('chorus_fruit', 'Fruta coral', { food: [4, 2.4] });
defI('apple', 'Manzana', { food: [4, 2.4] }); defI('golden_apple', 'Manzana dorada', { food: [4, 9.6], regen: true });
defI('bread', 'Pan', { food: [5, 6] }); defI('melon_slice', 'Rodaja de sandía', { food: [2, 1.2] });
defI('porkchop', 'Chuleta de cerdo cruda', { food: [3, 1.8] }); defI('cooked_porkchop', 'Chuleta de cerdo cocinada', { food: [8, 12.8] });
defI('beef', 'Filete crudo', { food: [3, 1.8] }); defI('cooked_beef', 'Filete cocinado', { food: [8, 12.8] });
defI('chicken', 'Pollo crudo', { food: [2, 1.2] }); defI('cooked_chicken', 'Pollo cocinado', { food: [6, 7.2] });
defI('mutton', 'Cordero crudo', { food: [2, 1.2] }); defI('cooked_mutton', 'Cordero cocinado', { food: [6, 9.6] });
defI('cod', 'Bacalao crudo', { food: [2, 0.4] }); defI('cooked_cod', 'Bacalao cocinado', { food: [5, 6] });
defI('bucket', 'Cubo', { stack: 16, bucket: 0 }); defI('water_bucket', 'Cubo de agua', { stack: 1, bucket: 1 }); defI('lava_bucket', 'Cubo de lava', { stack: 1, bucket: 2, fuel: 20000 });
defI('flint_and_steel', 'Mechero', { stack: 1, dur: 64 });
defI('bow', 'Arco', { stack: 1, dur: 384, bow: true }); defI('arrow', 'Flecha');
defI('shield', 'Escudo', { stack: 1, dur: 336 });
defI('elytra', 'Élitros', { stack: 1, dur: 432, armor: { slot: 1, pts: 0 }, elytra: true });
defI('totem', 'Tótem de la inmortalidad', { stack: 1 });
defI('ominous_key', 'Llave de desafío', { stack: 64 });
defI('echo_shard', 'Fragmento de eco'); defI('heart_of_the_sea', 'Corazón del mar'); defI('nautilus_shell', 'Caparazón de nautilo');
defI('saddle', 'Montura', { stack: 1 }); defI('name_tag', 'Etiqueta', {});
defI('netherite_upgrade', 'Plantilla de mejora de netherita');

defI('spider_eye', 'Ojo de araña', { food: [2, 3.2] }); defI('fermented_spider_eye', 'Ojo de araña fermentado'); defI('ghast_tear', 'Lágrima de ghast'); defI('magma_cream', 'Crema de magma');
defI('prismarine_shard', 'Fragmento de prismarina'); defI('shulker_shell', 'Caparazón de shulker'); defI('breeze_rod', 'Vara de breeze'); defI('slime_ball', 'Bola de slime');
defI('ink_sac', 'Saco de tinta'); defI('glow_ink_sac', 'Saco de tinta luminosa'); defI('phantom_membrane', 'Membrana de phantom'); defI('nether_star', 'Estrella del Nether'); defI('dragon_breath', 'Aliento de dragón');
defI('nether_wart', 'Verruga del Nether'); defI('amethyst_shard', 'Fragmento de amatista'); defI('honeycomb', 'Panal');
defI('firework_rocket', 'Cohete de fuegos artificiales', { rocket: true }); defI('book', 'Libro'); defI('glass_bottle', 'Frasco de cristal', { stack: 16 });
defI('carrot', 'Zanahoria', { food: [3, 3.6] }); defI('potato', 'Patata', { food: [1, 0.6] }); defI('baked_potato', 'Patata asada', { food: [5, 6] }); defI('golden_carrot', 'Zanahoria dorada', { food: [6, 14.4] });
defI('salmon', 'Salmón crudo', { food: [2, 0.4] }); defI('cooked_salmon', 'Salmón cocinado', { food: [6, 9.6] }); defI('sweet_berries', 'Bayas dulces', { food: [2, 0.4] });
defI('cookie', 'Galleta', { food: [2, 0.4] }); defI('pumpkin_pie', 'Tarta de calabaza', { food: [8, 4.8] }); defI('mushroom_stew', 'Estofado de champiñones', { food: [6, 7.2], stack: 1 });
defI('milk_bucket', 'Cubo de leche', { stack: 1, milk: true }); defI('sugar', 'Azúcar');
defI('shears', 'Tijeras', { stack: 1, dur: 238, shears: true }); defI('compass', 'Brújula', { stack: 1, compass: true }); defI('clock', 'Reloj', { stack: 1, clock: true });
defI('spyglass', 'Catalejo', { stack: 1, spyglass: true }); defI('map', 'Mapa', { stack: 1 }); defI('lead', 'Rienda');
defI('turtle_helmet', 'Caparazón de tortuga', { stack: 1, armor: { slot: 0, pts: 2, mat: 'turtle', tough: 0 }, dur: 275 });
defI('trident', 'Tridente', { stack: 1, dur: 250, dmg: 9, trident: true }); defI('crossbow', 'Ballesta', { stack: 1, dur: 465, bow: true, crossbow: true });
defI('mace', 'Maza', { stack: 1, dur: 500, dmg: 6, mace: true }); defI('heavy_core', 'Núcleo denso');
defI('brush', 'Brocha', { stack: 1, dur: 64 }); defI('fishing_rod', 'Caña de pescar', { stack: 1, dur: 64 });
const TOOLMAT = { wooden: { lvl: 1, speed: 2, dur: 59, dmg: 0, n: 'madera', col: [137, 103, 59] }, stone: { lvl: 2, speed: 4, dur: 131, dmg: 1, n: 'piedra', col: [130, 130, 130] }, iron: { lvl: 3, speed: 6, dur: 250, dmg: 2, n: 'hierro', col: [220, 220, 220] }, golden: { lvl: 1, speed: 12, dur: 32, dmg: 0, n: 'oro', col: [250, 220, 70] }, diamond: { lvl: 4, speed: 8, dur: 1561, dmg: 3, n: 'diamante', col: [80, 230, 220] }, netherite: { lvl: 5, speed: 9, dur: 2031, dmg: 4, n: 'netherita', col: [80, 70, 75] } };
const TOOLTYPE = { sword: ['Espada', 4], pickaxe: ['Pico', 2], axe: ['Hacha', 3], shovel: ['Pala', 1.5], hoe: ['Azada', 1] };
for (const m in TOOLMAT) for (const t in TOOLTYPE) {
  const M = TOOLMAT[m]; defI(m + '_' + t, TOOLTYPE[t][0] + ' de ' + M.n, { stack: 1, tool: { type: t, lvl: M.lvl, speed: M.speed, mat: m }, dur: M.dur, dmg: TOOLTYPE[t][1] + M.dmg, fuel: m === 'wooden' ? 200 : 0 });
}
const ARMORMAT = { leather: { pts: [1, 3, 2, 1], dur: 5, n: 'cuero', col: [160, 101, 64] }, golden: { pts: [2, 5, 3, 1], dur: 7, n: 'oro', col: [250, 220, 70] }, chainmail: { pts: [2, 5, 4, 1], dur: 15, n: 'malla', col: [150, 150, 160] }, iron: { pts: [2, 6, 5, 2], dur: 15, n: 'hierro', col: [215, 215, 215] }, diamond: { pts: [3, 8, 6, 3], dur: 33, n: 'diamante', col: [90, 230, 220] }, netherite: { pts: [3, 8, 6, 3], dur: 37, n: 'netherita', col: [75, 66, 70], tough: 3 } };
const ARMORPART = [['helmet', 'Casco', 11], ['chestplate', 'Pechera', 16], ['leggings', 'Grebas', 15], ['boots', 'Botas', 13]];
for (const m in ARMORMAT) ARMORPART.forEach(([p, dn, du], slot) => {
  const A = ARMORMAT[m]; defI(m + '_' + p, dn + ' de ' + A.n, { stack: 1, armor: { slot, pts: A.pts[slot], mat: m, tough: A.tough || 0 }, dur: du * A.dur });
});
// fuel de bloques
for (const d of REG) if (d && d.isBlock && (d.planks || d.log)) d.fuel = 300;
REG[ID.coal_block].fuel = 16000; REG[ID.crafting_table].fuel = 300; REG[ID.bookshelf].fuel = 300; REG[ID.chest].fuel = 300;

// ------------------------------------------------------------------ texturas mobs/fx
const MOBTEX = ['pig_skin', 'pig_face', 'cow_skin', 'cow_face', 'sheep_wool', 'sheep_face', 'sheep_skin', 'chicken_body', 'chicken_face', 'chicken_beak', 'zombie_skin', 'zombie_face', 'zombie_shirt', 'zombie_pants',
  'skeleton_bone', 'skeleton_face', 'creeper_skin', 'creeper_face', 'spider_body', 'spider_face', 'enderman_skin', 'enderman_face', 'blaze_skin', 'blaze_face', 'ghast_skin', 'ghast_face',
  'piglin_skin', 'piglin_face', 'villager_robe', 'villager_face', 'villager_skin', 'steve_face', 'steve_skin', 'steve_shirt', 'steve_pants', 'steve_hair', 'steve_back', 'dragon_skin', 'dragon_face', 'dragon_wing', 'crystal', 'crystal_core',
  'pillager_face', 'pillager_robe', 'guardian_skin', 'guardian_face', 'warden_skin', 'warden_face', 'shulker_shell', 'shulker_face', 'drowned_skin', 'drowned_face', 'hoglin_skin', 'hoglin_face', 'goat_skin', 'goat_face', 'magma_skin', 'breeze_skin', 'breeze_face', 'wither_skel_face', 'wither_skel_bone',
  'armor_leather', 'armor_golden', 'armor_chainmail', 'armor_iron', 'armor_diamond', 'armor_netherite', 'fireball', 'white', 'tnt_flash', 'elytra_tex', 'boat_wood', 'arrow_tex'];
MOBTEX.forEach(texLayer);
for (let i = 0; i < 10; i++) texLayer('destroy_' + i);
['smoke_0', 'smoke_1', 'smoke_2', 'smoke_3', 'flame_0', 'flame_1', 'flame_2', 'spark', 'snowflake', 'bubble_p', 'portal_p', 'drip', 'raindrop', 'soft', 'ember'].forEach(texLayer);

// ============================================================ generación de texturas
const TEXGEN = {};
class Painter {
  constructor(name) { this.d = new Uint8ClampedArray(16 * 16 * 4); this.r = mulberry32(hashStr(name)); this.name = name; }
  set(x, y, c, a = 255) { if (x < 0 || y < 0 || x > 15 || y > 15) return; const i = (y * 16 + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c.length > 3 ? c[3] : a; }
  get(x, y) { const i = ((y & 15) * 16 + (x & 15)) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  fill(c, v = 0, a = 255) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (this.r() - 0.5) * 2 * v; this.set(x, y, [c[0] + k, c[1] + k, c[2] + k], a); } return this; }
  noise(c, v, sc = 1) { const s = this.r() * 100; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = ((this.r() - 0.5) * 0.6 + Math.sin((x + s) * 1.7 * sc) * Math.cos((y * 1.3 + s) * sc) * 0.4) * 2 * v; this.set(x, y, [c[0] + k, c[1] + k, c[2] + k]); } return this; }
  speck(c, n, v = 10) { for (let i = 0; i < n; i++) { const k = (this.r() - 0.5) * v; this.set((this.r() * 16) | 0, (this.r() * 16) | 0, [c[0] + k, c[1] + k, c[2] + k]); } return this; }
  blobs(c, n, size = 3, v = 15) { for (let i = 0; i < n; i++) { let x = (this.r() * 16) | 0, y = (this.r() * 16) | 0; for (let j = 0; j < size; j++) { const k = (this.r() - 0.5) * v; this.set(x, y, [c[0] + k, c[1] + k, c[2] + k]); x += ((this.r() * 3) | 0) - 1; y += ((this.r() * 3) | 0) - 1; } } return this; }
  shade(f) { for (let i = 0; i < 1024; i += 4) { this.d[i] *= f; this.d[i + 1] *= f; this.d[i + 2] *= f; } return this; }
  rect(x0, y0, x1, y1, c, v = 0) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = (this.r() - 0.5) * 2 * v; this.set(x, y, [c[0] + k, c[1] + k, c[2] + k], c[3] === undefined ? 255 : c[3]); } return this; }
  border(c) { for (let i = 0; i < 16; i++) { this.set(i, 0, c); this.set(i, 15, c); this.set(0, i, c); this.set(15, i, c); } return this; }
  copy(name) { const t = genTex(name); this.d.set(t); return this; }
  clear() { this.d.fill(0); return this; }
}
const TEXCACHE = {};
function genTex(name) {
  if (TEXCACHE[name]) return TEXCACHE[name];
  const p = new Painter(name);
  const f = TEXGEN[name];
  if (f) f(p); else autoTex(p, name);
  TEXCACHE[name] = p.d; return p.d;
}
function C(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
function stoneLike(p, c, v = 12) { p.noise(c, v); p.blobs(c.map(x => x - 18), 6, 4, 8); p.blobs(c.map(x => x + 12), 4, 3, 8); }
function oreTex(p, base, col, col2) {
  p.copy(base);
  const r = p.r; for (let i = 0; i < 5; i++) { const cx = 2 + (r() * 12) | 0, cy = 2 + (r() * 12) | 0; const n = 2 + (r() * 3) | 0; for (let j = 0; j < n; j++) { const x = cx + ((r() * 3) | 0) - 1, y = cy + ((r() * 3) | 0) - 1; p.set(x, y, j % 2 ? col : (col2 || col.map(v => v * 0.75))); p.set(x + 1, y, col.map(v => Math.min(255, v * 1.15))); } }
}
function planks(p, c) {
  p.noise(c, 8); for (let y = 0; y < 16; y++) { if (y % 4 === 3) for (let x = 0; x < 16; x++) p.set(x, y, c.map(v => v * 0.62)); }
  for (let b = 0; b < 4; b++) { const x = ((b * 7 + 3) % 16); p.set(x, b * 4 + 1, c.map(v => v * 0.7)); p.set((x + 8) % 16, b * 4 + 2, c.map(v => v * 0.75)); }
  for (let i = 0; i < 20; i++) { const y = (p.r() * 16) | 0; if (y % 4 === 3) continue; const x = (p.r() * 14) | 0; p.set(x, y, c.map(v => v * 0.88)); p.set(x + 1, y, c.map(v => v * 0.88)); }
}
function logSide(p, c, dark) { for (let x = 0; x < 16; x++) { const k = (p.r() - 0.5) * 20; const stripe = (x % 4 === 0 || p.r() < 0.15) ? 0.72 : 1; for (let y = 0; y < 16; y++) p.set(x, y, c.map(v => v * stripe + k + (p.r() - 0.5) * 10)); } if (dark) p.blobs(dark, 5, 3, 10); }
function logTop(p, bark, inner) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); const ring = Math.floor(d) % 2;
    const c = d > 6.6 ? bark : inner.map(v => v * (ring ? 0.88 : 1)); p.set(x, y, c.map(v => v + (p.r() - 0.5) * 10));
  }
}
function leaves(p, c, holes = 0.18) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const r = p.r(); if (r < holes) { p.set(x, y, [0, 0, 0], 0); continue; } const k = (p.r() - 0.5) * 50; const dk = p.r() < 0.25 ? 0.7 : 1; p.set(x, y, [c[0] * dk + k * 0.5, c[1] * dk + k, c[2] * dk + k * 0.4]); } }
function bricks(p, brick, mortar, bh = 4, bw = 8, v = 14) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const row = Math.floor(y / bh); const off = (row % 2) * (bw / 2);
    const m = (y % bh === bh - 1) || ((x + off) % bw === bw - 1);
    const k = (p.r() - 0.5) * v; const c = m ? mortar : brick; p.set(x, y, c.map(q => q + k));
  }
}
function tiles(p, c, size = 4, line) { p.noise(c, 6); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x % size === 0 || y % size === 0) p.set(x, y, line || c.map(v => v * 0.8)); }
function cross(p, fn) { p.clear(); fn(p); }
function plant(p, stem, flower, petal) {
  p.clear(); for (let y = 6; y < 16; y++) p.set(7 + (y % 3 === 0 ? 1 : 0), y, stem);
  p.set(6, 11, stem); p.set(5, 10, stem); p.set(9, 12, stem); p.set(10, 11, stem);
  if (flower) { for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) < 3) p.set(7 + dx, 5 + dy, (dx === 0 && dy === -0) ? (petal || flower.map(v => v * 0.6)) : flower.map(v => v + (p.r() - 0.5) * 30)); }
}
function grassBlades(p, c, n = 14) { p.clear(); for (let i = 0; i < n; i++) { const x = 1 + ((p.r() * 14) | 0); const h = 5 + ((p.r() * 10) | 0); let xx = x; for (let y = 15; y > 15 - h; y--) { p.set(xx, y, c.map(v => v * (0.6 + 0.5 * (15 - y) / h) + (p.r() - 0.5) * 20)); if (p.r() < 0.2) xx += p.r() < 0.5 ? -1 : 1; } } }
function wool(p, c) { p.noise(c, 8); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y * 3) % 5 === 0) p.set(x, y, c.map(v => v * 0.86)); }
function soft(p, c, power = 1) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 8; const a = Math.max(0, 1 - d); p.set(x, y, c, 255 * Math.pow(a, power)); } }

Object.assign(TEXGEN, {
  stone: p => stoneLike(p, [125, 125, 125], 10),
  granite: p => { p.noise([154, 106, 89], 12); p.speck([190, 140, 120], 30); p.speck([110, 70, 60], 20); },
  diorite: p => { p.noise([190, 190, 192], 10); p.speck([120, 120, 125], 26); p.speck([230, 230, 230], 20); },
  andesite: p => { p.noise([136, 136, 138], 10); p.speck([110, 110, 110], 30); p.speck([165, 165, 165], 20); },
  deepslate: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (p.r() - 0.5) * 18 + (y % 3 === 0 ? -10 : 0) + Math.sin(x * 0.7 + y) * 4; p.set(x, y, [80 + k, 80 + k, 86 + k]); } },
  deepslate_top: p => { p.noise([84, 84, 90], 10); p.blobs([65, 65, 70], 6, 4, 6); },
  cobbled_deepslate: p => { cobble(p, [80, 80, 86], [45, 45, 50]); },
  deepslate_bricks: p => bricks(p, [75, 75, 80], [45, 45, 50], 4, 8, 10),
  deepslate_tiles: p => tiles(p, [62, 62, 66], 4, [35, 35, 38]),
  reinforced_deepslate: p => { tiles(p, [70, 75, 80], 8, [30, 35, 38]); p.rect(5, 5, 10, 10, [140, 170, 160], 10); p.rect(6, 6, 9, 9, [50, 60, 60]); },
  tuff: p => { p.noise([108, 109, 102], 10); p.speck([90, 92, 85], 30); p.speck([130, 130, 120], 15); },
  tuff_bricks: p => bricks(p, [110, 112, 104], [70, 72, 66], 8, 8, 10),
  polished_tuff: p => { p.noise([115, 118, 110], 5); p.border([85, 88, 80]); },
  chiseled_tuff: p => { p.noise([110, 112, 104], 6); p.border([80, 82, 76]); p.rect(4, 4, 11, 11, [92, 95, 88]); p.rect(6, 6, 9, 9, [140, 145, 130]); },
  calcite: p => { p.noise([222, 223, 218], 8); p.speck([200, 200, 200], 20); },
  dripstone_block: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (p.r() - 0.5) * 16 + Math.sin(y * 0.9 + x * 0.2) * 10; p.set(x, y, [134 + k, 107 + k, 92 + k]); } },
  pointed_dripstone: p => { p.clear(); for (let y = 0; y < 16; y++) { const w = Math.max(1, Math.round((y / 16) * 3.5)); for (let x = 8 - w; x < 8 + w; x++) p.set(x, 15 - y, [130 + (p.r() - 0.5) * 20, 103, 88]); } },
  moss_block: p => { p.noise([89, 109, 45], 14); p.speck([110, 135, 55], 30); p.speck([70, 90, 35], 25); },
  azalea_leaves: p => { leaves(p, [90, 125, 45], 0.15); p.speck([200, 110, 200], 6); },
  cave_vines: p => { p.clear(); for (let y = 0; y < 16; y++) { p.set(7 + ((y >> 2) & 1), y, [60, 110, 40]); if (y % 4 === 1) { p.set(5, y, [255, 180, 60]); p.set(10, y + 1, [255, 200, 70]); p.set(6, y, [80, 120, 40]); } } },
  sculk: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = p.r(); p.set(x, y, k < 0.08 ? [40, 200, 210] : k < 0.15 ? [20, 90, 110] : [10 + k * 20, 25 + k * 25, 35 + k * 30]); } },
  sculk_sensor_top: p => { p.copy('sculk'); p.rect(5, 5, 10, 10, [30, 160, 170], 20); },
  sculk_sensor_side: p => { p.copy('sculk'); p.rect(0, 0, 15, 4, [20, 120, 140], 15); },
  soul_lantern: p => { p.clear(); p.rect(3, 3, 12, 14, [50, 50, 60]); p.rect(5, 5, 10, 12, [90, 230, 255]); p.rect(6, 0, 9, 2, [40, 40, 45]); },
  lantern: p => { p.clear(); p.rect(3, 3, 12, 14, [55, 55, 65]); p.rect(5, 5, 10, 12, [255, 210, 110]); p.rect(6, 0, 9, 2, [40, 40, 45]); },
  grass_top: p => { p.noise([150, 150, 150], 22); p.speck([120, 120, 120], 40); p.speck([175, 175, 175], 25); },
  dirt: p => { p.noise([134, 96, 67], 14); p.speck([100, 70, 48], 30); p.speck([160, 120, 90], 16); },
  grass_side: p => { p.copy('dirt'); for (let x = 0; x < 16; x++) { const h = 3 + ((p.r() * 3) | 0) - (x % 3 === 0 ? 1 : 0); for (let y = 0; y < h; y++) p.set(x, y, [88 + (p.r() - 0.5) * 20, 140 + (p.r() - 0.5) * 30, 52 + (p.r() - 0.5) * 16]); } },
  grass_snow_side: p => { p.copy('dirt'); for (let x = 0; x < 16; x++) { const h = 3 + ((p.r() * 3) | 0); for (let y = 0; y < h; y++) p.set(x, y, [238 + p.r() * 12, 244, 252]); } },
  cobblestone: p => cobble(p, [125, 125, 125], [70, 70, 70]),
  mossy_cobblestone: p => { cobble(p, [120, 120, 120], [70, 70, 70]); p.blobs([80, 115, 50], 8, 6, 20); },
  bedrock: p => { p.fill([80, 80, 80], 40); p.blobs([30, 30, 30], 10, 5, 10); p.blobs([150, 150, 150], 6, 3, 10); },
  sand: p => { p.noise([219, 207, 163], 10); p.speck([200, 185, 140], 30); },
  red_sand: p => { p.noise([190, 102, 33], 10); p.speck([170, 85, 25], 30); },
  gravel: p => { p.fill([130, 124, 122], 14); p.blobs([100, 92, 90], 10, 4, 15); p.blobs([160, 155, 150], 8, 3, 15); p.blobs([110, 80, 70], 4, 2, 10); },
  clay: p => { p.noise([160, 166, 179], 6); p.speck([140, 146, 160], 20); },
  mud: p => { p.noise([60, 57, 61], 8); p.speck([45, 42, 46], 30); },
  glass: p => { p.clear(); p.border([220, 240, 250]); for (let i = 0; i < 4; i++) p.set(3 + i, 3 + i, [255, 255, 255], 180); p.set(4, 3, [255, 255, 255], 140); p.set(10, 11, [255, 255, 255], 150); p.set(11, 12, [255, 255, 255], 150); for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (!p.get(x, y)[3]) p.set(x, y, [200, 230, 240], 12); },
  water: p => { p.noise([60, 110, 220], 12, 0.6); },
  lava: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const n = Math.sin(x * 0.8 + p.r()) * Math.cos(y * 0.7) * 0.5 + 0.5 + (p.r() - 0.5) * 0.3; p.set(x, y, [230 + n * 25, 90 + n * 120, 10 + n * 40]); } },
  coal_ore: p => oreTex(p, 'stone', [40, 40, 40], [20, 20, 20]),
  iron_ore: p => oreTex(p, 'stone', [216, 175, 147], [180, 130, 100]),
  copper_ore: p => oreTex(p, 'stone', [220, 120, 80], [90, 170, 130]),
  gold_ore: p => oreTex(p, 'stone', [252, 238, 75], [200, 160, 30]),
  redstone_ore: p => oreTex(p, 'stone', [255, 30, 30], [170, 0, 0]),
  lapis_ore: p => oreTex(p, 'stone', [40, 80, 200], [20, 50, 150]),
  diamond_ore: p => oreTex(p, 'stone', [100, 240, 230], [40, 180, 180]),
  emerald_ore: p => oreTex(p, 'stone', [60, 230, 110], [20, 150, 60]),
  crafting_table_top: p => { planks(p, [170, 125, 75]); p.border([90, 60, 35]); p.rect(2, 2, 13, 2, [110, 75, 40]); p.rect(2, 13, 13, 13, [110, 75, 40]); p.rect(7, 2, 8, 13, [110, 75, 40]); },
  crafting_table_side: p => { planks(p, [160, 120, 70]); p.rect(0, 0, 15, 2, [105, 75, 45]); p.rect(3, 5, 4, 12, [90, 90, 95]); p.rect(2, 5, 6, 6, [140, 140, 150]); p.rect(10, 6, 12, 7, [120, 120, 128]); p.rect(11, 8, 11, 13, [100, 70, 40]); },
  crafting_table_front: p => { planks(p, [160, 120, 70]); p.rect(0, 0, 15, 2, [105, 75, 45]); p.rect(3, 6, 12, 7, [150, 150, 160]); p.rect(3, 8, 4, 13, [100, 70, 40]); p.rect(11, 8, 12, 13, [100, 70, 40]); },
  furnace_side: p => { p.noise([120, 120, 120], 8); p.border([80, 80, 80]); p.rect(0, 0, 15, 3, [140, 140, 140], 6); },
  furnace_top: p => { p.noise([125, 125, 125], 6); p.border([85, 85, 85]); },
  furnace_front: p => { p.copy('furnace_side'); p.rect(3, 8, 12, 13, [30, 30, 30]); p.rect(3, 4, 12, 5, [70, 70, 70]); },
  furnace_front_lit: p => { p.copy('furnace_side'); p.rect(3, 8, 12, 13, [40, 20, 10]); for (let x = 4; x < 12; x++) for (let y = 10; y < 14; y++) if (p.r() < 0.7) p.set(x, y, [255, 140 + p.r() * 100, 30]); p.rect(3, 4, 12, 5, [70, 70, 70]); },
  chest_top: p => { p.noise([160, 110, 45], 8); p.border([60, 40, 20]); },
  chest_side: p => { p.noise([160, 110, 45], 8); p.border([60, 40, 20]); p.rect(1, 5, 14, 5, [60, 40, 20]); },
  chest_front: p => { p.copy('chest_side'); p.rect(7, 4, 8, 7, [200, 200, 200]); p.set(7, 6, [60, 60, 60]); },
  smithing_table_top: p => { p.noise([60, 60, 70], 6); p.border([35, 35, 40]); p.rect(3, 3, 12, 12, [80, 80, 90]); },
  smithing_table_side: p => { planks(p, [100, 70, 50]); p.rect(0, 0, 15, 3, [55, 55, 65]); p.rect(2, 6, 13, 7, [200, 200, 210]); },
  smithing_table_bottom: p => planks(p, [100, 70, 50]),
  bookshelf: p => { planks(p, [162, 130, 78]); for (const y0 of [1, 9]) for (let x = 1; x < 15; x++) { const col = [[150, 40, 40], [40, 80, 150], [60, 130, 60], [140, 110, 50], [110, 50, 120]][(x * 7 + y0) % 5]; for (let y = y0; y < y0 + 6; y++) p.set(x, y, col.map(v => v + (y === y0 ? 30 : 0))); } },
  bricks: p => bricks(p, [150, 75, 60], [190, 180, 170], 4, 8, 18),
  stone_bricks: p => bricks(p, [122, 122, 122], [80, 80, 80], 8, 16, 10),
  mossy_stone_bricks: p => { bricks(p, [118, 120, 118], [80, 80, 80], 8, 16, 10); p.blobs([80, 115, 50], 8, 5, 20); },
  cracked_stone_bricks: p => { bricks(p, [118, 118, 118], [80, 80, 80], 8, 16, 10); let x = 3, y = 0; for (let i = 0; i < 16; i++) { p.set(x, y, [60, 60, 60]); y++; x += ((p.r() * 3) | 0) - 1; } },
  chiseled_stone_bricks: p => { p.noise([122, 122, 122], 6); p.border([80, 80, 80]); p.rect(3, 3, 12, 12, [100, 100, 100]); p.rect(5, 5, 10, 10, [130, 130, 130]); p.rect(7, 7, 8, 8, [90, 90, 90]); },
  smooth_stone: p => { p.noise([160, 160, 160], 4); p.border([120, 120, 120]); },
  snow: p => { p.noise([245, 250, 255], 4); p.speck([225, 235, 245], 15, 4); },
  ice: p => { p.noise([140, 180, 250], 10); for (let i = 0; i < 6; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, [220, 240, 255]); for (let i = 0; i < 256; i++) p.d[i * 4 + 3] = 180; },
  packed_ice: p => { p.noise([150, 185, 240], 8); p.speck([200, 225, 255], 20); },
  sandstone: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const band = y < 3 ? 1.05 : y > 12 ? 0.92 : 1; p.set(x, y, [216 * band + (p.r() - 0.5) * 10, 205 * band, 160 * band]); } },
  sandstone_top: p => p.noise([220, 210, 165], 6),
  sandstone_bottom: p => p.noise([212, 200, 155], 8),
  chiseled_sandstone: p => { p.copy('sandstone_top'); p.border([180, 165, 120]); p.rect(4, 4, 11, 11, [190, 175, 130]); p.rect(6, 6, 9, 9, [215, 205, 160]); p.set(7, 7, [170, 150, 110]); },
  cut_sandstone: p => { p.copy('sandstone_top'); p.border([190, 180, 135]); p.rect(0, 7, 15, 7, [190, 180, 135]); },
  terracotta: p => p.noise([152, 94, 67], 6),
  orange_terracotta: p => p.noise([161, 83, 37], 6),
  blue_terracotta: p => p.noise([74, 59, 91], 6),
  cactus_side: p => { p.noise([85, 140, 50], 10); for (let x = 0; x < 16; x += 4) for (let y = 0; y < 16; y++) p.set(x, y, [60, 105, 35]); for (let i = 0; i < 10; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, [220, 220, 180]); },
  cactus_top: p => { p.noise([95, 150, 60], 8); p.border([60, 105, 35]); p.rect(6, 6, 9, 9, [120, 170, 80]); },
  pumpkin_side: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, [(x % 4 === 0 ? 170 : 210) + (p.r() - 0.5) * 16, (x % 4 === 0 ? 95 : 125), 25]); },
  pumpkin_top: p => { p.copy('pumpkin_side'); p.rect(6, 6, 9, 9, [100, 80, 40]); },
  jack_o_lantern: p => { p.copy('pumpkin_side'); p.rect(3, 4, 5, 6, [255, 230, 80]); p.rect(10, 4, 12, 6, [255, 230, 80]); p.rect(3, 10, 12, 11, [255, 230, 80]); p.rect(5, 12, 10, 12, [255, 230, 80]); },
  melon_side: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x % 5 < 2) ? [110, 160, 40] : [70, 125, 30]); },
  melon_top: p => { p.noise([100, 145, 40], 10); p.border([70, 110, 30]); },
  hay_side: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, (y === 3 || y === 12) ? [120, 40, 30] : [200 + (p.r() - 0.5) * 30, 160 + (p.r() - 0.5) * 30, 30]); },
  hay_top: p => { p.noise([190, 150, 30], 18); },
  farmland: p => { p.noise([110, 75, 45], 8); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) p.set(x, y, [80, 55, 32]); },
  wheat: p => { p.clear(); for (let i = 0; i < 6; i++) { const x = 1 + i * 2.5 | 0; for (let y = 5; y < 16; y++) p.set(x, y, y < 9 ? [200, 170, 60] : [150, 160, 60]); } },
  path_top: p => { p.noise([148, 122, 65], 10); p.speck([120, 100, 50], 20); },
  path_side: p => { p.copy('dirt'); p.rect(0, 0, 15, 1, [148, 122, 65], 8); },
  obsidian: p => { p.noise([20, 16, 30], 6); p.blobs([50, 30, 80], 8, 4, 10); p.speck([80, 60, 120], 6); },
  crying_obsidian: p => { p.copy('obsidian'); p.blobs([140, 30, 230], 8, 4, 30); },
  torch: p => { p.clear(); for (let y = 6; y < 16; y++) for (let x = 7; x < 9; x++) p.set(x, y, [120 - y * 2, 85, 45]); p.rect(7, 4, 8, 6, [255, 230, 100]); p.set(7, 4, [255, 255, 200]); },
  torch_top: p => { p.clear(); p.rect(7, 7, 8, 8, [255, 220, 90]); },
  end_rod: p => { p.clear(); for (let y = 0; y < 16; y++) p.rect(7, y, 8, y, [245, 240, 235]); },
  fire: p => { p.clear(); for (let x = 0; x < 16; x++) { const h = 8 + p.r() * 8; for (let y = 16 - h; y < 16; y++) { const t = (y - (16 - h)) / h; p.set(x, y | 0, [255, 80 + t * 170, 20 + t * 40], 255); } } },
  cobweb: p => { p.clear(); for (let i = 0; i < 16; i++) { p.set(i, i, [230, 230, 230]); p.set(15 - i, i, [230, 230, 230]); p.set(8, i, [230, 230, 230]); p.set(i, 8, [230, 230, 230]); } },
  poppy: p => plant(p, [60, 120, 40], [220, 30, 30], [40, 30, 30]),
  dandelion: p => plant(p, [60, 120, 40], [250, 230, 40], [250, 180, 30]),
  blue_orchid: p => plant(p, [60, 120, 40], [50, 170, 230]),
  cornflower: p => plant(p, [60, 120, 40], [70, 100, 220]),
  oxeye_daisy: p => plant(p, [60, 120, 40], [235, 235, 235], [230, 200, 50]),
  tall_grass: p => grassBlades(p, [150, 150, 150], 14),
  fern: p => { p.clear(); for (let y = 2; y < 16; y++) { p.set(7, y, [140, 140, 140]); const w = (16 - y) / 3 | 0; for (let k = 1; k <= w; k++) if (y % 2) { p.set(7 - k, y - k / 2 | 0, [150, 150, 150]); p.set(7 + k, y - k / 2 | 0, [130, 130, 130]); } } },
  dead_bush: p => { p.clear(); for (let i = 0; i < 5; i++) { let x = 8, y = 15; for (let j = 0; j < 9; j++) { p.set(x, y, [120, 85, 40]); y--; x += i - 2 > 0 ? (p.r() < 0.5 ? 1 : 0) : i - 2 < 0 ? (p.r() < 0.5 ? -1 : 0) : 0; } } },
  brown_mushroom: p => { p.clear(); p.rect(7, 9, 8, 15, [220, 210, 190]); p.rect(4, 6, 11, 9, [150, 110, 80]); p.rect(5, 5, 10, 5, [160, 120, 90]); },
  red_mushroom: p => { p.clear(); p.rect(7, 9, 8, 15, [220, 210, 190]); p.rect(4, 5, 11, 9, [210, 30, 30]); p.set(5, 6, [255, 255, 255]); p.set(9, 7, [255, 255, 255]); p.set(7, 5, [255, 255, 255]); },
  sugar_cane: p => { p.clear(); for (const x of [3, 7, 11]) for (let y = 0; y < 16; y++) p.rect(x, y, x + 1, y, y % 5 === 0 ? [140, 180, 90] : [120, 170, 80]); },
  lily_pad: p => { p.clear(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7.5 && !(x > 7 && Math.abs(y - 7.5) < 1.5)) p.set(x, y, [120, 120, 120].map(v => v + (p.r() - 0.5) * 30)); } },
  vine: p => { p.clear(); for (let i = 0; i < 40; i++) { const x = (p.r() * 16) | 0, y = (p.r() * 16) | 0; p.set(x, y, [130, 130, 130]); p.set(x, y + 1, [110, 110, 110]); } },
  ladder: p => { p.clear(); p.rect(2, 0, 3, 15, [120, 90, 50]); p.rect(12, 0, 13, 15, [120, 90, 50]); for (let y = 1; y < 16; y += 4) p.rect(2, y, 13, y + 1, [150, 115, 65]); },
  iron_bars: p => { p.clear(); for (const x of [1, 5, 10, 14]) p.rect(x, 0, x, 15, [110, 110, 115]); p.rect(0, 0, 15, 0, [110, 110, 115]); p.rect(0, 15, 15, 15, [110, 110, 115]); },
  rail: p => { p.clear(); for (let y = 0; y < 16; y += 3) p.rect(2, y, 13, y + 1, [110, 80, 45]); p.rect(3, 0, 4, 15, [160, 160, 165]); p.rect(11, 0, 12, 15, [160, 160, 165]); },
  iron_block: p => { p.noise([220, 220, 220], 5); p.border([170, 170, 170]); p.rect(1, 1, 14, 1, [240, 240, 240]); },
  gold_block: p => { p.noise([250, 215, 60], 8); p.border([200, 150, 30]); p.rect(1, 1, 14, 1, [255, 250, 150]); },
  diamond_block: p => { p.noise([110, 230, 225], 8); p.border([60, 170, 165]); p.rect(1, 1, 14, 1, [200, 255, 250]); },
  emerald_block: p => { p.noise([60, 210, 100], 8); p.border([30, 140, 60]); },
  netherite_block: p => { p.noise([70, 63, 66], 6); p.border([45, 40, 42]); p.rect(2, 2, 13, 13, [80, 72, 76], 6); },
  coal_block: p => { p.noise([25, 25, 25], 8); },
  lapis_block: p => { p.noise([35, 65, 160], 12); p.speck([60, 100, 220], 20); },
  redstone_block: p => { p.noise([175, 25, 15], 12); p.speck([230, 50, 30], 20); },
  copper_block: p => { p.noise([192, 107, 79], 10); p.speck([220, 140, 100], 20); },
  raw_iron_block: p => { p.noise([166, 136, 107], 14); },
  raw_gold_block: p => { p.noise([221, 169, 46], 14); },
  cut_copper: p => { tiles(p, [190, 105, 78], 8, [150, 80, 60]); },
  oxidized_copper: p => { p.noise([82, 162, 132], 10); p.speck([60, 130, 110], 20); },
  oxidized_cut_copper: p => { tiles(p, [80, 160, 130], 8, [55, 120, 100]); },
  copper_grate: p => { p.clear(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x % 4 === 0 || y % 4 === 0) p.set(x, y, [190, 105, 78]); },
  trial_spawner: p => { p.clear(); p.border([60, 70, 80]); for (let y = 0; y < 16; y += 4) p.rect(0, y, 15, y, [60, 70, 80]); for (let x = 0; x < 16; x += 4) p.rect(x, 0, x, 15, [60, 70, 80]); p.rect(6, 6, 9, 9, [230, 140, 40]); },
  vault_side: p => { p.noise([70, 80, 90], 6); p.border([40, 45, 50]); p.rect(3, 3, 12, 12, [55, 60, 70]); },
  vault_top: p => { p.noise([70, 80, 90], 6); p.border([40, 45, 50]); },
  vault_front: p => { p.copy('vault_side'); p.rect(6, 5, 9, 10, [230, 170, 60]); p.rect(7, 7, 8, 8, [40, 30, 20]); },
  tnt_side: p => { p.noise([200, 40, 30], 10); p.rect(0, 5, 15, 10, [230, 230, 230]); p.rect(3, 6, 12, 9, [40, 40, 40]); for (let x = 0; x < 16; x += 4) p.rect(x, 0, x, 4, [170, 30, 25]); },
  tnt_top: p => { p.noise([200, 50, 40], 10); p.rect(6, 6, 9, 9, [60, 60, 60]); },
  tnt_bottom: p => { p.noise([190, 50, 40], 10); },
  bed_top: p => { p.noise([170, 30, 30], 8); p.rect(0, 0, 15, 5, [230, 230, 230], 6); },
  bed_side: p => { p.noise([170, 30, 30], 8); p.rect(0, 0, 4, 15, [230, 230, 230], 6); p.rect(0, 11, 15, 15, [140, 100, 60], 6); },
  spawner: p => { p.clear(); p.border([30, 40, 50]); for (let i = 3; i < 16; i += 4) { p.rect(i, 0, i, 15, [30, 40, 50]); p.rect(0, i, 15, i, [30, 40, 50]); } p.rect(6, 6, 9, 9, [200, 60, 30]); },
  sponge: p => { p.noise([200, 190, 70], 10); for (let i = 0; i < 20; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, [150, 140, 40]); },
  wet_sponge: p => { p.noise([170, 170, 70], 10); for (let i = 0; i < 20; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, [110, 120, 40]); },
  prismarine: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = Math.sin(x * 0.6 + y * 0.3) * 15 + (p.r() - 0.5) * 20; p.set(x, y, [99 + k, 156 + k, 151 + k]); } },
  prismarine_bricks: p => bricks(p, [99, 171, 158], [70, 120, 110], 8, 8, 12),
  dark_prismarine: p => { tiles(p, [51, 91, 75], 8, [35, 65, 55]); },
  sea_lantern: p => { p.noise([200, 225, 220], 10); p.border([170, 200, 195]); p.rect(4, 4, 11, 11, [235, 250, 245]); },
  kelp: p => { p.clear(); for (let y = 0; y < 16; y++) { const x = 7 + Math.round(Math.sin(y * 0.6) * 2); p.rect(x, y, x + 1, y, [70, 120, 40]); if (y % 3 === 0) p.set(x + 2, y, [90, 140, 50]); } },
  seagrass: p => grassBlades(p, [70, 130, 60], 10),
  netherrack: p => { p.noise([110, 45, 45], 14); p.blobs([80, 30, 30], 8, 4, 10); p.speck([140, 70, 65], 18); },
  soul_sand: p => { p.noise([82, 62, 50], 8); for (let i = 0; i < 4; i++) { const x = 2 + (p.r() * 11) | 0, y = 2 + (p.r() * 11) | 0; p.set(x, y, [50, 35, 28]); p.set(x + 2, y, [50, 35, 28]); p.rect(x, y + 2, x + 2, y + 2, [45, 32, 25]); } },
  soul_soil: p => { p.noise([75, 57, 46], 8); p.speck([60, 44, 35], 30); },
  glowstone: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = p.r(); p.set(x, y, k < 0.3 ? [140, 100, 50] : k < 0.7 ? [230, 190, 110] : [255, 240, 170]); } },
  nether_bricks: p => bricks(p, [70, 35, 40], [35, 15, 20], 4, 8, 10),
  red_nether_bricks: p => bricks(p, [110, 15, 20], [60, 5, 10], 4, 8, 10),
  nether_quartz_ore: p => oreTex(p, 'netherrack', [235, 225, 215], [200, 190, 180]),
  nether_gold_ore: p => oreTex(p, 'netherrack', [250, 220, 70], [200, 160, 40]),
  ancient_debris_side: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = Math.sin(x * 0.9 + y * 0.4) * 12 + (p.r() - 0.5) * 16; p.set(x, y, [95 + k, 70 + k, 65 + k]); } for (let i = 0; i < 4; i++) { const y = (p.r() * 16) | 0; for (let x = 0; x < 16; x++) if (p.r() < 0.6) p.set(x, y, [130, 100, 90]); } },
  ancient_debris_top: p => { logTop(p, [90, 65, 60], [110, 85, 75]); },
  magma_block: p => { p.noise([110, 40, 15], 12); for (let i = 0; i < 6; i++) { let x = (p.r() * 16) | 0, y = (p.r() * 16) | 0; for (let j = 0; j < 5; j++) { p.set(x, y, [255, 140 + p.r() * 60, 30]); x += ((p.r() * 3) | 0) - 1; y += ((p.r() * 3) | 0) - 1; } } },
  basalt_side: p => { for (let x = 0; x < 16; x++) { const k = (p.r() - 0.5) * 20 + (x % 3 === 0 ? -15 : 0); for (let y = 0; y < 16; y++) p.set(x, y, [75 + k + (p.r() - 0.5) * 8, 75 + k, 80 + k]); } },
  basalt_top: p => { p.noise([80, 80, 85], 10); p.border([55, 55, 60]); },
  blackstone: p => { p.noise([42, 36, 41], 10); p.blobs([30, 25, 30], 6, 4, 6); p.speck([60, 52, 58], 15); },
  blackstone_top: p => { p.noise([45, 38, 44], 8); },
  polished_blackstone_bricks: p => bricks(p, [50, 44, 50], [28, 24, 28], 8, 8, 8),
  gilded_blackstone: p => { p.copy('blackstone'); p.blobs([230, 180, 50], 6, 4, 30); },
  crimson_nylium: p => { p.noise([130, 30, 30], 14); p.speck([180, 40, 40], 30); },
  crimson_nylium_side: p => { p.copy('netherrack'); for (let x = 0; x < 16; x++) { const h = 3 + ((p.r() * 3) | 0); for (let y = 0; y < h; y++) p.set(x, y, [140, 25 + p.r() * 20, 30]); } },
  warped_nylium: p => { p.noise([40, 115, 105], 14); p.speck([60, 160, 140], 30); },
  warped_nylium_side: p => { p.copy('netherrack'); for (let x = 0; x < 16; x++) { const h = 3 + ((p.r() * 3) | 0); for (let y = 0; y < h; y++) p.set(x, y, [40, 115 + p.r() * 20, 105]); } },
  crimson_stem: p => { logSide(p, [110, 40, 60], [170, 50, 50]); },
  crimson_stem_top: p => logTop(p, [110, 40, 60], [150, 70, 90]),
  warped_stem: p => { logSide(p, [55, 60, 85], [40, 150, 140]); },
  warped_stem_top: p => logTop(p, [55, 60, 85], [60, 140, 130]),
  crimson_planks: p => planks(p, [115, 55, 80]),
  warped_planks: p => planks(p, [45, 110, 105]),
  nether_wart_block: p => { p.noise([125, 10, 10], 16); p.speck([160, 30, 30], 20); },
  warped_wart_block: p => { p.noise([20, 120, 115], 16); p.speck([40, 160, 150], 20); },
  shroomlight: p => { p.noise([240, 150, 70], 18); p.speck([255, 220, 150], 30); },
  crimson_fungus: p => { p.clear(); p.rect(7, 9, 8, 15, [200, 140, 100]); p.rect(4, 5, 11, 9, [170, 30, 30]); p.speck([240, 160, 60], 4); },
  warped_fungus: p => { p.clear(); p.rect(7, 9, 8, 15, [200, 140, 100]); p.rect(4, 5, 11, 9, [30, 140, 130]); p.set(6, 6, [240, 140, 60]); },
  crimson_roots: p => grassBlades(p, [160, 30, 40], 10),
  warped_roots: p => grassBlades(p, [30, 150, 140], 10),
  weeping_vines: p => { p.clear(); for (let y = 0; y < 16; y++) { p.set(7 + ((y >> 2) & 1), y, [150, 20, 20]); if (y % 3 === 0) p.set(9, y, [180, 40, 30]); } },
  nether_portal: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = Math.sin(x * 0.7 + y * 0.4) * 0.5 + 0.5; p.set(x, y, [90 + k * 80, 20 + k * 30, 200 + k * 55], 190); } },
  end_stone: p => { p.noise([221, 223, 165], 8); p.speck([200, 200, 140], 25); p.speck([235, 235, 190], 15); },
  end_stone_bricks: p => bricks(p, [220, 224, 162], [190, 190, 140], 8, 8, 8),
  purpur_block: p => { tiles(p, [168, 122, 168], 8, [130, 90, 130]); },
  purpur_pillar: p => { p.noise([170, 125, 170], 6); for (let x = 0; x < 16; x += 4) p.rect(x, 0, x, 15, [130, 90, 130]); },
  purpur_pillar_top: p => { p.noise([170, 125, 170], 6); p.border([130, 90, 130]); p.rect(4, 4, 11, 11, [150, 105, 150]); },
  end_portal_frame_side: p => { p.copy('end_stone'); p.rect(0, 0, 15, 3, [40, 90, 80], 10); },
  end_portal_frame_top: p => { p.noise([40, 100, 90], 10); p.border([20, 60, 55]); p.rect(4, 4, 11, 11, [25, 40, 40]); },
  end_portal_frame_eye: p => { p.copy('end_portal_frame_top'); p.rect(4, 4, 11, 11, [30, 110, 70]); p.rect(6, 6, 9, 9, [140, 220, 120]); p.rect(7, 6, 8, 9, [10, 20, 10]); },
  end_portal: p => { p.fill([5, 10, 20], 3); p.speck([80, 200, 180], 10); },
  end_gateway: p => { p.fill([5, 10, 20], 3); p.speck([200, 200, 255], 10); },
  dragon_egg: p => { p.noise([15, 5, 20], 6); p.speck([60, 20, 80], 20); },
  chorus_plant: p => { p.noise([95, 60, 95], 12); p.speck([130, 90, 130], 20); },
  chorus_flower: p => { p.noise([150, 110, 150], 12); p.border([110, 80, 110]); },
  mangrove_roots: p => { p.clear(); for (let i = 0; i < 6; i++) { let x = (p.r() * 16) | 0; for (let y = 0; y < 16; y++) { p.set(x, y, [80, 65, 40]); if (p.r() < 0.3) x += p.r() < 0.5 ? 1 : -1; } } },
  white_wool: p => wool(p, [234, 236, 236]), orange_wool: p => wool(p, [240, 118, 20]), yellow_wool: p => wool(p, [248, 197, 39]), lime_wool: p => wool(p, [112, 185, 25]),
  light_blue_wool: p => wool(p, [58, 175, 217]), blue_wool: p => wool(p, [53, 57, 157]), purple_wool: p => wool(p, [121, 42, 172]), red_wool: p => wool(p, [160, 39, 34]),
  black_wool: p => wool(p, [20, 21, 25]), gray_wool: p => wool(p, [62, 68, 71]), brown_wool: p => wool(p, [114, 71, 40]), green_wool: p => wool(p, [84, 109, 27]),
  // mobs
  pig_skin: p => { p.noise([240, 160, 160], 8); }, pig_face: p => { p.copy('pig_skin'); p.rect(4, 9, 11, 13, [225, 120, 125]); p.set(5, 11, [120, 60, 60]); p.set(10, 11, [120, 60, 60]); p.rect(2, 5, 3, 6, [255, 255, 255]); p.rect(12, 5, 13, 6, [255, 255, 255]); p.set(3, 6, [20, 20, 20]); p.set(12, 6, [20, 20, 20]); },
  cow_skin: p => { p.noise([70, 50, 35], 6); p.blobs([235, 235, 235], 5, 10, 10); }, cow_face: p => { p.copy('cow_skin'); p.rect(4, 10, 11, 15, [190, 160, 140]); p.set(5, 12, [60, 40, 30]); p.set(10, 12, [60, 40, 30]); p.rect(2, 5, 3, 6, [255, 255, 255]); p.rect(12, 5, 13, 6, [255, 255, 255]); p.set(3, 6, [10, 10, 10]); p.set(12, 6, [10, 10, 10]); },
  sheep_wool: p => { p.noise([230, 230, 225], 10); }, sheep_skin: p => p.noise([215, 185, 165], 6), sheep_face: p => { p.noise([215, 185, 165], 6); p.rect(0, 0, 15, 3, [230, 230, 225]); p.rect(3, 6, 4, 7, [255, 255, 255]); p.rect(11, 6, 12, 7, [255, 255, 255]); p.set(4, 7, [20, 20, 20]); p.set(11, 7, [20, 20, 20]); p.rect(6, 11, 9, 12, [230, 160, 160]); },
  chicken_body: p => p.noise([245, 245, 245], 6), chicken_face: p => { p.noise([245, 245, 245], 6); p.set(4, 5, [10, 10, 10]); p.set(11, 5, [10, 10, 10]); p.rect(6, 7, 9, 9, [240, 180, 40]); p.rect(7, 10, 8, 12, [220, 30, 30]); }, chicken_beak: p => p.noise([240, 180, 40], 6),
  zombie_skin: p => p.noise([80, 140, 70], 10), zombie_face: p => { p.noise([80, 140, 70], 10); p.rect(0, 0, 15, 3, [40, 80, 40]); p.rect(3, 6, 5, 7, [20, 40, 20]); p.rect(10, 6, 12, 7, [20, 40, 20]); p.rect(5, 11, 10, 11, [50, 90, 45]); },
  zombie_shirt: p => p.noise([40, 160, 160], 10), zombie_pants: p => p.noise([60, 60, 150], 10),
  skeleton_bone: p => { p.noise([200, 200, 200], 8); for (let y = 2; y < 16; y += 4) p.rect(0, y, 15, y, [130, 130, 130]); }, skeleton_face: p => { p.noise([200, 200, 200], 8); p.rect(3, 5, 5, 8, [40, 40, 40]); p.rect(10, 5, 12, 8, [40, 40, 40]); p.rect(7, 9, 8, 10, [60, 60, 60]); p.rect(4, 12, 11, 12, [60, 60, 60]); },
  creeper_skin: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = p.r(); p.set(x, y, k < 0.2 ? [180, 230, 170] : k < 0.5 ? [90, 190, 70] : [60, 160, 50]); } },
  creeper_face: p => { p.copy('creeper_skin'); p.rect(3, 4, 6, 7, [10, 10, 10]); p.rect(9, 4, 12, 7, [10, 10, 10]); p.rect(6, 8, 9, 13, [10, 10, 10]); p.rect(4, 10, 5, 14, [10, 10, 10]); p.rect(10, 10, 11, 14, [10, 10, 10]); },
  spider_body: p => { p.noise([50, 40, 35], 10); }, spider_face: p => { p.noise([50, 40, 35], 8); p.rect(3, 6, 4, 7, [220, 20, 20]); p.rect(11, 6, 12, 7, [220, 20, 20]); p.rect(6, 5, 6, 5, [200, 0, 0]); p.rect(9, 5, 9, 5, [200, 0, 0]); },
  enderman_skin: p => p.noise([22, 22, 22], 5), enderman_face: p => { p.noise([22, 22, 22], 5); p.rect(2, 8, 6, 9, [220, 100, 255]); p.rect(9, 8, 13, 9, [220, 100, 255]); p.set(3, 8, [255, 220, 255]); p.set(12, 8, [255, 220, 255]); },
  blaze_skin: p => { p.noise([240, 200, 40], 20); p.speck([255, 130, 20], 30); }, blaze_face: p => { p.copy('blaze_skin'); p.rect(3, 6, 6, 7, [80, 40, 10]); p.rect(9, 6, 12, 7, [80, 40, 10]); p.rect(5, 11, 10, 12, [100, 50, 10]); },
  ghast_skin: p => { p.noise([240, 240, 240], 6); }, ghast_face: p => { p.noise([240, 240, 240], 6); p.rect(2, 5, 5, 7, [40, 40, 40]); p.rect(10, 5, 13, 7, [40, 40, 40]); p.rect(5, 10, 10, 12, [40, 40, 40]); },
  piglin_skin: p => p.noise([225, 160, 140], 8), piglin_face: p => { p.noise([225, 160, 140], 8); p.rect(4, 9, 11, 14, [200, 120, 110]); p.set(6, 11, [80, 40, 40]); p.set(9, 11, [80, 40, 40]); p.rect(3, 5, 5, 6, [255, 255, 255]); p.rect(10, 5, 12, 6, [255, 255, 255]); p.set(4, 6, [20, 20, 20]); p.set(11, 6, [20, 20, 20]); p.set(2, 13, [250, 240, 200]); p.set(13, 13, [250, 240, 200]); },
  villager_robe: p => { p.noise([120, 80, 55], 8); }, villager_skin: p => p.noise([190, 140, 110], 6), villager_face: p => { p.noise([190, 140, 110], 6); p.rect(0, 0, 15, 3, [90, 60, 40]); p.rect(3, 5, 5, 6, [255, 255, 255]); p.rect(10, 5, 12, 6, [255, 255, 255]); p.set(4, 6, [30, 120, 30]); p.set(11, 6, [30, 120, 30]); p.rect(6, 4, 9, 13, [170, 120, 95]); },
  steve_skin: p => p.noise([200, 145, 115], 6), steve_hair: p => p.noise([60, 40, 25], 8),
  steve_face: p => { p.noise([200, 145, 115], 6); p.rect(0, 0, 15, 3, [60, 40, 25]); p.rect(0, 4, 1, 5, [60, 40, 25]); p.rect(14, 4, 15, 5, [60, 40, 25]); p.rect(2, 7, 3, 8, [255, 255, 255]); p.rect(4, 7, 5, 8, [70, 60, 160]); p.rect(10, 7, 11, 8, [70, 60, 160]); p.rect(12, 7, 13, 8, [255, 255, 255]); p.rect(6, 10, 9, 10, [150, 95, 75]); p.rect(5, 12, 10, 12, [110, 60, 50]); },
  steve_back: p => { p.noise([60, 40, 25], 8); },
  steve_shirt: p => p.noise([0, 170, 170], 8), steve_pants: p => p.noise([60, 60, 160], 8),
  dragon_skin: p => { p.noise([25, 25, 28], 8); p.speck([50, 45, 55], 20); }, dragon_face: p => { p.copy('dragon_skin'); p.rect(2, 5, 5, 6, [220, 80, 255]); p.rect(10, 5, 13, 6, [220, 80, 255]); }, dragon_wing: p => { p.noise([40, 35, 45], 8); for (let i = 0; i < 16; i += 4) p.rect(i, 0, i, 15, [20, 20, 22]); },
  crystal: p => { p.clear(); p.border([200, 150, 255, 200]); for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) p.set(x, y, [220, 180, 255], 70); }, crystal_core: p => { p.noise([255, 120, 220], 30); },
  pillager_face: p => { p.noise([150, 150, 150], 6); p.rect(0, 0, 15, 4, [50, 50, 55]); p.rect(3, 6, 5, 7, [255, 255, 255]); p.rect(10, 6, 12, 7, [255, 255, 255]); p.set(4, 7, [40, 40, 40]); p.set(11, 7, [40, 40, 40]); p.rect(6, 5, 9, 13, [130, 130, 130]); },
  pillager_robe: p => { p.noise([60, 60, 70], 6); p.rect(6, 0, 9, 15, [90, 60, 40]); },
  guardian_skin: p => { tiles(p, [90, 150, 140], 4, [200, 120, 70]); }, guardian_face: p => { p.copy('guardian_skin'); p.rect(5, 5, 10, 10, [240, 240, 230]); p.rect(7, 6, 8, 9, [200, 60, 20]); },
  warden_skin: p => { p.noise([20, 45, 55], 8); p.speck([40, 150, 160], 18); }, warden_face: p => { p.copy('warden_skin'); p.rect(2, 3, 4, 6, [80, 220, 230]); p.rect(11, 3, 13, 6, [80, 220, 230]); p.rect(5, 9, 10, 13, [10, 20, 25]); },
  shulker_shell: p => { p.noise([150, 100, 150], 8); p.border([110, 70, 110]); }, shulker_face: p => { p.noise([220, 220, 120], 8); p.rect(5, 6, 6, 7, [20, 20, 20]); p.rect(9, 6, 10, 7, [20, 20, 20]); },
  drowned_skin: p => p.noise([70, 150, 150], 10), drowned_face: p => { p.noise([70, 150, 150], 10); p.rect(3, 6, 5, 7, [140, 255, 240]); p.rect(10, 6, 12, 7, [140, 255, 240]); },
  hoglin_skin: p => { p.noise([200, 120, 90], 10); p.speck([240, 210, 120], 8); }, hoglin_face: p => { p.copy('hoglin_skin'); p.rect(3, 9, 12, 14, [220, 140, 110]); p.rect(1, 10, 2, 14, [240, 230, 200]); p.rect(13, 10, 14, 14, [240, 230, 200]); p.rect(3, 4, 4, 5, [40, 40, 40]); p.rect(11, 4, 12, 5, [40, 40, 40]); },
  goat_skin: p => p.noise([235, 230, 225], 8), goat_face: p => { p.noise([235, 230, 225], 8); p.rect(3, 5, 4, 6, [180, 140, 40]); p.rect(11, 5, 12, 6, [180, 140, 40]); p.rect(6, 11, 9, 15, [200, 195, 190]); },
  magma_skin: p => { p.noise([60, 20, 10], 8); p.speck([255, 140, 20], 30); },
  breeze_skin: p => { p.noise([170, 190, 230], 14); }, breeze_face: p => { p.copy('breeze_skin'); p.rect(3, 6, 5, 8, [60, 80, 160]); p.rect(10, 6, 12, 8, [60, 80, 160]); },
  wither_skel_bone: p => { p.noise([45, 45, 45], 6); for (let y = 2; y < 16; y += 4) p.rect(0, y, 15, y, [25, 25, 25]); }, wither_skel_face: p => { p.noise([45, 45, 45], 6); p.rect(3, 5, 5, 8, [10, 10, 10]); p.rect(10, 5, 12, 8, [10, 10, 10]); },
  armor_leather: p => p.noise([160, 101, 64], 8), armor_golden: p => { p.noise([250, 215, 60], 10); p.border([200, 150, 30]); }, armor_chainmail: p => { p.clear(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 2 === 0) p.set(x, y, [160, 160, 170]); },
  armor_iron: p => { p.noise([215, 215, 215], 8); p.border([160, 160, 160]); }, armor_diamond: p => { p.noise([90, 230, 220], 10); p.border([40, 160, 160]); }, armor_netherite: p => { p.noise([75, 66, 70], 6); p.border([45, 40, 42]); },
  fireball: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = p.r(); p.set(x, y, k < 0.3 ? [255, 240, 120] : k < 0.7 ? [255, 140, 20] : [180, 40, 10]); } },
  white: p => p.fill([255, 255, 255], 0), tnt_flash: p => p.fill([255, 255, 255], 0),
  elytra_tex: p => { p.noise([110, 110, 130], 8); p.speck([150, 150, 170], 15); }, boat_wood: p => planks(p, [162, 130, 78]),
  arrow_tex: p => { p.clear(); p.rect(0, 7, 15, 8, [120, 90, 50]); p.rect(12, 5, 15, 10, [200, 200, 200]); p.rect(0, 5, 2, 10, [240, 240, 240]); },
  // efectos
  soft: p => soft(p, [255, 255, 255], 1.5),
  spark: p => soft(p, [255, 230, 160], 3),
  ember: p => soft(p, [255, 160, 60], 2.5),
  snowflake: p => { p.clear(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); const a = Math.max(0, 1 - d / 7); const star = (Math.abs(x - 7.5) < 1 || Math.abs(y - 7.5) < 1 || Math.abs(x - y) < 1 || Math.abs(x + y - 15) < 1) ? 1 : 0.4; p.set(x, y, [255, 255, 255], 255 * a * star); } },
  bubble_p: p => { p.clear(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7.5 && d > 5.5) p.set(x, y, [200, 230, 255], 220); else if (d <= 5.5) p.set(x, y, [200, 230, 255], 40); } p.set(5, 5, [255, 255, 255], 255); },
  portal_p: p => soft(p, [200, 100, 255], 2),
  drip: p => soft(p, [255, 255, 255], 2),
  raindrop: p => { p.clear(); for (let y = 0; y < 16; y++) p.set(8, y, [200, 220, 255], 160); },
});
for (let i = 0; i < 4; i++) TEXGEN['smoke_' + i] = p => {
  const r = p.r; const blobs = []; for (let k = 0; k < 7; k++) blobs.push([4 + r() * 8, 4 + r() * 8, 2.5 + r() * 3.5]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let a = 0; for (const [bx, by, br] of blobs) a = Math.max(a, 1 - Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br);
    const edge = Math.max(0, 1 - Math.hypot(x - 7.5, y - 7.5) / 8); a = Math.min(1, a * 1.3) * edge; const v = 200 + (r() - 0.5) * 50;
    p.set(x, y, [v, v, v], 255 * Math.pow(a, 0.9));
  }
};
const ORECOL = { coal: [[40, 40, 40], [20, 20, 20]], iron: [[216, 175, 147], [180, 130, 100]], copper: [[220, 120, 80], [90, 170, 130]], gold: [[252, 238, 75], [200, 160, 30]], redstone: [[255, 30, 30], [170, 0, 0]], lapis: [[40, 80, 200], [20, 50, 150]], diamond: [[100, 240, 230], [40, 180, 180]], emerald: [[60, 230, 110], [20, 150, 60]] };
for (const o in ORECOL) TEXGEN['deepslate_' + o + '_ore'] = p => oreTex(p, 'deepslate', ORECOL[o][0], ORECOL[o][1]);
for (let i = 0; i < 3; i++) TEXGEN['flame_' + i] = p => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const t = y / 15; const w = 6.5 * Math.pow(t, 0.6) + 0.5; const dx = Math.abs(x - 7.5 - Math.sin(y * 0.5 + i * 2) * (1 - t) * 2);
    let a = Math.max(0, 1 - dx / w) * Math.min(1, (1 - Math.abs(t - 0.6)) * 1.6); a *= 0.7 + p.r() * 0.3;
    const hot = Math.max(0, 1 - dx / w * 1.6) * t; p.set(x, y, [255, 120 + hot * 135, 30 + hot * 160], 255 * a);
  }
};
for (let i = 0; i < 10; i++) TEXGEN['destroy_' + i] = p => {
  p.clear(); const r = mulberry32(777); const n = 3 + i * 6;
  for (let k = 0; k < n; k++) { let x = 8 + ((r() - 0.5) * (4 + i)) | 0, y = 8 + ((r() - 0.5) * (4 + i)) | 0; const len = 2 + (r() * (2 + i)) | 0; for (let j = 0; j < len; j++) { p.set(x, y, [30, 30, 30], 255); x += ((r() * 3) | 0) - 1; y += ((r() * 3) | 0) - 1; } }
};
function cobble(p, c, dark) {
  const pts = []; const r = p.r; for (let i = 0; i < 9; i++) pts.push([r() * 16, r() * 16, (r() - 0.5) * 30]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let d1 = 99, d2 = 99, k = 0; for (const q of pts) for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) { const d = Math.hypot(x - q[0] - ox, y - q[1] - oy); if (d < d1) { d2 = d1; d1 = d; k = q[2]; } else if (d < d2) d2 = d; }
    const edge = d2 - d1 < 1.2; const v = (r() - 0.5) * 12; p.set(x, y, edge ? dark.map(q => q + v) : c.map(q => q + k + v + (d1 < 2 ? 10 : 0)));
  }
}
// árboles
const WOODS = { oak: [[162, 130, 78], [102, 81, 51], [180, 145, 90], [90, 160, 50]], spruce: [[115, 85, 50], [58, 37, 17], [130, 100, 60], [60, 100, 60]], birch: [[196, 179, 123], [220, 220, 215], [210, 190, 130], [110, 150, 70]], jungle: [[160, 115, 80], [85, 67, 25], [175, 130, 90], [70, 160, 40]], acacia: [[168, 90, 50], [104, 97, 88], [185, 100, 55], [110, 150, 40]], dark_oak: [[66, 43, 20], [60, 46, 26], [80, 55, 30], [50, 110, 30]], mangrove: [[117, 54, 48], [84, 66, 40], [130, 60, 52], [80, 150, 50]] };
for (const w in WOODS) {
  const [pl, bark, inner, leaf] = WOODS[w];
  TEXGEN[w + '_planks'] = p => planks(p, pl);
  TEXGEN[w + '_log'] = p => { if (w === 'birch') { p.noise([215, 215, 210], 6); for (let i = 0; i < 9; i++) { const x = (p.r() * 14) | 0, y = (p.r() * 16) | 0; p.rect(x, y, x + 2 + (p.r() * 3 | 0), y, [40, 40, 40]); } } else logSide(p, bark); };
  TEXGEN[w + '_log_top'] = p => logTop(p, bark, inner);
  TEXGEN[w + '_leaves'] = p => leaves(p, (w === 'spruce' || w === 'birch') ? leaf : [150, 150, 150], w === 'dark_oak' ? 0.1 : 0.18);
  TEXGEN[w + '_sapling'] = p => { p.clear(); for (let y = 9; y < 16; y++) p.set(7, y, bark); for (let i = 0; i < 30; i++) { const a = p.r() * 6.28, rr = p.r() * 5; p.set(7 + Math.cos(a) * rr | 0, 6 + Math.sin(a) * rr * 0.8 | 0, leaf.map(v => v + (p.r() - 0.5) * 40)); } };
}

Object.assign(TEXGEN, {
  cherry_log: p => logSide(p, [55, 30, 40], [80, 45, 55]), cherry_log_top: p => logTop(p, [55, 30, 40], [215, 155, 150]), cherry_planks: p => planks(p, [226, 178, 172]),
  cherry_leaves: p => { leaves(p, [235, 160, 200], 0.15); p.speck([250, 200, 225], 20); }, cherry_sapling: p => { p.clear(); for (let y = 9; y < 16; y++) p.set(7, y, [80, 45, 55]); for (let i = 0; i < 30; i++) { const a = p.r() * 6.28, rr = p.r() * 5; p.set(7 + Math.cos(a) * rr | 0, 6 + Math.sin(a) * rr * 0.8 | 0, [240, 170, 210]); } },
  pink_petals: p => { p.clear(); for (let i = 0; i < 26; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, [245, 170, 210]); },
  blast_furnace_side: p => { p.noise([100, 100, 105], 8); p.border([60, 60, 65]); p.rect(0, 0, 15, 3, [130, 130, 135], 5); }, blast_furnace_top: p => { p.noise([95, 95, 100], 6); p.border([60, 60, 65]); },
  blast_furnace_front: p => { p.copy('blast_furnace_side'); p.rect(3, 7, 12, 13, [25, 25, 28]); for (let x = 4; x < 12; x += 2) p.rect(x, 7, x, 13, [70, 70, 75]); },
  smoker_side: p => { planks(p, [110, 85, 60]); p.rect(0, 0, 15, 3, [60, 60, 60]); }, smoker_top: p => { p.noise([70, 70, 70], 6); p.border([40, 40, 40]); },
  smoker_front: p => { p.copy('smoker_side'); p.rect(3, 8, 12, 13, [30, 25, 20]); },
  barrel_side: p => { for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) p.set(x, y, (y === 2 || y === 13) ? [70, 70, 70] : [120 - (x % 4 === 0 ? 25 : 0), 85, 50]); }, barrel_top: p => { planks(p, [130, 95, 55]); p.border([80, 60, 35]); p.rect(6, 6, 9, 9, [50, 35, 20]); }, barrel_bottom: p => planks(p, [130, 95, 55]),
  ender_chest_side: p => { p.noise([30, 45, 45], 6); p.border([15, 25, 25]); p.rect(1, 5, 14, 5, [15, 25, 25]); }, ender_chest_top: p => { p.noise([30, 45, 45], 6); p.border([15, 25, 25]); }, ender_chest_front: p => { p.copy('ender_chest_side'); p.rect(6, 4, 9, 7, [60, 200, 160]); },
  soul_torch: p => { p.clear(); for (let y = 6; y < 16; y++) for (let x = 7; x < 9; x++) p.set(x, y, [110, 85, 45]); p.rect(7, 4, 8, 6, [110, 230, 255]); }, soul_torch_top: p => { p.clear(); p.rect(7, 7, 8, 8, [110, 230, 255]); },
  redstone_torch: p => { p.clear(); for (let y = 6; y < 16; y++) for (let x = 7; x < 9; x++) p.set(x, y, [110, 85, 45]); p.rect(7, 4, 8, 6, [255, 40, 30]); }, redstone_torch_top: p => { p.clear(); p.rect(7, 7, 8, 8, [255, 40, 30]); },
  amethyst_block: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = Math.sin(x * 1.3 + y * 0.7) * 20 + (p.r() - 0.5) * 25; p.set(x, y, [140 + k, 100 + k * 0.6, 200 + k * 0.5]); } }, budding_amethyst: p => { p.copy('amethyst_block'); p.speck([80, 50, 130], 20); },
  amethyst_cluster: p => { p.clear(); for (const [x, h] of [[4, 8], [7, 13], [10, 9], [12, 6]]) for (let y = 15; y > 15 - h; y--) p.rect(x, y, x + 1, y, [200, 150, 250]); },
  ochre_froglight: p => { p.noise([250, 230, 160], 10); p.border([200, 170, 90]); }, verdant_froglight: p => { p.noise([220, 245, 200], 10); p.border([150, 200, 120]); }, pearlescent_froglight: p => { p.noise([245, 220, 240], 10); p.border([210, 160, 200]); },
  slime_block: p => { p.fill([120, 200, 100], 8, 190); p.border([80, 160, 70, 230]); p.rect(4, 4, 11, 11, [100, 180, 80, 220]); }, honey_block: p => { p.fill([240, 170, 40], 8, 200); p.border([200, 120, 20, 230]); },
  anvil: p => { p.noise([70, 70, 72], 6); p.border([45, 45, 48]); }, enchanting_table_top: p => { p.noise([150, 30, 40], 8); p.border([30, 20, 40]); p.rect(5, 5, 10, 10, [240, 240, 230]); p.rect(7, 5, 8, 10, [140, 100, 60]); }, enchanting_table_side: p => { p.copy('obsidian'); p.rect(0, 0, 15, 3, [150, 30, 40]); p.set(3, 6, [80, 220, 230]); p.set(11, 8, [80, 220, 230]); },
  scaffolding: p => { p.clear(); p.border([210, 180, 110]); for (let i = 0; i < 16; i++) { p.set(i, i, [190, 160, 90]); p.set(15 - i, i, [190, 160, 90]); } p.rect(0, 0, 15, 1, [220, 190, 120]); },
  note_block: p => { planks(p, [110, 70, 50]); p.border([60, 40, 25]); p.rect(6, 5, 7, 10, [40, 25, 15]); p.rect(6, 10, 9, 11, [40, 25, 15]); },
  target_side: p => { p.noise([230, 210, 190], 6); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if ((d | 0) % 4 < 2) p.set(x, y, [220, 50, 50]); } }, target_top: p => p.copy('target_side'),
  redstone_lamp: p => { p.noise([120, 70, 40], 10); p.border([80, 45, 25]); p.rect(4, 4, 11, 11, [150, 90, 50]); },
  daylight_top: p => { p.noise([200, 190, 160], 6); p.rect(2, 2, 13, 13, [80, 100, 160]); },
  mud_bricks: p => bricks(p, [140, 106, 80], [100, 75, 55], 4, 8, 10), packed_mud: p => { p.noise([142, 107, 80], 8); }, glass_white: p => { p.fill([255, 255, 255], 4, 110); p.border([240, 240, 240, 200]); },
  honeycomb_block: p => { p.noise([230, 160, 50], 10); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) p.set(x, y, [200, 120, 30]); },
  bee_nest_side: p => { p.noise([200, 160, 80], 10); p.rect(0, 5, 15, 5, [160, 120, 50]); p.rect(0, 10, 15, 10, [160, 120, 50]); }, bee_nest_top: p => { p.noise([210, 170, 90], 8); p.border([160, 120, 50]); }, bee_nest_front: p => { p.copy('bee_nest_side'); p.rect(6, 7, 9, 9, [40, 30, 20]); },
  mushroom_stem: p => { p.noise([220, 215, 200], 6); },
});
// --------------------------------------------------- iconos de objetos (16x16)
function itemTexAuto(p, name) {
  const d = REG[ID[name]]; p.clear();
  if (d && d.tool) return toolIcon(p, d.tool.type, TOOLMAT[d.tool.mat].col);
  if (d && d.armor && ARMORMAT[d.armor.mat]) return armorIcon(p, d.armor.slot, ARMORMAT[d.armor.mat].col);
  const ingot = c => drawMap(p, ['', '', '', '', '', '', '.....########...', '...##bbbbbba##..', '..#bbaaaaaaac#..', '..#baaaaaaacc#..', '..#acccccccc#...', '..###########...'], c);
  const gem = c => drawMap(p, ['', '', '......####......', '.....#bbaa#.....', '....#bbaaaa#....', '...#bbaaaaac#...', '...#baaaaacc#...', '....#aaaacc#....', '.....#aacc#.....', '......#cc#......', '.......##.......'], c);
  const blob = (c, r = 5) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dd = Math.hypot(x - 7.5, (y - 8) * 1.2); if (dd < r) p.set(x, y, c.map(v => v * (1.1 - dd / r * 0.4) + (p.r() - 0.5) * 20)); } outline(p); };
  const dust = c => { for (let i = 0; i < 40; i++) { const x = 3 + (p.r() * 10) | 0, y = 5 + (p.r() * 9) | 0; p.set(x, y, c.map(v => v + (p.r() - 0.5) * 40)); } };
  const meat = (c, bone = true) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dd = Math.hypot(x - 9, (y - 7) * 1.1); if (dd < 5.5) p.set(x, y, c.map(v => v * (1.1 - dd / 10) + (p.r() - 0.5) * 20)); } if (bone) { for (let i = 0; i < 5; i++) p.set(5 - i, 10 + i, [240, 235, 220]); p.set(1, 15, [240, 235, 220]); p.set(0, 14, [240, 235, 220]); } outline(p); };
  const M = {
    stick: () => { for (let i = 0; i < 10; i++) { p.set(3 + i, 12 - i, [130, 95, 50]); p.set(4 + i, 12 - i, [100, 70, 35]); } outline(p); },
    coal: () => gem([[40, 40, 40], [60, 60, 60], [20, 20, 20]]), charcoal: () => gem([[60, 45, 35], [80, 65, 50], [35, 25, 20]]),
    raw_iron: () => blob([200, 170, 140]), raw_gold: () => blob([240, 200, 60]), raw_copper: () => blob([210, 120, 80]),
    iron_ingot: () => ingot([[220, 220, 220], [255, 255, 255], [160, 160, 160]]), gold_ingot: () => ingot([[250, 210, 50], [255, 250, 150], [200, 140, 20]]), copper_ingot: () => ingot([[220, 120, 80], [250, 170, 130], [160, 80, 50]]),
    netherite_ingot: () => ingot([[75, 66, 70], [110, 100, 105], [45, 40, 42]]), netherite_scrap: () => blob([95, 70, 65], 5),
    gold_nugget: () => blob([250, 210, 50], 3), iron_nugget: () => blob([220, 220, 220], 3),
    diamond: () => gem([[90, 230, 220], [200, 255, 250], [40, 160, 160]]), emerald: () => gem([[60, 210, 100], [150, 255, 170], [20, 130, 50]]),
    lapis_lazuli: () => gem([[40, 80, 200], [90, 130, 240], [20, 40, 140]]), quartz: () => gem([[235, 230, 220], [255, 255, 255], [190, 180, 170]]), flint: () => gem([[60, 60, 60], [100, 100, 100], [30, 30, 30]]),
    echo_shard: () => gem([[20, 90, 100], [60, 200, 210], [10, 40, 50]]), heart_of_the_sea: () => blob([40, 120, 200], 5), nautilus_shell: () => blob([230, 210, 190], 5),
    redstone: () => dust([220, 20, 20]), glowstone_dust: () => dust([250, 220, 100]), gunpowder: () => dust([90, 90, 90]), blaze_powder: () => dust([250, 160, 30]), bone_meal: () => dust([240, 240, 230]), sugar: () => dust([255, 255, 255]),
    string: () => { for (let i = 0; i < 12; i++) p.set(2 + i, 8 + Math.round(Math.sin(i * 0.8) * 3), [240, 240, 240]); },
    feather: () => { for (let i = 0; i < 11; i++) { p.set(3 + i, 13 - i, [200, 200, 200]); p.set(4 + i, 12 - i, [250, 250, 250]); p.set(4 + i, 13 - i, [235, 235, 235]); } outline(p); },
    bone: () => { for (let i = 0; i < 10; i++) { p.set(3 + i, 12 - i, [240, 235, 220]); p.set(4 + i, 12 - i, [220, 215, 200]); } p.rect(2, 12, 3, 13, [240, 235, 220]); p.rect(12, 2, 13, 3, [240, 235, 220]); outline(p); },
    leather: () => blob([160, 100, 60], 6), rotten_flesh: () => meat([120, 110, 60], false), clay_ball: () => blob([160, 166, 179], 4), brick: () => ingot([[150, 75, 60], [190, 100, 80], [110, 50, 40]]),
    snowball: () => blob([245, 250, 255], 5), ender_pearl: () => blob([30, 110, 100], 5), eye_of_ender: () => { blob([60, 140, 80], 5); p.rect(7, 5, 8, 11, [10, 20, 10]); },
    blaze_rod: () => { for (let i = 0; i < 11; i++) { p.set(3 + i, 13 - i, [250, 200, 50]); p.set(4 + i, 13 - i, [255, 150, 20]); } outline(p); },
    wheat_seeds: () => { for (let i = 0; i < 6; i++) p.set(4 + ((p.r() * 8) | 0), 6 + ((p.r() * 6) | 0), [80, 160, 50]); }, wheat: () => { for (let i = 0; i < 12; i++) { p.set(3 + i, 13 - i, [220, 190, 80]); if (i > 5) { p.set(2 + i, 13 - i, [200, 170, 60]); p.set(4 + i, 14 - i, [200, 170, 60]); } } outline(p); },
    paper: () => { p.rect(3, 2, 12, 13, [240, 240, 235]); outline(p); }, glow_berries: () => { blob([255, 180, 60], 3); }, chorus_fruit: () => blob([150, 100, 150], 5),
    apple: () => { blob([220, 30, 30], 5.5); p.rect(7, 1, 8, 3, [100, 70, 30]); p.rect(9, 2, 10, 2, [60, 150, 40]); }, golden_apple: () => { blob([250, 210, 50], 5.5); p.rect(7, 1, 8, 3, [100, 70, 30]); p.rect(9, 2, 10, 2, [60, 150, 40]); },
    bread: () => { for (let y = 5; y < 12; y++) for (let x = 2; x < 14; x++) if (Math.hypot((x - 8) / 6, (y - 8) / 3.5) < 1) p.set(x, y, [200, 140, 60].map(v => v + (p.r() - 0.5) * 20)); outline(p); }, melon_slice: () => { for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) { const dd = Math.hypot(x - 8, y - 3); if (dd < 10 && y > 3) p.set(x, y, dd > 8.5 ? [70, 140, 40] : [230, 60, 60]); } outline(p); },
    porkchop: () => meat([240, 140, 140]), cooked_porkchop: () => meat([200, 140, 90]), beef: () => meat([200, 50, 50]), cooked_beef: () => meat([130, 80, 50]),
    chicken: () => meat([240, 200, 180]), cooked_chicken: () => meat([210, 150, 80]), mutton: () => meat([200, 70, 70]), cooked_mutton: () => meat([150, 90, 60]), cod: () => meat([180, 160, 130], false), cooked_cod: () => meat([220, 190, 140], false),
    bucket: () => bucket(p, null), water_bucket: () => bucket(p, [50, 90, 220]), lava_bucket: () => bucket(p, [255, 120, 20]),
    flint_and_steel: () => { for (let i = 0; i < 6; i++) { p.set(3 + i, 4 + Math.round(Math.sin(i / 5 * 3.14) * -2), [150, 150, 150]); } p.rect(3, 4, 4, 9, [150, 150, 150]); p.rect(8, 8, 12, 12, [60, 60, 60]); outline(p); },
    bow: () => { for (let i = 0; i < 12; i++) { const a = i / 11 * Math.PI * 0.9 + 0.1; p.set(2 + Math.round(Math.cos(a - Math.PI * 0.25 + 0.3) * 0) + i, 14 - i - Math.round(Math.sin(a) * 4), [130, 90, 50]); } for (let i = 0; i < 12; i++) p.set(2 + i, 14 - i, [230, 230, 230]); },
    arrow: () => { for (let i = 0; i < 10; i++) p.set(3 + i, 12 - i, [130, 95, 50]); p.rect(11, 2, 13, 4, [200, 200, 200]); p.set(2, 12, [240, 240, 240]); p.set(3, 13, [240, 240, 240]); p.set(2, 13, [240, 240, 240]); outline(p); },
    shield: () => { for (let y = 2; y < 15; y++) for (let x = 3; x < 13; x++) if (y < 10 || Math.abs(x - 7.5) < (15 - y)) p.set(x, y, (x === 3 || x === 12 || y === 2) ? [120, 120, 125] : [150, 110, 60]); outline(p); },
    elytra: () => { for (let y = 2; y < 15; y++) for (let x = 2; x < 14; x++) if (Math.abs(x - 7.5) > 0.6 && y > 2 + Math.abs(x - 7.5) * 0.4) p.set(x, y, [140, 140, 160].map(v => v - y * 3)); outline(p); },
    totem: () => { p.rect(5, 2, 10, 7, [240, 210, 60]); p.rect(3, 8, 12, 12, [240, 210, 60]); p.set(6, 4, [40, 160, 60]); p.set(9, 4, [40, 160, 60]); outline(p); },
    ominous_key: () => { p.rect(3, 3, 7, 7, [180, 140, 60]); p.rect(4, 4, 6, 6, [0, 0, 0, 0]); for (let i = 0; i < 7; i++) p.set(7 + i, 7 + i, [180, 140, 60]); p.set(11, 13, [180, 140, 60]); outline(p); },
    spider_eye: () => { blob([140, 30, 40], 4.5); p.set(7, 7, [10, 10, 10]); }, fermented_spider_eye: () => blob([150, 60, 80], 4.5), ghast_tear: () => { blob([200, 230, 240], 3.5); },
    magma_cream: () => { blob([230, 120, 30], 4); p.speck([255, 220, 60], 5); }, prismarine_shard: () => gem([[100, 170, 160], [150, 220, 210], [60, 120, 110]]), shulker_shell: () => blob([150, 100, 150], 5.5),
    breeze_rod: () => { for (let i = 0; i < 11; i++) { p.set(3 + i, 13 - i, [170, 200, 240]); p.set(4 + i, 13 - i, [120, 150, 220]); } outline(p); }, slime_ball: () => blob([120, 200, 100], 4),
    ink_sac: () => blob([40, 40, 50], 4.5), glow_ink_sac: () => blob([60, 200, 190], 4.5), phantom_membrane: () => blob([200, 200, 180], 5), nether_star: () => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5); if (dx * dy < 6 && dx + dy < 8) p.set(x, y, [250, 250, 220]); } outline(p); },
    dragon_breath: () => { bucket(p, [220, 100, 200]); }, nether_wart: () => blob([170, 40, 40], 3.5), amethyst_shard: () => gem([[180, 130, 230], [220, 190, 255], [120, 80, 180]]), honeycomb: () => blob([240, 170, 40], 5),
    firework_rocket: () => { p.rect(6, 4, 9, 12, [200, 60, 60]); p.rect(6, 2, 9, 3, [230, 230, 230]); p.rect(7, 13, 8, 15, [120, 90, 50]); outline(p); }, book: () => { p.rect(3, 2, 12, 13, [120, 60, 40]); p.rect(4, 3, 11, 12, [240, 235, 220]); p.rect(3, 2, 4, 13, [100, 50, 30]); outline(p); },
    glass_bottle: () => { for (let y = 5; y < 15; y++) for (let x = 4; x < 12; x++) if (Math.hypot(x - 7.5, y - 10) < 4.2) p.set(x, y, [200, 220, 240, 160]); p.rect(7, 2, 8, 5, [200, 220, 240, 180]); outline(p); },
    carrot: () => { for (let i = 0; i < 9; i++) { p.set(3 + i, 12 - i, [240, 130, 30]); p.set(4 + i, 12 - i, [220, 110, 20]); } p.rect(11, 1, 13, 3, [60, 160, 40]); outline(p); }, potato: () => blob([200, 160, 90], 4.5), baked_potato: () => blob([220, 170, 80], 4.5), golden_carrot: () => { for (let i = 0; i < 9; i++) { p.set(3 + i, 12 - i, [250, 210, 60]); p.set(4 + i, 12 - i, [220, 180, 40]); } outline(p); },
    salmon: () => meat([230, 110, 90], false), cooked_salmon: () => meat([210, 140, 90], false), sweet_berries: () => { blob([200, 30, 50], 3); }, cookie: () => { blob([200, 140, 70], 5); p.speck([80, 40, 20], 6); },
    pumpkin_pie: () => blob([220, 140, 60], 5.5), mushroom_stew: () => { for (let y = 7; y < 13; y++) for (let x = 3; x < 13; x++) if (Math.hypot((x - 7.5) / 5, (y - 7) / 5.5) < 1) p.set(x, y, [140, 100, 60]); p.rect(4, 7, 11, 8, [200, 150, 100]); outline(p); },
    milk_bucket: () => bucket(p, [245, 245, 245]), sugar: () => dust([255, 255, 255]),
    shears: () => { for (let i = 0; i < 7; i++) { p.set(4 + i, 4 + i, [200, 200, 205]); p.set(11 - i, 4 + i, [200, 200, 205]); } p.rect(2, 11, 4, 13, [180, 60, 40]); p.rect(11, 11, 13, 13, [180, 60, 40]); outline(p); },
    compass: () => { blob([150, 150, 155], 5.5); p.rect(5, 5, 10, 10, [230, 230, 220]); p.set(8, 5, [220, 30, 30]); p.set(8, 6, [220, 30, 30]); p.set(7, 9, [60, 60, 60]); }, clock: () => { blob([250, 210, 60], 5.5); p.rect(5, 5, 10, 10, [60, 120, 220]); p.rect(5, 8, 10, 10, [40, 140, 40]); },
    spyglass: () => { for (let i = 0; i < 10; i++) { p.set(3 + i, 12 - i, [200, 120, 70]); p.set(4 + i, 12 - i, [170, 100, 60]); } p.rect(11, 2, 13, 4, [180, 130, 230]); outline(p); }, map: () => { p.rect(2, 2, 13, 13, [230, 220, 180]); p.rect(4, 4, 11, 11, [140, 180, 110]); outline(p); }, lead: () => { for (let i = 0; i < 12; i++) p.set(2 + i, 8 + Math.round(Math.sin(i) * 3), [180, 140, 90]); outline(p); },
    turtle_helmet: () => armorIcon(p, 0, [80, 160, 70]), trident: () => { for (let i = 0; i < 11; i++) p.set(2 + i, 13 - i, [80, 150, 140]); p.rect(11, 1, 14, 2, [80, 170, 160]); p.rect(13, 1, 14, 4, [80, 170, 160]); outline(p); },
    crossbow: () => { for (let i = 0; i < 10; i++) p.set(3 + i, 12 - i, [110, 80, 45]); for (let i = 0; i < 8; i++) { p.set(4 + i, 3 + (i >> 2), [80, 80, 85]); p.set(12 - (i >> 2), 4 + i, [80, 80, 85]); } outline(p); },
    mace: () => { for (let i = 0; i < 9; i++) p.set(3 + i, 12 - i, [120, 100, 80]); p.rect(9, 2, 13, 6, [90, 90, 100]); outline(p); }, heavy_core: () => blob([70, 70, 80], 5),
    brush: () => { for (let i = 0; i < 7; i++) p.set(3 + i, 12 - i, [150, 110, 60]); p.rect(9, 2, 13, 6, [220, 200, 160]); outline(p); }, fishing_rod: () => { for (let i = 0; i < 12; i++) p.set(2 + i, 13 - i, [120, 90, 50]); for (let y = 2; y < 14; y++) p.set(13, y, [230, 230, 230]); },
    saddle: () => blob([120, 70, 40], 5), name_tag: () => { p.rect(3, 5, 12, 10, [220, 210, 180]); outline(p); }, netherite_upgrade: () => { p.rect(3, 2, 12, 13, [60, 50, 50]); p.rect(5, 4, 10, 11, [110, 90, 85]); outline(p); },
  };
  if (M[name]) M[name](); else blob([200, 0, 200], 5);
}
function bucket(p, liquid) {
  for (let y = 4; y < 14; y++) { const w = 5 - (y - 4) * 0.25; for (let x = Math.round(8 - w); x < Math.round(8 + w); x++) p.set(x, y, [170, 170, 175].map(v => v + (x < 6 ? 25 : x > 10 ? -25 : 0))); }
  for (let x = 2; x < 14; x++) p.set(x, 4, [120, 120, 125]); if (liquid) { for (let x = 3; x < 13; x++) p.set(x, 5, liquid); for (let x = 4; x < 12; x++) p.set(x, 4, liquid.map(v => Math.min(255, v + 40))); }
  outline(p);
}
function outline(p) {
  const a = Array.from({ length: 256 }, (_, i) => p.d[i * 4 + 3] > 0);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { if (a[y * 16 + x]) continue; let n = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < 16 && yy < 16 && a[yy * 16 + xx]) n = true; } if (n) p.set(x, y, [25, 25, 25]); }
}
function drawMap(p, rows, cols) {
  const [a, b, c] = cols; const off = Math.max(0, Math.floor((16 - rows.length) / 2));
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const ch = r[x]; const yy = y + (rows.length < 14 ? off : 0); if (ch === '#') p.set(x, yy, [25, 25, 25]); else if (ch === 'a') p.set(x, yy, a); else if (ch === 'b') p.set(x, yy, b); else if (ch === 'c') p.set(x, yy, c); } });
}
function toolIcon(p, type, col) {
  const hd = [110, 80, 40], hl = [140, 105, 55]; const light = col.map(v => Math.min(255, v * 1.25 + 20)), dark = col.map(v => v * 0.65);
  const handle = (x0, y0, n) => { for (let i = 0; i < n; i++) { p.set(x0 + i, y0 - i, hl); p.set(x0 + i + 1, y0 - i, hd); } };
  if (type === 'sword') {
    for (let i = 0; i < 9; i++) { p.set(5 + i, 10 - i, light); p.set(6 + i, 10 - i, col); p.set(6 + i, 11 - i, dark); }
    for (let i = -2; i <= 2; i++) p.set(5 + i, 11 + i, dark); handle(2, 13, 3); p.set(1, 14, dark);
  } else if (type === 'pickaxe') {
    handle(2, 13, 9);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dd = Math.hypot(x - 1, y - 14); if (dd > 11.3 && dd < 13.6 && x >= 3 && y <= 12) p.set(x, y, dd > 12.5 ? light : col); }
  } else if (type === 'axe') {
    handle(2, 13, 9);
    for (let y = 1; y < 9; y++) for (let x = 5; x < 12; x++) { if (x - 1 > 13 - y - 3 + 1 && x - y < 6 && Math.hypot(x - 8, y - 4) < 4.6) p.set(x, y, (x + y) % 5 === 0 ? light : col); }
    for (let y = 1; y < 9; y++) for (let x = 5; x < 12; x++) { const i = p.d[(y * 16 + x) * 4 + 3]; if (i && Math.hypot(x - 8, y - 4) > 3.6) p.set(x, y, light); }
  } else if (type === 'shovel') {
    handle(2, 13, 8);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const u = (x - 11.5 + y - 4.5) / 2, v = (x - 11.5 - (y - 4.5)) / 2; if (Math.abs(u) + Math.abs(v) * 0.9 < 2.8) p.set(x, y, v < -0.6 ? light : v > 0.8 ? dark : col); }
  } else if (type === 'hoe') {
    handle(2, 13, 9); p.rect(7, 2, 11, 3, col); p.rect(7, 4, 8, 4, dark);
  }
  outline(p);
}
function armorIcon(p, slot, col) {
  const light = col.map(v => Math.min(255, v * 1.25 + 20)), dark = col.map(v => v * 0.65);
  const maps = [
    ['', '', '', '....########....', '...#bbbbbbaa#...', '...#baaaaaac#...', '...#ac####cc#...', '...#a#....#c#...', '...###....###...'],
    ['', '..###......###..', '..#ba######ab#..', '..#baaaaaaaac#..', '..#bbaaaaaacc#..', '..###baaaac###..', '....#baaaac#....', '....#baaaac#....', '....#baaaac#....', '....#bbaacc#....', '....########....'],
    ['', '....########....', '....#baaaac#....', '....#baaaac#....', '....#ba##ac#....', '....#ba##ac#....', '....#ba##ac#....', '....#ba##ac#....', '....#ba##ac#....', '....####.###....'],
    ['', '', '', '', '..####....####..', '..#ba#....#ac#..', '..#ba#....#ac#..', '..#ba#....#ac#..', '.#bba#....#acc#.', '.#baa#....#aac#.', '.######..######.']];
  drawMap(p, maps[slot], [col, light, dark]);
}
function autoTex(p, name) {
  if (ID[name] !== undefined && !REG[ID[name]].isBlock) return itemTexAuto(p, name);
  p.fill([255, 0, 255], 0);
}
