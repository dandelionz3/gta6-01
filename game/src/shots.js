// Staged screenshot scenes for Solmar Bay.
// ?shot=<name>&seed=1 freezes a deterministic moment: god mode on,
// HUD forced visible, camera fixed, cars staged. The game itself
// never moves during a shot — the frame is the scene.

import * as THREE from 'three';
import { Car } from './vehicles.js';

export const SHOT_NAMES = ['cover', 'drive', 'mission', 'chase'];

function stageCruiser(G, x, z, heading) {
  const cruiser = new Car(G.scene, 'police', 0xf0f0f0, x, z, heading);
  G.police.cruisers.push(cruiser);
  return cruiser;
}

function stageCop(G, x, z) {
  G.police.spawnCopNear({ x: G.player.pos.x, z: G.player.pos.z });
  const cop = G.police.cops[G.police.cops.length - 1];
  if (cop) cop.group.position.set(x, 0, z);
  return cop;
}

export function applyShot(name, G) {
  G.god = true;
  G.shotMode = true;
  G.shotName = name;
  G.hud.setCrosshair(false);

  if (name === 'cover') {
    // Downtown intersection at sunset: Rook in a stolen sports car,
    // two cruisers closing in, wanted 2 stars, street full of life.
    G.giveCar('sports', 0xc23b2a, 2, 6, 0);
    G.player.car.speed = 0;
    G.police.setStars(2);
    stageCruiser(G, -5, -12, 0.15);
    stageCruiser(G, 7, -18, -0.1);
    G.setFixedCamera(new THREE.Vector3(13, 5.5, -13), new THREE.Vector3(0, 1.2, 4));
    G.setObjective('Mission: First Wheels — drive to the marker');
    G.stagedSpeedKmh = 34;
    G.hud.toast('Solmar Bay — downtown, sunset');
  } else if (name === 'drive') {
    // Beach boulevard cruise: palms and ocean behind, speed 80+.
    // The car sits in the eastbound lane of the coast road (z=160),
    // ocean to the south behind it.
    G.giveCar('sports', 0x2a6ac2, -40, 163.4, Math.PI / 2);
    G.player.car.speed = 0;
    G.police.setStars(0);
    const rival = new Car(G.scene, 'sedan', 0xd8c86a, -20, 156.6, -Math.PI / 2);
    G.stagedExtras.push(rival);
    G.setFixedCamera(new THREE.Vector3(-55, 4.5, 149), new THREE.Vector3(-38, 1.2, 160));
    G.setObjective('Free roam — cruise the boulevard');
    G.stagedSpeedKmh = 84;
    G.hud.toast('Solmar Bay — beach boulevard');
  } else if (name === 'mission') {
    // On foot at the mission beacon, package run, rival car nearby.
    G.placePlayer(0, 164, Math.PI);
    G.missions.makeBeacon(0, 172);
    G.setObjective('Deliver the package');
    const rival = new Car(G.scene, 'sports', 0x1c1e20, 9, 158, -0.4);
    G.stagedExtras.push(rival);
    G.combat.spawnGang({ x: -8, z: 172 }, 2);
    // camera pulled back and up so Rook is visible in the lower frame
    G.setFixedCamera(new THREE.Vector3(8, 5.5, 148), new THREE.Vector3(0, 1.2, 168));
    G.stagedSpeedKmh = 0;
    G.hud.toast('Mission: The Package');
  } else if (name === 'chase') {
    // Wanted 3 stars downtown: smoking getaway car, cruisers + cops.
    // Cruisers and cops are staged ahead of the car (in front of the
    // camera's view) so the whole chase reads in one frame.
    G.giveCar('sedan', 0x2a9a4a, 0, -4, 0);
    G.player.car.damage(72);
    G.police.setStars(3);
    stageCruiser(G, -7, 6, 0.25);
    stageCruiser(G, 7, 10, -0.2);
    stageCop(G, -4, 14);
    stageCop(G, 5, 16);
    G.setFixedCamera(new THREE.Vector3(11, 5, -19), new THREE.Vector3(0, 1.2, -2));
    G.setObjective('Lose the cops — get your wanted level to zero');
    G.stagedSpeedKmh = 47;
    G.hud.toast('Wanted — 3 stars');
  } else {
    // unknown shot name: fall back to a plain downtown frame
    G.giveCar('sedan', 0xc23b2a, 0, 0, 0);
    G.setFixedCamera(new THREE.Vector3(12, 6, -14), new THREE.Vector3(0, 1, 0));
    G.stagedSpeedKmh = 0;
  }

  // HUD: everything on, exactly as a player would see it.
  G.hud.setHealth(G.player.health, 100);
  G.hud.setCash(G.player.cash);
  G.hud.setStars(G.police.stars);
  G.hud.setSpeed(G.stagedSpeedKmh, G.player.inCar);
  G.hud.setAmmo(G.combat.ammo, !G.player.inCar);
}
