import * as THREE from 'three';
import { clamp, RULES, distance } from './config.js';
import { mulberry32 } from './random.js';
import { createInput } from './input.js';
import { createRender } from './render.js';
import { createWorld, person, animatePerson, box } from './world.js';
import { createVehicles } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'solmar-bay-rook-v1';
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 1646) >>> 0;
const view = createRender();
const game = {
  ...view, rng: mulberry32(seed), input: createInput(view.canvas), audio: createAudio(),
  mode: 'title', time: 0, frame: 0, cash: 250, health: 100, ammo: 48, wanted: 0, completed: 0,
  player: { x: 0, y: 0, z: 20, angle: Math.PI, vy: 0 }, car: null,
  stats: { thefts: 0, kills: 0 }, damageFlash: 0, lastDamage: -100, lastCrime: -100,
  policeSeen: false, escapeProgress: 0, arrestProgress: 0, god: false, shot: null,
  cameraAngle: Math.PI, cameraReady: false, punchTime: 0,
  makePerson: person,
  toast(text, seconds) { game.hud?.toast(text, seconds); },
  damage(amount) {
    if (game.god || amount <= 0) return;
    game.health = Math.max(0, game.health - amount); game.damageFlash = 1; game.lastDamage = game.time;
    if (game.health <= 0) game.end('wasted');
  },
  crime(amount) { game.police.crime(amount); },
  save() {
    if (game.shot) return;
    try {
      const data = { version: 1, player: { x: game.player.x, z: game.player.z, angle: game.player.angle }, cash: game.cash, health: game.health, ammo: game.ammo, wanted: game.wanted, completed: game.completed, stats: game.stats, mission: game.missions.active ? game.missions.index : null };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data)); game.hasSave = true;
    } catch { game.toast('Local save unavailable in this browser'); }
  },
  begin(load) {
    game.audio.start();
    if (load) game.load();
    else {
      game.player.x = 0; game.player.z = 20; game.player.angle = Math.PI;
      game.cash = 250; game.health = 100; game.ammo = 48; game.wanted = 0; game.completed = 0;
      game.missions.start(0);
    }
    game.mode = 'play'; game.hud.screen('play'); game.cameraReady = false;
  },
  resume() { game.mode = 'play'; game.audio.start(); game.hud.screen('play'); },
  end(kind) {
    if (game.god || game.mode !== 'play') return;
    game.mode = kind; game.cash = Math.max(0, game.cash - 150); game.missions.fail(); game.audio.hit(); game.hud.screen(kind);
  },
  respawn() {
    if (game.car) { game.car.role = 'parked'; game.car.speed = 0; game.car = null; }
    Object.assign(game.player, { x: -64, z: 12, y: 0, vy: 0, angle: Math.PI });
    game.health = 100; game.ammo = Math.max(24, game.ammo); game.wanted = 0; game.damageFlash = 0;
    game.police.reset(); game.combat.clearEnemies(); game.resume(); game.cameraReady = false; game.save();
  },
  load() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!data || data.version !== 1) return;
      for (const field of ['cash', 'health', 'ammo', 'wanted', 'completed']) if (Number.isFinite(data[field])) game[field] = data[field];
      game.cash = Math.max(0, game.cash); game.health = clamp(game.health, 1, 100); game.wanted = clamp(game.wanted, 0, 5); game.completed = clamp(game.completed, 0, 5);
      if (data.player && Number.isFinite(data.player.x) && Number.isFinite(data.player.z) && !game.world.blocked(data.player.x, data.player.z)) {
        game.player.x = data.player.x; game.player.z = data.player.z; game.player.angle = data.player.angle || 0;
      }
      if (Number.isInteger(data.mission)) game.missions.start(clamp(data.mission, 0, 4));
      game.toast('Welcome back to Solmar Bay, Rook.');
    } catch { game.toast('Save could not be read. Starting on the street.'); }
  }
};
game.world = createWorld(game.scene, game.rng);
game.vehicles = createVehicles(game.scene, game.world, game.rng);
game.playerMesh = person(0xebe0bd);
box(game.playerMesh, 0x30393a, 0, 1.13, -0.24, 0.55, 0.7, 0.1);
const gun = box(game.playerMesh, 0x293a40, 0.5, 1.12, 0.3, 0.15, 0.2, 0.6);
game.scene.add(game.playerMesh);
game.traffic = createTraffic(game);
game.police = createPolice(game);
game.combat = createCombat(game);
game.missions = createMissions(game);
game.hud = createHUD(game);
try { game.hasSave = Boolean(localStorage.getItem(SAVE_KEY)); } catch { game.hasSave = false; }

function walk(dt) {
  const input = game.input, p = game.player;
  const forward = Number(input.held.has('KeyW')) - Number(input.held.has('KeyS'));
  const right = Number(input.held.has('KeyD')) - Number(input.held.has('KeyA'));
  let dx = -Math.sin(game.cameraAngle) * forward - Math.cos(game.cameraAngle) * right;
  let dz = -Math.cos(game.cameraAngle) * forward + Math.sin(game.cameraAngle) * right;
  const length = Math.hypot(dx, dz);
  if (length > 0) {
    dx /= length; dz /= length;
    const speed = input.held.has('ShiftLeft') || input.held.has('ShiftRight') ? RULES.sprint : RULES.walk;
    const nx = p.x + dx * speed * dt, nz = p.z + dz * speed * dt;
    if (!game.world.blocked(nx, p.z, 0.55)) p.x = nx;
    if (!game.world.blocked(p.x, nz, 0.55)) p.z = nz;
    p.angle = Math.atan2(dx, dz);
  }
  if (input.pressed.has('Space') && p.y <= 0.01) { p.vy = 7; }
  p.vy -= 19 * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y === 0) p.vy = 0;
  animatePerson(game.playerMesh, game.time, length ? 1 : 0);
  game.playerMesh.position.set(p.x, p.y, p.z); game.playerMesh.rotation.y = p.angle;
  game.punchTime = Math.max(0, game.punchTime - dt);
  gun.rotation.x = game.punchTime > 0 ? -1 : 0;
}
const desiredCamera = new THREE.Vector3(), targetCamera = new THREE.Vector3();
function cameraUpdate(dt) {
  if (game.fixedCamera) { game.camera.position.copy(game.fixedCamera.position); game.camera.lookAt(game.fixedCamera.look); return; }
  if (game.mode === 'title') {
    game.camera.position.set(42 + Math.sin(game.time * 0.06) * 8, 35, 253);
    game.camera.lookAt(-12, 9, 167); return;
  }
  const p = game.player;
  // Drag offset remains stable; driving gradually recenters when the mouse is released.
  if (game.car && !game.input.dragging) game.input.orbit *= Math.pow(0.4, dt);
  const base = game.car ? game.car.angle + Math.PI : Math.PI;
  game.cameraAngle = base + game.input.orbit;
  const arm = game.car ? 12 + Math.abs(game.car.speed) * 0.07 : 7.5;
  const height = game.car ? 6 + game.input.pitch * 5 : 2.8 + game.input.pitch * 6;
  desiredCamera.set(p.x + Math.sin(game.cameraAngle) * arm, p.y + height, p.z + Math.cos(game.cameraAngle) * arm);
  targetCamera.set(p.x, p.y + (game.car ? 1.3 : 1.4), p.z);
  // Pull the camera in before it enters a building, preserving a clear third-person view.
  for (let t = 0.15; t < 1; t += 0.07) {
    const x = targetCamera.x + (desiredCamera.x - targetCamera.x) * t;
    const z = targetCamera.z + (desiredCamera.z - targetCamera.z) * t;
    if (game.world.blocked(x, z, 0.2)) { desiredCamera.lerpVectors(targetCamera, desiredCamera, Math.max(0.2, t - 0.08)); desiredCamera.y = Math.max(desiredCamera.y, 3); break; }
  }
  if (!game.cameraReady) { game.camera.position.copy(desiredCamera); game.cameraReady = true; }
  else game.camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 8));
  game.camera.lookAt(targetCamera);
  game.sun.position.set(p.x - 100, 180, p.z + 80); game.sun.target.position.set(p.x, 0, p.z);
}
function controls() {
  const pressed = game.input.pressed;
  if (pressed.has('KeyP')) { const muted = game.audio.toggle(); game.toast(muted ? 'Sound muted' : 'Sound on'); }
  if (pressed.has('Escape')) {
    if (game.mode === 'play') { game.mode = 'pause'; game.save(); game.hud.screen('pause'); }
    else if (['pause', 'missions'].includes(game.mode)) game.resume();
  }
  if (pressed.has('KeyM') && ['play', 'missions'].includes(game.mode)) {
    if (game.mode === 'missions') game.resume();
    else { game.mode = 'missions'; game.hud.screen('missions'); }
  }
  if (game.mode !== 'play' || game.shot) return;
  if (pressed.has('KeyE')) game.vehicles.enter(game);
  if (pressed.has('KeyF')) game.combat.punch();
  if (game.input.shoot) { game.audio.start(); game.combat.shoot(); }
}
let previous = 0, saveClock = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - previous) / 1000 || 0, 0.04); previous = now; game.frame++;
  controls();
  if (game.mode === 'play' && !game.shot) {
    game.time += dt;
    if (game.car) {
      game.vehicles.drive(game.car, game.input, dt, game);
      game.player.x = game.car.x; game.player.z = game.car.z; game.player.angle = game.car.angle; game.player.y = 0;
      if (game.car.health <= 0) game.damage(dt * 5);
    } else walk(dt);
    game.playerMesh.visible = !game.car;
    game.traffic.update(dt); game.police.update(dt); game.combat.update(dt); game.missions.update(dt);
    game.vehicles.update(dt, game.time); game.damageFlash = Math.max(0, game.damageFlash - dt * 2);
    saveClock += dt; if (saveClock > 15) { saveClock = 0; game.save(); }
  } else if (game.shot) {
    // Fixed simulation time and seeded placement make captures independent of frame timing.
    game.time = 2; game.vehicles.update(dt, 2);
  } else if (game.mode === 'title') game.time += dt;
  cameraUpdate(dt); game.audio.update(dt, game); game.hud.update(); game.renderer.render(game.scene, game.camera); game.input.endFrame();
}
window.addEventListener('beforeunload', () => { if (game.mode !== 'title') game.save(); });
window.addEventListener('error', event => {
  let error = document.getElementById('error');
  if (!error) { error = document.createElement('div'); error.id = 'error'; document.body.append(error); }
  error.textContent = `Solmar Bay encountered an error: ${event.message}`;
});
if (params.has('shot')) stageShot(game, params.get('shot'));
else game.hud.screen('title');
requestAnimationFrame(frame);
