// Seeded randomness for Solmar Bay.
// Gameplay never calls Math.random or Date.now: every shuffle, spawn
// and wander target comes from one of these generators, so a given
// seed always rebuilds the same city and the same staged screenshots.

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
    this.nextFn = mulberry32(seed);
  }

  next() {
    return this.nextFn();
  }

  range(min, max) {
    return min + this.nextFn() * (max - min);
  }

  int(min, max) {
    // inclusive on both ends
    return Math.floor(this.range(min, max + 1));
  }

  pick(list) {
    return list[Math.floor(this.nextFn() * list.length)];
  }

  chance(probability) {
    return this.nextFn() < probability;
  }

  // Random point inside a rectangle, handy for scattering props.
  pointIn(minX, maxX, minZ, maxZ) {
    return { x: this.range(minX, maxX), z: this.range(minZ, maxZ) };
  }
}
