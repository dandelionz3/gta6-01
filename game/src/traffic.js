// Street life for Solmar Bay: AI traffic cars cruising the grid and
// pedestrians strolling the sidewalks. Traffic follows road lines
// and brakes for the car ahead; pedestrians wander, scatter from
// gunfire, and go down if a car hits them.

import * as THREE from 'three';
import { CFG } from './config.js';
import { Car, CAR_COLORS } from './vehicles.js';

function makePedestrian(scene, rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({
    color: rng.pick([0xd86a5a, 0x5a8ad8, 0x6ad85a, 0xd8c86a, 0x9a5ad8, 0xe8e8e8]),
  });
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick([0xe0b088, 0x8a5a3a, 0xc89878]) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.32), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.75, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2a2d33 }),
  );
  legs.position.y = 0.38;
  group.add(legs);
  scene.add(group);
  return group;
}

export class Traffic {
  constructor(scene, rng, world, parkedCars) {
    this.scene = scene;
    this.rng = rng;
    this.world = world;
    this.parkedCars = parkedCars;
    this.cars = [];
    this.peds = [];
    this.events = []; // drained by main each frame: { type, pos }
    this.alarmPos = null; // gunfire / crime point pedestrians flee from

    for (let i = 0; i < CFG.traffic.cars; i++) {
      const line = rng.pick(world.roadLines);
      const along = rng.range(-180, 180);
      const kind = rng.pick(['sedan', 'sedan', 'taxi', 'van', 'sports']);
      const car = new Car(
        scene,
        kind,
        rng.pick(CAR_COLORS),
        line.axis === 'z' ? line.at + rng.pick([-3.4, 3.4]) : along,
        line.axis === 'z' ? along : line.at + rng.pick([-3.4, 3.4]),
        line.axis === 'z' ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2),
      );
      this.cars.push({
        car,
        axis: line.axis,
        at: line.at,
        along,
        dir: rng.chance(0.5) ? 1 : -1,
        speed: rng.range(7, 11),
      });
    }

    for (let i = 0; i < CFG.traffic.peds; i++) {
      const spot = rng.pick(world.sidewalks);
      const group = makePedestrian(scene, rng);
      group.position.set(spot.x, 0, spot.z);
      this.peds.push({
        group,
        target: rng.pick(world.sidewalks),
        speed: rng.range(1.2, 2.1),
        state: 'walk',
        downTimer: 0,
        bob: rng.range(0, Math.PI * 2),
      });
    }
  }

  raiseAlarm(pos) {
    this.alarmPos = { x: pos.x, z: pos.z };
  }

  clearAlarm() {
    this.alarmPos = null;
  }

  update(dt, playerPos, playerCar) {
    // --- traffic cars -------------------------------------------------
    for (const t of this.cars) {
      // brake when another traffic car is close ahead on the same line
      let blocked = false;
      for (const o of this.cars) {
        if (o === t || o.axis !== t.axis || Math.abs(o.at - t.at) > 7) continue;
        const gap = (o.along - t.along) * t.dir;
        if (gap > 0 && gap < 11) {
          blocked = true;
          break;
        }
      }
      const targetSpeed = blocked ? 0 : CFG.traffic.carSpeed;
      t.speed += (targetSpeed - t.speed) * Math.min(1, 2.5 * dt);
      t.along += t.dir * t.speed * dt;
      if (t.along > 195 || t.along < -195) {
        // reached the edge: turn onto a fresh road line
        const line = this.rng.pick(this.world.roadLines);
        t.axis = line.axis;
        t.at = line.at;
        t.along = this.rng.range(-180, 180);
        t.dir = this.rng.chance(0.5) ? 1 : -1;
      }
      const lane = t.dir > 0 ? 3.4 : -3.4;
      if (t.axis === 'z') {
        t.car.group.position.set(t.at + lane, 0, t.along);
        t.car.heading = t.dir > 0 ? 0 : Math.PI;
      } else {
        t.car.group.position.set(t.along, 0, t.at + lane);
        t.car.heading = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      t.car.group.rotation.y = t.car.heading;
      const spin = t.speed * dt * 2.6;
      for (const w of t.car.wheels) w.rotation.x += spin;
    }

    // --- pedestrians ----------------------------------------------------
    for (const p of this.peds) {
      if (p.state === 'down') {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          // gets back up far away and walks off
          const spot = this.rng.pick(this.world.sidewalks);
          p.group.position.set(spot.x, 0, spot.z);
          p.group.rotation.x = 0;
          p.state = 'walk';
          p.target = this.rng.pick(this.world.sidewalks);
        }
        continue;
      }
      let speed = p.speed;
      let tx = p.target.x;
      let tz = p.target.z;
      if (this.alarmPos) {
        const dx = p.group.position.x - this.alarmPos.x;
        const dz = p.group.position.z - this.alarmPos.z;
        const d = Math.hypot(dx, dz);
        if (d < 45) {
          speed = CFG.traffic.fleeSpeed;
          tx = p.group.position.x + (dx / (d || 1)) * 20;
          tz = p.group.position.z + (dz / (d || 1)) * 20;
        }
      }
      const dx = tx - p.group.position.x;
      const dz = tz - p.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) {
        if (this.alarmPos) {
          p.target = { x: p.group.position.x + this.rng.range(-30, 30), z: p.group.position.z + this.rng.range(-30, 30) };
        } else {
          p.target = this.rng.pick(this.world.sidewalks);
        }
      } else {
        const vx = (dx / dist) * speed * dt;
        const vz = (dz / dist) * speed * dt;
        p.group.position.x += vx;
        p.group.position.z += vz;
        p.group.rotation.y = Math.atan2(dx, dz);
        p.bob += dt * 8;
        p.group.position.y = Math.abs(Math.sin(p.bob)) * 0.05;
      }

      // hit by the player's car?
      if (playerCar && !playerCar.wrecked && Math.abs(playerCar.speed) > 3) {
        const cdx = p.group.position.x - playerCar.x;
        const cdz = p.group.position.z - playerCar.z;
        if (cdx * cdx + cdz * cdz < 4.4) {
          p.state = 'down';
          p.downTimer = 18;
          p.group.rotation.x = -Math.PI / 2;
          p.group.position.y = 0.35;
          this.events.push({ type: 'pedHit', pos: { x: p.group.position.x, z: p.group.position.z } });
        }
      }
    }
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // Positions for the minimap.
  dots() {
    return {
      cars: this.cars.map((t) => ({ x: t.car.x, z: t.car.z })),
      peds: this.peds.filter((p) => p.state !== 'down').map((p) => ({ x: p.group.position.x, z: p.group.position.z })),
    };
  }
}
