import * as THREE from 'three';
import { CITY, COLORS } from './config.js';
import { choose } from './random.js';
const cube = new THREE.BoxGeometry(1, 1, 1);
const materials = new Map();
export function material(color, emissive = false) {
  const key = `${color}/${emissive}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...(emissive ? { emissive: color, emissiveIntensity: 0.65 } : {}) }));
  return materials.get(key);
}
export function box(parent, color, x, y, z, sx, sy, sz, glow = false) {
  const mesh = new THREE.Mesh(cube, material(color, glow));
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
  mesh.castShadow = sy > 1; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
export function label(parent, text, x, y, z, color = '#eaffda', width = 15) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#17383c'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = color; ctx.font = 'bold 46px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 82);
  const texture = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}
export function createWorld(scene, rng) {
  const solids = [], roads = [], group = new THREE.Group(); scene.add(group);
  box(group, 0xa9b299, 0, -0.6, 0, 570, 1, 460);
  box(group, COLORS.sand, 0, -0.45, 252, 680, 0.6, 78);
  box(group, COLORS.ocean, 0, -0.8, 445, 1600, 0.5, 310);
  for (let k = -3; k <= 3; k++) {
    const p = k * CITY.spacing;
    roads.push(p);
    box(group, 0xa9a99c, p, -0.04, 0, 25, 0.24, 437);
    box(group, COLORS.asphalt, p, 0.09, 0, 18, 0.1, 437);
    box(group, 0xa9a99c, 0, -0.04, p, 437, 0.24, 25);
    box(group, COLORS.asphalt, 0, 0.09, p, 437, 0.1, 18);
    for (let d = -214; d < 215; d += 12) {
      if (roads.some(v => Math.abs(v - d) < 13) || Math.abs(d % 64) < 13) continue;
      box(group, 0xe7cf88, p, 0.16, d, 0.22, 0.03, 5);
      box(group, 0xe7cf88, d, 0.16, p, 5, 0.03, 0.22);
    }
  }
  // The waterfront road is continuous across the full playable district.
  box(group, COLORS.asphalt, 0, 0.08, 208, 550, 0.1, 18);
  const palette = [0xd3ab8d, 0x93aaa6, 0x607e8c, 0xe3c4a3, 0xb98778, 0x859694];
  const windowMatrices = [];
  const transform = new THREE.Object3D();
  for (let ix = -3; ix < 3; ix++) for (let iz = -3; iz < 3; iz++) {
    const cx = ix * 64 + 32, cz = iz * 64 + 32;
    const height = 10 + rng() * (Math.abs(cx) < 80 ? 55 : 28);
    const w = 28 + rng() * 9, depth = 28 + rng() * 9;
    const color = choose(rng, palette);
    box(group, color, cx, height / 2, cz, w, height, depth);
    box(group, 0x475662, cx, height + 0.6, cz, w + 1, 1.2, depth + 1);
    box(group, 0x738082, cx + 5, height + 2, cz, 7, 3, 5);
    solids.push({ x: cx, z: cz, w: w / 2 + 0.6, d: depth / 2 + 0.6 });
    for (let y = 4; y < height - 2; y += 4.3) for (let offset = -w / 2 + 3; offset < w / 2 - 1; offset += 4) {
      for (const side of [-1, 1]) {
        transform.position.set(cx + offset, y, cz + side * (depth / 2 + 0.03));
        transform.scale.set(1.5, 2.1, 0.08); transform.updateMatrix(); windowMatrices.push(transform.matrix.clone());
        transform.position.set(cx + side * (w / 2 + 0.03), y, cz + offset);
        transform.scale.set(0.08, 2.1, 1.5); transform.updateMatrix(); windowMatrices.push(transform.matrix.clone());
      }
    }
    if ((ix + iz) % 3 === 0) label(group, choose(rng, ['SOLMAR', 'PALMA HOTEL', 'NIGHT MARKET', 'BAY RADIO', 'MARINA CLUB']), cx, 5, cz + depth / 2 + 0.12, '#ffe1a3', w - 2);
  }
  const windows = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ color: 0xacc3be, emissive: 0xffc76e, emissiveIntensity: 0.35, roughness: 0.3 }), windowMatrices.length);
  windowMatrices.forEach((m, i) => windows.setMatrixAt(i, m)); group.add(windows);
  function palm(x, z, height = 11) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.52, height, 6), material(0x997457));
    trunk.position.set(x, height / 2, z); trunk.rotation.z = 0.1; group.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const leaf = box(group, 0x4d8260, x + Math.sin(a) * 2, height, z + Math.cos(a) * 2, 1.2, 0.22, 6);
      leaf.rotation.y = a; leaf.rotation.x = 0.25;
    }
  }
  for (let x = -240; x <= 240; x += 22) palm(x, 224, 10 + rng() * 4);
  for (let i = 0; i < 45; i++) {
    const x = (Math.floor(rng() * 7) - 3) * 64 + 12;
    const z = rng() * 390 - 195; palm(x, z, 8 + rng() * 3);
  }
  for (let x = -192; x <= 192; x += 64) for (let z = -192; z <= 192; z += 64) {
    box(group, 0x52636a, x + 11, 4, z + 11, 0.22, 8, 0.22);
    box(group, 0x52636a, x + 8, 8, z + 11, 6, 0.2, 0.3);
    box(group, 0xffe9b1, x + 6, 7.9, z + 11, 2, 0.18, 1, true);
    box(group, 0x26353c, x - 10, 3, z + 9, 0.2, 6, 0.2);
    box(group, 0x1c282d, x - 10, 5.7, z + 9, 0.7, 1.6, 0.7);
    box(group, ((x + z) % 128 === 0) ? 0xf46d58 : 0x83e5a3, x - 10, 5.8, z + 9.4, 0.35, 0.35, 0.08, true);
    // Crosswalks identify intersections without expensive textures.
    for (let i = -7; i <= 7; i += 2) box(group, 0xd9d6bd, x + i, 0.17, z + 8, 1, 0.025, 2);
  }
  box(group, 0x9b7959, 0, 0.65, 261, 13, 1, 92);
  for (let z = 225; z < 306; z += 9) {
    box(group, 0x574b41, -6, 0, z, 0.8, 5, 0.8); box(group, 0x574b41, 6, 0, z, 0.8, 5, 0.8);
  }
  box(group, 0xe8bd91, 0, 3, 292, 21, 5, 12); box(group, 0x4f7d7c, 0, 6, 292, 24, 1, 15);
  label(group, 'SOLMAR PIER', 0, 6, 218, '#acffd8', 18);
  label(group, 'SOLMAR BAY', -65, 11, 215, '#ffe9b1', 27);
  const hospital = label(group, 'BAY CLINIC +', -96, 7, 15, '#b2ffe2', 24);
  hospital.rotation.y = Math.PI;
  for (let x = -210; x < 220; x += 38) {
    box(group, 0x476e72, x, 1, 219, 3, 1, 1);
    box(group, 0x476e72, x, 1.7, 219.4, 3, 1, 0.2);
    box(group, 0xffbd85, x + 4, 0.4, 240, 3, 0.2, 5);
  }
  return {
    solids, roads, group,
    blocked(x, z, radius = 0.5) {
      if (Math.abs(x) > 265 || z < -222 || z > 308) return true;
      if (z > 230 && Math.abs(x) > 6 && z > 284) return true;
      return solids.some(s => Math.abs(x - s.x) < s.w + radius && Math.abs(z - s.z) < s.d + radius);
    }
  };
}
export function person(color = 0x4d948e, police = false) {
  const root = new THREE.Group();
  box(root, police ? 0x263d60 : color, 0, 1.05, 0, 0.7, 0.8, 0.42);
  box(root, 0xc38e68, 0, 1.72, 0, 0.43, 0.45, 0.43);
  box(root, 0x28343e, 0, 1.96, -0.05, 0.49, 0.12, 0.5);
  const legs = [box(root, 0x344454, -0.2, 0.35, 0, 0.27, 0.7, 0.3), box(root, 0x344454, 0.2, 0.35, 0, 0.27, 0.7, 0.3)];
  box(root, color, -0.48, 1.02, 0, 0.22, 0.7, 0.26); box(root, color, 0.48, 1.02, 0, 0.22, 0.7, 0.26);
  root.userData.legs = legs;
  return root;
}
export function animatePerson(mesh, time, speed) {
  mesh.userData.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(time * 10 + i * Math.PI) * Math.min(speed, 1) * 0.6; });
}
