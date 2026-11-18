// The 5-mission story chain for Solmar Bay.
// Each mission is a small state machine: go somewhere, do something,
// get paid. A glowing beacon marks the target in the world and on
// the minimap; the banner up top always says what to do next.

import * as THREE from 'three';
import { CFG } from './config.js';

const TARGETS = {
  firstWheelsDrop: { x: 80, z: 80 },
  packagePickup: { x: -80, z: 80 },
  packageDrop: { x: 120, z: -80 },
  rooftopMeet: { x: 0, z: 168 },
  vanSpot: { x: -120, z: -120 },
  bigScoreDrop: { x: 160, z: 160 },
};

export class Missions {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks; // { toast, setObjective, addCash, setWanted, spawnGang, jingle }
    this.index = 0; // 0-based into CFG.missions
    this.stage = 0;
    this.active = false;
    this.target = null;
    this.beacon = null;
    this.beaconRing = null;
    this.done = false;
    this.waitTimer = 0;
  }

  get current() {
    return CFG.missions[this.index] || null;
  }

  get currentName() {
    return this.current ? this.current.name : 'All missions complete';
  }

  makeBeacon(x, z) {
    this.clearBeacon();
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23e,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.set(x, 15, z);
    this.scene.add(this.beacon);
    const ringGeo = new THREE.RingGeometry(1.8, 2.6, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd23e,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    this.beaconRing = new THREE.Mesh(ringGeo, ringMat);
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beaconRing.position.set(x, 0.06, z);
    this.scene.add(this.beaconRing);
    this.target = { x, z };
  }

  clearBeacon() {
    if (this.beacon) {
      this.scene.remove(this.beacon);
      this.beacon = null;
    }
    if (this.beaconRing) {
      this.scene.remove(this.beaconRing);
      this.beaconRing = null;
    }
    this.target = null;
  }

  setObjectiveText(text) {
    if (this.hooks.setObjective) this.hooks.setObjective(text);
  }

  start(i) {
    this.index = i;
    this.stage = 0;
    this.active = true;
    this.done = false;
    this.waitTimer = 0;
    const m = this.current;
    if (!m) {
      this.active = false;
      this.setObjectiveText('All missions complete — Solmar Bay is yours.');
      return;
    }
    this.hooks.toast(`Mission: ${m.name}`);
    if (m.id === 1) {
      this.makeBeacon(TARGETS.firstWheelsDrop.x, TARGETS.firstWheelsDrop.z);
      this.setObjectiveText('Steal a car, then drive to the marker');
    } else if (m.id === 2) {
      this.makeBeacon(TARGETS.packagePickup.x, TARGETS.packagePickup.z);
      this.setObjectiveText('Pick up the package at the marker');
    } else if (m.id === 3) {
      this.hooks.setWanted(2);
      this.clearBeacon();
      this.setObjectiveText('Lose the cops — get your wanted level to zero');
    } else if (m.id === 4) {
      this.makeBeacon(TARGETS.rooftopMeet.x, TARGETS.rooftopMeet.z);
      this.setObjectiveText('Meet the contact at the promenade');
    } else if (m.id === 5) {
      this.makeBeacon(TARGETS.vanSpot.x, TARGETS.vanSpot.z);
      this.setObjectiveText('Steal the armoured van');
    }
  }

  restart() {
    this.start(this.index);
  }

  fail(reason) {
    this.hooks.toast(`Mission failed: ${reason}`);
    this.setObjectiveText('Mission failed — press M to retry');
    this.active = false;
    this.clearBeacon();
  }

  complete() {
    const m = this.current;
    if (!m) return;
    this.hooks.addCash(m.reward);
    this.hooks.toast(`Mission complete: ${m.name}  +$${m.reward}`);
    if (this.hooks.jingle) this.hooks.jingle();
    this.clearBeacon();
    this.index += 1;
    this.stage = 0;
    if (this.index >= CFG.missions.length) {
      this.done = true;
      this.active = false;
      this.setObjectiveText('All missions complete — Solmar Bay is yours.');
      this.hooks.toast('Story complete! Free roam — cause trouble.');
      return;
    }
    this.start(this.index);
  }

  // player: { pos, inCar, car, speed, wanted }
  update(dt, player) {
    if (this.beacon) {
      this.beacon.rotation.y += dt * 0.8;
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.08;
      this.beaconRing.scale.setScalar(s);
    }
    if (!this.active || this.done) return;
    const m = this.current;
    if (!m) return;
    const near = (tx, tz, r) => {
      const dx = player.pos.x - tx;
      const dz = player.pos.z - tz;
      return dx * dx + dz * dz < r * r;
    };

    if (m.id === 1) {
      if (this.stage === 0 && player.inCar) {
        this.stage = 1;
        this.setObjectiveText('Now drive to the marker');
      } else if (this.stage === 1 && player.inCar && near(TARGETS.firstWheelsDrop.x, TARGETS.firstWheelsDrop.z, 6)) {
        this.complete();
      } else if (this.stage === 0 && !player.inCar) {
        // keep waiting — the marker stays put
      }
    } else if (m.id === 2) {
      if (this.stage === 0 && near(TARGETS.packagePickup.x, TARGETS.packagePickup.z, 5)) {
        this.stage = 1;
        this.hooks.setWanted(1);
        this.makeBeacon(TARGETS.packageDrop.x, TARGETS.packageDrop.z);
        this.setObjectiveText('Deliver the package — the cops are watching');
        this.hooks.toast('Package collected. Deliver it!');
      } else if (this.stage === 1 && near(TARGETS.packageDrop.x, TARGETS.packageDrop.z, 6)) {
        this.complete();
      }
    } else if (m.id === 3) {
      if (player.wanted === 0) {
        this.complete();
      }
    } else if (m.id === 4) {
      if (this.stage === 0 && near(TARGETS.rooftopMeet.x, TARGETS.rooftopMeet.z, 5)) {
        this.stage = 1;
        this.clearBeacon();
        this.setObjectiveText('Ambush! Survive the shootout');
        this.hooks.toast('Rival gang — fight back!');
        if (this.hooks.spawnGang) {
          this.hooks.spawnGang({ x: 8, z: 172 }, 4);
        }
      } else if (this.stage === 1) {
        if (this.hooks.gangRemaining && this.hooks.gangRemaining() === 0) {
          this.complete();
        }
      }
    } else if (m.id === 5) {
      if (this.stage === 0 && player.inCar && player.car && player.car.kind === 'armoured') {
        this.stage = 1;
        this.hooks.setWanted(3);
        this.makeBeacon(TARGETS.bigScoreDrop.x, TARGETS.bigScoreDrop.z);
        this.setObjectiveText('Escape to the drop-off with the van');
      } else if (this.stage === 1 && near(TARGETS.bigScoreDrop.x, TARGETS.bigScoreDrop.z, 7)) {
        this.complete();
      }
    }
  }
}
