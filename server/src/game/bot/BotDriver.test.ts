import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Room } from '../../rooms/Room.js';
import { RoomManager } from '../../rooms/RoomManager.js';
import { calculateFeedback } from '../feedback.js';
import { BotDriver, BOT_NICKNAME, botIdFor, type BotHooks } from './BotDriver.js';
import type { GuessResult } from '../../../../shared/types.js';

const HUMAN = 'human-1';

/** Records what the socket layer would have emitted. */
function makeHooks() {
  const stateChanges: Room[] = [];
  const guesses: Array<{ result: GuessResult; gameEnded: boolean }> = [];
  const hooks: BotHooks = {
    onStateChange: (room) => void stateChanges.push(room),
    onGuess: (room, result, gameEnded) => void guesses.push({ result, gameEnded }),
  };
  return { hooks, stateChanges, guesses };
}

function soloRoom(difficulty: 'easy' | 'medium' | 'hard' = 'hard', code = 'SOLO') {
  const driver = new BotDriver();
  const room = new Room(code);
  room.addPlayer(HUMAN, 'me');
  const attached = driver.attach(room, difficulty);
  expect(attached).toEqual({ ok: true });
  return { driver, room, botId: botIdFor(code), ...makeHooks() };
}

describe('BotDriver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('attaches as an ordinary second player that Room cannot tell apart', () => {
    const { room, botId } = soloRoom('medium');
    expect(room.state.players).toHaveLength(2);
    const bot = room.getPlayer(botId)!;
    expect(bot.nickname).toBe(BOT_NICKNAME);
    expect(bot.isBot).toBe(true);
    expect(bot.isHost).toBe(false); // the human created the room
    expect(bot.connected).toBe(true);
    expect(room.state.botDifficulties[botId]).toBe('medium');
    // The human is untouched by the bot's presence.
    expect(room.getPlayer(HUMAN)!.isBot).toBeUndefined();
  });

  it('readies up on its own, which starts the game once the human is ready', async () => {
    const { driver, room, botId, hooks } = soloRoom();
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();

    expect(room.getPlayer(botId)!.isReady).toBe(true);
    expect(room.state.phase).toBe('lobby'); // still waiting on the human

    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();

    // Bot set its secret without being asked; now it is on the human.
    expect(room.state.phase).toBe('setting_secret');
    expect(room.state.playerStates[botId].secret).not.toBeNull();
    expect(room.state.playerStates[HUMAN].secret).toBeNull();
  });

  it('generates a secret its own rules would accept, including repeats-allowed', async () => {
    for (const allowRepeats of [false, true]) {
      const { driver, room, botId, hooks } = soloRoom('hard', allowRepeats ? 'REP' : 'NOREP');
      room.updateRules(HUMAN, { codeLength: 5, allowRepeats });
      room.toggleReady(HUMAN);
      driver.tick(room, hooks);
      await vi.runAllTimersAsync();

      const secret = room.state.playerStates[botId].secret!;
      expect(secret).toHaveLength(5);
      expect(secret.every((d) => d >= 0 && d <= 9)).toBe(true);
      if (!allowRepeats) expect(new Set(secret).size).toBe(5);
    }
  });

  it('does not move until it is actually its turn', async () => {
    const { driver, room, botId, hooks, guesses } = soloRoom();
    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    room.submitSecret(HUMAN, [1, 2, 3, 4]);
    expect(room.state.phase).toBe('in_progress');

    // Force the human to be on turn, then let every timer drain.
    room.state.currentTurnPlayerId = HUMAN;
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    expect(guesses).toHaveLength(0);

    room.state.currentTurnPlayerId = botId;
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    expect(guesses).toHaveLength(1);
    expect(guesses[0].result.guesserId).toBe(botId);
  });

  it('thinks before moving rather than answering instantly', async () => {
    const { driver, room, botId, hooks, guesses } = soloRoom();
    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    room.submitSecret(HUMAN, [1, 2, 3, 4]);
    room.state.currentTurnPlayerId = botId;
    driver.tick(room, hooks);

    await vi.advanceTimersByTimeAsync(1000); // inside the 1.2-2.8s window
    expect(guesses).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(guesses).toHaveLength(1);
  });

  it('plays a whole game against a human that never guesses right', async () => {
    const { driver, room, botId, hooks, guesses } = soloRoom('hard');
    room.updateRules(HUMAN, { totalRounds: 20 });
    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();

    const humanSecret = [7, 3, 9, 1];
    room.submitSecret(HUMAN, humanSecret);
    expect(room.state.phase).toBe('in_progress');

    // The human always guesses the same wrong code, so the bot must be the one
    // that finishes the game. Ticking every iteration regardless of whose turn
    // it is mirrors socket.ts, which ticks after every mutation — including the
    // games where the coin flip hands the bot the opening turn.
    for (let i = 0; i < 40 && room.state.phase === 'in_progress'; i++) {
      if (room.state.currentTurnPlayerId === HUMAN) {
        room.submitGuess(HUMAN, [0, 0, 0, 0]);
      }
      driver.tick(room, hooks);
      await vi.runAllTimersAsync();
    }

    expect(room.state.phase).toBe('ended');
    expect(room.state.winnerId).toBe(botId);
    // Assert the bot cracked it, NOT that its own guess ended the game: turn
    // order is a coin flip, and if the bot cracks the code as the round's first
    // guesser the human is owed a tiebreaker turn — so it is the human's failed
    // reply that ends the game, not the bot's winning guess.
    expect(guesses.at(-1)!.result.exact).toBe(4);
    // Every guess it made was scored against the human's real secret.
    for (const g of guesses) {
      expect({ exact: g.result.exact, partial: g.result.partial }).toEqual(
        calculateFeedback(g.result.guess, humanSecret, false)
      );
    }
    // A hard bot should not need many turns for this.
    expect(guesses.length).toBeLessThanOrEqual(9);
  });

  it('answers a tiebreaker turn with no special handling', async () => {
    const { driver, room, botId, hooks, guesses } = soloRoom('hard');
    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();

    const botSecret = room.state.playerStates[botId].secret!;
    room.submitSecret(HUMAN, [1, 2, 3, 4]);

    // Human cracks it first as the round's first guesser -> bot owes a
    // tiebreaker turn, and Room hands it the turn the usual way.
    room.state.currentTurnPlayerId = HUMAN;
    const res = room.submitGuess(HUMAN, botSecret);
    expect('error' in res).toBe(false);
    expect(room.state.pendingTiebreaker?.tiebreakerPlayerId).toBe(botId);
    expect(room.state.phase).toBe('in_progress');

    driver.tick(room, hooks);
    await vi.runAllTimersAsync();

    expect(guesses).toHaveLength(1);
    expect(room.state.phase).toBe('ended');
    // Bot missed its one chance -> human wins. (A draw would mean it guessed
    // the human's secret on that very turn, which is not what this seed does.)
    expect(room.state.winnerId).toBe(HUMAN);
  });

  it('re-readies after a rematch and plays a different game', async () => {
    const { driver, room, botId, hooks } = soloRoom('medium');
    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    const firstSecret = room.state.playerStates[botId].secret!;

    room.submitSecret(HUMAN, [1, 2, 3, 4]);
    room.endGame(HUMAN, 'guessed');

    room.rematch();
    expect(room.getPlayer(botId)!.isReady).toBe(false);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    expect(room.getPlayer(botId)!.isReady).toBe(true);

    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    const secondSecret = room.state.playerStates[botId].secret!;

    // Reseeded per game: a rematch must not replay the same line.
    expect(secondSecret).not.toEqual(firstSecret);
  });

  it('drops a pending move when the room ends mid-think', async () => {
    const { driver, room, botId, hooks, guesses } = soloRoom();
    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    room.submitSecret(HUMAN, [1, 2, 3, 4]);
    room.state.currentTurnPlayerId = botId;
    driver.tick(room, hooks);

    // The human forfeits while the bot is still thinking.
    room.endGame(HUMAN, 'disconnect');
    await vi.runAllTimersAsync();

    expect(guesses).toHaveLength(0);
    expect(room.state.winnerId).toBe(HUMAN);
  });

  it('keeps one action pending however often it is ticked', async () => {
    const { driver, room, botId, hooks, guesses } = soloRoom();
    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    room.submitSecret(HUMAN, [1, 2, 3, 4]);
    room.state.currentTurnPlayerId = botId;

    // Simulates a burst of unrelated broadcasts (typing updates, say). If each
    // one re-armed the timer, the bot would never actually move.
    for (let i = 0; i < 50; i++) driver.tick(room, hooks);
    expect(driver.hasPending('SOLO')).toBe(true);
    await vi.runAllTimersAsync();

    expect(guesses).toHaveLength(1);
  });

  it('detach cancels pending work and forgets the room', async () => {
    const { driver, room, botId, hooks, guesses } = soloRoom();
    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    room.submitSecret(HUMAN, [1, 2, 3, 4]);
    room.state.currentTurnPlayerId = botId;
    driver.tick(room, hooks);
    expect(driver.hasPending('SOLO')).toBe(true);

    driver.detach('SOLO');
    await vi.runAllTimersAsync();

    expect(guesses).toHaveLength(0);
    expect(driver.hasBot('SOLO')).toBe(false);
    driver.tick(room, hooks); // must not throw or resurrect the bot
    await vi.runAllTimersAsync();
    expect(guesses).toHaveLength(0);
  });

  it('seats a bot into a room that is already up and running, not just at creation', async () => {
    // The unified model: the host adds a bot to an ordinary lobby whenever
    // there is a seat, rather than the room being born "solo".
    const driver = new BotDriver();
    const room = new Room('LATE');
    room.addPlayer(HUMAN, 'me');
    room.updateRules(HUMAN, { codeLength: 5 });
    const { hooks } = makeHooks();

    expect(driver.hasBot('LATE')).toBe(false);
    expect(driver.attach(room, 'easy')).toEqual({ ok: true });
    driver.tick(room, hooks); // socket.ts does this via afterRoomMutation
    await vi.runAllTimersAsync();

    const botId = botIdFor('LATE');
    expect(room.getPlayer(botId)!.isReady).toBe(true);
    expect(room.state.botDifficulties[botId]).toBe('easy');
  });

  it('refuses to seat a bot with no seat free', () => {
    const { driver, room } = soloRoom('easy', 'FULL');
    expect(room.state.players).toHaveLength(2);
    expect(driver.attach(room, 'hard')).toEqual({ error: 'room_full' });
  });

  it('kicking the bot leaves the room waiting in the lobby', async () => {
    const { driver, room, botId, hooks } = soloRoom('hard', 'KICK');
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    expect(room.getPlayer(botId)!.isReady).toBe(true);

    expect(room.kickPlayer(HUMAN, botId)).toEqual({ ok: true });
    driver.detach('KICK');

    expect(room.state.players).toHaveLength(1);
    expect(room.state.botDifficulties[botId]).toBeUndefined();
    expect(driver.hasBot('KICK')).toBe(false);
    expect(room.state.phase).toBe('lobby');

    // The human being ready must not start a one-player game.
    room.toggleReady(HUMAN);
    await vi.runAllTimersAsync();
    expect(room.state.phase).toBe('lobby');
  });

  it('re-adding at a new difficulty actually swaps the opponent', async () => {
    // This is the "rematch at a different difficulty" path.
    const { driver, room, botId, hooks } = soloRoom('easy', 'SWAP');
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    expect(room.state.botDifficulties[botId]).toBe('easy');

    room.kickPlayer(HUMAN, botId);
    driver.detach('SWAP');
    expect(driver.attach(room, 'hard')).toEqual({ ok: true });
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();

    expect(room.state.botDifficulties[botId]).toBe('hard');
    expect(room.getPlayer(botId)!.isReady).toBe(true);
    expect(room.state.players).toHaveLength(2);
  });

  it('a kicked bot cannot still be holding a timer', async () => {
    const { driver, room, botId, hooks, guesses } = soloRoom('hard', 'TMR');
    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    room.submitSecret(HUMAN, [1, 2, 3, 4]);
    room.state.currentTurnPlayerId = botId;
    driver.tick(room, hooks);
    expect(driver.hasPending('TMR')).toBe(true);

    // Kicking mid-think must not leave a timer that fires into a dead seat.
    driver.detach('TMR');
    await vi.runAllTimersAsync();
    expect(guesses).toHaveLength(0);
  });

  it('is released by RoomManager when the room goes away', () => {
    const manager = new RoomManager();
    const driver = new BotDriver();
    manager.onRoomRemoved((code) => driver.detach(code));

    const room = manager.createRoom(HUMAN, 'me') as Room;
    driver.attach(room, 'easy');
    expect(driver.hasBot(room.state.code)).toBe(true);

    // This is the path the idle sweep takes, which is where state would leak.
    manager.removeRoom(room.state.code);
    expect(driver.hasBot(room.state.code)).toBe(false);
    manager.destroy();
  });

  it('never leaks the secret it is chasing into the human\'s view', async () => {
    const { driver, room, botId, hooks } = soloRoom();
    room.toggleReady(HUMAN);
    driver.tick(room, hooks);
    await vi.runAllTimersAsync();
    room.submitSecret(HUMAN, [1, 2, 3, 4]);

    const view = room.toClientState(HUMAN);
    expect(view.playerStates[botId].secret).toBeNull();
    expect(view.playerStates[HUMAN].secret).toEqual([1, 2, 3, 4]);
    expect(view.botDifficulties[botId]).toBe('hard');
    expect(JSON.stringify(view)).not.toContain(
      JSON.stringify(room.state.playerStates[botId].secret)
    );
  });
});
