import { describe, it, expect } from 'vitest';
import type { Rules, GuessRow } from '../../../../shared/types.js';
import { calculateFeedback } from '../feedback.js';
import { validateSecret } from '../validation.js';
import { mulberry32 } from './prng.js';
import {
  createSolver,
  decode,
  encode,
  enumerateSecretSpace,
  feedbackFast,
  generateSecret,
  secretSpaceSize,
  type SolverOptions,
} from './solver.js';

const R4: Rules = { codeLength: 4, allowRepeats: false, totalRounds: 10 };
const R4REP: Rules = { codeLength: 4, allowRepeats: true, totalRounds: 10 };
const R3: Rules = { codeLength: 3, allowRepeats: false, totalRounds: 10 };

/** Plays the bot against a known secret; returns guesses used, or null if it never solved. */
function playSolo(
  rules: Rules,
  difficulty: 'easy' | 'medium' | 'hard',
  secret: GuessRow,
  seed: number,
  opts: SolverOptions = {},
  maxGuesses = 60
): number | null {
  const solver = createSolver(rules, difficulty, mulberry32(seed), opts);
  for (let i = 1; i <= maxGuesses; i++) {
    const guess = solver.nextGuess();
    const fb = calculateFeedback(guess, secret, rules.allowRepeats);
    if (fb.exact === rules.codeLength) return i;
    solver.observe(guess, fb);
  }
  return null;
}

function meanSolve(
  rules: Rules,
  difficulty: 'easy' | 'medium' | 'hard',
  seeds: number,
  opts: SolverOptions = {}
): { mean: number; worst: number; solved: number } {
  let total = 0;
  let worst = 0;
  let solved = 0;
  for (let s = 0; s < seeds; s++) {
    const secret = generateSecret(rules, mulberry32(9000 + s));
    const n = playSolo(rules, difficulty, secret, 1000 + s, opts);
    if (n !== null) {
      solved++;
      total += n;
      worst = Math.max(worst, n);
    }
  }
  return { mean: solved ? total / solved : Infinity, worst, solved };
}

describe('packed codes', () => {
  it('encode/decode round-trips across lengths', () => {
    expect(encode([1, 2, 3, 4])).toBe(1234);
    expect(decode(1234, 4)).toEqual([1, 2, 3, 4]);
    // Leading zeros must survive the round-trip — 0123 packs to 123.
    expect(encode([0, 1, 2, 3])).toBe(123);
    expect(decode(123, 4)).toEqual([0, 1, 2, 3]);
    expect(decode(0, 4)).toEqual([0, 0, 0, 0]);
    expect(decode(encode([9, 9, 9, 9, 9, 9]), 6)).toEqual([9, 9, 9, 9, 9, 9]);
  });
});

describe('secret space', () => {
  it('sizes match the combinatorics', () => {
    expect(secretSpaceSize({ ...R3, allowRepeats: true })).toBe(1000);
    expect(secretSpaceSize(R3)).toBe(720);
    expect(secretSpaceSize(R4REP)).toBe(10_000);
    expect(secretSpaceSize(R4)).toBe(5040);
    expect(secretSpaceSize({ codeLength: 5, allowRepeats: false, totalRounds: 10 })).toBe(30_240);
    expect(secretSpaceSize({ codeLength: 6, allowRepeats: false, totalRounds: 10 })).toBe(151_200);
  });

  it('enumeration length matches the computed size', () => {
    expect(enumerateSecretSpace(R4).length).toBe(5040);
    expect(enumerateSecretSpace(R4REP).length).toBe(10_000);
    expect(enumerateSecretSpace(R3).length).toBe(720);
  });

  it('enumerates only codes that pass the real validateSecret', () => {
    for (const v of enumerateSecretSpace(R4)) {
      expect(validateSecret(decode(v, 4), R4)).toBeNull();
    }
  });

  it('enumeration is ascending and free of duplicates', () => {
    const space = enumerateSecretSpace(R4);
    for (let i = 1; i < space.length; i++) expect(space[i]).toBeGreaterThan(space[i - 1]);
  });
});

describe('feedbackFast === calculateFeedback', () => {
  // The solver reasons with a packed, allocation-free feedback; the referee
  // scores with game/feedback.ts. If they ever diverge the bot is solving a
  // different game than the one being played, so this is the load-bearing test.
  it('agrees on every guess/secret pair for length 3 (exhaustive, with repeats)', () => {
    // One million pairs, so the comparison is inlined and only mismatches are
    // reported — an expect() per pair costs more than the check itself.
    const mismatches: string[] = [];
    for (let g = 0; g < 1000; g++) {
      const guess = decode(g, 3);
      for (let s = 0; s < 1000; s++) {
        const secret = decode(s, 3);
        const fast = feedbackFast(guess, secret);
        const ref = calculateFeedback(guess, secret, true);
        if (fast.exact !== ref.exact || fast.partial !== ref.partial) {
          mismatches.push(
            `${guess.join('')} vs ${secret.join('')}: fast E${fast.exact}P${fast.partial} ` +
              `!== ref E${ref.exact}P${ref.partial}`
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('agrees on random pairs for lengths 4-6, including repeat-heavy guesses', () => {
    const prng = mulberry32(4242);
    const mismatches: string[] = [];
    for (const L of [4, 5, 6]) {
      for (let i = 0; i < 4000; i++) {
        // Guesses may repeat digits even when secrets may not (validation.ts),
        // so both sides are drawn from the unrestricted space.
        const guess = Array.from({ length: L }, () => Math.floor(prng() * 10));
        const secret = Array.from({ length: L }, () => Math.floor(prng() * 10));
        const fast = feedbackFast(guess, secret);
        const ref = calculateFeedback(guess, secret, true);
        if (fast.exact !== ref.exact || fast.partial !== ref.partial) {
          mismatches.push(`${guess.join('')} vs ${secret.join('')}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('generateSecret', () => {
  it('respects codeLength and allowRepeats', () => {
    for (let s = 0; s < 200; s++) {
      const noRep = generateSecret(R4, mulberry32(s));
      expect(validateSecret(noRep, R4)).toBeNull();
      expect(new Set(noRep).size).toBe(4);

      const rep = generateSecret(R4REP, mulberry32(s));
      expect(validateSecret(rep, R4REP)).toBeNull();
    }
  });

  it('is deterministic per seed and varies across seeds', () => {
    expect(generateSecret(R4, mulberry32(7))).toEqual(generateSecret(R4, mulberry32(7)));
    const distinct = new Set(
      Array.from({ length: 50 }, (_, s) => generateSecret(R4, mulberry32(s)).join(''))
    );
    expect(distinct.size).toBeGreaterThan(30);
  });

  it('covers the whole digit range', () => {
    const seen = new Set<number>();
    for (let s = 0; s < 200; s++) for (const d of generateSecret(R4REP, mulberry32(s))) seen.add(d);
    expect(seen.size).toBe(10);
  });
});

describe('determinism', () => {
  it('same seed produces the same guess sequence, for every difficulty', () => {
    const secret = [3, 1, 4, 7];
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const run = () => {
        const solver = createSolver(R4, difficulty, mulberry32(99));
        const guesses: string[] = [];
        for (let i = 0; i < 6; i++) {
          const g = solver.nextGuess();
          guesses.push(g.join(''));
          solver.observe(g, calculateFeedback(g, secret, false));
        }
        return guesses;
      };
      expect(run()).toEqual(run());
    }
  });

  it('different seeds diverge', () => {
    const a = createSolver(R4, 'medium', mulberry32(1)).nextGuess();
    const b = createSolver(R4, 'medium', mulberry32(2)).nextGuess();
    expect(a).not.toEqual(b);
  });
});

describe('candidate elimination', () => {
  /** Independently filters the whole space — the slow, obviously-correct version. */
  function bruteFilter(rules: Rules, constraints: Array<{ guess: GuessRow; exact: number; partial: number }>) {
    return Array.from(enumerateSecretSpace(rules)).filter((v) => {
      const c = decode(v, rules.codeLength);
      return constraints.every((k) => {
        const fb = calculateFeedback(k.guess, c, rules.allowRepeats);
        return fb.exact === k.exact && fb.partial === k.partial;
      });
    });
  }

  /** Runs `turns` guesses and returns the constraints the bot collected. */
  function collect(
    difficulty: 'easy' | 'medium' | 'hard',
    turns: number,
    opts: SolverOptions = {}
  ) {
    const secret = [5, 2, 8, 1];
    const solver = createSolver(R4, difficulty, mulberry32(11), opts);
    const constraints: Array<{ guess: GuessRow; exact: number; partial: number }> = [];
    for (let i = 0; i < turns; i++) {
      const g = solver.nextGuess();
      const fb = calculateFeedback(g, secret, false);
      solver.observe(g, fb);
      constraints.push({ guess: g, ...fb });
    }
    return { solver, constraints };
  }

  it('hard accumulates every constraint', () => {
    const { solver, constraints } = collect('hard', 3);
    expect(Array.from(solver.candidateSnapshot())).toEqual(bruteFilter(R4, constraints));
  });

  it('easy remembers ONLY the newest constraint (memory-1)', () => {
    const { solver, constraints } = collect('easy', 4);
    // Forgetful by design: four observations, but only the last one binds.
    expect(Array.from(solver.candidateSnapshot())).toEqual(bruteFilter(R4, constraints.slice(-1)));
  });

  it('medium remembers the newest three constraints and drops the rest', () => {
    const { solver, constraints } = collect('medium', 5);
    expect(Array.from(solver.candidateSnapshot())).toEqual(bruteFilter(R4, constraints.slice(-3)));
  });

  it('memoryDepth is the difficulty knob — depth 2 keeps exactly two', () => {
    const { solver, constraints } = collect('easy', 4, { memoryDepth: 2 });
    expect(Array.from(solver.candidateSnapshot())).toEqual(bruteFilter(R4, constraints.slice(-2)));
  });

  it('a memory depth beyond the history length is plain full elimination', () => {
    const { solver, constraints } = collect('easy', 3, { memoryDepth: 999 });
    expect(Array.from(solver.candidateSnapshot())).toEqual(bruteFilter(R4, constraints));
  });

  it('the true secret always survives, for every difficulty', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let s = 0; s < 6; s++) {
        const secret = generateSecret(R4, mulberry32(500 + s));
        const solver = createSolver(R4, difficulty, mulberry32(s));
        for (let i = 0; i < 5; i++) {
          const g = solver.nextGuess();
          const fb = calculateFeedback(g, secret, false);
          if (fb.exact === 4) break;
          solver.observe(g, fb);
          expect(Array.from(solver.candidateSnapshot())).toContain(encode(secret));
        }
      }
    }
  });

  it('never re-plays a guess it already made', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const secret = [1, 3, 5, 7];
      const solver = createSolver(R4, difficulty, mulberry32(77));
      const seen = new Set<string>();
      for (let i = 0; i < 12; i++) {
        const g = solver.nextGuess();
        const key = g.join('');
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        const fb = calculateFeedback(g, secret, false);
        if (fb.exact === 4) break;
        solver.observe(g, fb);
      }
    }
  });
});

describe('difficulty balance', () => {
  /** Share of games cracked inside the room's round limit. */
  function solveRate(difficulty: 'easy' | 'medium' | 'hard', rules: Rules, games: number): number {
    let solved = 0;
    for (let s = 0; s < games; s++) {
      const secret = generateSecret(rules, mulberry32(700 + s));
      if (playSolo(rules, difficulty, secret, s, {}, rules.totalRounds) !== null) solved++;
    }
    return solved / games;
  }

  it('hard solves 4x10 no-repeats quickly', { timeout: 60_000 }, () => {
    const { mean, worst, solved } = meanSolve(R4, 'hard', 25);
    expect(solved).toBe(25);
    expect(mean).toBeLessThan(6);
    expect(worst).toBeLessThanOrEqual(8);
  });

  // The load-bearing balance claim: medium is meant to be an even fight for a
  // player who needs ~7-8 guesses. Measured mean is 7.48 over 400 games
  // (scripts/bot-sim.ts); this pins the band it must stay inside.
  it('medium needs about as many guesses as a human does', { timeout: 60_000 }, () => {
    const { mean } = meanSolve(R4, 'medium', 150);
    expect(mean).toBeGreaterThan(6.5);
    expect(mean).toBeLessThan(8.5);
  });

  it('medium cracks it most games but not all — that gap is the human\'s chance', { timeout: 60_000 }, () => {
    const rate = solveRate('medium', R4, 150);
    expect(rate).toBeGreaterThan(0.75);
    expect(rate).toBeLessThan(0.95);
  });

  it('easy rarely solves inside the default 10 rounds', { timeout: 60_000 }, () => {
    // The point of easy is that a human beats it comfortably.
    expect(solveRate('easy', R4, 100)).toBeLessThan(0.4);
  });

  it('ranks hard < medium < easy by average guesses', { timeout: 60_000 }, () => {
    // Small space keeps this affordable; the real numbers come from the
    // simulation harness (scripts/bot-sim.ts).
    const hard = meanSolve(R3, 'hard', 120).mean;
    const medium = meanSolve(R3, 'medium', 120).mean;
    const easy = meanSolve(R3, 'easy', 120).mean;
    expect(hard).toBeLessThan(medium);
    expect(medium).toBeLessThan(easy);
  });

  it('hard handles repeats-allowed rules', { timeout: 60_000 }, () => {
    const { mean, solved } = meanSolve(R4REP, 'hard', 15);
    expect(solved).toBe(15);
    expect(mean).toBeLessThan(7);
  });
});
