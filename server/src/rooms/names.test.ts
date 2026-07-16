// Tests for shared/names.ts. They live here rather than beside the module
// because shared/ has no dev dependencies and no test runner of its own, and
// the server is the consumer that matters — it performs the collision re-roll.
import { describe, it, expect } from 'vitest';
import {
  NAME_ADJECTIVES,
  NAME_NOUNS,
  NAME_SPACE_SIZE,
  generateName,
  uniqueNickname,
} from '../../../shared/names.js';

/** Cycles a fixed sequence so a "random" roll can be pinned. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('generateName', () => {
  it('is [adjective] [noun] drawn from the wordlists', () => {
    for (let i = 0; i < 200; i++) {
      const [adj, noun] = generateName().split(' ');
      expect(NAME_ADJECTIVES).toContain(adj as (typeof NAME_ADJECTIVES)[number]);
      expect(NAME_NOUNS).toContain(noun as (typeof NAME_NOUNS)[number]);
    }
  });

  it('offers 625 combinations', () => {
    expect(NAME_SPACE_SIZE).toBe(625);
    expect(NAME_ADJECTIVES).toHaveLength(25);
    expect(NAME_NOUNS).toHaveLength(25);
  });

  it('has no duplicate words to waste the space', () => {
    expect(new Set(NAME_ADJECTIVES).size).toBe(NAME_ADJECTIVES.length);
    expect(new Set(NAME_NOUNS).size).toBe(NAME_NOUNS.length);
  });

  it('follows the injected rng', () => {
    expect(generateName(seq([0, 0]))).toBe(`${NAME_ADJECTIVES[0]} ${NAME_NOUNS[0]}`);
    expect(generateName(seq([0.999999, 0.999999]))).toBe(
      `${NAME_ADJECTIVES[24]} ${NAME_NOUNS[24]}`
    );
  });

  it('spreads across the space rather than clumping', () => {
    const seen = new Set(Array.from({ length: 400 }, () => generateName()));
    expect(seen.size).toBeGreaterThan(150);
  });
});

describe('uniqueNickname', () => {
  it('passes a free name straight through', () => {
    expect(uniqueNickname('Static Owl', ['Rogue Fox'])).toBe('Static Owl');
  });

  it('passes through when the room is empty', () => {
    expect(uniqueNickname('Static Owl', [])).toBe('Static Owl');
  });

  it('re-rolls a clash to a different, valid name', () => {
    const result = uniqueNickname('Static Owl', ['Static Owl']);
    expect(result).not.toBe('Static Owl');
    const [adj, noun] = result.split(' ');
    expect(NAME_ADJECTIVES).toContain(adj as (typeof NAME_ADJECTIVES)[number]);
    expect(NAME_NOUNS).toContain(noun as (typeof NAME_NOUNS)[number]);
  });

  it('re-rolls typed names too — two "bob"s in one room is the thing being avoided', () => {
    const result = uniqueNickname('bob', ['bob']);
    expect(result).not.toBe('bob');
  });

  it('does not re-roll into a name that is also taken', () => {
    // rng keeps offering the first name, which is already in the room; the
    // second roll must be what lands.
    const rng = seq([0, 0, 0, 0, 0.999999, 0.999999]);
    const first = `${NAME_ADJECTIVES[0]} ${NAME_NOUNS[0]}`;
    const result = uniqueNickname('bob', ['bob', first], rng);
    expect(result).not.toBe('bob');
    expect(result).not.toBe(first);
  });

  it('falls back to a suffix if every roll clashes', () => {
    // Everything the generator can produce is taken.
    const everything: string[] = ['bob'];
    for (const a of NAME_ADJECTIVES) for (const n of NAME_NOUNS) everything.push(`${a} ${n}`);
    expect(uniqueNickname('bob', everything)).toBe('bob 2');
  });

  it('walks the suffix until it finds a gap', () => {
    const everything: string[] = ['bob', 'bob 2'];
    for (const a of NAME_ADJECTIVES) for (const n of NAME_NOUNS) everything.push(`${a} ${n}`);
    expect(uniqueNickname('bob', everything)).toBe('bob 3');
  });
});
