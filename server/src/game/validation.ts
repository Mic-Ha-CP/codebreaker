import type { Rules, GuessRow } from '../../../shared/types.js';

export function validateSecret(secret: unknown, rules: Rules): string | null {
  if (!Array.isArray(secret)) return 'invalid_format';
  if (secret.length !== rules.codeLength) return 'wrong_length';
  if (!secret.every((d) => Number.isInteger(d) && d >= 0 && d <= 9)) return 'invalid_digit';
  if (!rules.allowRepeats) {
    if (new Set(secret).size !== secret.length) return 'repeats_not_allowed';
  }
  return null;
}

export function validateGuess(guess: unknown, rules: Rules): string | null {
  return validateSecret(guess, rules);
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
