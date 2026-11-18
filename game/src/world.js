// Solmar Bay city generation. One big painted ground texture carries the road
// grid, markings and beach; buildings are instanced boxes with procedurally
// painted facades so the draw-call count stays modest.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';

const WORLD_EXTENT = 260; // ground texture covers -260..260

function facadeTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.22)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // window grid
  const cols = 5;
  const rows = 10;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng.chance(litRatio);
      g.fillStyle = lit ? '#ffd98a' : '#1d2733';
      g.fillRect(12 + col * 22, 12 + r * 24, 13, 15);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const toPx = (v) => ((v + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * S;
  const pxPerM = S / (WORLD_EXTENT * 2);

  // base: sidewalks
  g.fillStyle = '#9aa0a8';
  g.fillRect(0, 0, S, S);

  const lines = CFG.gridLines();
  const half = CFG.world.half;
  const rw = CFG.world.road / 2;

  // beach sand strip on the south edge, then sea is a separate mesh
  g.fillStyle = '#e8cf9a';
  g.fillRect(0, toPx(CFG.world.beachZ), S, S - toPx(CFG.world.beachZ));

  // asphalt roads
  g.fillStyle = '#2e3138';
  for (const L of lines) {
    g.fillRect(toPx(L - rw), toPx(-half), rw * 2 * pxPerM, half * 2 * pxPerM);
    g.fillRect(toPx(-half), toPx(L - rw), half * 2 * pxPerM, rw * 2 * pxPerM);
  }

  // centre dashes
  g.fillStyle = '#e8e4d2';
  for (const L of lines) {
    for (let m = -half + 4; m < half; m += 10) {
      g.fillRect(toPx(L) - 1, toPx(m), 2, 5 * pxPerM);
      g.fillRect(toPx(m), toPx(L) - 1, 5 * pxPerM, 2);
    }
  }

  // zebra crossings at every intersection
  g.fillStyle = 'rgba(240,240,230,0.85)';
  for (const ax of lines) {
    for (const az of lines) {
      for (let i = -3; i <= 3; i++) {
        g.fillRect(toPx(ax + i * 2.4) - 1.5, toPx(az - rw - 2.5), 3, 5 * pxPerM * 0.5);
        g.fillRect(toPx(ax - rw - 2.5), toPx(az + i * 2.4) - 1.5, 5 * pxPerM * 0.5, 3);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildWorld(scene, seed = 1) {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  scene.add(group);
  const lines = CFG.gridLines();
  const half = CFG.world.half;
  const block = CFG.world.block;
  const roadHalf = CFG.world.road / 2;
  const colliders = [];

  // ---- ground ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_EXTENT * 2, WORLD_EXTENT * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- ocean ----
  const seaMat = new THREE.MeshLambertMaterial({ color: CFG.colours.sea });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_EXTENT * 2, 90), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, CFG.world.seaZ + 45);
  group.add(sea);
  const seaDeep = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_EXTENT * 2, 200),
    new THREE.MeshLambertMaterial({ color: CFG.colours.seaDeep }),
  );
  seaDeep.rotation.x = -Math.PI / 2;
  seaDeep.position.set(0, -0.6, CFG.world.seaZ + 190);
  group.add(seaDeep);

  // ---- pier ----
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 60), pierMat);
  pier.position.set(CFG.world.pierX, 0.6, CFG.world.pierZ);
  pier.castShadow = true;
  group.add(pier);
  colliders.push({
    minX: CFG.world.pierX - 7, maxX: CFG.world.pierX + 7,
    minZ: CFG.world.pierZ - 30, maxZ: CFG.world.pierZ + 30,
  });
  for (let i = 0; i < 5; i++) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x5d4630 }),
    );
    post.position.set(CFG.world.pierX + (i % 2 === 0 ? -6 : 6), 0.4, CFG.world.pierZ - 24 + i * 12);
    group.add(post);
  }

  // ---- buildings ----
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const palette = ['#b98a6a', '#7d8aa0', '#a08a7d', '#6a7d8a', '#c2a878', '#8a7d9a', '#9a8a6a', '#5d7186'];
  const facades = palette.map((col) => facadeTexture(rng, col, 0.42));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });

  let downtown = 0;
  for (let ix = 0; ix < lines.length - 1; ix++) {
    for (let iz = 0; iz < lines.length - 1; iz++) {
      const x0 = lines[ix] + roadHalf + 2;
      const z0 = lines[iz] + roadHalf + 2;
      const x1 = lines[ix + 1] - roadHalf - 2;
      const z1 = lines[iz + 1] - roadHalf - 2;
      if (z0 > CFG.world.beachZ - 6) continue; // no buildings on the sand
      const nearCentre = Math.abs((x0 + x1) / 2) < 70 && Math.abs((z0 + z1) / 2) < 70;
      const count = rng.chance(0.3) ? 2 : 1;
      for (let b = 0; b < count; b++) {
        const w = rng.range(10, count === 1 ? x1 - x0 : (x1 - x0) / 2 - 2);
        const d = rng.range(10, z1 - z0 - 2);
        const bx = count === 1 ? (x0 + x1) / 2 : x0 + w / 2 + b * ((x1 - x0) / 2);
        const bz = (z0 + z1) / 2 + rng.range(-2, 2);
        let h = rng.range(8, nearCentre ? 42 : 22);
        if (nearCentre && downtown < 5 && rng.chance(0.5)) {
          h = rng.range(48, 68);
          downtown++;
        }
        const mat = new THREE.MeshLambertMaterial({ map: facades[rng.int(0, facades.length - 1)] });
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(bx, h / 2, bz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.4, 0.6, d + 0.4);
        roof.position.set(bx, h + 0.3, bz);
        group.add(roof);
        colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
      }
    }
  }

  // ---- palms along the beach boulevard ----
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondGeo = new THREE.ConeGeometry(2.4, 1.1, 5);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3d });
  for (let x = -200; x <= 200; x += 16) {
    if (Math.abs(x - CFG.world.pierX) < 12) continue;
    const px = x + rng.range(-2, 2);
    const pz = CFG.world.beachZ - rng.range(4, 9);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(px, 3, pz);
    trunk.rotation.z = rng.range(-0.12, 0.12);
    trunk.castShadow = true;
    group.add(trunk);
    const top = new THREE.Mesh(frondGeo, frondMat);
    top.position.set(px, 6.4, pz);
    top.scale.y = 0.55;
    group.add(top);
  }

  // ---- streetlights + traffic lights ----
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 7, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const trafficLights = [];
  for (const ax of lines) {
    for (const az of lines) {
      if (Math.abs(ax) > half || Math.abs(az) > half) continue;
      if (az > CFG.world.beachZ - 8) continue;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(ax + roadHalf + 0.6, 3.5, az + roadHalf + 0.6);
      group.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(ax + roadHalf + 0.6, 7, az + roadHalf + 0.6);
      group.add(lamp);
      // traffic light head on alternating corners
      if ((ax + az) % 92 === 0) {
        const head = new THREE.Group();
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 1.4, 0.5),
          new THREE.MeshLambertMaterial({ color: 0x1c1e20 }),
        );
        head.add(box);
        const dotGeo = new THREE.CircleGeometry(0.16, 10);
        const red = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xff2a22 }));
        red.position.set(0, 0.45, 0.26);
        const amber = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0x554400 }));
        amber.position.set(0, 0, 0.26);
        const green = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0x22cc55 }));
        green.position.set(0, -0.45, 0.26);
        head.add(red, amber, green);
        head.position.set(ax - roadHalf - 0.8, 5.2, az - roadHalf - 0.8);
        group.add(head);
        trafficLights.push({ red: red.material, amber: amber.material, green: green.material, phase: rng.range(0, 6) });
      }
    }
  }

  // ---- a few props: benches + kiosks near the beach ----
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (let i = 0; i < 8; i++) {
    const bx = -160 + i * 46;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1), benchMat);
    bench.position.set(bx, 0.5, CFG.world.beachZ - 3);
    group.add(bench);
  }

  function nearestRoadPoint(x, z) {
    let bx = lines[0];
    let bz = lines[0];
    for (const L of lines) {
      if (Math.abs(x - L) < Math.abs(x - bx)) bx = L;
      if (Math.abs(z - L) < Math.abs(z - bz)) bz = L;
    }
    // snap to whichever road axis is closer
    if (Math.abs(x - bx) < Math.abs(z - bz)) return { x: bx, z };
    return { x, z: bz };
  }

  function isRoad(x, z) {
    for (const L of lines) {
      if (Math.abs(x - L) < roadHalf + 0.5 && Math.abs(z) < half) return true;
      if (Math.abs(z - L) < roadHalf + 0.5 && Math.abs(x) < half) return true;
    }
    return false;
  }

  let seaPhase = 0;
  return {
    group,
    colliders,
    lines,
    bounds: half,
    beachZ: CFG.world.beachZ,
    seaZ: CFG.world.seaZ,
    rng,
    nearestRoadPoint,
    isRoad,
    update(dt) {
      seaPhase += dt;
      sea.position.y = -0.4 + Math.sin(seaPhase * 0.7) * 0.12;
      seaMat.color.setHSL(0.55, 0.6, 0.32 + Math.sin(seaPhase * 0.5) * 0.02);
      for (const tl of trafficLights) {
        const cyc = (seaPhase + tl.phase) % 9;
        const redOn = cyc < 4;
        tl.red.color.setHex(redOn ? 0xff2a22 : 0x441111);
        tl.amber.color.setHex(cyc >= 4 && cyc < 5 ? 0xffaa00 : 0x554400);
        tl.green.color.setHex(cyc >= 5 ? 0x22cc55 : 0x113311);
      }
    },
  };
}
