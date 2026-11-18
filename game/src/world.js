// Solmar Bay city generation.
// One seeded pass builds the whole map: road grid, blocks of
// buildings with lit windows, beach, pier, palms, streetlights and
// props. Geometries and materials are shared so the draw-call count
// stays modest. Returns the colliders and waypoints the other
// modules drive on.

import * as THREE from 'three';
import { CFG } from './config.js';

function facadeTexture(rng) {
  // One canvas texture reused by every building: a warm wall with a
  // grid of windows, a random few of them lit for the sunset hour.
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b9a98f';
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const lit = rng.chance(0.4);
      ctx.fillStyle = lit ? '#ffd27a' : '#2c3542';
      ctx.fillRect(14 + col * 28, 14 + row * 30, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene, rng) {
  const P = CFG.palette;
  const half = CFG.city.half;
  const step = CFG.city.blockStep;
  const roadW = CFG.city.roadWidth;
  const colliders = [];
  const roadLines = [];
  const sidewalks = [];
  const animated = [];

  const lines = [-160, -80, 0, 80, 160];

  // --- ground, beach, ocean -------------------------------------------
  const groundMat = new THREE.MeshLambertMaterial({ color: P.grass });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 160, half * 2 + 160), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.08, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const sandMat = new THREE.MeshLambertMaterial({ color: P.sand });
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 160, CFG.city.oceanZ - CFG.city.beachZ),
    sandMat,
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.0, (CFG.city.beachZ + CFG.city.oceanZ) / 2);
  sand.receiveShadow = true;
  scene.add(sand);

  const oceanMat = new THREE.MeshLambertMaterial({ color: P.ocean });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 160, 140), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.25, CFG.city.oceanZ + 70);
  scene.add(ocean);
  animated.push((t) => {
    ocean.position.y = -0.25 + Math.sin(t * 0.6) * 0.08;
  });

  // --- roads and sidewalks --------------------------------------------
  const asphaltMat = new THREE.MeshLambertMaterial({ color: P.asphalt });
  const walkMat = new THREE.MeshLambertMaterial({ color: P.sidewalk });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
  const roadGeoX = new THREE.PlaneGeometry(half * 2, roadW);
  const roadGeoZ = new THREE.PlaneGeometry(roadW, half * 2);

  for (const at of lines) {
    const rx = new THREE.Mesh(roadGeoX, asphaltMat);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.01, at);
    rx.receiveShadow = true;
    scene.add(rx);
    const rz = new THREE.Mesh(roadGeoZ, asphaltMat);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(at, 0.01, 0);
    rz.receiveShadow = true;
    scene.add(rz);
    roadLines.push({ axis: 'z', at, from: -half, to: half });
    roadLines.push({ axis: 'x', at, from: -half, to: half });

    // centre dashes
    for (let d = -half + 10; d < half; d += 20) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(d, 0.02, at);
      scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 6), dashMat);
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(at, 0.02, d);
      scene.add(dash2);
    }

    // sidewalk strips on both sides of every road
    for (const off of [-roadW / 2 - 2.5, roadW / 2 + 2.5]) {
      const s1 = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 5), walkMat);
      s1.rotation.x = -Math.PI / 2;
      s1.position.set(0, 0.02, at + off);
      scene.add(s1);
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(5, half * 2), walkMat);
      s2.rotation.x = -Math.PI / 2;
      s2.position.set(at + off, 0.02, 0);
      scene.add(s2);
    }
    for (let i = 0; i < 6; i++) {
      sidewalks.push({ x: rng.range(-half, half), z: at + (rng.chance(0.5) ? 9.5 : -9.5) });
      sidewalks.push({ x: at + (rng.chance(0.5) ? 9.5 : -9.5), z: rng.range(-half, half) });
    }
  }

  // --- buildings --------------------------------------------------------
  const tex = facadeTexture(rng);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = P.building.map(
    (c) =>
      new THREE.MeshStandardMaterial({
        color: c,
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.22,
        roughness: 0.9,
      }),
  );
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });

  for (const bx of [-120, -40, 40, 120]) {
    for (const bz of [-160, -80, 0, 80]) {
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i++) {
        const w = rng.range(18, 30);
        const d = rng.range(18, 30);
        const h = rng.pick([10, 14, 18, 26, 34, 48, 62]);
        const cx = bx + rng.range(-14, 14);
        const cz = bz + rng.range(-14, 14);
        const mesh = new THREE.Mesh(boxGeo, rng.pick(mats));
        mesh.scale.set(w, h, d);
        mesh.position.set(cx, h / 2, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.6, 0.8, d + 0.6);
        roof.position.set(cx, h + 0.4, cz);
        scene.add(roof);
        colliders.push({
          minX: cx - w / 2 - 0.4,
          maxX: cx + w / 2 + 0.4,
          minZ: cz - d / 2 - 0.4,
          maxZ: cz + d / 2 + 0.4,
        });
      }
    }
  }

  // --- palms ------------------------------------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 7, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: P.palmTrunk });
  const leafGeo = new THREE.ConeGeometry(1.6, 4.2, 5);
  const leafMat = new THREE.MeshLambertMaterial({ color: P.palmLeaf });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = rng.range(-0.08, 0.08);
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1, 7.2, Math.sin(a) * 1.1);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let x = -190; x <= 190; x += 16) {
    if (rng.chance(0.75)) palm(x + rng.range(-3, 3), 198 + rng.range(0, 26));
    if (rng.chance(0.5)) palm(x + rng.range(-3, 3), 172 + rng.range(0, 8));
  }
  for (let i = 0; i < 14; i++) {
    palm(rng.range(-180, 180), rng.pick([-168, -88, -8, 72]));
  }

  // --- streetlights + traffic lights ------------------------------------
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (const ix of [-80, 0, 80]) {
    for (const iz of [-80, 0, 80]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(ix + 9, 3.25, iz + 9);
      scene.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(ix + 9, 6.6, iz + 9);
      scene.add(lamp);
    }
  }
  const lightBoxGeo = new THREE.BoxGeometry(0.5, 1.4, 0.5);
  const lightBoxMat = new THREE.MeshLambertMaterial({ color: 0x1c1e20 });
  const bulbGeo = new THREE.SphereGeometry(0.16, 6, 5);
  const bulbMats = [
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    new THREE.MeshBasicMaterial({ color: 0xffcc00 }),
    new THREE.MeshBasicMaterial({ color: 0x34c759 }),
  ];
  for (const [ix, iz] of [[-80, -80], [0, 0], [80, 80], [-80, 80], [80, -80]]) {
    const post = new THREE.Mesh(poleGeo, poleMat);
    post.position.set(ix - 9, 3.25, iz - 9);
    scene.add(post);
    const box = new THREE.Mesh(lightBoxGeo, lightBoxMat);
    box.position.set(ix - 9, 6.2, iz - 9);
    scene.add(box);
    for (let b = 0; b < 3; b++) {
      const bulb = new THREE.Mesh(bulbGeo, bulbMats[b]);
      bulb.position.set(ix - 9, 6.65 - b * 0.45, iz - 8.7);
      scene.add(bulb);
    }
  }

  // --- pier ---------------------------------------------------------------
  const plankMat = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
  const plankGeo = new THREE.BoxGeometry(12, 0.4, 2.4);
  for (let z = 200; z <= 264; z += 2.6) {
    const plank = new THREE.Mesh(plankGeo, plankMat);
    plank.position.set(0, 0.6, z);
    plank.castShadow = true;
    scene.add(plank);
  }
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 6);
  for (const px of [-5.5, 5.5]) {
    for (let z = 202; z <= 264; z += 12) {
      const post = new THREE.Mesh(postGeo, poleMat);
      post.position.set(px, -0.4, z);
      scene.add(post);
    }
  }
  const hutMat = new THREE.MeshLambertMaterial({ color: 0x9a6a4a });
  const hut = new THREE.Mesh(boxGeo, hutMat);
  hut.scale.set(7, 4, 6);
  hut.position.set(0, 2.6, 262);
  hut.castShadow = true;
  scene.add(hut);
  colliders.push({ minX: -3.5, maxX: 3.5, minZ: 259, maxZ: 265 });

  // --- scattered props ----------------------------------------------------
  const crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  const hydrantGeo = new THREE.CylinderGeometry(0.3, 0.35, 1, 8);
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc23b2a });
  for (let i = 0; i < 26; i++) {
    const spot = rng.pointIn(-180, 180, -180, 170);
    if (Math.abs(spot.x % 80) < 9 || Math.abs(spot.z % 80) < 9) continue;
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(spot.x, 0.7, spot.z);
    crate.rotation.y = rng.range(0, Math.PI);
    crate.castShadow = true;
    scene.add(crate);
    colliders.push({
      minX: spot.x - 0.8,
      maxX: spot.x + 0.8,
      minZ: spot.z - 0.8,
      maxZ: spot.z + 0.8,
    });
  }
  for (let i = 0; i < 12; i++) {
    const spot = rng.pointIn(-180, 180, -180, 170);
    const hyd = new THREE.Mesh(hydrantGeo, hydrantMat);
    hyd.position.set(spot.x, 0.5, spot.z);
    scene.add(hyd);
  }

  return {
    colliders,
    roadLines,
    sidewalks,
    spawn: { x: 0, z: -6 },
    update(dt, t) {
      for (const fn of animated) fn(t);
    },
  };
}
