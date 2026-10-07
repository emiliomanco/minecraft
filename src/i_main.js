// ============================================================================
//  Principal: bucle, chunks, cámara, sonido, menús, opciones, guardado
// ============================================================================
let TICK_MS = 0; const CHUNK_STATS = { updates: 0, acc: 0, t: 0 };
// ------------------------------------------------------------ SONIDO (sintetizado)
const AU = { ctx: null, master: null, noise: null, rain: null, music: 0 };
function audioInit() {
  if (AU.ctx) return; try { AU.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const c = AU.ctx; AU.master = c.createGain(); AU.master.gain.value = SETTINGS.vol; AU.master.connect(c.destination);
  const len = c.sampleRate * 2; const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; AU.noise = b;
  // reverb
  const rl = c.sampleRate * 2.5, rb = c.createBuffer(2, rl, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const rd = rb.getChannelData(ch); for (let i = 0; i < rl; i++) rd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3); } AU.verb = c.createConvolver(); AU.verb.buffer = rb; AU.verbG = c.createGain(); AU.verbG.gain.value = 0.35; AU.verb.connect(AU.verbG); AU.verbG.connect(AU.master);
  // lluvia continua
  const rs = c.createBufferSource(); rs.buffer = b; rs.loop = true; const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 900; const rg = c.createGain(); rg.gain.value = 0; rs.connect(rf); rf.connect(rg); rg.connect(AU.master); rs.start(); AU.rain = rg;
}
const MAT_SND = id => { const d = REG[id]; if (!d) return 'stone'; const n = d.name; if (/glass|ice/.test(n)) return 'glass'; if (/wool|carpet/.test(n)) return 'wool'; if (/sand|snow/.test(n)) return 'sand'; if (/gravel|dirt|farmland|path|mud|clay|soul/.test(n)) return 'gravel'; if (/grass|leaves|sapling|vine|fern|flower|kelp|moss|wart|roots|azalea/.test(n) || d.render === 'cross') return 'grass'; if (d.tool === 'axe' || /planks|log|wood|stem|bookshelf|chest|table|barrel/.test(n)) return 'wood'; return 'stone'; };
function noiseHit(t, dur, freq, q, vol, type = 'bandpass', dest) { const c = AU.ctx; const s = c.createBufferSource(); s.buffer = AU.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f); f.connect(g); g.connect(dest || AU.master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return g; }
function tone(t, dur, f0, f1, vol, type = 'sine', dest) { const c = AU.ctx; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(dest || AU.master); o.start(t); o.stop(t + dur + 0.05); }
function playSound(type, x, y, z, vol = 1, extra) {
  if (!AU.ctx || SETTINGS.vol <= 0) return; const c = AU.ctx; const t = c.currentTime;
  if (G.player && x !== 0 && G.mode === 'game') { const d = Math.hypot(G.player.x - x, G.player.y - y, G.player.z - z); vol *= Math.max(0, 1 - d / (type === 'explode' ? 80 : 24)); if (vol <= 0.01) return; }
  const m = extra !== undefined && typeof extra === 'number' && extra < ITEM_BASE ? MAT_SND(extra) : 'stone';
  const mf = { stone: [1800, 2], wood: [700, 3], grass: [2600, 0.8], sand: [3800, 0.6], gravel: [1500, 0.9], glass: [4200, 5], wool: [500, 0.6] }[m];
  switch (type) {
    case 'dig': noiseHit(t, 0.08, mf[0], mf[1], 0.25 * vol); break;
    case 'step': noiseHit(t, 0.07, mf[0] * 0.8, mf[1], 0.18 * vol); break;
    case 'place': noiseHit(t, 0.12, mf[0] * 0.7, mf[1], 0.45 * vol); break;
    case 'break': noiseHit(t, 0.22, mf[0], mf[1], 0.6 * vol); if (m === 'glass') for (let i = 0; i < 4; i++) tone(t + i * 0.03, 0.15, 2500 + Math.random() * 2000, 0, 0.05 * vol); break;
    case 'hurt': tone(t, 0.18, 220, 110, 0.4 * vol, 'square'); noiseHit(t, 0.1, 800, 1, 0.3 * vol); break;
    case 'hurt_mob': tone(t, 0.15, 300, 150, 0.2 * vol, 'sawtooth'); break;
    case 'hit': case 'crit': noiseHit(t, 0.08, type === 'crit' ? 3000 : 1200, 1, 0.4 * vol); break;
    case 'pop': tone(t, 0.08, 900 + Math.random() * 500, 1600, 0.15 * vol); break;
    case 'explode': { const g = noiseHit(t, 2.2, 400, 0.4, 1.2 * vol, 'lowpass'); tone(t, 1.2, 60, 25, 0.9 * vol, 'sine'); noiseHit(t, 2.5, 1200, 0.5, 0.25 * vol, 'lowpass', AU.verb); break; }
    case 'fuse': noiseHit(t, 1.4, 5000, 0.5, 0.25 * vol, 'highpass'); break;
    case 'fizz': noiseHit(t, 0.6, 5000, 0.7, 0.3 * vol, 'highpass'); break;
    case 'bow': tone(t, 0.18, 500, 180, 0.3 * vol, 'triangle'); noiseHit(t, 0.1, 2000, 1, 0.2 * vol); break;
    case 'throw': noiseHit(t, 0.25, 1500, 0.6, 0.25 * vol); break;
    case 'eat': noiseHit(t, 0.06, 1800 + Math.random() * 800, 2, 0.3 * vol); break;
    case 'burp': tone(t, 0.25, 180, 120, 0.3 * vol, 'sawtooth'); break;
    case 'drink': for (let i = 0; i < 3; i++) tone(t + i * 0.12, 0.1, 400, 250, 0.2 * vol); break;
    case 'bucket': case 'bucket_empty': noiseHit(t, 0.35, 900, 1.5, 0.35 * vol); break;
    case 'portal': case 'portal_ignite': tone(t, 1.5, 200, 400, 0.15 * vol, 'triangle', AU.verb); tone(t, 1.5, 300, 600, 0.1 * vol, 'sine', AU.verb); break;
    case 'end_portal': for (let i = 0; i < 4; i++) tone(t + i * 0.2, 2, [261, 329, 392, 523][i], 0, 0.15 * vol, 'sine', AU.verb); break;
    case 'ignite': noiseHit(t, 0.3, 3000, 1, 0.3 * vol); break;
    case 'click': tone(t, 0.04, 1200, 800, 0.12 * vol, 'square'); break;
    case 'chest_open': case 'chest_close': tone(t, 0.3, type === 'chest_open' ? 140 : 180, type === 'chest_open' ? 200 : 110, 0.2 * vol, 'sawtooth'); noiseHit(t, 0.2, 400, 2, 0.15 * vol); break;
    case 'levelup': for (let i = 0; i < 3; i++) tone(t + i * 0.1, 0.4, [523, 659, 784][i], 0, 0.15 * vol, 'triangle'); break;
    case 'fall': noiseHit(t, 0.2, 300, 1, 0.5 * vol, 'lowpass'); break;
    case 'note': tone(t, 0.6, 185 * Math.pow(2, (extra || 0) / 12), 0, 0.3 * vol, 'triangle', AU.verb); tone(t, 0.6, 185 * Math.pow(2, (extra || 0) / 12), 0, 0.2 * vol, 'triangle'); break;
    case 'firework': tone(t, 0.6, 600, 2400, 0.08 * vol, 'sine'); break;
    case 'ghast': tone(t, 1.0, 700, 300, 0.2 * vol, 'sine', AU.verb); break;
    case 'enderman': tone(t, 0.6, 120, 60, 0.25 * vol, 'sawtooth', AU.verb); break;
    case 'sonic': tone(t, 0.8, 90, 40, 0.6 * vol, 'sawtooth'); noiseHit(t, 0.8, 300, 0.5, 0.5 * vol, 'lowpass'); break;
    case 'break_item': noiseHit(t, 0.3, 2500, 3, 0.4 * vol); break;
    case 'arrow_hit': noiseHit(t, 0.06, 1500, 2, 0.3 * vol); break;
    case 'mob_pig': tone(t, 0.25, 260, 200, 0.12 * vol, 'square'); break;
    case 'mob_cow': tone(t, 0.7, 110, 90, 0.15 * vol, 'sawtooth'); break;
    case 'mob_sheep': for (let i = 0; i < 4; i++) tone(t + i * 0.06, 0.07, 420, 380, 0.08 * vol, 'sawtooth'); break;
    case 'mob_chicken': tone(t, 0.08, 1300, 1000, 0.07 * vol, 'square'); break;
    case 'mob_zombie': case 'mob_husk': case 'mob_drowned': tone(t, 0.9, 110, 80, 0.15 * vol, 'sawtooth', AU.verb); break;
    case 'mob_skeleton': for (let i = 0; i < 3; i++) noiseHit(t + i * 0.07, 0.04, 2500, 4, 0.12 * vol); break;
    case 'mob_villager': tone(t, 0.25, 300, 220, 0.12 * vol, 'sawtooth'); break;
    case 'mob_blaze': noiseHit(t, 0.8, 600, 0.6, 0.15 * vol, 'lowpass'); break;
    case 'mob_ender_dragon': tone(t, 1.6, 90, 50, 0.5 * vol, 'sawtooth', AU.verb); break;
  }
}
function musicTick() {
  if (!AU.ctx || SETTINGS.vol <= 0) return; if (--AU.music > 0) return; AU.music = 20 * (90 + Math.random() * 180);
  const c = AU.ctx; let t = c.currentTime + 0.5; const scale = G.world && G.world.dim === 'nether' ? [220, 233, 277, 294, 330, 349, 415] : [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
  const g = c.createGain(); g.gain.value = 0.35; g.connect(AU.master); g.connect(AU.verb);
  for (let i = 0; i < 14; i++) { const f = scale[Math.random() * scale.length | 0] * (Math.random() < 0.3 ? 0.5 : 1); tone(t, 2.8, f, 0, 0.06, 'sine', g); if (Math.random() < 0.4) tone(t, 3.2, f * 0.5, 0, 0.04, 'triangle', g); t += 0.6 + Math.random() * 1.2; }
}
// ------------------------------------------------------------ GUARDADO (IndexedDB + archivos)
const DB = {
  db: null,
  open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open('minecraft2', 1); r.onupgradeneeded = () => r.result.createObjectStore('worlds', { keyPath: 'id' }); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('worlds', mode); const st = t.objectStore('worlds'); const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); },
  put(rec) { return this.tx('readwrite', s => s.put(rec)); }, get(id) { return this.tx('readonly', s => s.get(id)); }, del(id) { return this.tx('readwrite', s => s.delete(id)); },
  async list() { const db = await this.open(); return new Promise((res, rej) => { const out = []; const t = db.transaction('worlds', 'readonly'); const c = t.objectStore('worlds').openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { const v = cur.value; out.push({ id: v.id, name: v.name, seedStr: v.seedStr, mode: v.mode, lastPlayed: v.lastPlayed, icon: v.icon }); cur.continue(); } else res(out.sort((a, b) => b.lastPlayed - a.lastPlayed)); }; c.onerror = () => rej(c.error); }); }
};
function serializeWorld() {
  const dims = {};
  for (const d in G.worlds) { const w = G.worlds[d]; const out = {}; for (const c of w.chunks.values()) if (c.modified) out[ckey(c.cx, c.cz)] = { b: rleEncode(c.blocks), m: rleEncode(c.meta), loot: c.loot, sp: c.spawners }; for (const k in w.saved) if (!out[k]) out[k] = w.saved[k]; dims[d] = out; }
  const players = Object.assign({}, G.playerStates || {}); players.__local = playerState(G.player); players.__local.name = G.player.name;
  if (G.net && G.net.role === 'host') for (const c of G.net.conns.values()) if (c.ent && c.ent.state) players[c.ent.name] = c.ent.state;
  const ents = []; for (const e of G.entities.values()) { if (e.proxy || e.remotePlayer || e.removed || e.dead) continue; if (e instanceof Mob && (e.persist || !e.def.hostile)) ents.push({ k: 'mob', ty: e.type, d: e.dim, x: e.x, y: e.y, z: e.z, hp: e.hp, c: e.color, p: e.persist, n: e.name }); else if (e.type === 'item') ents.push({ k: 'item', d: e.dim, x: e.x, y: e.y, z: e.z, s: e.stack }); }
  return { format: 'minecraft2-world', version: 3, name: G.worldName, seed: G.seed, seedStr: G.seedStr, gameMode: G.defaultMode || G.gameMode, curMode: G.gameMode, difficulty: G.difficulty, cheats: G.cheats, time: G.time, rain: G.rain, rainTimer: G.rainTimer, worldSpawn: G.worldSpawn, dragonKilled: G.dragonKilled, endInit: G.endInit, gateway: G.gateway, keepInventory: G.keepInventory, containers: G.containers, spawned: [...G.spawned], dims, players, entities: ents, created: G.created || Date.now(), lastPlayed: Date.now(), structures: G.structures !== false };
}
function worldIcon() { try { const c = document.createElement('canvas'); c.width = 64; c.height = 64; c.getContext('2d').drawImage($('gl'), ($('gl').width - $('gl').height) / 2, 0, $('gl').height, $('gl').height, 0, 0, 64, 64); return c.toDataURL('image/jpeg', 0.7); } catch (e) { return null; } }
async function saveWorld(silent) {
  if (!G.worlds || (G.net && G.net.role === 'client')) return; const data = serializeWorld();
  try { await DB.put({ id: G.worldId, name: G.worldName, seedStr: G.seedStr, mode: G.gameMode, lastPlayed: Date.now(), icon: G.iconURL || worldIcon(), data }); if (!silent) chatMsg('Mundo guardado', '#aaa'); } catch (e) { console.error(e); chatMsg('Error al guardar: ' + e.message, '#f66'); }
}
async function gz(str) { if (!window.CompressionStream) return new Blob([str]); const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip')); return await new Response(s).blob(); }
async function gunz(buf) { const u = new Uint8Array(buf); if (u[0] === 0x1f && u[1] === 0x8b && window.DecompressionStream) { const s = new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip')); return await new Response(s).text(); } return new TextDecoder().decode(u); }
async function downloadWorld(data) { const blob = await gz(JSON.stringify(data)); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (data.name || 'mundo').replace(/[^\w\-áéíóúñ ]/gi, '_') + '.mc2world'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
// ------------------------------------------------------------ INICIO DE MUNDO
function seedFromString(s) { s = (s || '').trim(); if (!s) { const n = (Math.random() * 2 ** 31) | 0; return [n >>> 0, String(n)]; } if (/^-?\d+$/.test(s)) return [(+s) >>> 0, s]; return [hashStr(s), s]; }
function findSpawn(w) {
  for (let r = 0; r < 4000; r += 16) for (let a = 0; a < 8; a++) { const x = Math.round(Math.cos(a / 8 * 6.28) * r), z = Math.round(Math.sin(a / 8 * 6.28) * r); const c = w.gen.col(x, z); if (c.h > SEA && !c.river && !c.lake && c.biome !== BI.mangrove_swamp) return { x: x + 0.5, z: z + 0.5 }; }
  return { x: 0.5, z: 0.5 };
}
function resetGameState() {
  G.entities = new Map(); G.particles = []; G.containers = {}; G.spawned = new Set(); G.tick = 0; G.dragonKilled = false; G.endInit = false; G.gateway = null; G.creditsShown = false; G.playerStates = {}; G.rain = 0; G.rainLevel = 0; G.rainTimer = 12000 + Math.random() * 24000;
  TICK_TIMERS.length = 0; NETBATCH.length = 0; R.plights = []; UI.open = null; G.paused = false; G.wardenWarn = 0;
}
function migrateWorld(data) { // v2 -> v3: los objetos pasaron de id 256+ a 1000+
  if (!data.version || data.version >= 3) return data;
  const fix = s => { if (s && s.id >= 256) s.id += ITEM_BASE - 256; return s; };
  const fixArr = a => { if (a) a.forEach(fix); };
  for (const k in data.players || {}) { const p = data.players[k]; if (!p) continue; fixArr(p.inv); fixArr(p.armor); fixArr(p.ender); fix(p.off); }
  for (const k in data.containers || {}) fixArr(data.containers[k].items);
  for (const e of data.entities || []) if (e.s) fix(e.s);
  data.version = 3; return data;
}
function startWorld(data, isNew, netWelcome) {
  data = migrateWorld(data); resetGameState(); audioInit();
  G.worldName = data.name; G.seed = data.seed >>> 0; G.seedStr = data.seedStr; G.difficulty = data.difficulty ?? 2; G.cheats = data.cheats !== false; G.time = data.time ?? 1000; G.keepInventory = !!data.keepInventory;
  G.defaultMode = data.gameMode || 'survival'; G.gameMode = data.curMode || data.gameMode || 'survival'; G.created = data.created || Date.now(); G.structures = data.structures !== false;
  G.worlds = { overworld: new World('overworld', G.seed), nether: new World('nether', G.seed), end: new World('end', G.seed) };
  if (!G.structures) for (const d in G.worlds) { G.worlds[d].gen.genStructures = () => { }; G.worlds[d].noStruct = true; }
  if (data.dims) for (const d in data.dims) for (const k in data.dims[d]) G.worlds[d].saved[k] = data.dims[d][k];
  G.containers = data.containers || {}; G.spawned = new Set(data.spawned || []); G.dragonKilled = !!data.dragonKilled; G.endInit = !!data.endInit; G.gateway = data.gateway || null; G.rain = data.rain || 0; G.rainTimer = data.rainTimer || G.rainTimer;
  G.playerStates = data.players || {};
  const p = new Player(SETTINGS.name); G.player = p;
  let st = netWelcome ? netWelcome.st : (data.players && data.players.__local);
  if (!data.worldSpawn) { const s = findSpawn(G.worlds.overworld); G.worldSpawn = { x: s.x, y: -1, z: s.z }; } else G.worldSpawn = data.worldSpawn;
  if (st) { Object.assign(p, { x: st.x, y: st.y, z: st.z, dim: st.dim || 'overworld', hp: st.hp ?? 20, food: st.food ?? 20, sat: st.sat ?? 5, inv: st.inv || p.inv, armor: st.armor || p.armor, offhand: st.off || null, ender: st.ender || p.ender, spawn: st.spawn || null, sel: st.sel || 0, xp: st.xp || 0, yaw: st.yaw || 0, pitch: st.pitch || 0 }); if (p.hp <= 0) p.hp = 20; }
  else { p.x = G.worldSpawn.x; p.z = G.worldSpawn.z; p.y = -1; p.dim = 'overworld'; }
  if (netWelcome) { G.myNetId = netWelcome.id; p.name = netWelcome.name; G.gameMode = netWelcome.gm; for (const c of (G.net.chunks || [])) applyNetChunk(c); }
  if (data.entities && !netWelcome) for (const e of data.entities) { if (e.k === 'mob') { const m = spawnMob(e.ty, e.d, e.x, e.y, e.z); if (m) { m.hp = e.hp; if (e.c) m.color = e.c; m.persist = e.p; m.name = e.n; } } else if (e.k === 'item') dropItem(e.d, e.x, e.y, e.z, e.s, 0, 0, 0, 0); }
  if (G.endInit && !netWelcome) { /* ya hay cristales/dragón guardados */ }
  G.world = G.worlds[p.dim]; G.mode = 'loading'; G.loadStart = performance.now();
  showScreen('sLoading'); $('loadTitle').textContent = isNew ? 'Generando mundo' : 'Cargando mundo'; $('hud').style.display = 'none'; $('menuShade').style.display = 'none';
  $('footL').style.display = $('footR').style.display = 'none';
}
function finishLoading() {
  const p = G.player; const w = G.world;
  if (p.y < 0) { const y = w.surfaceY(Math.floor(p.x), Math.floor(p.z)) + 1; p.y = y; if (G.worldSpawn.y < 0) G.worldSpawn.y = y; }
  p.px = p.x; p.py = p.y; p.pz = p.z;
  G.mode = 'game'; hideScreens(); $('hud').style.display = 'block'; $('hotbar').innerHTML = ''; updateHUD(); applyGui();
  $('debugL').style.display = $('debugR').style.display = F3 ? '' : 'none';
  if (p.dim === 'end' && (!G.net || G.net.role === 'host')) initEnd();
  if (R.software) chatMsg('⚠ El navegador está dibujando con la CPU (aceleración por hardware desactivada). Actívala en la configuración del navegador para usar la GPU y ganar mucho rendimiento.', '#f88');
  chatMsg('Bienvenido a Minecraft 2. Pulsa E para el inventario, T para chatear, F3 para depurar. Escribe /help para comandos.', '#aaa');
  lockPointer(); AU.music = 20 * 30;
}
function onDimensionChanged() {
  const p = G.player; G.world = G.worlds[p.dim];
  for (const d in G.worlds) if (d !== p.dim) for (const c of G.worlds[d].chunks.values()) freeMesh(c);
  G.particles.length = 0; G.mode = 'loading'; G.loadStart = performance.now(); showScreen('sLoading'); $('loadTitle').textContent = p.dim === 'nether' ? 'Entrando al Nether' : p.dim === 'end' ? 'Entrando al End' : 'Volviendo al mundo'; $('hud').style.display = 'none';
  playSound('portal', 0, 0, 0, 1);
}
function respawn() {
  const p = G.player; const s = p.spawn && p.spawn.y > 0 ? p.spawn : G.worldSpawn; const w = G.worlds.overworld;
  p.dead = false; p.hp = 20; p.food = 20; p.sat = 5; p.air = 300; p.fire = 0; p.effects = {}; p.vx = p.vy = p.vz = 0; p.fallDist = 0; p.gliding = false;
  if (p.spawn && w.chunk(Math.floor(s.x) >> 4, Math.floor(s.z) >> 4) && w.get(Math.floor(s.x), Math.floor(s.y) - 1, Math.floor(s.z)) !== ID.bed) { chatMsg('Tu cama no existe o está obstruida.', '#ccc'); p.spawn = null; }
  const sp = p.spawn || G.worldSpawn;
  if (p.dim !== 'overworld') { changeDim(p, 'overworld', sp.x, sp.y, sp.z); } else { p.x = sp.x; p.y = sp.y; p.z = sp.z; ensureArea(w, p.x, p.z, 1); p.y = Math.max(p.y, w.surfaceY(Math.floor(p.x), Math.floor(p.z)) + 1); }
  hideScreens(); $('hud').style.display = 'block'; updateHUD(); lockPointer();
}
function showDeath(msg) { $('deathMsg').textContent = msg; $('deathScore').textContent = 'Puntuación: ' + (G.player.xp | 0); showScreen('sDeath'); document.exitPointerLock && document.exitPointerLock(); }
function showCredits() {
  $('credText').innerHTML = '<p style="color:#e0a0ff;font-size:34px">Has derrotado al Ender Dragon</p><br><p>Viajaste desde los primeros troncos hasta la netherita, cruzaste el Nether y venciste al dragón en el End.</p><br><p>Minecraft 2 — un juego de bloques hecho con amor en un único archivo HTML.</p><p style="color:#888">Generación procedural, shaders, multijugador P2P y mucho más.</p><br><p>Gracias por jugar.</p>';
  showScreen('sCredits'); document.exitPointerLock && document.exitPointerLock();
}
async function quitToTitle(save = true) {
  if (save) await saveWorld(true); stopNet(); closeScreen();
  for (const d in G.worlds || {}) { G.worlds[d].dead = true; WK.worlds.delete(G.worlds[d]._wid); for (const c of G.worlds[d].chunks.values()) freeMesh(c); }
  G.worlds = null; G.player = null; G.mode = 'menu'; G.entities = new Map(); G.particles = []; $('hud').style.display = 'none'; $('chatLog').innerHTML = '';
  goMenu();
}
function disconnected(msg) { quitToTitle(false).then(() => { showScreen('sMulti'); $('mErr').textContent = msg || 'Desconectado'; }); }
function pauseGame(on) { if (G.mode !== 'game') return; G.paused = on; if (on) { showScreen('sPause'); document.exitPointerLock && document.exitPointerLock(); $('pLan').disabled = !!G.net; $('pCodeWrap').style.display = G.net && G.net.role === 'host' ? '' : 'none'; if (G.net && G.net.role === 'host') $('pCode').textContent = G.net.code; $('pExport').style.display = G.net && G.net.role === 'client' ? 'none' : ''; } else { hideScreens(); lockPointer(); } }
// ------------------------------------------------------------ GESTIÓN DE CHUNKS
let SPIRAL = []; let spiralR = -1;
function spiral(r) { if (r === spiralR) return SPIRAL; spiralR = r; SPIRAL = []; for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= (r + 0.5) ** 2) SPIRAL.push([dx, dz, dx * dx + dz * dz]); SPIRAL.sort((a, b) => a[2] - b[2]); return SPIRAL; }
function neighborsReady(w, c) { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!w.chunk(c.cx + dx, c.cz + dz)) return false; return true; }
function meshChunk(w, c) { const m = buildMesh(w, c); uploadMesh(c, m); c.dirty = false; c.urgent = false; CHUNK_STATS.acc++; }
function manageChunks(w, x, z, budget) {
  const t0 = performance.now(); const pcx = Math.floor(x) >> 4, pcz = Math.floor(z) >> 4; const rd = SETTINGS.rd;
  if (WK.ok) {
    const maxQ = WK.list.length * 3;
    // ediciones del jugador: prioridad inmediata
    for (const c of w.chunks.values()) if (c.urgent && c.dirty && !c.meshPending && neighborsReady(w, c) && Math.abs(c.cx - pcx) <= rd && Math.abs(c.cz - pcz) <= rd) requestMesh(w, c);
    const S = spiral(rd + 1);
    for (const [dx, dz] of S) { if (wkBusy() >= maxQ) break; if (!w.chunk(pcx + dx, pcz + dz)) requestGen(w, pcx + dx, pcz + dz); }
    for (const [dx, dz, d2] of S) {
      if (wkBusy() >= maxQ || performance.now() - t0 > budget) break; if (d2 > (rd + 0.5) ** 2) continue;
      const c = w.chunk(pcx + dx, pcz + dz); if (!c || c.meshPending) continue;
      if ((c.dirty || !c.mesh) && neighborsReady(w, c)) requestMesh(w, c);
    }
  } else {
    let n = 0; for (const c of w.chunks.values()) { if (c.urgent && c.dirty && neighborsReady(w, c) && Math.abs(c.cx - pcx) <= rd && Math.abs(c.cz - pcz) <= rd) { meshChunk(w, c); if (++n > 8) break; } }
    const S = spiral(rd + 1);
    for (const [dx, dz] of S) { if (performance.now() - t0 > budget * 0.5) break; if (!w.chunk(pcx + dx, pcz + dz)) w.ensure(pcx + dx, pcz + dz); }
    for (const [dx, dz, d2] of S) {
      if (performance.now() - t0 > budget) break; if (d2 > (rd + 0.5) ** 2) continue;
      const c = w.chunk(pcx + dx, pcz + dz); if (!c) continue;
      if ((c.dirty || !c.mesh) && neighborsReady(w, c)) meshChunk(w, c);
    }
  }
  // descarga
  if (G.player && G.worlds && G.tick % 40 === 0) {
    const keep = rd + 3;
    for (const d in G.worlds) {
      const ww = G.worlds[d]; const pls = [G.player, ...[...G.entities.values()].filter(e => e.remotePlayer)].filter(p => p.dim === ww.dim);
      for (const [k, c] of ww.chunks) {
        let near = false; for (const p of pls) if (Math.abs(c.cx - (Math.floor(p.x) >> 4)) <= (p === G.player ? keep : 4) && Math.abs(c.cz - (Math.floor(p.z) >> 4)) <= (p === G.player ? keep : 4)) near = true;
        if (!near) { freeMesh(c); if (c.modified) ww.saved[k] = { b: rleEncode(c.blocks), m: rleEncode(c.meta), loot: c.loot, sp: c.spawners }; ww.chunks.delete(k); }
        else if (ww !== w && c.mesh) freeMesh(c);
        else if (c.mesh && (Math.abs(c.cx - pcx) > rd + 1 || Math.abs(c.cz - pcz) > rd + 1)) { freeMesh(c); c.dirty = true; c.meshPending = false; }
      }
    }
  }
  // anfitrión: generar datos alrededor de jugadores remotos
  if (G.net && G.net.role === 'host') for (const e of G.entities.values()) if (e.remotePlayer) { const ww = G.worlds[e.dim]; if (!ww) continue; const ecx = Math.floor(e.x) >> 4, ecz = Math.floor(e.z) >> 4; for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (!ww.chunk(ecx + dx, ecz + dz)) { if (WK.ok) requestGen(ww, ecx + dx, ecz + dz); else { if (performance.now() - t0 > budget * 1.5) return; ww.ensure(ecx + dx, ecz + dz); } } }
}
// ------------------------------------------------------------ BUCLE
let lastT = performance.now(), acc = 0, fpsN = 0, fpsT = 0, FPS = 0, dbgT = 0;
const MENU = { world: null, yaw: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  if (SETTINGS.fpsCap > 0 && now - lastT < 1000 / SETTINGS.fpsCap - 1) return;
  let dt = (now - lastT) / 1000; lastT = now; if (dt > 0.1) dt = 0.1; if (dt <= 0) dt = 0.001;
  fpsN++; fpsT += dt; if (fpsT >= 1) { FPS = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; CHUNK_STATS.updates = CHUNK_STATS.acc; CHUNK_STATS.acc = 0; dynResTick(); }
  try {
    if (G.mode === 'menu') return menuFrame(dt);
    if (G.mode === 'loading') return loadingFrame(dt);
    if (G.mode === 'game') return gameFrame(dt);
  } catch (e) { console.error(e); if (!frame.errShown) { frame.errShown = true; chatMsg('Error: ' + e.message, '#f66'); } }
}
// resolución dinámica: baja la resolución interna si los FPS caen, la sube si sobran
let dynT = 0;
function dynResTick() {
  if (SETTINGS.dynres === false || document.hidden) return; if (++dynT < 2) return; dynT = 0;
  const old = R.dyn; if (FPS < 40) R.dyn = Math.max(0.5, R.dyn - (FPS < 25 ? 0.15 : 0.08)); else if (FPS > 57) R.dyn = Math.min(1, R.dyn + 0.05);
  if (Math.abs(old - R.dyn) > 0.001) resize();
}
function menuFrame(dt) {
  if (!MENU.world) {
    const seeds = ['cerezos', 'montañas', 'aldea', 'taiga', 'atardecer']; const s = hashStr(seeds[Math.random() * seeds.length | 0] + (Date.now() % 7));
    MENU.world = new World('overworld', s); G.menuWorld = MENU.world;
    let best = null; for (let r = 0; r < 600 && !best; r += 24) for (let a = 0; a < 6; a++) { const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r); const c = MENU.world.gen.col(x, z); if (c.h > SEA + 3 && c.h < SEA + 40 && [BI.forest, BI.plains, BI.taiga, BI.birch_forest, BI.savanna, BI.jungle, BI.snowy_taiga, BI.dark_forest].includes(c.biome)) { best = { x, z, h: c.h }; break; } }
    MENU.pos = best || { x: 0, z: 0, h: SEA + 10 }; MENU.time = [11800, 1200, 23300, 6000][Math.random() * 4 | 0];
  }
  const w = MENU.world; G.time = MENU.time; MENU.yaw += dt * 0.035;
  const saveRd = SETTINGS.rd; SETTINGS.rd = Math.min(saveRd, R.q === 0 ? 4 : 6);
  manageChunks(w, MENU.pos.x, MENU.pos.z, 10);
  renderWorld(w, [MENU.pos.x + 0.5, MENU.pos.h + 14, MENU.pos.z + 0.5], MENU.yaw, -0.12, { fov: 75, exposure: 1.05 });
  SETTINGS.rd = saveRd;
}
function loadingFrame(dt) {
  const p = G.player; const w = G.world; G.time = G.time; manageChunks(w, p.x, p.z, 30);
  let ready = 0, total = 0; const r = Math.min(2, SETTINGS.rd); for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { total++; const c = w.chunk((Math.floor(p.x) >> 4) + dx, (Math.floor(p.z) >> 4) + dz); if (c && c.mesh) ready++; }
  $('loadFill').style.width = (ready / total * 100) + '%'; $('loadMsg').textContent = ready < total ? 'Construyendo terreno... ' + ready + '/' + total + ' chunks' : 'Preparando...';
  renderWorld(w, [p.x, p.y + 1.6, p.z], p.yaw, p.pitch, {});
  if (ready >= total || performance.now() - G.loadStart > 25000) finishLoading();
}
function gameTick() {
  const t0 = performance.now(); const p = G.player; const client = G.net && G.net.role === 'client';
  G.tick++;
  if (!client) { G.time++; if (--G.rainTimer <= 0) { G.rain = G.rain ? 0 : 1; G.rainTimer = G.rain ? 6000 + Math.random() * 6000 : 18000 + Math.random() * 30000; } }
  G.rainLevel = lerp(G.rainLevel || 0, G.rain ? 1 : 0, 0.004);
  if (!p.dead) {
    playerTick(p);
    const inP = entityInBlock(p.world, p, d => !!d.portal);
    if (inP && p.portalCool <= 0) { const k = REG[inP.b].portal; if (k === 1) { p.portalT += G.gameMode === 'creative' ? 20 : 1; if (p.portalT >= 80) travelPortal(p, 1); } else travelPortal(p, k); } else p.portalT = Math.max(0, p.portalT - 2);
    if (p.portalCool > 0) p.portalCool--;
    // Warden en la oscuridad profunda
    if (!client && p.dim === 'overworld' && G.tick % 20 === 0 && p.world.gen.caveBiome(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === BI.deep_dark && !p.sneaking && Math.hypot(p.vx, p.vz) > 1 && G.gameMode === 'survival') {
      let sensor = false; const w = p.world; for (let i = 0; i < 40 && !sensor; i++) { const x = Math.floor(p.x + (Math.random() - 0.5) * 16), y = Math.floor(p.y + (Math.random() - 0.5) * 6), z = Math.floor(p.z + (Math.random() - 0.5) * 16); if (w.get(x, y, z) === ID.sculk_sensor) sensor = true; }
      if (sensor && (G.tick - (G.wardenT || 0)) > 100) { G.wardenT = G.tick; G.wardenWarn = (G.wardenWarn || 0) + 1; const msgs = ['El sculk vibra...', 'Algo se acerca...', 'Se acerca...', '¡Un Warden emerge!']; chatMsg(msgs[Math.min(3, G.wardenWarn - 1)], '#4cc'); if (G.wardenWarn >= 4 && ![...G.entities.values()].some(e => e.type === 'warden')) { const a = Math.random() * 6.28; const wx = p.x + Math.cos(a) * 7, wz = p.z + Math.sin(a) * 7; const m = spawnMob('warden', p.dim, wx, w.surfaceY(Math.floor(wx), Math.floor(wz)) > p.y + 5 ? p.y : p.y, wz); if (m) { m.target = p; m.persist = true; } G.wardenWarn = 0; for (let i = 0; i < 30; i++) smoke(wx, p.y, wz, { r: 0.1, g: 0.15, b: 0.15, size: 0.6 }); } }
    }
  }
  // entidades
  for (const [k, e] of G.entities) { if (e.removed) { G.entities.delete(k); continue; } if (e.proxy || e.remotePlayer) continue; if (client && !(e instanceof Projectile && e.type === 'eye')) continue; try { entityTick(e, 0.05); } catch (err) { console.error(err); e.removed = true; } }
  if (!client) {
    const dims = new Set([p.dim]); for (const e of G.entities.values()) if (e.remotePlayer) dims.add(e.dim);
    for (const d of dims) { const w = G.worlds[d]; processTicks(w); }
    const pls = [p, ...[...G.entities.values()].filter(e => e.remotePlayer)];
    for (const pl of pls) { const w = G.worlds[pl.dim]; const cx = Math.floor(pl.x) >> 4, cz = Math.floor(pl.z) >> 4; for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) randomTicks(w, cx + dx, cz + dz); if (G.tick % 20 === 0) spawnerTick(w, pl); }
    if (G.tick % 20 === 0) spawnTick();
    furnaceTick();
  }
  runTickTimers();
  if (G.net) { if (G.net.role === 'host') hostNetTick(); else clientNetTick(); }
  if (G.tick % 10 === 0) updateHUD();
  if (G.tick % 6000 === 0 && !client) saveWorld(true);
  musicTick();
  TICK_MS = lerp(TICK_MS, performance.now() - t0, 0.1);
}
function gameFrame(dt) {
  const p = G.player; const w = G.world;
  const pausedSP = G.paused && !G.net;
  if (!pausedSP) { acc += dt * 1000; let n = 0; while (acc >= 50 && n < 4) { gameTick(); acc -= 50; n++; } if (n >= 4) acc = 0; }
  const typing = $('chatIn').classList.contains('on');
  const input = (UI.open || typing || G.paused || p.dead) ? {} : { f: held('forward'), b: held('back'), l: held('left'), r: held('right'), jump: held('jump'), sneak: held('sneak'), sprint: held('sprint') || INPUT.sprintToggle, useHeld: p.eatT > 0 || p.bowT > 0 };
  if (!pausedSP && !p.dead) { p.savePrev(); const steps = dt > 0.034 ? 2 : 1; for (let i = 0; i < steps; i++) updatePlayerPhysics(p, dt / steps, input); }
  if (!pausedSP) updateInteraction(dt);
  smoothProxies(dt); updateParticles(pausedSP ? 0 : dt, w);
  if (!pausedSP) { emitterFX(w, dt); weatherFX(w, dt); }
  updateLights(dt);
  manageChunks(w, p.x, p.z, R.q === 0 ? 5 : 8);
  // cámara
  let yaw = p.yaw, pitch = p.pitch; let eye = [p.x, p.eye, p.z];
  let bob = null; if (SETTINGS.bob && perspective === 0 && p.onGround) { const bw = p.walk * Math.PI * 0.75; bob = [Math.sin(bw) * 0.035 * p.walkAmt, -Math.abs(Math.cos(bw)) * 0.05 * p.walkAmt]; }
  if (perspective > 0) { const d = lookDir(p); const s = perspective === 1 ? -1 : 1; const h = raycast(w, eye[0], eye[1], eye[2], d[0] * s, d[1] * s, d[2] * s, 4, false); const dist = h ? Math.max(0.3, h.t - 0.3) : 4; eye = [eye[0] + d[0] * s * dist, eye[1] + d[1] * s * dist, eye[2] + d[2] * s * dist]; if (perspective === 2) { yaw += Math.PI; pitch = -pitch; } }
  let roll = 0; if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt * 2.5); roll = (Math.random() - 0.5) * G.shake * 0.08; pitch += (Math.random() - 0.5) * G.shake * 0.05; yaw += (Math.random() - 0.5) * G.shake * 0.05; }
  if (p.hurtTime > 0) roll += Math.sin(p.hurtTime / 10 * Math.PI) * 0.06;
  const camB = blockAt(w, eye[0], eye[1], eye[2]); const under = camB > 0 && (REG[camB].liquid === 1 || REG[camB].inWater);
  const tfov = SETTINGS.fov * (p.sprinting ? 1.12 : 1) * (p.spy ? 0.14 : 1) * (p.bowT > 0 ? 1 - Math.min(1, p.bowT) * 0.15 : 1) * (p.gliding ? 1.1 : 1);
  G.fovCur = lerp(G.fovCur || tfov, tfov, Math.min(1, dt * 10));
  R.yawCam = yaw; const alpha = pausedSP ? 1 : acc / 50;
  renderWorld(w, eye, yaw, pitch, {
    fov: G.fovCur, under, roll, bob, biome: w.biomeAt(Math.floor(p.x), Math.floor(p.z)),
    drawEntities: () => { drawAllEntities(p.dim, alpha, perspective > 0 && G.gameMode !== 'spectator'); },
    particles: G.particles, drawOverlay: tr => drawOverlays(tr), drawHand: perspective === 0 && !hudHidden && G.gameMode !== 'spectator' && !p.spy ? drawHand : null,
    exposure: p.effects.night ? 1.6 : 1
  });
  // HUD dinámico
  if (itemNameT > 0) { itemNameT -= dt; if (itemNameT <= 0) $('itemName').style.opacity = 0; }
  $('fxPortal').style.opacity = Math.min(1, p.portalT / 80); $('fxFire').style.opacity = p.fire > 0 && G.gameMode !== 'creative' ? 0.6 + Math.sin(performance.now() / 60) * 0.2 : 0; $('fxSpy').style.opacity = p.spy ? 1 : 0;
  $('crosshair').style.display = p.spy || perspective > 0 ? 'none' : '';
  const xpl = Math.floor(Math.sqrt((p.xp || 0) / 10)); $('xplvl').textContent = xpl > 0 ? xpl : ''; $('xpfill').style.width = (((p.xp || 0) / 10 - xpl * xpl) / (2 * xpl + 1) * 100) + '%';
  dbgT -= dt; if (F3 && dbgT <= 0) { dbgT = 0.25; const [l, r] = debugText(FPS); $('debugL').innerHTML = l.map(s => s ? `<div>${esc(s)}</div>` : '<br>').join(''); $('debugR').innerHTML = r.map(s => s ? `<div>${esc(s)}</div>` : '<br>').join(''); }
  // chat desvanecido
  const now = performance.now(); const slow = now - (G._uiT || 0) > 100; if (slow) { G._uiT = now; for (const el of $('chatLog').children) { const o = now - el.dataset.t > 10000 ? '0' : '1'; if (el.style.opacity !== o) el.style.opacity = o; } }
  // barra de jefe
  let boss = null; for (const e of G.entities.values()) if (e.dim === p.dim && MOB[e.type] && MOB[e.type].boss && !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 150) boss = e;
  if (boss) { $('bossbar').style.display = 'block'; $('bossName').textContent = MOB[boss.type].boss; $('bossFill').style.width = (boss.hp / (boss.maxHp || MOB[boss.type].hp) * 100) + '%'; } else $('bossbar').style.display = 'none';
  // nombres y lista de jugadores
  if (slow) updateNametags();
  $('plist').style.display = held('playerlist') ? 'block' : 'none'; if (held('playerlist')) { const names = [p.name, ...[...G.entities.values()].filter(e => e.type === 'player' && (e.proxy || e.remotePlayer)).map(e => e.name)]; $('plist').innerHTML = '<b>Jugadores (' + names.length + ')</b><br>' + names.map(esc).join('<br>'); }
  $('netInfo').textContent = G.net ? (G.net.role === 'host' ? 'Alojando · código ' + G.net.code + ' · ' + G.net.peers + ' conectados' : 'Conectado a ' + G.net.code) : '';
  // cursor del inventario
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); }
function updateNametags() {
  const box = $('nametags'); let html = '';
  for (const e of G.entities.values()) { if (e.type !== 'player' || e.dim !== G.player.dim || e.spectator) continue; const s = M4.xform(R.vp, e.x - R.cam[0], e.y + 2.15 - R.cam[1], e.z - R.cam[2]); if (s[3] <= 0 || Math.abs(s[0]) > 1.1 || Math.abs(s[1]) > 1.1) continue; const d = Math.hypot(e.x - G.player.x, e.z - G.player.z); if (d > 64) continue; html += `<div class="ntag" style="left:${(s[0] * 0.5 + 0.5) * 100}%;top:${(0.5 - s[1] * 0.5) * 100}%;opacity:${e.sneaking ? 0.4 : 1}">${esc(e.name)}</div>`; }
  if (box.innerHTML !== html) box.innerHTML = html;
}
// ------------------------------------------------------------ EFECTOS: emisores, clima, luces
function emitterFX(w, dt) {
  const p = G.player; const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4; const R2 = 2;
  const fires = [];
  for (let dx = -R2; dx <= R2; dx++) for (let dz = -R2; dz <= R2; dz++) {
    const c = w.chunk(pcx + dx, pcz + dz); if (!c || !c.emitters) continue; const E = c.emitters;
    for (let i = 0; i < E.length; i += 4) {
      const x = E[i], y = E[i + 1], z = E[i + 2], id = E[i + 3];
      if (id === ID.fire) { fireFX(w, x, y, z, dt); fires.push([x + 0.5, y + 0.6, z + 0.5]); }
      else if (id === ID.campfire) { if (Math.random() < 5 * dt) flame(x + 0.3 + Math.random() * 0.4, y + 0.35, z + 0.3 + Math.random() * 0.4, { size: 0.35, vy: 0.8 }); if (Math.random() < 2.5 * dt) smoke(x + 0.5, y + 0.9, z + 0.5, { r: 0.22, g: 0.21, b: 0.2, a: 0.5, size: 0.5, grow: 0.5, life: 7, vy: 2.2, drag: 0.1, wind: true }); fires.push([x + 0.5, y + 0.5, z + 0.5]); }
      else if (id === ID.lava) { if (Math.random() < dt * 0.15) { P_({ x: x + Math.random(), y: y + 0.95, z: z + Math.random(), vx: (Math.random() - 0.5) * 2, vy: 4 + Math.random() * 3, vz: (Math.random() - 0.5) * 2, life: 1.5, size: 0.07, add: true, emis: 8, r: 1, g: 0.55, b: 0.15, layer: TEX.ember, grav: 16, collide: true }); } if (Math.random() < dt * 0.05) smoke(x + 0.5, y + 1, z + 0.5, { r: 0.12, g: 0.11, b: 0.1, size: 0.4, life: 2, a: 0.35 }); if (Math.random() < 0.02) fires.push([x + 0.5, y + 1, z + 0.5, 1]); }
      else if (id === ID.torch || id === ID.soul_torch || id === ID.redstone_torch) { const m = w.getMeta(x, y, z); const o = m >= 1 && m <= 4 ? [[0, 0.32], [-0.32, 0], [0, -0.32], [0.32, 0]][m - 1] : [0, 0]; const ty = y + 0.72 + (m ? 0.2 : 0); if (Math.random() < dt * 4) { const soul = id === ID.soul_torch, red = id === ID.redstone_torch; P_({ x: x + 0.5 + o[0], y: ty, z: z + 0.5 + o[1], vy: 0.25, life: 0.4, size: 0.12, grow: -0.2, add: true, emis: 3, r: soul ? 0.4 : 1, g: soul ? 0.9 : red ? 0.15 : 0.6, b: soul ? 1 : 0.2, layer: TEX['flame_' + (Math.random() * 3 | 0)] }); } if (Math.random() < dt * 0.8) smoke(x + 0.5 + o[0], ty + 0.1, z + 0.5 + o[1], { size: 0.12, grow: 0.15, life: 1.5, a: 0.3, vy: 0.5, r: 0.2, g: 0.2, b: 0.2 }); }
      else if (id === ID.end_rod && Math.random() < dt) P_({ x: x + 0.5, y: y + 0.5 + Math.random() * 0.5, z: z + 0.5, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4, life: 2, size: 0.08, add: true, emis: 3, layer: TEX.spark, r: 1, g: 1, b: 1 });
      else if (id === ID.nether_portal && Math.random() < dt * 0.5) P_({ x: x + Math.random(), y: y + Math.random(), z: z + Math.random(), vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: (Math.random() - 0.5), life: 1.5, size: 0.08, add: true, emis: 3, layer: TEX.portal_p, r: 0.6, g: 0.2, b: 1 });
      else if (id === ID.cave_vines && Math.random() < dt * 0.05) P_({ x: x + 0.5, y: y, z: z + 0.5, vy: -1, life: 1, size: 0.05, add: true, emis: 2, layer: TEX.spark, r: 1, g: 0.8, b: 0.3, grav: 4 });
    }
  }
  G._fires = fires;
}
function weatherFX(w, dt) {
  const p = G.player; const rl = G.rainLevel || 0; if (AU.rain) AU.rain.gain.value = w.dim === 'overworld' ? rl * 0.12 * SETTINGS.vol : 0;
  if (w.dim === 'overworld' && rl > 0.05) {
    const n = Math.floor(rl * [40, 120, 260][SETTINGS.particles ?? 2] * dt * 10);
    for (let i = 0; i < n; i++) {
      const x = p.x + (Math.random() - 0.5) * 32, z = p.z + (Math.random() - 0.5) * 32; const y = p.y + 8 + Math.random() * 10;
      const L = w.light(Math.floor(x), Math.floor(y), Math.floor(z)); if (L[0] < 15) continue;
      const bio = BIOMES[w.biomeAt(Math.floor(x), Math.floor(z))]; if (!bio || bio.id === BI.desert || bio.id === BI.savanna) continue;
      if (bio.snow || y > SEA + 95) P_({ x, y, z, vx: 0.4, vy: -1.6 - Math.random(), vz: 0.2, life: 8, size: 0.09 + Math.random() * 0.06, layer: TEX.snowflake, r: 1, g: 1, b: 1, a: 0.9, collide: true, rot: Math.random() * 6, vrot: 1, drag: 0, wind: true });
      else P_({ x, y, z, vx: 0.5, vy: -18, life: 1.2, size: 0.12, layer: TEX.raindrop, r: 0.7, g: 0.8, b: 1, a: 0.45, collide: true });
    }
  }
  if (w.dim === 'nether' && Math.random() < dt * 6) { const x = p.x + (Math.random() - 0.5) * 24, z = p.z + (Math.random() - 0.5) * 24, y = p.y + (Math.random() - 0.5) * 12; const bio = w.biomeAt(Math.floor(x), Math.floor(z)); const c = bio === BI.crimson_forest ? [0.8, 0.2, 0.2] : bio === BI.warped_forest ? [0.3, 0.8, 0.9] : bio === BI.soul_sand_valley ? [0.6, 0.9, 1] : bio === BI.basalt_deltas ? [0.8, 0.8, 0.8] : [1, 0.5, 0.2]; P_({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: -0.2, vz: (Math.random() - 0.5) * 0.3, life: 5, size: 0.05, layer: TEX.spark, r: c[0], g: c[1], b: c[2], add: bio !== BI.basalt_deltas, emis: bio !== BI.basalt_deltas ? 1.5 : 0 }); }
}
function updateLights(dt) {
  const L = R.plights; for (let i = L.length - 1; i >= 0; i--) { const l = L[i]; if (l.life !== undefined) { l.life -= dt; if (l.life <= 0) { L.splice(i, 1); continue; } const k = l.life / l.max; l.c = l.c0 ? l.c0.map(v => v * k) : (l.c0 = l.c.slice(), l.c); } else L.splice(i, 1); }
  const p = G.player; const t = performance.now() / 1000;
  // luz dinámica del objeto en mano
  const h = p.held(); const hd = h ? REG[h.id] : null; const lum = hd ? (hd.light || (h.id === ID.lava_bucket ? 15 : 0) || (h.id === ID.glowstone_dust ? 8 : 0)) : 0;
  if (lum >= 7 && G.gameMode !== 'spectator') L.push({ x: p.x, y: p.eye - 0.2, z: p.z, r: lum * 0.75, c: hd && (h.id === ID.soul_torch || h.id === ID.soul_lantern) ? [0.4, 1.0, 1.3] : [1.4, 0.95, 0.5] });
  // llamas parpadeantes cercanas
  const fires = (G._fires || []).sort((a, b) => ((a[0] - p.x) ** 2 + (a[2] - p.z) ** 2) - ((b[0] - p.x) ** 2 + (b[2] - p.z) ** 2)).slice(0, 4);
  for (const f of fires) { const fl = 0.75 + Math.sin(t * 13 + f[0]) * 0.12 + Math.sin(t * 23 + f[2]) * 0.1; L.push({ x: f[0], y: f[1], z: f[2], r: 9, c: [2.2 * fl, 1.0 * fl, 0.35 * fl] }); }
}
// ------------------------------------------------------------ superposiciones y mano
function drawOverlays(trans) {
  const gl = R.gl; const p = G.player; const w = G.world;
  if (!trans) {
    const h = G.hit; const lines = [];
    if (h && !h.ent && !hudHidden && G.gameMode !== 'spectator') {
      const d = REG[h.id]; let b = d.box ? d.box.map(v => v / 16) : d.render === 'snow' ? [0, 0, 0, 1, Math.max(1, w.getMeta(h.x, h.y, h.z)) / 8, 1] : [0, 0, 0, 1, 1, 1]; if (d.fenceH) b = [b[0], 0, b[2], b[3], 1, b[5]];
      if (d.shape) { const bx = shapeBoxes(d, w.getMeta(h.x, h.y, h.z), (dx, dz) => w.get(h.x + dx, h.y, h.z + dz)); b = [1, 1, 1, 0, 0, 0]; for (const q of bx) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], q[i] / 16); b[i + 3] = Math.max(b[i + 3], q[i + 3] / 16); } }
      if (d.id === ID.torch || d.id === ID.soul_torch) { const m = w.getMeta(h.x, h.y, h.z); if (m >= 1 && m <= 4) { const o = [[0, 0.32], [-0.32, 0], [0, -0.32], [0.32, 0]][m - 1]; b = [b[0] + o[0], b[1] + 0.2, b[2] + o[1], b[3] + o[0], b[4] + 0.2, b[5] + o[1]]; } }
      const e = 0.002; lines.push(...boxLines(h.x + b[0] - e, h.y + b[1] - e, h.z + b[2] - e, h.x + b[3] + e, h.y + b[4] + e, h.z + b[5] + e));
      if (MINE.target && MINE.prog > 0 && G.gameMode !== 'creative') { // grietas
        const P = R.progs.box; gl.useProgram(P.p); setCommon(P); gl.uniformMatrix4fv(P.u.u_vp, false, R.vp); gl.bindVertexArray(R.cube);
        gl.enable(gl.BLEND); gl.blendFunc(gl.DST_COLOR, gl.SRC_COLOR); gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -2);
        const m = M4.ident(M4.create()); M4.translate(m, h.x + b[0] - R.cam[0] - 0.003, h.y + b[1] - R.cam[1] - 0.003, h.z + b[2] - R.cam[2] - 0.003); M4.scale(m, b[3] - b[0] + 0.006, b[4] - b[1] + 0.006, b[5] - b[2] + 0.006);
        gl.uniformMatrix4fv(P.u.u_model, false, m); _layers.fill(TEX['destroy_' + Math.max(0, Math.min(9, MINE.stage))]); gl.uniform1iv(P.u.u_layers, _layers); gl.uniform4fv(P.u.u_uvr, UVR_FULL); gl.uniform1f(P.u.u_mode, 1); gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0); gl.uniform1f(P.u.u_mode, 0);
        gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.disable(gl.BLEND);
      }
    }
    if (lines.length) drawLines(lines, [0, 0, 0, 0.9]);
    const beams = entityBeams(p.dim); if (beams.length) drawLines(beams, [0.9, 0.4, 1, 1]);
    if (F3B) { const L = []; for (const e of G.entities.values()) if (e.dim === p.dim && Math.abs(e.x - p.x) < 48 && Math.abs(e.z - p.z) < 48) L.push(...boxLines(e.x - e.w / 2, e.y, e.z - e.w / 2, e.x + e.w / 2, e.y + e.h, e.z + e.w / 2)); if (L.length) drawLines(L, [1, 1, 1, 1]); }
    if (F3G) { const L = []; const cx = (Math.floor(p.x) >> 4) * 16, cz = (Math.floor(p.z) >> 4) * 16; for (const [x, z] of [[cx, cz], [cx + 16, cz], [cx, cz + 16], [cx + 16, cz + 16]]) L.push(x - R.cam[0], -R.cam[1], z - R.cam[2], x - R.cam[0], w.H - R.cam[1], z - R.cam[2]); for (let y = 0; y <= w.H; y += 16) L.push(...boxLines(cx, y, cz, cx + 16, y, cz + 16)); drawLines(L, [1, 1, 0, 1]); }
  }
}
function drawHand() {
  const gl = R.gl; const p = G.player; const P = R.progs.box; gl.useProgram(P.p);
  const save = R.shadowActive; R.shadowActive = false; const sc = R.cam; R.cam = [0, 0, 0]; setCommon(P); R.cam = sc; R.shadowActive = save;
  const proj = M4.persp(M4.create(), 70 * Math.PI / 180, R.w / R.h, 0.01, 10); gl.uniformMatrix4fv(P.u.u_vp, false, proj); gl.bindVertexArray(R.cube);
  gl.uniform1f(P.u.u_shadowOn, 0); gl.uniform2f(P.u.u_fog, 1000, 2000);
  const L = p.world.light(Math.floor(p.x), Math.floor(p.eye), Math.floor(p.z)); const light = [Math.max(L[0], 0), L[1]];
  const s = p.swing ? Math.sin(p.swing * Math.PI) : 0; const s2 = p.swing ? Math.sin(Math.sqrt(p.swing) * Math.PI) : 0;
  const bw = p.walk * Math.PI * 0.75; const bx = SETTINGS.bob ? Math.sin(bw) * 0.03 * p.walkAmt : 0, by = SETTINGS.bob ? -Math.abs(Math.cos(bw)) * 0.03 * p.walkAmt : 0;
  const h = p.held(); const m = M4.create();
  let eat = p.eatT > 0 ? Math.min(1, p.eatT * 4) : 0; const eatBob = p.eatT > 0 ? Math.abs(Math.sin(p.eatT * 12)) * 0.03 : 0;
  M4.translate(m, 0.56 + bx - s2 * 0.25 - eat * 0.35, -0.52 + by + Math.sin(s2 * Math.PI) * 0.1 + eat * 0.2 + eatBob, -0.72 - s * 0.15);
  if (p.bowT > 0) M4.translate(m, -0.2, 0.05, 0.05);
  if (h) {
    const d = REG[h.id];
    M4.rotY(m, -0.25 - s2 * 0.4 + eat * 0.5); M4.rotX(m, -s * 0.6); M4.rotZ(m, s * 0.2);
    if (d.isBlock && d.render !== 'cross' && d.render !== 'fire') { M4.rotY(m, 0.785); M4.scale(m, 0.4, 0.4, 0.4); M4.translate(m, -0.5, -0.3, -0.5); const b = d.box; if (b && b[4] < 12) { M4.translate(m, b[0] / 16, 0, b[2] / 16); M4.scale(m, (b[3] - b[0]) / 16, (b[4] - b[1]) / 16, (b[5] - b[2]) / 16); } drawBox(m, d.faces, light, (d.tint || d.tintTop) ? [0.55, 0.78, 0.35, 1] : null, null, d.emissive ? 0.6 : 0); }
    else { M4.rotY(m, -1.2); M4.rotZ(m, 0.25); if (d.tool || d.bow || d.trident) { M4.rotZ(m, 0.4); } M4.translate(m, -0.3, -0.15, 0); M4.scale(m, 0.62, 0.62, 0.04); drawBox(m, d.isBlock ? d.faces[0] : d.icon, light, d.tint ? [0.55, 0.78, 0.35, 1] : null, null, 0, ITEM_UVR); }
  } else {
    M4.translate(m, 0.08, -0.12, 0); M4.rotX(m, 0.75 - s * 1.2); M4.rotY(m, -0.35 - s * 0.3); M4.rotZ(m, -0.15); M4.translate(m, -0.07, -0.35, -0.07); M4.scale(m, 0.15, 0.55, 0.15);
    drawBox(m, L6({ all: 'steve_skin', top: 'steve_skin' }), light);
  }
}
// ------------------------------------------------------------ MENÚS
const SPLASHES = ['¡Ahora en un solo archivo!', '¡Hecho con WebGL2!', '¡Con shaders!', '¡Multijugador P2P!', '¡Ahora con netherita!', '¡100% procedural!', '¡Agua realista!', '¡Explosiones de verdad!', '¡No contiene Herobrine!', '¡Cuidado con los creepers!', '¡Pico de diamante!', '¡Cuevas de deepslate!', '¡Bastiones y fortalezas!', '¡El End te espera!', '¡Nieve hiperrealista!', '¡Hola, mundo!', '¡Bloques por todos lados!', '¡Ahora con más cubos!', '¡Dragones!', '¡Semillas infinitas!'];
function drawLogo() {
  const F = { M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], I: ['111', '010', '010', '010', '010', '010', '111'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'], A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'], ' ': ['00', '00', '00', '00', '00', '00', '00'] };
  const text = 'MINECRAFT 2'; const px = 9, gap = 1; let W = 0; for (const ch of text) W += (F[ch][0].length + gap) * px; const cv = $('logo'); cv.width = W + 16; cv.height = 7 * px + 16; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const stone = tileCanvas('stone'), cob = tileCanvas('cobblestone'); let x0 = 4;
  const cells = []; for (const ch of text) { const gl = F[ch]; gl.forEach((r, y) => [...r].forEach((v, x) => { if (v === '1') cells.push([x0 + x * px, 4 + y * px, ch === '2']); })); x0 += (gl[0].length + gap) * px; }
  for (let d = 7; d >= 1; d--) for (const [x, y, two] of cells) { g.fillStyle = d === 7 ? '#000' : two ? `rgb(${60 + d * 6},${30 + d * 3},${80 + d * 8})` : `rgb(${40 + d * 6},${40 + d * 6},${40 + d * 6})`; g.fillRect(x + d, y + d, px, px); }
  for (const [x, y, two] of cells) { g.drawImage(two ? tileCanvas('amethyst_block') : (((x + y) / px) % 3 ? stone : cob), (x % 16), (y % 16), 8, 8, x, y, px, px); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, px, 1); g.fillRect(x, y, 1, px); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y + px - 1, px, 1); g.fillRect(x + px - 1, y, 1, px); }
  cv.style.width = Math.min(cv.width * 1.0, window.innerWidth * 0.9) + 'px';
}
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('on')); if (id) $(id).classList.add('on'); }
function hideScreens() { document.querySelectorAll('.screen').forEach(s => { if (s.id !== 'sInv') s.classList.remove('on'); }); }
function goMenu() { G.mode = 'menu'; showScreen('sMain'); $('menuShade').style.display = 'block'; $('footL').style.display = $('footR').style.display = ''; $('splash').textContent = SPLASHES[Math.random() * SPLASHES.length | 0]; $('hud').style.display = 'none'; }
let selWorld = null;
async function refreshWorlds() {
  const box = $('worldList'); box.innerHTML = '<div class="note">Cargando...</div>'; let list = [];
  try { list = await DB.list(); } catch (e) { box.innerHTML = '<div class="err">No se puede acceder al almacenamiento del navegador: ' + e.message + '</div>'; return; }
  box.innerHTML = list.length ? '' : '<div class="note">No hay mundos. ¡Crea uno nuevo!</div>'; selWorld = null; updWBtns();
  for (const w of list) { const el = document.createElement('div'); el.className = 'witem'; el.innerHTML = `<div class="ic" style="background-image:url(${w.icon || iconURL(ID.grass_block)})"></div><div><div class="nm">${esc(w.name)}</div><div class="ds">${new Date(w.lastPlayed).toLocaleString()} · Semilla: ${esc(w.seedStr)}</div><div class="ds">Modo ${({ survival: 'Supervivencia', creative: 'Creativo', spectator: 'Espectador', adventure: 'Aventura' })[w.mode] || w.mode}</div></div>`; el.onclick = () => { selWorld = w.id; [...box.children].forEach(c => c.classList.remove('sel')); el.classList.add('sel'); updWBtns(); }; el.ondblclick = () => playWorld(w.id); box.appendChild(el); }
}
function updWBtns() { $('wPlay').disabled = $('wExport').disabled = $('wDelete').disabled = !selWorld; }
async function playWorld(id) { const rec = await DB.get(id); if (!rec) return; G.worldId = id; G.iconURL = rec.icon; startWorld(rec.data, false); G.pendingHost = G.hostAfterLoad; G.hostAfterLoad = false; }
const CREATE = { mode: 'survival', diff: 2, cheats: true, structs: true };
function buildOptions() {
  const box = $('optGrid'); box.innerHTML = '';
  const slider = (label, key, min, max, step, fmt, onch) => { const d = document.createElement('div'); d.className = 'slider'; const knob = document.createElement('div'); knob.className = 'knob'; const sp = document.createElement('span'); const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = SETTINGS[key]; const upd = () => { const v = +inp.value; sp.textContent = label + ': ' + fmt(v); knob.style.left = `calc(${(v - min) / (max - min) * 100}% - ${(v - min) / (max - min) * 16}px)`; }; inp.oninput = () => { SETTINGS[key] = +inp.value; upd(); saveSettings(); onch && onch(+inp.value); }; upd(); d.append(knob, sp, inp); box.appendChild(d); };
  const toggle = (label, key, vals, names, onch) => { const b = document.createElement('button'); b.className = 'btn'; const upd = () => b.textContent = label + ': ' + names[vals.indexOf(SETTINGS[key])]; b.onclick = () => { SETTINGS[key] = vals[(vals.indexOf(SETTINGS[key]) + 1) % vals.length]; upd(); saveSettings(); onch && onch(SETTINGS[key]); }; upd(); box.appendChild(b); };
  slider('Campo de visión', 'fov', 30, 110, 1, v => v === 70 ? 'Normal' : v >= 110 ? 'Quake Pro' : v);
  slider('Distancia de renderizado', 'rd', 2, 16, 1, v => v + ' chunks');
  toggle('Gráficos', 'quality', [0, 1, 2, 3], ['Rápidos (PC de bajos recursos)', 'Equilibrados (sombras+bloom)', 'Realistas (shaders completos)', 'Ultra (reflejos SSR+4K sombras)'], v => setQuality(v));
  toggle('Partículas', 'particles', [0, 1, 2], ['Mínimas', 'Reducidas', 'Todas']);
  toggle('Procesador gráfico', 'gpuPref', ['high-performance', 'default', 'low-power'], ['GPU dedicada (rendimiento)', 'Automático', 'GPU integrada (ahorro)'], () => { if (confirm('Este cambio necesita recargar la página. ¿Recargar ahora?')) { if (G.mode === 'game') saveWorld(true).then(() => location.reload()); else location.reload(); } });
  toggle('Límite de FPS', 'fpsCap', [0, 30, 60, 120], ['Sin límite (VSync)', '30', '60', '120']);
  toggle('Hilos de CPU para chunks', 'threads', [0, 1, 2, 3, 4, 6], ['Automático', '1', '2', '3', '4', '6'], () => { if (confirm('Este cambio necesita recargar la página. ¿Recargar ahora?')) { if (G.mode === 'game') saveWorld(true).then(() => location.reload()); else location.reload(); } });
  toggle('Resolución dinámica', 'dynres', [true, false], ['Sí (recomendado)', 'No'], v => { R.dyn = 1; resize(); });
  slider('Escala de resolución', 'resScale', 0.5, 1, 0.05, v => Math.round(v * 100) + '%', () => resize());
  slider('Sensibilidad', 'sens', 0.05, 1.5, 0.01, v => Math.round(v * 100) + '%');
  slider('Volumen', 'vol', 0, 1, 0.01, v => v === 0 ? 'Silencio' : Math.round(v * 100) + '%', v => { if (AU.master) AU.master.gain.value = v; });
  slider('Brillo', 'brightness', 0, 1, 0.01, v => v === 0 ? 'Oscuro' : v === 1 ? 'Brillante' : Math.round(v * 100) + '%');
  toggle('Nubes', 'clouds', [true, false], ['Sí', 'No']);
  toggle('Balanceo de vista', 'bob', [true, false], ['Sí', 'No']);
  toggle('Invertir ratón', 'invertY', [false, true], ['No', 'Sí']);
  slider('Escala de interfaz', 'gui', 1, 3, 0.25, v => v + 'x', applyGui);
  const gi = document.createElement('div'); gi.className = 'note'; gi.style.gridColumn = '1/-1'; gi.innerHTML = 'Dibujando con: <b>' + esc(R.gpu || '?') + '</b>' + (R.software ? '<br><span style="color:#f66">⚠ Tu navegador está dibujando con la CPU (sin aceleración por hardware). Activa «Usar aceleración por hardware» en la configuración del navegador para usar la GPU.</span>' : ''); box.appendChild(gi);
  const n = document.createElement('div'); n.className = 'note'; n.style.gridColumn = '1/-1'; n.textContent = 'Consejo: en computadoras de bajos recursos usa gráficos «Rápidos», 4-6 chunks y partículas reducidas. El juego usa culling de caras ocultas, de frustum y por distancia.'; box.appendChild(n);
}
function applyGui() { document.documentElement.style.setProperty('--ui', (SETTINGS.gui / 2).toFixed(2)); }
let waitingKey = null;
function buildControls() {
  const box = $('keyList'); box.innerHTML = '';
  for (const a in KEY_NAMES) { const r = document.createElement('div'); r.className = 'krow'; const l = document.createElement('span'); l.textContent = KEY_NAMES[a]; const b = document.createElement('button'); b.className = 'btn'; b.textContent = keyLabel(SETTINGS.keys[a]); b.onclick = e => { e.stopPropagation(); if (waitingKey) waitingKey.b.classList.remove('wait'); waitingKey = { a, b }; b.textContent = '> ? <'; b.classList.add('wait'); }; r.append(l, b); box.appendChild(r); }
}
function bindKey(code) { if (!waitingKey) return false; if (code !== 'Escape') SETTINGS.keys[waitingKey.a] = code; saveSettings(); waitingKey = null; buildControls(); return true; }
function setupMenus() {
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { audioInit(); playSound('click', 0, 0, 0, 1); const g = b.dataset.go; if (g === 'single') { showScreen('sWorlds'); refreshWorlds(); } else if (g === 'multi') { showScreen('sMulti'); $('mName').value = SETTINGS.name; $('mErr').textContent = ''; } else if (g === 'options') { optReturn = 'sMain'; buildOptions(); showScreen('sOptions'); } else if (g === 'quit') { showScreen('sQuit'); } else if (g === 'realms') { b.textContent = 'Próximamente...'; setTimeout(() => b.textContent = 'Reinos de Minecraft 2', 1500); } });
  $('wBack').onclick = () => goMenu(); $('wNew').onclick = () => { $('cName').value = 'Nuevo mundo'; $('cSeed').value = ''; showScreen('sCreate'); };
  $('wPlay').onclick = () => selWorld && playWorld(selWorld);
  $('wDelete').onclick = async () => { if (!selWorld) return; if (!confirm('¿Seguro que quieres borrar este mundo? ¡Se perderá para siempre! (Descárgalo antes con «Exportar» si quieres conservarlo)')) return; await DB.del(selWorld); refreshWorlds(); };
  $('wExport').onclick = async () => { const r = await DB.get(selWorld); if (r) downloadWorld(r.data); };
  $('wImport').onclick = () => $('fileIn').click();
  $('fileIn').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const txt = await gunz(await f.arrayBuffer()); const data = JSON.parse(txt); if (data.format !== 'minecraft2-world') throw new Error('No es un archivo de mundo de Minecraft 2'); const id = 'w' + Date.now(); await DB.put({ id, name: data.name + ' (importado)', seedStr: data.seedStr, mode: data.gameMode, lastPlayed: Date.now(), data: Object.assign(data, { name: data.name }) }); refreshWorlds(); } catch (err) { alert('Error al importar: ' + err.message); } e.target.value = ''; };
  const modeNames = { survival: 'Supervivencia', creative: 'Creativo', adventure: 'Aventura', spectator: 'Espectador' };
  $('cMode').onclick = () => { const L = ['survival', 'creative', 'adventure']; CREATE.mode = L[(L.indexOf(CREATE.mode) + 1) % L.length]; $('cMode').textContent = 'Modo: ' + modeNames[CREATE.mode]; };
  $('cDiff').onclick = () => { CREATE.diff = (CREATE.diff + 1) % 4; $('cDiff').textContent = 'Dificultad: ' + DIFFNAMES[CREATE.diff]; };
  $('cCheats').onclick = () => { CREATE.cheats = !CREATE.cheats; $('cCheats').textContent = 'Trucos: ' + (CREATE.cheats ? 'SÍ' : 'NO'); };
  $('cStruct').onclick = () => { CREATE.structs = !CREATE.structs; $('cStruct').textContent = 'Estructuras: ' + (CREATE.structs ? 'SÍ' : 'NO'); };
  $('cBack').onclick = () => { showScreen('sWorlds'); refreshWorlds(); };
  $('cGo').onclick = () => { const [seed, seedStr] = seedFromString($('cSeed').value); G.worldId = 'w' + Date.now(); G.iconURL = null; startWorld({ name: $('cName').value.trim() || 'Nuevo mundo', seed, seedStr, gameMode: CREATE.mode, difficulty: CREATE.diff, cheats: CREATE.cheats, structures: CREATE.structs }, true); G.pendingHost = G.hostAfterLoad; G.hostAfterLoad = false; };
  // multijugador
  $('mBack').onclick = () => goMenu(); $('mHost').onclick = () => { G.hostAfterLoad = true; showScreen('sWorlds'); refreshWorlds(); };
  const join = async lan => { const name = $('mName').value.trim() || SETTINGS.name; SETTINGS.name = name; saveSettings(); const code = $('mCode').value.trim(); if (code.length < 4) { $('mErr').textContent = 'Escribe el código del mundo.'; return; } $('mErr').textContent = 'Conectando...'; try { const wl = await joinGame(code, lan, name); G.worldId = null; startWorld({ name: wl.worldName, seed: wl.seed, seedStr: wl.seedStr, gameMode: wl.gm, difficulty: wl.diff, time: wl.time, dragonKilled: wl.dk, endInit: wl.ei, gateway: wl.gw, worldSpawn: wl.spawn, keepInventory: wl.keep }, false, wl); } catch (e) { stopNet(); $('mErr').textContent = 'Error: ' + e.message; } };
  $('mJoin').onclick = () => join(false); $('mJoinLan').onclick = () => join(true);
  $('mCode').addEventListener('keydown', e => e.stopPropagation()); $('mName').addEventListener('keydown', e => e.stopPropagation());
  // opciones
  $('oDone').onclick = () => { if (optReturn === 'sPause') showScreen('sPause'); else goMenu(); };
  $('oControls').onclick = () => { buildControls(); showScreen('sControls'); };
  $('kDone').onclick = () => { waitingKey = null; buildOptions(); showScreen('sOptions'); }; $('kReset').onclick = () => { SETTINGS.keys = Object.assign({}, DEFAULT_KEYS); saveSettings(); buildControls(); };
  // pausa
  $('pResume').onclick = () => pauseGame(false); $('pOptions').onclick = () => { optReturn = 'sPause'; buildOptions(); showScreen('sOptions'); };
  $('pLan').onclick = async () => { $('pLan').disabled = true; const code = await startHost(); $('pCode').textContent = code; $('pCodeWrap').style.display = ''; };
  $('pExport').onclick = async () => { await saveWorld(true); downloadWorld(serializeWorld()); };
  $('pQuit').onclick = () => quitToTitle(true);
  $('dRespawn').onclick = () => respawn(); $('dTitle').onclick = () => quitToTitle(true);
  $('qBack').onclick = () => goMenu(); $('crBack').onclick = () => { hideScreens(); lockPointer(); };
  // chat
  $('chatIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { const v = $('chatIn').value.trim(); if (v) { if (v.startsWith('/')) runCommand(v); else { const txt = '<' + G.player.name + '> ' + v; if (G.net && G.net.role === 'client') netSend({ t: 'chat', m: v }); else { chatMsg(txt); if (G.net) netBroadcast({ t: 'chat', m: txt }); } } } closeChat(); } else if (e.key === 'Escape') closeChat(); });
}
let optReturn = 'sMain';
// ------------------------------------------------------------ EVENTOS
function setupInput() {
  window.addEventListener('keydown', e => { if (waitingKey) { e.preventDefault(); bindKey(e.code); return; } if (G.mode === 'game') onKeyDown(e); else if (e.code === 'Escape' && G.mode === 'menu' && !$('sMain').classList.contains('on')) goMenu(); });
  window.addEventListener('keyup', e => onKeyUp(e));
  const cv = $('gl');
  cv.addEventListener('mousedown', e => { audioInit(); if (G.mode !== 'game') return; if (document.pointerLockElement !== cv) { lockPointer(); return; } INPUT.mouse['Mouse' + e.button] = true; e.preventDefault(); });
  window.addEventListener('mousedown', e => { if (waitingKey) { e.preventDefault(); bindKey('Mouse' + e.button); } });
  window.addEventListener('mouseup', e => { INPUT.mouse['Mouse' + e.button] = false; });
  window.addEventListener('contextmenu', e => { if (G.mode === 'game') e.preventDefault(); });
  window.addEventListener('mousemove', e => {
    if (UI.open) { const c = $('cursorItem'); c.style.left = (e.clientX - 18) + 'px'; c.style.top = (e.clientY - 18) + 'px'; const t = $('tooltip'); t.style.left = (e.clientX + 14) + 'px'; t.style.top = (e.clientY - 30) + 'px'; }
    if (G.mode !== 'game' || document.pointerLockElement !== cv || UI.open || G.paused) return;
    const p = G.player; const s = SETTINGS.sens * 0.0042 * (p.spy ? 0.2 : 1);
    p.yaw -= e.movementX * s; p.pitch -= e.movementY * s * (SETTINGS.invertY ? -1 : 1); p.pitch = clamp(p.pitch, -1.5705, 1.5705);
  });
  window.addEventListener('wheel', e => { if (G.mode !== 'game' || UI.open || G.paused) return; const p = G.player; p.sel = (p.sel + (e.deltaY > 0 ? 1 : 8)) % 9; updateHUD(); showItemName(); }, { passive: true });
  document.addEventListener('pointerlockchange', () => { if (G.mode === 'game' && document.pointerLockElement !== $('gl') && !UI.open && !G.paused && !$('chatIn').classList.contains('on') && !G.player.dead && !$('sCredits').classList.contains('on')) pauseGame(true); INPUT.mouse = {}; });
  window.addEventListener('blur', () => { INPUT.keys = {}; INPUT.mouse = {}; });
  window.addEventListener('resize', () => { drawLogo(); });
  window.addEventListener('beforeunload', () => { if (G.mode === 'game' && (!G.net || G.net.role === 'host')) { try { saveWorld(true); } catch (e) { } } });
  $('sInv').addEventListener('mousedown', e => { if (e.target === $('sInv') && UI.cursor) { const p = G.player; const n = e.button === 2 ? 1 : UI.cursor.c; dropItem(p.dim, p.x, p.eye - 0.3, p.z, { ...UI.cursor, c: n }, -Math.sin(p.yaw) * 4, 2, -Math.cos(p.yaw) * 4, 40); UI.cursor.c -= n; if (UI.cursor.c <= 0) UI.cursor = null; refreshInvUI(); } });
}
// ------------------------------------------------------------ ARRANQUE
function boot() {
  buildTables(); buildHudImages();
  try { initGL(); } catch (e) { document.body.innerHTML = '<div style="padding:40px;font-size:28px;color:#fff;font-family:monospace">Minecraft 2 necesita un navegador con WebGL2.<br><br>' + esc(e.message) + '</div>'; return; }
  const dirt = tileCanvas('dirt'); const dc = document.createElement('canvas'); dc.width = dc.height = 16; const dg = dc.getContext('2d'); dg.drawImage(dirt, 0, 0); dg.fillStyle = 'rgba(0,0,0,.6)'; dg.fillRect(0, 0, 16, 16);
  const url = dc.toDataURL(); document.querySelectorAll('.dirt').forEach(el => el.style.backgroundImage = `url(${url})`);
  initWorkers(); drawLogo(); setupMenus(); setupInput(); applyGui(); goMenu();
  // anfitrión tras cargar
  setInterval(() => { if (G.mode === 'game' && G.pendingHost) { G.pendingHost = false; startHost().then(code => { showTitle('Código: ' + code, 'Comparte este código con tus amigos'); }); } }, 500);
  requestAnimationFrame(frame);
  // si la pestaña del anfitrión queda en segundo plano, el mundo sigue funcionando
  setInterval(() => { if (document.hidden && G.mode === 'game' && G.net) { try { gameTick(); } catch (e) { console.error(e); } } }, 50);
}
boot();
