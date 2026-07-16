// Simulation harness for the vs-computer opponent. Dev tool, not a test —
// this is the instrument that tunes epsilon and keeps the balance claims in
// docs/design-vs-computer.md honest instead of asserted.
//
//   cd server && npm run sim
//
// Three modes:
//   SOLVE   how many guesses each difficulty needs to crack one secret
//   DUEL    full games through the REAL Room class (no rule duplication)
//   TIMING  worst-case per-turn compute, to check the caps are doing their job

import { Room } from '../src/rooms/Room.js';
import { calculateFeedback } from '../src/game/feedback.js';
import { mulberry32 } from '../src/game/bot/prng.js';
import { createSolver, generateSecret, type SolverOptions } from '../src/game/bot/solver.js';
import type { Rules, BotDifficulty, GuessRow } from '../../shared/types.js';

// Room picks the first guesser with Math.random(). Stub it so duel results are
// reproducible run-to-run. Dev script only — never do this in app code.
const coinFlip = mulberry32(0xc0ffee);
Math.random = coinFlip;

const R = (codeLength: number, allowRepeats: boolean, totalRounds = 10): Rules => ({
  codeLength,
  allowRepeats,
  totalRounds,
});

const label = (r: Rules) => `${r.codeLength}x10 ${r.allowRepeats ? 'repeats  ' : 'no-repeats'}`;

// ── Solve mode ──────────────────────────────────────────────────────────────

function playSolo(
  rules: Rules,
  difficulty: BotDifficulty,
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

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function solveStats(rules: Rules, difficulty: BotDifficulty, games: number, opts: SolverOptions = {}) {
  const counts: number[] = [];
  let never = 0;
  for (let i = 0; i < games; i++) {
    const secret = generateSecret(rules, mulberry32(0x5eed + i));
    const n = playSolo(rules, difficulty, secret, 0xa11ce + i, opts);
    if (n === null) never++;
    else counts.push(n);
  }
  const sorted = [...counts].sort((a, b) => a - b);
  const withinRounds = counts.filter((n) => n <= rules.totalRounds).length / games;
  return {
    mean: counts.reduce((a, b) => a + b, 0) / (counts.length || 1),
    median: pct(sorted, 50),
    p90: pct(sorted, 90),
    max: sorted[sorted.length - 1] ?? NaN,
    withinRounds,
    never,
  };
}

function runSolveMode(): void {
  console.log('\n=== SOLVE MODE — guesses needed to crack one secret ===');
  console.log('(solve% = solved within the room\'s totalRounds limit)\n');
  const header = 'rules                difficulty        n   mean  med   p90   max  solve%';
  console.log(header);
  console.log('-'.repeat(header.length));

  const configs: Array<[Rules, number]> = [
    [R(4, false), 400],
    [R(4, true), 400],
    [R(3, false), 400],
    [R(5, false), 150],
    [R(6, true), 40],
  ];

  for (const [rules, games] of configs) {
    const variants: Array<[string, BotDifficulty, SolverOptions]> = [
      ['easy', 'easy', {}],
      ['medium', 'medium', {}],
      ['hard', 'hard', {}],
    ];
    for (const [name, difficulty, opts] of variants) {
      const s = solveStats(rules, difficulty, games, opts);
      console.log(
        `${label(rules).padEnd(20)} ${name.padEnd(16)} ${String(games).padStart(4)} ` +
          `${s.mean.toFixed(2).padStart(6)} ${String(s.median).padStart(4)} ` +
          `${String(s.p90).padStart(5)} ${String(s.max).padStart(5)} ` +
          `${(s.withinRounds * 100).toFixed(0).padStart(6)}%`
      );
    }
    console.log('');
  }
}

// ── Knob sweep ──────────────────────────────────────────────────────────────

/**
 * The tuning table: what memory depth costs the bot in guesses. A real average
 * human needs ~7-8 guesses on 4x10 no-repeats, so a "fair" medium has to land
 * near that — this table is what chose k=3.
 *
 * memory=999 keeps the whole history, i.e. plain full elimination — it is the
 * cross-check that the forgetful path degrades to the correct limit.
 */
function runSweepMode(): void {
  const rules = R(4, false, 10);
  const games = 400;
  console.log('\n=== MEMORY SWEEP — the difficulty curve ===');
  console.log(`${label(rules)}, ${games} games per row. Target for a fair medium: mean ~7-8.\n`);
  console.log('knob                     mean   med   p90   max  solve%');
  console.log('-'.repeat(55));

  const rows: Array<[string, BotDifficulty, SolverOptions]> = [
    ['memory=1 (easy)', 'easy', { memoryDepth: 1 }],
    ['memory=2', 'easy', { memoryDepth: 2 }],
    ['memory=3 (medium)', 'easy', { memoryDepth: 3 }],
    ['memory=4', 'easy', { memoryDepth: 4 }],
    ['memory=5', 'easy', { memoryDepth: 5 }],
    ['memory=6', 'easy', { memoryDepth: 6 }],
    ['memory=all', 'easy', { memoryDepth: 999 }],
    ['greedy (hard)', 'hard', {}],
  ];

  for (const [name, difficulty, opts] of rows) {
    const s = solveStats(rules, difficulty, games, opts);
    console.log(
      `${name.padEnd(24)} ${s.mean.toFixed(2).padStart(5)} ${String(s.median).padStart(5)} ` +
        `${String(s.p90).padStart(5)} ${String(s.max).padStart(4)} ${(s.withinRounds * 100).toFixed(0).padStart(6)}%`
    );
  }
}

// ── Duel mode ───────────────────────────────────────────────────────────────

/**
 * A full game driven through the real Room, so turn order, the tiebreaker and
 * round exhaustion are the shipped rules rather than a copy of them.
 */
function duel(
  rules: Rules,
  a: { difficulty: BotDifficulty; opts: SolverOptions },
  b: { difficulty: BotDifficulty; opts: SolverOptions },
  seed: number
): 'A' | 'B' | 'draw' {
  const room = new Room('SIM0');
  room.addPlayer('A', 'A');
  room.addPlayer('B', 'B');
  room.updateRules('A', rules);

  const prngA = mulberry32(seed * 2 + 1);
  const prngB = mulberry32(seed * 2 + 2);
  const solvers = {
    A: createSolver(rules, a.difficulty, prngA, a.opts),
    B: createSolver(rules, b.difficulty, prngB, b.opts),
  };

  room.toggleReady('A');
  room.toggleReady('B'); // -> setting_secret
  room.submitSecret('A', generateSecret(rules, prngA));
  room.submitSecret('B', generateSecret(rules, prngB)); // -> in_progress

  let guard = 0;
  while (room.state.phase === 'in_progress' && guard++ < 500) {
    const turn = room.state.currentTurnPlayerId as 'A' | 'B';
    const solver = solvers[turn];
    const guess = solver.nextGuess();
    const res = room.submitGuess(turn, guess);
    if ('error' in res) throw new Error(`submitGuess rejected: ${res.error}`);
    solver.observe(guess, { exact: res.result.exact, partial: res.result.partial });
  }

  if (room.state.isDraw) return 'draw';
  return room.state.winnerId as 'A' | 'B';
}

function runDuelMode(): void {
  console.log('\n=== DUEL MODE — full games through the real Room ===');
  console.log('Human proxies are a MODEL, not measured humans. They are pinned');
  console.log('to guess-count: a player who needs ~7.5 guesses plays like a bot');
  console.log('that needs ~7.5. Read the trend, not the decimal — the real check');
  console.log('is the manual playtest.\n');

  const rules = R(4, false, 10);
  const games = 300;

  // Anchored on the sweep table: memory=2 -> 13.2 guesses, memory=3 -> 7.5,
  // memory=5 -> 5.5. Typical human play on 4x10 no-repeats is ~7-8 guesses.
  const humans: Array<[string, SolverOptions]> = [
    ['casual   (~13 guesses)', { memoryDepth: 2 }],
    ['average  (~7.5 guesses)', { memoryDepth: 3 }],
    ['focused  (~5.5 guesses)', { memoryDepth: 5 }],
  ];
  const bots: Array<[string, BotDifficulty, SolverOptions]> = [
    ['easy', 'easy', {}],
    ['medium', 'medium', {}],
    ['hard', 'hard', {}],
  ];

  const header = `${label(rules)}, ${rules.totalRounds} rounds, ${games} games each`;
  console.log(header);
  console.log('human proxy           vs bot     human win%   draw%   bot win%');
  console.log('-'.repeat(66));

  for (const [hName, hOpts] of humans) {
    for (const [bName, bDiff, bOpts] of bots) {
      let hw = 0;
      let bw = 0;
      let dr = 0;
      for (let i = 0; i < games; i++) {
        const r = duel(rules, { difficulty: 'medium', opts: hOpts }, { difficulty: bDiff, opts: bOpts }, i);
        if (r === 'draw') dr++;
        else if (r === 'A') hw++;
        else bw++;
      }
      console.log(
        `${hName.padEnd(21)} ${bName.padEnd(10)} ${((hw / games) * 100).toFixed(1).padStart(9)}% ` +
          `${((dr / games) * 100).toFixed(1).padStart(7)}% ${((bw / games) * 100).toFixed(1).padStart(9)}%`
      );
    }
    console.log('');
  }
}

// ── Timing mode ─────────────────────────────────────────────────────────────

function runTimingMode(): void {
  console.log('\n=== TIMING — hard bot, worst single-turn compute ===');
  console.log('Must stay well under the 1.2-2.8s think delay it hides behind.\n');
  console.log('rules                 turns  worst(ms)  total(ms)');
  console.log('-'.repeat(50));

  for (const rules of [R(4, false), R(4, true), R(5, false), R(5, true), R(6, false), R(6, true)]) {
    const secret = generateSecret(rules, mulberry32(1));
    const solver = createSolver(rules, 'hard', mulberry32(2));
    let worst = 0;
    let total = 0;
    let turns = 0;
    for (let i = 0; i < 12; i++) {
      const t0 = performance.now();
      const guess = solver.nextGuess();
      const dt = performance.now() - t0;
      worst = Math.max(worst, dt);
      total += dt;
      turns++;
      const fb = calculateFeedback(guess, secret, rules.allowRepeats);
      if (fb.exact === rules.codeLength) break;
      solver.observe(guess, fb);
    }
    console.log(
      `${label(rules).padEnd(21)} ${String(turns).padStart(5)} ${worst.toFixed(1).padStart(10)} ${total.toFixed(1).padStart(10)}`
    );
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

const mode = process.argv[2] ?? 'all';
const started = performance.now();
if (mode === 'all' || mode === 'solve') runSolveMode();
if (mode === 'all' || mode === 'sweep') runSweepMode();
if (mode === 'all' || mode === 'duel') runDuelMode();
if (mode === 'all' || mode === 'timing') runTimingMode();
console.log(`\ndone in ${((performance.now() - started) / 1000).toFixed(1)}s`);
