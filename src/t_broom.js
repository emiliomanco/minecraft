// ============================================================================
//  Escoba: con el clic derecho mantenido se barre de lado a lado delante del jugador.
//  Empuja todo lo que tiene física (partículas del fluido, ragdolls, escombros, objetos,
//  mobs y botes) pero solo a la altura del jugador: desde el suelo que pisa hasta la cabeza.
//  Lo que está un bloque más abajo no se toca.
// ============================================================================
const BROOM = { t: 0, ph: 0, head: [0, 0, 0], v: [0, 0, 0], active: false };
const BROOM_REACH = 1.5, BROOM_R = 0.55;
// llamado cada cuadro mientras se mantiene el clic derecho con la escoba
function broomUse(p) {
  const now = performance.now(); const dt = BROOM.active ? clamp((now - BROOM.t) / 1000, 0, 0.1) : 1 / 60;
  BROOM.t = now; BROOM.active = true; BROOM.ph += dt * 7.5;
  const sw = Math.sin(BROOM.ph) * 0.95, swd = Math.cos(BROOM.ph) * 0.95 * 7.5; // ángulo del barrido y su velocidad angular
  const a = p.yaw + sw; const dx = -Math.sin(a), dz = -Math.cos(a); // dirección de la cabeza de la escoba
  const tx = -Math.cos(a), tz = Math.sin(a); // tangente del arco (sentido de ángulo creciente)
  const base = Math.floor(p.y + 0.01);
  BROOM.head[0] = p.x + dx * BROOM_REACH; BROOM.head[1] = base + 0.35; BROOM.head[2] = p.z + dz * BROOM_REACH;
  // la cabeza se mueve por el arco y además empuja hacia fuera (lejos del jugador)
  const vt = swd * BROOM_REACH; BROOM.v[0] = tx * vt + dx * 2.5; BROOM.v[1] = 0.6; BROOM.v[2] = tz * vt + dz * 2.5;
  if (!p._brSnd || now - p._brSnd > 260 && Math.abs(Math.cos(BROOM.ph)) > 0.9) { p._brSnd = now; playSound('step', BROOM.head[0], BROOM.head[1], BROOM.head[2], 0.5, ID.sand); }
  p.swing = Math.max(p.swing || 0, 0.01);
  broomPush(p, base, dt);
}
function broomActive() { return BROOM.active && performance.now() - BROOM.t < 120; }
// ¿esta altura (pies de la cosa) está al nivel del jugador?
function broomLevel(y, base, p) { return y >= base - 0.05 && y < p.y + 1.8; }
// ¿punto dentro de la zona barrida (cerca de la cabeza de la escoba, delante del jugador)?
function broomHit(x, z, p) {
  const hx = BROOM.head[0], hz = BROOM.head[2]; const d = Math.hypot(x - hx, z - hz); if (d > BROOM_R + 0.6) return 0;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); const rx = x - p.x, rz = z - p.z; const rl = Math.hypot(rx, rz) || 1;
  if ((rx * fx + rz * fz) / rl < -0.2) return 0; // detrás del jugador no
  return clamp(1 - d / (BROOM_R + 0.6), 0, 1);
}
function broomPush(p, base, dt) {
  const V = BROOM.v; const k = 20;
  // entidades (mobs, objetos tirados, botes): un empujón en la dirección del barrido
  for (const e of G.entities.values()) {
    if (e.removed || e.dead || e === p || e.dim !== p.dim || e instanceof Projectile) continue;
    if (e.ragdoll) continue; // el ragdoll se empuja por sus cuerpos
    if (!broomLevel(e.y, base, p)) continue; const f = broomHit(e.x, e.z, p); if (!f) continue;
    const m = e.type === 'item' ? 1 : e.boat ? 0.5 : (e instanceof Mob ? 0.35 : 0.5);
    e.vx = (e.vx || 0) + (V[0] - (e.vx || 0)) * Math.min(1, k * f * m * dt); e.vz = (e.vz || 0) + (V[2] - (e.vz || 0)) * Math.min(1, k * f * m * dt);
    if (e.type === 'item') { e.onGround = false; e.vy = Math.max(e.vy || 0, 1.6 * f); }
    if (e.boat) { e.wy = (e.wy || 0) + (V[0] * (e.z - p.z) - V[2] * (e.x - p.x)) * 0.02 * f; }
  }
  // ragdolls: se desplaza el punto anterior de cada cuerpo (verlet) → ganan velocidad
  if (typeof RAG !== 'undefined') for (const rd of RAG.list) {
    if (rd.dim !== p.dim) continue; let touched = false;
    for (const b of rd.bodies) for (let i = 0; i < 4; i++) {
      const x = b.p[i * 3], y = b.p[i * 3 + 1], z = b.p[i * 3 + 2]; if (!broomLevel(y, base, p) || y > base + 1.2) continue; const f = broomHit(x, z, p); if (!f) continue;
      const s = f * 4 * dt / 60; b.q[i * 3] -= V[0] * s; b.q[i * 3 + 1] -= 0.5 * s; b.q[i * 3 + 2] -= V[2] * s; touched = true; // Δv = V·f·4·dt
    }
    if (touched) { rd.sleep = 0; rd.still = 0; }
  }
  // escombros de explosiones (bloques que vuelan o ya en el suelo)
  if (typeof DEB !== 'undefined') for (const e of DEB.list) {
    if (e.dim !== p.dim || !broomLevel(e.y - 0.4, base, p)) continue; const f = broomHit(e.x, e.z, p); if (!f) continue;
    e.vx += (V[0] - e.vx) * Math.min(1, 3 * f * dt); e.vz += (V[2] - e.vz) * Math.min(1, 3 * f * dt); e.rest = 0; e.onGround = false; if (e.vy < 0.5) e.vy = 0.8 * f;
  }
  // nieve suelta (bolas y fragmentos) usa los escombros; el fluido continuo usa el colisionador de flEntities
}
// colisionadores de la escoba para el fluido continuo (dos esferas aplastadas a lo largo de la cabeza)
function broomColliders(add) {
  if (!broomActive()) return; const p = G.player; const a = p.yaw + Math.sin(BROOM.ph) * 0.95;
  const tx = -Math.cos(a), tz = Math.sin(a);
  for (const s of [-0.35, 0.35]) add({ x: BROOM.head[0] + tx * s, y: BROOM.head[1] - 0.15, z: BROOM.head[2] + tz * s, vx: BROOM.v[0], vy: BROOM.v[1], vz: BROOM.v[2] }, 0.42, 0.12);
}
