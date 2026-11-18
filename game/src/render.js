// Three.js renderer + scene + late-afternoon lighting + sky + fog.

import * as THREE from "three";
import { COLORS } from "./config.js";

export function createRender(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COLORS.fog, 120, 520);

  // Vertical gradient sky on a big backside sphere.
  const skyGeo = new THREE.SphereGeometry(800, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(COLORS.skyTop) },
      bottom: { value: new THREE.Color(COLORS.skyBottom) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bottom;
      varying vec3 vPos;
      void main() {
        float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Low warm sun + soft sky fill.
  const sun = new THREE.DirectionalLight(COLORS.sun, 2.4);
  sun.position.set(-140, 110, 180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -240;
  sun.shadow.camera.right = 240;
  sun.shadow.camera.top = 240;
  sun.shadow.camera.bottom = -240;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8fb4d8, 0x8a6a4a, 0.9));

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
  camera.position.set(0, 8, 14);

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  return { renderer, scene, camera, sun, onResize };
}

// Third-person follow camera with drag orbit + pitch clamp.
export function updateCamera(camera, target, yaw, pitch, dist, dt) {
  const px = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
  const pz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
  const py = target.y + 2.2 + Math.sin(pitch) * dist;
  const desired = new THREE.Vector3(px, Math.max(py, target.y + 1.2), pz);
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  camera.lookAt(target.x, target.y + 1.6, target.z);
}
