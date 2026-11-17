import { person, animatePerson } from './world.js';
import { distance } from './config.js';
export function createTraffic(game) {
  const { rng, scene, vehicles, world } = game;
  const pedestrians = [];
  const colors = [0xda8e77, 0x4b9e9a, 0xdfc480, 0x9e77a2, 0x697f9b];
  for (let i = 0; i < 22; i++) {
    const road = (Math.floor(rng() * 7) - 3) * 64;
    const horizontal = i % 2 === 0, sign = i % 3 ? 1 : -1;
    const c = vehicles.spawn(i % 6 === 0 ? 'taxi' : 'sedan', horizontal ? rng() * 400 - 200 : road + sign * 4, horizontal ? road + sign * 4 : rng() * 400 - 200, horizontal ? sign * Math.PI / 2 : sign === 1 ? 0 : Math.PI, colors[i % colors.length], 'traffic');
    c.axis = horizontal ? 'x' : 'z'; c.direction = sign; c.cruise = 10 + rng() * 7; c.speed = c.cruise; c.road = road;
  }
  for (let i = 0; i < 65; i++) {
    const road = (Math.floor(rng() * 7) - 3) * 64;
    const horizontal = i % 2 === 0;
    const x = horizontal ? rng() * 400 - 200 : road + (i % 3 ? 11 : -11);
    const z = horizontal ? road + (i % 3 ? 11 : -11) : rng() * 400 - 200;
    const mesh = person(colors[i % colors.length]); mesh.position.set(x, 0, z); scene.add(mesh);
    pedestrians.push({ mesh, x, z, axis: horizontal ? 'x' : 'z', direction: i % 3 ? 1 : -1, health: 40, flee: 0, down: false, speed: 1.2 + rng() });
  }
  function update(dt) {
    for (const car of vehicles.cars) if (car.role === 'traffic') {
      const blocked = vehicles.cars.some(other => other !== car && distance(car, other) < 8 && (other.x - car.x) * Math.sin(car.angle) + (other.z - car.z) * Math.cos(car.angle) > 0);
      const nearPlayer = !game.car && distance(car, game.player) < 6;
      car.speed += ((blocked || nearPlayer || car.health < 1 ? 0 : car.cruise) - car.speed) * dt * 3;
      car[car.axis] += car.direction * car.speed * dt;
      if (Math.abs(car[car.axis]) > 220) car[car.axis] *= -0.98;
    }
    for (const p of pedestrians) {
      if (p.health <= 0) { p.down = true; p.mesh.rotation.z = Math.PI / 2; p.mesh.position.y = 0.2; continue; }
      p.flee = Math.max(0, p.flee - dt);
      if (p.flee > 0) {
        const a = Math.atan2(p.x - game.player.x, p.z - game.player.z);
        const nx = p.x + Math.sin(a) * dt * 5, nz = p.z + Math.cos(a) * dt * 5;
        if (!world.blocked(nx, nz)) { p.x = nx; p.z = nz; } p.mesh.rotation.y = a;
      } else {
        const next = p[p.axis] + p.direction * p.speed * dt;
        const nx = p.axis === 'x' ? next : p.x, nz = p.axis === 'z' ? next : p.z;
        if (world.blocked(nx, nz) || Math.abs(next) > 210) p.direction *= -1;
        else p[p.axis] = next;
        p.mesh.rotation.y = p.axis === 'x' ? p.direction * Math.PI / 2 : p.direction > 0 ? 0 : Math.PI;
      }
      p.mesh.position.set(p.x, 0, p.z); animatePerson(p.mesh, game.time, p.flee ? 1 : 0.4);
      if (game.car && Math.abs(game.car.speed) > 5 && distance(p, game.car) < 2.2) {
        p.health = 0; game.car.speed *= 0.8; game.crime(1); game.stats.kills++; game.audio.hit();
      }
    }
  }
  return { pedestrians, update, frighten() { for (const p of pedestrians) if (distance(p, game.player) < 65) p.flee = 8; } };
}
