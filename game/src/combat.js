// Combat for Solmar Bay: fists, a pistol with raycast shots, rival
// gang members who shoot back, and medkits. Enemies are simple
// humanoids with health; when the last one falls, the mission that
// spawned them can move on.

import * as THREE from 'three';
import { CFG } from './config.js';

function makeFighter(scene, shirtColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, 0.35), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.74;
  group.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.7, 0.32),
    new THREE.MeshLambertMaterial({ color: 0x1c1e20 }),
  );
  legs.position.y = 0.35;
  group.add(legs);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  gun.position.set(0.32, 1.2, 0.3);
  group.add(gun);
  scene.add(group);
  return group;
}

export class Combat {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.ammo = CFG.pistol.startAmmo;
    this.enemies = [];
    this.medkits = [];
    this.tracers = [];
    this.flash = new THREE.PointLight(0xffe9a8, 0, 14);
    this.scene.add(this.flash);
    this.fireCooldown = 0;
    this.raycaster = new THREE.Raycaster();
  }

  remaining() {
    return this.enemies.filter((e) => e.health > 0).length;
  }

  spawnGang(pos, count) {
    for (let i = 0; i < count; i++) {
      const group = makeFighter(this.scene, this.rng.pick([0x8a2a2a, 0x2a2a8a, 0x3a3a3a]));
      const x = pos.x + this.rng.range(-6, 6);
      const z = pos.z + this.rng.range(-6, 6);
      group.position.set(x, 0, z);
      this.enemies.push({
        group,
        health: 100,
        shootTimer: this.rng.range(0.6, 1.8),
        bob: 0,
      });
    }
  }

  spawnMedkit(x, z) {
    const group = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.7),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    box.position.y = 0.25;
    group.add(box);
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xd22a2a }),
    );
    cross.position.y = 0.55;
    group.add(cross);
    const cross2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.5, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xd22a2a }),
    );
    cross2.position.y = 0.55;
    group.add(cross2);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.medkits.push({ group, taken: false });
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
  }

  // Fists: nearest living enemy within range and roughly in front.
  punch(playerPos, heading) {
    let best = null;
    let bestDist = CFG.player.punchRange;
    for (const e of this.enemies) {
      if (e.health <= 0) continue;
      const dx = e.group.position.x - playerPos.x;
      const dz = e.group.position.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;
      const facing = Math.sin(heading) * dx + Math.cos(heading) * dz;
      if (facing < 0) continue;
      best = e;
      bestDist = dist;
    }
    if (best) {
      best.health -= CFG.player.punchDamage;
      if (best.health <= 0) {
        best.group.rotation.x = -Math.PI / 2;
        best.group.position.y = 0.35;
      }
      return true;
    }
    return false;
  }

  // Pistol: raycast from the camera through the screen centre.
  tryShoot(camera, playerPos) {
    if (this.fireCooldown > 0 || this.ammo <= 0) return null;
    this.fireCooldown = CFG.pistol.fireDelaySec;
    this.ammo -= 1;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    this.raycaster.far = CFG.pistol.range;
    const targets = [];
    for (const e of this.enemies) {
      if (e.health > 0) targets.push(e.group);
    }
    const hits = this.raycaster.intersectObjects(targets, true);
    // muzzle flash at the camera
    this.flash.position.copy(camera.position);
    this.flash.intensity = 6;
    let hitEnemy = null;
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && !obj.userData.enemyRef) obj = obj.parent;
      const enemy = this.enemies.find((e) => e.group === hits[0].object || e.group === obj);
      if (enemy) {
        enemy.health -= CFG.pistol.damage;
        hitEnemy = enemy;
        if (enemy.health <= 0) {
          enemy.group.rotation.x = -Math.PI / 2;
          enemy.group.position.y = 0.35;
        }
      }
      this.addTracer(camera.position, hits[0].point);
    } else {
      const end = new THREE.Vector3();
      this.raycaster.ray.at(CFG.pistol.range, end);
      this.addTracer(camera.position, end);
    }
    return { hit: hitEnemy, point: hits.length > 0 ? hits[0].point : null };
  }

  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  update(dt, playerPos, hooks) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 60);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers.splice(i, 1);
      }
    }
    // enemies close in and shoot back
    for (const e of this.enemies) {
      if (e.health <= 0) continue;
      const dx = playerPos.x - e.group.position.x;
      const dz = playerPos.z - e.group.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      e.group.rotation.y = Math.atan2(dx, dz);
      if (dist > 13) {
        e.group.position.x += (dx / dist) * 4.5 * dt;
        e.group.position.z += (dz / dist) * 4.5 * dt;
        e.bob += dt * 9;
        e.group.position.y = Math.abs(Math.sin(e.bob)) * 0.05;
      } else {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = this.rng.range(1.1, 2.1);
          const start = e.group.position.clone();
          start.y = 1.3;
          this.addTracer(start, new THREE.Vector3(playerPos.x, 1.2, playerPos.z));
          if (hooks.onShotAtPlayer) hooks.onShotAtPlayer(this.rng.chance(0.3) ? 9 : 0);
          if (hooks.onEnemyShot) hooks.onEnemyShot();
        }
      }
    }
    // medkit pickups
    for (const kit of this.medkits) {
      if (kit.taken) continue;
      const dx = kit.group.position.x - playerPos.x;
      const dz = kit.group.position.z - playerPos.z;
      if (dx * dx + dz * dz < 3.2) {
        kit.taken = true;
        this.scene.remove(kit.group);
        if (hooks.onMedkit) hooks.onMedkit();
      }
    }
  }
}
