import { describe, it, expect } from 'vitest';
import { calculateFeedback } from './feedback.js';

describe('calculateFeedback', () => {
  // Cases from spec §7.1
  it('all exact', () => {
    expect(calculateFeedback([1, 2, 3, 4], [1, 2, 3, 4], false)).toEqual({
      exact: 4,
      partial: 0,
    });
  });

  it('all partial — reversed', () => {
    expect(calculateFeedback([4, 3, 2, 1], [1, 2, 3, 4], false)).toEqual({
      exact: 0,
      partial: 4,
    });
  });

  it('mixed E/P', () => {
    expect(calculateFeedback([1, 3, 2, 5], [1, 2, 3, 4], false)).toEqual({
      exact: 1,
      partial: 2,
    });
  });

  it('no matches', () => {
    expect(calculateFeedback([5, 6, 7, 8], [1, 2, 3, 4], false)).toEqual({
      exact: 0,
      partial: 0,
    });
  });

  it('allowRepeats=true with duplicates in both', () => {
    // secret=[1,1,2,2], guess=[1,2,1,2] → E=2 (positions 0 and 3), P=2
    expect(calculateFeedback([1, 2, 1, 2], [1, 1, 2, 2], true)).toEqual({
      exact: 2,
      partial: 2,
    });
  });

  it('does not double-count when guess repeats a digit only present once in secret', () => {
    // secret=[1,2,3,4], guess=[1,1,1,1] → E=1 (position 0), P=0
    expect(calculateFeedback([1, 1, 1, 1], [1, 2, 3, 4], true)).toEqual({
      exact: 1,
      partial: 0,
    });
  });

  it('partials only count up to secret frequency', () => {
    // secret=[1,2,3,4], guess=[2,2,2,2] → E=0 (no 2 at index 1 in guess? wait yes)
    // Actually secret[1]=2, guess[1]=2 → E=1; rest of 2s in guess can't match (only one 2 in secret)
    expect(calculateFeedback([2, 2, 2, 2], [1, 2, 3, 4], true)).toEqual({
      exact: 1,
      partial: 0,
    });
  });

  it('length 3 secret', () => {
    expect(calculateFeedback([1, 2, 3], [3, 2, 1], false)).toEqual({
      exact: 1,
      partial: 2,
    });
  });

  it('length 6 secret', () => {
    expect(calculateFeedback([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6], false)).toEqual({
      exact: 6,
      partial: 0,
    });
  });

  it('throws on length mismatch', () => {
    expect(() => calculateFeedback([1, 2, 3], [1, 2, 3, 4], false)).toThrow(/length/i);
  });

  it('handles 0 as a digit', () => {
    expect(calculateFeedback([0, 1, 2, 3], [0, 1, 2, 3], false)).toEqual({
      exact: 4,
      partial: 0,
    });
  });
});
