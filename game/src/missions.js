// 5-mission story chain for Rook. Each mission has a beacon (3D column +
// minimap blip + waypoint arrow), an objective banner, start/fail/complete
// and a cash reward. Progress is saved by main.js.

import * as THREE from "three";
import { MISSIONS, COLORS } from "./config.js";

// Mission anchor points, spread across the city so every district is used.
const ANCHORS = {
  garage: { x: 28, z: -28 },
  packagePickup: { x: -84, z: 84 },
  packageDrop: { x: 140, z: -84 },
  tailStart: { x: 0, z: 0 },
  rooftop: { x: 112, z: 112 },
  vanYard: { x: -140, z: -28 },
  escape: { x: 168, z: 168 },
};

export class Missions {
  constructor(scene, rng, hooks) {
    this.scene = scene;
    this.rng = rng;
    this.hooks = hooks; // {onToast, onBanner, setWanted, spawnEnemies, ...}
    this.current = 1; // 1..5, 6 = story done
    this.stage = "idle"; // idle | active | done
    this.objective = "";
    this.target = null; // {x, z}
    this.subStep = 0;
    this.beacon = null;
    this.beaconLight = null;
    this._buildBeacon();
  }

  _buildBeacon() {
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.beacon,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const ringGeo = new THREE.TorusGeometry(2.2, 0.18, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.markerGreen });
    this.beaconRing = new THREE.Mesh(ringGeo, ringMat);
    this.beaconRing.rotation.x = Math.PI / 2;
    this.beaconRing.visible = false;
    this.scene.add(this.beaconRing);
  }

  setTarget(x, z) {
    this.target = { x, z };
    this.beacon.position.set(x, 30, z);
    this.beacon.visible = true;
    this.beaconRing.position.set(x, 0.4, z);
    this.beaconRing.visible = true;
  }

  clearTarget() {
    this.target = null;
    this.beacon.visible = false;
    this.beaconRing.visible = false;
  }

  get def() {
    return MISSIONS[this.current - 1] || null;
  }

  start() {
    const def = this.def;
    if (!def) return;
    this.stage = "active";
    this.subStep = 0;
    this.hooks.onBanner(`${def.name} — ${def.brief}`);
    this.hooks.onToast(`Mission started: ${def.name}`);
    if (this.current === 1) {
      this.objective = "Steal any car (E near a car) and drive to the marker.";
      this.setTarget(ANCHORS.garage.x, ANCHORS.garage.z);
    } else if (this.current === 2) {
      this.objective = "Go to the pickup point and grab the package.";
      this.setTarget(ANCHORS.packagePickup.x, ANCHORS.packagePickup.z);
    } else if (this.current === 3) {
      this.objective = "You are hot — 2 stars. Lose the cops: break line of sight.";
      this.setTarget(ANCHORS.tailStart.x, ANCHORS.tailStart.z);
      this.hooks.setWanted(2);
    } else if (this.current === 4) {
      this.objective = "Meet the contact at the rooftop marker.";
      this.setTarget(ANCHORS.rooftop.x, ANCHORS.rooftop.z);
    } else if (this.current === 5) {
      this.objective = "Steal the armoured van in the yard.";
      this.setTarget(ANCHORS.vanYard.x, ANCHORS.vanYard.z);
    }
  }

  complete() {
    const def = this.def;
    if (!def) return 0;
    this.stage = "done";
    this.clearTarget();
    this.hooks.onBanner(`Mission complete: ${def.name}  +$${def.reward}`);
    this.hooks.onToast(`+$${def.reward} — ${def.name} complete`);
    this.hooks.onCash(def.reward);
    this.current = Math.min(6, this.current + 1);
    this.stage = "idle";
    this.objective = this.current <= 5 ? "Press M to start the next mission." : "Story complete — free roam Solmar Bay.";
    if (this.current <= 5) {
      // Auto-start the next mission after a beat.
      setTimeout(() => this.start(), 1200);
    }
    return def.reward;
  }

  fail(reason) {
    this.stage = "idle";
    this.clearTarget();
    this.hooks.onBanner(`Mission failed — ${reason}`);
    this.hooks.onToast("Mission failed. Press M to retry.");
    this.objective = "Press M to retry the mission.";
  }

  // Called every frame; returns nothing, fires hooks on transitions.
  update(dt, state) {
    if (this.stage !== "active" || !this.target) return;
    const d = Math.hypot(state.playerPos.x - this.target.x, state.playerPos.z - this.target.z);
    // Beacon pulse.
    this.beacon.material.opacity = 0.22 + Math.sin(performance.now() * 0.004) * 0.08;
    this.beaconRing.scale.setScalar(1 + Math.sin(performance.now() * 0.003) * 0.12);

    if (this.current === 1) {
      if (state.inCar && d < 8) this.complete();
    } else if (this.current === 2) {
      if (this.subStep === 0 && d < 6) {
        this.subStep = 1;
        this.objective = "Package collected. Deliver it — cops are watching.";
        this.setTarget(ANCHORS.packageDrop.x, ANCHORS.packageDrop.z);
        this.hooks.setWanted(1);
        this.hooks.onBanner("Package collected — deliver it now.");
      } else if (this.subStep === 1 && d < 6) {
        this.complete();
      }
    } else if (this.current === 3) {
      if (state.wanted === 0) this.complete();
    } else if (this.current === 4) {
      if (this.subStep === 0 && d < 6) {
        this.subStep = 1;
        this.objective = "Ambush! Rival crew — take them all down.";
        this.hooks.spawnEnemies(4, { x: this.target.x, z: this.target.z });
        this.hooks.onBanner("Ambush! Survive the shootout.");
        this.clearTarget();
      } else if (this.subStep === 1 && state.enemiesLeft === 0) {
        this.complete();
      }
    } else if (this.current === 5) {
      if (this.subStep === 0 && state.inVan && d < 10) {
        this.subStep = 1;
        this.objective = "Van stolen! Lose the 3-star heat.";
        this.hooks.setWanted(3);
        this.setTarget(ANCHORS.escape.x, ANCHORS.escape.z);
        this.hooks.onBanner("Van stolen — escape to the beach marker.");
      } else if (this.subStep === 1 && state.wanted === 0 && d < 10) {
        this.complete();
      }
    }
  }
}
