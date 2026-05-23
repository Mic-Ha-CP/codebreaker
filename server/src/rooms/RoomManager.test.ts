import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomManager } from './RoomManager.js';

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

  it('removes rooms idle longer than 5 minutes', () => {
    const r = mgr.createRoom('P1', 'alice');
    if ('error' in r) throw new Error('unexpected');
    const code = r.state.code;

    // Backdate the room's last activity to 6 minutes ago
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
