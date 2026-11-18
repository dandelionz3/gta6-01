// Vehicles for Solmar Bay: box-built car models plus arcade driving
// physics. Every car — player, traffic, police — is the same Car class,
// so a stolen traffic car drives exactly like the one you spawn in.
import * as THREE from 'three';
import { CFG } from './config.js';
import { collideCircle } from './world.js';

const CAR_COLORS = [0xc22a2a, 0x2a5ac2, 0xd8c22a, 0x3a3a3a, 0xe8e8e8, 0x2a8a4a, 0x8a2a7a, 0xc26a1a, 0x1a6a6a];

// Build a simple readable car from boxes: body, cabin, wheels, lights.
// `kind` picks the silhouette; `color` tints the body.
export function makeCarMesh(kind, color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x18202a });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });

  let bodyW = 2.0;
  let bodyH = 0.62;
  let bodyL = 4.4;
  let cabinH = 0.55;
  let cabinL = 2.1;
  let yBody = 0.55;
  if (kind === 'sports') {
    bodyW = 2.1; bodyH = 0.5; bodyL = 4.6; cabinH = 0.45; cabinL = 1.9; yBody = 0.48;
  } else if (kind === 'van') {
    bodyW = 2.1; bodyH = 1.15; bodyL = 5.2; cabinH = 0.9; cabinL = 2.6; yBody = 0.85;
  } else if (kind === 'taxi') {
    bodyW = 2.0; bodyH = 0.62; bodyL = 4.5; cabinH = 0.55; cabinL = 2.2; yBody = 0.55;
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), bodyMat);
  body.position.y = yBody;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.88, cabinH, cabinL), darkMat);
  cabin.position.set(0, yBody + bodyH / 2 + cabinH / 2 - 0.05, kind === 'van' ? -0.5 : -0.25);
  g.add(cabin);

  if (kind === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.4), darkMat);
    spoiler.position.set(0, yBody + 0.55, -bodyL / 2 + 0.15);
    g.add(spoiler);
    for (const sx of [-0.8, 0.8]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), darkMat);
      strut.position.set(sx, yBody + 0.38, -bodyL / 2 + 0.15);
      g.add(strut);
    }
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe14d }),
    );
    sign.position.set(0, yBody + bodyH / 2 + cabinH + 0.05, -0.25);
    g.add(sign);
  }
  if (kind === 'police') {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.4), darkMat);
    barBase.position.set(0, yBody + bodyH / 2 + cabinH + 0.02, -0.25);
    g.add(barBase);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.36),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    );
    red.position.set(-0.32, yBody + bodyH / 2 + cabinH + 0.14, -0.25);
    g.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.36),
      new THREE.MeshBasicMaterial({ color: 0x2040ff }),
    );
    blue.position.set(0.32, yBody + bodyH / 2 + cabinH + 0.14, -0.25);
    g.add(blue);
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
  }

  // Headlights + taillights: small emissive boxes so cars read at dusk.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    h.position.set(sx, yBody + 0.05, bodyL / 2 + 0.01);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tailMat);
    t.position.set(sx, yBody + 0.05, -bodyL / 2 - 0.01);
    g.add(t);
  }

  // Wheels: dark cylinders with a pale hub disc.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    tyre.rotation.z = Math.PI / 2;
    wheel.add(tyre);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    wheel.position.set(wx, 0.36, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  g.userData.wheels = wheels;
  g.userData.kind = kind;
  return g;
}

// One drivable car. Position lives on the mesh; heading is rotation.y;
// speed is signed (forward positive). Arcade model: accelerate, steer by
// speed, drag, handbrake, building collision, car-vs-car shove.
export class Car {
  constructor(kind, color, x = 0, z = 0, heading = 0) {
    this.kind = kind;
    this.group = makeCarMesh(kind, color);
    this.group.position.set(x, 0, z);
    this.heading = heading;
    this.group.rotation.y = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = CFG.car.health;
    this.maxSpeed = kind === 'sports' ? CFG.car.sportsMax : kind === 'van' ? CFG.car.vanMax : CFG.car.maxSpeed;
    this.driven = false;   // true while the player sits in it
    this.parked = false;
    this.stolen = false;
    this.smoke = [];
    this._smokeTimer = 0;
  }

  get pos() {
    return this.group.position;
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  get wrecked() {
    return this.health <= CFG.car.wreckBelow;
  }

  get smoking() {
    return this.health < CFG.car.smokeBelow && !this.wrecked;
  }

  // Player driving: input gives -1..1 throttle and steering.
  drive(dt, throttle, steerInput, handbrake, colliders, otherCars) {
    const C = CFG.car;
    if (this.wrecked) {
      this.speed *= Math.max(0, 1 - dt * 3);
    } else if (throttle > 0) {
      this.speed += C.accel * throttle * dt;
    } else if (throttle < 0) {
      // Reversing, or braking if still rolling forward.
      this.speed += this.speed > 0.5 ? -C.brake * dt : C.reverseAccel * throttle * dt;
    }
    if (handbrake) this.speed *= Math.max(0, 1 - dt * 4);
    // Drag + rolling resistance.
    this.speed -= this.speed * C.drag * dt;
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    this.speed = Math.max(-C.reverseMax, Math.min(this.maxSpeed, this.speed));

    // Steering scales with speed so the car feels planted at a crawl.
    const steerTarget = steerInput * C.steerMax * Math.min(1, Math.abs(this.speed) / 9);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * C.steerSpeed * 2);
    if (Math.abs(this.speed) > 0.1) {
      this.heading += (this.steer * this.speed * dt) / 3.2;
    }
    this.group.rotation.y = this.heading;

    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x = nx;
    this.pos.z = nz;
    collideCircle(this.pos, 1.7, colliders);
    // A hard building hit scrubs speed and hurts the car.
    const hitDist = Math.hypot(this.pos.x - before.x - Math.sin(this.heading) * this.speed * dt, this.pos.z - before.z - Math.cos(this.heading) * this.speed * dt);
    if (hitDist > 0.01 && Math.abs(this.speed) > 8) {
      this.damage(Math.abs(this.speed) * 0.35);
      this.speed *= 0.45;
    }
    // Soft shove away from other cars.
    for (const other of otherCars) {
      if (other === this) continue;
      const dx = this.pos.x - other.pos.x;
      const dz = this.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 3.4) {
        const push = (3.4 - d) * 0.5;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
        this.speed *= 0.96;
      }
    }
    // Stay inside the playable area.
    this.pos.x = Math.max(-248, Math.min(248, this.pos.x));
    this.pos.z = Math.max(-248, Math.min(248, this.pos.z));

    // Wheel spin + front-wheel steer visuals.
    const spin = (this.speed * dt) / 0.36;
    const wheels = this.group.userData.wheels;
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].children[0].rotation.x += spin;
      wheels[i].children[1].rotation.x += spin;
      if (i < 2) wheels[i].rotation.y = this.steer * 0.5;
    }
    this.updateSmoke(dt);
  }

  damage(amount) {
    if (this.wrecked) return;
    this.health -= amount;
    if (this.health < 0) this.health = 0;
  }

  repair(amount) {
    this.health = Math.min(CFG.car.health, this.health + amount);
  }

  // Grey puffs that rise and fade — spawned from the hood while smoking.
  updateSmoke(dt) {
    this._smokeTimer -= dt;
    if (this.smoking && this._smokeTimer <= 0) {
      this._smokeTimer = 0.09;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 }),
      );
      puff.position.set(this.pos.x, 1.2, this.pos.z);
      puff.userData.life = 1;
      this.group.parent.add(puff);
      this.smoke.push(puff);
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.userData.life -= dt * 0.9;
      p.position.y += dt * 2.2;
      p.scale.multiplyScalar(1 + dt * 1.6);
      p.material.opacity = Math.max(0, p.userData.life * 0.5);
      if (p.userData.life <= 0) {
        this.group.parent.remove(p);
        p.material.dispose();
        this.smoke.splice(i, 1);
      }
    }
  }

  dispose(scene) {
    for (const p of this.smoke) scene.remove(p);
    scene.remove(this.group);
  }
}

export function randomCarColor(rng) {
  return rng.pick(CAR_COLORS);
}
