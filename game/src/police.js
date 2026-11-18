// Wanted level + police. Foot cops chase and arrest; cruisers spawn at 2+
// stars, ram and block. Heat decays only while no unit can see the player.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';
import { spawnCar, removeCar } from './vehicles.js';

function makeCopMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.36, 1.1, 8),
    new THREE.MeshLambertMaterial({ color: 0x1d2f4a }),
  );
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }),
  );
  head.position.y = 1.72;
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.27, 0.12, 10),
    new THREE.MeshLambertMaterial({ color: 0x12233a }),
  );
  cap.position.y = 1.9;
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffd94a }),
  );
  badge.position.set(0.12, 1.15, 0.32);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x141c28 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.5, 0.17), legMat);
  legL.position.set(-0.15, 0.25, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(body, head, cap, badge, legL, legR);
  g.userData.legs = [legL, legR];
  return g;
}

export class Police {
  constructor(scene, world, seed = 1) {
    this.scene = scene;
    this.world = world;
    this.rng = new Rng(seed);
    this.wanted = 0;
    this.cops = [];
    this.cruisers = [];
    this.decayTimer = 0;
    this.arrestTimer = 0;
    this.spawnTimer = 0;
    this.siren = false;
    this.time = 0;
  }

  get stars() {
    return this.wanted;
  }

  addWanted(n) {
    if (n <= 0) return;
    this.wanted = Math.min(CFG.wanted.max, this.wanted + n);
    this.decayTimer = 0;
  }

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(CFG.wanted.max, n));
    this.decayTimer = 0;
  }

  clear() {
    this.wanted = 0;
    this.decayTimer = 0;
    for (const c of this.cops) this.scene.remove(c.mesh);
    for (const c of this.cruisers) removeCar(this.scene, c);
    this.cops = [];
    this.cruisers = [];
  }

  // a unit "sees" the player within range (no occlusion modelling — streets
  // are open enough that distance is the honest proxy)
  nearestUnitDist(playerPos) {
    let best = Infinity;
    for (const c of this.cops) {
      best = Math.min(best, Math.hypot(c.mesh.position.x - playerPos.x, c.mesh.position.z - playerPos.z));
    }
    for (const c of this.cruisers) {
      best = Math.min(best, Math.hypot(c.group.position.x - playerPos.x, c.group.position.z - playerPos.z));
    }
    return best;
  }

  spawnCopNear(playerPos) {
    const ang = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(18, 30);
    const p = this.world.nearestRoadPoint(playerPos.x + Math.sin(ang) * d, playerPos.z + Math.cos(ang) * d);
    return this.spawnCopAt(p.x, p.z);
  }

  spawnCopAt(x, z) {
    const mesh = makeCopMesh();
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const cop = { mesh, x, z, speed: this.rng.range(4.4, 5.4), phase: this.rng.range(0, 6) };
    this.cops.push(cop);
    return cop;
  }

  spawnCruiserNear(playerPos) {
    const ang = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(30, 48);
    const p = this.world.nearestRoadPoint(playerPos.x + Math.sin(ang) * d, playerPos.z + Math.cos(ang) * d);
    const car = spawnCar(this.scene, 'police', p.x, p.z, Math.atan2(playerPos.x - p.x, playerPos.z - p.z), 0x1d2f4a);
    car.ai = { speed: this.rng.range(24, 30) };
    this.cruisers.push(car);
  }

  update(dt, player, callbacks) {
    this.time += dt;
    this.siren = this.wanted > 0;
    const p = player.pos;
    const playerSpeed = player.car ? Math.abs(player.car.speed) : 0;

    // keep the force proportional to the heat
    const wantCops = this.wanted >= 1 ? Math.min(this.wanted + 1, 4) : 0;
    const wantCruisers = this.wanted >= 2 ? Math.min(this.wanted - 1, 3) : 0;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      if (this.cops.length < wantCops) this.spawnCopNear(p);
      if (this.cruisers.length < wantCruisers) this.spawnCruiserNear(p);
    }
    // trim the force when heat drops
    while (this.cops.length > wantCops) {
      const c = this.cops.pop();
      this.scene.remove(c.mesh);
    }
    while (this.cruisers.length > wantCruisers) {
      const c = this.cruisers.pop();
      removeCar(this.scene, c);
    }

    // --- foot cops chase ---
    let arresting = false;
    for (const cop of this.cops) {
      const dx = p.x - cop.x;
      const dz = p.z - cop.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.4) {
        const step = Math.min(dist, cop.speed * dt);
        cop.x += (dx / dist) * step;
        cop.z += (dz / dist) * step;
        cop.phase += dt * cop.speed * 2.4;
        const swing = Math.sin(cop.phase) * 0.5;
        cop.mesh.userData.legs[0].rotation.x = swing;
        cop.mesh.userData.legs[1].rotation.x = -swing;
      }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = Math.atan2(dx, dz);
      if (dist < CFG.wanted.arrestRange && playerSpeed < 3) arresting = true;
      // a cop that catches a slow car drags the driver out
      if (dist < 2.2 && player.car && playerSpeed < 2) arresting = true;
    }
    if (arresting) {
      this.arrestTimer += dt;
      if (this.arrestTimer >= CFG.wanted.arrestTime) {
        this.arrestTimer = 0;
        callbacks.onBusted();
        return;
      }
    } else {
      this.arrestTimer = 0;
    }

    // --- cruisers ram and block ---
    for (const car of this.cruisers) {
      const pos = car.group.position;
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      const targetSpeed = dist > 10 ? car.ai.speed : car.ai.speed * 0.75;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
      pos.x += Math.sin(car.heading) * car.speed * dt;
      pos.z += Math.cos(car.heading) * car.speed * dt;
      car.group.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.35;
      for (const w of car.wheels) { w.wheel.rotation.y += spin; w.hub.rotation.y += spin; }
      // ram: shove + damage the player's car on contact
      if (player.car && dist < 3.4) {
        player.car.health -= 14 * dt * 4;
        player.car.speed *= 0.94;
        if (callbacks.onRam) callbacks.onRam();
      }
      if (dist > 140) {
        // lost the player — teleport back into the hunt
        const ang = this.rng.range(0, Math.PI * 2);
        const np = this.world.nearestRoadPoint(p.x + Math.sin(ang) * 36, p.z + Math.cos(ang) * 36);
        pos.x = np.x;
        pos.z = np.z;
      }
    }

    // --- wanted decay: only while nothing is close ---
    if (this.wanted > 0) {
      const near = this.nearestUnitDist(p);
      if (near > 70) {
        this.decayTimer += dt;
        if (this.decayTimer >= CFG.wanted.decayDelay) {
          this.wanted -= 1;
          this.decayTimer = 0;
          if (callbacks.onStarLost) callbacks.onStarLost(this.wanted);
        }
      } else {
        this.decayTimer = 0;
      }
    }
  }
}
