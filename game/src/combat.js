// Combat: fists (F), pistol (mouse click, raycast), enemy gang shooters
// for the later missions, health / regen / medkits, ammo pickups.

import * as THREE from "three";
import { COMBAT, PLAYER } from "./config.js";
import { buildPedestrian } from "./traffic.js";

export class Combat {
  constructor(scene, rng, audio) {
    this.scene = scene;
    this.rng = rng;
    this.audio = audio;
    this.health = PLAYER.maxHealth;
    this.lastDamageAt = -99;
    this.punchTimer = 0;
    this.shootTimer = 0;
    this.ammoMag = COMBAT.pistolMag;
    this.ammoReserve = COMBAT.pistolReserveStart;
    this.armed = false; // pistol drawn
    this.enemies = [];
    this.medkits = [];
    this.ammoBoxes = [];
    this.raycaster = new THREE.Raycaster();
    this.tracer = null;
    this.tracerTimer = 0;
    this.muzzle = null;
    this._buildTracer();
  }

  _buildTracer() {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.tracer = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }),
    );
    this.tracer.visible = false;
    this.scene.add(this.tracer);
    this.muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
    );
    this.muzzle.visible = false;
    this.scene.add(this.muzzle);
  }

  damage(amount, nowSec) {
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = nowSec;
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  get dead() {
    return this.health <= 0;
  }

  spawnEnemies(count, near, spread = 14) {
    this.clearEnemies();
    for (let i = 0; i < count; i++) {
      const e = buildPedestrian(this.rng);
      e.traverse((o) => {
        if (o.isMesh && o.position.y > 0.8 && o.position.y < 1.5) {
          o.material = new THREE.MeshLambertMaterial({ color: 0x8a1f2d });
        }
      });
      e.name = "gang";
      e.position.set(
        near.x + this.rng.range(-spread, spread),
        0,
        near.z + this.rng.range(-spread, spread),
      );
      e.userData.enemy = { hp: 60, shootTimer: this.rng.range(0.5, 1.5), alive: true };
      this.scene.add(e);
      this.enemies.push(e);
    }
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e);
    this.enemies = [];
  }

  spawnMedkit(x, z) {
    const kit = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.35, 0.7),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xd02020 }),
    );
    cross.position.y = 0.2;
    kit.add(cross);
    kit.position.set(x, 0.4, z);
    kit.userData.pickup = "medkit";
    this.scene.add(kit);
    this.medkits.push(kit);
  }

  spawnAmmo(x, z) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.4, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xd8a020 }),
    );
    box.position.set(x, 0.35, z);
    box.userData.pickup = "ammo";
    this.scene.add(box);
    this.ammoBoxes.push(box);
  }

  // Punch: hits the nearest pedestrian / enemy / cop in range ahead.
  tryPunch(playerPos, playerHeading, targets) {
    if (this.punchTimer > 0) return null;
    this.punchTimer = COMBAT.punchCooldown;
    this.audio?.playSwing();
    const fx = -Math.sin(playerHeading);
    const fz = -Math.cos(playerHeading);
    let best = null;
    let bestD = COMBAT.punchRange;
    for (const t of targets) {
      const dx = t.position.x - playerPos.x;
      const dz = t.position.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && dx * fx + dz * fz > 0) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  // Pistol shot from the camera through the crosshair.
  tryShoot(camera, shootables) {
    if (this.shootTimer > 0) return "cooldown";
    if (!this.armed) return "unarmed";
    if (this.ammoMag <= 0) {
      this.shootTimer = COMBAT.pistolCooldown;
      this.audio?.playClick();
      return "empty";
    }
    this.shootTimer = COMBAT.pistolCooldown;
    this.ammoMag -= 1;
    this.audio?.playShot();
    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    this.raycaster.far = COMBAT.pistolRange;
    const hits = this.raycaster.intersectObjects(shootables, true);
    const origin = camera.position.clone();
    let end = origin.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(COMBAT.pistolRange));
    let hitObj = null;
    if (hits.length > 0) {
      end = hits[0].point.clone();
      hitObj = hits[0].object;
    }
    this.showTracer(origin, end);
    if (hitObj) {
      let node = hitObj;
      while (node && !node.userData.enemy && !node.userData.ped) node = node.parent;
      if (node?.userData.enemy) {
        node.userData.enemy.hp -= COMBAT.pistolDamage;
        if (node.userData.enemy.hp <= 0) {
          node.userData.enemy.alive = false;
          node.visible = false;
        }
        return { hit: node, killed: !node.userData.enemy.alive };
      }
      if (node?.userData.ped) {
        node.userData.ped.state = "down";
        node.userData.ped.downTimer = 8;
        return { hit: node, killed: false, ped: true };
      }
    }
    return { hit: null };
  }

  showTracer(from, to) {
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerTimer = 0.07;
    this.muzzle.position.copy(to);
    this.muzzle.visible = true;
  }

  update(dt, nowSec, playerPos, playerHeading) {
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.shootTimer = Math.max(0, this.shootTimer - dt);
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) {
        this.tracer.visible = false;
        this.muzzle.visible = false;
      }
    }
    // Slow health regen after a quiet spell.
    if (!this.dead && nowSec - this.lastDamageAt > PLAYER.regenDelaySec) {
      this.health = Math.min(PLAYER.maxHealth, this.health + PLAYER.regenPerSec * dt);
    }
    // Enemy gang members advance and shoot back.
    for (const e of this.enemies) {
      const en = e.userData.enemy;
      if (!en?.alive) continue;
      const dx = playerPos.x - e.position.x;
      const dz = playerPos.z - e.position.z;
      const d = Math.hypot(dx, dz);
      e.rotation.y = Math.atan2(-dx, -dz);
      if (d > 12) {
        e.position.x += (dx / d) * 4.2 * dt;
        e.position.z += (dz / d) * 4.2 * dt;
      }
      en.shootTimer -= dt;
      if (d < COMBAT.enemyRange && en.shootTimer <= 0) {
        en.shootTimer = COMBAT.enemyCooldown + this.rng.range(0, 0.5);
        this.audio?.playEnemyShot();
        if (this.rng.chance(0.45)) {
          this.damage(COMBAT.enemyDamage, nowSec);
        }
      }
    }
    // Pickups.
    for (let i = this.medkits.length - 1; i >= 0; i--) {
      const k = this.medkits[i];
      if (Math.hypot(k.position.x - playerPos.x, k.position.z - playerPos.z) < 1.6) {
        this.heal(40);
        this.audio?.playPickup();
        this.scene.remove(k);
        this.medkits.splice(i, 1);
      }
    }
    for (let i = this.ammoBoxes.length - 1; i >= 0; i--) {
      const b = this.ammoBoxes[i];
      if (Math.hypot(b.position.x - playerPos.x, b.position.z - playerPos.z) < 1.6) {
        this.ammoReserve += 24;
        this.audio?.playPickup();
        this.scene.remove(b);
        this.ammoBoxes.splice(i, 1);
      }
    }
  }

  reload() {
    if (this.ammoMag >= COMBAT.pistolMag || this.ammoReserve <= 0) return false;
    const need = COMBAT.pistolMag - this.ammoMag;
    const take = Math.min(need, this.ammoReserve);
    this.ammoMag += take;
    this.ammoReserve -= take;
    this.audio?.playReload();
    return true;
  }
}
