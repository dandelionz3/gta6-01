// Staged deterministic screenshot scenes (?shot=<name>&seed=1). Each scene
// freezes the AI, places the player/camera at fixed spots, forces the HUD on
// and turns on god mode so nothing dies mid-shot.
import * as THREE from 'three';
import { Rng } from './random.js';
import { spawnCar } from './vehicles.js';

function putPlayerInCar(G, kind, x, z, heading, colour, health = 100) {
  const car = spawnCar(G.scene, kind, x, z, heading, colour);
  car.health = health;
  G.player.car = car;
  G.player.pos.set(x, 0, z);
  G.player.heading = heading;
  G.parked = G.parked.filter((c) => c !== car);
  return car;
}

function addChaser(G, x, z, heading) {
  const car = spawnCar(G.scene, 'police', x, z, heading, 0x1d2f4a);
  car.ai = { speed: 26 };
  G.police.cruisers.push(car);
  return car;
}

function addCop(G, x, z) {
  // foot cops are spawned through the Police class so their update stays sane
  G.police.spawnCopAt(x, z);
}

export function applyShot(name, G) {
  const rng = new Rng(1);
  G.state.god = true;
  G.state.shotMode = true;
  G.hud.showHud(true);
  G.hud.showScreen(null);
  G.hud.setHintVisible(false);
  G.audio.ensure();

  const lookAt = (x, y, z) => {
    G.state.shotCam = {
      pos: new THREE.Vector3(x, y, z),
      look: new THREE.Vector3(G.player.pos.x, 1.6, G.player.pos.z),
    };
  };

  if (name === 'cover') {
    // downtown intersection at sunset, stolen sports car, two cruisers on it
    // (cruisers trail from the south so the camera sees them past the player)
    putPlayerInCar(G, 'sports', 0, 8, Math.PI, 0xc23b2e);
    G.player.car.speed = 12;
    G.police.setWanted(2);
    addChaser(G, -5, 26, Math.PI);
    addChaser(G, 6, 34, Math.PI);
    // a little street life around the intersection
    G.traffic.spawnPed(10, 2);
    G.traffic.spawnPed(-12, 14);
    G.traffic.spawnPed(14, -6);
    G.hud.setObjective('Mission 1 — First Wheels: drive to the marker');
    G.missions.placeBeacon(92, 46);
    lookAt(10, 6, -14);
  } else if (name === 'drive') {
    // beach boulevard cruise on the southernmost road, palms + ocean behind
    putPlayerInCar(G, 'sports', -40, 184, Math.PI / 2, 0x2e6fc2);
    G.player.car.speed = 26;
    G.police.setWanted(0);
    G.hud.setObjective('Free roam — cruise the boulevard');
    // camera on the road axis west of the car: no building can block the shot
    lookAt(-64, 4.2, 184);
  } else if (name === 'mission') {
    // on foot at the mission beacon, package job, rival car nearby
    G.player.pos.set(-46, 0, 86);
    G.player.heading = Math.PI;
    G.player.car = null;
    G.missions.start(1);
    G.hud.setObjective('Deliver the package');
    spawnCar(G.scene, 'sedan', -38, 98, Math.PI * 0.75, 0x8a1f2a);
    G.traffic.spawnPed(-52, 96);
    G.traffic.spawnPed(-40, 82);
    lookAt(-38, 4.6, 74);
  } else if (name === 'chase') {
    // wanted 3, smoking car, cruisers + foot cops closing in, downtown.
    // Camera sits on the road axis east of the player so no streetlight pole
    // blocks the frame; cruisers trail from the east, one blocks from the west.
    const car = putPlayerInCar(G, 'sedan', 0, -46, -Math.PI / 2, 0xd8d8d8, 24);
    car.speed = 14;
    G.police.setWanted(3);
    addChaser(G, 12, -49, -Math.PI / 2);
    addChaser(G, 18, -43, -Math.PI / 2);
    addChaser(G, -16, -46, Math.PI / 2);
    addCop(G, 6, -40);
    addCop(G, -4, -52);
    G.hud.setObjective('WANTED — lose the cops!');
    lookAt(30, 6.5, -46);
  } else {
    // unknown shot name: fall back to a plain downtown drive
    putPlayerInCar(G, 'sedan', 0, 0, 0, 0xc23b2e);
    lookAt(8, 5, -12);
  }

  // HUD numbers for the frame
  G.hud.setHealth(G.state.health);
  G.hud.setCash(G.state.cash);
  G.hud.setWanted(G.police.stars);
  G.hud.setAmmo(G.combat.ammo);
  G.hud.setSpeed(G.player.car ? Math.abs(G.player.car.speed) * 3.6 : 0);
  G.hud.setCrosshair(false);
  void rng;
}
