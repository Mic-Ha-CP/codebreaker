// Guest display names — [adjective] [noun], codebreaker/terminal/spy flavoured.
//
// Lives in shared/ rather than the client because BOTH sides need it: the
// client generates a default on first visit, and the server re-rolls on the
// server side when a joiner's name collides with someone already in the room
// (a collision is only detectable there).
//
// Names are DISPLAY ONLY. Identity is always playerId — nothing may key off a
// nickname, which is exactly why re-rolling one is safe.

export const NAME_ADJECTIVES = [
  'Static', 'Rogue', 'Phantom', 'Binary', 'Silent',
  'Hidden', 'Covert', 'Amber', 'Hollow', 'Crimson',
  'Midnight', 'Encrypted', 'Glitched', 'Shadow', 'Quantum',
  'Analog', 'Vacant', 'Feral', 'Neon', 'Iron',
  'Velvet', 'Drifting', 'Zero', 'Null', 'Cipher',
] as const;

export const NAME_NOUNS = [
  'Owl', 'Signal', 'Wren', 'Fox', 'Raven',
  'Beacon', 'Falcon', 'Vector', 'Moth', 'Relay',
  'Heron', 'Circuit', 'Lynx', 'Packet', 'Sparrow',
  'Ghost', 'Otter', 'Switch', 'Magpie', 'Cascade',
  'Marten', 'Terminal', 'Finch', 'Antenna', 'Badger',
] as const;

/** 25 x 25 = 625 combinations. */
export const NAME_SPACE_SIZE = NAME_ADJECTIVES.length * NAME_NOUNS.length;

/** `rng` is injectable so tests can pin the output. */
export function generateName(rng: () => number = Math.random): string {
  const a = NAME_ADJECTIVES[Math.floor(rng() * NAME_ADJECTIVES.length) % NAME_ADJECTIVES.length];
  const n = NAME_NOUNS[Math.floor(rng() * NAME_NOUNS.length) % NAME_NOUNS.length];
  return `${a} ${n}`;
}

/**
 * The name `desired` can use in a room where `taken` are already in use.
 * Passes straight through when there is no clash; otherwise re-rolls, since
 * two identical names in one room is confusing and the name carries no
 * identity. Falls back to a suffix in the (625-combination) corner where every
 * roll clashes.
 */
export function uniqueNickname(
  desired: string,
  taken: readonly string[],
  rng: () => number = Math.random
): string {
  if (!taken.includes(desired)) return desired;

  for (let i = 0; i < 20; i++) {
    const candidate = generateName(rng);
    if (!taken.includes(candidate)) return candidate;
  }

  for (let n = 2; ; n++) {
    const candidate = `${desired} ${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}
