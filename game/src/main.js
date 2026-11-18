// Solmar Bay — game loop, screens, player controller, save/load.
// Wires world, traffic, police, missions, combat, hud and audio together.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';
import { Input } from './input.js';
import { buildWorld } from './world.js';
import { spawnCar, driveCar, removeCar, CAR_COLOURS } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { MissionManager } from './missions.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { AudioSys } from './audio.js';
import { applyShot } from './shots.js';
import { createRenderer } from './render.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = parseInt(params.get('seed') || '7', 10) || 7;

const canvas = document.getElementById('game');
const { renderer, scene, camera } = createRenderer(canvas);
const world = buildWorld(scene, shotName ? 1 : seed);
const input = new Input(canvas);
const hud = new Hud();
const audio = new AudioSys();
const traffic = new Traffic(scene, world, shotName ? 1 : seed);
const police = new Police(scene, world, shotName ? 1 : seed);
const combat = new Combat(scene, camera, shotName ? 1 : seed);
const rng = new Rng(shotName ? 1 : seed);

const state = {
  mode: 'title', // title | play | pause | busted | wasted | mission
  health: CFG.player.maxHealth,
  cash: CFG.player.startCash,
  god: false,
  shotMode: !!shotName,
  shotCam: null,
  time: 0,
  lastDamageAt: -100,
  respawnAt: 0,
  saveTimer: 0,
};

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.38, 1.05, 10),
    new THREE.MeshLambertMaterial({ color: 0x2e5aa8 }),
  );
  jacket.position.y = 0.98;
  jacket.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }),
  );
  head.position.y = 1.75;
  head.castShadow = true;
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshLambertMaterial({ color: 0x1c1a18 }),
  );
  hair.position.y = 1.78;
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3240 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), legMat);
  legL.position.set(-0.16, 0.28, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  const armMat = new THREE.MeshLambertMaterial({ color: 0x2e5aa8 });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), armMat);
  armL.position.set(-0.44, 1.05, 0);
  const armR = armL.clone();
  armR.position.x = 0.44;
  g.add(jacket, head, hair, legL, legR, armL, armR);
  g.userData.legs = [legL, legR];
  g.userData.arms = [armL, armR];
  return g;
}

const player = {
  pos: new THREE.Vector3(0, 0, 24),
  heading: Math.PI,
  velY: 0,
  onGround: true,
  car: null,
  mesh: makePlayerMesh(),
  walkPhase: 0,
  speed: 0,
};
scene.add(player.mesh);

// parked cars (stealable, roadside)
const parked = [];
function spawnParked(n) {
  const lines = world.lines;
  for (let i = 0; i < n; i++) {
    const horizontal = rng.chance(0.5);
    const line = rng.pick(lines);
    const along = rng.range(-190, 190);
    const side = rng.either(-1, 1) * 8.6;
    const x = horizontal ? along : line + side;
    const z = horizontal ? line + side : along;
    if (z > world.beachZ - 10) continue;
    const heading = horizontal ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
    const kind = rng.pick(['sedan', 'sedan', 'sports', 'taxi', 'van']);
    parked.push(spawnCar(scene, kind, x, z, heading, rng.pick(CAR_COLOURS)));
  }
}
spawnParked(12);
traffic.spawnInitial();

// mission-5 van holder (set by the missions callback)
let missionVan = null;

const missions = new MissionManager(scene, hud, {
  onCash: (n) => { state.cash += n; },
  onToast: (t) => hud.toast(t),
  onSpawnGang: (count, pos) => combat.spawnGang(pos, count),
  onSpawnVan: (x, z) => {
    const van = spawnCar(scene, 'armored', x, z, Math.PI / 2, 0x3a4046);
    parked.push(van);
    missionVan = van;
    return van;
  },
  onSetWanted: (n) => police.setWanted(n),
  wantedLevel: () => police.stars,
  onProgress: () => saveGame(),
  onMissionComplete: () => { audio.jingle(); saveGame(); },
  onMissionFailed: () => audio.fail(),
});

// pickups scattered around the city
combat.spawnPickup('medkit', 12, -184);
combat.spawnPickup('medkit', -140, 60);
combat.spawnPickup('ammo', 60, -92);
combat.spawnPickup('ammo', -92, 138);
combat.spawnPickup('medkit', 184, 184);

// ---- save / load ----
function saveGame() {
  try {
    localStorage.setItem(CFG.saveKey, JSON.stringify({
      cash: Math.floor(state.cash),
      health: Math.round(state.health),
      missionIndex: missions.index,
      x: player.pos.x, z: player.pos.z,
    }));
  } catch (e) { /* storage unavailable — play on without saving */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(CFG.saveKey);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (typeof s.cash !== 'number') return false;
    state.cash = s.cash;
    state.health = s.health || CFG.player.maxHealth;
    missions.index = Math.max(0, Math.min(CFG.missions.length, s.missionIndex || 0));
    if (typeof s.x === 'number' && typeof s.z === 'number') player.pos.set(s.x, 0, s.z);
    return true;
  } catch (e) {
    return false;
  }
}
const hadSave = loadGame();

// ---- smoke puffs for wrecked cars ----
const smokePuffs = [];
const smokeGeo = new THREE.SphereGeometry(0.7, 8, 6);
function spawnSmoke(car) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 });
  const puff = new THREE.Mesh(smokeGeo, mat);
  const p = car.group.position;
  puff.position.set(p.x + rng.range(-0.5, 0.5), 1.4, p.z + rng.range(-0.5, 0.5));
  scene.add(puff);
  smokePuffs.push({ mesh: puff, life: 1.3 });
}
function updateSmoke(dt) {
  for (let i = smokePuffs.length - 1; i >= 0; i--) {
    const s = smokePuffs[i];
    s.life -= dt;
    s.mesh.position.y += dt * 1.6;
    s.mesh.scale.setScalar(1 + (1.3 - s.life) * 1.4);
    s.mesh.material.opacity = Math.max(0, s.life / 1.3) * 0.55;
    if (s.life <= 0) {
      scene.remove(s.mesh);
      s.mesh.material.dispose();
      smokePuffs.splice(i, 1);
    }
  }
}

// ---- damage / busted / wasted ----
function damagePlayer(dmg) {
  if (state.god || state.mode !== 'play') return;
  state.health -= dmg;
  state.lastDamageAt = state.time;
  hud.damageFlash();
  if (state.health <= 0) {
    state.health = 0;
    wasted();
  }
}

function leaveCar() {
  if (!player.car) return;
  const car = player.car;
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  player.pos.set(car.group.position.x + rx * 2.4, 0, car.group.position.z + rz * 2.4);
  player.heading = car.heading;
  player.car = null;
  if (!parked.includes(car)) parked.push(car);
  player.mesh.visible = true;
}

function respawn(hospitalFee) {
  state.cash = Math.floor(state.cash * (1 - hospitalFee));
  state.health = CFG.player.maxHealth;
  police.clear();
  combat.clearGang();
  leaveCar();
  player.pos.set(8, 0, -184);
  player.heading = Math.PI;
  player.velY = 0;
  state.mode = 'play';
  hud.showScreen(null);
  hud.toast('You wake up at St. Marina Hospital');
  saveGame();
}

function busted() {
  if (state.mode !== 'play') return;
  state.mode = 'busted';
  audio.busted();
  hud.showScreen('screen-busted');
  document.getElementById('busted-text').textContent =
    `BUSTED — the Solmar Bay PD took 10% of your cash ($${Math.floor(state.cash * 0.1).toLocaleString('en-US')}).`;
  state.respawnAt = state.time + 2.6;
  state.respawnFee = 0.1;
}
function wasted() {
  if (state.mode !== 'play') return;
  state.mode = 'wasted';
  audio.busted();
  hud.showScreen('screen-wasted');
  document.getElementById('wasted-text').textContent =
    `WASTED — the hospital patched you up for 15% of your cash ($${Math.floor(state.cash * 0.15).toLocaleString('en-US')}).`;
  state.respawnAt = state.time + 2.6;
  state.respawnFee = 0.15;
}

// ---- collision helper (axis-separated circle vs AABB) ----
function collidesAt(x, z, r) {
  for (const b of world.colliders) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}
function movePlayer(dx, dz) {
  const r = CFG.player.radius;
  if (!collidesAt(player.pos.x + dx, player.pos.z, r)) player.pos.x += dx;
  if (!collidesAt(player.pos.x, player.pos.z + dz, r)) player.pos.z += dz;
  player.pos.x = Math.max(-world.bounds, Math.min(world.bounds, player.pos.x));
  player.pos.z = Math.max(-world.bounds, Math.min(world.bounds + 28, player.pos.z));
}

// ---- camera ----
let camYaw = Math.PI;
let camPitch = 0.32;
function updateCamera(dt) {
  if (state.shotCam) {
    camera.position.copy(state.shotCam.pos);
    camera.lookAt(state.shotCam.look);
    return;
  }
  const drag = input.consumeDrag();
  camYaw -= drag.x * 0.0042;
  camPitch = Math.max(0.08, Math.min(1.1, camPitch + drag.y * 0.003));
  const dist = player.car ? 9.5 : 6.8;
  const height = player.car ? 3.6 : 3.0;
  const tx = player.pos.x;
  const tz = player.pos.z;
  const cx = tx + Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const cz = tz + Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cy = Math.max(1.4, 1.7 + Math.sin(camPitch) * dist + (height - 3));
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx, 1.7, tz);
}

// ---- entering / exiting cars ----
function nearestStealable(maxD) {
  let best = null;
  let bestD = maxD;
  const all = [...parked, ...traffic.cars];
  for (const car of all) {
    if (car.dead) continue;
    const d = Math.hypot(car.group.position.x - player.pos.x, car.group.position.z - player.pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
function enterCar(car) {
  const pi = parked.indexOf(car);
  if (pi >= 0) parked.splice(pi, 1);
  const ti = traffic.cars.indexOf(car);
  if (ti >= 0) traffic.cars.splice(ti, 1);
  player.car = car;
  player.mesh.visible = false;
  player.pos.set(car.group.position.x, 0, car.group.position.z);
  player.heading = car.heading;
  // stealing in sight of the law draws heat
  if (police.nearestUnitDist(player.pos) < CFG.wanted.sightRange) {
    police.addWanted(CFG.wanted.stealInSight);
    hud.toast('Car stolen — a cop saw you!');
    audio.chime();
  } else {
    hud.toast(car.kind === 'armored' ? 'Armoured van secured!' : 'Car jacked. Drive!');
  }
}

// ---- shooting / punching ----
function shootTargets() {
  return [...traffic.peds.filter((p) => !p.fallen)];
}
function onShotHit(ref, point) {
  if (ref.hp !== undefined && ref.mesh && combat.enemies.includes(ref)) {
    combat.damageEnemy(ref, CFG.combat.pistolDamage);
    if (ref.dead) hud.toast('Gang member down');
    return;
  }
  // pedestrian hit
  const ped = ref;
  if (ped && !ped.fallen) {
    ped.fallen = true;
    ped.fallTimer = 0;
    ped.mesh.rotation.z = Math.PI / 2;
    ped.mesh.position.y = 0.4;
    traffic.reportCrime(ped.x, ped.z);
    police.addWanted(CFG.wanted.pedDown);
    hud.toast('Pedestrian down — wanted level up!');
  }
}
function onPunchHit(t) {
  if (combat.enemies.includes(t)) {
    combat.damageEnemy(t, CFG.combat.punchDamage);
    audio.punch();
    return;
  }
  if (police.cops.includes(t)) {
    police.addWanted(CFG.wanted.copKill);
    hud.toast('You hit a cop — wanted level up!');
    audio.punch();
    return;
  }
  const ped = t;
  if (ped && !ped.fallen) {
    ped.fallen = true;
    ped.fallTimer = 0;
    ped.mesh.rotation.z = Math.PI / 2;
    ped.mesh.position.y = 0.4;
    traffic.reportCrime(ped.x, ped.z);
    police.addWanted(CFG.wanted.pedDown);
    hud.toast('Pedestrian down — wanted level up!');
    audio.punch();
  }
}

// ---- screens / buttons ----
function startGame() {
  audio.ensure();
  audio.startMusic();
  state.mode = 'play';
  hud.showScreen(null);
  hud.setHintVisible(true);
  if (!missions.active && missions.index === 0 && !hadSave) missions.start(0);
  else if (!missions.active && !missions.done) hud.setObjective(`Press M — next job: ${missions.missionName()}`);
}
function togglePause() {
  if (state.mode === 'play') {
    state.mode = 'pause';
    hud.showScreen('screen-pause');
  } else if (state.mode === 'pause') {
    state.mode = 'play';
    hud.showScreen(null);
  }
}
function toggleMissionMenu() {
  if (state.mode === 'play') {
    state.mode = 'mission';
    hud.renderMissionList(CFG.missions, missions.index, missions.index);
    hud.showScreen('screen-mission');
  } else if (state.mode === 'mission') {
    state.mode = 'play';
    hud.showScreen(null);
  }
}
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-restart').addEventListener('click', () => window.location.reload());
document.getElementById('btn-retry-busted').addEventListener('click', () => respawn(0.1));
document.getElementById('btn-retry-wasted').addEventListener('click', () => respawn(0.15));
document.getElementById('btn-start-mission').addEventListener('click', () => {
  missions.startCurrent();
  state.mode = 'play';
  hud.showScreen(null);
});
document.getElementById('btn-close-mission').addEventListener('click', () => {
  state.mode = 'play';
  hud.showScreen(null);
});
if (hadSave) {
  const note = document.getElementById('save-note');
  if (note) note.textContent = `Save found — $${Math.floor(state.cash).toLocaleString('en-US')}, job ${missions.index + 1} of 5.`;
}

// ---- shot mode setup ----
const G = {
  scene, world, traffic, police, missions, combat, hud, audio,
  player, parked, state, rng,
};
if (shotName) {
  startGame();
  applyShot(shotName, G);
  state.mode = 'play';
} else {
  hud.showScreen('screen-title');
}

// ---- main loop ----
const clock = new THREE.Clock();
let fpsFrames = 0;
let fpsTime = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  state.time += dt;

  // busted / wasted auto-respawn timer
  if ((state.mode === 'busted' || state.mode === 'wasted') && state.time >= state.respawnAt) {
    respawn(state.respawnFee || 0.1);
  }

  if (state.mode === 'play') {
    // --- global keys ---
    if (input.justPressed(CFG.keys.pause)) togglePause();
    if (input.justPressed(CFG.keys.missions)) toggleMissionMenu();
    if (input.justPressed(CFG.keys.mute)) {
      const m = audio.toggleMute();
      hud.toast(m ? 'Sound muted (P to unmute)' : 'Sound on');
    }

    if (!state.shotMode) {
      // --- entering / exiting cars ---
      if (input.justPressed(CFG.keys.enter)) {
        if (player.car) leaveCar();
        else {
          const car = nearestStealable(CFG.car.enterRange);
          if (car) enterCar(car);
          else hud.toast('No car nearby — get closer');
        }
      }

      // --- on foot ---
      if (!player.car) {
        const axes = input.moveAxes();
        const sprint = input.down(CFG.keys.sprint);
        const speed = sprint ? CFG.player.sprint : CFG.player.walk;
        const fwdX = -Math.sin(camYaw);
        const fwdZ = -Math.cos(camYaw);
        const rightX = Math.cos(camYaw);
        const rightZ = -Math.sin(camYaw);
        let mx = fwdX * -axes.z + rightX * axes.x;
        let mz = fwdZ * -axes.z + rightZ * axes.x;
        const len = Math.hypot(mx, mz);
        if (len > 0.01) {
          mx /= len; mz /= len;
          movePlayer(mx * speed * dt, mz * speed * dt);
          player.heading = Math.atan2(mx, mz);
          player.speed = speed;
          player.walkPhase += dt * speed * 1.9;
          const swing = Math.sin(player.walkPhase) * 0.5;
          player.mesh.userData.legs[0].rotation.x = swing;
          player.mesh.userData.legs[1].rotation.x = -swing;
          player.mesh.userData.arms[0].rotation.x = -swing * 0.8;
          player.mesh.userData.arms[1].rotation.x = swing * 0.8;
        } else {
          player.speed = 0;
          player.mesh.userData.legs[0].rotation.x *= 0.8;
          player.mesh.userData.legs[1].rotation.x *= 0.8;
          player.mesh.userData.arms[0].rotation.x *= 0.8;
          player.mesh.userData.arms[1].rotation.x *= 0.8;
        }
        // jump + gravity
        if (input.justPressed(CFG.keys.jump) && player.onGround) {
          player.velY = CFG.player.jump;
          player.onGround = false;
        }
        if (!player.onGround) {
          player.velY -= CFG.player.gravity * dt;
          player.pos.y += player.velY * dt;
          if (player.pos.y <= 0) {
            player.pos.y = 0;
            player.velY = 0;
            player.onGround = true;
          }
        }
        // punch
        if (input.justPressed(CFG.keys.punch)) {
          const targets = [...traffic.peds, ...combat.enemies, ...police.cops];
          combat.punch(player.pos, player.heading, targets, onPunchHit);
        }
        // shoot
        if (input.consumeClick() && combat.ammo > 0) {
          const origin = camera.position.clone();
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          audio.ensure();
          if (combat.shoot(origin, dir, shootTargets(), onShotHit)) {
            audio.shot();
            traffic.reportCrime(player.pos.x, player.pos.z);
          }
        } else {
          input.consumeClick();
        }
        player.mesh.position.copy(player.pos);
        player.mesh.rotation.y = player.heading;
      } else {
        // --- driving ---
        const axes = input.moveAxes();
        const ctrl = {
          throttle: -axes.z,
          steer: axes.x,
          brake: input.down(CFG.keys.jump),
        };
        const res = driveCar(player.car, ctrl, dt, world);
        if (res.hitBuilding && res.impact > 6) {
          hud.toast('Crash!');
          hud.damageFlash();
        }
        player.pos.set(player.car.group.position.x, 0, player.car.group.position.z);
        player.heading = player.car.heading;
        // smoke when wrecked
        if (player.car.health < CFG.car.wreckSmokeBelow && !player.car.dead) {
          player.car.smokeTimer -= dt;
          if (player.car.smokeTimer <= 0) {
            player.car.smokeTimer = 0.12;
            spawnSmoke(player.car);
          }
        }
        // wrecked car: bail out
        if (player.car.health <= 0 && !player.car.dead) {
          player.car.dead = true;
          hud.toast('Your car is wrecked — bail out!');
          leaveCar();
        }
        // run over pedestrians
        for (const ped of traffic.peds) {
          if (ped.fallen) continue;
          const d = Math.hypot(ped.x - player.pos.x, ped.z - player.pos.z);
          if (d < 1.7 && Math.abs(player.car.speed) > 4) {
            ped.fallen = true;
            ped.fallTimer = 0;
            ped.mesh.rotation.z = Math.PI / 2;
            ped.mesh.position.y = 0.4;
            traffic.reportCrime(ped.x, ped.z);
            police.addWanted(CFG.wanted.pedDown);
            hud.toast('Pedestrian hit — wanted level up!');
          }
        }
        audio.setEngine(Math.abs(player.car.speed) / player.car.maxSpeed, true);
      }

      // --- world systems ---
      traffic.update(dt, player.pos, player.car ? player.car.speed : player.speed);
      police.update(dt, player, {
        onBusted: busted,
        onRam: () => { if (!state.god) hud.damageFlash(); },
        onStarLost: (n) => hud.toast(n === 0 ? 'You lost them — clean!' : `Wanted level down — ${n} star${n === 1 ? '' : 's'}`),
      });
      missions.update(dt, player, combat);
      combat.update(dt, player.pos, damagePlayer, (kind) => {
        if (kind === 'medkit') {
          state.health = Math.min(CFG.player.maxHealth, state.health + 40);
          hud.toast('Medkit +40 HP');
        } else {
          combat.ammo = Math.min(CFG.combat.pistolAmmoMax, combat.ammo + 24);
          hud.toast('Ammo +24');
        }
        audio.chime();
      });

      // slow health regen after a quiet spell
      if (state.time - state.lastDamageAt > CFG.player.regenDelay && state.health < CFG.player.maxHealth && state.health > 0) {
        state.health = Math.min(CFG.player.maxHealth, state.health + CFG.player.regenRate * dt);
      }
      // audio
      audio.setSiren(police.siren);
      if (!player.car) audio.setEngine(0, false);
      // autosave
      state.saveTimer += dt;
      if (state.saveTimer > 15) {
        state.saveTimer = 0;
        saveGame();
      }
    } else {
      // shot mode: frozen tableau, only the sea / lights move — except the
      // chase car's wreck smoke, which must be visible in the frame
      if (player.car && player.car.health < CFG.car.wreckSmokeBelow && !player.car.dead) {
        player.car.smokeTimer -= dt;
        if (player.car.smokeTimer <= 0) {
          player.car.smokeTimer = 0.12;
          spawnSmoke(player.car);
        }
      }
      audio.setEngine(0, false);
      audio.setSiren(false);
    }

    world.update(dt);
    updateSmoke(dt);
    updateCamera(dt);

    // --- HUD ---
    hud.setHealth(state.health);
    hud.setCash(state.cash);
    hud.setWanted(police.stars);
    hud.setSpeed(player.car ? Math.abs(player.car.speed) * 3.6 : 0);
    hud.setAmmo(player.car ? 0 : combat.ammo);
    hud.setCrosshair(!player.car && state.mode === 'play' && !state.shotMode);
    hud.drawMinimap(world, player, traffic, police, missions.beaconPos, state.time);
    hud.tick(dt);
  } else if (state.mode === 'pause' || state.mode === 'mission') {
    world.update(dt);
  }

  // keep the title screen alive behind the menu
  if (state.mode === 'title') {
    world.update(dt);
    updateCamera(dt);
    camera.position.set(60, 26, -90);
    camera.lookAt(0, 4, 40);
  }

  input.endFrame();
  renderer.render(scene, camera);

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 5) {
    // cheap heartbeat; nothing to report unless the frame rate collapses
    fpsFrames = 0;
    fpsTime = 0;
  }
}
animate();
