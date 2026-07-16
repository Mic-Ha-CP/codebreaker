import type { RoomSummary } from '../../../shared/types.js';
import type { Room } from './Room.js';

/** The socket.io room every client on the Landing screen joins. */
export const LOBBY_CHANNEL = 'lobby';

/**
 * What the lobby screen is allowed to see. Private rooms are dropped entirely —
 * being unlisted IS the feature — and everything else is projected through
 * Room.toSummary(), which is a whitelist rather than a redaction.
 *
 * Sorted by display number so the list does not reshuffle under the cursor, and
 * so the broadcaster's "has anything actually changed?" check compares like
 * with like.
 */
export function buildLobbyList(rooms: Room[]): RoomSummary[] {
  return rooms
    .filter((room) => !room.state.isPrivate)
    .map((room) => room.toSummary())
    .sort((a, b) => a.displayNumber - b.displayNumber);
}
