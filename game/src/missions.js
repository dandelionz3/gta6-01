import * as THREE from 'three';
import { MISSIONS, distance } from './config.js';
export function createMissions(game) {
  const marker = new THREE.Group(); game.scene.add(marker);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.17, 8, 48), new THREE.MeshBasicMaterial({ color: 0x91ffce }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; marker.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.4, 15, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x85ffd0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 7.5; marker.add(beam);
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshBasicMaterial({ color: 0xb2ffe2, wireframe: true }));
  diamond.position.y = 5; marker.add(diamond);
  let index = 0, phase = 0, active = false, target = { x: 0, z: 208 }, objective = 'Explore Solmar Bay · Press M to take a job', van = null, timer = 0;
  function setTarget(x, z) { target = { x, z }; marker.position.set(x, 0, z); marker.visible = true; }
  function start(n = index) {
    if (n < 0 || n >= MISSIONS.length) n = 0;
    index = n; phase = 0; active = true; timer = 0;
    game.combat.clearEnemies();
    game.toast(MISSIONS[index].intro, 9); game.audio.pickup();
    setTarget(...MISSIONS[index].target);
    if (index === 0) objective = 'Steal a car · E near a vehicle';
    if (index === 1) objective = 'Collect the package · downtown courier point';
    if (index === 2) { objective = 'Lose the tail · escape the 2-star pursuit'; game.wanted = Math.max(2, game.wanted); marker.visible = false; }
    if (index === 3) objective = 'Meet the contact · parking terrace';
    if (index === 4) {
      objective = 'Steal the armoured van · north docks';
      van = game.vehicles.spawn('van', 0, -192, Math.PI, 0x697a70, 'parked');
      game.combat.spawnEnemy(-8, -182); game.combat.spawnEnemy(9, -202);
    }
  }
  function complete() {
    const reward = MISSIONS[index].reward;
    game.cash += reward; game.completed = Math.max(game.completed, index + 1);
    game.toast(`JOB COMPLETE · ${MISSIONS[index].name} · +$${reward}`, 7); game.audio.mission();
    active = false; marker.visible = false; game.save();
    objective = index === 4 ? 'Solmar is yours. Free roam · M to replay any story job' : 'Job complete · M to start the next chapter';
  }
  function fail() {
    if (!active) return;
    active = false; marker.visible = false;
    objective = 'Job interrupted · M to retry';
  }
  function update(dt) {
    diamond.rotation.y += dt; ring.rotation.z += dt * 0.25;
    beam.material.opacity = 0.1 + Math.sin(game.time * 2) * 0.025;
    if (!active || game.shot) return;
    timer += dt;
    const near = distance(game.player, target) < 7;
    if (index === 0) {
      if (game.car && phase === 0) { phase = 1; objective = 'Drive to Mara · Solmar Pier'; }
      if (phase === 1 && game.car && near) complete();
    }
    if (index === 1) {
      if (phase === 0 && near) {
        phase = 1; game.wanted = Math.max(1, game.wanted); setTarget(128, 208);
        objective = 'Deliver the package'; game.toast('Package collected. Vale has eyes on you. Reach the beach drop.', 6);
      } else if (phase === 1 && near) complete();
    }
    if (index === 2 && game.wanted === 0 && timer > 5) complete();
    if (index === 3) {
      if (phase === 0 && near && !game.car) {
        phase = 1; objective = 'Ambush! Defeat the Cinder crew'; marker.visible = false;
        game.ammo += 60; game.health = Math.max(game.health, 80);
        for (const [x, z] of [[117, -141], [141, -117], [128, -108], [108, -128]]) game.combat.spawnEnemy(x, z);
        game.toast('Contact: It is a setup! Clear the crew, Rook!', 6);
      }
      if (phase === 1) {
        const left = game.combat.enemies.filter(e => e.health > 0).length;
        objective = `Survive the shootout · ${left} rivals remaining`;
        if (!left) complete();
      }
    }
    if (index === 4) {
      if (phase === 0 && game.car === van) {
        phase = 1; game.wanted = Math.max(game.wanted, 3); marker.visible = false;
        objective = 'Escape the 3-star pursuit · protect the armoured van';
      }
      if (phase === 1 && van.health <= 0) { fail(); game.toast('The van is wrecked. M to restart the score.'); }
      if (phase === 1 && game.wanted === 0 && game.car === van) { phase = 2; setTarget(-128, 208); objective = 'Deliver the armoured van · beach safehouse'; }
      else if (phase === 2 && near && game.car === van) complete();
    }
  }
  return {
    update, start, fail, marker,
    get index() { return index; }, get active() { return active; }, get target() { return marker.visible ? target : null; }, get objective() { return objective; },
    stage(text, x, z) { objective = text; setTarget(x, z); },
    menu() {
      const next = Math.min(game.completed, 4);
      return MISSIONS.map((m, i) => ({ name: m.name, reward: m.reward, unlocked: i <= next, current: active && i === index }));
    }
  };
}
