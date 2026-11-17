import * as THREE from 'three';
import { box } from './world.js';
import { distance, clamp } from './config.js';
export function createCombat(game) {
  const enemies = [], pickups = [], effects = [];
  let shotCooldown = 0, fistCooldown = 0;
  const raycaster = new THREE.Raycaster();
  function pickup(kind, x, z) {
    const mesh = new THREE.Group();
    if (kind === 'health') {
      box(mesh, 0xf0f1d7, 0, 0, 0, 0.9, 0.7, 0.6);
      box(mesh, 0xf57772, 0, 0, 0.32, 0.5, 0.16, 0.04); box(mesh, 0xf57772, 0, 0, 0.33, 0.16, 0.5, 0.04);
    } else { box(mesh, 0xe7c56f, 0, 0, 0, 0.8, 0.5, 0.5); box(mesh, 0x354b4f, 0, 0.3, 0, 0.5, 0.12, 0.3); }
    mesh.position.set(x, 1, z); game.scene.add(mesh); pickups.push({ kind, x, z, mesh, cooldown: 0 });
  }
  pickup('health', -10, 20); pickup('ammo', 11, 30); pickup('health', 128, -110);
  pickup('ammo', 110, -128); pickup('health', 12, 195); pickup('ammo', -128, 15);
  pickup('health', -64, -76); pickup('ammo', 64, 76);
  function tracer(from, to, color = 0xffe0a2) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    game.scene.add(line); effects.push({ mesh: line, life: 0.1 });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 4), new THREE.MeshBasicMaterial({ color }));
    flash.position.copy(from); game.scene.add(flash); effects.push({ mesh: flash, life: 0.07 });
  }
  function hurt(target, amount) {
    const alive = target.health > 0; target.health -= amount;
    if (alive && target.health <= 0) {
      game.stats.kills++;
      if (enemies.includes(target)) { game.cash += 50; pickup(game.rng() > 0.5 ? 'ammo' : 'health', target.x, target.z); }
      else game.crime(1);
    }
  }
  function targets() { return [...game.traffic.pedestrians, ...game.police.cops, ...enemies].filter(t => t.health > 0); }
  function shoot() {
    if (shotCooldown > 0 || game.car) return;
    if (game.ammo <= 0) { game.toast('Out of ammo · look for gold ammo boxes'); return; }
    shotCooldown = 0.24; game.ammo--; game.audio.gun(); game.traffic.frighten();
    if (game.police.witness()) game.crime(0.35);
    raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);
    const origin = new THREE.Vector3(game.player.x, 1.45 + game.player.y, game.player.z);
    const aim = raycaster.ray.at(100, new THREE.Vector3());
    let hit = null, best = Infinity;
    // Aim assists within a small center cone, while walls still stop the shot.
    for (const t of targets()) {
      const p = new THREE.Vector3(t.x, 1.1, t.z);
      const projected = p.clone().project(game.camera);
      const d = origin.distanceTo(p);
      if (Math.abs(projected.x) < 0.1 && Math.abs(projected.y) < 0.19 && projected.z < 1 && d < best && game.police.clearSight(game.player, t)) { best = d; hit = t; }
    }
    if (hit) { hurt(hit, 36); aim.set(hit.x, 1.2, hit.z); if (!enemies.includes(hit)) game.crime(0.6); }
    else {
      const hits = raycaster.intersectObjects(game.vehicles.cars.map(c => c.mesh), true);
      if (hits.length && hits[0].distance < 100) {
        const car = game.vehicles.cars.find(c => { let p = hits[0].object; while (p && p !== c.mesh) p = p.parent; return p === c.mesh; });
        if (car) { car.health -= 15; aim.copy(hits[0].point); }
      }
    }
    tracer(origin, aim); game.player.angle = Math.atan2(aim.x - origin.x, aim.z - origin.z);
  }
  function punch() {
    if (fistCooldown > 0 || game.car) return;
    fistCooldown = 0.65; game.punchTime = 0.25; game.audio.hit();
    const target = targets().filter(t => distance(t, game.player) < 2.8).sort((a, b) => distance(a, game.player) - distance(b, game.player))[0];
    if (target) { hurt(target, 24); if (!enemies.includes(target)) game.crime(0.6); }
  }
  function spawnEnemy(x, z) {
    const mesh = game.makePerson(0x98515c); game.scene.add(mesh);
    box(mesh, 0x282f36, 0.5, 1.25, 0.4, 0.17, 0.2, 0.8);
    mesh.position.set(x, 0, z);
    const enemy = { x, z, mesh, health: 80, cooldown: 0.8 + game.rng() * 1.5 }; enemies.push(enemy); return enemy;
  }
  function enemyFire(enemy, damage = 9) {
    const from = new THREE.Vector3(enemy.x, 1.45, enemy.z), to = new THREE.Vector3(game.player.x, 1.1, game.player.z);
    tracer(from, to, 0xffa76e); game.audio.gun(0.25);
    if (game.rng() < (game.car ? 0.7 : 0.55)) {
      if (game.car) game.car.health -= damage;
      else game.damage(damage);
    }
  }
  function update(dt) {
    shotCooldown = Math.max(0, shotCooldown - dt); fistCooldown = Math.max(0, fistCooldown - dt);
    for (const e of enemies) {
      if (e.health <= 0) { e.mesh.rotation.z = Math.PI / 2; e.mesh.position.y = 0.2; continue; }
      const d = distance(e, game.player), a = Math.atan2(game.player.x - e.x, game.player.z - e.z);
      e.mesh.rotation.y = a;
      if (d > 12 && d < 95) {
        const nx = e.x + Math.sin(a) * dt * 3, nz = e.z + Math.cos(a) * dt * 3;
        if (!game.world.blocked(nx, nz)) { e.x = nx; e.z = nz; }
      }
      e.mesh.position.set(e.x, 0, e.z); e.cooldown -= dt;
      if (e.cooldown <= 0 && d < 55 && game.police.clearSight(e, game.player)) { e.cooldown = 1.4 + game.rng(); enemyFire(e); }
    }
    for (const p of pickups) {
      p.cooldown = Math.max(0, p.cooldown - dt); p.mesh.visible = p.cooldown === 0;
      p.mesh.rotation.y += dt; p.mesh.position.y = 1 + Math.sin(game.time * 2) * 0.15;
      if (p.cooldown === 0 && distance(p, game.player) < 2) {
        if (p.kind === 'health') game.health = clamp(game.health + 45, 0, 100); else game.ammo = Math.min(180, game.ammo + 36);
        p.cooldown = 45; game.audio.pickup(); game.toast(p.kind === 'health' ? 'Medkit · +45 health' : 'Pistol ammo · +36');
      }
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i]; fx.life -= dt;
      if (fx.life <= 0) { game.scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); effects.splice(i, 1); }
    }
    if (!game.god && game.time - game.lastDamage > 10 && game.health < 100) game.health = Math.min(100, game.health + dt * 1.5);
  }
  return { enemies, pickups, shoot, punch, spawnEnemy, update, enemyFire, clearEnemies() { for (const e of enemies) game.scene.remove(e.mesh); enemies.length = 0; } };
}
