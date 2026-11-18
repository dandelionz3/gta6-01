// Staged screenshot scenes (?shot=<name>&seed=1). Each scene pins the
// player, a car, the wanted level and a fixed camera so the capture is
// deterministic. God mode is on during staging so nothing dies mid-shot.
// All positions sit on open road with a clear view down the avenue —
// never inside a plaza or behind a building corner.
import { Car } from "./vehicles.js";

export const SHOT_NAMES = ["cover", "drive", "mission", "chase"];

// A police cruiser parked at exact coordinates, already chasing north.
function placeCruiser(G, x, z, heading) {
  const cruiser = new Car(G.scene, "police", x, z, heading);
  cruiser.speed = 12;
  G.police.cruisers.push(cruiser);
  return cruiser;
}

export function stageShot(name, G) {
  const P = G.player;
  const setCar = (kind, x, z, heading, paintHex, health = 100) => {
    let car = G.parked.find((c) => c.kind === kind);
    if (!car) car = G.parked[0];
    car.pos.x = x; car.pos.z = z; car.heading = heading;
    car.health = health; car.speed = 0; car.taken = true;
    if (paintHex !== undefined) car.repaint(paintHex);
    car.sync();
    G.enterCar(car);
    return car;
  };

  G.godMode = true;
  G.staging = true; // freeze police units; cruise speed pinned below
  G.hud.showScreen("play");
  G.state = "play";

  if (name === "cover") {
    // Downtown avenue (x = -32) heading north into the intersection,
    // gold sports car, two cruisers pulling alongside, wanted 2 stars.
    G.police.setStars(2);
    const car = setCar("sports", -32, 56, Math.PI, 0xe8a020);
    car.speed = 14;
    G.cruiseSpeed = 14;
    G.police.setStars(2); // entering the car added heat — pin it back to 2
    placeCruiser(G, -24, 44, Math.PI);
    placeCruiser(G, -40, 48, Math.PI);
    G.camYaw = Math.PI;
    G.camPitch = 0.36;
    G.camDist = 9.5;
    G.camFixed = true;
    G.hud.setObjective("Escape the cops — 2 stars");
    G.hud.banner("SOLMAR BAY", "Steal. Drive. Survive.");
  } else if (name === "drive") {
    // Beach boulevard heading south toward the ocean + pier, gold car at 80+.
    G.police.setStars(0);
    const car = setCar("sports", 0, 192, 0, 0xc03028);
    car.speed = 26;
    G.cruiseSpeed = 26;
    G.camYaw = 0;
    G.camPitch = 0.22;
    G.camDist = 10;
    G.camFixed = true;
    G.hud.setObjective("Cruise Ocean Drive");
    G.hud.banner("OCEAN DRIVE", "Solmar Bay at golden hour");
  } else if (name === "mission") {
    // On foot 8 m from the mission beacon (close enough to see it, far
    // enough not to trigger the pickup), rival car nearby.
    G.police.setStars(0);
    G.exitCar();
    P.pos.set(64, 0, 152);
    P.heading = 0;
    P.mesh.position.set(64, 0, 152);
    P.mesh.rotation.y = 0;
    G.missions.start(1);
    G.missions._setTarget(64, 160, "Deliver the package");
    const rival = G.parked.find((c) => c.kind === "sedan");
    if (rival) { rival.pos.x = 72; rival.pos.z = 156; rival.heading = Math.PI * 0.5; rival.sync(); }
    G.camYaw = 0;
    G.camPitch = 0.3;
    G.camDist = 9;
    G.camFixed = true;
    G.hud.setObjective("Deliver the package");
    G.hud.banner("THE PACKAGE", "Deliver the package");
  } else if (name === "chase") {
    // Wanted 3 on the north avenue (x = 32): smoking sedan, cruisers
    // pulling alongside + a foot cop closing in.
    G.police.setStars(3);
    const car = setCar("sedan", 32, -96, Math.PI, 0x3a7ad8, 22);
    car.speed = 16;
    G.cruiseSpeed = 16;
    G.police.setStars(3); // entering the car added heat — pin it back to 3
    car._smoke(0.2); // faint exhaust puff at the tailpipe, frozen for the shot
    placeCruiser(G, 40, -108, Math.PI);
    placeCruiser(G, 24, -112, Math.PI);
    G.police.placeCop(36, -104);
    G.camYaw = Math.PI;
    G.camPitch = 0.3;
    G.camDist = 11;
    G.camFixed = true;
    G.hud.setObjective("Lose the 3-star wanted level");
    G.hud.banner("WANTED — 3 STARS", "Lose the tail");
  }

  // Hide the "car stolen" toast — staged shots speak through the banner.
  G.hud.toastEl.style.opacity = "0";
  G.hud._toastTimer = 0;
  // Settle a few physics steps so meshes land before capture.
  G.update(0.016);
  G.update(0.016);
  G.update(0.016);
}
