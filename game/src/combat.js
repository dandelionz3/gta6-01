// Combat for Solmar Bay: fists, pistol with raycast shots, muzzle flash
// and tracers, rival gang members who shoot back, and pickups. Health
// regens slowly after a few quiet seconds, so a brawl never ends a run
// by itself — the police do that.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';
import { makePedMesh } from './traffic.js';

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();

export class Combat {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.rng = new Rng(seed + 55);
    this.health = CFG.player.health;
    this.ammo = CFG.combat.startAmmo;
    this.enemies = [];   // {group, health, cooldown, alive, fallTimer}
    this.pickups = [];   // {group, kind, spin}
    this.tracers = [];
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.lastDamageAt = -99;
    this.time = 0;
    this.onPlayerDamage = null;
    this.onGunshot = null;   // (pos) — traffic hears it, police hear it
    this.onPedShot = null;   // (ped) — crime hook
    this.onEnemyDown = null;
    this.onPickup = null;

    this.flash = new THREE.PointLight(0xffe08a, 0, 18, 1.6);
    scene.add(this.flash);
    this._flashTimer = 0;
  }

  get alive() {
    return this.health > 0;
  }

  get gangAlive() {
    return this.enemies.filter((e) => e.alive).length;
  }

  damagePlayer(amount) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = this.time;
  }

  heal(amount) {
    this.health = Math.min(CFG.player.health, this.health + amount);
  }

  spawnGang(pos, count) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const g = makePedMesh(0x8a1a1a);
      g.position.set(pos.x + Math.sin(angle) * 9, 0, pos.z + Math.cos(angle) * 9);
      g.userData.owner = 'enemy';
      this.scene.add(g);
      this.enemies.push({
        group: g,
        health: CFG.combat.enemyHealth,
        cooldown: this.rng.range(0.6, 1.6),
        alive: true,
        fallTimer: 0,
      });
    }
  }

  spawnPickup(kind, x, z) {
    const g = new THREE.Group();
    if (kind === 'medkit') {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.5, 0.7),
        new THREE.MeshLambertMaterial({ color: 0xffffff }),
      );
      g.add(box);
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.14, 0.14),
        new THREE.MeshBasicMaterial({ color: 0x22aa44 }),
      );
      cross.position.y = 0.28;
      g.add(cross);
      const cross2 = cross.clone();
      cross2.rotation.y = Math.PI / 2;
      g.add(cross2);
    } else {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.4, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xffd24a }),
      );
      g.add(box);
    }
    g.position.set(x, 0.7, z);
    this.scene.add(g);
    this.pickups.push({ group: g, kind, spin: 0 });
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
  }

  // Fire the pistol from `origin` along `dir`. Returns 'hit' | 'miss' |
  // 'empty'. `targets` is the list of raycastable root objects (enemies
  // and pedestrians); the hit object is resolved back to its owner group.
  shoot(origin, dir, targets) {
    if (this.shootCooldown > 0 || !this.alive) return 'busy';
    if (this.ammo <= 0) return 'empty';
    this.shootCooldown = CFG.combat.pistolCooldown;
    this.ammo -= 1;
    _ray.set(origin, dir);
    _ray.far = CFG.combat.pistolRange;
    const hits = _ray.intersectObjects(targets, true);
    let end = origin.clone().addScaledVector(dir, CFG.combat.pistolRange);
    let result = 'miss';
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      let node = hit.object;
      while (node && !node.userData.owner) node = node.parent;
      if (node && node.userData.owner === 'enemy') {
        const enemy = this.enemies.find((e) => e.group === node);
        if (enemy && enemy.alive) {
          enemy.health -= CFG.combat.pistolDamage;
          result = 'hit';
          if (enemy.health <= 0) {
            enemy.alive = false;
            enemy.fallTimer = 2.5;
            enemy.group.rotation.x = -Math.PI / 2;
            enemy.group.position.y = 0.35;
            if (this.onEnemyDown) this.onEnemyDown(enemy);
          }
        }
      } else if (node && node.userData.owner === 'ped') {
        result = 'hit';
        if (this.onPedShot) this.onPedShot(node);
      }
    }
    // Muzzle flash + tracer.
    this.flash.position.copy(origin);
    this.flash.intensity = 26;
    this._flashTimer = 0.06;
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
    if (this.onGunshot) this.onGunshot(origin);
    return result;
  }

  // Short-range punch in front of the attacker.
  punch(origin, facing) {
    if (this.punchCooldown > 0 || !this.alive) return 0;
    this.punchCooldown = CFG.player.punchCooldown;
    let hits = 0;
    const consider = (obj, isEnemy) => {
      const dx = obj.group.position.x - origin.x;
      const dz = obj.group.position.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > CFG.player.punchRange) return;
      const dot = (dx * Math.sin(facing) + dz * Math.cos(facing)) / (d || 1);
      if (dot < 0.4) return;
      hits += 1;
      if (isEnemy) {
        obj.health -= CFG.player.punchDamage;
        if (obj.health <= 0 && obj.alive) {
          obj.alive = false;
          obj.fallTimer = 2.5;
          obj.group.rotation.x = -Math.PI / 2;
          obj.group.position.y = 0.35;
          if (this.onEnemyDown) this.onEnemyDown(obj);
        }
      }
    };
    for (const e of this.enemies) if (e.alive) consider(e, true);
    return hits;
  }

  update(dt, playerPos, peds, godMode) {
    this.time += dt;
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) this.flash.intensity = 0;
    }
    // Tracer fade.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    // Slow regen after a quiet stretch.
    if (this.alive && this.time - this.lastDamageAt > CFG.player.regenDelay) {
      this.health = Math.min(CFG.player.health, this.health + CFG.player.regenRate * dt);
    }
    // Fallen enemies fade out and leave.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        e.fallTimer -= dt;
        if (e.fallTimer <= 0) {
          this.scene.remove(e.group);
          this.enemies.splice(i, 1);
        }
        continue;
      }
      const p = e.group.position;
      const dx = playerPos.x - p.x;
      const dz = playerPos.z - p.z;
      const d = Math.hypot(dx, dz);
      e.group.rotation.y = Math.atan2(dx, dz);
      if (d > 30) {
        // Close the distance before opening fire.
        p.x += (dx / d) * 3.2 * dt;
        p.z += (dz / d) * 3.2 * dt;
      } else {
        e.cooldown -= dt;
        if (e.cooldown <= 0) {
          e.cooldown = this.rng.range(CFG.combat.enemyCooldownMin, CFG.combat.enemyCooldownMax);
          if (d < CFG.combat.enemyRange && this.rng.chance(CFG.combat.enemyAccuracy) && !godMode) {
            this.damagePlayer(CFG.combat.enemyDamage);
          }
          // Enemy tracer + bang, hit or not.
          const from = new THREE.Vector3(p.x, 1.5, p.z);
          const to = new THREE.Vector3(playerPos.x, 1.3, playerPos.z);
          const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
          const line = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({ color: 0xff8860, transparent: true, opacity: 0.7 }),
          );
          this.scene.add(line);
          this.tracers.push({ line, life: 0.09 });
          if (this.onGunshot) this.onGunshot(from);
        }
      }
    }
    // Pickups spin and wait to be collected.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.spin += dt;
      pk.group.rotation.y = pk.spin * 2;
      pk.group.position.y = 0.7 + Math.sin(pk.spin * 3) * 0.12;
      const d = Math.hypot(pk.group.position.x - playerPos.x, pk.group.position.z - playerPos.z);
      if (d < 1.7) {
        if (pk.kind === 'medkit') this.heal(CFG.combat.medkitHeal);
        else this.ammo = Math.min(CFG.combat.maxAmmo, this.ammo + 24);
        if (this.onPickup) this.onPickup(pk.kind);
        this.scene.remove(pk.group);
        this.pickups.splice(i, 1);
      }
    }
    // Melee against nearby pedestrians is the main loop's job (it owns
    // the ped list); punch() only handles enemies here.
    void peds;
    void _dir;
  }
}
