// Solmar Bay — game loop, player, screens, save/load. Wires every module
// together: world, cars, traffic, police, missions, combat, HUD, audio.
import * as THREE from "three";
import { CFG } from "./config.js";
import { RNG } from "./random.js";
import { Input } from "./input.js";
import { createStage } from "./render.js";
import { buildWorld, collideCircle } from "./world.js";
import { Car, spawnParkedCars } from "./vehicles.js";
import { Traffic } from "./traffic.js";
import { Police } from "./police.js";
import { Missions } from "./missions.js";
import { Combat } from "./combat.js";
import { HUD } from "./hud.js";
import { AudioEngine } from "./audio.js";
import { stageShot, SHOT_NAMES } from "./shots.js";

function playerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2a6a4a, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.4), jacket);
  body.position.y = 1.3; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), skin);
  head.position.y = 2.04; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 }));
  cap.position.y = 2.22; g.add(cap);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.8, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 1 }));
  legs.position.y = 0.4; g.add(legs);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

class Game {
  constructor() {
    const canvas = document.getElementById("game");
    const stage = createStage(canvas);
    this.renderer = stage.renderer;
    this.scene = stage.scene;
    this.camera = stage.camera;
    this.input = new Input(canvas);
    this.hud = new HUD();
    this.audio = new AudioEngine();
    this.world = buildWorld(this.scene);
    this.parked = spawnParkedCars(this.scene, this.world);
    this.van = new Car(this.scene, "armored", -96, -32, Math.PI / 2);
    this.parked.push(this.van);
    this.traffic = new Traffic(this.scene, this.world);
    this.police = new Police(this.scene, this.world);
    this.missions = new Missions(this.scene);
    this.combat = new Combat(this.scene);
    this.combat.armed = true;

    this.state = "title";
    this.time = 0;
    this.cash = CFG.player.startCash;
    this.godMode = false;
    this.staging = false;    // staged ?shot= scene: freeze police + pin speed
    this.cruiseSpeed = null;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 9;
    this.camFixed = false;
    this.lastShotAt = -99;
    this.saveTimer = 0;
    this.missionCtx = null;

    // player
    this.player = {
      mesh: playerMesh(),
      pos: new THREE.Vector3(this.world.spawn.x, 0, this.world.spawn.z),
      vy: 0, heading: this.world.spawn.heading,
      onGround: true, inCar: false, car: null, walkPhase: 0,
    };
    this.player.mesh.position.copy(this.player.pos);
    this.scene.add(this.player.mesh);

    this._loadSave();
    this._bindButtons();
    this._applySaveToScene();
    this.hud.showScreen("title");
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.combat.health);
    this.hud.setWanted(0);

    // Staged screenshot? ?shot=cover&seed=1
    const params = new URLSearchParams(window.location.search);
    const shot = params.get("shot");
    if (shot && SHOT_NAMES.includes(shot)) {
      this.camFixed = false;
      stageShot(shot, this);
      this.hud.setCash(this.cash);
    }

    // Local frame timer (performance.now, no deprecated THREE.Clock).
    this._lastFrameAt = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- save / load ----------
  _save() {
    try {
      localStorage.setItem(CFG.saveKey, JSON.stringify({
        x: this.player.pos.x, z: this.player.pos.z,
        cash: this.cash, mission: this.missions.index,
        health: this.combat.health,
      }));
    } catch (e) { /* storage unavailable — play on without saving */ }
  }
  _loadSave() {
    try {
      const raw = localStorage.getItem(CFG.saveKey);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.x === "number") this.player.pos.set(s.x, 0, s.z);
      if (typeof s.cash === "number") this.cash = s.cash;
      if (typeof s.mission === "number") this.missions.index = Math.min(s.mission, CFG.missions.length - 1);
      if (typeof s.health === "number") this.combat.health = s.health;
    } catch (e) { /* corrupt save — start fresh */ }
  }
  _applySaveToScene() {
    this.player.mesh.position.copy(this.player.pos);
  }

  // ---------- UI buttons ----------
  _bindButtons() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
    on("btn-start", () => { this.audio.ensure(); this._startGame(true); });
    on("btn-continue", () => { this.audio.ensure(); this._startGame(false); });
    on("btn-resume", () => this._setState("play"));
    on("btn-restart", () => { this._restartMission(); this._setState("play"); });
    on("btn-busted-ok", () => this._respawn("police"));
    on("btn-wasted-ok", () => this._respawn("hospital"));
    on("btn-mission-close", () => this._setState("play"));
    on("btn-mute", () => {
      const muted = this.audio.toggleMute();
      document.getElementById("btn-mute").textContent = muted ? "🔇 Muted" : "🔊 Sound";
    });
    const list = document.getElementById("mission-list");
    if (list) {
      list.innerHTML = CFG.missions.map((m, i) =>
        `<button class="mission-item" data-i="${i}">${i + 1}. ${m.name} — $${m.reward}<br><span>${m.blurb}</span></button>`).join("");
      list.querySelectorAll(".mission-item").forEach((b) => b.addEventListener("click", () => {
        this._startMission(parseInt(b.dataset.i, 10));
        this._setState("play");
      }));
    }
  }

  _startGame(fresh) {
    if (fresh) {
      this.cash = CFG.player.startCash;
      this.combat.health = CFG.player.health;
      this.player.pos.set(this.world.spawn.x, 0, this.world.spawn.z);
      this.player.heading = this.world.spawn.heading;
      this.missions.index = 0;
      this.police.setStars(0);
    }
    this._startMission(this.missions.index);
    this._setState("play");
    this.hud.banner("SOLMAR BAY", "Rook is back in town.");
    this.audio.ensure();
  }

  _startMission(i) {
    const msg = this.missions.start(i);
    if (i === 2) this.police.setStars(2);
    this.hud.setObjective(msg);
    this.hud.banner(CFG.missions[i].name.toUpperCase(), msg);
  }

  _restartMission() {
    this.police.setStars(0);
    this.combat.clearEnemies();
    this._startMission(this.missions.index);
  }

  _setState(s) {
    this.state = s;
    if (s === "play") this.hud.showScreen("play");
    else if (s === "title") this.hud.showScreen("title");
    else if (s === "pause") this.hud.showScreen("pause");
    else if (s === "busted") this.hud.showScreen("busted");
    else if (s === "wasted") this.hud.showScreen("wasted");
    else if (s === "missions") this.hud.showScreen("missions");
  }

  _respawn(where) {
    const spot = where === "hospital" ? this.world.hospital : this.world.policeStation;
    this.exitCar(true);
    this.player.pos.set(spot.x, 0, spot.z);
    this.player.heading = 0;
    this.combat.health = CFG.player.health;
    this.police.setStars(0);
    this.combat.clearEnemies();
    this._setState("play");
    this.hud.banner(where === "hospital" ? "PATCHED UP" : "RELEASED", "Back on the streets of Solmar Bay.");
  }

  // ---------- car enter / exit ----------
  enterCar(car) {
    this.player.inCar = true;
    this.player.car = car;
    car.taken = true;
    this.player.mesh.visible = false;
    // stealing in sight of the law draws heat
    const seen = this.police.level > 0 ||
      this.police.cops.some((c) => Math.hypot(c.x - car.pos.x, c.z - car.pos.z) < CFG.wanted.sightRange);
    if (seen) {
      this.police.addHeat(CFG.wanted.stealHeat);
      this.hud.toast("Car stolen — the cops saw that!");
    } else {
      this.hud.toast("Car stolen. Drive away quietly…");
    }
    this.audio.chime();
  }

  exitCar(silent = false) {
    if (!this.player.inCar || !this.player.car) return;
    const car = this.player.car;
    car.speed = 0;
    this.player.inCar = false;
    this.player.car = null;
    const side = { x: car.pos.x + Math.cos(car.heading) * 2.2, z: car.pos.z - Math.sin(car.heading) * 2.2 };
    this.player.pos.set(side.x, 0, side.z);
    this.player.heading = car.heading;
    this.player.mesh.visible = true;
    this.player.mesh.position.copy(this.player.pos);
    if (!silent) this.hud.toast("On foot.");
  }

  nearestParked(maxDist) {
    let best = null, bestD = maxDist;
    for (const c of this.parked) {
      const d = Math.hypot(c.pos.x - this.player.pos.x, c.pos.z - this.player.pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // ---------- per-frame ----------
  frame() {
    const now = performance.now();
    const dt = Math.min((now - this._lastFrameAt) / 1000, 0.05);
    this._lastFrameAt = now;
    if (this.state === "play") {
      this.time += dt;
      this.update(dt);
    } else if (this.state === "title") {
      // slow orbit over the city behind the title screen
      this.time += dt;
      const a = this.time * 0.05;
      this.camera.position.set(Math.sin(a) * 120, 55, Math.cos(a) * 120);
      this.camera.lookAt(0, 8, 40);
      this.world.update(dt, this.time);
    }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  update(dt) {
    const P = this.player;
    const inp = this.input;
    const K = CFG.keys;

    // camera orbit from mouse drag (unless a staged shot pins it)
    if (!this.camFixed) {
      this.camYaw -= inp.mouseDX * 0.004;
      this.camPitch = Math.max(0.08, Math.min(1.1, this.camPitch + inp.mouseDY * 0.003));
      this.camDist = P.inCar ? 11 : 8.5;
    }

    // global keys
    if (inp.wasPressed(K.pause)) { this._setState("pause"); return; }
    if (inp.wasPressed(K.missions)) { this._setState("missions"); return; }
    if (inp.wasPressed(K.mute)) this.audio.toggleMute();
    if (inp.wasPressed(K.restart)) this._restartMission();

    // --- driving ---
    if (P.inCar && P.car) {
      const car = P.car;
      const throttle = (inp.held(K.up) ? 1 : 0) + (inp.held(K.down) ? -1 : 0);
      const steer = (inp.held(K.left) ? 1 : 0) + (inp.held(K.right) ? -1 : 0);
      if (this.staging) {
        // Staged shot: hold position AND the speedometer reading — the
        // scene is a frozen frame, not a moving car that drifts out of it.
        car.speed = this.cruiseSpeed !== null ? this.cruiseSpeed : car.speed;
        car.sync();
      } else {
        car.drive(dt, {
          throttle, steer,
          brake: false,
          handbrake: inp.held(K.handbrake),
        }, this.world.colliders);
      }
      P.pos.set(car.pos.x, 0, car.pos.z);
      P.heading = car.heading;
      this.audio.setEngine(Math.abs(car.speed) / car.mesh.spec.topSpeed);
      // running over a pedestrian is a crime
      if (Math.abs(car.speed) > 3) {
        const hit = this.traffic.hitPedAt(car.pos.x, car.pos.z, 1.8);
        if (hit) {
          this.police.addHeat(CFG.wanted.killHeat);
          this.hud.toast("You hit a pedestrian!");
          this.audio.fail();
        }
      }
      if (car.health <= 0) {
        this.hud.banner("WASTED", "Your ride gave up.");
        this._onWasted();
        return;
      }
      if (inp.wasPressed(K.enter)) this.exitCar();
    } else {
      // --- on foot ---
      const sprint = inp.held(K.sprint);
      const speed = sprint ? CFG.player.sprintSpeed : CFG.player.walkSpeed;
      let mx = 0, mz = 0;
      if (inp.held(K.up)) mz += 1;
      if (inp.held(K.down)) mz -= 1;
      if (inp.held(K.left)) mx -= 1;
      if (inp.held(K.right)) mx += 1;
      const moving = mx !== 0 || mz !== 0;
      if (moving) {
        const len = Math.hypot(mx, mz);
        mx /= len; mz /= len;
        // movement relative to camera yaw
        const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
        const wx = mx * cy - mz * sy;
        const wz = mx * sy + mz * cy;
        P.pos.x += wx * speed * dt;
        P.pos.z += wz * speed * dt;
        P.heading = Math.atan2(wx, wz);
        P.walkPhase += dt * speed * 1.6;
        P.mesh.position.y = Math.abs(Math.sin(P.walkPhase)) * 0.06;
        collideCircle(P.pos, CFG.player.radius, this.world.colliders);
        P.pos.x = Math.max(-175, Math.min(175, P.pos.x));
        P.pos.z = Math.max(-175, Math.min(238, P.pos.z));
      }
      // jump + gravity
      if (inp.wasPressed(K.jump) && P.onGround) { P.vy = CFG.player.jumpSpeed; P.onGround = false; }
      if (!P.onGround) {
        P.vy -= CFG.player.gravity * dt;
        P.pos.y += P.vy * dt;
        if (P.pos.y <= 0) { P.pos.y = 0; P.vy = 0; P.onGround = true; }
      }
      P.mesh.position.set(P.pos.x, P.pos.y, P.pos.z);
      P.mesh.rotation.y = P.heading;
      this.audio.setEngine(0);

      // enter a car
      if (inp.wasPressed(K.enter)) {
        const car = this.nearestParked(CFG.car.enterRange);
        if (car) this.enterCar(car);
      }
      // punch
      if (inp.wasPressed(K.punch)) {
        this.audio.punch();
        const targets = [...this.combat.enemies, ...this.traffic.peds];
        const hit = this.combat.punch(P.pos, P.heading, targets);
        if (hit && hit.down !== undefined && hit.health === undefined) {
          this.police.addHeat(CFG.wanted.assaultHeat);
          this.hud.toast("Assault! The cops noticed.");
        }
      }
      // shoot pistol
      if (inp.clicked && this.combat.armed) {
        this.audio.ensure();
        const origin = new THREE.Vector3(P.pos.x, P.pos.y + 1.5, P.pos.z);
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        const hit = this.combat.shoot(origin, dir);
        this.audio.gunshot();
        this.lastShotAt = this.time;
        if (hit) this.hud.toast("Hit!");
      }
      if (inp.wasPressed("KeyR")) this.combat.reload();
    }

    // --- systems ---
    const danger = this.time - this.lastShotAt < 2;
    if (!this.staging) this.traffic.update(dt, P.pos, danger, this.parked);
    this.police.update(dt, {
      playerPos: P.pos, inCar: P.inCar, playerCar: P.car,
      staging: this.staging,
      onBusted: () => this._onBusted(),
      onWasted: () => this._onWasted(),
    });
    this.combat.update(dt, {
      playerPos: P.pos, time: this.time, godMode: this.godMode,
      onPickup: (kind) => { this.hud.toast(kind === "medkit" ? "+50 health" : "+24 pistol ammo"); this.audio.chime(); },
      onPlayerShot: () => this.audio.gunshot(),
    });
    if (this.combat.health <= 0 && !this.godMode) { this._onWasted(); return; }

    // missions
    this.missionCtx = {
      playerPos: P.pos, inCar: P.inCar, playerCar: P.car,
      police: this.police, combat: this.combat, time: this.time,
      onEvent: (text) => { this.hud.setObjective(text); this.hud.banner(this.missions.current.name.toUpperCase(), text); },
      onMissionComplete: () => this._onMissionComplete(),
    };
    this.missions.update(dt, this.missionCtx);

    // --- camera follows behind the player ---
    const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const tx = P.pos.x, ty = P.pos.y + 1.6, tz = P.pos.z;
    this.camera.position.set(
      tx - sy * cp * this.camDist,
      ty + sp * this.camDist,
      tz - cy * cp * this.camDist
    );
    this.camera.lookAt(tx + sy * 2, ty + 0.4, tz + cy * 2);

    // --- HUD ---
    this.hud.setHealth(this.combat.health);
    this.hud.setCash(this.cash);
    this.hud.setWanted(this.police.level);
    this.hud.setSpeed(P.inCar && P.car ? Math.abs(P.car.speed) * 3.6 : 0, P.inCar);
    this.hud.setAmmo(this.combat.mag, this.combat.reserve, this.combat.armed);
    if (this.missions.active) this.hud.setObjective(this.missions.message);
    this.hud.update(dt);
    this.hud.drawMinimap({
      player: { x: P.pos.x, z: P.pos.z, heading: P.heading },
      trafficCars: this.traffic.cars,
      cruisers: this.police.cruisers,
      cops: this.police.cops,
      mission: this.missions.beacon.group.visible
        ? { x: this.missions.target.x, z: this.missions.target.z, visible: true } : null,
      roads: this.world.roads,
      half: this.world.half,
      time: this.time,
    });

    // audio + world ambience
    this.audio.sirenOn = this.police.level >= 2;
    this.audio.update(dt);
    this.world.update(dt, this.time);

    // autosave
    this.saveTimer += dt;
    if (this.saveTimer > 5) { this.saveTimer = 0; this._save(); }
  }

  _onMissionComplete() {
    const res = this.missions.complete({ cash: 0 });
    this.cash += res.reward;
    this.audio.jingle();
    this._save();
    if (res.done) {
      this.hud.banner("ALL MISSIONS COMPLETE", `You earned $${res.reward}. Solmar Bay is yours, Rook.`);
      this.hud.setObjective("Free roam — Solmar Bay is yours.");
    } else {
      this.hud.banner("MISSION COMPLETE", `+$${res.reward} — Next: ${res.next}`);
      this._startMission(this.missions.index);
    }
  }

  _onBusted() {
    if (this.godMode || this.state !== "play") return;
    const lost = Math.floor(this.cash * CFG.wanted.bustCashLoss);
    this.cash -= lost;
    this.audio.fail();
    document.getElementById("busted-loss").textContent = `The cops took $${lost}.`;
    this._setState("busted");
    this._save();
  }

  _onWasted() {
    if (this.godMode || this.state !== "play") return;
    const lost = Math.floor(this.cash * 0.1);
    this.cash -= lost;
    this.audio.fail();
    document.getElementById("wasted-loss").textContent = `You lost $${lost} in the chaos.`;
    this._setState("wasted");
    this._save();
  }
}

window.addEventListener("DOMContentLoaded", () => { new Game(); });
