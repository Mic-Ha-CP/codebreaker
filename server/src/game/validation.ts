import type { Rules, GuessRow } from '../../../shared/types.js';

function validateDigits(value: unknown, codeLength: number): string | null {
  if (!Array.isArray(value)) return 'invalid_format';
  if (value.length !== codeLength) return 'wrong_length';
  if (!value.every((d) => Number.isInteger(d) && d >= 0 && d <= 9)) return 'invalid_digit';
  return null;
}

export function validateSecret(secret: unknown, rules: Rules): string | null {
  const err = validateDigits(secret, rules.codeLength);
  if (err) return err;
  // allowRepeats applies to the secret only
  if (!rules.allowRepeats && new Set(secret as number[]).size !== (secret as number[]).length) {
    return 'repeats_not_allowed';
  }
  return null;
}

// Guesses may always contain repeated digits regardless of rules.allowRepeats.
// (Common Mastermind convention — the guesser is free to probe.)
export function validateGuess(guess: unknown, rules: Rules): string | null {
  return validateDigits(guess, rules.codeLength);
}

export function validateRules(rules: Partial<Rules>): string | null {
  if (rules.codeLength !== undefined) {
    if (rules.codeLength < 3 || rules.codeLength > 6) return 'invalid_length';
  }
  if (rules.totalRounds !== undefined) {
    if (rules.totalRounds < 5 || rules.totalRounds > 50) return 'invalid_rounds';
  }
  return null;
}
