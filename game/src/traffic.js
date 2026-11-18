// AI traffic cars + pedestrians. Traffic follows the road grid between
// intersections; pedestrians stroll the sidewalks and flee from crime.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';
import { spawnCar, carForward, removeCar } from './vehicles.js';

const PED_SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c44a, 0x9a4ad8, 0xd87a4a, 0xeeeeee, 0x333333];

function makePedMesh(shirt) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 1.05, 8),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }),
  );
  head.position.y = 1.7;
  head.castShadow = true;
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3240 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), legMat);
  legL.position.set(-0.14, 0.25, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(body, head, legL, legR);
  g.userData.legs = [legL, legR];
  return g;
}

function pickNextTarget(rng, lines, x, z, heading) {
  // next intersection along the current axis, then a random turn
  const half = CFG.world.half;
  const step = CFG.world.block;
  const fwdX = Math.sin(heading);
  const fwdZ = Math.cos(heading);
  let tx = x;
  let tz = z;
  if (Math.abs(fwdX) > Math.abs(fwdZ)) {
    tx = x + Math.sign(fwdX) * step;
    if (tx > half) tx = x - step;
    if (tx < -half) tx = x + step;
  } else {
    tz = z + Math.sign(fwdZ) * step;
    if (tz > half) tz = z - step;
    if (tz < -half) tz = z + step;
  }
  // at the intersection, sometimes turn onto the cross road
  if (rng.chance(0.45)) {
    const turn = rng.either(-1, 1);
    if (Math.abs(fwdX) > Math.abs(fwdZ)) tz = z + turn * step;
    else tx = x + turn * step;
  }
  return { x: tx, z: tz };
}

export class Traffic {
  constructor(scene, world, seed = 1) {
    this.scene = scene;
    this.world = world;
    this.rng = new Rng(seed);
    this.cars = [];
    this.peds = [];
    this.crime = { x: 0, z: 0, t: -100 }; // last crime pulse
    this.time = 0;
  }

  spawnInitial() {
    const lines = this.world.lines;
    const kinds = ['sedan', 'sedan', 'taxi', 'van', 'sedan', 'sports'];
    for (let i = 0; i < CFG.traffic.cars; i++) {
      const horizontal = this.rng.chance(0.5);
      const line = this.rng.pick(lines);
      const along = this.rng.range(-190, 190);
      const heading = horizontal
        ? (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
        : (this.rng.chance(0.5) ? 0 : Math.PI);
      const x = horizontal ? along : line + (heading === 0 ? 3 : -3);
      const z = horizontal ? line + (Math.abs(heading - Math.PI / 2) < 0.1 ? 3 : -3) : along;
      const car = spawnCar(
        this.scene, this.rng.pick(kinds), x, z, heading,
        this.rng.pick([0xc23b2e, 0x2e6fc2, 0xd8d8d8, 0x22262b, 0xe8a13a, 0x3a9a5a]),
      );
      car.ai = { target: pickNextTarget(this.rng, lines, x, z, heading), speed: this.rng.range(8, 13) };
      this.cars.push(car);
    }
    for (let i = 0; i < CFG.traffic.peds; i++) {
      const line = this.rng.pick(lines);
      const along = this.rng.range(-190, 190);
      const onSide = this.rng.chance(0.5);
      const x = onSide ? line + 9 : along;
      const z = onSide ? along : line + 9;
      this.spawnPed(x, z);
    }
  }

  spawnPed(x, z) {
    const mesh = makePedMesh(this.rng.pick(PED_SHIRTS));
    mesh.position.set(x, 0, z);
    mesh.rotation.y = this.rng.range(0, Math.PI * 2);
    this.scene.add(mesh);
    const ped = {
      mesh, x, z, heading: mesh.rotation.y,
      speed: this.rng.range(1.1, 2.0),
      target: null, fleeing: false, fallen: false, fallTimer: 0, walkPhase: this.rng.range(0, 6),
    };
    ped.target = this.pedTarget(ped);
    this.peds.push(ped);
    return ped;
  }

  pedTarget(ped) {
    const p = this.world.nearestRoadPoint(ped.x, ped.z);
    return {
      x: p.x + this.rng.range(-40, 40) + (Math.abs(p.x - ped.x) < 8 ? 9 : 0),
      z: p.z + this.rng.range(-40, 40) + (Math.abs(p.z - ped.z) < 8 ? 9 : 0),
    };
  }

  reportCrime(x, z) {
    this.crime = { x, z, t: this.time };
  }

  nearestCar(x, z, maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of this.cars) {
      const dx = car.group.position.x - x;
      const dz = car.group.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    removeCar(this.scene, car);
  }

  update(dt, playerPos, playerSpeed) {
    this.time += dt;
    const events = [];
    const lines = this.world.lines;

    // --- traffic cars ---
    for (const car of this.cars) {
      const pos = car.group.position;
      const dx = car.ai.target.x - pos.x;
      const dz = car.ai.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        car.ai.target = pickNextTarget(this.rng, lines, pos.x, pos.z, car.heading);
        continue;
      }
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
      // brake if something is ahead
      let targetSpeed = car.ai.speed;
      const fwd = carForward(car);
      for (const other of this.cars) {
        if (other === car) continue;
        const ox = other.group.position.x - pos.x;
        const oz = other.group.position.z - pos.z;
        const along = ox * fwd.x + oz * fwd.z;
        const side = Math.abs(ox * fwd.z - oz * fwd.x);
        if (along > 0 && along < CFG.traffic.brakeGap && side < 2.4) { targetSpeed = 0; break; }
      }
      if (playerPos) {
        const px = playerPos.x - pos.x;
        const pz = playerPos.z - pos.z;
        const along = px * fwd.x + pz * fwd.z;
        const side = Math.abs(px * fwd.z - pz * fwd.x);
        if (along > 0 && along < 6 && side < 2.4 && Math.abs(playerSpeed) > 1) targetSpeed = 0;
      }
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      pos.x += Math.sin(car.heading) * car.speed * dt;
      pos.z += Math.cos(car.heading) * car.speed * dt;
      car.group.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.35;
      for (const w of car.wheels) { w.wheel.rotation.y += spin; w.hub.rotation.y += spin; }
      // respawn at the far edge if it somehow leaves the city
      if (Math.abs(pos.x) > this.world.bounds + 20 || Math.abs(pos.z) > this.world.bounds + 20) {
        const line = this.rng.pick(lines);
        pos.x = this.rng.range(-180, 180);
        pos.z = line;
        car.heading = this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
        car.ai.target = pickNextTarget(this.rng, lines, pos.x, pos.z, car.heading);
      }
    }

    // --- pedestrians ---
    const crimeFresh = this.time - this.crime.t < 6;
    for (const ped of this.peds) {
      if (ped.fallen) {
        ped.fallTimer += dt;
        if (ped.fallTimer > 14) {
          ped.fallen = false;
          ped.fallTimer = 0;
          ped.mesh.rotation.z = 0;
          ped.mesh.position.y = 0;
        }
        continue;
      }
      const dxC = ped.x - this.crime.x;
      const dzC = ped.z - this.crime.z;
      const crimeDist = Math.hypot(dxC, dzC);
      let tx = ped.target.x;
      let tz = ped.target.z;
      let speed = ped.speed;
      if (crimeFresh && crimeDist < 26) {
        ped.fleeing = true;
        tx = ped.x + (dxC / (crimeDist || 1)) * 30;
        tz = ped.z + (dzC / (crimeDist || 1)) * 30;
        speed = 4.2;
      } else {
        ped.fleeing = false;
      }
      const dx = tx - ped.x;
      const dz = tz - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2) {
        ped.target = this.pedTarget(ped);
      } else {
        const desired = Math.atan2(dx, dz);
        ped.heading = desired;
        ped.x += Math.sin(desired) * speed * dt;
        ped.z += Math.cos(desired) * speed * dt;
        ped.walkPhase += dt * speed * 3.2;
        const swing = Math.sin(ped.walkPhase) * 0.45;
        ped.mesh.userData.legs[0].rotation.x = swing;
        ped.mesh.userData.legs[1].rotation.x = -swing;
      }
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
    return events;
  }
}
