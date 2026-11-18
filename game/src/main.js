// Solmar Bay — game loop, screens, save/load, player + driving,
// camera, and wiring for every module.

import * as THREE from "three";
import { PLAYER, CAR, WANTED, COMBAT, KEYS, MISSIONS, SAVE_KEY, COLORS } from "./config.js";
import { makeRng, hashSeed } from "./random.js";
import { Input } from "./input.js";
import { createRender, updateCamera } from "./render.js";
import { buildCity, collideCircle } from "./world.js";
import { buildCarMesh, spawnParkedCars, driveCar } from "./vehicles.js";
import { Traffic, buildPedestrian } from "./traffic.js";
import { Police } from "./police.js";
import { Combat } from "./combat.js";
import { Missions } from "./missions.js";
import { Hud } from "./hud.js";
import { AudioEngine } from "./audio.js";
import { stageShot } from "./shots.js";

const params = new URLSearchParams(window.location.search);
const shotName = params.get("shot");
const seed = Number(params.get("seed") || 1);
const rng = makeRng(hashSeed(`solmar-${seed}`));

const canvas = document.getElementById("game-canvas");
const { renderer, scene, camera } = createRender(canvas);
const input = new Input(canvas);
const hud = new Hud();
const audio = new AudioEngine();
const city = buildCity(scene, rng);
const colliders = city.colliders;

const G = {
  scene,
  camera,
  renderer,
  rng,
  hud,
  extraCars: [],
  godMode: false,
  shotMode: null,
  fixedCam: null,
  settleFrames: 0,
  police: null,
  traffic: null,
  missions: null,
  combat: null,
  player: { pos: new THREE.Vector3(0, 0, 20), heading: Math.PI, vy: 0, onGround: true },
  currentCar: null,
  cash: PLAYER.startCash,
  screen: "title",
  camYaw: Math.PI,
  camPitch: 0.32,
  camDist: 9,
  playTime: 0,
  gunshotAt: null,
  sirenTimer: 0,
};

// --- Player mesh (Rook: blue jacket, dark trousers) ---
function buildPlayerMesh() {
  const g = new THREE.Group();
  g.name = "player";
  const box = new THREE.BoxGeometry(1, 1, 1);
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a070 });
  const jacket = new THREE.MeshLambertMaterial({ color: COLORS.playerJacket });
  const pants = new THREE.MeshLambertMaterial({ color: COLORS.playerPants });
  const head = new THREE.Mesh(box, skin);
  head.scale.set(0.42, 0.42, 0.42);
  head.position.y = 1.58;
  g.add(head);
  const cap = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  cap.scale.set(0.46, 0.14, 0.46);
  cap.position.y = 1.82;
  g.add(cap);
  const torso = new THREE.Mesh(box, jacket);
  torso.scale.set(0.62, 0.75, 0.34);
  torso.position.y = 1.0;
  g.add(torso);
  const legs = new THREE.Mesh(box, pants);
  legs.scale.set(0.55, 0.62, 0.3);
  legs.position.y = 0.32;
  g.add(legs);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}
const playerMesh = buildPlayerMesh();
scene.add(playerMesh);

// --- World population ---
const parkedCars = spawnParkedCars(scene, rng, colliders, 26);
const traffic = new Traffic(scene, rng, colliders);
traffic.spawnTraffic(14);
traffic.spawnPedestrians(22);
G.traffic = traffic;

const police = new Police(scene, rng);
G.police = police;

const combat = new Combat(scene, rng, audio);
G.combat = combat;

// Armoured van for mission 5, parked in the yard from the start.
const vanMesh = buildCarMesh("van", 0x2a2d33);
vanMesh.position.set(-140, 0, -28);
vanMesh.rotation.y = Math.PI / 2;
vanMesh.userData.car.heading = Math.PI / 2;
vanMesh.userData.car.parked = true;
vanMesh.userData.car.isVan = true;
scene.add(vanMesh);
parkedCars.push(vanMesh);

// Medkits + ammo sprinkled around the map.
combat.spawnMedkit(-84, 84);
combat.spawnMedkit(112, 112);
combat.spawnMedkit(60, 200);
combat.spawnAmmo(28, -28);
combat.spawnAmmo(-140, -28);
combat.spawnAmmo(140, -84);

const missions = new Missions(scene, rng, {
  onToast: (t) => hud.toast(t),
  onBanner: (t) => {
    hud.banner(t);
    audio.playJingle();
  },
  setWanted: (n) => police.setStars(n),
  spawnEnemies: (n, at) => combat.spawnEnemies(n, at),
  onCash: (n) => {
    G.cash += n;
    hud.setCash(G.cash);
  },
});
G.missions = missions;

// --- Car enter / exit (used by main loop and by staged shots) ---
G.enterCar = (mesh) => {
  G.currentCar = mesh;
  mesh.userData.car.parked = false;
  playerMesh.visible = false;
  G.camDist = 11;
  // Stealing a parked car draws heat (not in staged shots — no toast spam).
  const nearCop = police.cops.some(
    (c) => Math.hypot(c.position.x - mesh.position.x, c.position.z - mesh.position.z) < 45,
  );
  police.addHeat(nearCop ? 0.7 : 0.34, "theft");
  if (!G.shotMode) {
    hud.toast(nearCop ? "Stolen in front of the cops!" : "Car stolen — keep it quiet.");
  }
  audio.playPickup();
};

G.exitCar = () => {
  if (!G.currentCar) return;
  const car = G.currentCar;
  G.currentCar = null;
  playerMesh.visible = true;
  G.player.pos.set(car.position.x + 2.4, 0, car.position.z + 1.5);
  G.player.heading = car.userData.car.heading;
  G.camDist = 9;
};

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const c of parkedCars) {
    if (!c.userData.car.parked) continue;
    const d = Math.hypot(c.position.x - G.player.pos.x, c.position.z - G.player.pos.z);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  for (const c of G.extraCars) {
    const d = Math.hypot(c.position.x - G.player.pos.x, c.position.z - G.player.pos.z);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

// --- Save / load ---
function saveGame() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        x: G.player.pos.x,
        z: G.player.pos.z,
        cash: G.cash,
        mission: missions.current,
        health: combat.health,
      }),
    );
  } catch {
    // Storage may be unavailable; the game still runs.
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    G.player.pos.set(s.x || 0, 0, s.z || 20);
    G.cash = s.cash ?? PLAYER.startCash;
    missions.current = Math.max(1, Math.min(6, s.mission || 1));
    combat.health = s.health ?? PLAYER.maxHealth;
    return true;
  } catch {
    return false;
  }
}

// --- Screens ---
function setScreen(name) {
  G.screen = name;
  hud.setScreen(name);
  if (name === "play") {
    audio.ensure();
    if (missions.stage === "idle" && missions.current <= 5 && !G.shotMode) {
      missions.start();
    }
  }
}

document.getElementById("start-btn")?.addEventListener("click", () => {
  loadGame();
  hud.setCash(G.cash);
  setScreen("play");
});
document.getElementById("resume-btn")?.addEventListener("click", () => setScreen("play"));
document.getElementById("restart-btn")?.addEventListener("click", () => {
  respawnAtHospital("You are back on your feet.");
  setScreen("play");
});
document.getElementById("continue-btn")?.addEventListener("click", () => {
  respawnAtHospital("You are back on your feet.");
  setScreen("play");
});
document.getElementById("mission-close")?.addEventListener("click", () => hud.hide("mission-menu"));

function respawnAtHospital(msg) {
  G.exitCar();
  G.player.pos.set(WANTED.hospitalSpawn.x, 0, WANTED.hospitalSpawn.z);
  combat.health = PLAYER.maxHealth;
  police.clear();
  const fine = Math.min(G.cash, WANTED.finePerStar * Math.max(1, police.stars));
  G.cash = Math.max(0, G.cash - fine);
  hud.setCash(G.cash);
  hud.setHealth(combat.health);
  hud.toast(msg);
}

// --- Shot mode: skip the title screen, stage the scene ---
if (shotName) {
  loadGame();
  hud.setCash(G.cash);
  const ok = stageShot(shotName, G);
  if (ok) {
    setScreen("play");
    hud.setHealth(combat.health);
    hud.setObjective(missions.objective || "Free roam — Solmar Bay");
  } else {
    setScreen("title");
  }
} else {
  setScreen("title");
}

// --- Main loop ---
const clock = new THREE.Clock();
let saveTimer = 0;
let lightTimer = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const nowSec = G.playTime;
  if (G.screen === "play") G.playTime += dt;

  // Traffic-light cycling.
  lightTimer += dt;
  if (lightTimer > 5) {
    lightTimer = 0;
    for (const tl of city.trafficLights) {
      const green = tl.mesh.material === tl.mats.green;
      tl.mesh.material = green ? tl.mats.red : tl.mats.green;
    }
  }

  if (G.screen === "play") {
    // --- Input: camera orbit ---
    const drag = input.takeDrag();
    G.camYaw -= drag.dx * 0.005;
    G.camPitch = Math.max(0.05, Math.min(1.1, G.camPitch + drag.dy * 0.003));

    if (input.pressed(KEYS.pause)) setScreen("pause");
    if (input.pressed(KEYS.mute)) {
      audio.ensure();
      audio.setMuted(!audio.muted);
      hud.toast(audio.muted ? "Sound muted (P)" : "Sound on (P)");
    }
    if (input.pressed(KEYS.missionMenu)) {
      hud.showMissionMenu({ current: missions.current, forEach: (fn) => MISSIONS.forEach(fn) });
      // Toggle: the menu button inside closes it.
      const menu = document.getElementById("mission-menu");
      if (menu && !menu.classList.contains("hidden")) {
        // keep open; close button or M again hides it next press
      }
    }
    if (input.pressed("KeyQ")) {
      combat.armed = !combat.armed;
      hud.toast(combat.armed ? "Pistol drawn — click to shoot" : "Pistol holstered");
    }
    if (input.pressed("KeyR")) combat.reload();

    const inCar = !!G.currentCar;
    const axis = input.axis();

    // --- Enter / exit car ---
    if (input.pressed(KEYS.enterCar)) {
      if (inCar) {
        G.exitCar();
      } else {
        const car = nearestCar(CAR.enterDistance);
        if (car) G.enterCar(car);
        else hud.toast("No car close enough — walk up to one and press E.");
      }
    }

    let playerSpeed = 0;
    if (inCar) {
      playerSpeed = driveCar(G.currentCar, input, dt, colliders);
      // Staged shots hold their cruise speed so the HUD keeps showing it.
      if (G.shotMode && G.shotCruise) {
        G.currentCar.userData.car.speed = G.shotCruise;
        playerSpeed = G.shotCruise;
      }
      G.player.pos.copy(G.currentCar.position);
      G.player.heading = G.currentCar.userData.car.heading;
      // Ease the camera behind the car.
      const targetYaw = G.currentCar.userData.car.heading + Math.PI;
      let diff = targetYaw - G.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(playerSpeed) > 3) G.camYaw += diff * Math.min(1, dt * 0.8);
      // Police ramming feedback.
      if (police.nearestCruiserDist(G.player.pos) < 3.2) {
        G.currentCar.userData.car.health = Math.max(0, G.currentCar.userData.car.health - 12 * dt);
        G.currentCar.userData.car.speed *= Math.max(0, 1 - 0.6 * dt);
      }
      if (G.currentCar.userData.car.health <= 0) {
        hud.banner("Your car is wrecked — get out!");
        G.exitCar();
      }
      audio.setEngine(Math.abs(playerSpeed) / CAR.maxSpeed, true);
    } else {
      // --- On foot ---
      const sprint = input.down(KEYS.sprint);
      const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const moveX = axis.x;
      const moveZ = axis.z;
      if (moveX !== 0 || moveZ !== 0) {
        // Movement relative to camera yaw.
        const sin = Math.sin(G.camYaw);
        const cos = Math.cos(G.camYaw);
        const wx = (moveX * cos - moveZ * sin) * -1;
        const wz = (moveX * sin + moveZ * cos) * -1;
        const len = Math.hypot(wx, wz) || 1;
        const nx = G.player.pos.x + (wx / len) * speed * dt;
        const nz = G.player.pos.z + (wz / len) * speed * dt;
        const before = { x: G.player.pos.x, z: G.player.pos.z };
        G.player.pos.x = nx;
        G.player.pos.z = nz;
        if (collideCircle(G.player.pos, PLAYER.radius, colliders)) {
          G.player.pos.x = before.x;
          G.player.pos.z = before.z;
        }
        G.player.pos.x = Math.max(-215, Math.min(215, G.player.pos.x));
        G.player.pos.z = Math.max(-215, Math.min(225, G.player.pos.z));
        G.player.heading = Math.atan2(-wx, -wz);
        playerSpeed = speed;
      }
      // Jump + gravity.
      if (input.pressed(KEYS.jump) && G.player.onGround) {
        G.player.vy = PLAYER.jumpSpeed;
        G.player.onGround = false;
      }
      if (!G.player.onGround) {
        G.player.vy -= 22 * dt;
        G.player.pos.y += G.player.vy * dt;
        if (G.player.pos.y <= 0) {
          G.player.pos.y = 0;
          G.player.vy = 0;
          G.player.onGround = true;
        }
      }
      playerMesh.position.copy(G.player.pos);
      playerMesh.rotation.y = G.player.heading;
      // Walk bob.
      playerMesh.position.y = G.player.pos.y + (playerSpeed > 0 ? Math.abs(Math.sin(nowSec * 9)) * 0.06 : 0);
      audio.setEngine(0, false);
    }

    // --- Combat ---
    if (!inCar && input.pressed(KEYS.punch)) {
      const targets = [...traffic.peds, ...police.cops, ...combat.enemies];
      const hit = combat.tryPunch(G.player.pos, G.player.heading, targets);
      if (hit) {
        if (hit.userData.enemy) {
          hit.userData.enemy.hp -= COMBAT.punchDamage;
          if (hit.userData.enemy.hp <= 0) {
            hit.userData.enemy.alive = false;
            hit.visible = false;
          }
        } else {
          hit.userData.ped.state = "down";
          hit.userData.ped.downTimer = 5;
          police.addHeat(0.6, "assault");
          traffic.scareAll(G.player.pos);
        }
      }
    }
    if (!inCar && combat.armed && input.takeClick()) {
      const shootables = [...combat.enemies, ...traffic.peds, ...police.cops];
      const result = combat.tryShoot(camera, shootables);
      if (result && typeof result === "object" && result.hit) {
        G.gunshotAt = { x: G.player.pos.x, z: G.player.pos.z };
        traffic.scareAll(G.player.pos);
        police.addHeat(result.ped ? 1 : 0.5, "shooting");
        if (result.killed) hud.toast("Target down.");
      } else if (result === "empty") {
        hud.toast("Out of ammo — press R to reload, find ammo boxes.");
      } else if (result && typeof result === "object") {
        G.gunshotAt = { x: G.player.pos.x, z: G.player.pos.z };
        traffic.scareAll(G.player.pos);
      }
    } else {
      input.takeClick();
    }

    combat.update(dt, nowSec, G.player.pos, G.player.heading);
    if (combat.dead && !G.godMode) {
      setScreen("wasted");
      saveGame();
    }

    // --- Traffic + pedestrians ---
    const hitPeds = traffic.update(dt, G.player.pos, playerSpeed, G.gunshotAt);
    G.gunshotAt = null;
    if (hitPeds.length > 0) {
      police.addHeat(1, "hit pedestrian");
      hud.toast("You hit a pedestrian — the cops saw that.");
    }

    // --- Police ---
    // In staged shots the cruisers stay exactly where placed, so the
    // composition is deterministic; live chasing only runs in real play.
    const busted = G.shotMode ? null : police.update(dt, G.player.pos, inCar, playerSpeed);
    if (busted && !G.godMode) {
      setScreen("busted");
      saveGame();
    }
    if (police.stars > 0) {
      G.sirenTimer -= dt;
      if (G.sirenTimer <= 0) {
        G.sirenTimer = 2.4;
        audio.playSirenBurst();
      }
    }

    // --- Missions ---
    const aliveEnemies = combat.enemies.filter((e) => e.userData.enemy?.alive).length;
    missions.update(dt, {
      playerPos: G.player.pos,
      inCar,
      wanted: police.stars,
      enemiesLeft: aliveEnemies,
      inVan: inCar && G.currentCar.userData.car.kind === "van",
    });

    // --- HUD ---
    hud.setHealth(combat.health);
    hud.setCash(G.cash);
    hud.setWanted(police.stars);
    hud.setSpeed(inCar ? playerSpeed * 3.6 : 0, inCar);
    hud.setAmmo(combat.ammoMag, combat.ammoReserve, combat.armed);
    hud.setObjective(missions.objective || "Press M for missions.");
    hud.setVignette(combat.health < 35 ? (35 - combat.health) / 35 : 0);
    hud.update(dt);
    hud.drawMinimap({
      player: G.player.pos,
      playerHeading: G.player.heading,
      target: missions.target,
      traffic: traffic.cars.map((c) => c.position),
      police: [...police.cops.map((c) => c.position), ...police.cruisers.map((c) => c.position)],
    });

    audio.tickMusic(dt);

    // --- Camera ---
    if (G.fixedCam) {
      // In staged shots the look target tracks the player so a driving
      // car cannot leave the frame while frames settle.
      if (G.shotMode) {
        G.fixedCam.look.set(G.player.pos.x, G.player.pos.y + 1.5, G.player.pos.z);
      }
      camera.position.copy(G.fixedCam.pos);
      camera.lookAt(G.fixedCam.look);
    } else {
      const target = new THREE.Vector3(G.player.pos.x, G.player.pos.y, G.player.pos.z);
      updateCamera(camera, target, G.camYaw, G.camPitch, G.camDist, dt);
    }

    // Periodic autosave.
    saveTimer += dt;
    if (saveTimer > 20) {
      saveTimer = 0;
      saveGame();
    }

    // Shot settle: signal readiness for the screenshot capture.
    if (G.settleFrames > 0) {
      G.settleFrames -= 1;
      if (G.settleFrames === 0) window.__solmarReady = true;
    }
  }

  renderer.render(scene, camera);
  input.endFrame();
}

hud.setCash(G.cash);
hud.setHealth(combat.health);
hud.setObjective("Press Start to play.");
frame();
