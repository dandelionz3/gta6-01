// Staged screenshot scenes for Solmar Bay. Each scene is deterministic
// (seed 1 world), places the player, cars, cops and camera by hand, and
// turns on god mode so nothing can die mid-shot. The main loop freezes
// traffic and police while a shot is staged, so the composition the
// camera sees is exactly the one written here.
import * as THREE from 'three';
import { SHOTS } from './config.js';

// Park a traffic car at a fixed spot with a fixed heading.
function parkTraffic(game, i, x, z, heading) {
  const car = game.traffic.drivers[i % game.traffic.drivers.length];
  car.group.position.set(x, 0, z);
  car.heading = heading;
  car.group.rotation.y = heading;
  car.speed = 0;
  return car;
}

function placePed(game, i, x, z) {
  const ped = game.traffic.peds[i % game.traffic.peds.length];
  ped.group.position.set(x, 0, z);
  ped.state = 'walk';
  ped.target = { x, z };
  return ped;
}

export function applyShot(name, game) {
  if (!SHOTS.includes(name)) return false;
  game.setGodMode(true);
  game.hud.showScreen(null);

  if (name === 'cover') {
    // Downtown intersection at sunset: player in a stolen red sports car,
    // two cruisers closing in behind, traffic and pedestrians around.
    // Camera sits mid-avenue so the whole chase formation stays in frame
    // and no building wall crowds the lens.
    game.placePlayerCar('sports', 0xc22a2a, 2, -70, 0, 100);
    game.spawnPoliceCruiser(-2, -84, 0);
    game.spawnPoliceCruiser(4, -80, -0.15);
    parkTraffic(game, 0, 52, -52.6, -Math.PI / 2);
    parkTraffic(game, 1, -60, -57.4, Math.PI / 2);
    parkTraffic(game, 2, 6, -20, Math.PI);
    placePed(game, 0, 8, -48);
    placePed(game, 1, -8, -62);
    placePed(game, 2, 12, -52);
    placePed(game, 3, -6, -44);
    game.setWanted(2);
    game.setObjective('Free roam — press M for missions');
    game.setFixedCamera(0, 5, -92, 0, 1.5, -58);
  } else if (name === 'drive') {
    // Beach boulevard cruise: palms and ocean behind, speed 80+.
    const car = game.placePlayerCar('sports', 0x2a5ac2, -40, 167.4, Math.PI / 2, 100);
    car.speed = 24;
    parkTraffic(game, 0, 12, 162.6, Math.PI / 2);
    parkTraffic(game, 1, -90, 167.4, Math.PI / 2);
    placePed(game, 0, 30, 174);
    placePed(game, 1, -12, 174);
    game.setWanted(0);
    game.setObjective('Free roam — press M for missions');
    // Closer and lower than the first pass: the car fills the frame and
    // the beach building no longer eats the left half of the shot.
    game.setFixedCamera(-56, 4, 155, -28, 1.2, 168);
  } else if (name === 'mission') {
    // On foot at the delivery beacon, banner up, rival car nearby.
    game.teleportPlayer(-110, 104, 0);
    game.missions.hideBeacon();
    game.missions.setBeacon({ x: -110, z: 110 }, 'Deliver the package');
    game.banner('The Package', 'Deliver the package');
    const rival = game.spawnParkedCar('sedan', 0x222222, -102, 116, 2.6);
    void rival;
    placePed(game, 0, -104, 100);
    placePed(game, 1, -116, 118);
    game.setWanted(1);
    // Stepped in closer so Rook reads clearly next to the beacon.
    game.setFixedCamera(-100, 5.5, 98, -109, 1.2, 108);
  } else if (name === 'chase') {
    // Wanted 3 downtown: smoking player car, cruisers and foot cops
    // closing in. Both cruisers sit ahead of the camera this time, and
    // the smoke is placed by hand — the staged scene freezes the car,
    // so its driving smoke never spawns on its own.
    const playerCar = game.placePlayerCar('sports', 0xd8c22a, 55, -40, 0, 25);
    game.spawnPoliceCruiser(50, -30, Math.PI);
    game.spawnPoliceCruiser(62, -44, 0.3);
    game.spawnFootCop(58, -30);
    game.spawnFootCop(50, -33);
    parkTraffic(game, 0, 60, -20, Math.PI);
    placePed(game, 0, 62, -48);
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.6 + i * 0.35, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.5 - i * 0.1 }),
      );
      puff.position.set(playerCar.pos.x + 0.4 - i * 0.3, 1.5 + i * 0.7, playerCar.pos.z + 1.8 - i * 0.4);
      game.scene.add(puff);
    }
    game.setWanted(3);
    game.setObjective('Lose the 3-star wanted level!');
    // Camera shifted west so the streetlight lamp at the intersection
    // stops filling the top-left corner.
    game.setFixedCamera(52, 6, -54, 55, 1.5, -36);
  }
  return true;
}
