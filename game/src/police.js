// Wanted system for Solmar Bay. Heat 0..5 drives the star display;
// foot cops chase and try to arrest, cruisers spawn at 2 stars and ram.
// Heat only falls when no officer can see the player, so hiding works
// and standing in the open does not.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';
import { Car } from './vehicles.js';
import { makePedMesh } from './traffic.js';

const ROAD_LINES = [-220, -165, -110, -55, 0, 55, 110, 165, 220];

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// A foot cop: blue shirt, dark trousers, cap brim.
function makeCopMesh() {
  const g = makePedMesh(0x27408a);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.1, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x182a5a }),
  );
  cap.position.y = 1.82;
  g.add(cap);
  return g;
}

export class Police {
  constructor(scene, world, seed = 1337) {
    this.scene = scene;
    this.world = world;
    this.rng = new Rng(seed + 913);
    this.heat = 0;
    this.cops = [];      // {group, arrestTimer, runPhase}
    this.cruisers = [];  // Car instances, kind 'police'
    this.unseenTimer = 0;
    this.sirenOn = false;
    this.onBusted = null;
    this.onSiren = null;
    this._flash = 0;
  }

  get stars() {
    return Math.min(CFG.police.maxStars, Math.floor(this.heat + 0.001));
  }

  get wanted() {
    return this.heat > 0.01;
  }

  setWanted(n) {
    this.heat = Math.max(0, Math.min(CFG.police.maxStars, n));
    this.unseenTimer = 0;
  }

  addCrime(amount) {
    this.heat = Math.min(CFG.police.maxStars, this.heat + amount);
    this.unseenTimer = 0;
  }

  // Spawn point on a road, 45–60 m from the player, inside the city.
  spawnPointNear(playerPos) {
    for (let tries = 0; tries < 12; tries++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const dist = this.rng.range(45, 60);
      const x = Math.max(-225, Math.min(225, playerPos.x + Math.sin(angle) * dist));
      const z = Math.max(-225, Math.min(195, playerPos.z + Math.cos(angle) * dist));
      if (Math.hypot(x - playerPos.x, z - playerPos.z) > 38) return { x, z };
    }
    return { x: playerPos.x + 45, z: playerPos.z };
  }

  update(dt, playerPos, playerInCar, playerCar, godMode) {
    const stars = this.stars;
    // --- desired force size ----------------------------------------------
    const wantCops = stars >= 1 ? Math.min(2 + stars, CFG.police.maxFootCops) : 0;
    const wantCruisers = stars >= CFG.police.cruiserAtStars
      ? Math.min(stars - 1, CFG.police.maxCruisers)
      : 0;

    while (this.cops.length < wantCops) {
      const sp = this.spawnPointNear(playerPos);
      const cop = {
        group: makeCopMesh(),
        arrestTimer: 0,
        runPhase: this.rng.range(0, 6),
      };
      cop.group.position.set(sp.x, 0, sp.z);
      this.scene.add(cop.group);
      this.cops.push(cop);
    }
    while (this.cruisers.length < wantCruisers) {
      const sp = this.spawnPointNear(playerPos);
      const cruiser = new Car('police', 0x1a1a1a, sp.x, sp.z, this.rng.range(0, Math.PI * 2));
      cruiser.group.userData.sirenPhase = 0;
      this.scene.add(cruiser.group);
      this.cruisers.push(cruiser);
    }
    // Trim the force when the heat falls.
    while (this.cops.length > wantCops) {
      const cop = this.cops.pop();
      this.scene.remove(cop.group);
    }
    while (this.cruisers.length > wantCruisers) {
      const c = this.cruisers.pop();
      c.dispose(this.scene);
    }

    // --- foot cops chase ---------------------------------------------------
    let anyNear = false;
    for (const cop of this.cops) {
      const p = cop.group.position;
      const dx = playerPos.x - p.x;
      const dz = playerPos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < CFG.police.sightRange) anyNear = true;
      const heading = Math.atan2(dx, dz);
      cop.group.rotation.y = heading;
      const speed = playerInCar ? 4.2 : 5.6;
      if (d > 1.4) {
        p.x += Math.sin(heading) * speed * dt;
        p.z += Math.cos(heading) * speed * dt;
        cop.runPhase += dt * 10;
        const swing = Math.sin(cop.runPhase) * 0.6;
        cop.group.userData.legL.rotation.x = swing;
        cop.group.userData.legR.rotation.x = -swing;
      } else {
        cop.group.userData.legL.rotation.x = 0;
        cop.group.userData.legR.rotation.x = 0;
      }
      // Arrest: only on foot, only up close, only if not god mode.
      if (!playerInCar && d < CFG.police.arrestRange && !godMode) {
        cop.arrestTimer += dt;
        if (cop.arrestTimer > CFG.police.arrestTime && this.onBusted) {
          this.onBusted();
          return;
        }
      } else {
        cop.arrestTimer = 0;
      }
    }

    // --- cruisers chase and ram --------------------------------------------
    const allCars = [playerCar, ...this.cruisers].filter(Boolean);
    for (const cruiser of this.cruisers) {
      const p = cruiser.pos;
      const dx = playerPos.x - p.x;
      const dz = playerPos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < CFG.police.sightRange) anyNear = true;
      const desired = Math.atan2(dx, dz);
      const steer = Math.max(-1, Math.min(1, wrapAngle(desired - cruiser.heading) * 2));
      const throttle = d > 6 ? 1 : d > 3 ? 0.4 : 0;
      cruiser.drive(dt, throttle, steer, false, this.world.colliders, allCars);
      // Ram: contact with the player's car hurts it and slows both.
      if (playerCar && d < 4.2 && Math.abs(cruiser.speed) > 3) {
        playerCar.damage(CFG.police.ramDamage * dt * 3);
        playerCar.speed *= 0.94;
        cruiser.speed *= 0.9;
      }
      // On foot and a cruiser touches the player: it stops and the arrest
      // clock starts through the nearest foot cop logic above; if no cop
      // is near, the cruiser itself can still bust the player.
      if (!playerInCar && d < 2.2 && !godMode && this.onBusted) {
        cruiser._touchTimer = (cruiser._touchTimer || 0) + dt;
        if (cruiser._touchTimer > 1.2) {
          this.onBusted();
          return;
        }
      } else {
        cruiser._touchTimer = 0;
      }
      // Flash the light bar red/blue.
      this._flash += dt;
      const phase = Math.floor(this._flash * 6) % 2;
      if (cruiser.group.userData.lightRed) {
        cruiser.group.userData.lightRed.material.color.setHex(phase === 0 ? 0xff2020 : 0x551010);
        cruiser.group.userData.lightBlue.material.color.setHex(phase === 0 ? 0x101055 : 0x2040ff);
      }
    }

    // --- heat decay: only when nobody can see the player -------------------
    if (!anyNear && this.heat > 0) {
      this.unseenTimer += dt;
      if (this.unseenTimer > CFG.police.decayDelay) {
        this.heat = Math.max(0, this.heat - CFG.police.decayRate * dt);
      }
    } else {
      this.unseenTimer = 0;
    }

    // --- siren state --------------------------------------------------------
    const wantSiren = this.cruisers.length > 0;
    if (wantSiren !== this.sirenOn) {
      this.sirenOn = wantSiren;
      if (this.onSiren) this.onSiren(wantSiren);
    }
  }

  // Minimap blips: [x, z, kind] where kind is 'cop' or 'cruiser'.
  blips() {
    const out = [];
    for (const cop of this.cops) out.push([cop.group.position.x, cop.group.position.z, 'cop']);
    for (const c of this.cruisers) out.push([c.pos.x, c.pos.z, 'cruiser']);
    return out;
  }

  reset() {
    for (const cop of this.cops) this.scene.remove(cop.group);
    for (const c of this.cruisers) c.dispose(this.scene);
    this.cops = [];
    this.cruisers = [];
    this.heat = 0;
    this.unseenTimer = 0;
    if (this.sirenOn && this.onSiren) this.onSiren(false);
    this.sirenOn = false;
  }
}
