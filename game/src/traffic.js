// Ambient life: AI traffic cars cruising the road grid and pedestrians
// strolling the sidewalks. Both react to the player — cars brake for
// obstacles, pedestrians flee gunfire and fall when hit.
import * as THREE from "three";
import { CFG } from "./config.js";
import { RNG } from "./random.js";
import { makeCarMesh } from "./vehicles.js";
import { collideCircle } from "./world.js";

const PED_COLOURS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8b84a, 0x8a4ad8, 0xd87a4a, 0xdddddd];

export class Traffic {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.rng = new RNG(4242);
    this.cars = [];
    this.peds = [];
    this._buildCars();
    this._buildPeds();
  }

  _buildCars() {
    const kinds = ["sedan", "taxi", "van", "sedan", "sports"];
    const centres = [-128, -64, 0, 64, 128];
    for (let i = 0; i < CFG.traffic.cars; i++) {
      const vertical = i % 2 === 0;
      const lane = centres[i % centres.length] + (this.rng.chance(0.5) ? -3 : 3);
      const along = this.rng.range(-150, 150);
      const mesh = makeCarMesh(kinds[i % kinds.length]);
      this.scene.add(mesh.group);
      this.cars.push({
        mesh,
        x: vertical ? lane : along,
        z: vertical ? along : lane,
        heading: vertical ? (lane > centres[i % centres.length] ? 0 : Math.PI) : (lane > centres[i % centres.length] ? Math.PI / 2 : -Math.PI / 2),
        speed: CFG.traffic.carSpeed + this.rng.range(-CFG.traffic.carSpeedVar, CFG.traffic.carSpeedVar),
        vertical,
        lane,
        targetSpeed: CFG.traffic.carSpeed,
      });
    }
  }

  _buildPeds() {
    const bodyGeo = new THREE.BoxGeometry(0.55, 1.0, 0.35);
    const headGeo = new THREE.SphereGeometry(0.22, 10, 10);
    const legGeo = new THREE.BoxGeometry(0.5, 0.8, 0.3);
    for (let i = 0; i < CFG.traffic.pedestrians; i++) {
      const g = new THREE.Group();
      const colour = PED_COLOURS[i % PED_COLOURS.length];
      const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9 }));
      body.position.y = 1.3; g.add(body);
      const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.8 }));
      head.position.y = 2.0; g.add(head);
      const legs = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 1 }));
      legs.position.y = 0.4; g.add(legs);
      const x = this.rng.range(-150, 150);
      const z = this.rng.range(-150, 190);
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.peds.push({
        mesh: g, x, z,
        heading: this.rng.range(0, Math.PI * 2),
        speed: CFG.traffic.pedSpeed * this.rng.range(0.7, 1.3),
        down: false, fleeing: false, walkPhase: this.rng.range(0, 6),
      });
    }
  }

  // playerPos {x,z}, danger = true right after a gunshot / crime nearby.
  update(dt, playerPos, danger, parkedCars) {
    // --- traffic cars ---
    for (const c of this.cars) {
      // brake if something is right ahead
      let blocked = false;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      for (const other of this.cars) {
        if (other === c) continue;
        const dx = other.x - c.x, dz = other.z - c.z;
        const ahead = dx * fx + dz * fz;
        if (ahead > 0 && ahead < 9 && Math.abs(dx * fz - dz * fx) < 2.4) { blocked = true; break; }
      }
      if (!blocked && playerPos) {
        const dx = playerPos.x - c.x, dz = playerPos.z - c.z;
        const ahead = dx * fx + dz * fz;
        if (ahead > 0 && ahead < 8 && Math.abs(dx * fz - dz * fx) < 2.2) blocked = true;
      }
      const want = blocked ? 0 : c.targetSpeed;
      c.speed += (want - c.speed) * Math.min(1, 1.5 * dt);
      c.x += fx * c.speed * dt;
      c.z += fz * c.speed * dt;
      // at an intersection, sometimes turn onto the crossing road
      const nearCentre = (v) => Math.abs(v % 64) < 2.5 || Math.abs(Math.abs(v % 64) - 64) < 2.5;
      if (this.rng.chance(0.002) && nearCentre(c.vertical ? c.z : c.x)) {
        c.vertical = !c.vertical;
        c.heading += this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      }
      // wrap around the map edges
      if (c.x > 175) c.x = -175; if (c.x < -175) c.x = 175;
      if (c.z > 230) c.z = -175; if (c.z < -175) c.z = 230;
      c.mesh.group.position.set(c.x, 0, c.z);
      c.mesh.group.rotation.y = c.heading;
      for (const w of c.mesh.wheels) w.rotation.x += c.speed * dt * 0.5;
    }
    // --- pedestrians ---
    for (const p of this.peds) {
      if (p.down) continue;
      const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      p.fleeing = danger && dist < 45;
      if (p.fleeing) {
        p.heading = Math.atan2(dx, dz);
        p.speed = CFG.traffic.pedFleeSpeed;
      } else {
        p.speed += (CFG.traffic.pedSpeed - p.speed) * dt;
        if (this.rng.chance(0.004)) p.heading += this.rng.range(-1.2, 1.2);
      }
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      p.x = Math.max(-170, Math.min(170, p.x));
      p.z = Math.max(-170, Math.min(225, p.z));
      collideCircle(p, 0.4, this.world.colliders);
      p.walkPhase += dt * p.speed * 2.2;
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.05, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  // Knock a pedestrian down (player hit them). Returns the ped or null.
  hitPedAt(x, z, radius) {
    for (const p of this.peds) {
      if (p.down) continue;
      if (Math.hypot(p.x - x, p.z - z) < radius) {
        p.down = true;
        p.mesh.rotation.x = -Math.PI / 2;
        p.mesh.position.y = 0.35;
        return p;
      }
    }
    return null;
  }

  nearestCar(x, z, maxDist) {
    let best = null, bestD = maxDist;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
}
