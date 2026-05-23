import { describe, it, expect } from 'vitest';
import { validateSecret, validateGuess, validateRules } from './validation.js';
import type { Rules } from '../../../shared/types.js';

const rules4NoRep: Rules = { codeLength: 4, allowRepeats: false, totalRounds: 10 };
const rules4Rep: Rules = { codeLength: 4, allowRepeats: true, totalRounds: 10 };
const rules3NoRep: Rules = { codeLength: 3, allowRepeats: false, totalRounds: 10 };

describe('validateSecret', () => {
  it('accepts a valid 4-digit secret', () => {
    expect(validateSecret([1, 2, 3, 4], rules4NoRep)).toBeNull();
  });

  it('rejects non-array', () => {
    expect(validateSecret('1234', rules4NoRep)).toBe('invalid_format');
    expect(validateSecret(null, rules4NoRep)).toBe('invalid_format');
    expect(validateSecret(undefined, rules4NoRep)).toBe('invalid_format');
  });

  it('rejects wrong length', () => {
    expect(validateSecret([1, 2, 3], rules4NoRep)).toBe('wrong_length');
    expect(validateSecret([1, 2, 3, 4, 5], rules4NoRep)).toBe('wrong_length');
    expect(validateSecret([1, 2, 3, 4], rules3NoRep)).toBe('wrong_length');
  });

  it('rejects out-of-range digits', () => {
    expect(validateSecret([1, 2, 3, 10], rules4NoRep)).toBe('invalid_digit');
    expect(validateSecret([1, 2, 3, -1], rules4NoRep)).toBe('invalid_digit');
    expect(validateSecret([1, 2, 3, 1.5], rules4NoRep)).toBe('invalid_digit');
    expect(validateSecret([1, 2, 3, 'x'], rules4NoRep)).toBe('invalid_digit');
  });

  it('rejects repeats when allowRepeats=false', () => {
    expect(validateSecret([1, 1, 2, 3], rules4NoRep)).toBe('repeats_not_allowed');
    expect(validateSecret([5, 5, 5, 5], rules4NoRep)).toBe('repeats_not_allowed');
  });

  it('accepts repeats when allowRepeats=true', () => {
    expect(validateSecret([1, 1, 2, 3], rules4Rep)).toBeNull();
    expect(validateSecret([5, 5, 5, 5], rules4Rep)).toBeNull();
  });
});

describe('validateGuess', () => {
  it('accepts a valid guess', () => {
    expect(validateGuess([1, 2, 3, 4], rules4NoRep)).toBeNull();
  });

  // The critical behavior: allowRepeats applies to the secret only.
  // Guesses may always contain repeated digits.
  it('accepts repeated digits even when allowRepeats=false', () => {
    expect(validateGuess([1, 1, 1, 1], rules4NoRep)).toBeNull();
    expect(validateGuess([2, 2, 3, 3], rules4NoRep)).toBeNull();
  });

  it('still rejects wrong length / format / range', () => {
    expect(validateGuess([1, 2, 3], rules4NoRep)).toBe('wrong_length');
    expect(validateGuess('abcd', rules4NoRep)).toBe('invalid_format');
    expect(validateGuess([1, 2, 3, 99], rules4NoRep)).toBe('invalid_digit');
  });
});

describe('validateRules', () => {
  it('accepts valid rules', () => {
    expect(validateRules({})).toBeNull();
    expect(validateRules({ codeLength: 4 })).toBeNull();
    expect(validateRules({ codeLength: 3 })).toBeNull();
    expect(validateRules({ codeLength: 6 })).toBeNull();
    expect(validateRules({ totalRounds: 5 })).toBeNull();
    expect(validateRules({ totalRounds: 50 })).toBeNull();
    expect(validateRules({ allowRepeats: true })).toBeNull();
  });

  it('rejects codeLength out of [3,6]', () => {
    expect(validateRules({ codeLength: 2 })).toBe('invalid_length');
    expect(validateRules({ codeLength: 7 })).toBe('invalid_length');
  });

  it('rejects totalRounds out of [5,50]', () => {
    expect(validateRules({ totalRounds: 4 })).toBe('invalid_rounds');
    expect(validateRules({ totalRounds: 51 })).toBe('invalid_rounds');
  });
});
