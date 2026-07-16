import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomManager } from './RoomManager.js';
import { Room } from './Room.js';

describe('RoomManager — basics', () => {
  let mgr: RoomManager;

  beforeEach(() => {
    mgr = new RoomManager();
  });

  afterEach(() => {
    mgr.destroy();
  });

  it('creates a room with a 4-char code', () => {
    const result = mgr.createRoom('P1', 'alice');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.state.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(result.state.players[0].nickname).toBe('alice');
    expect(result.state.players[0].isHost).toBe(true);
  });

  it('getRoom returns null for unknown code', () => {
    expect(mgr.getRoom('NOPE')).toBeNull();
  });

  it('getRoomByPlayer finds the room a player is in', () => {
    const result = mgr.createRoom('P1', 'alice');
    if ('error' in result) throw new Error('unexpected');
    const found = mgr.getRoomByPlayer('P1');
    expect(found?.state.code).toBe(result.state.code);
  });

  it('removeRoom deletes a room', () => {
    const result = mgr.createRoom('P1', 'alice');
    if ('error' in result) throw new Error('unexpected');
    const code = result.state.code;
    mgr.removeRoom(code);
    expect(mgr.getRoom(code)).toBeNull();
  });

  it('applies initial rules from createRoom', () => {
    const result = mgr.createRoom('P1', 'alice', { codeLength: 5 });
    if ('error' in result) throw new Error('unexpected');
    expect(result.state.rules.codeLength).toBe(5);
  });
});

describe('RoomManager — 5-room cap', () => {
  let mgr: RoomManager;

  beforeEach(() => {
    mgr = new RoomManager();
  });

  afterEach(() => {
    mgr.destroy();
  });

  it('allows up to 5 rooms', () => {
    for (let i = 0; i < 5; i++) {
      const r = mgr.createRoom(`P${i}`, `p${i}`);
      expect('error' in r).toBe(false);
    }
  });

  it('rejects the 6th room with server_full', () => {
    for (let i = 0; i < 5; i++) {
      mgr.createRoom(`P${i}`, `p${i}`);
    }
    const r = mgr.createRoom('P5', 'p5');
    expect(r).toEqual({ error: 'server_full' });
  });

  it('frees a slot when a room is removed', () => {
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = mgr.createRoom(`P${i}`, `p${i}`);
      if ('error' in r) throw new Error('unexpected');
      codes.push(r.state.code);
    }
    mgr.removeRoom(codes[0]);
    const r = mgr.createRoom('P5', 'p5');
    expect('error' in r).toBe(false);
  });
});

describe('RoomManager — idle cleanup', () => {
  let mgr: RoomManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new RoomManager();
  });

  afterEach(() => {
    mgr.destroy();
    vi.useRealTimers();
  });

  it('removes rooms idle longer than 5 minutes once nobody is connected', () => {
    const r = mgr.createRoom('P1', 'alice');
    if ('error' in r) throw new Error('unexpected');
    const code = r.state.code;

    // Backdate the room's last activity to 6 minutes ago
    r.state.lastActivityAt = Date.now() - 6 * 60 * 1000;
    // ...and the host is gone. Idle time alone is no longer enough: this test
    // used to pass with alice still connected, which is exactly the production
    // bug — a live room deleted under a thinking player.
    r.markDisconnected('P1');
    r.state.lastActivityAt = Date.now() - 6 * 60 * 1000;

    // Trigger the cleanup interval
    vi.advanceTimersByTime(60_000);

    expect(mgr.getRoom(code)).toBeNull();
  });

  it('keeps rooms that are still active', () => {
    const r = mgr.createRoom('P1', 'alice');
    if ('error' in r) throw new Error('unexpected');
    const code = r.state.code;

    // Recent activity → should survive a cleanup tick
    r.state.lastActivityAt = Date.now() - 60 * 1000;
    vi.advanceTimersByTime(60_000);

    expect(mgr.getRoom(code)).not.toBeNull();
  });
});

/**
 * Regression cover for a live production incident (2026-07-16): two players sat
 * on one turn for several minutes, and the sweep deleted the room under them.
 * They only found out when the guess came back 'not_in_room'.
 */
describe('RoomManager — idle sweep does not evict live players', () => {
  let mgr: RoomManager;

  const stale = (r: Room) => {
    r.state.lastActivityAt = Date.now() - 6 * 60 * 1000;
  };

  /** Drives a room to in_progress with two connected humans. */
  function liveGame(): Room {
    const r = mgr.createRoom('P1', 'alice') as Room;
    r.addPlayer('P2', 'bob');
    r.toggleReady('P1');
    r.toggleReady('P2'); // -> setting_secret
    r.submitSecret('P1', [1, 2, 3, 4]);
    r.submitSecret('P2', [5, 6, 7, 8]); // -> in_progress
    return r;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new RoomManager();
  });

  afterEach(() => {
    mgr.destroy();
    vi.useRealTimers();
  });

  it('spares a live game whose players are only thinking', () => {
    const r = liveGame();
    expect(r.state.phase).toBe('in_progress');
    stale(r); // "several minutes on one turn"

    vi.advanceTimersByTime(60_000 * 3);

    // Before the fix this room was gone, and the next guess bounced.
    expect(mgr.getRoom(r.state.code)).not.toBeNull();
    expect(r.state.phase).toBe('in_progress');
  });

  it('spares a lobby where someone is still waiting for an opponent', () => {
    const r = mgr.createRoom('P1', 'alice') as Room;
    stale(r);
    vi.advanceTimersByTime(60_000);
    expect(mgr.getRoom(r.state.code)).not.toBeNull();
  });

  it('still reclaims a mid-game room once every human has dropped', () => {
    const r = liveGame();
    r.markDisconnected('P1');
    r.markDisconnected('P2');
    stale(r);

    vi.advanceTimersByTime(60_000);
    expect(mgr.getRoom(r.state.code)).toBeNull();
  });

  it('still reclaims a finished room nobody came back to', () => {
    const r = liveGame();
    r.endGame('P1', 'guessed');
    r.markDisconnected('P1');
    r.markDisconnected('P2');
    stale(r);

    vi.advanceTimersByTime(60_000);
    expect(mgr.getRoom(r.state.code)).toBeNull();
  });

  it('still reclaims an abandoned lobby', () => {
    const r = mgr.createRoom('P1', 'alice') as Room;
    r.removePlayer('P1');
    stale(r);

    vi.advanceTimersByTime(60_000);
    expect(mgr.getRoom(r.state.code)).toBeNull();
  });

  it('does not keep a room alive for a bot', () => {
    const r = mgr.createRoom('P1', 'alice') as Room;
    r.addPlayer('bot:X', 'CPU', { isBot: true });
    r.markDisconnected('P1');
    stale(r);

    vi.advanceTimersByTime(60_000);
    // A bot is always "connected" — it must not count as a reason to stay.
    expect(mgr.getRoom(r.state.code)).toBeNull();
  });

  it('one player still connected is enough to keep the room', () => {
    const r = liveGame();
    r.markDisconnected('P1'); // bob is still here
    stale(r);

    vi.advanceTimersByTime(60_000);
    expect(mgr.getRoom(r.state.code)).not.toBeNull();
  });

  it('a reconnect before the sweep saves the room', () => {
    const r = liveGame();
    r.markDisconnected('P1');
    r.markDisconnected('P2');
    stale(r);
    r.markReconnected('P2');
    stale(r); // markReconnected touches the clock; force it stale again

    vi.advanceTimersByTime(60_000);
    expect(mgr.getRoom(r.state.code)).not.toBeNull();
  });

  it('reports why the room went away', () => {
    const seen: Array<[string, string]> = [];
    mgr.onRoomRemoved((code, reason) => seen.push([code, reason]));

    const manual = mgr.createRoom('P1', 'alice') as Room;
    mgr.removeRoom(manual.state.code);
    expect(seen).toEqual([[manual.state.code, 'manual']]);

    const swept = mgr.createRoom('P2', 'bob') as Room;
    swept.markDisconnected('P2');
    stale(swept);
    vi.advanceTimersByTime(60_000);
    expect(seen[1]).toEqual([swept.state.code, 'idle']);
  });

  it('typing keeps a room alive — Room.touch is what the socket layer calls', () => {
    const r = liveGame();
    stale(r);
    r.touch(); // c:typing_update does this

    vi.advanceTimersByTime(60_000);
    expect(mgr.getRoom(r.state.code)).not.toBeNull();
    expect(Date.now() - r.state.lastActivityAt).toBeLessThan(60_000 * 2);
  });
});
