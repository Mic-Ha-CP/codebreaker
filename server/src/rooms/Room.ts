import type {
  PlayerId,
  RoomCode,
  RoomState,
  RoomPhase,
  Player,
  Rules,
  GuessRow,
  GuessResult,
  ClientRoomState,
  ClientPlayerGameState,
  GameEndPayload,
} from '../../../shared/types.js';
import { calculateFeedback } from '../game/feedback.js';
import { validateSecret, validateGuess, validateRules } from '../game/validation.js';

const DEFAULT_RULES: Rules = {
  codeLength: 4,
  allowRepeats: false,
  totalRounds: 10,
};

export class Room {
  state: RoomState;

  constructor(code: RoomCode) {
    this.state = {
      code,
      phase: 'lobby',
      rules: { ...DEFAULT_RULES },
      players: [],
      spectators: [],
      currentRound: 0,
      currentTurnPlayerId: null,
      playerStates: {},
      winnerId: null,
      isDraw: false,
      pendingTiebreaker: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
  }

  // ── Player management ──────────────────────────────────────────────────

  addPlayer(playerId: PlayerId, nickname: string): { ok: true } | { error: string } {
    if (this.state.players.length >= 2) {
      return { error: 'room_full' };
    }
    if (this.state.players.find((p) => p.id === playerId)) {
      return { error: 'already_in_room' };
    }

    const isHost = this.state.players.length === 0;
    const player: Player = {
      id: playerId,
      nickname,
      isHost,
      isReady: false,
      connected: true,
      disconnectedAt: null,
    };

    this.state.players.push(player);
    this.state.playerStates[playerId] = {
      secret: null,
      history: [],
      hasGuessedCorrectly: false,
      guessedCorrectlyAtRound: null,
    };
    this.state.lastActivityAt = Date.now();

    // If host left and this is the new second player, make them host
    // (handled in removePlayer)

    return { ok: true };
  }

  removePlayer(playerId: PlayerId): void {
    this.state.players = this.state.players.filter((p) => p.id !== playerId);
    delete this.state.playerStates[playerId];
    this.state.lastActivityAt = Date.now();

    // Transfer host to remaining player
    if (this.state.players.length === 1) {
      this.state.players[0].isHost = true;
    }
  }

  getPlayer(playerId: PlayerId): Player | undefined {
    return this.state.players.find((p) => p.id === playerId);
  }

  getOpponentId(playerId: PlayerId): PlayerId | null {
    const opponent = this.state.players.find((p) => p.id !== playerId);
    return opponent?.id ?? null;
  }

  // ── Lobby actions ──────────────────────────────────────────────────────

  updateRules(playerId: PlayerId, rules: Partial<Rules>): { ok: true } | { error: string } {
    if (this.state.phase !== 'lobby') return { error: 'wrong_phase' };
    const player = this.getPlayer(playerId);
    if (!player?.isHost) return { error: 'forbidden' };

    const validationError = validateRules(rules);
    if (validationError) return { error: validationError };

    this.state.rules = { ...this.state.rules, ...rules };
    this.state.lastActivityAt = Date.now();
    return { ok: true };
  }

  toggleReady(playerId: PlayerId): { ok: true } | { error: string } {
    if (this.state.phase !== 'lobby') return { error: 'wrong_phase' };
    const player = this.getPlayer(playerId);
    if (!player) return { error: 'player_not_found' };

    player.isReady = !player.isReady;
    this.state.lastActivityAt = Date.now();

    // Auto-start when both ready
    if (this.state.players.length === 2 && this.state.players.every((p) => p.isReady)) {
      this.startSettingSecret();
    }

    return { ok: true };
  }

  // ── Phase transitions ──────────────────────────────────────────────────

  startSettingSecret(): void {
    this.state.phase = 'setting_secret';
    this.state.currentRound = 0;
    this.state.currentTurnPlayerId = null;
    this.state.lastActivityAt = Date.now();
  }

  startInProgress(): void {
    this.state.phase = 'in_progress';
    this.state.currentRound = 1;
    // Randomly pick who goes first
    const firstPlayer = this.state.players[Math.floor(Math.random() * this.state.players.length)];
    this.state.currentTurnPlayerId = firstPlayer.id;
    this.state.lastActivityAt = Date.now();
  }

  // ── Secret ─────────────────────────────────────────────────────────────

  submitSecret(playerId: PlayerId, secret: GuessRow): { ok: true } | { error: string } {
    if (this.state.phase !== 'setting_secret') return { error: 'wrong_phase' };
    const playerState = this.state.playerStates[playerId];
    if (!playerState) return { error: 'player_not_found' };
    if (playerState.secret !== null) return { error: 'already_submitted' };

    const validationError = validateSecret(secret, this.state.rules);
    if (validationError) return { error: validationError };

    playerState.secret = secret;
    this.state.lastActivityAt = Date.now();

    // Check if both have submitted
    const bothSubmitted = this.state.players.every(
      (p) => this.state.playerStates[p.id]?.secret !== null
    );

    if (bothSubmitted) {
      this.startInProgress();
    }

    return { ok: true };
  }

  // ── Guessing ───────────────────────────────────────────────────────────

  submitGuess(playerId: PlayerId, guess: GuessRow): { result: GuessResult; gameEnded: boolean } | { error: string } {
    if (this.state.phase !== 'in_progress') return { error: 'wrong_phase' };
    if (this.state.currentTurnPlayerId !== playerId) return { error: 'not_your_turn' };

    const playerState = this.state.playerStates[playerId];
    if (!playerState) return { error: 'player_not_found' };

    const opponentId = this.getOpponentId(playerId);
    if (!opponentId) return { error: 'no_opponent' };

    const validationError = validateGuess(guess, this.state.rules);
    if (validationError) return { error: validationError };

    const opponentState = this.state.playerStates[opponentId];
    const secret = opponentState?.secret;
    if (!secret) return { error: 'opponent_secret_not_set' };

    const result: GuessResult = {
      guess,
      exact: 0,
      partial: 0,
      guesserId: playerId,
      round: this.state.currentRound,
      timestamp: Date.now(),
    };

    // Calculate feedback
    const feedback = calculateFeedback(guess, secret, this.state.rules.allowRepeats);
    result.exact = feedback.exact;
    result.partial = feedback.partial;

    // Record history
    playerState.history.push(result);

    const isCorrect = result.exact === this.state.rules.codeLength;

    if (isCorrect) {
      playerState.hasGuessedCorrectly = true;
      playerState.guessedCorrectlyAtRound = this.state.currentRound;

      if (this.state.pendingTiebreaker) {
        // Tiebreaker player guessed correctly → draw
        this.state.isDraw = true;
        const endPayload = this.endGame(null, 'guessed');
        return { result, gameEnded: true };
      }

      const opponentState = this.state.playerStates[opponentId];
      if (opponentState?.hasGuessedCorrectly) {
        // Both guessed in same round → draw (safety check)
        this.state.isDraw = true;
        const endPayload = this.endGame(null, 'guessed');
        return { result, gameEnded: true };
      }

      // Trigger tiebreaker — opponent gets one more chance
      this.state.pendingTiebreaker = {
        triggeredByPlayerId: playerId,
        tiebreakerPlayerId: opponentId,
      };

      // Advance turn to opponent for their tiebreaker guess
      this.state.currentTurnPlayerId = opponentId;
      this.state.lastActivityAt = Date.now();
      return { result, gameEnded: false };
    }

    // Not correct
    if (this.state.pendingTiebreaker) {
      // Tiebreaker player failed → triggered player wins
      const winnerId = this.state.pendingTiebreaker.triggeredByPlayerId;
      const endPayload = this.endGame(winnerId, 'guessed');
      return { result, gameEnded: true };
    }

    // Advance turn
    this.advanceTurn(playerId, opponentId);
    this.state.lastActivityAt = Date.now();
    return { result, gameEnded: false };
  }

  private advanceTurn(currentPlayerId: PlayerId, opponentId: PlayerId): void {
    // Check if both players have guessed this round
    const currentPlayer = this.state.playerStates[currentPlayerId];
    const opponent = this.state.playerStates[opponentId];
    const currentPlayerGuessedThisRound = currentPlayer?.history.some(
      (h) => h.round === this.state.currentRound
    );
    const opponentGuessedThisRound = opponent?.history.some(
      (h) => h.round === this.state.currentRound
    );

    if (currentPlayerGuessedThisRound && opponentGuessedThisRound) {
      this.state.currentRound++;
      if (this.state.currentRound > this.state.rules.totalRounds) {
        // Rounds exhausted → draw
        this.endGame(null, 'rounds_exhausted');
        return;
      }
    }

    this.state.currentTurnPlayerId = opponentId;
  }

  // ── Game end ───────────────────────────────────────────────────────────

  endGame(winnerId: PlayerId | null, reason: GameEndPayload['reason']): GameEndPayload {
    this.state.phase = 'ended';
    this.state.winnerId = winnerId;
    this.state.currentTurnPlayerId = null;
    this.state.lastActivityAt = Date.now();

    const revealedSecrets: Record<PlayerId, GuessRow> = {};
    for (const player of this.state.players) {
      const pState = this.state.playerStates[player.id];
      if (pState?.secret) {
        revealedSecrets[player.id] = pState.secret;
      }
    }

    const payload: GameEndPayload = {
      winnerId,
      isDraw: this.state.isDraw,
      reason,
      revealedSecrets,
    };

    return payload;
  }

  // ── Rematch ────────────────────────────────────────────────────────────

  rematch(): void {
    this.state.phase = 'lobby';
    this.state.currentRound = 0;
    this.state.currentTurnPlayerId = null;
    this.state.winnerId = null;
    this.state.isDraw = false;
    this.state.pendingTiebreaker = null;
    this.state.lastActivityAt = Date.now();

    // Reset states but keep players
    for (const player of this.state.players) {
      player.isReady = false;
      this.state.playerStates[player.id] = {
        secret: null,
        history: [],
        hasGuessedCorrectly: false,
        guessedCorrectlyAtRound: null,
      };
    }
  }

  // ── Disconnect handling ────────────────────────────────────────────────

  markDisconnected(playerId: PlayerId): void {
    const player = this.getPlayer(playerId);
    if (player) {
      player.connected = false;
      player.disconnectedAt = Date.now();
      this.state.lastActivityAt = Date.now();
    }
  }

  markReconnected(playerId: PlayerId): void {
    const player = this.getPlayer(playerId);
    if (player) {
      player.connected = true;
      player.disconnectedAt = null;
      this.state.lastActivityAt = Date.now();
    }
  }

  // ── Serialization ──────────────────────────────────────────────────────

  toClientState(viewerId: PlayerId): ClientRoomState {
    const clientPlayerStates: Record<PlayerId, ClientPlayerGameState> = {};
    const isEnded = this.state.phase === 'ended';

    for (const player of this.state.players) {
      const pState = this.state.playerStates[player.id];
      if (!pState) continue;

      // Mask opponent's secret unless game is ended
      const secret = (player.id === viewerId || isEnded) ? pState.secret : null;

      clientPlayerStates[player.id] = {
        secret,
        history: pState.history,
        hasGuessedCorrectly: pState.hasGuessedCorrectly,
        guessedCorrectlyAtRound: pState.guessedCorrectlyAtRound,
      };
    }

    return {
      code: this.state.code,
      phase: this.state.phase,
      rules: this.state.rules,
      players: this.state.players,
      spectators: this.state.spectators,
      currentRound: this.state.currentRound,
      currentTurnPlayerId: this.state.currentTurnPlayerId,
      playerStates: clientPlayerStates,
      winnerId: this.state.winnerId,
      isDraw: this.state.isDraw,
      pendingTiebreaker: this.state.pendingTiebreaker,
      opponentTypingBuffer: null,
      createdAt: this.state.createdAt,
      lastActivityAt: this.state.lastActivityAt,
    };
  }
}
