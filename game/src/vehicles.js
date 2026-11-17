import * as THREE from 'three';
import { box, material } from './world.js';
import { clamp, distance, RULES } from './config.js';
const tireGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.34, 12);
export function carModel(type, color) {
  const root = new THREE.Group();
  const van = type === 'van', sport = type === 'sports';
  const width = van ? 2.7 : 2.2, length = van ? 5.8 : 4.7;
  box(root, 0x252d32, 0, 0.55, 0, width, 0.35, length);
  box(root, color, 0, 0.94, 0, width, 0.65, length);
  box(root, color, 0, van ? 1.85 : 1.45, van ? -0.7 : -0.1, width * 0.9, van ? 1.8 : 0.65, van ? 4 : 2.6);
  box(root, 0x25444d, 0, van ? 1.9 : 1.47, 1.22, width * 0.82, van ? 0.9 : 0.48, 0.1);
  if (!van) {
    box(root, 0x365964, -width / 2 - 0.01, 1.48, -0.12, 0.04, 0.48, 2.05);
    box(root, 0x365964, width / 2 + 0.01, 1.48, -0.12, 0.04, 0.48, 2.05);
  }
  for (const side of [-1, 1]) {
    box(root, 0xffe5a6, side * width * 0.34, 0.96, length / 2 + 0.02, 0.6, 0.25, 0.09, true);
    box(root, 0xee5b51, side * width * 0.34, 0.96, -length / 2 - 0.02, 0.5, 0.22, 0.09, true);
  }
  box(root, 0xd1d5c8, 0, 0.55, length / 2 + 0.05, width, 0.18, 0.18);
  box(root, 0xd1d5c8, 0, 0.55, -length / 2 - 0.05, width, 0.18, 0.18);
  const wheels = [];
  for (const x of [-width / 2, width / 2]) for (const z of [-length * 0.32, length * 0.32]) {
    const wheel = new THREE.Mesh(tireGeometry, material(0x20262d)); wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.48, z); root.add(wheel); wheels.push(wheel);
    const hub = box(root, 0xb5bbb9, x * 1.03, 0.48, z, 0.06, 0.36, 0.36); hub.rotation.x = Math.PI / 4;
  }
  if (sport) box(root, 0x263c42, 0, 1.5, -1.9, 2.5, 0.12, 0.65);
  if (type === 'taxi') box(root, 0xffdd70, 0, 1.99, 0, 0.9, 0.28, 0.5, true);
  const lights = [];
  if (type === 'police') {
    box(root, 0xf0eee0, 0, 1.1, 0, 2.23, 0.4, 2.1);
    for (const [x, c] of [[-0.5, 0x438aff], [0.5, 0xff4f55]]) lights.push(box(root, c, x, 1.99, 0, 0.8, 0.25, 0.5, true));
  }
  root.userData = { wheels, lights };
  return root;
}
export function createVehicles(scene, world, rng) {
  const cars = [];
  function spawn(type, x, z, angle = 0, color = 0x4f9d9b, role = 'parked') {
    const mesh = carModel(type, color); mesh.position.set(x, 0, z); mesh.rotation.y = angle; scene.add(mesh);
    const car = { mesh, type, x, z, angle, speed: 0, health: 100, role, stolen: false, radius: type === 'van' ? 2.8 : 2.2, turn: 0, smokeTime: 0 };
    cars.push(car); return car;
  }
  const palette = [0xeb715a, 0x3d838b, 0xf5cd67, 0xdce1cf, 0x596183, 0x8d445e];
  for (let i = 0; i < 28; i++) {
    const x = (Math.floor(rng() * 7) - 3) * 64 + (i % 2 ? 7 : -7);
    const z = -175 + rng() * 340;
    spawn(i % 6 === 0 ? 'sports' : i % 5 === 0 ? 'van' : 'sedan', x, z, i % 2 ? 0 : Math.PI, palette[i % palette.length]);
  }
  spawn('sports', 5, 14, 0, 0xe97554);
  const smoke = [];
  const smokeGeo = new THREE.SphereGeometry(1, 6, 5);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x3d4449, transparent: true, opacity: 0.42, depthWrite: false });
  for (let i = 0; i < 45; i++) { const m = new THREE.Mesh(smokeGeo, smokeMat); m.visible = false; scene.add(m); smoke.push({ mesh: m, life: 0 }); }
  let smokeIndex = 0;
  function drive(car, input, dt, game) {
    const gas = Number(input.held.has('KeyW')) - Number(input.held.has('KeyS'));
    const turn = Number(input.held.has('KeyA')) - Number(input.held.has('KeyD'));
    const oldSpeed = car.speed;
    car.speed += gas * RULES.acceleration * dt;
    car.speed *= Math.pow(input.held.has('Space') ? 0.08 : gas ? 0.94 : 0.5, dt);
    car.speed = clamp(car.speed, -12, car.type === 'sports' ? 48 : car.type === 'van' ? 30 : 40);
    if (car.health <= 0) car.speed *= Math.pow(0.1, dt);
    car.angle += turn * clamp(car.speed / 13, -1.5, 1.5) * dt * (input.held.has('Space') ? 2.2 : 1.2);
    const nx = car.x + Math.sin(car.angle) * car.speed * dt;
    const nz = car.z + Math.cos(car.angle) * car.speed * dt;
    if (world.blocked(nx, nz, 1.4)) {
      if (Math.abs(oldSpeed) > 6) { car.health -= Math.abs(oldSpeed) * 0.7; game.damage(Math.abs(oldSpeed) * 0.1); game.audio.hit(); }
      car.speed *= -0.28;
    } else { car.x = nx; car.z = nz; }
    for (const other of cars) {
      if (other === car || distance(car, other) > 4) continue;
      if (Math.abs(car.speed - other.speed) > 6) {
        car.health -= Math.abs(car.speed) * dt * 2;
        other.health -= Math.abs(car.speed) * dt * 3;
        other.x += Math.sin(car.angle) * dt * 4; other.z += Math.cos(car.angle) * dt * 4;
        if (other.role === 'police') game.crime(0.35 * dt);
      }
      car.speed *= 0.96;
    }
  }
  function update(dt, time) {
    for (const car of cars) {
      car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.angle;
      car.mesh.userData.wheels.forEach(w => { w.rotation.x += car.speed * dt * 1.8; });
      car.mesh.userData.lights.forEach((m, i) => { m.visible = Math.floor(time * 8 + i) % 2 === 0; });
      if (car.health < 35) {
        car.smokeTime -= dt;
        if (car.smokeTime <= 0) {
          car.smokeTime = 0.12;
          const puff = smoke[smokeIndex++ % smoke.length]; puff.life = 2;
          puff.mesh.position.set(car.x + Math.sin(car.angle) * 1.5, 1.2, car.z + Math.cos(car.angle) * 1.5); puff.mesh.visible = true;
        }
      }
    }
    for (const puff of smoke) if (puff.life > 0) {
      puff.life -= dt; puff.mesh.position.y += dt * 2;
      puff.mesh.scale.setScalar(0.3 + (2 - puff.life) * 1.2); puff.mesh.visible = puff.life > 0;
    }
  }
  function enter(game) {
    if (game.car) {
      const c = game.car;
      let x = c.x + Math.cos(c.angle) * 3, z = c.z - Math.sin(c.angle) * 3;
      if (world.blocked(x, z)) { x = c.x - Math.cos(c.angle) * 3; z = c.z + Math.sin(c.angle) * 3; }
      game.player.x = x; game.player.z = z; c.role = 'parked'; c.speed = 0; game.car = null; return;
    }
    let nearest = null, best = 4;
    for (const c of cars) { const d = distance(game.player, c); if (d < best && c.health > 0) { best = d; nearest = c; } }
    if (!nearest) { game.toast('Get closer to a vehicle'); return; }
    if (!nearest.stolen) {
      nearest.stolen = true; game.stats.thefts++;
      if (game.police.witness()) game.crime(1);
      game.toast('Vehicle acquired · E to exit');
    }
    game.car = nearest; nearest.role = 'player'; game.audio.start();
  }
  return { cars, spawn, drive, update, enter };
}
