// Wanted system: 0–5 stars, foot cops who chase and arrest, police
// cruisers at 2+ stars, decay when out of sight, BUSTED / WASTED outcomes.

import * as THREE from "three";
import { WANTED, COLORS } from "./config.js";
import { buildCarMesh } from "./vehicles.js";
import { buildPedestrian } from "./traffic.js";

export class Police {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.stars = 0;
    this.heat = 0; // 0..1 progress toward the next star
    this.decayTimer = 0;
    this.bustTimer = 0;
    this.cops = []; // foot cops
    this.cruisers = [];
    this.sirenPhase = 0;
  }

  get wanted() {
    return this.stars;
  }

  addHeat(amount, reason) {
    if (this.stars >= WANTED.starsMax) return;
    this.heat += amount;
    if (this.heat >= 1) {
      this.heat = 0;
      this.stars = Math.min(WANTED.starsMax, this.stars + 1);
      this.syncForces();
      return true; // star gained
    }
    return false;
  }

  setStars(n) {
    this.stars = Math.max(0, Math.min(WANTED.starsMax, n));
    this.heat = 0;
    this.syncForces();
  }

  clear() {
    this.setStars(0);
  }

  // Spawn / despawn cops + cruisers to match the star level.
  syncForces() {
    const wantCops = this.stars >= 1 ? Math.min(2 + this.stars, 6) : 0;
    const wantCruisers = this.stars >= 2 ? Math.min(this.stars - 1, 3) : 0;
    while (this.cops.length < wantCops) this.spawnCop();
    while (this.cops.length > wantCops) this.removeCop();
    while (this.cruisers.length < wantCruisers) this.spawnCruiser();
    while (this.cruisers.length > wantCruisers) this.removeCruiser();
  }

  spawnCop() {
    const cop = buildPedestrian(this.rng);
    // Recolour the torso to a police navy.
    cop.traverse((o) => {
      if (o.isMesh && o.position.y > 0.8 && o.position.y < 1.5) {
        o.material = new THREE.MeshLambertMaterial({ color: COLORS.copUniform });
      }
    });
    cop.name = "cop";
    cop.position.set(this.rng.range(-160, 160), 0, this.rng.range(-160, 160));
    this.scene.add(cop);
    this.cops.push(cop);
  }

  removeCop() {
    const cop = this.cops.pop();
    if (cop) this.scene.remove(cop);
  }

  spawnCruiser() {
    const mesh = buildCarMesh("police", 0x1a1a22);
    mesh.position.set(this.rng.range(-140, 140), 0, this.rng.range(-140, 140));
    const car = mesh.userData.car;
    car.ai = true;
    car.cruise = WANTED.cruiserSpeed;
    this.scene.add(mesh);
    this.cruisers.push(mesh);
  }

  removeCruiser() {
    const c = this.cruisers.pop();
    if (c) this.scene.remove(c);
  }

  // Returns "busted" when a cop holds the player long enough.
  update(dt, playerPos, playerInCar, playerSpeed) {
    this.sirenPhase += dt;
    // Flash the light bars.
    const on = Math.sin(this.sirenPhase * 9) > 0;
    for (const c of this.cruisers) {
      const bar = c.userData.lightbar;
      if (bar) bar.material.color.setHex(on ? 0xff2222 : 0x2244ff);
    }

    // Wanted decay: only when no cop/cruiser is near.
    if (this.stars > 0) {
      let nearest = Infinity;
      for (const cop of this.cops) {
        nearest = Math.min(nearest, Math.hypot(cop.position.x - playerPos.x, cop.position.z - playerPos.z));
      }
      for (const c of this.cruisers) {
        nearest = Math.min(nearest, Math.hypot(c.position.x - playerPos.x, c.position.z - playerPos.z));
      }
      if (nearest > WANTED.decayDistance) {
        this.decayTimer += dt;
        if (this.decayTimer > WANTED.decaySeconds) {
          this.decayTimer = 0;
          this.stars = Math.max(0, this.stars - 1);
          this.syncForces();
        }
      } else {
        this.decayTimer = 0;
      }
    }

    // Foot cops chase on foot; they cannot catch a fast car.
    let busted = false;
    for (const cop of this.cops) {
      const dx = playerPos.x - cop.position.x;
      const dz = playerPos.z - cop.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.01) continue;
      const speed = playerInCar && Math.abs(playerSpeed) > 9 ? 0 : WANTED.copFootSpeed;
      cop.position.x += (dx / d) * speed * dt;
      cop.position.z += (dz / d) * speed * dt;
      cop.rotation.y = Math.atan2(-dx, -dz);
      if (!playerInCar && d < WANTED.bustDistance) {
        this.bustTimer += dt;
        if (this.bustTimer >= WANTED.bustTimeSec) busted = true;
      }
    }
    if (this.cops.length === 0) this.bustTimer = 0;

    // Cruisers ram toward the player and try to block ahead of them.
    for (const c of this.cruisers) {
      const car = c.userData.car;
      const dx = playerPos.x - c.position.x;
      const dz = playerPos.z - c.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.01) continue;
      const wantHeading = Math.atan2(-dx, -dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
      car.speed += (car.cruise - car.speed) * Math.min(1, dt * 1.2);
      c.position.x -= Math.sin(car.heading) * car.speed * dt;
      c.position.z -= Math.cos(car.heading) * car.speed * dt;
      c.rotation.y = car.heading;
      // Ramming contact slows the player's car (handled by main via distance).
    }
    return busted ? "busted" : null;
  }

  // Distance from the nearest cruiser — main uses it for ram feedback.
  nearestCruiserDist(playerPos) {
    let best = Infinity;
    for (const c of this.cruisers) {
      best = Math.min(best, Math.hypot(c.position.x - playerPos.x, c.position.z - playerPos.z));
    }
    return best;
  }

  dispose() {
    for (const cop of this.cops) this.scene.remove(cop);
    for (const c of this.cruisers) this.scene.remove(c);
    this.cops = [];
    this.cruisers = [];
  }
}
