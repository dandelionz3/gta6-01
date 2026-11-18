// Cars for Solmar Bay: box-built models, arcade driving physics,
// parked cars, damage and smoke. A car is a THREE group plus a small
// physics state; the same builder serves the player, traffic and the
// police, so every vehicle on the street looks like it belongs.

import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';

export const CAR_COLORS = [
  0xc23b2a, 0x2a6ac2, 0x2a9a4a, 0xd8c86a, 0xe8e8e8,
  0x1c1e20, 0x7a3aa0, 0xc27a2a, 0x3aa0a0, 0x8a8a8a,
];

const KIND_DIMS = {
  sedan: { body: [1.9, 0.62, 4.3], cabin: [1.7, 0.55, 2.1], cabinZ: -0.25, y: 0.55 },
  sports: { body: [1.95, 0.5, 4.4], cabin: [1.6, 0.45, 1.8], cabinZ: -0.35, y: 0.48 },
  taxi: { body: [1.9, 0.62, 4.3], cabin: [1.7, 0.55, 2.1], cabinZ: -0.25, y: 0.55 },
  van: { body: [2.0, 1.5, 4.9], cabin: null, cabinZ: 0, y: 0.95 },
  police: { body: [1.9, 0.62, 4.3], cabin: [1.7, 0.55, 2.1], cabinZ: -0.25, y: 0.55 },
  armoured: { body: [2.1, 1.7, 5.2], cabin: null, cabinZ: 0, y: 1.0 },
};

export function buildCarMesh(kind, colorHex) {
  const dims = KIND_DIMS[kind] || KIND_DIMS.sedan;
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.35,
    metalness: 0.55,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x18222e,
    roughness: 0.15,
    metalness: 0.8,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(...dims.body), paint);
  body.position.y = dims.y;
  body.castShadow = true;
  group.add(body);

  if (dims.cabin) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(...dims.cabin), glass);
    cabin.position.set(0, dims.y + dims.body[1] / 2 + dims.cabin[1] / 2 - 0.05, dims.cabinZ);
    cabin.castShadow = true;
    group.add(cabin);
  }

  if (kind === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), paint);
    spoiler.position.set(0, dims.y + 0.62, -2.05);
    group.add(spoiler);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    );
    sign.position.set(0, dims.y + 1.15, -0.25);
    group.add(sign);
  }
  if (kind === 'police') {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.35), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    barBase.position.set(0, dims.y + 1.18, -0.25);
    group.add(barBase);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.32),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    );
    red.position.set(-0.28, dims.y + 1.26, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.32),
      new THREE.MeshBasicMaterial({ color: 0x2a6aff }),
    );
    blue.position.set(0.28, dims.y + 1.26, -0.25);
    group.add(blue);
  }

  // headlights + taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  const lightGeo = new THREE.BoxGeometry(0.34, 0.14, 0.08);
  for (const sx of [-0.62, 0.62]) {
    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(sx, dims.y, dims.body[2] / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(lightGeo, tailMat);
    tail.position.set(sx, dims.y, -dims.body[2] / 2 - 0.02);
    group.add(tail);
  }

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  const halfLen = dims.body[2] / 2 - 0.75;
  for (const [wx, wz] of [[-0.95, halfLen], [0.95, halfLen], [-0.95, -halfLen], [0.95, -halfLen]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  return { group, wheels };
}

function circleHitsCollider(x, z, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return c;
  }
  return null;
}

export function resolveCircle(x, z, radius, colliders) {
  // Pushes a circle out of the first collider it overlaps. Returns
  // the collider hit, or null when the spot is clear.
  const hit = circleHitsCollider(x, z, radius, colliders);
  if (!hit) return null;
  const cx = Math.max(hit.minX, Math.min(x, hit.maxX));
  const cz = Math.max(hit.minZ, Math.min(z, hit.maxZ));
  let dx = x - cx;
  let dz = z - cz;
  if (dx === 0 && dz === 0) {
    // centre is inside the box: push out along the smallest overlap
    const pushL = x - hit.minX;
    const pushR = hit.maxX - x;
    const pushU = z - hit.minZ;
    const pushD = hit.maxZ - z;
    const m = Math.min(pushL, pushR, pushU, pushD);
    if (m === pushL) dx = -1;
    else if (m === pushR) dx = 1;
    else if (m === pushU) dz = -1;
    else dz = 1;
  }
  const len = Math.hypot(dx, dz) || 1;
  const nx = dx / len;
  const nz = dz / len;
  const overlap = radius - Math.hypot(x - cx, z - cz);
  return { collider: hit, nx, nz, depth: Math.max(overlap, 0.05) };
}

export class Car {
  constructor(scene, kind, colorHex, x, z, heading = 0) {
    this.scene = scene;
    this.kind = kind;
    this.colorHex = colorHex;
    const built = buildCarMesh(kind, colorHex);
    this.group = built.group;
    this.wheels = built.wheels;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    scene.add(this.group);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = CFG.car.maxHealth;
    this.wrecked = false;
    this.smoke = [];
    this.smokeTimer = 0;
    this.driven = false; // true once the player has stolen this one
    const smokeGeo = new THREE.SphereGeometry(0.5, 6, 5);
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(
        smokeGeo,
        new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0 }),
      );
      puff.visible = false;
      scene.add(puff);
      this.smoke.push({ mesh: puff, life: 0 });
    }
  }

  get x() {
    return this.group.position.x;
  }

  get z() {
    return this.group.position.z;
  }

  setPos(x, z, heading) {
    this.group.position.set(x, 0, z);
    this.heading = heading;
    this.group.rotation.y = heading;
    this.speed = 0;
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.wrecked) {
      this.wrecked = true;
      this.speed = 0;
    }
  }

  // Arcade drive step. ctrl: { throttle: -1..1, steer: -1..1, handbrake }.
  drive(dt, ctrl, colliders) {
    if (this.wrecked) {
      this.speed *= Math.max(0, 1 - 4 * dt);
      return;
    }
    const C = CFG.car;
    const prevSpeed = this.speed;
    if (ctrl.throttle > 0) this.speed += C.accel * ctrl.throttle * dt;
    else if (ctrl.throttle < 0) {
      if (this.speed > 0.5) this.speed -= C.brake * dt;
      else this.speed += C.reverseAccel * ctrl.throttle * dt;
    }
    if (ctrl.handbrake) this.speed *= Math.max(0, 1 - 3.2 * dt);
    this.speed -= this.speed * C.drag * 0.12 * dt;
    this.speed = Math.max(-C.maxReverse, Math.min(C.maxSpeed, this.speed));

    const targetSteer = ctrl.steer * C.steerAngle;
    this.steer += (targetSteer - this.steer) * Math.min(1, C.steerSpeed * 3 * dt);
    const speedFactor = Math.min(1, Math.abs(this.speed) / 12);
    this.heading += this.steer * speedFactor * Math.sign(this.speed || 1) * dt * 1.6;

    const nx = this.group.position.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.group.position.z + Math.cos(this.heading) * this.speed * dt;
    const hit = resolveCircle(nx, nz, 1.7, colliders);
    if (hit) {
      this.group.position.x = nx + hit.nx * hit.depth;
      this.group.position.z = nz + hit.nz * hit.depth;
      if (Math.abs(prevSpeed) > 14) this.damage((Math.abs(prevSpeed) - 14) * 1.2);
      this.speed *= 0.45;
    } else {
      this.group.position.x = nx;
      this.group.position.z = nz;
    }
    // stay inside the map, off the deep water
    this.group.position.x = Math.max(-205, Math.min(205, this.group.position.x));
    this.group.position.z = Math.max(-205, Math.min(232, this.group.position.z));
    this.group.rotation.y = this.heading;

    const spin = this.speed * dt * 2.6;
    for (const w of this.wheels) w.rotation.x += spin;
    this.updateSmoke(dt);
  }

  updateSmoke(dt) {
    const smoking = this.health < 40 && !this.wrecked;
    const wreckSmoke = this.wrecked;
    this.smokeTimer -= dt;
    if ((smoking || wreckSmoke) && this.smokeTimer <= 0) {
      this.smokeTimer = 0.22;
      const puff = this.smoke.find((p) => p.life <= 0);
      if (puff) {
        puff.life = 1;
        puff.mesh.visible = true;
        puff.mesh.position.set(this.x + (Math.random() - 0.5), 1.2, this.z + (Math.random() - 0.5));
        puff.mesh.material.opacity = 0.55;
        puff.mesh.scale.setScalar(0.6);
      }
    }
    for (const puff of this.smoke) {
      if (puff.life <= 0) continue;
      puff.life -= dt * 0.9;
      puff.mesh.position.y += dt * 1.6;
      puff.mesh.scale.setScalar(0.6 + (1 - puff.life) * 1.4);
      puff.mesh.material.opacity = Math.max(0, puff.life * 0.55);
      if (puff.life <= 0) puff.mesh.visible = false;
    }
  }

  remove() {
    this.scene.remove(this.group);
    for (const puff of this.smoke) this.scene.remove(puff.mesh);
  }
}

export function spawnParkedCars(scene, rng, colliders, count = 10) {
  const parked = [];
  const kinds = ['sedan', 'sedan', 'sports', 'taxi', 'van', 'sedan'];
  const spots = [];
  for (const at of [-160, -80, 0, 80, 160]) {
    for (let d = -180; d <= 180; d += 40) {
      spots.push({ x: at + 5.2, z: d, heading: 0 });
      spots.push({ x: at - 5.2, z: d + 20, heading: Math.PI });
      spots.push({ x: d, z: at + 5.2, heading: Math.PI / 2 });
      spots.push({ x: d + 20, z: at - 5.2, heading: -Math.PI / 2 });
    }
  }
  // shuffle the spot list with the seeded rng
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (let i = 0; i < count && i < spots.length; i++) {
    const s = spots[i];
    const car = new Car(scene, kinds[i % kinds.length], rng.pick(CAR_COLORS), s.x, s.z, s.heading);
    parked.push(car);
  }
  return parked;
}
