// ============================================================================
//  Multijugador: anfitrión autoritativo, PeerJS (Internet) + BroadcastChannel (LAN local)
// ============================================================================
let PeerLib = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'; s.onload = () => res(window.Peer); s.onerror = () => rej(new Error('No se pudo cargar PeerJS (¿sin Internet?)')); document.head.appendChild(s); });
}
function genCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.random() * a.length | 0]; return s; }
function netSend(msg) { const n = G.net; if (!n) return; if (n.role === 'client') { try { n.conn && n.conn.send(msg); } catch (e) { } } else netBroadcast(msg); }
function netBroadcast(msg, except) { const n = G.net; if (!n || n.role !== 'host') return; for (const c of n.conns.values()) if (c !== except && c.ready) { try { c.send(msg); } catch (e) { } } }
function netSendTo(c, msg) { try { c && c.send(msg); } catch (e) { } }
// --------------------------------------------------------------------- ANFITRIÓN
async function startHost() {
  if (G.net) return G.net.code;
  const code = genCode(); const n = G.net = { role: 'host', code, conns: new Map(), peers: 0, states: G.playerStates || (G.playerStates = {}) };
  // LAN (misma máquina/navegador)
  try {
    const bc = new BroadcastChannel('mc2-lan-' + code); n.bc = bc;
    bc.onmessage = ev => { const m = ev.data; if (!m || m.to !== 'host') return; let c = n.conns.get('lan:' + m.from); if (!c) { c = { id: 'lan:' + m.from, ready: true, send: d => bc.postMessage({ to: m.from, from: 'host', d }), close() { } }; n.conns.set(c.id, c); } if (m.bye) return hostDrop(c); hostHandle(c, m.d); };
  } catch (e) { }
  // Internet (PeerJS)
  try {
    await loadPeerJS(); const peer = new Peer('mc2-' + code.toLowerCase(), { debug: 0 }); n.peer = peer;
    peer.on('connection', conn => {
      const c = { id: 'p2p:' + conn.peer, ready: false, send: d => conn.send(d), close: () => conn.close() };
      conn.on('open', () => { c.ready = true; n.conns.set(c.id, c); });
      conn.on('data', d => hostHandle(c, d)); conn.on('close', () => hostDrop(c)); conn.on('error', () => hostDrop(c));
    });
    peer.on('error', e => { chatMsg('Red: ' + (e.type || e.message), '#fa8'); });
    n.online = true;
  } catch (e) { chatMsg('Multijugador por Internet no disponible: ' + e.message + '. Puedes usar LAN local.', '#fa8'); }
  chatMsg('Mundo abierto a la red. Código: ' + code, '#8f8');
  return code;
}
function stopNet() {
  const n = G.net; if (!n) return;
  try { if (n.role === 'host') { netBroadcast({ t: 'kick', m: 'El anfitrión cerró el mundo' }); n.bc && n.bc.close(); n.peer && n.peer.destroy(); } else { if (n.lanBye) n.lanBye(); n.conn && n.conn.close && n.conn.close(); n.peer && n.peer.destroy(); } } catch (e) { }
  G.net = null;
}
function hostDrop(c) {
  const n = G.net; if (!n || !n.conns.has(c.id)) return; n.conns.delete(c.id);
  const e = c.ent; if (e) { n.states[e.name] = e.state || n.states[e.name]; G.entities.delete(e.id); chatMsg(e.name + ' salió del juego', '#ff8'); netBroadcast({ t: 'chat', m: e.name + ' salió del juego', sys: true }); }
  n.peers = n.conns.size;
}
function playerState(p) { return { x: p.x, y: p.y, z: p.z, dim: p.dim, hp: p.hp, food: p.food, sat: p.sat, inv: p.inv, armor: p.armor, off: p.offhand, ender: p.ender, spawn: p.spawn, sel: p.sel, gm: p.gameModeOwn || null, xp: p.xp, yaw: p.yaw, pitch: p.pitch }; }
function modifiedChunks() {
  const out = [];
  for (const dim in G.worlds) { const w = G.worlds[dim]; for (const c of w.chunks.values()) if (c.modified) out.push({ d: dim, k: ckey(c.cx, c.cz), b: rleEncode(c.blocks), m: rleEncode(c.meta) }); for (const k in w.saved) out.push({ d: dim, k: +k, b: w.saved[k].b, m: w.saved[k].m }); }
  return out;
}
function hostHandle(c, m) {
  const n = G.net; if (!n) return; const w = m.d ? G.worlds[m.d] : null;
  switch (m.t) {
    case 'hello': {
      if (!n.conns.has(c.id)) n.conns.set(c.id, c);
      let name = (m.name || 'Jugador').slice(0, 16); if (name === G.player.name || [...n.conns.values()].some(o => o !== c && o.ent && o.ent.name === name)) name += '_' + (Math.random() * 99 | 0);
      const st = n.states[name]; const sp = G.worldSpawn;
      const e = new Entity('player', st ? st.dim : 'overworld', st ? st.x : sp.x, st ? st.y : sp.y, st ? st.z : sp.z); e.remotePlayer = true; e.conn = c; e.name = name; e.state = st; e.armor = []; e.w = 0.6; e.h = 1.8; e.hp = 20;
      G.entities.set(e.id, e); c.ent = e; n.peers = n.conns.size;
      c.send({ t: 'welcome', id: e.id, name, seed: G.seed, seedStr: G.seedStr, worldName: G.worldName, gm: G.gameMode, time: G.time, diff: G.difficulty, dk: G.dragonKilled, ei: G.endInit, gw: G.gateway, st: st || null, spawn: sp, hostName: G.player.name, hostId: G.player.id, keep: G.keepInventory });
      const chunks = modifiedChunks(); for (let i = 0; i < chunks.length; i += 8) c.send({ t: 'chunks', list: chunks.slice(i, i + 8) });
      c.send({ t: 'ready' });
      chatMsg(name + ' se unió al juego', '#ff8'); netBroadcast({ t: 'chat', m: name + ' se unió al juego', sys: true }, c);
      break;
    }
    case 'p': { const e = c.ent; if (!e) return; e.px = e.x; e.py = e.y; e.pz = e.z; e.x = m.x; e.y = m.y; e.z = m.z; e.yaw = m.yw; e.pitch = m.pt; e.dim = m.dim; e.sneaking = m.sn; e.heldItem = m.h; e.armor = (m.ar || []).map(id => id ? { id } : null); e.hp = m.hp; e.creative = m.cr; e.spectator = m.sp; e.dead = m.dead; e.swing = m.sw; const hd = Math.hypot(e.x - e.px, e.z - e.pz); e.walk = (e.walk || 0) + hd; e.walkAmt = Math.min(1, hd * 5); e.gliding = m.gl; break; }
    case 'sb': { if (!w) return; w.ensure(m.x >> 4, m.z >> 4); w.set(m.x, m.y, m.z, m.id, m.m); break; }
    case 'drop': { const e = dropItem(m.d, m.x, m.y, m.z, m.s, m.vx, m.vy, m.vz, 40); break; }
    case 'proj': { const p = shoot(m.ty, m.d, m.x, m.y, m.z, m.vx, m.vy, m.vz, c.ent, m.ex); break; }
    case 'atk': { let t = G.entities.get(m.id); if (m.id === G.player.id) t = G.player; if (t) hurtEntity(t, m.a, c.ent, m.kx || 0, m.ky || 0, m.kz || 0); break; }
    case 'co': { if (!w) return; const [x, y, z] = m.k.split(':')[1].split(',').map(Number); const cont = getContainer(w, m.k, m.kind, x, y, z); c.send({ t: 'cd', k: m.k, c: cont, kind: m.kind, b: m.b }); break; }
    case 'cu': { const cur = G.containers[m.k]; if (cur) { cur.items = m.c.items; } else G.containers[m.k] = m.c; break; }
    case 'chat': { const txt = m.sys ? m.m : '<' + (c.ent ? c.ent.name : '?') + '> ' + m.m; chatMsg(txt, m.sys ? '#ff8' : null); netBroadcast({ t: 'chat', m: txt, sys: m.sys }); break; }
    case 'st': { if (c.ent) { c.ent.state = m.s; n.states[c.ent.name] = m.s; } break; }
    case 'tnt': { if (!w) return; igniteTNT(w, m.x, m.y, m.z); break; }
    case 'boom': { if (!w) return; explode(w, m.x, m.y, m.z, m.p, true, null); break; }
    case 'summon': { spawnMob(m.ty, m.d, m.x, m.y, m.z); break; }
    case 'gm': { if (c.ent) c.ent.creative = m.m === 'creative' || m.m === 'spectator'; break; }
    case 'sleep': { const t = G.time % 24000; if (t >= 12542) { G.time = Math.ceil(G.time / 24000) * 24000; netBroadcast({ t: 'time', v: G.time }); chatMsg((c.ent ? c.ent.name : '') + ' durmió hasta el amanecer', '#ccc'); } break; }
  }
}
let netTimer = 0;
function hostNetTick() {
  const n = G.net; if (!n || n.role !== 'host') return;
  if (NETBATCH.length) { netBroadcast({ t: 'bb', l: NETBATCH.splice(0) }); }
  // jugadores
  const pl = [{ i: G.player.id, n: G.player.name, x: G.player.x, y: G.player.y, z: G.player.z, yw: G.player.yaw, pt: G.player.pitch, d: G.player.dim, sn: G.player.sneaking, h: G.player.held() ? G.player.held().id : 0, ar: G.player.armor.map(a => a ? a.id : 0), dead: G.player.dead, sp: G.gameMode === 'spectator', gl: G.player.gliding, sw: G.player.swing }];
  for (const c of n.conns.values()) { const e = c.ent; if (e) pl.push({ i: e.id, n: e.name, x: e.x, y: e.y, z: e.z, yw: e.yaw, pt: e.pitch, d: e.dim, sn: e.sneaking, h: e.heldItem || 0, ar: (e.armor || []).map(a => a ? a.id : 0), dead: e.dead, sp: e.spectator, gl: e.gliding, sw: e.swing }); }
  netBroadcast({ t: 'ps', l: pl });
  if (G.tick % 2 === 0) for (const c of n.conns.values()) {
    const p = c.ent; if (!p) continue; const list = [];
    for (const e of G.entities.values()) {
      if (e.dim !== p.dim || e.remotePlayer || e.removed) continue; if (Math.abs(e.x - p.x) > 96 || Math.abs(e.z - p.z) > 96) continue;
      const o = { i: e.id, ty: e.type, x: +e.x.toFixed(2), y: +e.y.toFixed(2), z: +e.z.toFixed(2), yw: +e.yaw.toFixed(2) };
      if (e instanceof Mob) { o.hp = e.hp; o.mh = e.maxHp; o.ht = e.hurtTime; o.f = e.fuse; o.op = e.open; o.dt = e.deathTime; if (e.color) o.c = e.color; o.tg = e.target ? 1 : 0; if (e.laserT) o.lt = e.laserT.id; o.sw = e.swing; }
      else if (e.type === 'item') o.s = e.stack; else if (e.type === 'falling_block') o.b = e.block; else if (e.type === 'tnt') o.fu = e.fuse; else { o.vx = e.vx; o.vy = e.vy; o.vz = e.vz; o.st = e.stuck; o.pt = e.pitch; }
      list.push(o);
    }
    c.send({ t: 'es', d: p.dim, l: list });
  }
  if (G.tick % 100 === 0) netBroadcast({ t: 'time', v: G.time, r: G.rain });
}
// --------------------------------------------------------------------- CLIENTE
function joinGame(code, lan, name) {
  code = code.trim().toUpperCase(); return new Promise(async (resolve, reject) => {
    const n = G.net = { role: 'client', code, peers: 0, pending: [] };
    const onData = d => clientHandle(d, resolve, reject);
    let timeout = setTimeout(() => reject(new Error('Tiempo de espera agotado. ¿Código correcto? ¿El anfitrión abrió el mundo a la red?')), 20000); n.clearTO = () => clearTimeout(timeout);
    if (lan) {
      const bc = new BroadcastChannel('mc2-lan-' + code); const me = Math.random().toString(36).slice(2);
      n.conn = { send: d => bc.postMessage({ to: 'host', from: me, d }), close: () => bc.close() }; n.lanBye = () => bc.postMessage({ to: 'host', from: me, bye: true });
      bc.onmessage = ev => { if (ev.data && ev.data.to === me) onData(ev.data.d); };
      n.conn.send({ t: 'hello', name });
    } else {
      try { await loadPeerJS(); } catch (e) { reject(e); return; }
      const peer = new Peer({ debug: 0 }); n.peer = peer;
      peer.on('open', () => { const conn = peer.connect('mc2-' + code.toLowerCase(), { reliable: true }); n.conn = conn; conn.on('open', () => conn.send({ t: 'hello', name })); conn.on('data', onData); conn.on('close', () => { if (G.net === n) { G.net = null; disconnected('Conexión perdida con el anfitrión'); } }); conn.on('error', e => reject(e)); });
      peer.on('error', e => reject(new Error(e.type === 'peer-unavailable' ? 'No existe un mundo con ese código.' : (e.message || e.type))));
    }
  });
}
function clientHandle(m, resolve, reject) {
  const n = G.net; if (!n) return;
  switch (m.t) {
    case 'welcome': n.welcome = m; n.chunks = []; break;
    case 'chunks': for (const c of m.list) (n.chunks || (n.chunks = [])).push(c); if (G.worlds) for (const c of m.list) applyNetChunk(c); break;
    case 'ready': n.clearTO && n.clearTO(); resolve && resolve(n.welcome); break;
    case 'bb': { G.applyingNet = true; for (const [d, x, y, z, id, meta] of m.l) { const w = G.worlds && G.worlds[d]; if (!w) continue; if (w.chunk(x >> 4, z >> 4)) w.set(x, y, z, id, meta); else { const k = ckey(x >> 4, z >> 4); const c = w.ensure(x >> 4, z >> 4); c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)] = id; c.meta[(x & 15) | ((z & 15) << 4) | (y << 8)] = meta; c.modified = true; } } G.applyingNet = false; break; }
    case 'ps': updateProxyPlayers(m.l); break;
    case 'es': updateProxyEntities(m.d, m.l); break;
    case 'hurt': if (G.player) G.player.damage(m.a, m.c || 'mob', null, m.kx, m.ky, m.kz); break;
    case 'give': if (G.player) { const left = giveItem(G.player, m.s); playSound('pop', G.player.x, G.player.y, G.player.z, 0.4); if (left > 0) netSend({ t: 'drop', d: G.player.dim, x: G.player.x, y: G.player.y + 1, z: G.player.z, s: { ...m.s, c: left } }); } break;
    case 'tp': if (G.player) { G.player.x = m.x; G.player.y = m.y; G.player.z = m.z; G.player.vy = 0; G.player.fallDist = 0; } break;
    case 'time': G.time = m.v; if (m.r !== undefined) G.rain = m.r; break;
    case 'chat': chatMsg(m.m, m.sys ? '#ff8' : null); break;
    case 'cd': if (UI.pendingKey === m.k) { UI.pendingKey = null; openScreen(m.kind, { c: m.c, key: m.k, block: m.b, title: REG[m.b].disp }); } break;
    case 'fx': if (m.k === 'boom') explosionFX(m.d, m.x, m.y, m.z, m.p); break;
    case 'kick': G.net = null; disconnected(m.m); break;
  }
}
function applyNetChunk(c) { const w = G.worlds[c.d]; if (!w) return; const ex = w.chunks.get(c.k); if (ex) { ex.blocks = rleDecode(c.b, 256 * w.H, true); ex.meta = rleDecode(c.m, 256 * w.H); ex.modified = true; ex.calcTop(); ex.dirty = true; ex.urgent = true; } else w.saved[c.k] = { b: c.b, m: c.m }; }
function updateProxyPlayers(list) {
  const seen = new Set();
  for (const o of list) {
    if (o.i === G.myNetId) continue; const key = 'pl' + o.i; seen.add(key);
    let e = G.entities.get(key); if (!e) { e = new Entity('player', o.d, o.x, o.y, o.z); e.proxy = true; e.hostId = o.i; e.name = o.n; e.w = 0.6; e.h = 1.8; G.entities.set(key, e); e.id = key; }
    e.tx = o.x; e.ty = o.y; e.tz = o.z; e.dim = o.d; e.yaw = o.yw; e.pitch = o.pt; e.sneaking = o.sn; e.heldItem = o.h || null; e.armor = (o.ar || []).map(id => id ? { id } : null); e.dead = o.dead; e.spectator = o.sp; e.gliding = o.gl; e.swing = o.sw;
  }
  for (const [k, e] of G.entities) if (e.proxy && e.type === 'player' && !seen.has(k)) G.entities.delete(k);
}
function updateProxyEntities(dim, list) {
  const seen = new Set();
  for (const o of list) {
    const key = 'e' + o.i; seen.add(key); let e = G.entities.get(key);
    if (!e) {
      if (MOB[o.ty]) e = new Mob(o.ty, dim, o.x, o.y, o.z); else if (o.ty === 'item') e = new ItemEnt(dim, o.x, o.y, o.z, o.s); else { e = new Projectile(o.ty, dim, o.x, o.y, o.z, o.vx || 0, o.vy || 0, o.vz || 0, null); }
      e.proxy = true; e.hostId = o.i; e.id = key; G.entities.set(key, e); e.x = o.x; e.y = o.y; e.z = o.z;
    }
    e.tx = o.x; e.ty = o.y; e.tz = o.z; e.yaw = o.yw; e.dim = dim;
    if (e instanceof Mob) { e.hp = o.hp; e.hurtTime = o.ht; e.fuse = o.f; e.open = o.op; e.deathTime = o.dt; e.dead = o.dt > 0; if (o.c) e.color = o.c; e.target = o.tg ? G.player : null; e.laser = o.lt ? 1 : 0; e.laserT = o.lt ? (o.lt === G.myNetId ? G.player : G.entities.get('pl' + o.lt)) : null; e.swing = o.sw; }
    else if (e.type === 'item') e.stack = o.s; else if (o.b) e.block = o.b; if (o.fu !== undefined) e.fuse = o.fu; if (o.pt !== undefined) e.pitch = o.pt;
  }
  for (const [k, e] of G.entities) if (e.proxy && e.type !== 'player' && e.dim === dim && !seen.has(k)) G.entities.delete(k);
}
function clientNetTick() {
  const n = G.net; if (!n || n.role !== 'client' || !G.player) return; const p = G.player;
  netSend({ t: 'p', x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), yw: +p.yaw.toFixed(3), pt: +p.pitch.toFixed(3), dim: p.dim, sn: p.sneaking, h: p.held() ? p.held().id : 0, ar: p.armor.map(a => a ? a.id : 0), hp: p.hp, cr: G.gameMode === 'creative', sp: G.gameMode === 'spectator', dead: p.dead, sw: p.swing, gl: p.gliding });
  if (G.tick % 100 === 0) netSend({ t: 'st', s: playerState(p) });
}
function smoothProxies(dt) { for (const e of G.entities.values()) { if (!e.proxy) continue; if (e.tx === undefined) continue; const k = Math.min(1, dt * 12); const ox = e.x, oz = e.z; e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.z += (e.tz - e.z) * k; e.px = e.x; e.py = e.y; e.pz = e.z; e.pyaw = e.yaw; if (e.type !== 'player') { const hd = Math.hypot(e.x - ox, e.z - oz); e.walk += hd * 1.5; e.walkAmt = lerp(e.walkAmt, Math.min(1, hd / dt / 3), 0.2); } else { const hd = Math.hypot(e.x - ox, e.z - oz); e.walk += hd; e.walkAmt = lerp(e.walkAmt || 0, Math.min(1, hd / Math.max(dt, 0.001) / 4), 0.2); } } }
