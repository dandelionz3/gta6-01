// Wanted system: 0–5 stars. Heat rises when police see a crime, decays
// when Rook stays out of sight. Foot cops chase and arrest; cruisers spawn
// at 2+ stars and ram the player's car. BUSTED / WASTED are decided here.
import * as THREE from "three";
import { CFG } from "./config.js";
import { RNG } from "./random.js";
import { Car } from "./vehicles.js";

function copMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.05, 0.38), navy);
  body.position.y = 1.3; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 10), skin);
  head.position.y = 2.02; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.14, 10), navy);
  cap.position.y = 2.2; g.add(cap);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.8, 0.32), navy);
  legs.position.y = 0.4; g.add(legs);
  return g;
}

export class Police {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.rng = new RNG(31337);
    this.stars = 0;          // float, displayed rounded up
    this.unseenTimer = 0;
    this.cops = [];          // foot cops {mesh,x,z,heading}
    this.cruisers = [];      // Car instances
    this.spawnTimer = 0;
    this.flashTimer = 0;
  }

  get level() { return Math.min(CFG.wanted.maxStars, Math.ceil(this.stars)); }

  addHeat(n) {
    this.stars = Math.min(CFG.wanted.maxStars, this.stars + n);
    this.unseenTimer = 0;
  }
  setStars(n) { this.stars = Math.max(0, Math.min(CFG.wanted.maxStars, n)); this.unseenTimer = 0; }

  // Place a foot cop at exact coordinates (used by staged shots).
  placeCop(x, z) {
    const m = copMesh();
    m.position.set(x, 0, z);
    this.scene.add(m);
    const cop = { mesh: m, x, z, heading: 0 };
    this.cops.push(cop);
    return cop;
  }

  _spawnCopNear(x, z) {
    const m = copMesh();
    const a = this.rng.range(0, Math.PI * 2);
    const px = x + Math.sin(a) * 26, pz = z + Math.cos(a) * 26;
    m.position.set(px, 0, pz);
    this.scene.add(m);
    this.cops.push({ mesh: m, x: px, z: pz, heading: a });
  }

  _spawnCruiserNear(x, z) {
    const a = this.rng.range(0, Math.PI * 2);
    const car = new Car(this.scene, "police", x + Math.sin(a) * 34, z + Math.cos(a) * 34, a);
    this.cruisers.push(car);
  }

  _clearUnits() {
    for (const c of this.cops) this.scene.remove(c.mesh);
    for (const c of this.cruisers) c.destroy();
    this.cops = [];
    this.cruisers = [];
  }

  // ctx: { playerPos, inCar, playerCar, dt, onBusted, onWasted, time, staging }
  update(dt, ctx) {
    const { playerPos } = ctx;
    // Staged screenshot: hold every unit exactly where the shot put it.
    if (ctx.staging) return;
    const lvl = this.level;
    this.flashTimer += dt;

    // Wanted decays only while no police unit can see the player.
    let seen = false;
    for (const c of this.cops) {
      if (Math.hypot(c.x - playerPos.x, c.z - playerPos.z) < CFG.wanted.sightRange) { seen = true; break; }
    }
    if (!seen) {
      for (const c of this.cruisers) {
        if (Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z) < CFG.wanted.sightRange) { seen = true; break; }
      }
    }
    if (lvl > 0 && !seen) {
      this.unseenTimer += dt;
      if (this.unseenTimer > CFG.wanted.decayDelaySec) {
        this.stars = Math.max(0, this.stars - CFG.wanted.decayPerSec * dt);
        if (this.stars < 0.05) { this.stars = 0; this._clearUnits(); }
      }
    } else {
      this.unseenTimer = 0;
    }

    // Keep unit counts matched to the wanted level.
    const wantCops = lvl >= 1 ? Math.min(4, lvl + 1) : 0;
    const wantCruisers = lvl >= CFG.wanted.cruiserAt ? Math.min(4, lvl - 1) : 0;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      if (this.cops.length < wantCops) this._spawnCopNear(playerPos.x, playerPos.z);
      if (this.cruisers.length < wantCruisers) this._spawnCruiserNear(playerPos.x, playerPos.z);
    }
    if (lvl === 0) {
      // stragglers walk off
      for (const c of this.cops) {
        c.heading += 0.01;
        c.x += Math.sin(c.heading) * 1.2 * dt;
        c.z += Math.cos(c.heading) * 1.2 * dt;
        c.mesh.position.set(c.x, 0, c.z);
        c.mesh.rotation.y = c.heading;
      }
      return;
    }

    // Foot cops run at the player; touch = BUSTED.
    for (const c of this.cops) {
      const dx = playerPos.x - c.x, dz = playerPos.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        c.heading = Math.atan2(dx, dz);
        const sp = CFG.wanted.copFootSpeed * (ctx.inCar ? 0.85 : 1);
        c.x += Math.sin(c.heading) * sp * dt;
        c.z += Math.cos(c.heading) * sp * dt;
      }
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      if (d < CFG.wanted.arrestRange && !ctx.inCar) ctx.onBusted();
    }

    // Cruisers chase the player's car (or the player on foot) and ram.
    for (const cr of this.cruisers) {
      const dx = playerPos.x - cr.pos.x, dz = playerPos.z - cr.pos.z;
      const d = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - cr.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dh * 1.6));
      const throttle = d > 6 ? 1 : 0.4;
      cr.drive(dt, { throttle, steer, brake: false, handbrake: false }, this.world.colliders);
      // ram damage when contact is made with the player's car
      if (ctx.inCar && ctx.playerCar && d < 3.4) {
        ctx.playerCar.health -= 6 * dt;
        cr.speed *= 0.6;
        if (ctx.playerCar.health <= 0) ctx.onWasted();
      }
    }
  }
}
