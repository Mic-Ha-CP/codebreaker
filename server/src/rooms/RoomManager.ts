import { Room } from './Room.js';
import { generateRoomCode } from '../utils/roomCode.js';
import type { PlayerId, RoomCode, Rules } from '../../../shared/types.js';

export class RoomManager {
  private rooms = new Map<RoomCode, Room>();
  private readonly MAX_ROOMS = 5;
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private onRemove: ((code: RoomCode) => void) | null = null;
  private usedNumbers = new Set<number>();

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Fires whenever a room goes away, including via the idle sweep. Lets
   * whoever holds per-room resources release them without having to poll.
   * (Generic lifecycle, no game knowledge — the vs-computer driver uses it to
   * drop its solver state and cancel pending timers.)
   */
  onRoomRemoved(cb: (code: RoomCode) => void): void {
    this.onRemove = cb;
  }

  createRoom(
    hostId: PlayerId,
    nickname: string,
    rules?: Partial<Rules>,
    opts: { isPrivate?: boolean } = {}
  ): Room | { error: string } {
    if (this.rooms.size >= this.MAX_ROOMS) {
      return { error: 'server_full' };
    }

    let code: RoomCode;
    // Ensure unique code
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const room = new Room(code);
    const result = room.addPlayer(hostId, nickname);
    if ('error' in result) {
      return result;
    }

    if (rules) {
      room.updateRules(hostId, rules);
    }

    // Dual-track addressing. Public rooms get a short number to click in the
    // lobby; private rooms get none on purpose — a sequential number would let
    // anyone walk the list of unlisted rooms, which is the point of hiding them.
    if (opts.isPrivate) {
      room.setPrivate(true);
    } else {
      room.setDisplayNumber(this.allocateDisplayNumber());
    }

    this.rooms.set(code, room);
    return room;
  }

  /** Every live room. The lobby projection filters and maps these. */
  allRooms(): Room[] {
    return [...this.rooms.values()];
  }

  getRoom(code: RoomCode): Room | null {
    return this.rooms.get(code) ?? null;
  }

  getRoomByPlayer(playerId: PlayerId): Room | null {
    for (const room of this.rooms.values()) {
      if (room.state.players.some((p) => p.id === playerId)) {
        return room;
      }
    }
    return null;
  }

  removeRoom(code: RoomCode): void {
    const room = this.rooms.get(code);
    if (!this.rooms.delete(code)) return;
    // Free the number so the list stays tidy — #1 reopens once #1 closes.
    if (room?.state.displayNumber !== null && room?.state.displayNumber !== undefined) {
      this.usedNumbers.delete(room.state.displayNumber);
    }
    this.onRemove?.(code);
  }

  /** Lowest unused, so the visible numbers stay small and stable. */
  private allocateDisplayNumber(): number {
    let n = 1;
    while (this.usedNumbers.has(n)) n++;
    this.usedNumbers.add(n);
    return n;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const [code, room] of this.rooms.entries()) {
        const idleTime = now - room.state.lastActivityAt;

        if (idleTime > this.IDLE_TIMEOUT_MS) {
          // Room empty or idle too long → remove
          if (room.state.players.length === 0) {
            this.removeRoom(code);
          } else {
            // If game is in progress and idle too long, could forfeit
            // For now, just remove empty rooms, flag non-empty ones
            this.removeRoom(code);
          }
        }
      }
    }, 60_000); // Check every 60s
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const code of [...this.rooms.keys()]) this.removeRoom(code);
  }
}
