import { generateName } from '../../../shared/names';

const NICKNAME_KEY = 'cb_nickname';

/**
 * The guest name, generated once on first visit and kept next to cb_playerId.
 * There is no "enter a nickname" gate any more — a player always has a name,
 * and editing it is optional.
 */
export function getOrCreateNickname(): string {
  let name = localStorage.getItem(NICKNAME_KEY);
  if (!name) {
    name = generateName();
    localStorage.setItem(NICKNAME_KEY, name);
  }
  return name;
}

export function persistNickname(name: string): void {
  localStorage.setItem(NICKNAME_KEY, name);
}
