// Drives the computer opponent as a virtual player.
//
// The bot has no socket, so nothing pushes it to act — this driver is the
// substitute. socket.ts calls tick() after every room mutation, and the driver
// works out whether the bot currently owes an action (ready up / set a secret /
// take its turn) and schedules it behind a human-ish delay.
//
// It only ever calls the same public Room methods the socket handlers call, so
// Room cannot tell a bot turn from a human one and needed no changes to its
// game logic. See docs/design-vs-computer.md §1.

import type { BotDifficulty, GuessResult, PlayerId, RoomCode } from '../../../../shared/types.js';
import { Room } from '../../rooms/Room.js';
import { hashSeed, mulberry32, randomRange } from './prng.js';
import { createSolver, generateSecret, type Solver } from './solver.js';

export const BOT_NICKNAME = 'CPU';

/** Long enough that the lobby doesn't flicker, short enough not to stall. */
const READY_DELAY_MS = 400;
const SECRET_DELAY_MS: [number, number] = [500, 1500];
const THINK_DELAY_MS: [number, number] = [1200, 2800];

export interface BotHooks {
  /** The bot readied up or set its secret. */
  onStateChange(room: Room): void;
  /** The bot took its turn. */
  onGuess(room: Room, result: GuessResult, gameEnded: boolean): void;
}

interface BotState {
  botId: PlayerId;
  difficulty: BotDifficulty;
  /** Bumped per game so a rematch isn't a replay of the same seeded line. */
  gameIndex: number;
  /** Game randomness: the bot's secret + its guesses. */
  prng: () => number;
  /** Timing jitter only, kept separate so delays can't shift the guess line. */
  delayPrng: () => number;
  /** Built when the lobby closes — that is when the rules stop moving. */
  solver: Solver | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export function botIdFor(code: RoomCode): PlayerId {
  return `bot:${code}`;
}

export class BotDriver {
  private states = new Map<RoomCode, BotState>();

  /** Adds the bot to a freshly created room. */
  attach(room: Room, difficulty: BotDifficulty): { ok: true } | { error: string } {
    const code = room.state.code;
    const botId = botIdFor(code);
    const added = room.addPlayer(botId, BOT_NICKNAME, { isBot: true });
    if ('error' in added) return added;

    room.setBotDifficulty(difficulty);
    this.states.set(code, {
      botId,
      difficulty,
      gameIndex: 0,
      prng: mulberry32(hashSeed(`${code}:0`)),
      delayPrng: mulberry32(hashSeed(`${code}:delay`)),
      solver: null,
      timer: null,
    });
    return { ok: true };
  }

  /** Drops all state for a room and cancels anything pending. */
  detach(code: RoomCode): void {
    const st = this.states.get(code);
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    this.states.delete(code);
  }

  isSolo(code: RoomCode): boolean {
    return this.states.has(code);
  }

  botIdIn(code: RoomCode): PlayerId | null {
    return this.states.get(code)?.botId ?? null;
  }

  /** Test/telemetry: is an action currently pending for this room? */
  hasPending(code: RoomCode): boolean {
    return this.states.get(code)?.timer != null;
  }

  /**
   * Works out what the bot owes right now and schedules it. Safe to call after
   * every mutation — it is idempotent while an action is already pending.
   */
  tick(room: Room, hooks: BotHooks): void {
    const st = this.states.get(room.state.code);
    if (!st) return;
    const bot = room.getPlayer(st.botId);
    if (!bot) return;

    switch (room.state.phase) {
      case 'lobby': {
        // Back in the lobby holding a solver means the previous game ended and
        // a rematch is starting: reseed so game two isn't a replay of game one.
        if (st.solver) {
          st.gameIndex++;
          st.prng = mulberry32(hashSeed(`${room.state.code}:${st.gameIndex}`));
          st.solver = null;
        }
        if (bot.isReady) return;
        this.schedule(st, READY_DELAY_MS, () => {
          if (room.state.phase !== 'lobby') return;
          const p = room.getPlayer(st.botId);
          if (!p || p.isReady) return;
          room.toggleReady(st.botId); // may auto-advance to setting_secret
          hooks.onStateChange(room);
          this.tick(room, hooks);
        });
        return;
      }

      case 'setting_secret': {
        if (room.state.playerStates[st.botId]?.secret != null) return;
        this.schedule(st, randomRange(st.delayPrng, ...SECRET_DELAY_MS), () => {
          if (room.state.phase !== 'setting_secret') return;
          if (room.state.playerStates[st.botId]?.secret != null) return;

          // Rules are frozen once the lobby closes, so this is the first moment
          // the solver can be built against the rules it will actually play.
          st.solver ??= createSolver(room.state.rules, st.difficulty, st.prng);

          const secret = generateSecret(room.state.rules, st.prng);
          const res = room.submitSecret(st.botId, secret);
          if ('error' in res) {
            console.error(`[bot] submitSecret rejected: ${res.error}`);
            return;
          }
          hooks.onStateChange(room);
          this.tick(room, hooks);
        });
        return;
      }

      case 'in_progress': {
        if (room.state.currentTurnPlayerId !== st.botId) return;
        this.schedule(st, randomRange(st.delayPrng, ...THINK_DELAY_MS), () => {
          // The room may have ended while the bot was "thinking" — a human
          // forfeit, say. Re-check rather than trust the schedule.
          if (room.state.phase !== 'in_progress') return;
          if (room.state.currentTurnPlayerId !== st.botId) return;
          const solver = st.solver;
          if (!solver) return;

          const guess = solver.nextGuess();
          const res = room.submitGuess(st.botId, guess);
          if ('error' in res) {
            console.error(`[bot] submitGuess rejected: ${res.error}`);
            return;
          }
          // Feedback only — the bot never sees the secret it is chasing.
          solver.observe(guess, { exact: res.result.exact, partial: res.result.partial });
          hooks.onGuess(room, res.result, res.gameEnded);
          this.tick(room, hooks);
        });
        return;
      }

      default:
        // revealing / ended: nothing owed.
        return;
    }
  }

  /**
   * One pending action per room. Without the guard, an unrelated broadcast
   * (opponent typing, say) would re-arm the timer and the bot would never
   * actually move.
   */
  private schedule(st: BotState, delayMs: number, fn: () => void): void {
    if (st.timer) return;
    st.timer = setTimeout(() => {
      st.timer = null;
      fn();
    }, delayMs);
  }
}
