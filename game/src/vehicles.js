// Car models (box-built, no external assets) and driving physics.
import * as THREE from 'three';
import { CFG } from './config.js';

export const CAR_COLOURS = [0xc23b2e, 0x2e6fc2, 0xd8d8d8, 0x22262b, 0xe8a13a, 0x3a9a5a, 0x7a3ac2, 0xc2c2b8];

const KIND_SPECS = {
  sedan: { len: 4.4, wid: 1.9, h: 0.75, cabin: 0.62, wheels: 0.34, body: 0.55 },
  sports: { len: 4.2, wid: 1.95, h: 0.6, cabin: 0.5, wheels: 0.36, body: 0.42 },
  taxi: { len: 4.4, wid: 1.9, h: 0.75, cabin: 0.62, wheels: 0.34, body: 0.55 },
  van: { len: 5.2, wid: 2.1, h: 1.5, cabin: 0.9, wheels: 0.38, body: 0.9 },
  police: { len: 4.5, wid: 1.95, h: 0.75, cabin: 0.62, wheels: 0.35, body: 0.55 },
  armored: { len: 5.4, wid: 2.2, h: 1.7, cabin: 0.7, wheels: 0.4, body: 1.0 },
};

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function makeCarMesh(kind, colour) {
  const spec = KIND_SPECS[kind] || KIND_SPECS.sedan;
  const g = new THREE.Group();
  const bodyColour = kind === 'police' ? 0x1d2f4a : kind === 'taxi' ? 0xe8c13a : colour;
  const L = spec.len;
  const W = spec.wid;

  g.add(box(L, spec.h, W, bodyColour, 0, spec.body + spec.h / 2, 0));
  // cabin / glasshouse
  const cabLen = kind === 'van' || kind === 'armored' ? L * 0.55 : L * 0.48;
  g.add(box(cabLen, spec.cabin, W * 0.86, 0x18242e, kind === 'van' ? -L * 0.08 : -L * 0.04, spec.body + spec.h + spec.cabin / 2, 0));
  // bumpers
  g.add(box(0.3, 0.3, W * 0.96, 0x1c1e20, L / 2, 0.35, 0));
  g.add(box(0.3, 0.3, W * 0.96, 0x1c1e20, -L / 2, 0.35, 0));
  // headlights + tail lights
  const lampGeo = new THREE.BoxGeometry(0.08, 0.18, 0.34);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2211 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(lampGeo, headMat);
    hl.position.set(L / 2 + 0.02, 0.75, s * (W / 2 - 0.35));
    g.add(hl);
    const tl = new THREE.Mesh(lampGeo, tailMat);
    tl.position.set(-L / 2 - 0.02, 0.75, s * (W / 2 - 0.35));
    g.add(tl);
  }
  if (kind === 'taxi') {
    g.add(box(0.9, 0.18, 0.7, 0x111111, 0, spec.body + spec.h + spec.cabin + 0.09, 0));
  }
  if (kind === 'police') {
    const bar = box(0.5, 0.16, 1.1, 0xdddddd, 0, spec.body + spec.h + spec.cabin + 0.08, 0);
    g.add(bar);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.45), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    r.position.set(0, spec.body + spec.h + spec.cabin + 0.2, 0.28);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.45), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    b.position.set(0, spec.body + spec.h + spec.cabin + 0.2, -0.28);
    g.add(r, b);
    g.userData.lightBar = { r: r.material, b: b.material };
  }
  if (kind === 'armored') {
    g.add(box(L * 0.7, 0.5, W * 0.9, 0x3a4046, 0, spec.body + 1.1, 0));
  }

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(spec.wheels, spec.wheels, 0.28, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const hubGeo = new THREE.CylinderGeometry(spec.wheels * 0.45, spec.wheels * 0.45, 0.3, 8);
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
  const wheels = [];
  const steerWheels = [];
  for (const [wx, wz, front] of [
    [L * 0.32, W / 2 - 0.1, true], [L * 0.32, -W / 2 + 0.1, true],
    [-L * 0.32, W / 2 - 0.1, false], [-L * 0.32, -W / 2 + 0.1, false],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, spec.wheels, wz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    pivot.add(wheel, hub);
    g.add(pivot);
    wheels.push({ pivot, wheel, hub });
    if (front) steerWheels.push(pivot);
  }
  g.userData.wheels = wheels;
  g.userData.steerWheels = steerWheels;
  return g;
}

export function spawnCar(scene, kind, x, z, heading, colour) {
  const mesh = makeCarMesh(kind, colour);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    kind,
    group: mesh,
    heading,
    speed: 0,
    steer: 0,
    health: 100,
    maxSpeed: CFG.car.maxSpeed[kind] || 26,
    wheels: mesh.userData.wheels,
    steerWheels: mesh.userData.steerWheels,
    smokeTimer: 0,
    dead: false,
  };
}

export function carForward(car) {
  return { x: Math.sin(car.heading), z: Math.cos(car.heading) };
}

function circleHitsAABB(x, z, r, box) {
  const cx = Math.max(box.minX, Math.min(x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// ctrl: { throttle: -1..1, steer: -1..1, brake: bool }
// returns { hitBuilding: bool, impact: number }
export function driveCar(car, ctrl, dt, world) {
  const cfg = CFG.car;
  let impact = 0;
  let hitBuilding = false;

  if (ctrl.brake) {
    car.speed -= Math.sign(car.speed) * cfg.brake * dt;
    if (Math.abs(car.speed) < 0.6) car.speed = 0;
  } else if (ctrl.throttle !== 0) {
    const accel = ctrl.throttle > 0 ? cfg.accel : cfg.reverseAccel;
    car.speed += ctrl.throttle * accel * dt;
  } else {
    car.speed -= car.speed * cfg.drag * dt;
    if (Math.abs(car.speed) < 0.15) car.speed = 0;
  }
  const maxFwd = car.maxSpeed;
  const maxRev = 9;
  car.speed = Math.max(-maxRev, Math.min(maxFwd, car.speed));

  const steerTarget = ctrl.steer * (car.speed >= 0 ? 1 : -1);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const speedFactor = Math.min(1, Math.abs(car.speed) / 10);
  car.heading += car.steer * cfg.steerRate * speedFactor * dt * (car.speed >= 0 ? 1 : -1) * 0.55;

  const fwd = carForward(car);
  const nx = car.group.position.x + fwd.x * car.speed * dt;
  const nz = car.group.position.z + fwd.z * car.speed * dt;

  // building collision — circle vs AABB, stop and take damage on hard hits
  for (const box of world.colliders) {
    if (circleHitsAABB(nx, nz, 1.7, box)) {
      hitBuilding = true;
      impact = Math.abs(car.speed);
      if (impact > 4) car.health -= Math.min(22, (impact - 4) * 1.6);
      car.speed *= -0.25;
      break;
    }
  }
  if (!hitBuilding) {
    car.group.position.x = Math.max(-world.bounds, Math.min(world.bounds, nx));
    car.group.position.z = Math.max(-world.bounds, Math.min(world.bounds + 30, nz));
  }
  car.group.rotation.y = car.heading;

  // wheel visuals
  const spin = (car.speed * dt) / 0.35;
  for (const w of car.wheels) {
    w.wheel.rotation.y += spin;
    w.hub.rotation.y += spin;
  }
  for (const p of car.steerWheels) p.rotation.y = car.steer * 0.42;

  return { hitBuilding, impact };
}

export function removeCar(scene, car) {
  scene.remove(car.group);
}
