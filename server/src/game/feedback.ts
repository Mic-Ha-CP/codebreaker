import type { GuessRow } from '../../../shared/types.js';

export function calculateFeedback(
  guess: GuessRow,
  secret: GuessRow,
  _allowRepeats: boolean
): { exact: number; partial: number } {
  if (guess.length !== secret.length) {
    throw new Error('Length mismatch');
  }

  let exact = 0;
  let partial = 0;

  const guessRemaining: number[] = [];
  const secretRemaining: number[] = [];

  // Exact: same digit, same position
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) {
      exact++;
    } else {
      guessRemaining.push(guess[i]);
      secretRemaining.push(secret[i]);
    }
  }

  // Partial: digit exists but wrong position (frequency-map based)
  const freq = new Map<number, number>();
  for (const d of secretRemaining) {
    freq.set(d, (freq.get(d) ?? 0) + 1);
  }
  for (const d of guessRemaining) {
    const count = freq.get(d) ?? 0;
    if (count > 0) {
      partial++;
      freq.set(d, count - 1);
    }
  }

  return { exact, partial };
}
