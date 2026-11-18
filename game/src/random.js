// Seeded randomness for Solmar Bay. Gameplay never touches Math.random or
// Date.now — the same seed always builds the same city, so staged scenes and
// replays stay deterministic.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) {
    this.next = mulberry32(seed);
    this.seed = seed >>> 0;
  }
  // float in [0, 1)
  f() {
    return this.next();
  }
  // float in [a, b)
  range(a, b) {
    return a + (b - a) * this.next();
  }
  // integer in [a, b]
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  // true with probability p
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  // pick one of two values
  either(a, b) {
    return this.next() < 0.5 ? a : b;
  }
}
