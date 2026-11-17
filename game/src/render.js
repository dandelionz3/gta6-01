import * as THREE from 'three';
export function createRender() {
  const canvas = document.querySelector('#game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeab89b);
  scene.fog = new THREE.Fog(0xeab89b, 110, 480);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.2, 950);
  scene.add(new THREE.HemisphereLight(0xa9deed, 0x8b6549, 2.4));
  const sun = new THREE.DirectionalLight(0xffd1a0, 3.3);
  sun.position.set(-100, 180, 80); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, far: 450 });
  sun.shadow.bias = -0.001;
  scene.add(sun); scene.add(sun.target);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 v; void main(){float h=clamp(normalize(v).y*1.7,0.,1.);gl_FragColor=vec4(mix(vec3(1.,.67,.46),vec3(.23,.52,.68),h),1.);}'
  }));
  scene.add(sky);
  const disk = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe7ac }));
  disk.position.set(-330, 95, 390); scene.add(disk);
  const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  window.addEventListener('resize', resize); resize();
  return { canvas, renderer, scene, camera, sun };
}
