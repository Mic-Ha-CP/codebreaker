import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LobbyBroadcaster } from './LobbyBroadcaster.js';
import type { RoomSummary } from '../../../shared/types.js';

const summary = (displayNumber: number, playerCount = 1): RoomSummary => ({
  code: `C${displayNumber}`,
  displayNumber,
  hostNickname: 'host',
  playerCount,
  maxPlayers: 2,
  rules: { codeLength: 4, allowRepeats: false, totalRounds: 10 },
  status: 'waiting',
});

describe('LobbyBroadcaster', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst of mutations into a single emit', async () => {
    let list = [summary(1)];
    const emit = vi.fn();
    const b = new LobbyBroadcaster(() => list, emit, 50);

    // e.g. the idle sweep dropping four rooms in one pass.
    for (let i = 0; i < 10; i++) b.schedule();
    expect(emit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('does not emit while nothing a list row shows has changed', async () => {
    let list = [summary(1)];
    const emit = vi.fn();
    const b = new LobbyBroadcaster(() => list, emit, 50);

    b.schedule();
    await vi.advanceTimersByTimeAsync(60);
    expect(emit).toHaveBeenCalledTimes(1);

    // Every guess in every game reaches the choke point; none of them change
    // the list, and idle lobby clients should not hear about them.
    b.schedule();
    await vi.advanceTimersByTimeAsync(60);
    expect(emit).toHaveBeenCalledTimes(1);

    list = [summary(1, 2)];
    b.schedule();
    await vi.advanceTimersByTimeAsync(60);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith([summary(1, 2)]);
  });

  it('emits again when a room appears or disappears', async () => {
    let list = [summary(1)];
    const emit = vi.fn();
    const b = new LobbyBroadcaster(() => list, emit, 50);

    b.schedule();
    await vi.advanceTimersByTimeAsync(60);

    list = [summary(1), summary(2)];
    b.schedule();
    await vi.advanceTimersByTimeAsync(60);
    expect(emit).toHaveBeenCalledTimes(2);

    list = [];
    b.schedule();
    await vi.advanceTimersByTimeAsync(60);
    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenLastCalledWith([]);
  });

  it('a room that comes and goes inside one window is never announced', async () => {
    let list = [summary(1)];
    const emit = vi.fn();
    const b = new LobbyBroadcaster(() => list, emit, 50);
    b.schedule();
    await vi.advanceTimersByTimeAsync(60);
    expect(emit).toHaveBeenCalledTimes(1);

    list = [summary(1), summary(2)]; // created...
    b.schedule();
    list = [summary(1)]; // ...and gone before the timer fires
    await vi.advanceTimersByTimeAsync(60);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('current() answers a fresh subscriber immediately, ignoring both timer and dedupe', async () => {
    const list = [summary(1)];
    const emit = vi.fn();
    const b = new LobbyBroadcaster(() => list, emit, 50);

    expect(b.current()).toEqual(list);
    b.schedule();
    await vi.advanceTimersByTimeAsync(60);
    // A subscriber must still get the list even though nothing changed since.
    expect(b.current()).toEqual(list);
  });

  it('dispose cancels a pending broadcast', async () => {
    const emit = vi.fn();
    const b = new LobbyBroadcaster(() => [summary(1)], emit, 50);
    b.schedule();
    b.dispose();
    await vi.advanceTimersByTimeAsync(200);
    expect(emit).not.toHaveBeenCalled();
  });
});
