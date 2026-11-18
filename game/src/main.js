// Solmar Bay — main loop and wiring. Owns the player (on foot and in a
// car), the game state machine (title / play / pause / mission menu /
// busted / wasted), save/load, and every cross-module hook: stealing,
// crimes, busted/wasted respawns, mission rewards, and the staged shots.
import * as THREE from 'three';
import { CFG, MISSIONS } from './config.js';
import { Rng } from './random.js';
import { Input } from './input.js';
import { setupRenderer, FollowCamera } from './render.js';
import { buildCity, collideCircle } from './world.js';
import { Car, randomCarColor } from './vehicles.js';
import { Traffic, makePedMesh } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { applyShot } from './shots.js';

// Rook, the player: dark jacket, jeans, box-built like everyone else.
function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x23232a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a64 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a55 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), jacket);
  torso.position.y = 1.06;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
  head.position.y = 1.64;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), jacket);
  cap.position.y = 1.84;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.74, 0.24), jeans);
  legL.position.set(-0.15, 0.37, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.66, 0.18), jacket);
  armL.position.set(-0.38, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.38;
  g.add(armR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  g.userData.armL = armL;
  g.userData.armR = armR;
  return g;
}

export class Game {
  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.seed = parseInt(params.get('seed') || '1337', 10) || 1337;
    this.shotName = params.get('shot') || null;
    this.rng = new Rng(this.seed);

    this.canvas = document.getElementById('game');
    const { renderer, scene, camera } = setupRenderer(this.canvas);
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.followCam = new FollowCamera(camera);
    this.followCam.yaw = Math.PI;

    this.world = buildCity(scene, this.seed);
    this.input = new Input(this.canvas);
    this.hud = new Hud(document);
    this.audio = new AudioEngine();
    this.traffic = new Traffic(scene, this.world, this.seed);
    this.police = new Police(scene, this.world, this.seed);
    this.combat = new Combat(scene, this.seed);
    this.extraCars = [];

    // --- player state ------------------------------------------------------
    this.player = makePlayerMesh();
    scene.add(this.player);
    this.playerPos = new THREE.Vector3(this.world.spots.playerSpawn.x, 0, this.world.spots.playerSpawn.z);
    this.playerHeading = this.world.spots.playerSpawn.heading;
    this.velY = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.moveSpeed = 0;
    this.currentCar = null;
    this.cash = 0;
    this.godMode = false;
    this.shotMode = false;
    this.state = 'title';
    this._saveTimer = 0;
    this._prevHealth = CFG.player.health;
    this._titleAngle = 0;

    // --- missions ----------------------------------------------------------
    this.missions = new Missions(scene, this.world, {
      addCash: (n) => {
        this.cash += n;
        this.audio.jingle();
        this.save();
      },
      banner: (t, s) => this.hud.banner(t, s),
      toast: (m) => this.hud.toast(m),
      setObjective: (t) => this.hud.setObjective(t),
      setWanted: (n) => this.police.setWanted(n),
      spawnGang: (pos, n) => {
        this.combat.spawnGang(pos, n);
        this.combat.spawnPickup('medkit', pos.x + 9, pos.z + 9);
        this.combat.spawnPickup('ammo', pos.x - 9, pos.z - 9);
      },
      spawnVan: (spot) => this.spawnVan(spot),
    });

    // --- cross-module hooks --------------------------------------------------
    this.police.onBusted = () => this.busted();
    this.police.onSiren = (on) => this.audio.siren(on);
    this.traffic.onPedHit = () => {
      this.police.addCrime(1.5);
      this.hud.toast('Pedestrian hit — the cops saw that');
    };
    this.combat.onPedShot = (group) => {
      const ped = this.traffic.peds.find((p) => p.group === group);
      if (ped) ped.knockDown();
      this.police.addCrime(1.5);
    };
    this.combat.onGunshot = (pos) => {
      this.traffic.gunshot(pos);
      let nearest = Infinity;
      for (const cop of this.police.cops) {
        nearest = Math.min(nearest, Math.hypot(cop.group.position.x - pos.x, cop.group.position.z - pos.z));
      }
      for (const c of this.police.cruisers) {
        nearest = Math.min(nearest, Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z));
      }
      if (nearest < 45) this.police.addCrime(0.5);
    };
    this.combat.onPickup = (kind) => {
      this.audio.chime();
      this.hud.toast(kind === 'medkit' ? 'Medkit — health restored' : 'Ammo restocked');
    };

    // A few pickups scattered around the city from the start.
    this.combat.spawnPickup('medkit', 20, -40);
    this.combat.spawnPickup('medkit', -60, 60);
    this.combat.spawnPickup('ammo', 60, -100);
    this.combat.spawnPickup('ammo', -120, -40);

    this.load();
    this.player.position.copy(this.playerPos);
    this.player.rotation.y = this.playerHeading;

    // First gesture unlocks audio (browsers demand it).
    const unlock = () => this.audio.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('mousedown', unlock);

    if (this.shotName) {
      this.state = 'play';
      this.shotMode = true;
      this.godMode = true;
      this.hud.showScreen(null);
      applyShot(this.shotName, this);
    } else {
      this.hud.showScreen('title');
      this.hud.setObjective('Press M to start the first mission');
    }

    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  // --- shot helpers ---------------------------------------------------------
  setGodMode(b) {
    this.godMode = b;
  }

  setWanted(n) {
    this.police.setWanted(n);
  }

  setObjective(t) {
    this.hud.setObjective(t);
  }

  banner(t, s) {
    this.hud.banner(t, s);
  }

  setFixedCamera(x, y, z, lx, ly, lz) {
    this.shotMode = true;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(lx, ly, lz);
  }

  teleportPlayer(x, z, heading) {
    this.exitCar(true);
    this.playerPos.set(x, 0, z);
    this.playerHeading = heading;
    this.player.position.copy(this.playerPos);
    this.player.rotation.y = heading;
    this.followCam.yaw = heading + Math.PI;
    this.followCam.snap(this.playerPos, false);
  }

  placePlayerCar(kind, color, x, z, heading, health = 100) {
    if (this.currentCar) this.exitCar(true);
    const car = new Car(kind, color, x, z, heading);
    car.health = health;
    car.driven = true;
    this.scene.add(car.group);
    this.extraCars.push(car);
    this.currentCar = car;
    this.player.visible = false;
    return car;
  }

  spawnParkedCar(kind, color, x, z, heading) {
    const car = new Car(kind, color, x, z, heading);
    car.parked = true;
    this.scene.add(car.group);
    this.traffic.parked.push(car);
    return car;
  }

  spawnPoliceCruiser(x, z, heading) {
    const cruiser = new Car('police', 0x1a1a1a, x, z, heading);
    this.scene.add(cruiser.group);
    this.police.cruisers.push(cruiser);
    return cruiser;
  }

  spawnFootCop(x, z) {
    const group = makePedMesh(0x27408a);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.1, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x182a5a }),
    );
    cap.position.y = 1.82;
    group.add(cap);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.police.cops.push({ group, arrestTimer: 0, runPhase: 0 });
    return group;
  }

  spawnVan(spot) {
    const van = new Car('van', 0x4a5a48, spot.x, spot.z, 0);
    van.armoured = true;
    van.parked = true;
    van.health = 140;
    this.scene.add(van.group);
    this.extraCars.push(van);
    return van;
  }

  nearestEnterableCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    const consider = (car) => {
      if (car.wrecked || car.driven) return;
      const d = Math.hypot(car.pos.x - this.playerPos.x, car.pos.z - this.playerPos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    };
    for (const car of this.traffic.parked) consider(car);
    for (const car of this.extraCars) consider(car);
    return best;
  }

  enterCar(car) {
    this.currentCar = car;
    car.parked = false;
    car.driven = true;
    this.player.visible = false;
    if (!car.stolen) {
      car.stolen = true;
      let seen = false;
      for (const cop of this.police.cops) {
        if (Math.hypot(cop.group.position.x - car.pos.x, cop.group.position.z - car.pos.z) < 55) seen = true;
      }
      for (const c of this.police.cruisers) {
        if (Math.hypot(c.pos.x - car.pos.x, c.pos.z - car.pos.z) < 55) seen = true;
      }
      if (seen) {
        this.police.addCrime(1);
        this.hud.toast('Caught stealing — wanted level up!');
      } else {
        this.hud.toast('Car stolen — keep it quiet');
      }
    }
    this.audio.chime();
  }

  exitCar(silent) {
    if (!this.currentCar) return;
    const car = this.currentCar;
    car.driven = false;
    const r = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
    this.playerPos.set(car.pos.x + r.x * 2.4, 0, car.pos.z + r.z * 2.4);
    this.playerHeading = car.heading;
    this.player.position.copy(this.playerPos);
    this.player.rotation.y = this.playerHeading;
    this.player.visible = true;
    this.currentCar = null;
    if (!silent) this.audio.chime();
  }

  // --- busted / wasted -------------------------------------------------------
  busted() {
    if (this.state !== 'play') return;
    this.state = 'busted';
    this.exitCar(true);
    this.police.reset();
    this.combat.clearEnemies();
    if (this.missions.phase === 'active') this.missions.fail();
    const lost = Math.floor(this.cash * CFG.police.bustCashLoss);
    this.cash -= lost;
    this.combat.health = CFG.player.health;
    this.combat.ammo = Math.max(this.combat.ammo, 12);
    this.audio.failSting();
    this.audio.siren(false);
    this.hud.showScreen('busted');
    this.save();
  }

  wasted() {
    if (this.state !== 'play') return;
    this.state = 'wasted';
    this.exitCar(true);
    this.police.reset();
    this.combat.clearEnemies();
    if (this.missions.phase === 'active') this.missions.fail();
    const lost = Math.floor(this.cash * CFG.police.bustCashLoss);
    this.cash -= lost;
    this.combat.health = CFG.player.health;
    this.combat.ammo = Math.max(this.combat.ammo, 12);
    this.audio.failSting();
    this.audio.siren(false);
    this.hud.showScreen('wasted');
    this.save();
  }

  respawn() {
    const h = this.world.spots.hospital;
    this.teleportPlayer(h.x, h.z, Math.PI / 2);
    this.state = 'play';
    this.hud.showScreen(null);
    this.hud.banner('Solmar General', 'Patched up. Back on the streets.');
  }

  // --- save / load ------------------------------------------------------------
  save() {
    if (this.shotMode) return;
    try {
      localStorage.setItem(
        CFG.saveKey,
        JSON.stringify({
          x: this.playerPos.x,
          z: this.playerPos.z,
          cash: this.cash,
          mission: this.missions.index,
          health: this.combat.health,
          ammo: this.combat.ammo,
        }),
      );
    } catch (err) {}
  }

  load() {
    try {
      const raw = localStorage.getItem(CFG.saveKey);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.x === 'number') this.playerPos.set(s.x, 0, s.z);
      if (typeof s.cash === 'number') this.cash = s.cash;
      if (typeof s.mission === 'number') this.missions.index = Math.max(0, Math.min(s.mission, MISSIONS.length - 1));
      if (typeof s.health === 'number') this.combat.health = s.health;
      if (typeof s.ammo === 'number') this.combat.ammo = s.ammo;
    } catch (err) {}
  }

  // --- per-frame updates -------------------------------------------------------
  updatePlay(dt) {
    const input = this.input;
    const drag = input.takeDrag();
    if (drag.x || drag.y) this.followCam.applyDrag(drag.x, drag.y);

    if (input.hit(CFG.keys.pause)) {
      this.state = 'pause';
      this.hud.showScreen('pause');
      return;
    }
    if (input.hit(CFG.keys.missionMenu)) {
      this.state = 'mission';
      this.hud.buildMissionMenu(MISSIONS, this.missions.index, this.missions.allDone, (i) => {
        this.missions.start(i);
        this.state = 'play';
        this.hud.showScreen(null);
      });
      this.hud.showScreen('mission');
      return;
    }
    if (input.hit(CFG.keys.mute)) {
      const muted = this.audio.toggleMute();
      this.hud.toast(muted ? 'Sound muted (P to unmute)' : 'Sound on');
    }

    const focusPos = this.currentCar ? this.currentCar.pos : this.playerPos;

    // --- driving / walking -----------------------------------------------------
    if (this.currentCar) {
      const car = this.currentCar;
      const throttle = input.moveY;
      const steer = -input.moveX;
      const handbrake = input.down(CFG.keys.jump);
      car.drive(dt, throttle, steer, handbrake, this.world.colliders, this.traffic.allCars().concat(this.extraCars, this.police.cruisers));
      if (input.hit(CFG.keys.enterCar)) this.exitCar(false);
      this.audio.engine(Math.min(1, Math.abs(car.speed) / car.maxSpeed), true);
    } else {
      const sprint = input.down(CFG.keys.sprint);
      const speed = sprint ? CFG.player.sprintSpeed : CFG.player.walkSpeed;
      const yaw = this.followCam.yaw;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const rx = -Math.cos(yaw);
      const rz = Math.sin(yaw);
      const mx = input.moveX;
      const my = input.moveY;
      let dx = fx * my + rx * mx;
      let dz = fz * my + rz * mx;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        dx /= len;
        dz /= len;
        this.playerHeading = Math.atan2(dx, dz);
        this.moveSpeed += (speed - this.moveSpeed) * Math.min(1, dt * 8);
      } else {
        this.moveSpeed += (0 - this.moveSpeed) * Math.min(1, dt * 10);
      }
      this.playerPos.x += dx * this.moveSpeed * dt;
      this.playerPos.z += dz * this.moveSpeed * dt;
      // Jump + gravity.
      if (input.hit(CFG.keys.jump) && this.onGround) {
        this.velY = CFG.player.jumpSpeed;
        this.onGround = false;
      }
      if (!this.onGround) {
        this.velY -= CFG.player.gravity * dt;
        this.playerPos.y += this.velY * dt;
        if (this.playerPos.y <= 0) {
          this.playerPos.y = 0;
          this.velY = 0;
          this.onGround = true;
        }
      }
      // Walls + city bounds: the player cannot walk through buildings.
      collideCircle(this.playerPos, 0.5, this.world.colliders);
      this.playerPos.x = Math.max(-248, Math.min(248, this.playerPos.x));
      this.playerPos.z = Math.max(-248, Math.min(250, this.playerPos.z));
      this.player.position.copy(this.playerPos);
      this.player.rotation.y = this.playerHeading;
      // Walk-cycle limbs.
      this.walkPhase += dt * this.moveSpeed * 1.6;
      const swing = Math.sin(this.walkPhase) * 0.55 * Math.min(1, this.moveSpeed / 6);
      this.player.userData.legL.rotation.x = swing;
      this.player.userData.legR.rotation.x = -swing;
      this.player.userData.armL.rotation.x = -swing * 0.7;
      this.player.userData.armR.rotation.x = swing * 0.7;

      // Enter a nearby car.
      if (input.hit(CFG.keys.enterCar)) {
        const car = this.nearestEnterableCar(CFG.car.enterRange);
        if (car) this.enterCar(car);
      }
      // Punch.
      if (input.hit(CFG.keys.punch)) {
        this.audio.punch();
        this.combat.punch(this.playerPos, this.playerHeading);
        // Fists vs pedestrians: same cone, they go down and it is a crime.
        for (const ped of this.traffic.peds) {
          if (ped.state === 'down') continue;
          const dxp = ped.group.position.x - this.playerPos.x;
          const dzp = ped.group.position.z - this.playerPos.z;
          const d = Math.hypot(dxp, dzp);
          if (d > CFG.player.punchRange) continue;
          const dot = (dxp * Math.sin(this.playerHeading) + dzp * Math.cos(this.playerHeading)) / (d || 1);
          if (dot < 0.4) continue;
          ped.knockDown();
          this.police.addCrime(1);
        }
      }
      // Shoot.
      if (input.takeClick()) {
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        const origin = this.camera.position.clone();
        const targets = this.combat.enemies.map((e) => e.group).concat(this.traffic.peds.map((p) => p.group));
        const result = this.combat.shoot(origin, dir, targets);
        if (result === 'hit' || result === 'miss') this.audio.shot();
        else if (result === 'empty') this.hud.toast('Out of ammo — find an ammo pickup');
      }
      this.audio.engine(0, false);
    }

    // --- world systems ---------------------------------------------------------
    this.world.update(dt);
    this.traffic.update(dt, focusPos, this.currentCar);
    this.police.update(dt, focusPos, !!this.currentCar, this.currentCar, this.godMode);
    this.missions.update(dt, {
      playerPos: focusPos,
      inCar: !!this.currentCar,
      car: this.currentCar,
      wanted: this.police.wanted,
      gangAlive: this.combat.gangAlive,
    });
    this.combat.update(dt, focusPos, this.traffic.peds, this.godMode);

    // --- health watch ------------------------------------------------------------
    if (this.combat.health < this._prevHealth) this.hud.flashDamage();
    this._prevHealth = this.combat.health;
    if (!this.combat.alive && !this.godMode) {
      this.wasted();
      return;
    }

    // --- camera + HUD ------------------------------------------------------------
    this.followCam.update(this.currentCar ? this.currentCar.pos : this.playerPos, dt, !!this.currentCar);
    this.updateHud(dt);

    // --- autosave ------------------------------------------------------------------
    this._saveTimer += dt;
    if (this._saveTimer > 12) {
      this._saveTimer = 0;
      this.save();
    }
  }

  updateHud(dt) {
    const dots = this.traffic.dots();
    const focusPos = this.currentCar ? this.currentCar.pos : this.playerPos;
    this.hud.update(dt, {
      health: this.combat.health,
      maxHealth: CFG.player.health,
      cash: this.cash,
      stars: this.police.stars,
      speedKmh: this.currentCar ? this.currentCar.speedKmh : this.moveSpeed * 3.6,
      inCar: !!this.currentCar,
      armed: !this.currentCar,
      ammo: this.combat.ammo,
      muted: this.audio.muted,
      map: {
        roads: this.world.roads,
        player: { x: focusPos.x, z: focusPos.z, heading: this.currentCar ? this.currentCar.heading : this.playerHeading },
        cars: dots.cars,
        peds: dots.peds,
        police: this.police.blips().map((b) => [b[0], b[1]]),
        blip: this.missions.blip(),
        bounds: this.world.bounds,
        beachStart: CFG.world.beachStart,
      },
    });
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'play') {
      if (this.shotMode) {
        // Staged shot: frozen composition, only the city itself moves.
        this.world.update(dt);
        this.missions.update(dt, null);
        this.updateHud(dt);
      } else {
        this.updatePlay(dt);
      }
    } else if (this.state === 'title') {
      this._titleAngle += dt * 0.045;
      this.camera.position.set(Math.sin(this._titleAngle) * 150, 48, Math.cos(this._titleAngle) * 150 - 10);
      this.camera.lookAt(0, 12, 0);
      this.world.update(dt);
      if (this.input.pressed.size > 0 || this.input.takeClick()) {
        this.audio.unlock();
        this.state = 'play';
        this.hud.showScreen(null);
        this.hud.banner('Welcome to Solmar Bay', 'Steal a car. Run the missions. Lose the cops. Press M to start.');
      }
    } else if (this.state === 'pause') {
      if (this.input.hit(CFG.keys.pause)) {
        this.state = 'play';
        this.hud.showScreen(null);
      }
    } else if (this.state === 'mission') {
      if (this.input.hit(CFG.keys.missionMenu) || this.input.hit(CFG.keys.pause)) {
        this.state = 'play';
        this.hud.showScreen(null);
      }
    } else if (this.state === 'busted' || this.state === 'wasted') {
      if (this.input.pressed.size > 0 || this.input.takeClick()) {
        this.respawn();
      }
    }
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
}

window.game = new Game();
