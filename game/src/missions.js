// Five-mission story chain for Solmar Bay. Each mission is a small state
// machine driven by the live game state the main loop hands in every
// frame; the beacon, the banner and the cash reward all flow through the
// hooks the main loop supplies, so this module never touches the HUD or
// the police directly.
import * as THREE from 'three';
import { MISSIONS } from './config.js';

function makeBeaconMesh() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 26, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd24a,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  beam.position.y = 13;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.6, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffd24a,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  g.userData.beam = beam;
  g.userData.ring = ring;
  g.visible = false;
  return g;
}

export class Missions {
  constructor(scene, world, hooks) {
    this.scene = scene;
    this.world = world;
    this.hooks = hooks; // {addCash, banner, toast, setObjective, setWanted, spawnGang, spawnVan}
    this.index = 0;     // 0-based: which mission is current
    this.phase = 'idle'; // idle | active | done
    this.step = 0;
    this.beacon = makeBeaconMesh();
    scene.add(this.beacon);
    this.beaconPos = null;
    this._pulse = 0;
    this._van = null;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  get allDone() {
    return this.index >= MISSIONS.length;
  }

  // Place the beacon and show the objective text.
  setBeacon(pos, objective) {
    this.beaconPos = pos;
    this.beacon.position.set(pos.x, 0, pos.z);
    this.beacon.visible = true;
    if (this.hooks.setObjective) this.hooks.setObjective(objective);
  }

  hideBeacon() {
    this.beacon.visible = false;
    this.beaconPos = null;
  }

  start(i) {
    if (this.allDone) return;
    this.index = Math.max(0, Math.min(i, MISSIONS.length - 1));
    this.phase = 'active';
    this.step = 0;
    const m = this.current;
    const s = this.world.spots;
    if (this.hooks.banner) this.hooks.banner(m.name, m.briefing);
    if (m.id === 1) {
      this.setBeacon(s.plaza, m.objective);
    } else if (m.id === 2) {
      this.setBeacon(s.pierPickup, 'Pick up the package at the pier');
    } else if (m.id === 3) {
      this.hooks.setWanted(2);
      this.hideBeacon();
      if (this.hooks.setObjective) this.hooks.setObjective(m.objective);
    } else if (m.id === 4) {
      this.setBeacon(s.carPark, 'Meet the contact at the parking lot');
    } else if (m.id === 5) {
      this._van = this.hooks.spawnVan ? this.hooks.spawnVan(s.vanSpot) : null;
      this.setBeacon(s.vanSpot, 'Steal the armoured van');
    }
  }

  restart() {
    if (this.allDone) return;
    this.start(this.index);
  }

  fail() {
    if (this.phase !== 'active') return;
    this.phase = 'idle';
    this.hideBeacon();
    if (this.hooks.banner) this.hooks.banner('Mission failed', 'Press M and try it again.');
    if (this.hooks.setObjective) this.hooks.setObjective('Press M to retry the mission');
  }

  complete() {
    const m = this.current;
    if (!m) return;
    this.phase = 'idle';
    this.hideBeacon();
    if (this.hooks.addCash) this.hooks.addCash(m.reward);
    if (this.hooks.banner) this.hooks.banner('Mission complete', `+ $${m.reward} — ${m.name}`);
    if (this.hooks.toast) this.hooks.toast(`Banked $${m.reward}`);
    this.index += 1;
    this.step = 0;
    if (this.allDone) {
      this.phase = 'done';
      if (this.hooks.setObjective) this.hooks.setObjective('Story complete — free roam Solmar Bay');
      if (this.hooks.banner) this.hooks.banner('The Big Score done', 'Rook owns this city now. Free roam!');
    } else if (this.hooks.setObjective) {
      this.hooks.setObjective(`Next: ${MISSIONS[this.index].name} — press M to start`);
    }
  }

  // s: {playerPos, inCar, car, wanted, gangAlive}
  update(dt, s) {
    this._pulse += dt;
    if (this.beacon.visible) {
      this.beacon.userData.beam.material.opacity = 0.26 + Math.sin(this._pulse * 3) * 0.1;
      const sc = 1 + Math.sin(this._pulse * 3) * 0.12;
      this.beacon.userData.ring.scale.set(sc, sc, 1);
      this.beacon.rotation.y += dt * 0.8;
    }
    if (this.phase !== 'active' || !s) return;
    const m = this.current;
    const sp = this.world.spots;
    const near = (pos, r) => Math.hypot(s.playerPos.x - pos.x, s.playerPos.z - pos.z) < r;

    if (m.id === 1) {
      if (this.step === 0 && s.inCar) {
        this.step = 1;
        if (this.hooks.toast) this.hooks.toast('Wheels secured — get to the marker');
      } else if (this.step === 1 && s.inCar && near(sp.plaza, 9)) {
        this.complete();
      }
    } else if (m.id === 2) {
      if (this.step === 0 && near(sp.pierPickup, 4)) {
        this.step = 1;
        this.hooks.setWanted(1);
        this.setBeacon(sp.delivery, 'Deliver the package');
        if (this.hooks.toast) this.hooks.toast('Package grabbed — cops are watching, move!');
      } else if (this.step === 1 && near(sp.delivery, 7)) {
        this.complete();
      }
    } else if (m.id === 3) {
      if (!s.wanted) this.complete();
    } else if (m.id === 4) {
      if (this.step === 0 && near(sp.carPark, 9)) {
        this.step = 1;
        this.hideBeacon();
        if (this.hooks.spawnGang) this.hooks.spawnGang(sp.carPark, 4);
        if (this.hooks.banner) this.hooks.banner('Ambush!', 'Rival gang — take them all out');
        if (this.hooks.setObjective) this.hooks.setObjective('Survive the ambush — take out the rivals');
      } else if (this.step === 1 && s.gangAlive === 0) {
        this.complete();
      }
    } else if (m.id === 5) {
      if (this.step === 0 && s.inCar && s.car && s.car.armoured) {
        this.step = 1;
        this.hooks.setWanted(3);
        this.hideBeacon();
        if (this.hooks.toast) this.hooks.toast('Van taken — lose the 3-star tail!');
        if (this.hooks.setObjective) this.hooks.setObjective('Escape the 3-star wanted level in the van');
      } else if (this.step === 1 && s.inCar && s.car && s.car.armoured && !s.wanted) {
        this.complete();
      }
    }
  }

  // Current beacon position for the minimap, or null.
  blip() {
    return this.beacon.visible && this.beaconPos
      ? { x: this.beaconPos.x, z: this.beaconPos.z }
      : null;
  }
}
