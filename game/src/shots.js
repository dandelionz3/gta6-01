// Staged deterministic screenshot scenes behind ?shot=<name>&seed=1.
// HUD forced visible, god mode on, fixed camera, seeded world state.

import * as THREE from "three";
import { buildCarMesh } from "./vehicles.js";

function placeCar(G, kind, color, x, z, heading) {
  const mesh = buildCarMesh(kind, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  mesh.userData.car.heading = heading;
  mesh.userData.car.parked = false;
  G.scene.add(mesh);
  G.extraCars.push(mesh);
  return mesh;
}

function clearExtras(G) {
  for (const m of G.extraCars) G.scene.remove(m);
  G.extraCars = [];
}

export function stageShot(name, G) {
  clearExtras(G);
  G.godMode = true;
  G.shotMode = name;
  G.shotCruise = 0;
  // Wider lens for staged shots so the chase reads in one frame.
  G.camera.fov = 72;
  G.camera.updateProjectionMatrix();
  const rng = G.rng;

  if (name === "cover") {
    // Downtown intersection at sunset: Rook driving a stolen sports car,
    // two police cruisers chasing, wanted 2 stars.
    const car = placeCar(G, "sports", 0xc23b2e, 6, 10, Math.PI * 0.12);
    G.enterCar(car);
    car.userData.car.speed = 14;
    G.shotCruise = 14;
    G.police.setStars(2);
    // Cruisers flank the player car (frozen in shot mode) so the chase
    // reads in one frame instead of trailing far behind.
    const c1 = placeCar(G, "police", 0x1a1a22, -6, 18, Math.PI * 0.1);
    const c2 = placeCar(G, "police", 0x1a1a22, 16, 2, Math.PI * 0.05);
    G.police.cruisers.push(c1, c2);
    G.traffic.spawnTraffic(6);
    G.traffic.spawnPedestrians(8);
    G.hud.setWanted(2);
    G.hud.banner("Solmar Bay — wanted: 2 stars", 99);
    G.missions.objective = "Outrun the police — 2 stars on you.";
    // Camera on the avenue south of the intersection, looking north down
    // the road so the player car and both cruisers stay in frame.
    G.fixedCam = { pos: new THREE.Vector3(-2, 12, 44), look: new THREE.Vector3(5, 1, 18) };
  } else if (name === "drive") {
    // Beach boulevard cruise: palms + ocean behind, speed 80+.
    const car = placeCar(G, "sports", 0x2e6fb0, -40, 176, Math.PI / 2);
    G.enterCar(car);
    car.userData.car.speed = 24; // ~86 km/h
    G.shotCruise = 24;
    G.police.clear();
    G.traffic.spawnTraffic(4);
    G.traffic.spawnPedestrians(6);
    G.hud.banner("Beach Boulevard — Solmar Bay", 99);
    G.missions.objective = "Cruise Beach Boulevard — 80+ km/h.";
    // Camera on the sand looking west along the boulevard, ahead of the car.
    // Raised to see over the palm crowns on the beach row.
    G.fixedCam = { pos: new THREE.Vector3(-16, 9, 192), look: new THREE.Vector3(-58, 1.5, 176) };
  } else if (name === "mission") {
    // On foot at a mission beacon, objective banner, rival car nearby.
    G.exitCar();
    G.player.pos.set(112, 0, 112);
    G.player.heading = Math.PI * 0.75;
    G.missions.current = 2;
    G.missions.stage = "active";
    G.missions.subStep = 1;
    G.missions.objective = "Deliver the package";
    G.missions.setTarget(118, 106);
    G.hud.banner("Deliver the package", 99);
    G.hud.setObjective("Deliver the package");
    placeCar(G, "sedan", 0x8a1f2d, 122, 100, -Math.PI * 0.4);
    G.combat.spawnEnemies(2, { x: 120, z: 104 }, 6);
    G.traffic.spawnPedestrians(5);
    // Camera on the avenue south of the player, looking north at Rook + beacon.
    G.fixedCam = { pos: new THREE.Vector3(112, 7, 128), look: new THREE.Vector3(112, 1.5, 110) };
  } else if (name === "chase") {
    // Wanted 3 stars, cruisers + foot cops closing in, smoking car, downtown.
    const car = placeCar(G, "sedan", 0x3a3f45, -6, -6, -Math.PI * 0.15);
    G.enterCar(car);
    car.userData.car.speed = 18;
    G.shotCruise = 18;
    car.userData.car.health = 28; // smoking
    car.userData.car.smoke.visible = true;
    G.police.setStars(3);
    // Cruisers start close around the player car so the chase reads at once.
    const c1 = placeCar(G, "police", 0x1a1a22, -16, -2, -Math.PI * 0.1);
    const c2 = placeCar(G, "police", 0x1a1a22, 4, -14, -Math.PI * 0.2);
    const c3 = placeCar(G, "police", 0x1a1a22, -2, 6, -Math.PI * 0.05);
    G.police.cruisers.push(c1, c2, c3);
    G.traffic.spawnTraffic(5);
    G.traffic.spawnPedestrians(6);
    G.hud.setWanted(3);
    G.hud.banner("Wanted: 3 stars — lose them!", 99);
    G.missions.objective = "Lose the 3-star heat — downtown.";
    // Camera east of the player, off the (0,0) diagonal so the traffic
    // light at (9,9) stays out of the middle of the frame.
    G.fixedCam = { pos: new THREE.Vector3(30, 14, 2), look: new THREE.Vector3(-6, 1.5, -6) };
  } else {
    return false;
  }

  // Let the world settle a few frames (traffic moves, beacon pulses)
  // before the parent captures the shot.
  G.settleFrames = 6;
  return true;
}
