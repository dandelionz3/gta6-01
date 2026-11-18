// Seeded randomness for Solmar Bay. Gameplay never touches Math.random
// or Date.now — the same seed always builds the same city, so the staged
// screenshot scenes are reproducible shot after shot.

// mulberry32: tiny, fast, good-enough PRNG with a 32-bit state.
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

// Small convenience wrapper so call sites read like plain English.
export class Rng {
  constructor(seed = 1337) {
    this.nextFn = mulberry32(seed);
    this.seed = seed >>> 0;
  }

  // Float in [0, 1).
  next() {
    return this.nextFn();
  }

  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max] inclusive.
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  // True with probability p (0..1).
  chance(p) {
    return this.next() < p;
  }

  // One element from a non-empty array.
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  // A fresh Rng forked off this one (handy for subsystems).
  fork(salt = 1) {
    return new Rng((this.seed ^ Math.imul(salt, 2654435761)) >>> 0);
  }
}

// Deterministic pick of an element by index — used by traffic routes so
// a route never depends on call order.
export function pickAt(list, u) {
  return list[Math.floor(u * list.length) % list.length];
}
