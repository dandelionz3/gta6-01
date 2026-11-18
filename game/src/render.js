// Renderer, scene, camera and late-afternoon lighting for Solmar Bay.
import * as THREE from 'three';
import { CFG } from './config.js';

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#274b8f');
  grad.addColorStop(0.45, '#7a6aa8');
  grad.addColorStop(0.7, '#ff9e5e');
  grad.addColorStop(1, '#ffd9a0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8a06a, 130, 460);

  // gradient sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(720, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
  camera.position.set(0, 6, -14);

  const hemi = new THREE.HemisphereLight(0xffe0b8, 0x3a4a5a, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(CFG.colours.sun, 2.1);
  sun.position.set(-140, 150, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -230;
  sun.shadow.camera.right = 230;
  sun.shadow.camera.top = 230;
  sun.shadow.camera.bottom = -230;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, sun, hemi, sky, resize };
}
