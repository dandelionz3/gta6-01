// Combat: fists, pistol with raycast shots, enemy gang members who shoot
// back, health with slow regen, medkit + ammo pickups scattered in the city.
import * as THREE from "three";
import { CFG } from "./config.js";
import { RNG } from "./random.js";

function enemyMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.05, 0.38), jacket);
  body.position.y = 1.3; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 10), skin);
  head.position.y = 2.02; g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.8, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 1 }));
  legs.position.y = 0.4; g.add(legs);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0.3, 1.35, 0.3); g.add(gun);
  return g;
}

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.rng = new RNG(8080);
    this.health = CFG.player.health;
    this.lastHurtAt = -99;
    this.mag = CFG.combat.pistolMag;
    this.reserve = CFG.combat.pistolReserve;
    this.armed = false;
    this.enemies = [];   // {mesh,x,z,heading,health,shootTimer,alive}
    this.pickups = [];   // {mesh,kind,x,z,taken}
    this.tracers = [];   // fading shot lines {line,life}
    this.flash = null;
    this.flashTimer = 0;
    this._buildPickups();
  }

  _buildPickups() {
    const spots = [
      { kind: "medkit", x: 20, z: 120 }, { kind: "medkit", x: -84, z: -40 },
      { kind: "medkit", x: 96, z: 40 }, { kind: "ammo", x: -20, z: 96 },
      { kind: "ammo", x: 84, z: -84 }, { kind: "ammo", x: -96, z: 96 },
    ];
    for (const s of spots) {
      const colour = s.kind === "medkit" ? 0xffffff : 0xffe020;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7),
        new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.5 }));
      mesh.position.set(s.x, 0.6, s.z);
      this.scene.add(mesh);
      this.pickups.push({ mesh, kind: s.kind, x: s.x, z: s.z, taken: false });
    }
  }

  spawnEnemy(x, z) {
    const mesh = enemyMesh();
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const e = { mesh, x, z, heading: 0, health: 100, shootTimer: this.rng.range(0.5, 1.5), alive: true };
    this.enemies.push(e);
    return e;
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  hurtPlayer(n, time) {
    this.health = Math.max(0, this.health - n);
    this.lastHurtAt = time;
  }

  heal(n) { this.health = Math.min(CFG.player.health, this.health + n); }

  reload() {
    if (this.mag >= CFG.combat.pistolMag || this.reserve <= 0) return false;
    const need = CFG.combat.pistolMag - this.mag;
    const take = Math.min(need, this.reserve);
    this.mag += take;
    this.reserve -= take;
    return true;
  }

  // Fire the pistol from origin along dir. Returns the enemy hit, if any.
  shoot(origin, dir) {
    if (this.mag <= 0) { this.reload(); return null; }
    this.mag -= 1;
    // muzzle flash
    if (!this.flash) {
      this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
      this.scene.add(this.flash);
    }
    this.flash.position.copy(origin).addScaledVector(dir, 1.2);
    this.flashTimer = 0.06;
    // tracer line
    const end = origin.clone().addScaledVector(dir, CFG.combat.pistolRange);
    let hitEnemy = null, bestD = CFG.combat.pistolRange;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ex = e.x - origin.x, ez = e.z - origin.z;
      const along = ex * dir.x + ez * dir.z;
      if (along < 0 || along > CFG.combat.pistolRange) continue;
      const perp = Math.abs(ex * dir.z - ez * dir.x);
      if (perp < 1.1 && along < bestD) { bestD = along; hitEnemy = e; }
    }
    if (hitEnemy) {
      end.copy(origin).addScaledVector(dir, bestD);
      hitEnemy.health -= CFG.combat.pistolDamage;
      if (hitEnemy.health <= 0) {
        hitEnemy.alive = false;
        hitEnemy.mesh.rotation.x = -Math.PI / 2;
        hitEnemy.mesh.position.y = 0.35;
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.12 });
    return hitEnemy;
  }

  // Punch the nearest enemy / pedestrian in front of the player.
  punch(playerPos, heading, targets) {
    let hit = null;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (const t of targets) {
      if (t.alive === false || t.down) continue;
      const dx = t.x - playerPos.x, dz = t.z - playerPos.z;
      const along = dx * fx + dz * fz;
      const perp = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < CFG.combat.punchRange && perp < 1.0) { hit = t; break; }
    }
    if (hit) {
      if (hit.health !== undefined) {
        hit.health -= CFG.combat.punchDamage;
        if (hit.health <= 0 && hit.mesh) {
          hit.alive = false;
          hit.mesh.rotation.x = -Math.PI / 2;
          hit.mesh.position.y = 0.35;
        }
      } else {
        hit.down = true;
        hit.mesh.rotation.x = -Math.PI / 2;
        hit.mesh.position.y = 0.35;
      }
    }
    return hit;
  }

  update(dt, ctx) {
    const { playerPos, time, onPlayerShot } = ctx;
    // regen after a quiet stretch
    if (time - this.lastHurtAt > CFG.player.regenDelaySec && this.health > 0) {
      this.heal(CFG.player.regenPerSec * dt);
    }
    // muzzle flash fades
    if (this.flash) {
      this.flashTimer -= dt;
      this.flash.visible = this.flashTimer > 0;
    }
    // tracers fade
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12) * 0.9;
      if (t.life <= 0) { this.scene.remove(t.line); this.tracers.splice(i, 1); }
    }
    // pickups bob + collect
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.position.y = 0.6 + Math.sin(time * 2 + p.x) * 0.12;
      if (Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 1.6) {
        p.taken = true;
        this.scene.remove(p.mesh);
        if (p.kind === "medkit") this.heal(CFG.combat.medkitHeal);
        else this.reserve += 24;
        if (ctx.onPickup) ctx.onPickup(p.kind);
      }
    }
    // enemies shoot back
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = playerPos.x - e.x, dz = playerPos.z - e.z;
      const d = Math.hypot(dx, dz);
      e.heading = Math.atan2(dx, dz);
      e.mesh.rotation.y = e.heading;
      // close in slowly if far away
      if (d > 18) {
        e.x += Math.sin(e.heading) * 3.2 * dt;
        e.z += Math.cos(e.heading) * 3.2 * dt;
        e.mesh.position.set(e.x, 0, e.z);
      }
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && d < CFG.combat.enemyRange) {
        e.shootTimer = this.rng.range(0.9, 1.8);
        const origin = new THREE.Vector3(e.x, 1.4, e.z);
        const dir = new THREE.Vector3(dx / d, 0, dz / d);
        const geo = new THREE.BufferGeometry().setFromPoints([
          origin, new THREE.Vector3(playerPos.x, 1.3, playerPos.z),
        ]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff6a5a, transparent: true, opacity: 0.9 }));
        this.scene.add(line);
        this.tracers.push({ line, life: 0.12 });
        if (this.rng.chance(0.55)) this.hurtPlayer(CFG.combat.enemyDamage, time);
        if (onPlayerShot) onPlayerShot();
      }
    }
  }
}
