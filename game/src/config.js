// Solmar Bay — central tuning values. One place for every number the
// rest of the game reads, so balancing never means hunting through files.
export const CFG = {
  world: {
    half: 230,          // city extends -half..half on x and z
    roadGap: 55,        // distance between parallel roads
    roadWidth: 11,
    sidewalkWidth: 3.5,
    beachStart: 200,    // sand begins here (south edge, +z)
    seaStart: 252,      // water begins here
    blockMin: 3,        // buildings per block, min
    blockMax: 5,
  },
  palette: {
    skyTop: 0x2e5f8a,
    skyHorizon: 0xffb36b,
    sun: 0xffd9a0,
    fog: 0xe8a06a,
    ground: 0x3d4a3a,
    road: 0x2b2e33,
    roadLine: 0xd8d2b0,
    sidewalk: 0x8d8578,
    sand: 0xd9b380,
    sea: 0x1f6f8f,
    building: [0x9a8f7a, 0x7d8aa0, 0xa08a7d, 0x8a7d6b, 0x6b7d8a, 0xb09a6b, 0x5f6b7d],
    windowLit: 0xffd27a,
    windowDark: 0x2a3542,
    palmTrunk: 0x6b4a2a,
    palmLeaf: 0x2f7d3a,
  },
  player: {
    walkSpeed: 6.5,
    sprintSpeed: 11,
    accel: 42,
    jumpSpeed: 8.5,
    gravity: 22,
    health: 100,
    regenDelay: 6,      // seconds without damage before regen starts
    regenRate: 3,
    punchDamage: 12,
    punchRange: 2.4,
    punchCooldown: 0.45,
  },
  car: {
    accel: 26,
    brake: 46,
    reverseAccel: 16,
    maxSpeed: 40,
    sportsMax: 52,
    vanMax: 32,
    reverseMax: 13,
    steerMax: 0.6,
    steerSpeed: 2.4,
    drag: 0.55,
    grip: 6,
    enterRange: 3.2,
    health: 100,
    smokeBelow: 42,
    wreckBelow: 0,
  },
  traffic: {
    cars: 14,
    peds: 26,
    carSpeed: 11,
    pedSpeed: 1.4,
    fleeSpeed: 4.5,
  },
  police: {
    maxStars: 5,
    decayDelay: 9,      // seconds unseen before heat falls
    decayRate: 0.35,    // heat per second while unseen
    sightRange: 55,
    arrestRange: 1.9,
    arrestTime: 1.6,
    cruiserAtStars: 2,
    maxCruisers: 4,
    maxFootCops: 4,
    ramDamage: 9,
    bustCashLoss: 0.15,
  },
  combat: {
    pistolDamage: 26,
    pistolRange: 70,
    pistolCooldown: 0.28,
    startAmmo: 36,
    maxAmmo: 120,
    enemyHealth: 55,
    enemyDamage: 7,
    enemyRange: 42,
    enemyCooldownMin: 1.1,
    enemyCooldownMax: 2.1,
    enemyAccuracy: 0.34,
    medkitHeal: 45,
  },
  camera: {
    distance: 8.5,
    height: 3.4,
    driveDistance: 10.5,
    driveHeight: 4.2,
    minPitch: -0.12,
    maxPitch: 0.55,
  },
  keys: {
    forward: 'KeyW',
    back: 'KeyS',
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
  saveKey: 'solmar-bay-save-v1',
  hospital: { x: -82, z: 27 },
};

// The five story beats. Each entry only describes the job; the mission
// logic that drives them lives in missions.js.
export const MISSIONS = [
  {
    id: 1, name: 'First Wheels', reward: 250,
    briefing: 'Rook needs wheels. Borrow a car — permanently — and bring it to the marker.',
    objective: 'Steal any car, then drive to the marker',
  },
  {
    id: 2, name: 'The Package', reward: 450,
    briefing: 'Pick up the package from the pier and deliver it across town. The cops are already watching.',
    objective: 'Deliver the package',
  },
  {
    id: 3, name: 'Lose the Tail', reward: 600,
    briefing: 'Two stars and every cruiser in Solmar Bay is on you. Shake them off.',
    objective: 'Lose the 2-star wanted level',
  },
  {
    id: 4, name: 'Rooftop Deal', reward: 900,
    briefing: 'Meet the contact on the rooftop lot. The rivals heard about it too. Survive the ambush.',
    objective: 'Survive the ambush — take out the rivals',
  },
  {
    id: 5, name: 'The Big Score', reward: 1500,
    briefing: 'An armoured van is parked downtown. Take it, and lose a 3-star tail on the way out.',
    objective: 'Steal the armoured van and escape the 3-star wanted level',
  },
];

export const SHOTS = ['cover', 'drive', 'mission', 'chase'];
