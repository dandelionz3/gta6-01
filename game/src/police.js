import * as THREE from 'three';
import { person, animatePerson } from './world.js';
import { clamp, distance, RULES } from './config.js';
export function createPolice(game) {
  const cops = [], cruisers = [];
  let spawnClock = 0, arrest = 0, hidden = 0;
  function clearSight(a, b) {
    const length = distance(a, b), steps = Math.ceil(length / 5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (game.world.blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0)) return false;
    }
    return true;
  }
  function witness() {
    return cops.some(c => c.health > 0 && distance(c, game.player) < 65 && clearSight(c, game.player)) || cruisers.some(c => distance(c, game.player) < 75 && clearSight(c, game.player));
  }
  function addCop(x, z) {
    const mesh = person(0x344e79, true); mesh.position.set(x, 0, z); game.scene.add(mesh);
    const cop = { x, z, mesh, health: 70, cooldown: 1 }; cops.push(cop); return cop;
  }
  function addCruiser(x, z, angle = 0) {
    const c = game.vehicles.spawn('police', x, z, angle, 0x24334a, 'police'); cruisers.push(c); return c;
  }
  // Visible patrols make a witnessed theft possible before the first pursuit.
  addCop(-11, 18); addCop(75, -64); addCop(-117, 128);
  function crime(amount) {
    if (game.mode !== 'play') return;
    game.wanted = clamp(game.wanted + amount, 0, 5); hidden = 0;
    game.lastCrime = game.time;
    game.traffic?.frighten();
  }
  function chaseCar(c, dt) {
    if (c.health <= 0) { c.speed *= 0.95; return; }
    const target = game.player;
    const desired = Math.atan2(target.x - c.x, target.z - c.z);
    let delta = Math.atan2(Math.sin(desired - c.angle), Math.cos(desired - c.angle));
    c.angle += clamp(delta, -dt * 1.5, dt * 1.5);
    const d = distance(c, target);
    c.speed += ((d < 6 ? 7 : 22 + game.wanted * 2) - c.speed) * dt;
    const nx = c.x + Math.sin(c.angle) * c.speed * dt;
    const nz = c.z + Math.cos(c.angle) * c.speed * dt;
    if (!game.world.blocked(nx, nz, 1.3)) { c.x = nx; c.z = nz; }
    else {
      c.speed = -5; c.angle += dt * 2.5;
      // Route around rectangular blocks by selecting the closest road junction.
      const roadX = Math.round(c.x / 64) * 64, roadZ = Math.round(c.z / 64) * 64;
      const roadAngle = Math.atan2(roadX - c.x, roadZ - c.z);
      c.angle = roadAngle;
    }
    if (d < 4.8 && game.car) {
      game.car.health -= dt * (8 + game.wanted * 2); game.damage(dt * 2);
      game.car.speed *= Math.pow(0.55, dt);
    }
  }
  function update(dt) {
    spawnClock -= dt;
    if (game.wanted >= 1 && spawnClock <= 0) {
      spawnClock = 5;
      const a = game.rng() * Math.PI * 2;
      let x = game.player.x + Math.sin(a) * 75, z = game.player.z + Math.cos(a) * 75;
      x = clamp(Math.round(x / 64) * 64 + 4, -196, 196);
      z = clamp(z, -205, 205);
      if (game.world.blocked(x, z, 2)) z = Math.round(z / 64) * 64;
      const active = cops.filter(c => c.health > 0);
      if (active.length < 4 + Math.ceil(game.wanted)) addCop(x + 7, z);
      if (game.wanted >= 2 && cruisers.length < Math.ceil(game.wanted) + 2) addCruiser(x, z);
      else if (cruisers.length) {
        const far = cruisers.find(c => distance(c, game.player) > 180);
        if (far) { far.x = x; far.z = z; far.health = 100; }
      }
    }
    const pursuing = game.wanted > 0;
    let seen = false;
    for (const c of cops) {
      if (c.health <= 0) { c.mesh.rotation.z = Math.PI / 2; c.mesh.position.y = 0.2; continue; }
      const d = distance(c, game.player);
      const sight = d < RULES.policeSight && clearSight(c, game.player);
      if (pursuing && sight) seen = true;
      if (pursuing && d < 180) {
        const angle = Math.atan2(game.player.x - c.x, game.player.z - c.z);
        const speed = game.car ? 4.8 : 5.8;
        const nx = c.x + Math.sin(angle) * speed * dt, nz = c.z + Math.cos(angle) * speed * dt;
        if (!game.world.blocked(nx, c.z)) c.x = nx;
        if (!game.world.blocked(c.x, nz)) c.z = nz;
        c.mesh.rotation.y = angle; animatePerson(c.mesh, game.time, 1);
        if (d < 1.65 && !game.car) arrest += dt;
        c.cooldown -= dt;
        if (game.wanted >= 3 && d < 35 && sight && c.cooldown <= 0) {
          c.cooldown = 1.4; game.combat.enemyFire(c, 5);
        }
      }
      c.mesh.position.x = c.x; c.mesh.position.z = c.z;
    }
    for (const c of cruisers) if (pursuing) {
      chaseCar(c, dt);
      if (distance(c, game.player) < 95 && clearSight(c, game.player)) seen = true;
    } else c.speed *= Math.pow(0.2, dt);
    if (!cops.some(c => c.health > 0 && distance(c, game.player) < 1.65) || game.car) arrest = Math.max(0, arrest - dt * 2);
    if (arrest > 2.2 && !game.god) game.end('busted');
    if (pursuing) {
      hidden = seen ? 0 : hidden + dt;
      if (hidden > RULES.forget) { game.wanted = Math.max(0, Math.ceil(game.wanted) - 1); hidden = 0; if (!game.wanted) game.toast('Pursuit lost. Keep a low profile.'); }
    } else hidden = 0;
    game.policeSeen = seen; game.escapeProgress = hidden / RULES.forget; game.arrestProgress = arrest / 2.2;
  }
  return { cops, cruisers, update, crime, witness, clearSight, addCop, addCruiser, reset() { arrest = 0; hidden = 0; for (const c of cruisers) { c.x = -192; c.z = -192; } } };
}
