// Cars: box-built meshes per kind + simple arcade driving physics.
// No external models — every vehicle is assembled from boxes, cylinders
// and a shared wheel geometry.
import * as THREE from "three";
import { CFG } from "./config.js";
import { RNG } from "./random.js";
import { collideCircle } from "./world.js";

export const CAR_KINDS = {
  sedan:   { len: 4.4, wid: 1.9, h: 1.15, topSpeed: 30, accel: 18, colour: 0x8a2f2f },
  sports:  { len: 4.2, wid: 1.9, h: 0.95, topSpeed: 40, accel: 26, colour: 0xe8a020 },
  taxi:    { len: 4.4, wid: 1.9, h: 1.2,  topSpeed: 28, accel: 17, colour: 0xe8c820 },
  van:     { len: 5.2, wid: 2.1, h: 1.9,  topSpeed: 24, accel: 14, colour: 0x5a6a7a },
  police:  { len: 4.5, wid: 1.95, h: 1.2, topSpeed: 36, accel: 24, colour: 0x1a1a22 },
  armored: { len: 5.6, wid: 2.2, h: 2.1,  topSpeed: 26, accel: 15, colour: 0x3a4a3a },
};

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });

export function makeCarMesh(kind, colourHex) {
  const spec = CAR_KINDS[kind] || CAR_KINDS.sedan;
  const colour = colourHex !== undefined ? colourHex : spec.colour;
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, spec.h * 0.62, spec.len), paint);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.86, spec.h * 0.55, spec.len * 0.5), glass);
  cabin.position.set(0, 0.55 + spec.h * 0.55, -spec.len * 0.05);
  g.add(cabin);
  // headlights + taillights
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xcc2211, emissive: 0xcc2211, emissiveIntensity: 0.8 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    hl.position.set(sx * spec.wid * 0.32, 0.62, spec.len / 2 + 0.02);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tl.position.set(sx * spec.wid * 0.32, 0.62, -spec.len / 2 - 0.02);
    g.add(tl);
  }
  if (kind === "police") {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2233ff, emissive: 0x2233ff, emissiveIntensity: 1.2 }));
    bar.position.set(0, 0.55 + spec.h * 0.85, 0);
    g.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.wid + 0.02, 0.3, spec.len * 0.7),
      new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 }));
    stripe.position.y = 0.55;
    g.add(stripe);
  }
  if (kind === "taxi") {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffe020, emissive: 0xffe020, emissiveIntensity: 0.7 }));
    sign.position.set(0, 0.55 + spec.h * 0.85, 0);
    g.add(sign);
  }
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx * (spec.wid / 2 - 0.05), 0.36, wz * (spec.len / 2 - 0.75));
    g.add(w);
    wheels.push(w);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, spec, paint };
}

// One drivable car: position, heading, speed, health, smoke.
export class Car {
  constructor(scene, kind, x, z, heading, colourHex) {
    this.kind = kind;
    this.mesh = makeCarMesh(kind, colourHex);
    this.scene = scene;
    this.pos = { x, z };
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = CFG.car.health;
    this.taken = false;
    this.smoke = null;
    this.smokeTimer = 0;
    scene.add(this.mesh.group);
    this.sync();
  }

  // Repaint the body (used by staged shots so the hero car reads clearly).
  repaint(hex) { this.mesh.paint.color.setHex(hex); }

  sync() {
    this.mesh.group.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.group.rotation.y = this.heading;
    for (const w of this.mesh.wheels) w.rotation.x += this.speed * 0.016;
  }

  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  // controls: { throttle: -1..1, steer: -1..1, brake, handbrake }
  drive(dt, controls, colliders) {
    const spec = this.mesh.spec;
    const maxF = spec.topSpeed;
    const maxR = CFG.car.maxReverse;
    if (controls.throttle > 0) this.speed += spec.accel * controls.throttle * dt;
    else if (controls.throttle < 0) {
      if (this.speed > 0.5) this.speed -= CFG.car.brake * dt; // brake first
      else this.speed += CFG.car.reverseAccel * controls.throttle * dt; // then reverse
    }
    if (controls.brake) this.speed -= Math.sign(this.speed) * CFG.car.brake * dt;
    // drag + rolling resistance
    this.speed -= this.speed * 0.55 * dt;
    if (Math.abs(this.speed) < 0.05 && controls.throttle === 0) this.speed = 0;
    this.speed = Math.max(-maxR, Math.min(maxF, this.speed));
    // steering scales with speed; handbrake loosens grip and swings the tail
    const grip = controls.handbrake ? CFG.car.handbrakeGrip : CFG.car.grip;
    const targetSteer = controls.steer * CFG.car.steerMax;
    this.steer += (targetSteer - this.steer) * Math.min(1, CFG.car.steerSpeed * dt);
    this.heading += this.steer * (this.speed / maxF) * grip * dt * (this.speed >= 0 ? 1 : -1);
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    const hit = collideCircle(this.pos, 1.4, colliders);
    if (hit) {
      if (Math.abs(this.speed) > 6) this.health -= Math.abs(this.speed) * 0.8;
      this.speed *= 0.35;
    }
    // keep inside the playable area (beach + ocean edge)
    this.pos.x = Math.max(-175, Math.min(175, this.pos.x));
    this.pos.z = Math.max(-175, Math.min(235, this.pos.z));
    this.sync();
    this._smoke(dt);
  }

  _smoke(dt) {
    if (this.health > CFG.car.smokeBelow || this.health <= 0) {
      if (this.smoke) { this.scene.remove(this.smoke); this.smoke = null; }
      return;
    }
    this.smokeTimer -= dt;
    if (!this.smoke) {
      // Small, faint puff trailing behind the car — never a ball on the roof.
      this.smoke = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x999999, transparent: true, opacity: 0.2 })
      );
      this.smoke.scale.set(1, 0.7, 1);
      this.scene.add(this.smoke);
    }
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.15;
      // Low faint puff at the tailpipe — below the roofline from behind.
      const f = this.forward();
      this.smoke.position.set(
        this.pos.x - f.x * 2.6 + (Math.random() - 0.5) * 0.5,
        0.6 + Math.random() * 0.3,
        this.pos.z - f.z * 2.6 + (Math.random() - 0.5) * 0.5
      );
      const s = 0.7 + Math.random() * 0.4;
      this.smoke.scale.set(s, s * 0.7, s);
    }
  }

  destroy() {
    if (this.smoke) this.scene.remove(this.smoke);
    this.scene.remove(this.mesh.group);
  }
}

// Parked cars dotted along the roads — the ones Rook can steal.
export function spawnParkedCars(scene, world) {
  const rng = new RNG(777);
  const kinds = ["sedan", "sedan", "sports", "taxi", "van", "sedan", "sports"];
  const colours = [0x8a2f2f, 0x2f5a8a, 0xd8d8d8, 0x2a2a2a, 0x7a4a8a, 0x3a7a4a];
  const cars = [];
  const centres = [-128, -64, 0, 64, 128];
  for (let i = 0; i < 14; i++) {
    const along = centres[i % centres.length];
    const cross = rng.range(-140, 140);
    const vertical = i % 2 === 0;
    const x = vertical ? along + 4.6 : cross;
    const z = vertical ? cross : along + 4.6;
    const heading = vertical ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    const car = new Car(scene, kinds[i % kinds.length], x, z, heading, rng.pick(colours));
    car.health = 100;
    cars.push(car);
  }
  return cars;
}
