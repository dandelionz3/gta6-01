// Fists, pistol, enemy gang members, pickups. Shooting uses a raycaster
// against registered hit-meshes; tracers and muzzle flash are short-lived
// scene objects that clean themselves up.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';

function makeGangMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.36, 1.1, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a1f2a }),
  );
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xc98d64 }),
  );
  head.position.y = 1.72;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.1, 10),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  band.position.y = 1.86;
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.12, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x14161a }),
  );
  gun.position.set(0.3, 1.15, 0.3);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.5, 0.17), legMat);
  legL.position.set(-0.15, 0.25, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(body, head, band, gun, legL, legR);
  g.userData.legs = [legL, legR];
  return g;
}

function makePickupMesh(kind) {
  const g = new THREE.Group();
  const color = kind === 'medkit' ? 0xffffff : 0xffd94a;
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.4, 0.6),
    new THREE.MeshLambertMaterial({ color, emissive: kind === 'medkit' ? 0x992222 : 0x886600 }),
  );
  box.position.y = 0.5;
  const cross = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.12, 0.05),
    new THREE.MeshBasicMaterial({ color: kind === 'medkit' ? 0xdd2222 : 0x222222 }),
  );
  cross.position.set(0, 0.5, 0.31);
  const cross2 = cross.clone();
  cross2.rotation.z = Math.PI / 2;
  g.add(box, cross, cross2);
  return g;
}

export class Combat {
  constructor(scene, camera, seed = 1) {
    this.scene = scene;
    this.camera = camera;
    this.rng = new Rng(seed);
    this.ammo = CFG.combat.pistolAmmoStart;
    this.enemies = [];
    this.pickups = [];
    this.tracers = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = CFG.combat.pistolRange;
    this.punchCd = 0;
    this.shotCd = 0;
    this.flash = new THREE.PointLight(0xffc36a, 0, 14);
    this.scene.add(this.flash);
    this.time = 0;
  }

  enemiesAlive() {
    return this.enemies.filter((e) => !e.dead).length;
  }

  spawnGang(pos, count) {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const x = pos.x + Math.sin(ang) * this.rng.range(6, 12);
      const z = pos.z + Math.cos(ang) * this.rng.range(6, 12);
      const mesh = makeGangMesh();
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.enemies.push({
        mesh, x, z, hp: CFG.combat.enemyHp, dead: false,
        shotTimer: this.rng.range(0.8, 2), phase: this.rng.range(0, 6),
        strafeDir: this.rng.either(-1, 1),
      });
    }
  }

  clearGang() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  spawnPickup(kind, x, z) {
    const mesh = makePickupMesh(kind);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.pickups.push({ kind, mesh, x, z });
  }

  // shootable meshes: gang members + pedestrians passed in by the game
  hitMeshes(extra) {
    const out = [];
    for (const e of this.enemies) {
      if (!e.dead) {
        e.mesh.traverse((o) => { if (o.isMesh) { o.userData.ref = e; out.push(o); } });
      }
    }
    for (const t of extra || []) {
      if (t.mesh) {
        t.mesh.traverse((o) => { if (o.isMesh) { o.userData.ref = t; out.push(o); } });
      }
    }
    return out;
  }

  shoot(origin, dir, targets, onHit) {
    if (this.shotCd > 0 || this.ammo <= 0) return false;
    this.shotCd = 0.22;
    this.ammo -= 1;
    this.raycaster.set(origin, dir);
    const meshes = this.hitMeshes(targets);
    const hits = this.raycaster.intersectObjects(meshes, false);
    let end;
    if (hits.length > 0) {
      const h = hits[0];
      end = h.point.clone();
      const ref = h.object.userData.ref;
      if (ref) onHit(ref, h.point);
    } else {
      end = origin.clone().add(dir.clone().multiplyScalar(CFG.combat.pistolRange));
    }
    // tracer
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
    // muzzle flash
    this.flash.position.copy(origin);
    this.flash.intensity = 26;
    return true;
  }

  punch(playerPos, heading, targets, onHit) {
    if (this.punchCd > 0) return false;
    this.punchCd = 0.4;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let hitAny = false;
    for (const t of targets || []) {
      if (t.dead || t.fallen) continue;
      const tx = (t.x ?? t.mesh.position.x) - playerPos.x;
      const tz = (t.z ?? t.mesh.position.z) - playerPos.z;
      const d = Math.hypot(tx, tz);
      if (d > CFG.combat.punchRange) continue;
      const dot = (tx * fx + tz * fz) / (d || 1);
      if (dot < Math.cos(CFG.combat.punchArc)) continue;
      onHit(t);
      hitAny = true;
    }
    return hitAny;
  }

  damageEnemy(e, dmg) {
    e.hp -= dmg;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      e.mesh.rotation.z = Math.PI / 2;
      e.mesh.position.y = 0.35;
    }
  }

  update(dt, playerPos, onPlayerDamage, onPickup) {
    this.time += dt;
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.shotCd = Math.max(0, this.shotCd - dt);
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 220);

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // enemies: close in, strafe, shoot back
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = playerPos.x - e.x;
      const dz = playerPos.z - e.z;
      const dist = Math.hypot(dx, dz);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.phase += dt * 5;
      const swing = Math.sin(e.phase) * 0.4;
      e.mesh.userData.legs[0].rotation.x = swing;
      e.mesh.userData.legs[1].rotation.x = -swing;
      if (dist > 14) {
        e.x += (dx / dist) * 3.4 * dt;
        e.z += (dz / dist) * 3.4 * dt;
      } else if (dist < 6) {
        e.x -= (dx / dist) * 1.6 * dt;
        e.z -= (dz / dist) * 1.6 * dt;
      } else {
        // strafe sideways
        e.x += (-dz / dist) * e.strafeDir * 1.8 * dt;
        e.z += (dx / dist) * e.strafeDir * 1.8 * dt;
        if (this.rng.chance(dt * 0.25)) e.strafeDir *= -1;
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.shotTimer -= dt;
      if (e.shotTimer <= 0 && dist < 42) {
        e.shotTimer = CFG.combat.enemyShotGap * this.rng.range(0.8, 1.4);
        const from = new THREE.Vector3(e.x, 1.4, e.z);
        const to = new THREE.Vector3(playerPos.x, 1.3, playerPos.z);
        const dir = to.clone().sub(from).normalize();
        dir.x += this.rng.range(-0.09, 0.09);
        dir.z += this.rng.range(-0.09, 0.09);
        const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff6a4a, transparent: true, opacity: 0.85 }));
        this.scene.add(line);
        this.tracers.push({ line, life: 0.09 });
        if (this.rng.chance(0.55)) onPlayerDamage(CFG.combat.enemyDamage);
      }
    }

    // pickups spin + get collected
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = Math.sin(this.time * 2.4) * 0.12;
      if (Math.hypot(playerPos.x - p.x, playerPos.z - p.z) < 1.6) {
        onPickup(p.kind);
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }
}
