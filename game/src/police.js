// Wanted level and police for Solmar Bay.
// Stars rise when crimes are seen, foot cops chase and try to make
// an arrest, cruisers join from 2 stars and ram the player's car.
// Hide from every unit for a while and the heat bleeds away.

import * as THREE from 'three';
import { CFG } from './config.js';
import { Car } from './vehicles.js';

function makeCop(scene) {
  const group = new THREE.Group();
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1d3a6e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, 0.35), uniform);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.74;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.14, 10), uniform);
  cap.position.y = 1.94;
  group.add(cap);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.7, 0.32),
    new THREE.MeshLambertMaterial({ color: 0x14181f }),
  );
  legs.position.y = 0.35;
  group.add(legs);
  scene.add(group);
  return group;
}

export class Police {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.stars = 0;
    this.cops = [];
    this.cruisers = [];
    this.unseenTimer = 0;
    this.decayTimer = 0;
    this.spawnTimer = 0;
  }

  addHeat(n) {
    this.stars = Math.max(0, Math.min(CFG.wanted.max, this.stars + n));
    this.unseenTimer = 0;
  }

  setStars(n) {
    this.stars = Math.max(0, Math.min(CFG.wanted.max, n));
    this.unseenTimer = 0;
  }

  clear() {
    this.stars = 0;
    for (const c of this.cops) this.scene.remove(c.group);
    for (const c of this.cruisers) c.remove();
    this.cops = [];
    this.cruisers = [];
    this.unseenTimer = 0;
  }

  nearestUnitDist(playerPos) {
    let best = Infinity;
    for (const c of this.cops) {
      const d = Math.hypot(c.group.position.x - playerPos.x, c.group.position.z - playerPos.z);
      if (d < best) best = d;
    }
    for (const c of this.cruisers) {
      const d = Math.hypot(c.x - playerPos.x, c.z - playerPos.z);
      if (d < best) best = d;
    }
    return best;
  }

  spawnCopNear(playerPos) {
    const angle = this.rng.range(0, Math.PI * 2);
    const dist = this.rng.range(45, 65);
    const x = Math.max(-195, Math.min(195, playerPos.x + Math.cos(angle) * dist));
    const z = Math.max(-195, Math.min(195, playerPos.z + Math.sin(angle) * dist));
    const group = makeCop(this.scene);
    group.position.set(x, 0, z);
    this.cops.push({ group, arrestTimer: 0, bob: this.rng.range(0, 6) });
  }

  spawnCruiserNear(playerPos) {
    const angle = this.rng.range(0, Math.PI * 2);
    const dist = this.rng.range(50, 70);
    const x = Math.max(-195, Math.min(195, playerPos.x + Math.cos(angle) * dist));
    const z = Math.max(-195, Math.min(195, playerPos.z + Math.sin(angle) * dist));
    const cruiser = new Car(this.scene, 'police', 0xf0f0f0, x, z, angle);
    this.cruisers.push(cruiser);
  }

  update(dt, playerPos, playerInCar, playerCar, hooks) {
    // --- keep the force at the right size for the current stars -----
    this.spawnTimer -= dt;
    const wantCops = Math.min(3, this.stars);
    const wantCruisers = this.stars >= CFG.wanted.cruiserFromStars ? Math.min(3, this.stars - 1) : 0;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      if (this.cops.length < wantCops) this.spawnCopNear(playerPos);
      if (this.cruisers.length < wantCruisers) this.spawnCruiserNear(playerPos);
    }
    // trim the force when stars fall
    while (this.cops.length > wantCops) {
      const c = this.cops.pop();
      this.scene.remove(c.group);
    }
    while (this.cruisers.length > wantCruisers) {
      const c = this.cruisers.pop();
      c.remove();
    }
    // drop units that got left far behind
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      const d = Math.hypot(c.group.position.x - playerPos.x, c.group.position.z - playerPos.z);
      if (d > 170) {
        this.scene.remove(c.group);
        this.cops.splice(i, 1);
      }
    }
    for (let i = this.cruisers.length - 1; i >= 0; i--) {
      const c = this.cruisers[i];
      const d = Math.hypot(c.x - playerPos.x, c.z - playerPos.z);
      if (d > 190) {
        c.remove();
        this.cruisers.splice(i, 1);
      }
    }

    // --- foot cops chase and arrest ----------------------------------
    for (const cop of this.cops) {
      const dx = playerPos.x - cop.group.position.x;
      const dz = playerPos.z - cop.group.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (!playerInCar && dist > CFG.wanted.arrestRange) {
        const speed = CFG.wanted.copChaseSpeed;
        cop.group.position.x += (dx / dist) * speed * dt;
        cop.group.position.z += (dz / dist) * speed * dt;
        cop.group.rotation.y = Math.atan2(dx, dz);
        cop.bob += dt * 10;
        cop.group.position.y = Math.abs(Math.sin(cop.bob)) * 0.06;
        cop.arrestTimer = 0;
      } else if (!playerInCar) {
        cop.arrestTimer += dt;
        if (cop.arrestTimer >= CFG.wanted.arrestHoldSec && hooks.onBusted) {
          hooks.onBusted();
          cop.arrestTimer = 0;
        }
      }
    }

    // --- cruisers chase and ram ---------------------------------------
    for (const cruiser of this.cruisers) {
      const dx = playerPos.x - cruiser.x;
      const dz = playerPos.z - cruiser.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - cruiser.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      const throttle = dist > 7 ? 1 : 0.4;
      cruiser.drive(dt, { throttle, steer, handbrake: false }, hooks.colliders || []);
      // ram the player's car
      if (playerInCar && playerCar && dist < 3.4) {
        playerCar.damage(6 * dt * 10);
        playerCar.speed *= 0.985;
        if (hooks.onRam) hooks.onRam();
      }
    }

    // --- wanted decay when nobody can see the player ------------------
    if (this.stars > 0) {
      const near = this.nearestUnitDist(playerPos);
      if (near > 70) {
        this.unseenTimer += dt;
        if (this.unseenTimer >= CFG.wanted.decayDelaySec) {
          this.decayTimer += dt;
          if (this.decayTimer >= CFG.wanted.decayOnePerSec) {
            this.decayTimer = 0;
            this.stars -= 1;
            if (hooks.onStarsChanged) hooks.onStarsChanged(this.stars);
          }
        }
      } else {
        this.unseenTimer = 0;
        this.decayTimer = 0;
      }
    }
  }

  dots() {
    return {
      cops: this.cops.map((c) => ({ x: c.group.position.x, z: c.group.position.z })),
      cruisers: this.cruisers.map((c) => ({ x: c.x, z: c.z })),
    };
  }
}
