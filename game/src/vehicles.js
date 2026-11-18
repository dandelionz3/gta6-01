// Car models (box-built) + driving physics + parked cars.
// Every car is a THREE.Group with a `userData.car` record attached.

import * as THREE from "three";
import { CAR, COLORS } from "./config.js";
import { collideCircle } from "./world.js";

const BODY_COLORS = [0xc23b2e, 0x2e6fb0, 0xe8c832, 0x3a3f45, 0xd8d8d8, 0x4a7a4a, 0x7a4a8a, 0xb0682a];
const GLASS = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
const TYRE = new THREE.MeshLambertMaterial({ color: 0x141414 });
const LIGHT_FRONT = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
const LIGHT_REAR = new THREE.MeshBasicMaterial({ color: 0xd02020 });
const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.45 });

let bodyGeo;
let cabinGeo;
let wheelGeo;
let boxGeoSmall;

function geoms() {
  if (!bodyGeo) {
    bodyGeo = new THREE.BoxGeometry(1, 1, 1);
    cabinGeo = new THREE.BoxGeometry(1, 1, 1);
    wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    boxGeoSmall = new THREE.BoxGeometry(1, 1, 1);
  }
}

export function buildCarMesh(kind, colorHex) {
  geoms();
  const g = new THREE.Group();
  g.name = `car-${kind}`;
  const dims =
    kind === "sports"
      ? { w: 1.9, h: 0.55, l: 4.3, cabin: 0.9 }
      : kind === "van"
        ? { w: 2.0, h: 1.0, l: 4.8, cabin: 1.5 }
        : kind === "police"
          ? { w: 1.95, h: 0.62, l: 4.5, cabin: 1.0 }
          : { w: 1.9, h: 0.6, l: 4.4, cabin: 1.0 };
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const body = new THREE.Mesh(bodyGeo, paint);
  body.scale.set(dims.w, dims.h, dims.l);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(cabinGeo, GLASS);
  cabin.scale.set(dims.w * 0.82, dims.cabin * 0.6, dims.l * 0.42);
  cabin.position.set(0, 0.55 + dims.h / 2 + dims.cabin * 0.28, -dims.l * 0.05);
  g.add(cabin);
  if (kind === "taxi") {
    const sign = new THREE.Mesh(boxGeoSmall, new THREE.MeshBasicMaterial({ color: 0xffd233 }));
    sign.scale.set(0.7, 0.22, 0.5);
    sign.position.set(0, 1.45, -0.2);
    g.add(sign);
  }
  if (kind === "police") {
    const bar = new THREE.Mesh(boxGeoSmall, new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.scale.set(1.2, 0.18, 0.5);
    bar.position.set(0, 1.35, -0.2);
    bar.name = "lightbar";
    g.add(bar);
    g.userData.lightbar = bar;
  }
  // Headlights + taillights.
  for (const sx of [-1, 1]) {
    const fl = new THREE.Mesh(boxGeoSmall, LIGHT_FRONT);
    fl.scale.set(0.35, 0.14, 0.1);
    fl.position.set(sx * (dims.w / 2 - 0.3), 0.55, -dims.l / 2 - 0.02);
    g.add(fl);
    const rl = new THREE.Mesh(boxGeoSmall, LIGHT_REAR);
    rl.scale.set(0.35, 0.14, 0.1);
    rl.position.set(sx * (dims.w / 2 - 0.3), 0.55, dims.l / 2 + 0.02);
    g.add(rl);
  }
  // Wheels.
  const wheels = [];
  for (const [wx, wz] of [
    [-0.85, -1.45],
    [0.85, -1.45],
    [-0.85, 1.45],
    [0.85, 1.45],
  ]) {
    const w = new THREE.Mesh(wheelGeo, TYRE);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  // Smoke puff shown when wrecked.
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), SMOKE_MAT);
  smoke.position.set(0, 1.1, -1.2);
  smoke.visible = false;
  smoke.name = "smoke";
  g.add(smoke);

  g.userData.car = {
    kind,
    color: colorHex,
    speed: 0,
    heading: 0,
    health: 100,
    steering: 0,
    wheels,
    smoke,
    parked: false,
    ai: false,
  };
  return g;
}

export function spawnParkedCars(scene, rng, colliders, count = 26) {
  const cars = [];
  const pitch = 56;
  for (let n = 0; n < count; n++) {
    const kind = rng.pick(["sedan", "sedan", "sports", "taxi", "van"]);
    const color = rng.pick(BODY_COLORS);
    const mesh = buildCarMesh(kind, color);
    const along = rng.pick([-4, -3, -2, -1, 0, 1, 2, 3, 4]) * pitch;
    const side = rng.pick([-1, 1]);
    const vertical = rng.chance(0.5);
    let x;
    let z;
    let heading;
    if (vertical) {
      x = along + side * 4.6;
      z = rng.range(-190, 185);
      heading = side > 0 ? 0 : Math.PI;
    } else {
      x = rng.range(-190, 185);
      z = along + side * 4.6;
      heading = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    mesh.userData.car.heading = heading;
    mesh.userData.car.parked = true;
    scene.add(mesh);
    cars.push(mesh);
  }
  return cars;
}

// Arcade driving: accelerate / brake / reverse / steer / handbrake drift.
export function driveCar(mesh, input, dt, colliders) {
  const car = mesh.userData.car;
  const fwd = input.down("KeyW");
  const back = input.down("KeyS");
  const left = input.down("KeyA");
  const right = input.down("KeyD");
  const handbrake = input.down("Space");

  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  car.steering += (steerTarget * CAR.steerAngle - car.steering) * Math.min(1, dt * 8);

  if (fwd) car.speed += CAR.accel * dt;
  if (back) {
    car.speed -= car.speed > 0.5 ? CAR.brake * dt : CAR.reverseAccel * dt;
  }
  if (!fwd && !back) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  if (handbrake) car.speed *= Math.max(0, 1 - 2.2 * dt);
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));

  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += car.steering * (car.speed / CAR.maxSpeed) * 1.9 * dir * dt;
  const nx = mesh.position.x - Math.sin(car.heading) * car.speed * dt;
  const nz = mesh.position.z - Math.cos(car.heading) * car.speed * dt;
  const before = { x: mesh.position.x, z: mesh.position.z };
  mesh.position.x = nx;
  mesh.position.z = nz;
  if (collideCircle(mesh.position, 1.6, colliders)) {
    // Bounce back a little and bleed speed on impact.
    mesh.position.x = before.x;
    mesh.position.z = before.z;
    car.speed *= -0.25;
    car.health = Math.max(0, car.health - Math.abs(car.speed) * 0.4);
  }
  // Keep inside the city + beach.
  mesh.position.x = Math.max(-215, Math.min(215, mesh.position.x));
  mesh.position.z = Math.max(-215, Math.min(225, mesh.position.z));
  mesh.rotation.y = car.heading;
  // Wheel spin + front steer visual.
  const spin = (car.speed * dt) / 0.36;
  for (const w of car.wheels) w.rotation.x += spin;
  car.smoke.visible = car.health < CAR.smokeBelow;
  if (car.smoke.visible) {
    const s = 0.7 + Math.sin(performance.now() * 0.01) * 0.25;
    car.smoke.scale.setScalar(Math.max(0.4, s));
  }
  return car.speed;
}

export function carForward(mesh) {
  const h = mesh.userData.car.heading;
  return { x: -Math.sin(h), z: -Math.cos(h) };
}
