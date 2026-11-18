// City generation for Solmar Bay: road grid, buildings, beach + pier,
// palms, lamps, traffic lights and street props. Shared geometries and
// materials keep draw calls modest. Returns colliders + road data.

import * as THREE from "three";
import { COLORS, WORLD } from "./config.js";

const PITCH = WORLD.blockSize + WORLD.roadWidth; // 56
const HALF = WORLD.gridHalf;

function roadCoord(i) {
  return i * PITCH;
}

export function isOnRoad(x, z) {
  // True when the point sits on an avenue (vertical road) or street.
  for (let i = -HALF; i <= HALF; i++) {
    const c = roadCoord(i);
    if (Math.abs(x - c) <= WORLD.roadWidth / 2 + 1) return true;
    if (Math.abs(z - c) <= WORLD.roadWidth / 2 + 1) return true;
  }
  return false;
}

export function nearestRoadPoint(x, z) {
  let bestX = x;
  let bestZ = z;
  let best = Infinity;
  for (let i = -HALF; i <= HALF; i++) {
    const c = roadCoord(i);
    const dx = Math.abs(x - c);
    if (dx < best) { best = dx; bestX = c; bestZ = z; }
    const dz = Math.abs(z - c);
    if (dz < best) { best = dz; bestX = x; bestZ = c; }
  }
  return { x: bestX, z: bestZ };
}

export function buildCity(scene, rng) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const buildings = [];
  const group = new THREE.Group();
  group.name = "city";
  scene.add(group);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.09, 0.13, 1, 6);
  const sphereGeo = new THREE.SphereGeometry(0.5, 8, 6);

  const asphaltMat = new THREE.MeshLambertMaterial({ color: COLORS.asphalt });
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  const sandMat = new THREE.MeshLambertMaterial({ color: COLORS.sand });
  const seaMat = new THREE.MeshLambertMaterial({ color: COLORS.sea });
  const pierMat = new THREE.MeshLambertMaterial({ color: COLORS.pierWood });
  const grassMat = new THREE.MeshLambertMaterial({ color: COLORS.grass });
  const trunkMat = new THREE.MeshLambertMaterial({ color: COLORS.palmTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: COLORS.palmLeaf });
  const lampMat = new THREE.MeshLambertMaterial({ color: COLORS.lampPost });
  const litMat = new THREE.MeshBasicMaterial({ color: COLORS.windowLit });
  const darkMat = new THREE.MeshLambertMaterial({ color: COLORS.windowDark });
  const wallMats = COLORS.buildingPalette.map(
    (c) => new THREE.MeshLambertMaterial({ color: c }),
  );

  function addBox(mat, w, h, d, x, y, z, parent = group) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  // Ground slab (grass base under everything).
  addBox(grassMat, WORLD.cityHalf * 2 + 160, 0.5, WORLD.cityHalf * 2 + 220, 0, -0.3, 40);

  // Roads: one long strip per avenue and per street.
  const roadLen = WORLD.cityHalf * 2 + 40;
  for (let i = -HALF; i <= HALF; i++) {
    const c = roadCoord(i);
    addBox(asphaltMat, WORLD.roadWidth, 0.2, roadLen, c, 0.02, 0, group);
    addBox(asphaltMat, roadLen, 0.2, WORLD.roadWidth, 0, 0.02, c, group);
  }

  // Sidewalk skirts around every block.
  const block = WORLD.blockSize;
  const skirt = WORLD.roadWidth / 2 + WORLD.sidewalkWidth / 2;
  for (let gx = -HALF; gx < HALF; gx++) {
    for (let gz = -HALF; gz < HALF; gz++) {
      const cx = (gx + 0.5) * PITCH;
      const cz = (gz + 0.5) * PITCH;
      if (cz > WORLD.beachZ - 30) continue; // beach blocks stay open sand
      addBox(sidewalkMat, block + skirt * 2, 0.3, block + skirt * 2, cx, 0.08, cz, group);
    }
  }

  // Buildings: 1–3 towers per block, varied heights and colours.
  for (let gx = -HALF; gx < HALF; gx++) {
    for (let gz = -HALF; gz < HALF; gz++) {
      const cx = (gx + 0.5) * PITCH;
      const cz = (gz + 0.5) * PITCH;
      if (cz > WORLD.beachZ - 30) continue;
      // Keep the hospital corner and the central plaza open.
      if (gx === -4 && gz === -4) continue;
      if (gx === -1 && gz === -1) continue;
      const count = rng.int(1, 3);
      for (let k = 0; k < count; k++) {
        const w = rng.range(10, 18);
        const d = rng.range(10, 18);
        const h = rng.range(9, 46);
        const ox = rng.range(-8, 8);
        const oz = rng.range(-8, 8);
        const x = cx + ox;
        const z = cz + oz;
        const mat = rng.pick(wallMats);
        const tower = addBox(mat, w, h, d, x, h / 2 + 0.2, z, group);
        tower.name = "building";
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        buildings.push({ x, z, w, h, d });
        // Lit windows: a thin glowing strip near the top on taller towers.
        if (h > 20) {
          const strip = new THREE.Mesh(boxGeo, rng.chance(0.6) ? litMat : darkMat);
          strip.scale.set(w * 0.82, 1.1, 0.15);
          strip.position.set(x, h * 0.72, z + d / 2 + 0.08);
          group.add(strip);
          const strip2 = strip.clone();
          strip2.position.set(x, h * 0.45, z - d / 2 - 0.08);
          group.add(strip2);
        }
      }
    }
  }

  // Hospital (respawn point) — a low white block with a red cross slab.
  const hospMat = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xd43a2f });
  addBox(hospMat, 30, 10, 20, -196, 5.2, -196, group);
  addBox(crossMat, 6, 1.2, 1.6, -196, 10.8, -196, group);
  addBox(crossMat, 1.6, 1.2, 6, -196, 10.8, -196, group);
  colliders.push({ minX: -211, maxX: -181, minZ: -206, maxZ: -186 });

  // Beach: sand strip + sea plane south of the city.
  addBox(sandMat, WORLD.cityHalf * 2 + 60, 0.4, 60, 0, 0.1, WORLD.beachZ + 24, group);
  const sea = new THREE.Mesh(planeGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.scale.set(WORLD.cityHalf * 2 + 200, 90, 1);
  sea.position.set(0, 0.35, WORLD.seaZ + 40);
  group.add(sea);

  // Pier: wooden deck reaching into the sea, with posts.
  const pier = new THREE.Group();
  pier.name = "pier";
  group.add(pier);
  addBox(pierMat, 10, 0.6, 70, 60, 0.9, WORLD.beachZ + 55, pier);
  for (let i = 0; i < 8; i++) {
    const z = WORLD.beachZ + 26 + i * 8;
    addBox(pierMat, 0.7, 2.2, 0.7, 55.4, 0.1, z, pier);
    addBox(pierMat, 0.7, 2.2, 0.7, 64.6, 0.1, z, pier);
  }

  // Palms along the beach boulevard and scattered in plazas.
  const palmSpots = [];
  for (let x = -196; x <= 196; x += 28) palmSpots.push({ x, z: WORLD.beachZ - 12 });
  for (let i = 0; i < 14; i++) {
    palmSpots.push({ x: rng.range(-190, 190), z: rng.range(-190, 170) });
  }
  for (const s of palmSpots) {
    if (isOnRoad(s.x, s.z)) continue;
    const trunk = new THREE.Mesh(cylGeo, trunkMat);
    trunk.scale.set(1, rng.range(4, 6.5), 1);
    trunk.position.set(s.x, trunk.scale.y / 2, s.z);
    trunk.rotation.z = rng.range(-0.12, 0.12);
    group.add(trunk);
    const crown = new THREE.Mesh(sphereGeo, leafMat);
    crown.scale.set(3.4, 1.4, 3.4);
    crown.position.set(s.x, trunk.scale.y + 0.6, s.z);
    group.add(crown);
    colliders.push({ minX: s.x - 0.4, maxX: s.x + 0.4, minZ: s.z - 0.4, maxZ: s.z + 0.4 });
  }

  // Streetlights at intersections + traffic lights at the downtown crossroads.
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  for (let i = -HALF; i <= HALF; i++) {
    for (let j = -HALF; j <= HALF; j++) {
      const x = roadCoord(i) + WORLD.roadWidth / 2 + 1.2;
      const z = roadCoord(j) + WORLD.roadWidth / 2 + 1.2;
      if (z > WORLD.beachZ - 10) continue;
      const pole = new THREE.Mesh(cylGeo, lampMat);
      pole.scale.set(1, 7, 1);
      pole.position.set(x, 3.5, z);
      group.add(pole);
      const head = new THREE.Mesh(sphereGeo, lampHeadMat);
      head.scale.set(0.7, 0.45, 0.7);
      head.position.set(x, 7.1, z);
      group.add(head);
    }
  }
  const lightMats = {
    red: new THREE.MeshBasicMaterial({ color: 0xe03030 }),
    green: new THREE.MeshBasicMaterial({ color: 0x2fd35f }),
    amber: new THREE.MeshBasicMaterial({ color: 0xffb020 }),
  };
  const trafficLights = [];
  for (const [tx, tz] of [[0, 0], [56, 0], [0, 56], [-56, -56]]) {
    const post = new THREE.Mesh(cylGeo, lampMat);
    post.scale.set(1.4, 6, 1.4);
    post.position.set(tx + 9, 3, tz + 9);
    group.add(post);
    const lamp = new THREE.Mesh(boxGeo, lightMats.green);
    lamp.scale.set(0.9, 2.2, 0.9);
    lamp.position.set(tx + 9, 6.4, tz + 9);
    group.add(lamp);
    trafficLights.push({ mesh: lamp, mats: lightMats, x: tx, z: tz, timer: rng.range(0, 8) });
  }

  // Parked props: benches + dumpsters near the beach, crates in an alley.
  for (let i = 0; i < 10; i++) {
    const x = rng.range(-180, 180);
    const z = rng.range(150, 185);
    if (isOnRoad(x, z)) continue;
    addBox(pierMat, 2.4, 0.5, 0.8, x, 0.6, z, group);
  }

  return { group, colliders, buildings, trafficLights, roadCoord, pitch: PITCH };
}

// Resolve a circle (player / car) against building colliders.
export function collideCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 1e-6) {
        pos.x = c.maxX + radius;
      } else {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      }
      return true;
    }
  }
  return false;
}
