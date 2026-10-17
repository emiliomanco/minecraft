// ============================================================================
//  Escoba: con el clic derecho mantenido se empuja hacia adelante, lejos del jugador.
//  Empuja todo lo que tiene física (partículas del fluido, ragdolls, escombros, objetos,
//  mobs y botes) pero solo a la altura del jugador: desde el suelo que pisa hasta la cabeza.
//  Lo que está un bloque más abajo no se toca.
// ============================================================================
const BROOM = { t: 0, ph: 0, head: [0, 0, 0], v: [0, 0, 0], active: false };
const BROOM_REACH = 1.5, BROOM_R = 0.55;
// llamado cada cuadro mientras se mantiene el clic derecho con la escoba
function broomUse(p) {
  const now = performance.now(); const dt = BROOM.active ? clamp((now - BROOM.t) / 1000, 0, 0.1) : 1 / 60;
  BROOM.t = now; BROOM.active = true; BROOM.ph += dt * 2.2; // escobazos hacia adelante (la cabeza avanza y vuelve)
  const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw); // siempre hacia donde mira el jugador
  const base = Math.floor(p.y + 0.01); const st = BROOM.ph % 1; const reach = 0.7 + st * 1.1;
  BROOM.dir = [dx, dz]; BROOM.reach = reach;
  BROOM.head[0] = p.x + dx * reach; BROOM.head[1] = base + 0.35; BROOM.head[2] = p.z + dz * reach;
  BROOM.v[0] = dx * 5; BROOM.v[1] = 0.6; BROOM.v[2] = dz * 5; // empuje hacia adelante, nunca de lado
  if (st < dt * 2.2 + 0.001) playSound('step', BROOM.head[0], BROOM.head[1], BROOM.head[2], 0.5, ID.sand);
  p.swing = Math.max(p.swing || 0, 0.01);
  broomPush(p, base, dt);
  // en multijugador las entidades las simula el anfitrión: se le manda el barrido (unas 20 veces por segundo)
  if (G.net && G.net.role === 'client' && now - (BROOM.sent || 0) > 50) { BROOM.sent = now; netSend({ t: 'brm', h: BROOM.head.map(v => +v.toFixed(2)), v: BROOM.v.map(v => +v.toFixed(2)), dt: 0.05 }); }
}
function broomActive() { return BROOM.active && performance.now() - BROOM.t < 120; }
// ¿esta altura (pies de la cosa) está al nivel del jugador?
function broomLevel(y, base, p) { return y >= base - 0.05 && y < p.y + 1.8; }
// ¿punto dentro de la zona barrida (cerca de la cabeza de la escoba, delante del jugador)?
function broomHit(x, z, p, B = BROOM) {
  // franja delante del jugador (de 0,2 bloques hasta la cabeza de la escoba + 0,7) y 0,9 a cada lado
  const vl = Math.hypot(B.v[0], B.v[2]) || 1; const fx = B.v[0] / vl, fz = B.v[2] / vl;
  const rx = x - p.x, rz = z - p.z; const f = rx * fx + rz * fz, l = Math.abs(rx * fz - rz * fx);
  const far = Math.hypot(B.head[0] - p.x, B.head[2] - p.z) + 0.7;
  if (f < 0.2 || f > far || l > 0.9) return 0;
  return clamp(1 - l / 0.9 * 0.5, 0, 1);
}
function broomPush(p, base, dt, B = BROOM) {
  const V = B.v; const k = 20;
  // entidades (mobs, objetos tirados, botes): un empujón en la dirección del barrido
  for (const e of G.entities.values()) {
    if (e.removed || e.dead || e === p || e.dim !== p.dim || e instanceof Projectile) continue;
    if (e.ragdoll) continue; // el ragdoll se empuja por sus cuerpos
    if (!broomLevel(e.y, base, p)) continue; const f = broomHit(e.x, e.z, p, B); if (!f) continue;
    const m = e.type === 'item' ? 1 : e.isBoat ? 0.5 : (e instanceof Mob ? 0.35 : 0.5);
    e.vx = (e.vx || 0) + (V[0] - (e.vx || 0)) * Math.min(1, k * f * m * dt); e.vz = (e.vz || 0) + (V[2] - (e.vz || 0)) * Math.min(1, k * f * m * dt);
    if (e.type === 'item') { e.onGround = false; e.vy = Math.max(e.vy || 0, 1.6 * f); }
  }
  // ragdolls: se desplaza el punto anterior de cada cuerpo (verlet) → ganan velocidad
  if (typeof RAG !== 'undefined') for (const rd of RAG.list) {
    if (rd.dim !== p.dim) continue; let touched = false;
    for (const b of rd.bodies) for (let i = 0; i < 4; i++) {
      const x = b.p[i * 3], y = b.p[i * 3 + 1], z = b.p[i * 3 + 2]; if (!broomLevel(y, base, p) || y > base + 1.2) continue; const f = broomHit(x, z, p, B); if (!f) continue;
      const s = f * 4 * dt / 60; b.q[i * 3] -= V[0] * s; b.q[i * 3 + 1] -= 0.5 * s; b.q[i * 3 + 2] -= V[2] * s; touched = true; // Δv = V·f·4·dt
    }
    if (touched) { rd.sleep = 0; rd.still = 0; }
  }
  // escombros de explosiones (bloques que vuelan o ya en el suelo)
  if (typeof DEB !== 'undefined') for (const e of DEB.list) {
    if (e.dim !== p.dim || !broomLevel(e.y - 0.4, base, p)) continue; const f = broomHit(e.x, e.z, p, B); if (!f) continue;
    e.vx += (V[0] - e.vx) * Math.min(1, 3 * f * dt); e.vz += (V[2] - e.vz) * Math.min(1, 3 * f * dt); e.rest = 0; e.onGround = false; if (e.vy < 0.5) e.vy = 0.8 * f;
  }
  // nieve suelta (bolas y fragmentos) usa los escombros; el fluido continuo usa el colisionador de flEntities
}
// colisionadores de la escoba para el fluido continuo (dos esferas aplastadas a lo largo de la cabeza)
function broomColliders(add) {
  if (!broomActive()) return; const [dx, dz] = BROOM.dir || [0, -1]; const tx = -dz, tz = dx; // a lo ancho de la cabeza
  for (const s of [-0.5, 0, 0.5]) add({ x: BROOM.head[0] + tx * s, y: BROOM.head[1] - 0.15, z: BROOM.head[2] + tz * s, vx: BROOM.v[0], vy: BROOM.v[1], vz: BROOM.v[2] }, 0.36, 0.12);
}
