// Solmar Bay — shared constants for the whole game.
// Everything tunable lives here so a single edit retunes the game.

export const COLORS = {
  skyTop: 0x2e5f8a,
  skyBottom: 0xffb36b,
  sun: 0xffd9a0,
  fog: 0xe8a56b,
  asphalt: 0x2b2b30,
  sidewalk: 0x8d8578,
  sand: 0xe0c184,
  sea: 0x1d6f8e,
  pierWood: 0x7a5230,
  grass: 0x4d7a3a,
  buildingPalette: [0x9a7b5f, 0x7f8ea3, 0xb08d6a, 0x6f7f6a, 0xa89a8a, 0x8a6f7d, 0x5f7480],
  windowLit: 0xffd27a,
  windowDark: 0x2a3542,
  palmTrunk: 0x6b4a2a,
  palmLeaf: 0x3f8f3f,
  lampPost: 0x333338,
  playerJacket: 0x2e6fb0,
  playerPants: 0x22242a,
  copUniform: 0x1c2f57,
  gangJacket: 0x8a1f2d,
  beacon: 0xffc233,
  markerGreen: 0x37d67a,
};

export const WORLD = {
  blockSize: 42,
  roadWidth: 14,
  gridHalf: 4, // avenues/streets from -4..4
  cityHalf: 210,
  beachZ: 196,
  seaZ: 232,
  sidewalkWidth: 4,
};

export const PLAYER = {
  walkSpeed: 6.5,
  sprintSpeed: 10.5,
  jumpSpeed: 8.5,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
  regenPerSec: 2.5,
  regenDelaySec: 6,
  startCash: 120,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 38,
  maxReverse: 12,
  steerAngle: 0.55,
  grip: 6.5,
  enterDistance: 3.2,
  wreckHealth: 0,
  smokeBelow: 35,
};

export const WANTED = {
  decaySeconds: 14,
  decayDistance: 55,
  starsMax: 5,
  copFootSpeed: 7.2,
  cruiserSpeed: 34,
  bustDistance: 2.2,
  bustTimeSec: 2.5,
  finePerStar: 60,
  hospitalSpawn: { x: -168, z: -168 },
};

export const COMBAT = {
  punchRange: 2.1,
  punchDamage: 18,
  punchCooldown: 0.45,
  pistolDamage: 34,
  pistolRange: 90,
  pistolCooldown: 0.28,
  pistolMag: 12,
  pistolReserveStart: 48,
  enemyDamage: 9,
  enemyRange: 55,
  enemyCooldown: 1.1,
};

export const MISSIONS = [
  { id: 1, name: "First Wheels", brief: "Steal a car and drive to the marker.", reward: 250 },
  { id: 2, name: "The Package", brief: "Collect the package, then deliver it while the heat is on.", reward: 450 },
  { id: 3, name: "Lose the Tail", brief: "Shake a 2-star wanted level. Stay out of sight.", reward: 600 },
  { id: 4, name: "Rooftop Deal", brief: "Meet the contact. Rival crew ambush — survive the shootout.", reward: 900 },
  { id: 5, name: "The Big Score", brief: "Steal the armoured van and escape a 3-star wanted level.", reward: 1500 },
];

export const KEYS = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  sprint: "ShiftLeft",
  jump: "Space",
  handbrake: "Space",
  enterCar: "KeyE",
  punch: "KeyF",
  missionMenu: "KeyM",
  pause: "Escape",
  mute: "KeyP",
};

export const SHOT_NAMES = ["cover", "drive", "mission", "chase"];

export const SAVE_KEY = "solmar-bay-save-v1";
