// Solmar Bay — central tuning. Every number the rest of the game reads lives
// here so balancing never means hunting through modules.
export const CFG = {
  title: 'Solmar Bay',
  playerName: 'Rook',
  saveKey: 'solmar-bay-save-v1',

  world: {
    half: 210, // playable city radius in metres (square, -half..half)
    block: 46, // distance between road centrelines
    road: 12, // road width
    beachZ: 228, // sand starts here (south edge)
    seaZ: 252, // water plane starts here
    pierX: 60, // pier centre x
    pierZ: 262, // pier extends south into the sea
  },

  // road centrelines are at multiples of block, from -4*block to +4*block
  gridLines() {
    const out = [];
    for (let i = -4; i <= 4; i++) out.push(i * this.world.block);
    return out;
  },

  colours: {
    skyTop: 0x274b8f,
    skyMid: 0xff9e5e,
    skyLow: 0xffd9a0,
    sun: 0xffc27a,
    ground: 0x8a8f96,
    asphalt: 0x2e3138,
    sidewalk: 0x9aa0a8,
    sand: 0xe8cf9a,
    sea: 0x1e6f8e,
    seaDeep: 0x14506b,
  },

  player: {
    walk: 6,
    sprint: 10.5,
    accel: 40,
    jump: 8,
    gravity: 24,
    radius: 0.6,
    maxHealth: 100,
    regenDelay: 6, // seconds after last damage before slow regen
    regenRate: 4, // hp per second
    startCash: 250,
  },

  car: {
    accel: 17,
    brake: 34,
    reverseAccel: 10,
    drag: 0.35, // per-second speed decay factor while coasting
    steerRate: 1.9, // radians per second at full lock, scaled by speed
    maxSpeed: { sedan: 27, sports: 39, taxi: 26, van: 21, police: 35, armored: 23 },
    enterRange: 3.6,
    wreckSmokeBelow: 35,
  },

  traffic: {
    cars: 14,
    peds: 20,
    cruiseMin: 8,
    cruiseMax: 13,
    brakeGap: 7,
  },

  wanted: {
    max: 5,
    decayDelay: 9, // seconds fully unseen before a star drops
    stealInSight: 1,
    assault: 1,
    pedDown: 1,
    copKill: 2,
    arrestRange: 1.5,
    arrestTime: 1.4,
    sightRange: 46,
  },

  combat: {
    pistolAmmoStart: 24,
    pistolAmmoMax: 60,
    pistolDamage: 34,
    pistolRange: 70,
    punchDamage: 18,
    punchRange: 2.1,
    punchArc: 1.1, // radians of frontal cone
    enemyHp: 60,
    enemyDamage: 9,
    enemyShotGap: 1.6,
  },

  missions: [
    {
      id: 1, title: 'First Wheels', reward: 400,
      objective: 'Steal a car, then drive to the marker',
      steps: [
        { kind: 'steal', text: 'Steal any car (press E near one)' },
        { kind: 'goto', pos: [92, 46], text: 'Drive to the marker' },
      ],
    },
    {
      id: 2, title: 'The Package', reward: 700,
      objective: 'Collect the package and deliver it — the law is watching',
      steps: [
        { kind: 'goto', pos: [-46, 92], text: 'Pick up the package' },
        { kind: 'deliver', pos: [138, -92], text: 'Deliver the package' },
      ],
    },
    {
      id: 3, title: 'Lose the Tail', reward: 900,
      objective: 'Shake a 2-star wanted level',
      steps: [
        { kind: 'heat', stars: 2, text: 'The cops are on you — run' },
        { kind: 'clear', text: 'Lose the wanted level' },
      ],
    },
    {
      id: 4, title: 'Rooftop Deal', reward: 1400,
      objective: 'Meet the contact, survive the ambush',
      steps: [
        { kind: 'goto', pos: [-92, -46], text: 'Meet the contact on the roof street' },
        { kind: 'survive', count: 4, text: 'Survive the ambush — take them all down' },
      ],
    },
    {
      id: 5, title: 'The Big Score', reward: 2500,
      objective: 'Steal the armoured van and escape a 3-star wanted level',
      steps: [
        { kind: 'goto', pos: [0, 138], text: 'Reach the armoured van' },
        { kind: 'escape', pos: [-184, 184], text: 'Drive the van to the hideout' },
      ],
    },
  ],

  keys: {
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
    sprint: 'ShiftLeft', jump: 'Space', enter: 'KeyE', punch: 'KeyF',
    missions: 'KeyM', pause: 'Escape', mute: 'KeyP',
  },
};
