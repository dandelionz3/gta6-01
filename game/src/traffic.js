// Traffic and pedestrians for Solmar Bay. AI cars cruise the road grid,
// brake for the car ahead, and turn at intersections; pedestrians stroll
// the sidewalks, scatter when they hear a gunshot, and go down when a
// car clips them.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';
import { Car, randomCarColor } from './vehicles.js';
import { collideCircle } from './world.js';

const ROAD_LINES = [-220, -165, -110, -55, 0, 55, 110, 165, 220];
const SHIRT_COLORS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c24a, 0xe8e8e8, 0x7a4ad8, 0x4ad8c2, 0x333333];

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// A tiny box-built walker: torso, head, two legs that swing while walking.
export function makePedMesh(shirtColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a64 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3440 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), shirt);
  torso.position.y = 1.05;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.62;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), pants);
  legL.position.set(-0.14, 0.36, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  return g;
}

class Ped {
  constructor(scene, rng, x, z) {
    this.group = makePedMesh(rng.pick(SHIRT_COLORS));
    this.group.userData.owner = 'ped';
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.heading = rng.range(0, Math.PI * 2);
    this.speed = CFG.traffic.pedSpeed * rng.range(0.8, 1.3);
    this.walkPhase = rng.range(0, 6);
    this.state = 'walk'; // walk | flee | down
    this.stateTimer = 0;
    this.target = null;
    this.alive = true;
  }

  // Pick a fresh sidewalk stroll target near the current spot.
  pickStrollTarget(rng) {
    const line = rng.pick(ROAD_LINES);
    const along = rng.range(-210, 195);
    const side = rng.pick([-1, 1]);
    if (rng.chance(0.5)) this.target = { x: line + side * 9.2, z: along };
    else this.target = { x: along, z: line + side * 9.2 };
  }

  update(dt, rng, threat) {
    if (this.state === 'down') {
      this.stateTimer -= dt;
      return;
    }
    if (threat && this.state !== 'flee') {
      const d = Math.hypot(this.group.position.x - threat.x, this.group.position.z - threat.z);
      if (d < 34) {
        this.state = 'flee';
        this.stateTimer = 3;
        this.fleeFrom = { x: threat.x, z: threat.z };
      }
    }
    if (this.state === 'flee') {
      this.stateTimer -= dt;
      const p = this.group.position;
      const dx = p.x - this.fleeFrom.x;
      const dz = p.z - this.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      this.heading = Math.atan2(dx / d, dz / d);
      p.x += Math.sin(this.heading) * CFG.traffic.fleeSpeed * dt;
      p.z += Math.cos(this.heading) * CFG.traffic.fleeSpeed * dt;
      this.walkPhase += dt * 11;
      if (this.stateTimer <= 0) this.state = 'walk';
    } else {
      if (!this.target) this.pickStrollTarget(rng);
      const p = this.group.position;
      const dx = this.target.x - p.x;
      const dz = this.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        this.pickStrollTarget(rng);
      } else {
        this.heading = Math.atan2(dx / d, dz / d);
        p.x += Math.sin(this.heading) * this.speed * dt;
        p.z += Math.cos(this.heading) * this.speed * dt;
        this.walkPhase += dt * 7;
      }
    }
    this.group.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.group.userData.legL.rotation.x = swing;
    this.group.userData.legR.rotation.x = -swing;
    // Keep walkers out of building footprints.
    collideCircle(this.group.position, 0.5, this._colliders);
  }

  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.stateTimer = 4;
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.35;
  }

  respawn(rng, colliders) {
    this.state = 'walk';
    this.stateTimer = 0;
    this.group.rotation.x = 0;
    this.group.position.y = 0;
    const line = rng.pick(ROAD_LINES);
    const along = rng.range(-210, 195);
    this.group.position.set(line + 9.2, 0, along);
    this.target = null;
    this._colliders = colliders;
  }
}

export class Traffic {
  constructor(scene, world, seed = 1337) {
    this.scene = scene;
    this.world = world;
    this.rng = new Rng(seed + 77);
    this.colliders = world.colliders;
    this.drivers = [];
    this.parked = [];
    this.peds = [];
    this.threat = null;      // {x, z} of the latest gunshot
    this.onPedHit = null;    // callback(ped) — crime + score hooks
    this.onCarStolen = null;

    // Parked cars along the kerbs: the ones the player can steal.
    const kinds = ['sedan', 'sedan', 'sports', 'taxi', 'van', 'sedan', 'sports', 'sedan', 'taxi', 'van'];
    for (let i = 0; i < 10; i++) {
      const spot = world.parkedSpots[i % world.parkedSpots.length];
      const car = new Car(kinds[i % kinds.length], randomCarColor(this.rng), spot.x, spot.z, spot.heading);
      car.parked = true;
      scene.add(car.group);
      this.parked.push(car);
    }
    // Moving traffic.
    for (let i = 0; i < CFG.traffic.cars; i++) {
      const line = this.rng.pick(ROAD_LINES);
      const along = this.rng.range(-210, 210);
      const axis = this.rng.chance(0.5) ? 'x' : 'z';
      const dir = this.rng.pick([-1, 1]);
      const car = new Car(this.rng.pick(['sedan', 'sedan', 'taxi', 'van']), randomCarColor(this.rng), 0, 0, 0);
      if (axis === 'x') {
        car.group.position.set(along, 0, line + dir * 2.4);
        car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.group.position.set(line + dir * 2.4, 0, along);
        car.heading = dir > 0 ? 0 : Math.PI;
      }
      car.group.rotation.y = car.heading;
      car.speed = CFG.traffic.carSpeed * this.rng.range(0.8, 1.1);
      car._axis = axis;
      car._dir = dir;
      car._line = line;
      scene.add(car.group);
      this.drivers.push(car);
    }
    // Pedestrians on the sidewalks.
    for (let i = 0; i < CFG.traffic.peds; i++) {
      const line = this.rng.pick(ROAD_LINES);
      const along = this.rng.range(-210, 195);
      const ped = new Ped(scene, this.rng, line + 9.2, along);
      ped._colliders = this.colliders;
      ped.pickStrollTarget(this.rng);
      this.peds.push(ped);
    }
  }

  allCars() {
    return this.drivers.concat(this.parked);
  }

  nearestCar(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.allCars()) {
      if (car.wrecked) continue;
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  gunshot(pos) {
    this.threat = { x: pos.x, z: pos.z };
  }

  update(dt, playerPos, playerCar) {
    // --- AI drivers ------------------------------------------------------
    for (const car of this.drivers) {
      const p = car.pos;
      // Next intersection along the current axis.
      const ahead = car._axis === 'x' ? p.x + car._dir * 30 : p.z + car._dir * 30;
      let target;
      if (car._axis === 'x') {
        const nextLine = ROAD_LINES.reduce((a, b) => (Math.abs(b - ahead) < Math.abs(a - ahead) ? b : a), ROAD_LINES[0]);
        target = { x: nextLine, z: car._line + car._dir * 2.4 };
      } else {
        const nextLine = ROAD_LINES.reduce((a, b) => (Math.abs(b - ahead) < Math.abs(a - ahead) ? b : a), ROAD_LINES[0]);
        target = { x: car._line + car._dir * 2.4, z: nextLine };
      }
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 7) {
        // Reached the intersection: usually carry on, sometimes turn.
        if (this.rng.chance(0.35)) {
          const oldAxis = car._axis;
          car._axis = oldAxis === 'x' ? 'z' : 'x';
          car._dir = this.rng.pick([-1, 1]);
          car._line = oldAxis === 'x' ? Math.round(p.z / 55) * 55 : Math.round(p.x / 55) * 55;
          // Snap the line to a real road line.
          car._line = ROAD_LINES.reduce((a, b) => (Math.abs(b - car._line) < Math.abs(a - car._line) ? b : a), ROAD_LINES[0]);
        } else {
          // Carry on straight: re-anchor the line to the road we are on.
          const here = car._axis === 'x' ? p.z : p.x;
          car._line = ROAD_LINES.reduce((a, b) => (Math.abs(b - here) < Math.abs(a - here) ? b : a), ROAD_LINES[0]);
        }
      }
      // Brake if something is right ahead.
      let blocked = false;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      for (const other of this.allCars()) {
        if (other === car) continue;
        const ox = other.pos.x - p.x;
        const oz = other.pos.z - p.z;
        const along = ox * fx + oz * fz;
        const side = Math.abs(ox * fz - oz * fx);
        if (along > 0 && along < 10 && side < 2.6) {
          blocked = true;
          break;
        }
      }
      if (playerCar && playerCar !== car) {
        const ox = playerCar.pos.x - p.x;
        const oz = playerCar.pos.z - p.z;
        const along = ox * fx + oz * fz;
        const side = Math.abs(ox * fz - oz * fx);
        if (along > 0 && along < 10 && side < 2.6) blocked = true;
      }
      const desiredHeading = Math.atan2(dx, dz);
      const steer = Math.max(-1, Math.min(1, wrapAngle(desiredHeading - car.heading) * 1.8));
      const targetSpeed = blocked ? 0 : CFG.traffic.carSpeed;
      const throttle = car.speed < targetSpeed ? 0.55 : car.speed > targetSpeed + 1 ? -0.6 : 0;
      car.drive(dt, throttle, steer, false, this.colliders, this.allCars());
    }

    // --- pedestrians ------------------------------------------------------
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.stateTimer -= dt;
        if (ped.stateTimer <= 0) ped.respawn(this.rng, this.colliders);
        continue;
      }
      ped.update(dt, this.rng, this.threat);
      // Player car clipping a pedestrian knocks them down.
      if (playerCar && Math.abs(playerCar.speed) > 4) {
        const d = Math.hypot(ped.group.position.x - playerCar.pos.x, ped.group.position.z - playerCar.pos.z);
        if (d < 2.0) {
          ped.knockDown();
          if (this.onPedHit) this.onPedHit(ped);
        }
      }
    }
    // Gunshot echoes fade after a few seconds.
    if (this.threat) {
      this._threatTimer = (this._threatTimer || 0) + dt;
      if (this._threatTimer > 5) {
        this.threat = null;
        this._threatTimer = 0;
      }
    }
  }

  // Minimap dots: [x, z] pairs for cars and pedestrians.
  dots() {
    return {
      cars: this.drivers.map((c) => [c.pos.x, c.pos.z]),
      peds: this.peds.filter((p) => p.state !== 'down').map((p) => [p.group.position.x, p.group.position.z]),
    };
  }
}
