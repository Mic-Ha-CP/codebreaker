import { Room } from './Room.js';
import { generateRoomCode } from '../utils/roomCode.js';
import type { PlayerId, RoomCode, Rules } from '../../../shared/types.js';

export class RoomManager {
  private rooms = new Map<RoomCode, Room>();
  private readonly MAX_ROOMS = 5;
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  createRoom(hostId: PlayerId, nickname: string, rules?: Partial<Rules>): Room | { error: string } {
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

    this.rooms.set(code, room);
    return room;
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
    this.rooms.delete(code);
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
    this.rooms.clear();
  }
}
