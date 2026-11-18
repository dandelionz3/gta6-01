export const CITY = { extent: 260, spacing: 64, road: 18, beach: 218 };
export const COLORS = { asphalt: 0x343e4b, sand: 0xe9c596, ocean: 0x258e9e, neon: 0x7fffd4 };
export const RULES = { walk: 7, sprint: 13, acceleration: 19, maxSpeed: 42, reverse: 12, policeSight: 85, forget: 14 };
export const MISSIONS = [
  { name: 'First Wheels', intro: 'Mara: Welcome home, Rook. Borrow some wheels. Meet me at the pier.', reward: 450, target: [0, 208] },
  { name: 'The Package', intro: 'Mara: A sealed case. No questions. Collect it downtown, then bring it to the beach.', reward: 800, target: [-128, 0] },
  { name: 'Lose the Tail', intro: 'Detective Vale has your plate. Shake the patrols. Stay away from their sightlines.', reward: 1100, target: [128, 128] },
  { name: 'Rooftop Deal', intro: 'Mara: Meet my contact on the parking terrace. The Cinder crew may arrive first.', reward: 1600, target: [128, -128] },
  { name: 'The Big Score', intro: 'One last run. Take the armoured van from the north docks and disappear.', reward: 3000, target: [0, -192] }
];
export const HELP = 'WASD move / drive · Shift sprint · Space jump / handbrake · E enter / exit · F punch · Click shoot · Drag orbit · M missions · Esc pause · P sound';
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
