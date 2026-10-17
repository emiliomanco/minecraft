// ============================================================================
//  Modelos y pieles de los mobs y del jugador (estilo clásico, pintados por código en el atlas de pieles)
//  Cada pieza: P.bp(tamaño, pivote, desplazamiento, null, papel, pintura). El papel decide la animación (partRot)
//  y cómo se agrupa en el ragdoll. pt.rot = giro fijo extra (orejas, cuernos, púas); pt.wool = lana teñible.
// ============================================================================
// pinturas comunes
const skBand = (c, y0, n) => (P, x, y, w) => P.rect(x, y + y0, w, n, c, 6);                       // franja horizontal
const skBottom = (c, n) => (P, x, y, w, h) => P.rect(x, y + h - n, w, n, c, 6);                    // pezuñas, zapatos
const skDots = (c, n, size = 2) => (P, x, y, w, h) => P.blot(x, y, w, h, c, n, size);
function skMouth(P, x, y, w, row, c, mw = 4) { P.rect(x + Math.floor((w - mw) / 2), row, mw, 1, c); }
function skHumanoid(name, o) {
  const P = new SkinP(name, o.sw || 64, o.shh || 64);
  const hs = o.head || [8, 8, 8], bw = o.bodyW || 8, bh = o.bodyH || 12, bd = o.bodyD || 4, aw = o.armW || 4, ad = o.armD || aw, ah = o.armH || 12, lw = o.legW || 4, ld = o.legD || lw, lh = o.legH || 12;
  const top = lh + bh, lx = o.legX ?? lw / 2;
  const parts = [
    P.bp(hs, [0, top, 0], [-hs[0] / 2, 0, -hs[2] / 2], null, 'head', o.headSpec),
    P.bp([bw, bh, bd], [0, lh, 0], [-bw / 2, 0, -bd / 2], null, 'body', o.bodySpec),
    ...P.same([aw, ah, ad], [[[bw / 2 + aw / 2, top - 2, 0], [-aw / 2, -ah + 2, -ad / 2], o.armPose || 'armR'], [[-bw / 2 - aw / 2, top - 2, 0], [-aw / 2, -ah + 2, -ad / 2], o.armPose ? o.armPose + 'L' : 'armL']], o.armSpec),
    ...P.same([lw, lh, ld], [[[lx, lh, 0], [-lw / 2, -lh, -ld / 2], 'legR'], [[-lx, lh, 0], [-lw / 2, -lh, -ld / 2], 'legL']], o.legSpec)
  ];
  if (o.extra) parts.push(...o.extra(P, top, hs));
  return parts;
}
// caras de humanoides
function skFaceHuman(skin, eye, mouth, opts = {}) {
  return (P, x, y, w, h) => {
    const ey = y + (opts.eyeRow ?? Math.floor(h / 2)); skEyes(P, x, y, w, ey, eye, opts);
    if (opts.brow) P.rect(x + 1, ey - 1, w - 2, 1, opts.brow, 4);
    if (opts.nose !== false) { P.set(x + w / 2 - 1, ey + 1, shd(skin, 0.78)); P.set(x + w / 2, ey + 1, shd(skin, 0.78)); }
    if (mouth) skMouth(P, x, y, w, ey + 2, mouth, opts.mw || 4);
    if (opts.beard) P.rect(x + 1, ey + 3, w - 2, 1, shd(skin, 0.88), 4);
  };
}
function skinModels() {
  const M = {};
  // ------------------------------------------------------------ jugador
  {
    const skin = [196, 142, 108], hair = [72, 46, 28], shirt = [24, 158, 160], pants = [54, 58, 150], shoe = [82, 82, 92];
    M.steve = skHumanoid('steve', {
      headSpec: { base: skin, v: 5, all: (P, x, y, w, h, f) => skHair(P, x, y, w, h, f, hair, 2, 3), front: skFaceHuman(skin, [70, 66, 170], [118, 66, 48], { brow: null, beard: true }) },
      bodySpec: { base: shirt, v: 7, front: (P, x, y, w) => { P.set(x + 3, y, skin); P.set(x + 4, y, skin); P.set(x + 3, y + 1, shd(skin, 0.9)); P.set(x + 4, y + 1, shd(skin, 0.9)); }, bottomC: pants },
      armSpec: { base: skin, v: 5, sides: (P, x, y, w) => P.rect(x, y, w, 4, shirt, 7), top: shirt, bottom: shd(skin, 0.9) },
      legSpec: { base: pants, v: 7, sides: skBottom(shoe, 2), bottom: shoe }
    });
  }
  // ------------------------------------------------------------ zombis
  const zombieLike = (name, skin, shirt, pants, eye, opts = {}) => skHumanoid(name, {
    armPose: 'armZ',
    headSpec: { base: skin, v: 9, all: opts.hair ? (P, x, y, w, h, f) => skHair(P, x, y, w, h, f, opts.hair, 1, 2) : null, front: (P, x, y, w, h) => { const ey = y + 4; P.rect(x + 1, ey, 2, 1, eye); P.rect(x + 5, ey, 2, 1, eye); P.set(x + 3, ey + 1, shd(skin, 0.6)); P.set(x + 4, ey + 1, shd(skin, 0.6)); P.rect(x + 2, ey + 2, 4, 1, shd(skin, 0.55)); P.speck(x, y, w, h, shd(skin, 0.8), 4); } },
    bodySpec: { base: shirt, v: 10, sides: (P, x, y, w, h) => { P.rect(x, y + h - 2, w, 2, pants, 6); P.speck(x, y, w, h - 2, shd(shirt, 0.75), 6); if (opts.weed) P.blot(x, y, w, h, opts.weed, 3, 3); }, bottomC: pants },
    armSpec: { base: skin, v: 9, sides: (P, x, y, w) => { P.rect(x, y, w, 4, shirt, 8); P.set(x + 1, y + 4, shirt); }, top: shirt },
    legSpec: { base: pants, v: 9, sides: (P, x, y, w, h) => { P.rect(x, y + h - 2, w, 2, opts.shoe || shd(pants, 0.6), 6); if (opts.torn) P.rect(x, y + h - 4, w, 2, skin, 8); if (opts.weed) P.blot(x, y, w, h, opts.weed, 2, 3); } }
  });
  M.zombie = zombieLike('zombie', [96, 146, 84], [42, 150, 152], [70, 64, 150], [18, 34, 18], { shoe: [60, 60, 70] });
  M.husk = zombieLike('husk', [182, 160, 112], [140, 112, 74], [102, 86, 62], [40, 30, 18], { hair: [120, 100, 70], shoe: [80, 64, 44] });
  M.drowned = zombieLike('drowned', [84, 152, 144], [64, 112, 120], [58, 92, 104], [130, 245, 240], { weed: [70, 140, 62], torn: true, shoe: [50, 80, 86] });
  // ------------------------------------------------------------ esqueletos (huesos finos, costillas huecas)
  const skeleLike = (name, bone, dark) => skHumanoid(name, {
    armW: 2, legW: 2, armPose: 'armB',
    headSpec: { base: bone, v: 7, front: (P, x, y, w, h) => { const ey = y + 3; P.rect(x + 1, ey, 2, 2, SKC.black); P.rect(x + 5, ey, 2, 2, SKC.black); P.set(x + 3, ey + 2, dark); P.set(x + 4, ey + 2, dark); P.rect(x + 1, ey + 4, 6, 1, dark); for (let i = 0; i < 6; i += 2) P.set(x + 1 + i, ey + 4, bone); } },
    bodySpec: { base: bone, v: 6, sides: (P, x, y, w, h, f) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const spine = Math.abs(i - (w - 1) / 2) < 1; const rib = j % 2 === 0 && j < h - 4; const hip = j >= h - 2; if (!spine && !rib && !hip) P.set(x + i, y + j, [0, 0, 0], 0); else if (rib && !spine) P.set(x + i, y + j, shd(bone, 0.92)); } } },
    armSpec: { base: bone, v: 6, sides: (P, x, y, w, h) => { P.set(x, y + 5, dark); P.set(x + 1, y + h - 1, dark); } },
    legSpec: { base: bone, v: 6, sides: (P, x, y, w, h) => P.set(x, y + 6, dark) }
  });
  M.skeleton = skeleLike('skeleton', [206, 206, 200], [110, 110, 108]);
  M.wither_skeleton = skeleLike('wither_skeleton', [58, 58, 62], [22, 22, 24]);
  // ------------------------------------------------------------ aldeano e illagers (cabeza alta y nariz grande)
  const nose = (skin) => (P, top) => [P.bp([2, 4, 2], [0, top, 0], [-1, -1, -6], null, 'head', { base: shd(skin, 0.92), v: 5, bottom: shd(skin, 0.8) })];
  {
    const skin = [188, 138, 104], robe = [112, 76, 48], robeD = [86, 56, 34];
    const P = new SkinP('villager');
    const top = 24;
    M.villager = [
      P.bp([8, 10, 8], [0, top, 0], [-4, 0, -4], null, 'head', { base: skin, v: 5, front: (P, x, y, w) => { P.rect(x + 1, y + 3, 6, 1, [70, 50, 34]); skEyes(P, x, y, w, y + 4, [52, 140, 60]); P.rect(x + 2, y + 7, 4, 1, shd(skin, 0.7)); } }),
      P.bp([8, 12, 6], [0, 12, 0], [-4, 0, -3], null, 'body', { base: robe, v: 8, sides: (P, x, y, w, h) => { P.rect(x, y + h - 1, w, 1, robeD, 5); P.speck(x, y, w, h, robeD, 6); }, front: (P, x, y, w) => { P.set(x + 3, y, skin); P.set(x + 4, y, skin); } }),
      P.bp([8, 4, 4], [0, 22, -1], [-4, -8, -2], null, 'armX', { base: robe, v: 8, front: (P, x, y, w, h) => { P.rect(x + 2, y, 4, h, skin, 4); } }),
      ...P.same([4, 8, 4], [[[0, 22, -1], [4, -8, -2], 'armX'], [[0, 22, -1], [-8, -8, -2], 'armX']], { base: robe, v: 8, bottom: skin }),
      ...P.same([4, 12, 4], [[[2, 12, 0], [-2, -12, -2], 'legR'], [[-2, 12, 0], [-2, -12, -2], 'legL']], { base: robeD, v: 8, sides: skBottom([60, 44, 30], 1) }),
      ...nose(skin)(P, top)
    ];
  }
  const illager = (name, skin, coat, opts = {}) => skHumanoid(name, {
    head: [8, 10, 8],
    headSpec: { base: skin, v: 5, all: (P, x, y, w, h, f) => { if (opts.hair) skHair(P, x, y, w, h, f, opts.hair, 2, 3); }, front: (P, x, y, w) => { P.rect(x + 1, y + 3, 6, 1, [30, 30, 32]); skEyes(P, x, y, w, y + 4, opts.eye || [60, 60, 70]); P.rect(x + 2, y + 7, 4, 1, shd(skin, 0.6)); } },
    bodySpec: { base: coat, v: 7, sides: (P, x, y, w, h) => { P.rect(x, y + h - 2, w, 1, opts.trim || shd(coat, 0.6)); if (opts.robe) { P.rect(x + w / 2 - 1, y, 2, h, opts.trim, 4); } }, front: (P, x, y, w) => { P.rect(x + 3, y, 2, 2, skin); } },
    armSpec: { base: coat, v: 7, sides: (P, x, y, w, h) => P.rect(x, y + h - 3, w, 3, skin, 5), bottom: skin },
    legSpec: { base: opts.pants || shd(coat, 0.7), v: 7, sides: skBottom(opts.shoe || [40, 34, 30], 2) },
    extra: (P, top) => nose(skin)(P, top)
  });
  M.pillager = illager('pillager', [132, 134, 142], [64, 62, 70], { pants: [52, 50, 56], trim: [40, 38, 44], shoe: [70, 50, 36] });
  M.vindicator = illager('vindicator', [128, 130, 138], [44, 70, 72], { pants: [40, 40, 46], trim: [24, 40, 42], hair: [30, 30, 32] });
  M.evoker = illager('evoker', [130, 132, 140], [46, 46, 52], { pants: [46, 46, 52], trim: [200, 170, 62], robe: true, eye: [120, 70, 160] });
  // ------------------------------------------------------------ piglins
  const piglinLike = (name, skin, vest, pants, opts = {}) => skHumanoid(name, {
    head: [10, 8, 8],
    headSpec: { base: skin, v: 8, front: (P, x, y, w) => { skEyes(P, x, y, w, y + 3, [200, 90, 40], { white: [235, 230, 220] }); P.rect(x + 1, y + 2, 3, 1, shd(skin, 0.7)); P.rect(x + 6, y + 2, 3, 1, shd(skin, 0.7)); }, all: opts.rot ? (P, x, y, w, h) => P.blot(x, y, w, h, opts.rot, 3, 4) : null },
    bodySpec: { base: vest, v: 9, sides: (P, x, y, w, h) => { P.rect(x, y + h - 4, w, 1, opts.belt || [214, 176, 52]); if (opts.bones) for (let j = 2; j < 7; j += 2) P.rect(x + 1, y + j, w - 2, 1, [220, 214, 196]); } },
    armSpec: { base: skin, v: 8, sides: (P, x, y, w) => P.rect(x, y, w, 3, vest, 8), all: opts.rot ? (P, x, y, w, h) => P.blot(x, y, w, h, opts.rot, 2, 3) : null },
    legSpec: { base: pants, v: 8, sides: skBottom(opts.boot || [70, 46, 30], 3) },
    extra: (P, top) => [
      P.bp([4, 4, 1], [0, top, 0], [-2, 0, -5], null, 'head', { base: shd(skin, 1.06), v: 4, front: (P, x, y) => { P.set(x + 1, y + 2, shd(skin, 0.45)); P.set(x + 2, y + 2, shd(skin, 0.45)); } }),
      ...P.same([1, 2, 1], [[[0, top, 0], [2, 0, -5], 'head'], [[0, top, 0], [-3, 0, -5], 'head']], { base: [236, 228, 200], v: 4 }),
      ...P.same([1, 5, 4], [[[0, top, 0], [5, 2, -2], 'head', 0, { rot: [0, 0, -0.5] }], [[0, top, 0], [-6, 2, -2], 'head', 0, { rot: [0, 0, 0.5] }]], { base: skin, v: 8, sides: (P, x, y, w, h) => P.set(x, y + h - 1, opts.earring || shd(skin, 0.8)) })
    ]
  });
  M.piglin = piglinLike('piglin', [232, 152, 142], [120, 82, 50], [232, 152, 142], { earring: [230, 190, 50] });
  M.zombified_piglin = piglinLike('zombified_piglin', [212, 136, 128], [104, 76, 54], [190, 120, 112], { rot: [110, 150, 92], bones: true, belt: [150, 120, 60] });
  M.piglin_brute = piglinLike('piglin_brute', [226, 146, 136], [40, 34, 34], [44, 38, 38], { belt: [230, 190, 52], boot: [30, 26, 26], earring: [230, 190, 50] });
  // ------------------------------------------------------------ enderman
  M.enderman = skHumanoid('enderman', {
    armW: 2, legW: 2, armH: 30, legH: 30, armPose: 'armE',
    headSpec: { base: [24, 20, 28], v: 4, front: (P, x, y, w) => { const ey = y + 4; P.rect(x, ey, 3, 1, [210, 80, 250]); P.rect(x + 5, ey, 3, 1, [210, 80, 250]); P.set(x + 1, ey, [250, 190, 255]); P.set(x + 6, ey, [250, 190, 255]); } },
    bodySpec: { base: [22, 18, 26], v: 4 }, armSpec: { base: [22, 18, 26], v: 4 }, legSpec: { base: [22, 18, 26], v: 4 }
  });
  // ------------------------------------------------------------ gólem de hierro
  {
    const iron = [204, 198, 188], ironD = [160, 152, 142], vine = [72, 124, 42];
    const P = new SkinP('golem', 128, 128); const cracks = (P, x, y, w, h) => { P.blot(x, y, w, h, ironD, Math.max(2, (w * h / 30) | 0), 4); P.speck(x, y, w, h, [150, 96, 70], (w * h / 60) | 0); };
    const vines = (P, x, y, w, h) => { for (let i = 0; i < w; i += 3) { let yy = 0; const len = 2 + ((P.r() * h * 0.6) | 0); for (let j = 0; j < len; j++) P.set(x + i + (j % 3 === 2 ? 1 : 0), y + j, vine); } };
    M.golem = [
      P.bp([8, 10, 8], [0, 33, -2], [-4, 0, -5.5], null, 'head', { base: iron, v: 7, all: cracks, front: (P, x, y, w) => { P.rect(x + 1, y + 3, 6, 1, ironD); P.set(x + 2, y + 4, [180, 30, 30]); P.set(x + 5, y + 4, [180, 30, 30]); } }),
      P.bp([2, 4, 2], [0, 33, -2], [-1, 1, -7.5], null, 'head', { base: ironD, v: 5 }),
      P.bp([18, 12, 11], [0, 21, 0], [-9, 0, -5.5], null, 'body', { base: iron, v: 8, all: (P, x, y, w, h, f) => { cracks(P, x, y, w, h); if (f !== 3) vines(P, x, y, w, h); } }),
      P.bp([9, 5, 6], [0, 16, 0], [-4.5, 0, -3], null, 'body', { base: ironD, v: 7, all: cracks }),
      ...P.same([4, 30, 6], [[[11, 31, 0], [-2, -28, -3], 'armR'], [[-11, 31, 0], [-2, -28, -3], 'armL']], { base: iron, v: 8, all: (P, x, y, w, h, f) => { cracks(P, x, y, w, h); if (f !== 3) vines(P, x, y, w, 10); } }),
      ...P.same([6, 16, 5], [[[4, 16, 0], [-3, -16, -2.5], 'legR'], [[-4, 16, 0], [-3, -16, -2.5], 'legL']], { base: iron, v: 8, all: (P, x, y, w, h, f) => { cracks(P, x, y, w, h); if (f !== 3) vines(P, x, y + h / 2, w, h / 2); } })
    ];
  }
  // ------------------------------------------------------------ warden
  {
    const base = [20, 52, 58], dark = [12, 32, 36], glow = [80, 232, 232], bone = [200, 210, 190];
    const P = new SkinP('warden', 128, 128);
    const ribs = (P, x, y, w, h) => { P.blot(x, y, w, h, dark, (w * h / 25) | 0, 4); };
    M.warden = [
      P.bp([16, 16, 10], [0, 34, 0], [-8, 0, -5], null, 'head', { base, v: 7, all: ribs, front: (P, x, y, w, h) => { P.rect(x + 3, y + 7, 10, 2, dark); P.rect(x + 4, y + 12, 8, 2, [8, 20, 24]); P.speck(x, y, w, h, glow, 4); } }),
      ...P.same([10, 10, 1], [[[0, 34, 0], [8, 8, 0], 'head', 0, { rot: [0, 0, -0.3] }], [[0, 34, 0], [-18, 8, 0], 'head', 0, { rot: [0, 0, 0.3] }]], { base: [26, 70, 76], v: 8, all: (P, x, y, w, h) => P.speck(x, y, w, h, glow, 3) }),
      P.bp([18, 21, 11], [0, 13, 0], [-9, 0, -5.5], null, 'body', { base, v: 7, all: ribs, front: (P, x, y, w, h) => { for (let j = 3; j < 14; j += 3) P.rect(x + 3, y + j, w - 6, 1, bone); P.rect(x + 7, y + 4, 4, 4, glow); P.speck(x, y, w, h, glow, 6); } }),
      ...P.same([8, 28, 8], [[[13, 32, 0], [-4, -26, -4], 'armR'], [[-13, 32, 0], [-4, -26, -4], 'armL']], { base, v: 7, all: ribs }),
      ...P.same([6, 13, 6], [[[5.9, 13, 0], [-3, -13, -3], 'legR'], [[-5.9, 13, 0], [-3, -13, -3], 'legL']], { base, v: 7, all: ribs })
    ];
  }
  // ------------------------------------------------------------ creeper (verde moteado)
  {
    const P = new SkinP('creeper');
    const greens = [[94, 170, 74], [72, 142, 56], [122, 196, 98], [52, 116, 44], [140, 210, 120]];
    const mottle = (P, x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const g = greens[(P.r() * greens.length) | 0]; P.set(x + i, y + j, g); } };
    const face = (P, x, y, w, h) => { mottle(P, x, y, w, h); P.rect(x + 1, y + 2, 2, 2, SKC.black); P.rect(x + 5, y + 2, 2, 2, SKC.black); P.rect(x + 3, y + 4, 2, 3, SKC.black); P.rect(x + 2, y + 5, 1, 3, SKC.black); P.rect(x + 5, y + 5, 1, 3, SKC.black); };
    M.creeper = [
      P.bp([8, 8, 8], [0, 18, 0], [-4, 0, -4], null, 'head', { all: mottle, front: face }),
      P.bp([8, 12, 4], [0, 6, 0], [-4, 0, -2], null, 'body', { all: mottle }),
      ...P.same([4, 6, 4], [[[2, 6, -4], [-2, -6, -2], 'legFR'], [[-2, 6, -4], [-2, -6, -2], 'legFL'], [[2, 6, 4], [-2, -6, -2], 'legBR'], [[-2, 6, 4], [-2, -6, -2], 'legBL']], { all: mottle, bottom: [40, 80, 34] })
    ];
  }
  // ------------------------------------------------------------ cerdo
  {
    const pink = [238, 160, 160], dk = [214, 132, 138], hoof = [112, 72, 72];
    const P = new SkinP('pig');
    M.pig = [
      P.bp([10, 8, 16], [0, 6, 0], [-5, 0, -8], null, 'body', { base: pink, v: 6, all: (P, x, y, w, h) => P.speck(x, y, w, h, dk, (w * h / 14) | 0) }),
      P.bp([8, 8, 8], [0, 10, -8], [-4, -4, -6], null, 'head', { base: pink, v: 6, front: (P, x, y, w) => { P.set(x + 1, y + 3, SKC.white); P.set(x + 2, y + 3, SKC.black); P.set(x + 5, y + 3, SKC.black); P.set(x + 6, y + 3, SKC.white); } }),
      P.bp([4, 3, 1], [0, 10, -8], [-2, -3, -7], null, 'head', { base: [242, 172, 176], v: 3, front: (P, x, y) => { P.set(x + 1, y + 1, [150, 76, 86]); P.set(x + 2, y + 1, [150, 76, 86]); } }),
      ...P.same([4, 6, 4], [[[3, 6, -5], [-2, -6, -2], 'legFR'], [[-3, 6, -5], [-2, -6, -2], 'legFL'], [[3, 6, 6], [-2, -6, -2], 'legBR'], [[-3, 6, 6], [-2, -6, -2], 'legBL']], { base: pink, v: 6, sides: skBottom(hoof, 1), bottom: hoof })
    ];
  }
  // ------------------------------------------------------------ vaca
  {
    const brown = [70, 50, 38], white = [232, 230, 224], hoof = [56, 46, 40];
    const P = new SkinP('cow');
    const patches = (P, x, y, w, h) => { for (let i = 0; i < Math.max(1, (w * h / 40) | 0); i++) { const cx = x + P.r() * w, cy = y + P.r() * h, r = 1.5 + P.r() * 2.5; for (let j = -4; j <= 4; j++) for (let k = -4; k <= 4; k++) if (j * j + k * k < r * r && cx + k >= x && cx + k < x + w && cy + j >= y && cy + j < y + h) P.set(cx + k, cy + j, white); } };
    M.cow = [
      P.bp([12, 10, 18], [0, 12, 0], [-6, 0, -9], null, 'body', { base: brown, v: 8, all: patches }),
      P.bp([4, 1, 6], [0, 12, 0], [-2, -1, 3], null, 'body', { base: [236, 170, 170], v: 4 }),
      P.bp([8, 8, 6], [0, 20, -9], [-4, -4, -6], null, 'head', { base: brown, v: 8, front: (P, x, y, w, h) => { P.rect(x + 2, y, 4, h, white, 5); P.set(x + 1, y + 3, SKC.black); P.set(x + 6, y + 3, SKC.black); P.rect(x + 2, y + 5, 4, 3, [210, 150, 140], 4); P.set(x + 2, y + 6, [120, 70, 70]); P.set(x + 5, y + 6, [120, 70, 70]); } }),
      ...P.same([1, 3, 1], [[[0, 20, -9], [4, 3, -5], 'head'], [[0, 20, -9], [-5, 3, -5], 'head']], { base: [214, 204, 180], v: 6 }),
      ...P.same([4, 12, 4], [[[4, 12, -6], [-2, -12, -2], 'legFR'], [[-4, 12, -6], [-2, -12, -2], 'legFL'], [[4, 12, 7], [-2, -12, -2], 'legBR'], [[-4, 12, 7], [-2, -12, -2], 'legBL']], { base: brown, v: 8, sides: (P, x, y, w, h) => { P.rect(x, y + 3, w, 4, white, 6); P.rect(x, y + h - 2, w, 2, hoof); }, bottom: hoof })
    ];
  }
  // ------------------------------------------------------------ oveja (la lana se tiñe y desaparece al esquilarla)
  {
    const face = [222, 194, 170], wool = [236, 236, 232];
    const P = new SkinP('sheep', 128, 64);
    const fluff = (P, x, y, w, h) => { P.speck(x, y, w, h, [214, 214, 210], (w * h / 6) | 0); P.speck(x, y, w, h, [250, 250, 248], (w * h / 10) | 0); };
    M.sheep = [
      P.bp([8, 6, 14], [0, 12, 0], [-4, 0, -7], null, 'body', { base: face, v: 6 }),
      P.bp([11, 9, 17], [0, 12, 0], [-5.5, -1.5, -8.5], null, 'body', { base: wool, v: 6, all: fluff }, 0, { wool: true }),
      P.bp([6, 6, 8], [0, 18, -7], [-3, -2, -6], null, 'head', { base: face, v: 5, front: (P, x, y) => { P.set(x + 1, y + 2, SKC.white); P.set(x + 2, y + 2, SKC.black); P.set(x + 3, y + 2, SKC.black); P.set(x + 4, y + 2, SKC.white); P.rect(x + 2, y + 4, 2, 1, [200, 140, 130]); } }),
      P.bp([7, 4, 6], [0, 18, -7], [-3.5, 1, -4.5], null, 'head', { base: wool, v: 6, all: fluff }, 0, { wool: true }),
      ...P.same([4, 12, 4], [[[3, 12, -5], [-2, -12, -2], 'legFR'], [[-3, 12, -5], [-2, -12, -2], 'legFL'], [[3, 12, 5], [-2, -12, -2], 'legBR'], [[-3, 12, 5], [-2, -12, -2], 'legBL']], { base: face, v: 6, sides: skBottom([120, 96, 80], 1) }),
      ...P.same([5, 5, 5], [[[3, 12, -5], [-2.5, -5, -2.5], 'legFR', 0, { wool: true }], [[-3, 12, -5], [-2.5, -5, -2.5], 'legFL', 0, { wool: true }], [[3, 12, 5], [-2.5, -5, -2.5], 'legBR', 0, { wool: true }], [[-3, 12, 5], [-2.5, -5, -2.5], 'legBL', 0, { wool: true }]], { base: wool, v: 6, all: fluff })
    ];
  }
  // ------------------------------------------------------------ cabra
  {
    const white = [230, 226, 216], gray = [196, 190, 180], horn = [186, 176, 152];
    const P = new SkinP('goat');
    M.goat = [
      P.bp([9, 10, 16], [0, 10, 0], [-4.5, 0, -8], null, 'body', { base: white, v: 6, all: (P, x, y, w, h) => P.speck(x, y, w, h, gray, (w * h / 10) | 0) }),
      P.bp([5, 7, 9], [0, 18, -7], [-2.5, -3, -8], null, 'head', { base: white, v: 6, front: (P, x, y) => { P.set(x, y + 2, [60, 50, 30]); P.set(x + 4, y + 2, [60, 50, 30]); P.rect(x + 1, y + 5, 3, 2, [200, 170, 160]); } }),
      P.bp([1, 4, 1], [0, 18, -7], [-0.5, -7, -8], null, 'head', { base: gray, v: 5 }),
      ...P.same([2, 7, 2], [[[0, 18, -7], [0.5, 3, -2], 'head', 0, { rot: [0.5, 0, -0.15] }], [[0, 18, -7], [-2.5, 3, -2], 'head', 0, { rot: [0.5, 0, 0.15] }]], { base: horn, v: 8 }),
      ...P.same([3, 10, 3], [[[3, 10, -6], [-1.5, -10, -1.5], 'legFR'], [[-3, 10, -6], [-1.5, -10, -1.5], 'legFL'], [[3, 10, 6], [-1.5, -10, -1.5], 'legBR'], [[-3, 10, 6], [-1.5, -10, -1.5], 'legBL']], { base: white, v: 6, sides: skBottom([70, 60, 50], 1) })
    ];
  }
  // ------------------------------------------------------------ gato (atigrado)
  {
    const fur = [222, 142, 62], stripe = [168, 92, 34];
    const P = new SkinP('cat');
    const tabby = (P, x, y, w, h, f) => { for (let i = 0; i < w; i += 3) P.rect(x + i, y, 1, h, stripe, 6); };
    M.cat = [
      P.bp([4, 6, 16], [0, 6, 0], [-2, 0, -8], null, 'body', { base: fur, v: 7, all: (P, x, y, w, h, f) => { if (f === 2 || f === 0 || f === 1) for (let i = 0; i < (f === 2 ? h : w); i += 3) f === 2 ? P.rect(x, y + i, w, 1, stripe, 6) : P.rect(x + i, y, 1, h - 2, stripe, 6); }, bottomC: [240, 200, 150] }),
      P.bp([5, 4, 5], [0, 10, -8], [-2.5, -2, -4], null, 'head', { base: fur, v: 6, front: (P, x, y) => { P.set(x, y + 1, [70, 200, 70]); P.set(x + 4, y + 1, [70, 200, 70]); P.set(x + 2, y + 2, [230, 140, 140]); P.rect(x + 1, y + 3, 3, 1, [240, 220, 190]); }, top: tabby }),
      ...P.same([1, 1, 2], [[[0, 10, -8], [1, 2, -1], 'head'], [[0, 10, -8], [-2, 2, -1], 'head']], { base: fur, v: 4 }),
      P.bp([1, 8, 1], [0, 10, 8], [-0.5, -1, 0], null, 'tail', { base: fur, v: 6, sides: (P, x, y, w, h) => { for (let j = 1; j < h; j += 2) P.set(x, y + j, stripe); } }, 0, { rot: [1.2, 0, 0] }),
      ...P.same([2, 6, 2], [[[1.1, 6, -6], [-1, -6, -1], 'legFR'], [[-1.1, 6, -6], [-1, -6, -1], 'legFL'], [[1.1, 6, 6], [-1, -6, -1], 'legBR'], [[-1.1, 6, 6], [-1, -6, -1], 'legBL']], { base: fur, v: 6, sides: skBottom([245, 220, 190], 1) })
    ];
  }
  // ------------------------------------------------------------ hoglin
  {
    const skin = [196, 128, 108], mane = [80, 52, 40], tusk = [240, 232, 212];
    const P = new SkinP('hoglin', 128, 128);
    M.hoglin = [
      P.bp([16, 14, 24], [0, 12, 0], [-8, 0, -12], null, 'body', { base: skin, v: 9, all: (P, x, y, w, h) => P.blot(x, y, w, h, shd(skin, 0.82), (w * h / 30) | 0, 4) }),
      P.bp([2, 7, 20], [0, 12, 0], [-1, 14, -11], null, 'body', { base: mane, v: 10 }),
      P.bp([14, 7, 16], [0, 18, -12], [-7, -6, -14], null, 'head', { base: skin, v: 9, front: (P, x, y, w, h) => { P.rect(x + 3, y + 2, 8, 4, [220, 150, 140], 5); P.set(x + 5, y + 3, [90, 40, 40]); P.set(x + 8, y + 3, [90, 40, 40]); } }, 0, { rot: [-0.45, 0, 0] }),
      ...P.same([2, 8, 2], [[[0, 18, -12], [5.5, -4, -15], 'head', 0, { rot: [-0.45, 0, 0] }], [[0, 18, -12], [-7.5, -4, -15], 'head', 0, { rot: [-0.45, 0, 0] }]], { base: tusk, v: 5 }),
      ...P.same([6, 1, 4], [[[0, 18, -12], [6, 0, -4], 'head', 0, { rot: [0, 0, -0.6] }], [[0, 18, -12], [-12, 0, -4], 'head', 0, { rot: [0, 0, 0.6] }]], { base: skin, v: 6 }),
      ...P.same([6, 12, 6], [[[5, 12, -8], [-3, -12, -3], 'legFR'], [[-5, 12, -8], [-3, -12, -3], 'legFL'], [[5, 12, 8], [-3, -12, -3], 'legBR'], [[-5, 12, 8], [-3, -12, -3], 'legBL']], { base: skin, v: 9, sides: skBottom([70, 50, 44], 2) })
    ];
  }
  // ------------------------------------------------------------ gallina
  {
    const white = [246, 246, 244], beak = [242, 172, 44], red = [212, 42, 42];
    const P = new SkinP('chicken');
    M.chicken = [
      P.bp([6, 6, 8], [0, 5, 0], [-3, 0, -4], null, 'body', { base: white, v: 4, all: (P, x, y, w, h) => P.speck(x, y, w, h, [222, 222, 218], (w * h / 8) | 0) }),
      P.bp([4, 6, 3], [0, 9, -4], [-2, 0, -2], null, 'head', { base: white, v: 4, front: (P, x, y) => { P.set(x, y + 1, SKC.black); P.set(x + 3, y + 1, SKC.black); } }),
      P.bp([4, 2, 2], [0, 9, -4], [-2, 2, -4], null, 'head', { base: beak, v: 5 }),
      P.bp([2, 2, 2], [0, 9, -4], [-1, 0, -3], null, 'head', { base: red, v: 5 }),
      ...P.same([1, 4, 6], [[[3, 11, 0], [0, -4, -3], 'wingR'], [[-3, 11, 0], [-1, -4, -3], 'wingL']], { base: white, v: 5, sides: (P, x, y, w, h) => P.rect(x, y + h - 1, w, 1, [220, 220, 214]) }),
      ...P.same([1, 5, 1], [[[1.5, 5, 1], [-0.5, -5, -0.5], 'legR'], [[-1.5, 5, 1], [-0.5, -5, -0.5], 'legL']], { base: beak, v: 5 }),
      ...P.same([3, 1, 3], [[[1.5, 5, 1], [-1.5, -5, -2.5], 'legR'], [[-1.5, 5, 1], [-1.5, -5, -2.5], 'legL']], { base: beak, v: 5 })
    ];
  }
  // ------------------------------------------------------------ arañas
  const spiderLike = (name, dark, light, eye) => {
    const P = new SkinP(name);
    const hair = (P, x, y, w, h) => { P.speck(x, y, w, h, light, (w * h / 5) | 0); P.speck(x, y, w, h, shd(dark, 0.7), (w * h / 8) | 0); };
    const parts = [
      P.bp([10, 8, 12], [0, 6, 3], [-5, 0, 0], null, 'body', { base: dark, v: 6, all: hair, top: (P, x, y, w, h) => { hair(P, x, y, w, h); for (let j = 2; j < h; j += 3) P.rect(x + 2, y + j, w - 4, 1, light); } }),
      P.bp([6, 6, 6], [0, 7, 0], [-3, 0, -3], null, 'body', { base: dark, v: 6, all: hair }),
      P.bp([8, 8, 8], [0, 6, -3], [-4, 0, -8], null, 'head', { base: dark, v: 6, all: hair, front: (P, x, y, w) => { hair(P, x, y, w, 8); P.rect(x + 1, y + 3, 2, 2, eye); P.rect(x + 5, y + 3, 2, 2, eye); P.set(x + 3, y + 2, eye); P.set(x + 4, y + 2, eye); P.set(x, y + 2, shd(eye, 0.8)); P.set(x + 7, y + 2, shd(eye, 0.8)); P.set(x + 2, y + 1, shd(eye, 0.7)); P.set(x + 5, y + 1, shd(eye, 0.7)); } })
    ];
    const legs = []; for (let i = 0; i < 4; i++) { legs.push([[3, 9, -1 + i], [0, -1, -1], 'slR', i], [[-3, 9, -1 + i], [-16, -1, -1], 'slL', i]); }
    parts.push(...P.same([16, 2, 2], legs, { base: dark, v: 6, all: (P, x, y, w, h) => { for (let i = 0; i < w; i += 4) P.rect(x + i, y, 1, h, light); } }));
    return parts;
  };
  M.spider = spiderLike('spider', [48, 40, 36], [86, 74, 64], [216, 30, 30]);
  M.cave_spider = spiderLike('cave_spider', [24, 56, 66], [44, 92, 104], [216, 30, 30]);
  // ------------------------------------------------------------ guardianes (púas giradas hacia fuera)
  const guardianLike = (name, body, plate, spike) => {
    const P = new SkinP(name);
    const plates = (P, x, y, w, h) => { P.blot(x, y, w, h, plate, (w * h / 16) | 0, 4); P.speck(x, y, w, h, shd(body, 0.8), (w * h / 12) | 0); };
    const parts = [
      P.bp([12, 12, 16], [0, 0, 0], [-6, 0, -8], null, 'body', { base: body, v: 7, all: plates, front: (P, x, y, w, h) => { plates(P, x, y, w, h); P.rect(x + 3, y + 3, 6, 6, [232, 226, 212]); } }),
      P.bp([2, 2, 1], [0, 0, 0], [-1, 5, -8.6], null, 'body', { base: [60, 120, 80], v: 0, front: (P, x, y) => P.set(x, y, SKC.black) }),
      P.bp([4, 4, 8], [0, 6, 8], [-2, -2, 0], null, 'tail', { base: body, v: 7, all: plates }),
      P.bp([3, 3, 6], [0, 6, 16], [-1.5, -1.5, 0], null, 'tail2', { base: body, v: 7, all: plates }),
      P.bp([1, 6, 5], [0, 6, 16], [-0.5, -3, 5], null, 'tail2', { base: plate, v: 7 })
    ];
    const sp = []; const pos = [[-7, 13, -9], [7, 13, -9], [-7, 13, 9], [7, 13, 9], [-7, -1, -9], [7, -1, -9], [-7, -1, 9], [7, -1, 9], [0, 13, -9], [0, -1, 9], [-7, 6, 0], [7, 6, 0]];
    for (const [px, py, pz] of pos) sp.push([[px * 0.85, py, pz * 0.85], [-1, -4.5, -1], 'body', 0, { rot: [pz < 0 ? -0.7 : pz > 0 ? 0.7 : 0, 0, px < 0 ? 0.7 : px > 0 ? -0.7 : 0] }]);
    parts.push(...P.same([2, 9, 2], sp, { base: spike, v: 6, sides: (P, x, y, w, h) => P.rect(x, y, w, 2, shd(spike, 0.7)) }));
    return parts;
  };
  M.guardian = guardianLike('guardian', [92, 162, 150], [224, 140, 82], [232, 206, 166]);
  M.elder_guardian = guardianLike('elder_guardian', [214, 212, 196], [150, 120, 160], [226, 220, 200]);
  // ------------------------------------------------------------ breeze
  {
    const P = new SkinP('breeze'); const c = [184, 204, 242], d = [130, 150, 210];
    M.breeze = [
      P.bp([8, 8, 8], [0, 20, 0], [-4, 0, -4], null, 'head', { base: c, v: 8, all: (P, x, y, w, h) => P.speck(x, y, w, h, d, 8), front: (P, x, y) => { P.rect(x + 1, y + 3, 2, 2, [40, 50, 120]); P.rect(x + 5, y + 3, 2, 2, [40, 50, 120]); P.rect(x + 3, y + 6, 2, 1, d); } }),
      ...P.same([2, 10, 2], [0, 1, 2].map(i => [[0, 10, 0], [Math.cos(i * 2.1) * 4 - 1, 0, Math.sin(i * 2.1) * 4 - 1], 'rod', i]), { base: d, v: 6 }),
      P.bp([6, 6, 6], [0, 4, 0], [-3, 0, -3], null, 'rod', { base: c, v: 10 }, 3)
    ];
  }
  // ------------------------------------------------------------ ghast
  {
    const P = new SkinP('ghast'); const w0 = [242, 242, 240], g = [214, 214, 210];
    M.ghast = [P.bp([16, 16, 16], [0, 8, 0], [-8, 0, -8], null, 'body', { base: w0, v: 4, all: (P, x, y, w, h) => P.speck(x, y, w, h, g, (w * h / 10) | 0), front: (P, x, y, w, h) => { P.speck(x, y, w, h, g, 20); P.rect(x + 3, y + 5, 3, 2, SKC.black); P.rect(x + 10, y + 5, 3, 2, SKC.black); P.rect(x + 4, y + 7, 1, 3, [190, 50, 50]); P.rect(x + 11, y + 7, 1, 3, [190, 50, 50]); P.rect(x + 6, y + 11, 4, 2, SKC.black); } })];
    for (let i = 0; i < 9; i++) { const L = 9 + (i * 7) % 5; M.ghast.push(P.bp([2, L, 2], [-5 + (i % 3) * 5, 8, -5 + Math.floor(i / 3) * 5], [-1, -L, -1], null, 'tent', { base: w0, v: 4, sides: (P, x, y, w, h) => P.rect(x, y + h - 2, w, 2, g) }, i)); }
  }
  // ------------------------------------------------------------ blaze
  {
    const P = new SkinP('blaze'); const y0 = [250, 206, 64], o0 = [232, 142, 32];
    const fire = (P, x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P.set(x + i, y + j, mix3(y0, o0, P.r() * 0.8 + j / h * 0.3)); };
    M.blaze = [P.bp([8, 8, 8], [0, 20, 0], [-4, 0, -4], null, 'head', { all: fire, front: (P, x, y, w, h) => { fire(P, x, y, w, h); P.rect(x + 1, y + 3, 2, 1, [60, 22, 0]); P.rect(x + 5, y + 3, 2, 1, [60, 22, 0]); P.rect(x + 2, y + 6, 4, 1, [120, 50, 0]); } })];
    M.blaze.push(...P.same([2, 8, 2], Array.from({ length: 12 }, (_, i) => [[0, i < 4 ? 14 : i < 8 ? 9 : 4, 0], [-1, 0, -1], 'rod', i]), { all: fire }));
  }
  // ------------------------------------------------------------ cubo de magma (capas con grietas incandescentes)
  {
    const P = new SkinP('magma');
    M.magma_cube = [P.bp([16, 16, 16], [0, 0, 0], [-8, 0, -8], null, 'slime', { base: [64, 22, 12], v: 6, all: (P, x, y, w, h, f) => { if (f !== 2 && f !== 3) for (let j = 3; j < h; j += 4) P.rect(x, y + j, w, 1, [44, 14, 8]); P.blot(x, y, w, h, [255, 132, 28], (w * h / 18) | 0, 4); P.speck(x, y, w, h, [255, 210, 80], (w * h / 30) | 0); }, front: (P, x, y, w, h) => { P.rect(x + 3, y + 5, 3, 2, [255, 226, 90]); P.rect(x + 10, y + 5, 3, 2, [255, 226, 90]); P.rect(x + 5, y + 10, 6, 1, [255, 150, 40]); } })];
  }
  // ------------------------------------------------------------ pez plateado (segmentos)
  {
    const P = new SkinP('silverfish'); const c = [134, 134, 144], d = [104, 104, 112];
    const seg = { base: c, v: 8, sides: (P, x, y, w, h) => P.rect(x, y + h - 1, w, 1, d), top: (P, x, y, w, h) => P.rect(x, y + h - 1, w, 1, d) };
    M.silverfish = [
      P.bp([3, 2, 2], [0, 0, -4], [-1.5, 0, -2], null, 'body', seg),
      P.bp([4, 3, 2], [0, 0, -2], [-2, 0, -1], null, 'body', seg),
      P.bp([6, 4, 3], [0, 0, 0.5], [-3, 0, -1.5], null, 'body', seg),
      P.bp([3, 3, 3], [0, 0, 3], [-1.5, 0, -1.5], null, 'tail', seg),
      P.bp([2, 2, 3], [0, 0, 5.5], [-1, 0, -1.5], null, 'tail', seg)
    ];
  }
  // ------------------------------------------------------------ shulker
  {
    const P = new SkinP('shulker'); const sh = [150, 100, 150], shd2 = [118, 76, 120];
    const shell = (P, x, y, w, h) => { P.speck(x, y, w, h, shd2, (w * h / 8) | 0); };
    M.shulker = [
      P.bp([16, 8, 16], [0, 0, 0], [-8, 0, -8], null, 'body', { base: sh, v: 6, all: shell }),
      P.bp([16, 8, 16], [0, 8, 0], [-8, 0, -8], null, 'lid', { base: sh, v: 6, all: shell, sides: (P, x, y, w, h) => P.rect(x, y + h - 1, w, 1, shd2) }),
      P.bp([6, 6, 6], [0, 4, 0], [-3, 0, -3], null, 'head', { base: [216, 228, 140], v: 6, front: (P, x, y) => { P.set(x + 1, y + 2, SKC.black); P.set(x + 4, y + 2, SKC.black); } })
    ];
  }
  // ------------------------------------------------------------ dragón
  {
    const P = new SkinP('dragon', 256, 256); const c = [32, 26, 38], l = [58, 46, 66], eye = [210, 80, 255];
    const scales = (P, x, y, w, h) => { for (let j = 0; j < h; j += 2) for (let i = (j / 2) % 2; i < w; i += 3) P.set(x + i, y + j, l); };
    const D = { base: c, v: 5, all: scales };
    M.dragon = [P.bp([24, 24, 64], [0, 0, 0], [-12, 0, -32], null, 'body', D)];
    M.dragon.push(...P.same([10, 10, 10], Array.from({ length: 5 }, (_, i) => [[0, 12, -32 - i * 10], [-5, -5, -10], 'neck', i]), D));
    M.dragon.push(P.bp([16, 16, 16], [0, 12, -82], [-8, -8, -16], null, 'dhead', { ...D, front: (P, x, y, w, h) => { scales(P, x, y, w, h); P.rect(x + 2, y + 5, 4, 2, eye); P.rect(x + 10, y + 5, 4, 2, eye); } }));
    M.dragon.push(P.bp([12, 4, 16], [0, 4, -82], [-6, -4, -32], null, 'dhead', D));
    M.dragon.push(...P.same([10, 10, 10], Array.from({ length: 12 }, (_, i) => [[0, 12, 32 + i * 10], [-5, -5, 0], 'dtail', i]), D));
    M.dragon.push(...P.same([56, 4, 40], [[[12, 20, -10], [0, -2, -20], 'dwingR'], [[-12, 20, -10], [-56, -2, -20], 'dwingL']], { base: [52, 40, 58], v: 6, all: (P, x, y, w, h) => { for (let i = 0; i < w; i += 8) P.rect(x + i, y, 1, h, c); } }));
    M.dragon.push(...P.same([8, 24, 8], [[[10, 4, -20], [-4, -24, -4], 'legFR'], [[-10, 4, -20], [-4, -24, -4], 'legFL']], D));
    M.dragon.push(...P.same([10, 28, 10], [[[12, 4, 22], [-5, -28, -5], 'legBR'], [[-12, 4, 22], [-5, -28, -5], 'legBL']], D));
  }
  return M;
}
