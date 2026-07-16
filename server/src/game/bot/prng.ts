// Seeded PRNG for the vs-computer opponent.
//
// The bot must be reproducible from a seed: the simulation harness replays
// thousands of games, and the solver tests assert that the same seed yields
// the same guess sequence. Math.random() would make both impossible.

/** mulberry32 — small, fast, good enough for game randomness. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a — turns a room code (+ rematch counter) into a PRNG seed. */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Uniform integer in [0, n). The modulo guards against prng() === 1. */
export function randomInt(prng: () => number, n: number): number {
  return Math.floor(prng() * n) % n;
}

/** Uniform number in [min, max). */
export function randomRange(prng: () => number, min: number, max: number): number {
  return min + prng() * (max - min);
}
