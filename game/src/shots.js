import * as THREE from 'three';
export function stageShot(game, name) {
  const presets = {
    cover: { x: 0, z: 1, angle: Math.PI / 2, speed: 26, wanted: 2, camera: [-25, 14, -3], look: [3, 1.5, -1] },
    drive: { x: 55, z: 208, angle: -Math.PI / 2, speed: 25, wanted: 0, camera: [77, 10, 192], look: [45, 2, 218] },
    mission: { x: -128, z: 0, angle: Math.PI / 2, speed: 0, wanted: 1, camera: [-128, 9, 22], look: [-121, 2, 0] },
    chase: { x: 64, z: 0, angle: 0, speed: 18, wanted: 3, camera: [64, 13, 24], look: [68, 2, -3] }
  };
  const s = presets[name] || presets.cover;
  game.shot = name; game.god = true; game.mode = 'play'; game.health = 87; game.cash = 4250; game.ammo = 64; game.wanted = s.wanted;
  game.player.x = s.x; game.player.z = s.z; game.player.angle = s.angle;
  for (const c of game.vehicles.cars) if (Math.hypot(c.x - s.x, c.z - s.z) < 15) {
    c.x = -192; c.z = -150 + game.rng() * 40;
  }
  if (name !== 'mission') {
    game.car = game.vehicles.spawn('sports', s.x, s.z, s.angle, name === 'chase' ? 0xe6bf68 : 0xed775f, 'player');
    game.car.speed = s.speed; game.car.stolen = true;
    if (name === 'chase') {
      game.car.health = 22;
      const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0x42494a, transparent: true, opacity: 0.45, depthWrite: false });
      for (let i = 0; i < 9; i++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5 + i * 0.13, 7, 6), smokeMaterial);
        puff.position.set(s.x + Math.sin(i * 2) * i * 0.12, 1.5 + i * 0.45, s.z + 1.5 - i * 0.22);
        game.scene.add(puff);
      }
    }
  } else {
    game.vehicles.spawn('sports', -128, -10, Math.PI / 2, 0x8f5266, 'parked');
    game.combat.spawnEnemy(-116, -10);
  }
  if (name === 'cover') {
    game.police.addCruiser(-13, 0, Math.PI / 2); game.police.addCruiser(-22, -5, Math.PI / 2);
    game.vehicles.spawn('taxi', 18, 4, -Math.PI / 2, 0xe7bc52, 'parked');
  }
  if (name === 'chase') {
    game.police.addCruiser(64, -12, 0); game.police.addCruiser(76, 0, -Math.PI / 2); game.police.addCruiser(49, -6, Math.PI / 2);
    game.police.addCop(56, 5); game.police.addCop(72, 8); game.police.addCop(64, 13);
  }
  const visibleWalkers = name === 'drive' ? [[43, 220], [63, 220], [75, 221]] : [[s.x + 11, s.z + 8], [s.x - 11, s.z - 4], [s.x + 11, s.z - 9]];
  visibleWalkers.forEach(([x, z], i) => {
    const p = game.traffic.pedestrians[i]; p.x = x; p.z = z; p.mesh.position.set(x, 0, z);
  });
  const words = name === 'mission' ? 'Deliver the package' : name === 'chase' ? 'Escape the 3-star pursuit' : name === 'drive' ? 'Sunset Strand · enjoy the coast' : 'First Wheels · make it to Solmar Pier';
  game.missions.stage(words, name === 'mission' ? -121 : 0, name === 'mission' ? 0 : 208);
  game.camera.position.set(...s.camera); game.camera.lookAt(new THREE.Vector3(...s.look));
  game.fixedCamera = { position: new THREE.Vector3(...s.camera), look: new THREE.Vector3(...s.look) };
  if (name === 'chase') for (let i = 0; i < 30; i++) game.vehicles.update(1 / 30, 2);
  game.vehicles.update(0, 2);
  // Freeze all vehicle animation after deterministic pre-roll, including smoke.
  game.vehicles.update = () => {};
  game.playerMesh.position.set(s.x, 0, s.z); game.playerMesh.rotation.y = s.angle; game.playerMesh.visible = !game.car;
  game.hud.screen('play');
}
