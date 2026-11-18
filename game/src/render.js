// Renderer, scene and lighting for Solmar Bay.
// Late-afternoon sun, a gradient sky dome, warm fog and soft shadows.
// The camera is owned by main.js; this module only builds the stage.

import * as THREE from 'three';
import { CFG } from './config.js';

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e5f8a');
  grad.addColorStop(0.45, '#7a8fb0');
  grad.addColorStop(0.68, '#ff9a52');
  grad.addColorStop(0.8, '#ffb27a');
  grad.addColorStop(1, '#3a2a22');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRender(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffb27a, 90, 480);

  // sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(720, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // low sun disc on the western horizon
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sunDisc.position.set(-420, 95, 260);
  sunDisc.lookAt(0, 40, 0);
  scene.add(sunDisc);

  const hemi = new THREE.HemisphereLight(0xffe0b8, 0x3a4a3a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(CFG.palette.sun, 1.9);
  sun.position.set(-150, 85, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -230;
  sun.shadow.camera.right = 230;
  sun.shadow.camera.top = 230;
  sun.shadow.camera.bottom = -230;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1500);
  camera.position.set(0, 8, -14);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, resize };
}
