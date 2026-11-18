// Solmar Bay city generation. Everything is placed from one seeded Rng,
// so seed 1 always builds the same streets, the same towers and the same
// beach — the screenshot scenes depend on that.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';

const ROAD_LINES = [-220, -165, -110, -55, 0, 55, 110, 165, 220];

// Four shared facade textures: pale wall with a window grid, some windows
// lit warm. Buildings tint them with their own colour.
function makeFacadeTexture(rng, variant) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#cfc8bd';
  g.fillRect(0, 0, 128, 256);
  const cols = 4 + variant;
  const rows = 9 + variant * 2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng.chance(0.42);
      g.fillStyle = lit ? '#ffd27a' : '#33414f';
      g.fillRect(8 + x * (112 / cols), 10 + y * (236 / rows), 112 / cols - 6, 236 / rows - 7);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Push a circle (x, z, radius) out of every overlapping AABB collider.
export function collideCircle(pos, radius, colliders) {
  for (const b of colliders) {
    const nx = Math.max(b.x0, Math.min(pos.x, b.x1));
    const nz = Math.max(b.z0, Math.min(pos.z, b.z1));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Dead centre inside the box: shove out along the smallest axis.
        const pushL = pos.x - b.x0 + radius;
        const pushR = b.x1 - pos.x + radius;
        const pushT = pos.z - b.z0 + radius;
        const pushB = b.z1 - pos.z + radius;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) pos.x = b.x0 - radius;
        else if (m === pushR) pos.x = b.x1 + radius;
        else if (m === pushT) pos.z = b.z0 - radius;
        else pos.z = b.z1 + radius;
      }
    }
  }
}

export function buildCity(scene, seed = 1337) {
  const rng = new Rng(seed);
  const W = CFG.world;
  const P = CFG.palette;
  const colliders = [];
  const roads = [];
  const trafficLights = [];
  const parkedSpots = [];

  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const matGround = new THREE.MeshLambertMaterial({ color: P.ground });
  const matRoad = new THREE.MeshLambertMaterial({ color: P.road });
  const matWalk = new THREE.MeshLambertMaterial({ color: P.sidewalk });
  const matSand = new THREE.MeshLambertMaterial({ color: P.sand });
  const matSea = new THREE.MeshLambertMaterial({ color: P.sea });
  const matTrunk = new THREE.MeshLambertMaterial({ color: P.palmTrunk });
  const matLeaf = new THREE.MeshLambertMaterial({ color: P.palmLeaf });
  const matPole = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const matWood = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });

  // --- ground, beach, sea ---------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(640, 640), matGround);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -20);
  group.add(ground);

  const sand = new THREE.Mesh(new THREE.PlaneGeometry(500, 56), matSand);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, (W.beachStart + W.seaStart) / 2);
  group.add(sand);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(760, 220), matSea);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.05, W.seaStart + 110);
  group.add(sea);

  // --- roads + sidewalks + dashes --------------------------------------
  const roadLen = W.half * 2 + 10;
  for (const x of ROAD_LINES) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(W.roadWidth, roadLen), matRoad);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.02, 0);
    group.add(r);
    roads.push({ x0: x, z0: -W.half, x1: x, z1: W.half });
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(W.sidewalkWidth, roadLen),
        matWalk,
      );
      s.rotation.x = -Math.PI / 2;
      s.position.set(x + side * (W.roadWidth / 2 + W.sidewalkWidth / 2), 0.035, 0);
      group.add(s);
    }
  }
  for (const z of ROAD_LINES) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, W.roadWidth), matRoad);
    r.rotation.x = -Math.PI / 2;
    r.position.set(0, 0.02, z);
    group.add(r);
    roads.push({ x0: -W.half, z0: z, x1: W.half, z1: z });
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(roadLen, W.sidewalkWidth),
        matWalk,
      );
      s.rotation.x = -Math.PI / 2;
      s.position.set(0, 0.035, z + side * (W.roadWidth / 2 + W.sidewalkWidth / 2));
      group.add(s);
    }
  }
  // Centre dashes, one instanced mesh for the whole grid.
  const dashGeo = new THREE.PlaneGeometry(0.35, 3.2);
  const dashMat = new THREE.MeshBasicMaterial({ color: P.roadLine });
  const dashCount = ROAD_LINES.length * 2 * Math.floor(roadLen / 8);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3(1, 1, 1);
  let di = 0;
  for (const x of ROAD_LINES) {
    for (let z = -W.half; z < W.half; z += 8) {
      e.set(-Math.PI / 2, 0, 0);
      q.setFromEuler(e);
      v3.set(x, 0.045, z);
      m4.compose(v3, q, s3);
      dashes.setMatrixAt(di++, m4);
    }
  }
  for (const z of ROAD_LINES) {
    for (let x = -W.half; x < W.half; x += 8) {
      e.set(-Math.PI / 2, 0, Math.PI / 2);
      q.setFromEuler(e);
      v3.set(x, 0.045, z);
      m4.compose(v3, q, s3);
      dashes.setMatrixAt(di++, m4);
    }
  }
  dashes.count = di;
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // --- buildings ---------------------------------------------------------
  const facadeTex = [0, 1, 2, 3].map((v) => makeFacadeTexture(rng.fork(10 + v), v));
  const facadeMats = facadeTex.map(
    (tex) =>
      new THREE.MeshLambertMaterial({
        map: tex,
        emissive: 0xffc46b,
        emissiveMap: tex,
        emissiveIntensity: 0.5,
      }),
  );
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x55504a });

  const mids = [];
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    mids.push((ROAD_LINES[i] + ROAD_LINES[i + 1]) / 2);
  }
  const plaza = { x: 27.5, z: 27.5 };   // open square, mission 1 marker
  const carPark = { x: 137.5, z: -137.5 }; // open lot, mission 4 ambush
  for (const bx of mids) {
    for (const bz of mids) {
      if (bz > 170) continue; // beach blocks stay empty
      if (bx === plaza.x && bz === plaza.z) continue;
      if (bx === carPark.x && bz === carPark.z) continue;
      const downtown = Math.abs(bx) < 110 && Math.abs(bz) < 110;
      const count = rng.int(W.blockMin, W.blockMax);
      for (let i = 0; i < count; i++) {
        const w = rng.range(11, 20);
        const d = rng.range(11, 20);
        const h = downtown ? rng.range(20, 68) : rng.range(9, 26);
        const px = bx + rng.range(-14, 14);
        const pz = bz + rng.range(-14, 14);
        const mat = facadeMats[rng.int(0, facadeMats.length - 1)].clone();
        mat.color.setHex(rng.pick(P.building));
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(px, h / 2, pz);
        group.add(b);
        if (rng.chance(0.55)) {
          const roof = new THREE.Mesh(roofGeo, roofMat);
          roof.scale.set(rng.range(2, 4), rng.range(1, 2.2), rng.range(2, 4));
          roof.position.set(px + rng.range(-2, 2), h + roof.scale.y / 2, pz + rng.range(-2, 2));
          group.add(roof);
        }
        colliders.push({ x0: px - w / 2 - 0.3, z0: pz - d / 2 - 0.3, x1: px + w / 2 + 0.3, z1: pz + d / 2 + 0.3 });
      }
    }
  }

  // Central plaza: paved disc + fountain.
  const plazaMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 0.25, 28), plazaMat);
  disc.position.set(plaza.x, 0.12, plaza.z);
  group.add(disc);
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4.5, 1.1, 20),
    new THREE.MeshLambertMaterial({ color: 0x6b7d8a }),
  );
  fountain.position.set(plaza.x, 0.7, plaza.z);
  group.add(fountain);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.6, 0.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x3f9ec2 }),
  );
  water.position.set(plaza.x, 1.25, plaza.z);
  group.add(water);
  colliders.push({ x0: plaza.x - 4.5, z0: plaza.z - 4.5, x1: plaza.x + 4.5, z1: plaza.z + 4.5 });

  // Parking lot block: flat asphalt, painted bays, a few props.
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), matRoad);
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(carPark.x, 0.03, carPark.z);
  group.add(lot);

  // --- pier --------------------------------------------------------------
  const pierDeck = new THREE.Group();
  for (let z = W.beachStart; z < 302; z += 12) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 11.5), matWood);
    plank.position.set(0, 0.9, z + 6);
    pierDeck.add(plank);
  }
  for (let z = W.beachStart + 4; z < 302; z += 24) {
    for (const side of [-4.2, 4.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.4, 8), matWood);
      post.position.set(side, 0.2, z);
      pierDeck.add(post);
    }
  }
  // Little shack at the pier end.
  const shack = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 5), new THREE.MeshLambertMaterial({ color: 0x8a6b4a }));
  shack.position.set(0, 2.6, 296);
  pierDeck.add(shack);
  const shackRoof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 6), new THREE.MeshLambertMaterial({ color: 0x5a3a2a }));
  shackRoof.position.set(0, 4.5, 296);
  pierDeck.add(shackRoof);
  group.add(pierDeck);

  // --- palms ---------------------------------------------------------------
  const palmSpots = [];
  for (let x = -220; x <= 220; x += 18) {
    if (rng.chance(0.75)) palmSpots.push({ x: x + rng.range(-4, 4), z: rng.range(206, 244) });
  }
  for (let i = 0; i < 16; i++) {
    const along = rng.pick(ROAD_LINES);
    const t = rng.range(-200, 200);
    if (rng.chance(0.5)) palmSpots.push({ x: along + 9, z: t });
    else palmSpots.push({ x: t, z: along + 9 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.4, 7);
  const crownGeo = new THREE.IcosahedronGeometry(2.1, 0);
  for (const p of palmSpots) {
    const trunk = new THREE.Mesh(trunkGeo, matTrunk);
    trunk.position.set(p.x, 2.7, p.z);
    trunk.rotation.z = rng.range(-0.08, 0.08);
    group.add(trunk);
    const crown = new THREE.Mesh(crownGeo, matLeaf);
    crown.scale.set(1.4, 0.55, 1.4);
    crown.position.set(p.x, 5.7, p.z);
    group.add(crown);
  }

  // --- streetlights --------------------------------------------------------
  const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      if ((x + z) % 110 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6), matPole);
      pole.position.set(x + 7.4, 3.2, z + 7.4);
      group.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), matPole);
      arm.position.set(x + 6.2, 6.3, z + 7.4);
      group.add(arm);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x + 5.1, 6.2, z + 7.4);
      group.add(lamp);
    }
  }

  // --- traffic lights at the big downtown intersections -------------------
  const tlRed = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  const tlAmber = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  const tlGreen = new THREE.MeshBasicMaterial({ color: 0x2aff66 });
  const tlOff = new THREE.MeshBasicMaterial({ color: 0x331515 });
  const tlBoxMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const [x, z] of [[-55, -55], [0, -55], [55, -55], [-55, 0], [55, 0], [-55, 55], [0, 55], [55, 55]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5.6, 6), matPole);
    pole.position.set(x + 6.4, 2.8, z - 6.4);
    group.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.7, 0.55), tlBoxMat);
    box.position.set(x + 6.4, 5.6, z - 6.4);
    group.add(box);
    const lamps = [];
    [[0xff2a22, 0.55], [0xffb020, 0], [0x2aff66, -0.55]].forEach(([col, dy], i) => {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 6),
        i === 2 ? tlGreen : tlOff,
      );
      lamp.position.set(x + 6.4, 5.6 + dy, z - 6.1);
      lamp.userData.onMat = i === 0 ? tlRed : i === 1 ? tlAmber : tlGreen;
      lamp.userData.offMat = tlOff;
      lamp.userData.phase = i;
      group.add(lamp);
      lamps.push(lamp);
    });
    trafficLights.push({ x, z, lamps, timer: rng.range(0, 6), phase: 0 });
  }

  // --- props: hydrants, benches, dumpsters --------------------------------
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xb02020 });
  for (let i = 0; i < 14; i++) {
    const x = rng.pick(ROAD_LINES) + 8.6;
    const z = rng.range(-210, 190);
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.9, 8), hydMat);
    hyd.position.set(x, 0.45, z);
    group.add(hyd);
  }
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  for (let i = 0; i < 12; i++) {
    const bx = rng.pick(ROAD_LINES) + rng.pick([-8.6, 8.6]);
    const bz = rng.range(-210, 190);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.7), benchMat);
    bench.position.set(bx, 0.45, bz);
    group.add(bench);
  }
  const dumpMat = new THREE.MeshLambertMaterial({ color: 0x2f5d3a });
  for (let i = 0; i < 8; i++) {
    const bx = rng.pick(mids) + rng.range(-16, 16);
    const bz = rng.pick(mids) + rng.range(-16, 16);
    if (bz > 170) continue;
    const dump = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.3), dumpMat);
    dump.position.set(bx, 0.7, bz);
    group.add(dump);
    colliders.push({ x0: bx - 1.2, z0: bz - 0.65, x1: bx + 1.2, z1: bz + 0.65 });
  }

  // --- named spots the missions and screenshots use -----------------------
  const spots = {
    playerSpawn: { x: 8, z: -2, heading: Math.PI },
    plaza: { x: plaza.x, z: plaza.z },
    pierPickup: { x: 3, z: 214 },
    delivery: { x: -110, z: 110 },
    carPark: { x: carPark.x, z: carPark.z },
    vanSpot: { x: -55, z: -110 },
    hospital: { x: CFG.hospital.x, z: CFG.hospital.z },
    beachRoad: { x: -60, z: 192 },
  };
  // Parked-car bays along the kerbs.
  for (let i = 0; i < 22; i++) {
    const along = rng.pick(ROAD_LINES);
    const t = rng.range(-205, 195);
    if (rng.chance(0.5)) parkedSpots.push({ x: along + 8.2, z: t, heading: 0 });
    else parkedSpots.push({ x: t, z: along + 8.2, heading: Math.PI / 2 });
  }

  let seaPhase = 0;
  return {
    group,
    colliders,
    roads,
    trafficLights,
    parkedSpots,
    spots,
    bounds: W.half,
    update(dt) {
      seaPhase += dt;
      sea.position.y = 0.05 + Math.sin(seaPhase * 0.5) * 0.04;
      for (const tl of trafficLights) {
        tl.timer += dt;
        const cycle = tl.timer % 13.5;
        const phase = cycle < 6 ? 0 : cycle < 7.5 ? 1 : 2;
        if (phase !== tl.phase) {
          tl.phase = phase;
          for (const lamp of tl.lamps) {
            lamp.material = lamp.userData.phase === phase ? lamp.userData.onMat : lamp.userData.offMat;
          }
        }
      }
    },
  };
}
