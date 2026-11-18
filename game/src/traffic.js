// AI traffic cars on road waypoints + pedestrians on sidewalks.
// Pedestrians wander, flee gunshots, and fall when hit by a car.

import * as THREE from "three";
import { buildCarMesh } from "./vehicles.js";
import { COLORS, WORLD } from "./config.js";
import { collideCircle, isOnRoad } from "./world.js";

const PED_COLORS = [0xd8a070, 0x8a5a3a, 0xe8c8a0, 0x6a4a2a];
const SHIRT_COLORS = [0xc2503a, 0x3a7ac2, 0x4a9a5a, 0xd8c23a, 0x8a5aa0, 0xdddddd];

export function buildPedestrian(rng) {
  const g = new THREE.Group();
  g.name = "pedestrian";
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(PED_COLORS) });
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRT_COLORS) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const head = new THREE.Mesh(box, skin);
  head.scale.set(0.42, 0.42, 0.42);
  head.position.y = 1.58;
  g.add(head);
  const torso = new THREE.Mesh(box, shirt);
  torso.scale.set(0.62, 0.75, 0.34);
  torso.position.y = 1.0;
  g.add(torso);
  const legs = new THREE.Mesh(box, pants);
  legs.scale.set(0.55, 0.62, 0.3);
  legs.position.y = 0.32;
  g.add(legs);
  g.userData.ped = {
    state: "walk", // walk | flee | down
    speed: rng.range(1.2, 2.2),
    heading: rng.range(0, Math.PI * 2),
    timer: rng.range(2, 7),
    downTimer: 0,
    fear: 0,
  };
  return g;
}

export class Traffic {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.cars = [];
    this.peds = [];
    this.pitch = 56;
  }

  roadWaypoints() {
    // A loop around the downtown ring, used by AI cars.
    const pts = [];
    const r = 112;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      pts.push({ x: Math.sin(a) * r, z: Math.cos(a) * r });
    }
    return pts;
  }

  spawnTraffic(count = 14) {
    const kinds = ["sedan", "sedan", "taxi", "van", "sports"];
    const palette = [0xc23b2e, 0x2e6fb0, 0xe8c832, 0x3a3f45, 0xd8d8d8, 0x4a7a4a];
    for (let i = 0; i < count; i++) {
      const mesh = buildCarMesh(this.rng.pick(kinds), this.rng.pick(palette));
      const vertical = this.rng.chance(0.5);
      const lane = this.rng.pick([-4, -3, -2, -1, 0, 1, 2, 3, 4]) * this.pitch;
      const off = this.rng.pick([-3.4, 3.4]);
      let x;
      let z;
      let heading;
      if (vertical) {
        x = lane + off;
        z = this.rng.range(-190, 185);
        heading = off > 0 ? 0 : Math.PI;
      } else {
        x = this.rng.range(-190, 185);
        z = lane + off;
        heading = off > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading;
      const car = mesh.userData.car;
      car.heading = heading;
      car.ai = true;
      car.cruise = this.rng.range(9, 15);
      car.laneOff = off;
      car.vertical = vertical;
      car.lane = lane;
      this.scene.add(mesh);
      this.cars.push(mesh);
    }
  }

  spawnPedestrians(count = 22) {
    for (let i = 0; i < count; i++) {
      const ped = buildPedestrian(this.rng);
      let x = this.rng.range(-200, 200);
      let z = this.rng.range(-200, 185);
      let tries = 0;
      while (isOnRoad(x, z) && tries < 12) {
        x = this.rng.range(-200, 200);
        z = this.rng.range(-200, 185);
        tries++;
      }
      ped.position.set(x, 0, z);
      this.scene.add(ped);
      this.peds.push(ped);
    }
  }

  // Returns peds hit this frame (for wanted/combat bookkeeping).
  update(dt, playerPos, playerSpeed, gunshotAt) {
    // Traffic: cruise along its lane, stop if a car is close ahead.
    for (const mesh of this.cars) {
      const car = mesh.userData.car;
      let blocked = false;
      for (const other of this.cars) {
        if (other === mesh) continue;
        const dx = other.position.x - mesh.position.x;
        const dz = other.position.z - mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 9 && dist > 0.1) {
          const fwdX = -Math.sin(car.heading);
          const fwdZ = -Math.cos(car.heading);
          if (dx * fwdX + dz * fwdZ > 0) blocked = true;
        }
      }
      const target = blocked ? 0 : car.cruise;
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      mesh.position.x -= Math.sin(car.heading) * car.speed * dt;
      mesh.position.z -= Math.cos(car.heading) * car.speed * dt;
      // Wrap around the city edges.
      if (mesh.position.x > 215) mesh.position.x = -215;
      if (mesh.position.x < -215) mesh.position.x = 215;
      if (mesh.position.z > 220) mesh.position.z = -215;
      if (mesh.position.z < -215) mesh.position.z = 220;
      const spin = (car.speed * dt) / 0.36;
      for (const w of car.wheels) w.rotation.x += spin;
    }

    const hitPeds = [];
    for (const ped of this.peds) {
      const p = ped.userData.ped;
      if (p.state === "down") {
        p.downTimer -= dt;
        ped.rotation.x = -Math.PI / 2 + 0.12;
        if (p.downTimer <= 0) {
          // Get back up and wander off, shaken.
          p.state = "walk";
          ped.rotation.x = 0;
          p.fear = 0.5;
        }
        continue;
      }
      // Flee from a nearby gunshot or a fast car.
      let fleeX = 0;
      let fleeZ = 0;
      if (gunshotAt) {
        const dx = ped.position.x - gunshotAt.x;
        const dz = ped.position.z - gunshotAt.z;
        const d = Math.hypot(dx, dz);
        if (d < 40) {
          fleeX = dx / (d || 1);
          fleeZ = dz / (d || 1);
          p.fear = 1;
        }
      }
      if (playerSpeed > 8) {
        const dx = ped.position.x - playerPos.x;
        const dz = ped.position.z - playerPos.z;
        const d = Math.hypot(dx, dz);
        if (d < 7) {
          fleeX = dx / (d || 1);
          fleeZ = dz / (d || 1);
          p.fear = 1;
        }
      }
      p.timer -= dt;
      if (p.fear > 0) {
        p.heading = Math.atan2(-fleeX, -fleeZ);
        p.speed = 5.5;
        p.fear = Math.max(0, p.fear - dt * 0.2);
      } else if (p.timer <= 0) {
        p.heading = this.rng.range(0, Math.PI * 2);
        p.timer = this.rng.range(2, 7);
        p.speed = this.rng.range(1.2, 2.2);
      }
      const step = p.speed * dt;
      const nx = ped.position.x - Math.sin(p.heading) * step;
      const nz = ped.position.z - Math.cos(p.heading) * step;
      const before = { x: ped.position.x, z: ped.position.z };
      ped.position.x = nx;
      ped.position.z = nz;
      if (collideCircle(ped.position, 0.5, this.colliders)) {
        ped.position.x = before.x;
        ped.position.z = before.z;
        p.heading += Math.PI / 2;
      }
      ped.position.x = Math.max(-208, Math.min(208, ped.position.x));
      ped.position.z = Math.max(-208, Math.min(208, ped.position.z));
      ped.rotation.y = p.heading;
      // Walk bob.
      ped.position.y = Math.abs(Math.sin(performance.now() * 0.006 + p.heading)) * 0.05;

      // Hit by the player's car?
      const dxp = ped.position.x - playerPos.x;
      const dzp = ped.position.z - playerPos.z;
      if (Math.abs(playerSpeed) > 4 && Math.hypot(dxp, dzp) < 1.7) {
        p.state = "down";
        p.downTimer = 6;
        hitPeds.push(ped);
      }
    }
    return hitPeds;
  }

  scareAll(from) {
    for (const ped of this.peds) {
      const p = ped.userData.ped;
      const d = Math.hypot(ped.position.x - from.x, ped.position.z - from.z);
      if (d < 45) p.fear = 1;
    }
  }
}
