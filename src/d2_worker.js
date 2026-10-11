// ============================================================================
//  Web Workers: generación y mallado de chunks fuera del hilo principal
// ============================================================================
// Código que se ejecuta dentro del worker (se serializa con toString)
const WORKER_MAIN = function () {
  buildTables();
  const worlds = {};
  self.onmessage = e => {
    const m = e.data;
    try {
      if (m.t === 'gen') {
        let w = worlds[m.wid];
        if (!w) { w = worlds[m.wid] = new World(m.dim, m.seed); if (m.noStruct) w.gen.genStructures = () => { }; }
        const c = new Chunk(w, m.cx, m.cz); w.gen.generate(c);
        self.postMessage({ t: 'gen', id: m.id, wid: m.wid, cx: m.cx, cz: m.cz, blocks: c.blocks, meta: c.meta, biomes: c.biomes, loot: c.loot, spawners: c.spawners, spawns: c.spawns, top: c.top }, [c.blocks.buffer, c.meta.buffer, c.biomes.buffer]);
      } else if (m.t === 'mesh') {
        MESH_QUALITY = m.q; regB = m.regB; regM = m.regM; regH = m.H; regSC = m.regSC || null;
        if (!regS || regS.length !== regB.length) { regS = new Uint8Array(regB.length); regL = new Uint8Array(regB.length); }
        const ch = { cx: m.cx, cz: m.cz, top: m.top, biomes: m.biomes, light: null, emitters: null };
        const r = meshRegion({ dim: m.dim, H: m.H }, ch);
        const tr = [ch.light.buffer];
        for (const k of ['o', 't', 'w']) { const d = r[k]; tr.push(d.pos.buffer, d.tex.buffer, d.lit.buffer, d.idx.buffer); }
        self.postMessage({ t: 'mesh', id: m.id, wid: m.wid, cx: m.cx, cz: m.cz, ver: m.ver, mesh: r, light: ch.light, emitters: ch.emitters }, tr);
        regB = null; regM = null; regSC = null;
      }
    } catch (err) { self.postMessage({ t: 'err', id: m.id, wid: m.wid, cx: m.cx, cz: m.cz, kind: m.t, msg: String(err && err.stack || err) }); }
  };
};
const WK = { list: [], ok: false, seq: 0, worlds: new Map(), widSeq: 1 };
function initWorkers() {
  try {
    const shared = document.getElementById('mc2shared').textContent;
    const url = URL.createObjectURL(new Blob([shared + '\n;(' + WORKER_MAIN.toString() + ')();'], { type: 'text/javascript' }));
    const n = SETTINGS.threads > 0 ? clamp(SETTINGS.threads, 1, 8) : clamp((navigator.hardwareConcurrency || 4) - 1, 1, 4);
    for (let i = 0; i < n; i++) { const w = new Worker(url); w.busy = 0; w.onmessage = onWorkerMsg; w.onerror = e => { console.error('worker', e.message); WK.ok = false; }; WK.list.push(w); }
    WK.ok = true;
  } catch (e) { console.warn('Workers no disponibles, usando hilo principal', e); WK.ok = false; }
}
function worldId(w) { if (!w._wid) { w._wid = WK.widSeq++; WK.worlds.set(w._wid, w); } return w._wid; }
function wpost(msg, tr) { let best = WK.list[0]; for (const w of WK.list) if (w.busy < best.busy) best = w; best.busy++; msg.id = ++WK.seq; best.postMessage(msg, tr || []); msg._w = best; return best; }
function wkBusy() { let n = 0; for (const w of WK.list) n += w.busy; return n; }
function requestGen(w, cx, cz) {
  if (!WK.ok) { w.ensure(cx, cz); return; }
  const k = ckey(cx, cz); if (!w.genPending) w.genPending = new Set(); if (w.genPending.has(k) || w.chunks.has(k)) return;
  w.genPending.add(k); wpost({ t: 'gen', wid: worldId(w), dim: w.dim, seed: w.seed, cx, cz, noStruct: !!w.noStruct });
}
function requestMesh(w, c) {
  buildRegion(w, c);
  c.meshVer = (c.meshVer || 0) + 1; c.meshPending = true; c.dirty = false; c.urgent = false;
  const b = regB.slice(), m = regM.slice(); const sc = regSC; regSC = null;
  wpost({ t: 'mesh', wid: worldId(w), dim: w.dim, H: w.H, cx: c.cx, cz: c.cz, top: c.top, biomes: c.biomes, q: MESH_QUALITY, ver: c.meshVer, regB: b, regM: m, regSC: sc }, sc ? [b.buffer, m.buffer, sc.buffer] : [b.buffer, m.buffer]);
}
function onWorkerMsg(e) {
  const m = e.data; this.busy = Math.max(0, this.busy - 1);
  const w = WK.worlds.get(m.wid); if (!w) return;
  const k = ckey(m.cx, m.cz);
  if (m.t === 'gen') {
    w.genPending && w.genPending.delete(k);
    if (w.chunks.has(k) || w.dead) return;
    const c = new Chunk(w, m.cx, m.cz); c.blocks = m.blocks; c.meta = m.meta; c.biomes = m.biomes; c.loot = m.loot; c.spawners = m.spawners; c.spawns = m.spawns; c.top = m.top;
    w.adopt(c);
  } else if (m.t === 'mesh') {
    const c = w.chunks.get(k); if (!c || w.dead) return;
    if (m.ver !== c.meshVer) return; c.meshPending = false;
    if (R.gl && (!G.world || G.world === w || w === MENU.world)) { uploadMesh(c, m.mesh); CHUNK_STATS.acc++; }
    c.light = m.light; c.emitters = m.emitters;
  } else if (m.t === 'err') {
    console.error('Error en worker (' + m.kind + '):', m.msg);
    if (m.kind === 'gen') { w.genPending && w.genPending.delete(k); w.ensure(m.cx, m.cz); }
    else { const c = w.chunks.get(k); if (c) { c.meshPending = false; meshChunk(w, c); } }
  }
}
