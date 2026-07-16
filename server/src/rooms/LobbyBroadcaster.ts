// Coalesced fan-out of the room list to everyone sitting on the lobby screen.
//
// Generic: it knows nothing about Codebreaker. `build` and `emit` are injected,
// which is also what makes it unit-testable without a socket. The reusable half
// of docs/lobby-broadcast-pattern.md — 20Q should take this file as-is.

import type { RoomSummary } from '../../../shared/types.js';

/** Long enough to swallow a burst, short enough that the list feels live. */
export const DEFAULT_LOBBY_DEBOUNCE_MS = 50;

export class LobbyBroadcaster {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSent: string | null = null;

  constructor(
    private readonly build: () => RoomSummary[],
    private readonly emit: (rooms: RoomSummary[]) => void,
    private readonly debounceMs: number = DEFAULT_LOBBY_DEBOUNCE_MS
  ) {}

  /**
   * Ask for a broadcast. Safe to call after every room mutation: the first call
   * arms the timer and later ones ride along, so the idle sweep dropping four
   * rooms at once produces one emit rather than four.
   */
  schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  /** Uncoalesced snapshot for a socket that has just subscribed. */
  current(): RoomSummary[] {
    return this.build();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private flush(): void {
    const rooms = this.build();
    const json = JSON.stringify(rooms);
    // Most mutations change nothing a list row shows — every guess in every
    // game passes through here. Without this, idle lobby clients get woken by
    // traffic they cannot see.
    if (json === this.lastSent) return;
    this.lastSent = json;
    this.emit(rooms);
  }
}
