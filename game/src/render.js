// Renderer, scene, camera and lighting for Solmar Bay. Everything visual
// hangs off the objects created here; game modules only add meshes to the
// scene and move the camera through the helpers below.
import * as THREE from 'three';
import { CFG } from './config.js';

// Sunset gradient painted once onto a canvas and wrapped around the scene
// as a back-facing dome — cheaper than a shader and it never flickers.
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#274b73');
  grad.addColorStop(0.45, '#7d7ba8');
  grad.addColorStop(0.68, '#e08a5a');
  grad.addColorStop(0.82, '#ffb36b');
  grad.addColorStop(1.0, '#e8a06a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function setupRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(CFG.palette.fog, 120, 620);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({
      map: makeSkyTexture(),
      side: THREE.BackSide,
      fog: false,
    }),
  );
  scene.add(sky);

  // Low late-afternoon sun from the west, warm and long-shadowed.
  const sun = new THREE.DirectionalLight(CFG.palette.sun, 2.4);
  sun.position.set(-190, 150, -90);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x8fb4d8, 0x4a3a2a, 0.9);
  scene.add(hemi);

  // A soft fill from the east so the shadow side never goes black.
  const fill = new THREE.DirectionalLight(0x6b8ab0, 0.5);
  fill.position.set(140, 80, 120);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    1600,
  );
  camera.position.set(0, 8, 16);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, sun, hemi, resize, sky };
}

// Third-person follow camera: orbits with the drag deltas, sits behind the
// target, and eases toward its goal so it never snaps.
export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.3;
    this.distance = CFG.camera.distance;
    this.goal = new THREE.Vector3();
    this.eye = new THREE.Vector3();
  }

  applyDrag(dx, dy) {
    this.yaw -= dx * 0.005;
    this.pitch += dy * 0.004;
    this.pitch = Math.max(CFG.camera.minPitch, Math.min(CFG.camera.maxPitch, this.pitch));
  }

  update(target, dt, driving) {
    const dist = driving ? CFG.camera.driveDistance : CFG.camera.distance;
    const height = driving ? CFG.camera.driveHeight : CFG.camera.height;
    this.distance += (dist - this.distance) * Math.min(1, dt * 4);
    const cx = target.x - Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance;
    const cz = target.z - Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance;
    const cy = target.y + height + Math.sin(this.pitch) * this.distance * 0.7;
    this.goal.set(cx, cy, cz);
    // Ease the eye toward the goal; a little lag reads as weight.
    this.eye.lerp(this.goal, Math.min(1, dt * 9));
    this.camera.position.copy(this.eye);
    this.camera.lookAt(target.x, target.y + 1.6, target.z);
  }

  snap(target, driving) {
    this.update(target, 10, driving);
    this.eye.copy(this.goal);
    this.camera.position.copy(this.eye);
  }
}
