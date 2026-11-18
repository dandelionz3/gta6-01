// Solmar Bay — one home for every tuning number in the game.
// Balancing should never mean hunting through a dozen files, so the
// speeds, colours, wanted rules, missions and keys all live here.
export const CFG = {
  title: 'Solmar Bay',
  hero: 'Rook',
  saveKey: 'solmar-bay-save-v1',

  city: {
    half: 200,          // playable square runs -200 .. +200 on x and z
    blockStep: 80,      // distance between road centrelines
    roadWidth: 14,
    beachZ: 192,        // sand starts here (south edge)
    oceanZ: 236,        // water starts here
    pierX: 0,
  },

  player: {
    walkSpeed: 6,
    sprintSpeed: 10.5,
    jumpSpeed: 8,
    gravity: 22,
    maxHealth: 100,
    regenPerSec: 2.5,
    regenDelay: 6,
    startCash: 120,
    punchDamage: 12,
    punchRange: 2.2,
  },

  car: {
    accel: 24,
    brake: 38,
    reverseAccel: 13,
    maxSpeed: 44,       // ~158 km/h
    maxReverse: 13,
    steerAngle: 0.55,
    steerSpeed: 2.2,
    drag: 0.6,
    maxHealth: 100,
    enterRange: 3.2,
  },

  wanted: {
    max: 5,
    decayDelaySec: 12,  // seconds unseen before stars start falling
    decayOnePerSec: 4,
    heat: {
      stealCarSeen: 1,
      assault: 1,
      killPed: 2,
      killCop: 3,
      shootNearCop: 1,
    },
    cruiserFromStars: 2,
    copChaseSpeed: 7.2,
    cruiserSpeed: 40,
    arrestRange: 1.6,
    arrestHoldSec: 1.4,
  },

  pistol: {
    damage: 34,
    startAmmo: 24,
    maxAmmo: 120,
    pickupAmmo: 24,
    range: 90,
    fireDelaySec: 0.22,
  },

  traffic: {
    cars: 14,
    peds: 18,
    carSpeed: 9,
    pedSpeed: 1.6,
    fleeSpeed: 4.5,
  },

  keys: {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    sprint: 'ShiftLeft',
    jump: 'Space',
    enterCar: 'KeyE',
    punch: 'KeyF',
    missionMenu: 'KeyM',
    pause: 'Escape',
    mute: 'KeyP',
  },

  missions: [
    { id: 1, name: 'First Wheels', reward: 250, blurb: 'Steal a car and bring it to the marker.' },
    { id: 2, name: 'The Package', reward: 400, blurb: 'Collect the package and deliver it while the heat is on.' },
    { id: 3, name: 'Lose the Tail', reward: 500, blurb: 'Shake a 2-star wanted level.' },
    { id: 4, name: 'Rooftop Deal', reward: 800, blurb: 'Meet the contact. Survive the ambush.' },
    { id: 5, name: 'The Big Score', reward: 1500, blurb: 'Take the armoured van and escape a 3-star tail.' },
  ],

  palette: {
    skyTop: 0x2e5f8a,
    skyHorizon: 0xff9a52,
    sun: 0xffd9a0,
    asphalt: 0x2b2f36,
    sidewalk: 0x8d8578,
    sand: 0xe0c188,
    ocean: 0x1d6f8f,
    grass: 0x4d7a3a,
    building: [0x9a8f7a, 0x7a8a99, 0xb08a6a, 0x8a7a8a, 0x6a7a6a, 0xa89a80],
    palmTrunk: 0x6b4a2a,
    palmLeaf: 0x2f7a3a,
  },

  shots: ['cover', 'drive', 'mission', 'chase'],
};

export const MISSION_NAMES = CFG.missions.map((m) => m.name);
