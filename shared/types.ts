// === Base ===
export type PlayerId = string;
export type RoomCode = string;
export type Digit = number;
export type GuessRow = Digit[];

// === Room phase ===
export type RoomPhase =
  | 'lobby'
  | 'setting_secret'
  | 'in_progress'
  | 'revealing'
  | 'ended';

// === Player ===
export interface Player {
  id: PlayerId;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  /** A server-driven virtual player. Absent/false for humans. */
  isBot?: boolean;
}

// === Rules ===
export interface Rules {
  codeLength: number;
  allowRepeats: boolean;
  totalRounds: number;
}

// === Bot (vs-computer) ===
// Boundary note (docs/design-vs-computer.md §platform-boundary): the solver
// levels are GAME-SPECIFIC to Codebreaker. `Player.isBot` below is the
// platform-GENERIC marker — reported to platform-docs.
export type BotDifficulty = 'easy' | 'medium' | 'hard';

// === Game state ===
export interface GuessResult {
  guess: GuessRow;
  exact: number;
  partial: number;
  guesserId: PlayerId;
  round: number;
  timestamp: number;
}

export interface PlayerGameState {
  secret: GuessRow | null;
  history: GuessResult[];
  hasGuessedCorrectly: boolean;
  guessedCorrectlyAtRound: number | null;
}

// === Full room state (server-authoritative) ===
export interface RoomState {
  code: RoomCode;
  phase: RoomPhase;
  rules: Rules;
  players: Player[];
  spectators: Player[];
  currentRound: number;
  currentTurnPlayerId: PlayerId | null;
  playerStates: Record<PlayerId, PlayerGameState>;
  winnerId: PlayerId | null;
  isDraw: boolean;
  pendingTiebreaker: {
    triggeredByPlayerId: PlayerId;
    tiebreakerPlayerId: PlayerId;
  } | null;
  /**
   * Difficulty per bot player, keyed like `playerStates`. There is no such
   * thing as a "solo room" — a bot is just a player that occupies a seat, so
   * this is a property of the player, not of the room.
   */
  botDifficulties: Record<PlayerId, BotDifficulty>;
  /** Private rooms are never listed in the lobby; they are joined by code. */
  isPrivate: boolean;
  /**
   * Short number shown to players (#1, #2), null for private rooms.
   * Display only — `code` remains the room's identity either way. Private
   * rooms deliberately get none: a sequential number would make them
   * enumerable, which is the whole thing being avoided.
   */
  displayNumber: number | null;
  createdAt: number;
  lastActivityAt: number;
}

// === Lobby ===
/**
 * A room as the lobby list sees it. A whitelist projection, NOT room state —
 * no playerStates, no secrets, no player ids. See Room.toSummary() and
 * docs/lobby-broadcast-pattern.md.
 */
export interface RoomSummary {
  /** Join key. Public rooms are listed anyway, so this is not a secret. */
  code: RoomCode;
  displayNumber: number;
  hostNickname: string;
  playerCount: number;
  maxPlayers: number;
  rules: Rules;
  status: 'waiting' | 'playing';
}

// === Client-visible room state (secrets masked) ===
export interface ClientRoomState extends Omit<RoomState, 'playerStates'> {
  playerStates: Record<PlayerId, ClientPlayerGameState>;
  opponentTypingBuffer: (Digit | null)[] | null;
}

export interface ClientPlayerGameState {
  secret: GuessRow | null;
  history: GuessResult[];
  hasGuessedCorrectly: boolean;
  guessedCorrectlyAtRound: number | null;
}

// === Game end reveal ===
export interface GameEndPayload {
  winnerId: PlayerId | null;
  isDraw: boolean;
  reason: 'guessed' | 'timeout' | 'disconnect' | 'rounds_exhausted';
  revealedSecrets: Record<PlayerId, GuessRow>;
}
