// Five-mission story chain for Rook. Each mission is a small state machine:
// stages advance on position / car / wanted / combat conditions, with a
// 3D beacon, a minimap blip and an objective banner guiding the player.
import * as THREE from "three";
import { CFG } from "./config.js";

function makeBeacon(scene) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc020, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
  );
  beam.position.y = 20;
  g.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc020 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  g.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 4),
    new THREE.MeshBasicMaterial({ color: 0xffc020 }));
  arrow.position.y = 5.5;
  arrow.rotation.x = Math.PI;
  g.add(arrow);
  g.visible = false;
  scene.add(g);
  return { group: g, ring, arrow };
}

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.beacon = makeBeacon(scene);
    this.index = 0;            // current mission
    this.stage = 0;
    this.active = false;
    this.done = false;         // whole chain finished
    this.target = { x: 0, z: 0 };
    this.vanCar = null;        // armoured van for mission 5
    this.enemiesToKill = 0;
    this.message = "";
  }

  get current() { return CFG.missions[this.index]; }

  start(i) {
    this.index = i;
    this.stage = 0;
    this.active = true;
    this.done = false;
    this.enemiesToKill = 0;
    return this._setupStage();
  }

  _setTarget(x, z, text) {
    this.target = { x, z };
    this.beacon.group.position.set(x, 0, z);
    this.beacon.group.visible = true;
    this.message = text;
  }

  _setupStage() {
    const i = this.index, s = this.stage;
    if (i === 0) {
      if (s === 0) { this.beacon.group.visible = false; this.message = "Steal a car — press E near any parked car."; }
      else this._setTarget(64, 160, "Drive to the marker on Ocean Drive.");
    } else if (i === 1) {
      if (s === 0) this._setTarget(-64, 96, "Pick up the package at the north lot.");
      else this._setTarget(96, -64, "Deliver the package — the cops are watching.");
    } else if (i === 2) {
      this.beacon.group.visible = false;
      this.message = "Lose the cops — stay out of sight until the stars fade.";
    } else if (i === 3) {
      if (s === 0) this._setTarget(0, 0, "Meet the contact at the plaza fountain.");
      else { this.beacon.group.visible = false; this.message = "Ambush! Survive the shootout."; }
    } else if (i === 4) {
      if (s === 0) this._setTarget(-96, -32, "Steal the armoured van at the depot.");
      else { this.beacon.group.visible = false; this.message = "Escape the 3-star wanted level!"; }
    }
    return this.message;
  }

  fail(reason) {
    this.active = false;
    this.beacon.group.visible = false;
    return reason || "Mission failed.";
  }

  complete(ctx) {
    const reward = this.current.reward;
    ctx.cash += reward;
    this.active = false;
    this.beacon.group.visible = false;
    this.index += 1;
    this.stage = 0;
    if (this.index >= CFG.missions.length) this.done = true;
    return { reward, done: this.done, next: this.done ? null : CFG.missions[this.index].name };
  }

  // ctx: { playerPos, inCar, playerCar, police, combat, time, onEvent(text) }
  update(dt, ctx) {
    if (!this.active) return;
    const p = ctx.playerPos;
    const dTarget = Math.hypot(p.x - this.target.x, p.z - this.target.z);
    const i = this.index, s = this.stage;

    if (i === 0) {
      if (s === 0 && ctx.inCar) { this.stage = 1; ctx.onEvent(this._setupStage()); }
      else if (s === 1 && dTarget < 6) ctx.onMissionComplete();
    } else if (i === 1) {
      if (s === 0 && dTarget < 5) {
        this.stage = 1;
        ctx.police.setStars(1);
        ctx.onEvent(this._setupStage());
      } else if (s === 1 && dTarget < 5) ctx.onMissionComplete();
    } else if (i === 2) {
      if (ctx.police.level <= 0 && ctx.police.stars <= 0.01) ctx.onMissionComplete();
    } else if (i === 3) {
      if (s === 0 && dTarget < 5) {
        this.stage = 1;
        ctx.onEvent(this._setupStage());
        for (const [ex, ez] of [[-8, 10], [10, -6], [-12, -8], [8, 12]]) {
          ctx.combat.spawnEnemy(p.x + ex, p.z + ez);
        }
        this.enemiesToKill = 4;
      } else if (s === 1) {
        const alive = ctx.combat.enemies.filter((e) => e.alive).length;
        if (alive === 0) ctx.onMissionComplete();
      }
    } else if (i === 4) {
      if (s === 0 && ctx.inCar && ctx.playerCar && ctx.playerCar.kind === "armored") {
        this.stage = 1;
        ctx.police.setStars(3);
        ctx.onEvent(this._setupStage());
      } else if (s === 1 && ctx.police.level <= 0) ctx.onMissionComplete();
    }

    // beacon pulse
    if (this.beacon.group.visible) {
      const t = ctx.time;
      this.beacon.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
      this.beacon.arrow.position.y = 5.5 + Math.sin(t * 2.5) * 0.5;
    }
  }
}
