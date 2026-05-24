import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from './Room.js';

function setupReadyRoom(): { room: Room; aId: string; bId: string } {
  const room = new Room('TEST');
  room.addPlayer('A', 'alice');
  room.addPlayer('B', 'bob');
  return { room, aId: 'A', bId: 'B' };
}

function setupInProgressRoom(opts?: {
  secretA?: number[];
  secretB?: number[];
  firstTurn?: 'A' | 'B';
}): { room: Room; aId: string; bId: string } {
  const { room, aId, bId } = setupReadyRoom();
  room.toggleReady(aId);
  room.toggleReady(bId); // auto-starts setting_secret
  const secretA = opts?.secretA ?? [1, 2, 3, 4];
  const secretB = opts?.secretB ?? [5, 6, 7, 8];
  room.submitSecret(aId, secretA);
  room.submitSecret(bId, secretB); // auto-starts in_progress (random turn)
  if (opts?.firstTurn && room.state.currentTurnPlayerId !== opts.firstTurn) {
    // Force a deterministic first turn for the test
    room.state.currentTurnPlayerId = opts.firstTurn;
  }
  return { room, aId, bId };
}

describe('Room — player management', () => {
  it('starts in lobby with no players', () => {
    const room = new Room('CODE');
    expect(room.state.phase).toBe('lobby');
    expect(room.state.players).toHaveLength(0);
    expect(room.state.code).toBe('CODE');
  });

  it('makes the first player host', () => {
    const room = new Room('CODE');
    room.addPlayer('A', 'alice');
    expect(room.state.players[0].isHost).toBe(true);
  });

  it('makes the second player non-host', () => {
    const room = new Room('CODE');
    room.addPlayer('A', 'alice');
    room.addPlayer('B', 'bob');
    expect(room.state.players[1].isHost).toBe(false);
  });

  it('rejects a third player', () => {
    const room = new Room('CODE');
    room.addPlayer('A', 'alice');
    room.addPlayer('B', 'bob');
    const res = room.addPlayer('C', 'carol');
    expect(res).toEqual({ error: 'room_full' });
  });

  it('rejects duplicate player id', () => {
    const room = new Room('CODE');
    room.addPlayer('A', 'alice');
    const res = room.addPlayer('A', 'alice2');
    expect(res).toEqual({ error: 'already_in_room' });
  });

  it('transfers host when host leaves', () => {
    const room = new Room('CODE');
    room.addPlayer('A', 'alice');
    room.addPlayer('B', 'bob');
    room.removePlayer('A');
    expect(room.state.players[0].id).toBe('B');
    expect(room.state.players[0].isHost).toBe(true);
  });
});

describe('Room — rules', () => {
  it('host can update rules in lobby', () => {
    const { room, aId } = setupReadyRoom();
    const res = room.updateRules(aId, { codeLength: 5 });
    expect(res).toEqual({ ok: true });
    expect(room.state.rules.codeLength).toBe(5);
  });

  it('non-host cannot update rules', () => {
    const { room, bId } = setupReadyRoom();
    const res = room.updateRules(bId, { codeLength: 5 });
    expect(res).toEqual({ error: 'forbidden' });
  });

  it('rejects invalid rules', () => {
    const { room, aId } = setupReadyRoom();
    expect(room.updateRules(aId, { codeLength: 99 })).toEqual({ error: 'invalid_length' });
    expect(room.updateRules(aId, { totalRounds: 99 })).toEqual({ error: 'invalid_rounds' });
  });

  it('rejects rule changes outside lobby', () => {
    const { room, aId } = setupInProgressRoom();
    const res = room.updateRules(aId, { codeLength: 5 });
    expect(res).toEqual({ error: 'wrong_phase' });
  });
});

describe('Room — lobby → setting_secret', () => {
  it('does not auto-start with only one player ready', () => {
    const { room, aId } = setupReadyRoom();
    room.toggleReady(aId);
    expect(room.state.phase).toBe('lobby');
  });

  it('auto-starts setting_secret when both ready', () => {
    const { room, aId, bId } = setupReadyRoom();
    room.toggleReady(aId);
    room.toggleReady(bId);
    expect(room.state.phase).toBe('setting_secret');
  });
});

describe('Room — secret submission', () => {
  it('phase transitions to in_progress once both secrets are submitted', () => {
    const { room, aId, bId } = setupReadyRoom();
    room.toggleReady(aId);
    room.toggleReady(bId);
    room.submitSecret(aId, [1, 2, 3, 4]);
    expect(room.state.phase).toBe('setting_secret');
    room.submitSecret(bId, [5, 6, 7, 8]);
    expect(room.state.phase).toBe('in_progress');
    expect(room.state.currentRound).toBe(1);
    expect(['A', 'B']).toContain(room.state.currentTurnPlayerId);
  });

  it('rejects double submission', () => {
    const { room, aId, bId } = setupReadyRoom();
    room.toggleReady(aId);
    room.toggleReady(bId);
    room.submitSecret(aId, [1, 2, 3, 4]);
    const res = room.submitSecret(aId, [9, 9, 9, 9]);
    expect(res).toEqual({ error: 'already_submitted' });
  });

  it('rejects invalid secret', () => {
    const { room, aId, bId } = setupReadyRoom();
    room.toggleReady(aId);
    room.toggleReady(bId);
    // Default rules forbid repeats
    expect(room.submitSecret(aId, [1, 1, 2, 3])).toEqual({ error: 'repeats_not_allowed' });
    expect(room.submitSecret(aId, [1, 2, 3])).toEqual({ error: 'wrong_length' });
  });
});

describe('Room — guessing', () => {
  it('rejects guess from the wrong player', () => {
    const { room, aId, bId } = setupInProgressRoom({ firstTurn: 'A' });
    const res = room.submitGuess(bId, [1, 2, 3, 4]);
    expect(res).toEqual({ error: 'not_your_turn' });
  });

  it('rejects guess outside in_progress', () => {
    const { room, aId } = setupReadyRoom();
    const res = room.submitGuess(aId, [1, 2, 3, 4]);
    expect(res).toEqual({ error: 'wrong_phase' });
  });

  it('accepts a repeated-digit guess even when allowRepeats=false', () => {
    const { room, aId } = setupInProgressRoom({ firstTurn: 'A' });
    expect(room.state.rules.allowRepeats).toBe(false);
    const res = room.submitGuess(aId, [1, 1, 1, 1]);
    expect('error' in res).toBe(false);
  });

  it('records history and advances turn on a wrong guess', () => {
    const { room, aId, bId } = setupInProgressRoom({
      secretA: [1, 2, 3, 4],
      secretB: [5, 6, 7, 8],
      firstTurn: 'A',
    });
    const res = room.submitGuess(aId, [5, 6, 7, 9]); // guessing B's secret
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.result.exact).toBe(3);
    expect(res.result.partial).toBe(0);
    expect(res.gameEnded).toBe(false);
    expect(room.state.currentTurnPlayerId).toBe(bId);
    expect(room.state.playerStates[aId].history).toHaveLength(1);
  });

  it('does not advance round until both players have guessed', () => {
    const { room, aId, bId } = setupInProgressRoom({ firstTurn: 'A' });
    room.submitGuess(aId, [9, 8, 7, 6]); // wrong
    expect(room.state.currentRound).toBe(1);
    room.submitGuess(bId, [9, 8, 7, 6]); // wrong
    expect(room.state.currentRound).toBe(2);
  });
});

describe('Room — tiebreaker', () => {
  it('triggers tiebreaker when A guesses correctly', () => {
    const { room, aId, bId } = setupInProgressRoom({
      secretA: [1, 2, 3, 4],
      secretB: [5, 6, 7, 8],
      firstTurn: 'A',
    });
    const res = room.submitGuess(aId, [5, 6, 7, 8]); // exact
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.gameEnded).toBe(false);
    expect(room.state.pendingTiebreaker).not.toBeNull();
    expect(room.state.pendingTiebreaker?.triggeredByPlayerId).toBe(aId);
    expect(room.state.pendingTiebreaker?.tiebreakerPlayerId).toBe(bId);
    expect(room.state.currentTurnPlayerId).toBe(bId);
  });

  it('B also correct in tiebreaker → DRAW', () => {
    const { room, aId, bId } = setupInProgressRoom({
      secretA: [1, 2, 3, 4],
      secretB: [5, 6, 7, 8],
      firstTurn: 'A',
    });
    room.submitGuess(aId, [5, 6, 7, 8]); // A correct
    const res = room.submitGuess(bId, [1, 2, 3, 4]); // B correct in tiebreaker
    if ('error' in res) throw new Error('unexpected error');
    expect(res.gameEnded).toBe(true);
    expect(room.state.phase).toBe('ended');
    expect(room.state.isDraw).toBe(true);
    expect(room.state.winnerId).toBeNull();
  });

  it('B incorrect in tiebreaker → A wins', () => {
    const { room, aId, bId } = setupInProgressRoom({
      secretA: [1, 2, 3, 4],
      secretB: [5, 6, 7, 8],
      firstTurn: 'A',
    });
    room.submitGuess(aId, [5, 6, 7, 8]); // A correct
    const res = room.submitGuess(bId, [9, 9, 9, 9]); // B wrong in tiebreaker
    if ('error' in res) throw new Error('unexpected error');
    expect(res.gameEnded).toBe(true);
    expect(room.state.phase).toBe('ended');
    expect(room.state.winnerId).toBe(aId);
    expect(room.state.isDraw).toBe(false);
  });

  // Second-guesser-wins: the opponent already had their shot this round and
  // missed, so there's no fair-chance debt — the guesser wins outright.
  it('second guesser correct → immediate win, no tiebreaker', () => {
    const { room, aId, bId } = setupInProgressRoom({
      secretA: [1, 2, 3, 4],
      secretB: [5, 6, 7, 8],
      firstTurn: 'A',
    });
    // A goes first and misses
    const r1 = room.submitGuess(aId, [9, 9, 9, 9]);
    if ('error' in r1) throw new Error('unexpected error');
    expect(r1.gameEnded).toBe(false);
    expect(room.state.pendingTiebreaker).toBeNull();
    expect(room.state.currentTurnPlayerId).toBe(bId);

    // B is the second guesser this round and nails it — should win outright
    const r2 = room.submitGuess(bId, [1, 2, 3, 4]);
    if ('error' in r2) throw new Error('unexpected error');
    expect(r2.gameEnded).toBe(true);
    expect(room.state.phase).toBe('ended');
    expect(room.state.winnerId).toBe(bId);
    expect(room.state.isDraw).toBe(false);
    expect(room.state.pendingTiebreaker).toBeNull();
  });
});

describe('Room — rounds exhaustion', () => {
  it('ends in DRAW after totalRounds with no correct guesses', () => {
    const room = new Room('CODE');
    room.addPlayer('A', 'alice');
    room.addPlayer('B', 'bob');
    room.updateRules('A', { totalRounds: 5 });
    room.toggleReady('A');
    room.toggleReady('B');
    room.submitSecret('A', [1, 2, 3, 4]);
    room.submitSecret('B', [5, 6, 7, 8]);
    room.state.currentTurnPlayerId = 'A'; // deterministic

    let lastResult: ReturnType<Room['submitGuess']> | null = null;
    for (let i = 0; i < 5; i++) {
      lastResult = room.submitGuess('A', [9, 9, 9, 9]);
      if ('error' in lastResult!) throw new Error('unexpected');
      if (lastResult.gameEnded) break;
      lastResult = room.submitGuess('B', [0, 0, 0, 0]);
      if ('error' in lastResult!) throw new Error('unexpected');
      if (lastResult.gameEnded) break;
    }

    expect(room.state.phase).toBe('ended');
    expect(room.state.isDraw).toBe(true);
    expect(room.state.winnerId).toBeNull();
  });
});

describe('Room — toClientState', () => {
  it("masks the opponent's secret in-game", () => {
    const { room, aId, bId } = setupInProgressRoom({
      secretA: [1, 2, 3, 4],
      secretB: [5, 6, 7, 8],
    });
    const aView = room.toClientState(aId);
    expect(aView.playerStates[aId].secret).toEqual([1, 2, 3, 4]);
    expect(aView.playerStates[bId].secret).toBeNull();
  });

  it('reveals both secrets when game is ended', () => {
    const { room, aId, bId } = setupInProgressRoom({
      secretA: [1, 2, 3, 4],
      secretB: [5, 6, 7, 8],
      firstTurn: 'A',
    });
    room.submitGuess(aId, [5, 6, 7, 8]); // tiebreaker
    room.submitGuess(bId, [1, 2, 3, 4]); // draw
    const view = room.toClientState(aId);
    expect(view.playerStates[aId].secret).toEqual([1, 2, 3, 4]);
    expect(view.playerStates[bId].secret).toEqual([5, 6, 7, 8]);
  });
});

describe('Room — rematch', () => {
  it('resets state but keeps players', () => {
    const { room, aId, bId } = setupInProgressRoom({
      secretA: [1, 2, 3, 4],
      secretB: [5, 6, 7, 8],
      firstTurn: 'A',
    });
    room.submitGuess(aId, [5, 6, 7, 8]);
    room.submitGuess(bId, [9, 9, 9, 9]); // A wins
    expect(room.state.phase).toBe('ended');

    room.rematch();
    expect(room.state.phase).toBe('lobby');
    expect(room.state.currentRound).toBe(0);
    expect(room.state.winnerId).toBeNull();
    expect(room.state.isDraw).toBe(false);
    expect(room.state.pendingTiebreaker).toBeNull();
    expect(room.state.players).toHaveLength(2);
    expect(room.state.players[0].isReady).toBe(false);
    expect(room.state.playerStates[aId].secret).toBeNull();
    expect(room.state.playerStates[aId].history).toHaveLength(0);
    expect(room.state.playerStates[aId].hasGuessedCorrectly).toBe(false);
  });
});

describe('Room — disconnect markers', () => {
  it('markDisconnected sets connected=false and timestamp', () => {
    const { room, aId } = setupInProgressRoom();
    room.markDisconnected(aId);
    expect(room.getPlayer(aId)?.connected).toBe(false);
    expect(room.getPlayer(aId)?.disconnectedAt).not.toBeNull();
  });

  it('markReconnected reverses it', () => {
    const { room, aId } = setupInProgressRoom();
    room.markDisconnected(aId);
    room.markReconnected(aId);
    expect(room.getPlayer(aId)?.connected).toBe(true);
    expect(room.getPlayer(aId)?.disconnectedAt).toBeNull();
  });
});
