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
}

// === Rules ===
export interface Rules {
  codeLength: number;
  allowRepeats: boolean;
  totalRounds: number;
}

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
  createdAt: number;
  lastActivityAt: number;
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
