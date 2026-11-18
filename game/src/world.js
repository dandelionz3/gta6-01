// Solmar Bay city generation. One seeded pass builds the whole map:
// road grid, sidewalks, buildings with lit windows, beach, pier, palms,
// streetlights and traffic lights. Colliders are plain AABBs the rest of
// the game tests against — no physics engine needed.
import * as THREE from "three";
import { CFG } from "./config.js";
import { RNG } from "./random.js";

function windowTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#3a3f4a"; g.fillRect(0, 0, 128, 256);
  const r = new RNG(99);
  for (let y = 8; y < 248; y += 22) {
    for (let x = 8; x < 120; x += 20) {
      const lit = r.chance(0.45);
      g.fillStyle = lit ? (r.chance(0.7) ? "#ffd98a" : "#9fd8ff") : "#232833";
      g.fillRect(x, y, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene) {
  const W = CFG.world;
  const rng = new RNG(W.seed);
  const pal = CFG.palette;
  const colliders = [];
  const roads = [];      // { x, z, axis, len } centre lines for traffic
  const lamps = [];
  const signals = [];    // traffic-light heads we animate

  const half = (W.blocks * W.blockSize) / 2; // 160
  const roadCentres = [];
  for (let i = 0; i <= W.blocks; i++) roadCentres.push(-half + i * W.blockSize);

  // --- ground base ---
  // Ground ends at the beach (z ~ 210) so the ocean plane shows past it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 220, half * 2 + 120),
    new THREE.MeshStandardMaterial({ color: pal.grass, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, -10);
  scene.add(ground);

  // --- roads (dark strips) + sidewalks (pale strips) ---
  const roadMat = new THREE.MeshStandardMaterial({ color: pal.asphalt, roughness: 0.95 });
  const walkMat = new THREE.MeshStandardMaterial({ color: pal.sidewalk, roughness: 1 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
  for (const c of roadCentres) {
    for (const [mat, w, y] of [[roadMat, W.roadWidth, 0.0], [walkMat, W.roadWidth + W.sidewalkWidth * 2, -0.02]]) {
      const stripX = new THREE.Mesh(new THREE.PlaneGeometry(w, half * 2 + 8), mat);
      stripX.rotation.x = -Math.PI / 2; stripX.position.set(c, y, 0);
      scene.add(stripX);
      const stripZ = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 8, w), mat);
      stripZ.rotation.x = -Math.PI / 2; stripZ.position.set(0, y, c);
      scene.add(stripZ);
    }
    roads.push({ x: c, z: 0, axis: "z", len: half * 2 });
    roads.push({ x: 0, z: c, axis: "x", len: half * 2 });
    // centre dashes
    const dashGeo = new THREE.PlaneGeometry(0.5, 4);
    for (let d = -half + 8; d < half; d += 12) {
      const d1 = new THREE.Mesh(dashGeo, lineMat);
      d1.rotation.x = -Math.PI / 2; d1.position.set(c, 0.02, d); scene.add(d1);
      const d2 = new THREE.Mesh(dashGeo, lineMat);
      d2.rotation.x = -Math.PI / 2; d2.rotation.z = Math.PI / 2; d2.position.set(d, 0.02, c); scene.add(d2);
    }
  }

  // --- buildings: one or two per block, varied height/colour ---
  const winTex = windowTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1 });
  for (let bx = 0; bx < W.blocks; bx++) {
    for (let bz = 0; bz < W.blocks; bz++) {
      const cx = -half + bx * W.blockSize + W.blockSize / 2;
      const cz = -half + bz * W.blockSize + W.blockSize / 2;
      // skip the central plaza block — it becomes a park
      const isPlaza = bx === 2 && bz === 2;
      if (isPlaza) {
        const lawn = new THREE.Mesh(new THREE.PlaneGeometry(44, 44),
          new THREE.MeshStandardMaterial({ color: 0x5d8a44, roughness: 1 }));
        lawn.rotation.x = -Math.PI / 2; lawn.position.set(cx, 0.03, cz);
        scene.add(lawn);
        const fountain = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 1.2, 20),
          new THREE.MeshStandardMaterial({ color: 0x9db8c4, roughness: 0.4 }));
        fountain.position.set(cx, 0.6, cz); scene.add(fountain);
        continue;
      }
      const n = rng.int(1, 2);
      for (let k = 0; k < n; k++) {
        const w = rng.range(14, 24), d = rng.range(14, 24);
        const h = rng.range(W.minBuildingHeight, W.maxBuildingHeight);
        const ox = rng.range(-10, 10) + (k === 1 ? 14 : -8);
        const oz = rng.range(-10, 10) + (k === 1 ? -12 : 10);
        const colour = rng.pick(pal.building);
        const mat = new THREE.MeshStandardMaterial({
          color: colour, roughness: 0.9, map: winTex,
          emissive: 0xffc46b, emissiveMap: winTex, emissiveIntensity: 0.35,
        });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(cx + ox, h / 2, cz + oz);
        scene.add(b);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.6, 0.8, d + 0.6);
        roof.position.set(cx + ox, h + 0.4, cz + oz);
        scene.add(roof);
        colliders.push({ x: cx + ox, z: cz + oz, hx: w / 2 + 0.3, hz: d / 2 + 0.3 });
      }
    }
  }

  // --- beach + ocean + pier (south edge) ---
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 120, 70),
    new THREE.MeshStandardMaterial({ color: pal.sand, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.01, W.beachZ + 18);
  scene.add(sand);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 220, 160),
    new THREE.MeshStandardMaterial({ color: pal.ocean, roughness: 0.25, metalness: 0.1 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -0.3, W.oceanZ + 60);
  scene.add(ocean);
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x7a5c38, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 52), pierMat);
  pier.position.set(W.pierX, 0.8, W.pierZ);
  scene.add(pier);
  colliders.push({ x: W.pierX - 6, z: W.pierZ, hx: 1, hz: 26 });
  colliders.push({ x: W.pierX + 6, z: W.pierZ, hx: 1, hz: 26 });
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3, 8), pierMat);
    post.position.set(W.pierX + (i % 2 === 0 ? -5 : 5), 0.4, W.pierZ - 22 + i * 9);
    scene.add(post);
  }

  // --- palms along the beach boulevard + plaza ---
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7a33, roughness: 0.9 });
  const palmSpots = [];
  for (let x = -half + 8; x <= half - 8; x += 24) palmSpots.push([x, W.beachZ - 12]);
  for (let i = 0; i < 6; i++) palmSpots.push([rng.range(-40, 40), rng.range(-40, 40)]);
  for (const [px, pz] of palmSpots) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6, 7), trunkMat);
    trunk.position.y = 3; trunk.rotation.z = rng.range(-0.08, 0.08);
    g.add(trunk);
    for (let l = 0; l < 6; l++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 4), leafMat);
      leaf.position.y = 6.2;
      leaf.rotation.z = Math.PI / 2.4;
      leaf.rotation.y = (l / 6) * Math.PI * 2;
      leaf.position.x = Math.cos((l / 6) * Math.PI * 2) * 1.1;
      leaf.position.z = Math.sin((l / 6) * Math.PI * 2) * 1.1;
      g.add(leaf);
    }
    g.position.set(px, 0, pz);
    scene.add(g);
  }

  // --- streetlights + traffic signals at intersections ---
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3c3f45, roughness: 0.6, metalness: 0.5 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffdf8a, emissiveIntensity: 1.4 });
  for (const c of roadCentres) {
    for (const d of [-half + 32, 0, half - 32]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
      pole.position.set(c + W.roadWidth / 2 + 1.5, 3.5, d);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), lampMat);
      lamp.position.set(c + W.roadWidth / 2 + 1.5, 7, d);
      scene.add(lamp);
      lamps.push(lamp);
    }
    // one signal head per avenue crossing
    const head = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    head.add(box);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff2a22, emissive: 0xff2a22, emissiveIntensity: 1.6 }));
    red.position.set(0, 0.45, 0.26); head.add(red);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x22cc55, emissive: 0x22cc55, emissiveIntensity: 0.2 }));
    green.position.set(0, -0.45, 0.26); head.add(green);
    head.position.set(c + W.roadWidth / 2 + 0.8, 5.4, -half + 32);
    scene.add(head);
    signals.push({ red, green, phase: rng.range(0, 6) });
  }

  // --- props: crates + benches near the plaza ---
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const s = rng.range(0.8, 1.6);
    const crate = new THREE.Mesh(boxGeo, crateMat);
    crate.scale.set(s, s, s);
    crate.position.set(rng.range(-30, 30), s / 2, rng.range(-30, 30));
    crate.rotation.y = rng.range(0, Math.PI);
    scene.add(crate);
    colliders.push({ x: crate.position.x, z: crate.position.z, hx: s / 2 + 0.1, hz: s / 2 + 0.1 });
  }

  return {
    colliders, roads, lamps, signals,
    half,
    spawn: { x: 8, z: 96, heading: Math.PI },
    hospital: { x: -96, z: -96 },
    policeStation: { x: 96, z: -96 },
    update(dt, t) {
      for (const s of signals) {
        const on = Math.floor(t + s.phase) % 6 < 3;
        s.red.material.emissiveIntensity = on ? 1.8 : 0.15;
        s.green.material.emissiveIntensity = on ? 0.15 : 1.8;
      }
    },
  };
}

// Circle (player / car) vs AABB push-out. Returns true when a hit happened.
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.x - c.hx, Math.min(pos.x, c.x + c.hx));
    const nz = Math.max(c.z - c.hz, Math.min(pos.z, c.z + c.hz));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        pos.x += radius; // dead centre — shove out along +x
      }
    }
  }
  return hit;
}
