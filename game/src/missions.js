// Five-mission story chain for Solmar Bay. Each mission is a small step
// machine: go somewhere, steal something, survive something. The manager owns
// the 3D beacon and talks to the game through callbacks so it never imports
// the player, the police or the combat system directly.
import * as THREE from 'three';
import { CFG } from './config.js';

function makeBeacon() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.22, 10, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd94a }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd94a, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = 13;
  const pin = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.4, 10),
    new THREE.MeshBasicMaterial({ color: 0xff5a3a }),
  );
  pin.position.y = 7;
  pin.rotation.x = Math.PI;
  g.add(ring, beam, pin);
  g.userData = { ring, beam, pin };
  return g;
}

export class MissionManager {
  constructor(scene, hud, cb) {
    this.scene = scene;
    this.hud = hud;
    this.cb = cb; // { onCash, onToast, onSpawnGang, onSpawnVan, onSetWanted,
    //            onProgress, onMissionComplete, onMissionFailed }
    this.index = 0; // next mission to play (0-based)
    this.active = false;
    this.step = 0;
    this.beacon = null;
    this.beaconPos = null;
    this.timer = 0;
    this.hasPackage = false;
    this.van = null;
    this.time = 0;
  }

  get current() {
    return CFG.missions[this.index] || null;
  }
  get done() {
    return this.index >= CFG.missions.length;
  }

  missionName() {
    const m = this.current;
    return m ? `${m.id}. ${m.title}` : 'All missions complete';
  }

  start(i) {
    const m = CFG.missions[i];
    if (!m) return false;
    this.index = i;
    this.active = true;
    this.step = 0;
    this.hasPackage = false;
    this.van = null;
    this.timer = 0;
    this.cb.onToast(`Mission ${m.id} — ${m.title}`);
    this.hud.setObjective(m.objective);
    this.advanceToStep();
    return true;
  }

  startCurrent() {
    if (this.done) {
      this.cb.onToast('Story complete — free roam, Rook.');
      return false;
    }
    return this.start(this.index);
  }

  clearBeacon() {
    if (this.beacon) {
      this.scene.remove(this.beacon);
      this.beacon = null;
      this.beaconPos = null;
    }
  }

  placeBeacon(x, z) {
    this.clearBeacon();
    this.beacon = makeBeacon();
    this.beacon.position.set(x, 0, z);
    this.scene.add(this.beacon);
    this.beaconPos = { x, z };
  }

  advanceToStep() {
    const m = this.current;
    if (!m) return;
    const s = m.steps[this.step];
    if (!s) { this.complete(); return; }
    this.hud.setObjective(s.text);
    if (s.kind === 'goto' || s.kind === 'deliver' || s.kind === 'escape') {
      this.placeBeacon(s.pos[0], s.pos[1]);
    } else if (s.kind === 'heat') {
      this.cb.onSetWanted(s.stars);
      this.clearBeacon();
    } else if (s.kind === 'survive') {
      this.clearBeacon();
      this.cb.onSpawnGang(s.count, this.beaconPos || { x: -92, z: -46 });
      this.timer = 0;
    } else if (s.kind === 'steal' || s.kind === 'clear') {
      this.clearBeacon();
    }
  }

  nextStep() {
    this.step += 1;
    const m = this.current;
    if (!m) return;
    if (this.step >= m.steps.length) this.complete();
    else this.advanceToStep();
  }

  complete() {
    const m = this.current;
    this.active = false;
    this.clearBeacon();
    this.cb.onCash(m.reward);
    this.cb.onToast(`Mission complete — +$${m.reward}`);
    this.hud.setObjective('Mission complete. Press M for the next job.');
    this.index += 1;
    this.cb.onMissionComplete(m.id);
    this.cb.onProgress();
  }

  fail(reason) {
    const m = this.current;
    this.active = false;
    this.clearBeacon();
    this.hasPackage = false;
    this.cb.onToast(`Mission failed — ${reason}`);
    this.hud.setObjective('Mission failed. Press M to retry.');
    if (this.cb.onMissionFailed) this.cb.onMissionFailed(m ? m.id : 0, reason);
  }

  update(dt, player, combat) {
    this.time += dt;
    if (this.beacon) {
      const t = this.time;
      this.beacon.userData.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      this.beacon.userData.pin.position.y = 7 + Math.sin(t * 2.2) * 0.7;
      this.beacon.userData.beam.material.opacity = 0.22 + Math.sin(t * 2.2) * 0.08;
      this.beacon.rotation.y += dt * 0.6;
    }
    if (!this.active) return;
    const m = this.current;
    if (!m) return;
    const s = m.steps[this.step];
    if (!s) return;
    const px = player.pos.x;
    const pz = player.pos.z;

    if (s.kind === 'steal') {
      if (player.car) this.nextStep();
    } else if (s.kind === 'goto') {
      if (Math.hypot(px - s.pos[0], pz - s.pos[1]) < 7) {
        if (m.id === 2 && this.step === 0) {
          this.hasPackage = true;
          this.cb.onSetWanted(1);
          this.cb.onToast('Package picked up — cops noticed!');
        }
        if (m.id === 4 && this.step === 0) {
          this.cb.onToast('It is a setup — ambush!');
        }
        if (m.id === 5 && this.step === 0) {
          this.van = this.cb.onSpawnVan(s.pos[0], s.pos[1]);
          this.cb.onSetWanted(3);
          this.cb.onToast('Grab the van — 3 stars!');
        }
        this.nextStep();
      }
    } else if (s.kind === 'deliver') {
      if (this.hasPackage && Math.hypot(px - s.pos[0], pz - s.pos[1]) < 7) this.nextStep();
    } else if (s.kind === 'heat') {
      this.nextStep();
    } else if (s.kind === 'clear') {
      if (this.cb.wantedLevel() === 0) this.nextStep();
    } else if (s.kind === 'survive') {
      this.timer += dt;
      if (combat.enemiesAlive() === 0 && this.timer > 1.5) this.nextStep();
    } else if (s.kind === 'escape') {
      const inVan = player.car && this.van && player.car === this.van;
      if (inVan && Math.hypot(px - s.pos[0], pz - s.pos[1]) < 9) this.nextStep();
    }
  }
}
