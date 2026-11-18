// Solmar Bay — entry point and game loop.
// Wires every module together: screens (title / play / pause /
// busted / wasted), third-person camera, on-foot + driving, save/load
// and the staged screenshot scenes behind ?shot=.

import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildWorld } from './world.js';
import { Car, spawnParkedCars, resolveCircle } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { createRender } from './render.js';
import { applyShot } from './shots.js';

class Game {
  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.shotName = params.get('shot');
    this.seed = Number(params.get('seed') || 1);
    this.rng = new Rng(this.seed);

    const canvas = document.getElementById('game-canvas');
    const render = createRender(canvas);
    this.renderer = render.renderer;
    this.scene = render.scene;
    this.camera = render.camera;

    this.input = new Input();
    this.input.attach(canvas);
    this.audio = new AudioEngine();
    this.hud = new Hud();

    this.world = buildWorld(this.scene, this.rng);
    this.parkedCars = spawnParkedCars(this.scene, this.rng, this.world.colliders, 10);
    this.traffic = new Traffic(this.scene, this.rng, this.world, this.parkedCars);
    this.police = new Police(this.scene, this.rng);
    this.combat = new Combat(this.scene, this.rng);

    // the armoured van for mission 5 waits at its depot
    const van = new Car(this.scene, 'armoured', 0x4a4a4a, -120, -120, Math.PI / 2);
    this.parkedCars.push(van);

    this.missions = new Missions(this.scene, {
      toast: (m) => this.hud.toast(m),
      setObjective: (t) => this.hud.setObjective(t),
      addCash: (n) => {
        this.player.cash += n;
        this.audio.chime();
        this.save();
      },
      setWanted: (n) => this.police.setStars(n),
      spawnGang: (pos, n) => this.combat.spawnGang(pos, n),
      gangRemaining: () => this.combat.remaining(),
      jingle: () => this.audio.jingle(),
    });

    // Rook, on foot
    this.playerMesh = this.buildPlayerMesh();
    this.scene.add(this.playerMesh);
    this.player = {
      pos: new THREE.Vector3(this.world.spawn.x, 0, this.world.spawn.z),
      heading: 0,
      velY: 0,
      onGround: true,
      health: CFG.player.maxHealth,
      cash: CFG.player.startCash,
      inCar: false,
      car: null,
      lastDamageT: -99,
    };
    this.god = false;
    this.shotMode = false;
    this.stagedSpeedKmh = 0;
    this.stagedExtras = [];
    this.fixedCamera = null;

    // medkits around the map
    this.combat.spawnMedkit(40, 40);
    this.combat.spawnMedkit(-120, 120);
    this.combat.spawnMedkit(120, -120);

    this.camYaw = 0;
    this.camPitch = 3.4;
    this.state = 'title';
    this.menuOpen = false;
    this.muted = false;
    this.elapsed = 0;
    this.clock = new THREE.Clock();
    this.saveTimer = 0;

    this.load();

    document.getElementById('start-btn')?.addEventListener('click', () => this.startPlay());
    document.getElementById('resume-btn')?.addEventListener('click', () => this.resume());
    document.getElementById('mission-close')?.addEventListener('click', () => this.toggleMenu(false));

    if (this.shotName) {
      // staged scene: straight into play, no title screen
      this.state = 'play';
      this.hud.showScreen(null);
      this.audio.ensure();
      applyShot(this.shotName, this);
      this.syncHud();
    } else {
      this.hud.showScreen('title');
      this.missions.start(this.missions.index);
      this.syncHud();
    }

    this.renderer.setAnimationLoop(() => this.frame());
  }

  buildPlayerMesh() {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: 0x2a8a7a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), shirt);
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
    head.position.y = 1.74;
    head.castShadow = true;
    group.add(head);
    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.7, 0.32),
      new THREE.MeshLambertMaterial({ color: 0x2a2d33 }),
    );
    legs.position.y = 0.35;
    group.add(legs);
    return group;
  }

  // -- helpers used by shots.js ---------------------------------------
  giveCar(kind, colorHex, x, z, heading) {
    const car = new Car(this.scene, kind, colorHex, x, z, heading);
    this.parkedCars.push(car);
    this.player.car = car;
    this.player.inCar = true;
    this.player.pos.set(x, 0, z);
    this.playerMesh.visible = false;
    return car;
  }

  placePlayer(x, z, heading) {
    if (this.player.car) {
      this.player.car = null;
      this.player.inCar = false;
    }
    this.player.pos.set(x, 0, z);
    this.player.heading = heading;
    this.playerMesh.visible = true;
    // keep the visible mesh in sync: in shot mode updatePlayer never
    // runs, so the mesh would otherwise stay at the spawn point.
    this.playerMesh.position.set(x, 0, z);
    this.playerMesh.rotation.y = heading;
  }

  setFixedCamera(pos, look) {
    this.fixedCamera = { pos, look };
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }

  setObjective(text) {
    this.hud.setObjective(text);
  }

  syncHud() {
    this.hud.setHealth(this.player.health, CFG.player.maxHealth);
    this.hud.setCash(this.player.cash);
    this.hud.setStars(this.police.stars);
    this.hud.setAmmo(this.combat.ammo, !this.player.inCar);
  }

  startPlay() {
    this.audio.ensure();
    this.state = 'play';
    this.hud.showScreen(null);
  }

  resume() {
    this.state = 'play';
    this.hud.showScreen(null);
  }

  toggleMenu(open) {
    this.menuOpen = open;
    if (open) {
      this.hud.showMissionMenu(CFG.missions, this.missions.index);
    } else {
      this.hud.hideMissionMenu();
    }
  }

  save() {
    try {
      const data = {
        x: this.player.pos.x,
        z: this.player.pos.z,
        cash: this.player.cash,
        mission: this.missions.index,
        health: this.player.health,
      };
      localStorage.setItem(CFG.saveKey, JSON.stringify(data));
    } catch (err) { /* storage may be unavailable */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(CFG.saveKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.x === 'number') this.player.pos.set(data.x, 0, data.z);
      if (typeof data.cash === 'number') this.player.cash = data.cash;
      if (typeof data.mission === 'number') this.missions.index = data.mission;
      if (typeof data.health === 'number') this.player.health = data.health;
    } catch (err) { /* corrupted save: start fresh */ }
  }

  damagePlayer(amount) {
    if (this.god || this.state !== 'play' || amount <= 0) return;
    this.player.health -= amount;
    this.player.lastDamageT = this.elapsed;
    this.hud.damageFlash();
    this.audio.thud();
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.wasted();
    }
  }

  busted() {
    if (this.god || this.state !== 'play') return;
    this.state = 'busted';
    this.police.clear();
    this.player.cash = Math.max(0, Math.floor(this.player.cash * 0.9));
    this.hud.showScreen('busted');
    this.save();
  }

  wasted() {
    if (this.god || this.state !== 'play') return;
    this.state = 'wasted';
    this.police.clear();
    this.player.cash = Math.max(0, Math.floor(this.player.cash * 0.85));
    this.hud.showScreen('wasted');
    this.save();
  }

  respawn() {
    this.player.health = CFG.player.maxHealth;
    this.player.pos.set(this.world.spawn.x, 0, this.world.spawn.z);
    this.player.inCar = false;
    this.player.car = null;
    this.playerMesh.visible = true;
    this.combat.clearEnemies();
    this.missions.restart();
    this.state = 'play';
    this.hud.showScreen(null);
    this.syncHud();
  }

  nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.parkedCars) {
      if (car.wrecked) continue;
      const d = Math.hypot(car.x - this.player.pos.x, car.z - this.player.pos.z);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    return best;
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    const input = this.input;
    const P = this.player;

    if (this.state === 'play') {
      // global keys
      if (input.wasPressed(CFG.keys.mute)) {
        this.muted = !this.muted;
        this.audio.setMuted(this.muted);
        this.hud.setMuted(this.muted);
      }
      if (input.wasPressed(CFG.keys.pause)) {
        this.state = 'pause';
        this.hud.showScreen('pause');
        this.save();
      }
      if (input.wasPressed(CFG.keys.missionMenu)) {
        this.toggleMenu(!this.menuOpen);
      }
      if (this.menuOpen) {
        for (let i = 0; i < 5; i++) {
          if (input.wasPressed(`Digit${i + 1}`)) {
            this.missions.start(i);
            this.toggleMenu(false);
          }
        }
      }

      if (!this.shotMode) {
        this.updatePlayer(dt);
      }

      // world life
      this.world.update(dt, this.elapsed);
      this.traffic.update(dt, P.pos, P.inCar ? P.car : null);
      for (const ev of this.traffic.drainEvents()) {
        if (ev.type === 'pedHit') {
          this.police.addHeat(CFG.wanted.heat.killPed);
          this.traffic.raiseAlarm(ev.pos);
          this.hud.toast('Pedestrian down — the cops saw that');
          this.audio.thud();
        }
      }
      if (!this.shotMode) {
        this.police.update(dt, P.pos, P.inCar, P.car, {
          colliders: this.world.colliders,
          onBusted: () => this.busted(),
          onRam: () => this.audio.thud(),
          onStarsChanged: () => this.syncHud(),
        });
        this.missions.update(dt, {
          pos: P.pos,
          inCar: P.inCar,
          car: P.car,
          speed: P.inCar && P.car ? P.car.speed : 0,
          wanted: this.police.stars,
        });
        this.combat.update(dt, P.pos, {
          onShotAtPlayer: (dmg) => this.damagePlayer(dmg),
          onEnemyShot: () => this.audio.shot(),
          onMedkit: () => {
            P.health = Math.min(CFG.player.maxHealth, P.health + 40);
            this.audio.chime();
            this.hud.toast('Medkit +40 health');
          },
        });
      }

      // health regen after a quiet spell
      if (P.health > 0 && P.health < CFG.player.maxHealth && this.elapsed - P.lastDamageT > CFG.player.regenDelay) {
        P.health = Math.min(CFG.player.maxHealth, P.health + CFG.player.regenPerSec * dt);
      }

      // wrecked car: climb out
      if (P.inCar && P.car && P.car.wrecked) {
        this.hud.toast('Car wrecked!');
        this.placePlayer(P.car.x + 2.5, P.car.z + 1, P.heading);
      }

      this.updateCamera(dt);
      this.syncHud();
      if (this.shotMode) {
        this.hud.setSpeed(this.stagedSpeedKmh, P.inCar);
        // staged cars never drive, so their smoke would never puff —
        // tick it here so the chase shot's wrecked car smokes.
        if (P.inCar && P.car) P.car.updateSmoke(dt);
      } else if (P.inCar && P.car) {
        this.hud.setSpeed(Math.abs(P.car.speed) * 3.6, true);
        this.audio.setEngine(Math.abs(P.car.speed) / CFG.car.maxSpeed, true);
      } else {
        this.hud.setSpeed(0, false);
        this.audio.setEngine(0, false);
      }
      this.audio.setSiren(this.police.stars >= 1);
      this.hud.setCrosshair(!P.inCar && this.combat.ammo > 0 && !this.menuOpen);
      this.hud.drawMinimap(
        this.world,
        { x: P.pos.x, z: P.pos.z, heading: P.inCar && P.car ? P.car.heading : P.heading },
        this.traffic.dots(),
        this.police.dots(),
        this.missions.target,
      );

      this.saveTimer += dt;
      if (this.saveTimer > 15) {
        this.saveTimer = 0;
        this.save();
      }
    } else if (this.state === 'busted' || this.state === 'wasted') {
      if (input.wasPressed('Enter') || input.consumeClick()) {
        this.respawn();
      }
      this.world.update(dt, this.elapsed);
    } else if (this.state === 'pause') {
      if (input.wasPressed(CFG.keys.pause)) this.resume();
    }

    // title screen: slow orbit around downtown so the backdrop lives
    if (this.state === 'title') {
      const t = this.elapsed * 0.08;
      this.camera.position.set(Math.sin(t) * 60, 26, Math.cos(t) * 60);
      this.camera.lookAt(0, 6, 0);
      this.world.update(dt, this.elapsed);
      this.traffic.update(dt, P.pos, null);
    }

    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }

  updatePlayer(dt) {
    const input = this.input;
    const P = this.player;
    const axis = input.moveAxis();
    const drag = input.consumeDrag();
    this.camYaw -= drag.dx * 0.005;
    this.camPitch = Math.max(1.6, Math.min(7, this.camPitch + drag.dy * 0.02));

    if (input.wasPressed(CFG.keys.enterCar)) {
      if (P.inCar) {
        const car = P.car;
        this.placePlayer(car.x + 2.5, car.z + 1.5, car.heading);
      } else {
        const car = this.nearestCar(CFG.car.enterRange);
        if (car) {
          if (!car.driven) {
            car.driven = true;
            if (this.police.nearestUnitDist(P.pos) < 45) {
              this.police.addHeat(CFG.wanted.heat.stealCarSeen);
              this.hud.toast('Stolen in plain sight — wanted!');
            }
          }
          P.car = car;
          P.inCar = true;
          P.pos.set(car.x, 0, car.z);
          this.playerMesh.visible = false;
          this.audio.ensure();
        }
      }
    }

    if (P.inCar && P.car) {
      const car = P.car;
      const throttle = axis.fwd;
      const steer = -axis.strafe;
      const handbrake = input.down(CFG.keys.jump);
      car.drive(dt, { throttle, steer, handbrake }, this.world.colliders);
      P.pos.set(car.x, 0, car.z);
      P.heading = car.heading;
      // camera eases behind the car when the player is not dragging
      if (Math.abs(drag.dx) < 1) {
        let diff = car.heading - this.camYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.camYaw += diff * Math.min(1, 1.6 * dt);
      }
    } else {
      // on foot
      const sprint = input.down(CFG.keys.sprint);
      const speed = sprint ? CFG.player.sprintSpeed : CFG.player.walkSpeed;
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const mx = (sin * axis.fwd + cos * axis.strafe) * speed * dt;
      const mz = (cos * axis.fwd - sin * axis.strafe) * speed * dt;
      const nx = P.pos.x + mx;
      const nz = P.pos.z + mz;
      const hit = resolveCircle(nx, nz, 0.6, this.world.colliders);
      if (hit) {
        P.pos.x = nx + hit.nx * hit.depth;
        P.pos.z = nz + hit.nz * hit.depth;
      } else {
        P.pos.x = nx;
        P.pos.z = nz;
      }
      P.pos.x = Math.max(-205, Math.min(205, P.pos.x));
      P.pos.z = Math.max(-205, Math.min(232, P.pos.z));
      if (mx !== 0 || mz !== 0) {
        P.heading = Math.atan2(mx, mz);
      }
      // jump + gravity
      if (input.wasPressed(CFG.keys.jump) && P.onGround) {
        P.velY = CFG.player.jumpSpeed;
        P.onGround = false;
      }
      if (!P.onGround) {
        P.velY -= CFG.player.gravity * dt;
        P.pos.y += P.velY * dt;
        if (P.pos.y <= 0) {
          P.pos.y = 0;
          P.velY = 0;
          P.onGround = true;
        }
      }
      this.playerMesh.position.copy(P.pos);
      this.playerMesh.rotation.y = P.heading;

      // fists
      if (input.wasPressed(CFG.keys.punch)) {
        if (this.combat.punch(P.pos, P.heading)) {
          this.audio.thud();
          this.traffic.raiseAlarm(P.pos);
        }
      }
      // pistol
      if (input.consumeClick() && this.combat.ammo > 0) {
        this.audio.ensure();
        const res = this.combat.tryShoot(this.camera, P.pos);
        if (res) {
          this.audio.shot();
          this.traffic.raiseAlarm(P.pos);
          if (this.police.nearestUnitDist(P.pos) < 55) {
            this.police.addHeat(CFG.wanted.heat.shootNearCop);
          }
          if (res.hit) this.hud.toast('Hit!');
        }
      }
    }
  }

  updateCamera(dt) {
    if (this.fixedCamera) {
      this.camera.position.copy(this.fixedCamera.pos);
      this.camera.lookAt(this.fixedCamera.look);
      return;
    }
    const P = this.player;
    const dist = P.inCar ? 10.5 : 7.5;
    const height = this.camPitch + (P.inCar ? 1.2 : 0);
    const cx = P.pos.x - Math.sin(this.camYaw) * dist;
    const cz = P.pos.z - Math.cos(this.camYaw) * dist;
    const target = new THREE.Vector3(cx, height, cz);
    this.camera.position.lerp(target, Math.min(1, 8 * dt));
    this.camera.lookAt(P.pos.x, P.pos.y + 1.7, P.pos.z);
  }
}

new Game();
