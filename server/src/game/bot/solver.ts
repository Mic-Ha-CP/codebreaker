// The vs-computer solver — a plain deterministic algorithm. No AI, no
// network, no dependencies. Design + rationale: docs/design-vs-computer.md.
//
// The solver never receives the opponent's secret. It only ever learns
// `observe(guess, feedback)`, exactly what a human sees. That is structural,
// not a convention: there is no code path by which it could cheat.
//
// Two strategies across three difficulties:
//   memory-k  keep only the k most recent feedbacks, guess randomly from what
//             survives. k is the whole difficulty curve (see the sweep table
//             in the design doc): k=1 flails, k=3 plays like a person, k>=5
//             is indistinguishable from perfect recall.
//   greedy    keep everything, then pick the guess that is expected to leave
//             the fewest candidates standing.

import type { Rules, GuessRow, BotDifficulty } from '../../../../shared/types.js';
import { randomInt } from './prng.js';

const SYMBOLS = 10; // digits 0-9

// ── Difficulty ladder ───────────────────────────────────────────────────────
// Measured on 4x10 no-repeats, 400 games each (scripts/bot-sim.ts):
//   easy   memory-1  mean 26.7 guesses, cracks it within 10 rounds  11% of the time
//   medium memory-3  mean  7.5 guesses,                             86%
//   hard   greedy    mean  5.3 guesses,                            100%
// A typical human needs ~7-8 guesses, which is why medium sits at k=3.

export type Strategy = 'memory' | 'greedy';

export interface DifficultySpec {
  strategy: Strategy;
  /** memory strategy only: how many of the most recent feedbacks still bind. */
  memoryDepth: number;
}

export const DIFFICULTY_SPEC: Record<BotDifficulty, DifficultySpec> = {
  easy: { strategy: 'memory', memoryDepth: 1 },
  medium: { strategy: 'memory', memoryDepth: 3 },
  hard: { strategy: 'greedy', memoryDepth: Number.POSITIVE_INFINITY },
};

/** Guards the difficulty coming off the wire in c:create_solo. */
export function isBotDifficulty(v: unknown): v is BotDifficulty {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DIFFICULTY_SPEC, v);
}

/** hard: max guesses scored per turn. */
export const DEFAULT_SAMPLE_CAP = 300;
/** hard: skip greedy scoring while the candidate set is larger than this. */
export const DEFAULT_GREEDY_SKIP = 20_000;

export interface SolverOptions {
  /** Override the difficulty's memory depth. Tuning + tests. */
  memoryDepth?: number;
  sampleCap?: number;
  greedySkipThreshold?: number;
}

export interface Solver {
  readonly difficulty: BotDifficulty;
  /** Codes still considered possible. Test/telemetry only. */
  candidateSnapshot(): Uint32Array;
  candidateCount(): number;
  observe(guess: GuessRow, feedback: { exact: number; partial: number }): void;
  nextGuess(): GuessRow;
}

// ── Packed codes ────────────────────────────────────────────────────────────
// A code packs into one base-10 integer, most significant digit first:
// [1,2,3,4] -> 1234. codeLength <= 6 -> max 999,999, fits a Uint32.

export function encode(code: GuessRow): number {
  let v = 0;
  for (let i = 0; i < code.length; i++) v = v * 10 + code[i];
  return v;
}

export function decode(v: number, codeLength: number): GuessRow {
  const out: number[] = new Array(codeLength);
  for (let i = codeLength - 1; i >= 0; i--) {
    out[i] = v % 10;
    v = (v / 10) | 0;
  }
  return out;
}

function decodeInto(v: number, codeLength: number, out: Uint8Array, off: number): void {
  for (let i = codeLength - 1; i >= 0; i--) {
    out[off + i] = v % 10;
    v = (v / 10) | 0;
  }
}

function countsInto(
  digits: Uint8Array,
  dOff: number,
  codeLength: number,
  counts: Uint8Array,
  cOff: number
): void {
  for (let d = 0; d < SYMBOLS; d++) counts[cOff + d] = 0;
  for (let i = 0; i < codeLength; i++) counts[cOff + digits[dOff + i]]++;
}

// ── Packed feedback ─────────────────────────────────────────────────────────
// Identical in meaning to game/feedback.ts calculateFeedback(), just
// allocation-free so it can run millions of times per turn. That equivalence
// is property-tested (solver.test.ts) — the bot must never reason by
// different rules than the referee scores by.

/** exact and partial are both <= 6, so 3 bits each. */
export const FB_BUCKETS = 64;

export function fbCode(exact: number, partial: number): number {
  return (exact << 3) | partial;
}
export function fbExact(code: number): number {
  return code >> 3;
}
export function fbPartial(code: number): number {
  return code & 7;
}

/**
 * Test seam: the exact fast path the hot loops use, on plain arrays. Exists so
 * solver.test.ts can property-test it against calculateFeedback — if these two
 * ever disagree the bot is playing a different game than the referee scores.
 */
export function feedbackFast(guess: GuessRow, secret: GuessRow): { exact: number; partial: number } {
  const L = guess.length;
  const gD = Uint8Array.from(guess);
  const sD = Uint8Array.from(secret);
  const gC = new Uint8Array(SYMBOLS);
  const sC = new Uint8Array(SYMBOLS);
  countsInto(gD, 0, L, gC, 0);
  countsInto(sD, 0, L, sC, 0);
  const code = feedbackPacked(gD, 0, gC, 0, sD, 0, sC, 0, L);
  return { exact: fbExact(code), partial: fbPartial(code) };
}

function feedbackPacked(
  gD: Uint8Array,
  gDOff: number,
  gC: Uint8Array,
  gCOff: number,
  sD: Uint8Array,
  sDOff: number,
  sC: Uint8Array,
  sCOff: number,
  codeLength: number
): number {
  let exact = 0;
  for (let i = 0; i < codeLength; i++) {
    if (gD[gDOff + i] === sD[sDOff + i]) exact++;
  }
  // Total digit overlap ignoring position; partial = overlap - exact.
  let total = 0;
  for (let d = 0; d < SYMBOLS; d++) {
    const a = gC[gCOff + d];
    const b = sC[sCOff + d];
    total += a < b ? a : b;
  }
  return (exact << 3) | (total - exact);
}

// ── Secret space ────────────────────────────────────────────────────────────

function hasDistinctDigits(v: number, codeLength: number): boolean {
  let seen = 0;
  for (let i = 0; i < codeLength; i++) {
    const bit = 1 << v % 10;
    if (seen & bit) return false;
    seen |= bit;
    v = (v / 10) | 0;
  }
  return true;
}

export function secretSpaceSize(rules: Rules): number {
  if (rules.allowRepeats) return SYMBOLS ** rules.codeLength;
  let n = 1;
  for (let i = 0; i < rules.codeLength; i++) n *= SYMBOLS - i;
  return n;
}

/**
 * Every code that could legally be a secret under `rules`. Note this respects
 * allowRepeats, because secrets do — guesses may repeat digits regardless
 * (validation.ts), which is why the guess pool is never narrowed by it.
 */
export function enumerateSecretSpace(rules: Rules): Uint32Array {
  const total = SYMBOLS ** rules.codeLength;
  const out = new Uint32Array(secretSpaceSize(rules));
  let n = 0;
  for (let v = 0; v < total; v++) {
    if (rules.allowRepeats || hasDistinctDigits(v, rules.codeLength)) out[n++] = v;
  }
  return out;
}

/** Uniform over the valid secret space, without enumerating it. */
export function generateSecret(rules: Rules, prng: () => number): GuessRow {
  const { codeLength, allowRepeats } = rules;
  if (allowRepeats) {
    const out: number[] = new Array(codeLength);
    for (let i = 0; i < codeLength; i++) out[i] = randomInt(prng, SYMBOLS);
    return out;
  }
  // Partial Fisher-Yates over 0..9 -> uniform over permutations.
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 0; i < codeLength; i++) {
    const j = i + randomInt(prng, SYMBOLS - i);
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  return pool.slice(0, codeLength);
}

// ── Solver ──────────────────────────────────────────────────────────────────

class SolverImpl implements Solver {
  readonly difficulty: BotDifficulty;

  private readonly rules: Rules;
  private readonly prng: () => number;
  private readonly L: number;
  private readonly strategy: Strategy;
  private readonly memoryDepth: number;
  private readonly sampleCap: number;
  private readonly greedySkip: number;

  // memory strategy: the full space never shrinks; each turn it is re-filtered
  // from scratch by only the most recent `memoryDepth` feedbacks into `pool`.
  private space: Uint32Array | null = null;
  private pool: Uint32Array | null = null;
  private poolCount = 0;

  // greedy strategy: the accumulated candidate set (shrinks every observe).
  private candidates: Uint32Array | null = null;
  private candCount = 0;

  private readonly history: Array<{ v: number; fb: number }> = [];
  private readonly past = new Set<number>();

  // Reusable scratch — the hot loops must not allocate.
  private readonly gD: Uint8Array;
  private readonly gC: Uint8Array;
  private readonly sD: Uint8Array;
  private readonly sC: Uint8Array;

  constructor(rules: Rules, difficulty: BotDifficulty, prng: () => number, opts: SolverOptions) {
    const spec = DIFFICULTY_SPEC[difficulty];
    this.rules = { ...rules };
    this.difficulty = difficulty;
    this.prng = prng;
    this.L = rules.codeLength;
    this.strategy = spec.strategy;
    this.memoryDepth = opts.memoryDepth ?? spec.memoryDepth;
    this.sampleCap = opts.sampleCap ?? DEFAULT_SAMPLE_CAP;
    this.greedySkip = opts.greedySkipThreshold ?? DEFAULT_GREEDY_SKIP;

    this.gD = new Uint8Array(this.L);
    this.gC = new Uint8Array(SYMBOLS);
    this.sD = new Uint8Array(this.L);
    this.sC = new Uint8Array(SYMBOLS);

    const space = enumerateSecretSpace(rules);
    if (this.strategy === 'memory') {
      this.space = space;
      this.pool = new Uint32Array(space.length);
      this.pool.set(space);
      this.poolCount = space.length;
    } else {
      this.candidates = space;
      this.candCount = space.length;
    }
  }

  candidateSnapshot(): Uint32Array {
    return this.strategy === 'memory'
      ? this.pool!.subarray(0, this.poolCount)
      : this.candidates!.subarray(0, this.candCount);
  }

  candidateCount(): number {
    return this.strategy === 'memory' ? this.poolCount : this.candCount;
  }

  observe(guess: GuessRow, feedback: { exact: number; partial: number }): void {
    const v = encode(guess);
    const fb = fbCode(feedback.exact, feedback.partial);
    this.history.push({ v, fb });
    this.past.add(v);

    if (this.strategy === 'memory') {
      // Deliberately forgetful: rebuild from the full space using only the
      // last `memoryDepth` constraints. Old clues are dropped on the floor —
      // that, and nothing else, is what separates easy from medium from a
      // player with perfect recall.
      const recent =
        this.memoryDepth >= this.history.length ? this.history : this.history.slice(-this.memoryDepth);
      this.pool!.set(this.space!);
      let n = this.space!.length;
      for (const h of recent) n = this.filterInPlace(this.pool!, n, h.v, h.fb);
      this.poolCount = n;
      return;
    }

    this.candCount = this.filterInPlace(this.candidates!, this.candCount, v, fb);
  }

  nextGuess(): GuessRow {
    if (this.strategy === 'memory') {
      return decode(this.pickRandom(this.pool!, this.poolCount), this.L);
    }

    if (this.candCount === 1) return decode(this.candidates![0], this.L);
    // Scoring the opening set is pure cost for no signal — every guess is
    // near-symmetric before any feedback. Greedy engages once it collapses.
    if (this.candCount > this.greedySkip) {
      return decode(this.pickRandom(this.candidates!, this.candCount), this.L);
    }
    return decode(this.greedyPick(), this.L);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Keeps only candidates whose feedback against `guessV` equals `expectedFb`. */
  private filterInPlace(buf: Uint32Array, count: number, guessV: number, expectedFb: number): number {
    const L = this.L;
    decodeInto(guessV, L, this.gD, 0);
    countsInto(this.gD, 0, L, this.gC, 0);

    let n = 0;
    for (let i = 0; i < count; i++) {
      const cv = buf[i];
      decodeInto(cv, L, this.sD, 0);
      countsInto(this.sD, 0, L, this.sC, 0);
      if (feedbackPacked(this.gD, 0, this.gC, 0, this.sD, 0, this.sC, 0, L) === expectedFb) {
        buf[n++] = cv;
      }
    }
    return n;
  }

  /**
   * Random pick, never re-playing a guess already made. (Greedy's accumulated
   * set already excludes past guesses — feedback(g,g) is all-exact, so a wrong
   * guess is inconsistent with its own feedback. The forgetful pool has no such
   * property, hence the explicit check.)
   */
  private pickRandom(buf: Uint32Array, count: number): number {
    if (count <= 0) return this.fallbackGuess();

    // Past guesses are a handful against thousands of candidates, so a few
    // random draws almost always land.
    for (let t = 0; t < 8; t++) {
      const v = buf[randomInt(this.prng, count)];
      if (!this.past.has(v)) return v;
    }
    // Dense exclusion: scan from a random offset instead.
    const start = randomInt(this.prng, count);
    for (let i = 0; i < count; i++) {
      const v = buf[(start + i) % count];
      if (!this.past.has(v)) return v;
    }
    return buf[0];
  }

  /**
   * Unreachable in theory: the true secret is consistent with every feedback
   * it produced, so the candidate set cannot empty out. Guard rather than
   * crash a live game.
   */
  private fallbackGuess(): number {
    return encode(generateSecret(this.rules, this.prng));
  }

  /**
   * Pick the guess that leaves the fewest candidates in expectation:
   * partition the set by feedback and minimise sum(n_i^2)/N. N is constant
   * within a turn, so sum(n_i^2) is compared directly.
   *
   * Not minimax: the pool is restricted to candidates (no non-candidate
   * probes), there is no lookahead, and the pool is sampled. That is what
   * leaves a focused human a real chance.
   */
  private greedyPick(): number {
    const L = this.L;
    const N = this.candCount;
    const cands = this.candidates!;

    // Decode once, score K times: each candidate is touched by every sampled
    // guess, so caching digits+counts turns the inner loop into pure compares.
    const dCache = new Uint8Array(N * L);
    const cCache = new Uint8Array(N * SYMBOLS);
    for (let i = 0; i < N; i++) {
      decodeInto(cands[i], L, dCache, i * L);
      countsInto(dCache, i * L, L, cCache, i * SYMBOLS);
    }

    const sample = this.sampleIndices(N, this.sampleCap);
    const buckets = new Int32Array(FB_BUCKETS);

    let bestScore = Infinity;
    const best: number[] = [];

    for (const gi of sample) {
      buckets.fill(0);
      const gDOff = gi * L;
      const gCOff = gi * SYMBOLS;
      for (let si = 0; si < N; si++) {
        buckets[
          feedbackPacked(dCache, gDOff, cCache, gCOff, dCache, si * L, cCache, si * SYMBOLS, L)
        ]++;
      }

      let score = 0;
      for (let b = 0; b < FB_BUCKETS; b++) {
        const n = buckets[b];
        score += n * n;
      }

      if (score < bestScore) {
        bestScore = score;
        best.length = 0;
        best.push(gi);
      } else if (score === bestScore) {
        best.push(gi);
      }
    }

    const chosen = best.length === 1 ? best[0] : best[randomInt(this.prng, best.length)];
    return cands[chosen];
  }

  /** Distinct indices into [0, n), capped. Collisions are rare since cap << n. */
  private sampleIndices(n: number, cap: number): number[] {
    if (n <= cap) {
      const all: number[] = new Array(n);
      for (let i = 0; i < n; i++) all[i] = i;
      return all;
    }
    const picked = new Set<number>();
    const out: number[] = [];
    while (out.length < cap) {
      const i = randomInt(this.prng, n);
      if (!picked.has(i)) {
        picked.add(i);
        out.push(i);
      }
    }
    return out;
  }
}

export function createSolver(
  rules: Rules,
  difficulty: BotDifficulty,
  prng: () => number,
  opts: SolverOptions = {}
): Solver {
  return new SolverImpl(rules, difficulty, prng, opts);
}
