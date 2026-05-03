import { create } from 'zustand';
import type {
  ClientRoomState,
  ClientPlayerGameState,
  GameEndPayload,
  Player,
  Rules,
  RoomPhase,
} from '../../../shared/types';

// ─── Dev mock helpers ─────────────────────────────────────────────────────────

const MOCK_MY_ID = 'alice';

const MOCK_RULES: Rules = { codeLength: 4, allowRepeats: false, totalRounds: 10 };

function mockPlayer(id: string, nickname: string, isHost: boolean): Player {
  return { id, nickname, isHost, isReady: false, connected: true, disconnectedAt: null };
}

function mockPlayerState(withHistory: boolean): ClientPlayerGameState {
  return {
    secret: null,
    history: withHistory
      ? [
          { guess: [4, 8, 3, 1], exact: 2, partial: 1, guesserId: 'alice', round: 1, timestamp: Date.now() },
          { guess: [1, 2, 5, 9], exact: 1, partial: 1, guesserId: 'alice', round: 2, timestamp: Date.now() },
        ]
      : [],
    hasGuessedCorrectly: false,
    guessedCorrectlyAtRound: null,
  };
}

function createMockRoomState(
  phase: RoomPhase,
  opts: { opponentDisconnected?: boolean } = {}
): ClientRoomState {
  const inGame = phase === 'in_progress' || phase === 'revealing' || phase === 'ended';
  const alice = mockPlayer('alice', 'alice', true);
  const bob: Player = {
    ...mockPlayer('bob', 'bob', false),
    isReady: phase !== 'lobby',
    connected: opts.opponentDisconnected ? false : true,
    disconnectedAt: opts.opponentDisconnected ? Date.now() - 5000 : null,
  };

  return {
    code: 'X3K9',
    phase,
    rules: MOCK_RULES,
    players: [alice, bob],
    spectators: [],
    currentRound: inGame ? 3 : 0,
    currentTurnPlayerId: phase === 'in_progress' ? MOCK_MY_ID : null,
    playerStates: {
      alice: {
        ...mockPlayerState(inGame),
        secret: phase === 'ended' ? [4, 8, 1, 3] : null,
        hasGuessedCorrectly: phase === 'ended',
        guessedCorrectlyAtRound: phase === 'ended' ? 3 : null,
      },
      bob: {
        ...mockPlayerState(false),
        history: inGame
          ? [
              { guess: [5, 2, 9, 0], exact: 1, partial: 2, guesserId: 'bob', round: 1, timestamp: Date.now() },
              { guess: [7, 3, 4, 1], exact: 0, partial: 2, guesserId: 'bob', round: 2, timestamp: Date.now() },
            ]
          : [],
      },
    },
    winnerId: phase === 'ended' ? MOCK_MY_ID : null,
    isDraw: false,
    pendingTiebreaker: null,
    opponentTypingBuffer: phase === 'in_progress' ? [5, 2, null, null] : null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

const MOCK_GAME_END: GameEndPayload = {
  winnerId: MOCK_MY_ID,
  isDraw: false,
  reason: 'guessed',
  revealedSecrets: { alice: [4, 8, 1, 3], bob: [5, 2, 9, 0] },
};

// ─── Store ────────────────────────────────────────────────────────────────────

interface GameStore {
  // connection
  connected: boolean;

  // identity
  myId: string | null;
  nickname: string;

  // room
  roomState: ClientRoomState | null;
  gameEndPayload: GameEndPayload | null;

  // digit input (shared between SetSecret and Game screens)
  inputBuffer: (number | null)[];
  cursorPos: number;

  // opponent realtime typing (populated via socket in M3)
  opponentTyping: (number | null)[] | null;

  // i18n
  lang: 'en' | 'zh';

  // ── local actions (work in M2) ──────────────────────────────────────────────
  setNickname: (n: string) => void;
  inputDigit: (d: number) => void;
  deleteDigit: () => void;
  setCursor: (pos: number) => void;
  setLang: (l: 'en' | 'zh') => void;

  // ── socket actions (stubs in M2 — implement in M3) ──────────────────────────
  connect: () => void;
  createRoom: (rules?: Partial<Rules>) => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  toggleReady: () => void;
  submitSecret: () => void;
  submitGuess: () => void;
  requestRematch: () => void;

  // ── dev only ─────────────────────────────────────────────────────────────────
  _devSetPhase: (phase: RoomPhase, opts?: { opponentDisconnected?: boolean }) => void;
  _devLeave: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  connected: false,
  myId: null,
  nickname: '',
  roomState: null,
  gameEndPayload: null,
  inputBuffer: [null, null, null, null],
  cursorPos: 0,
  opponentTyping: null,
  lang: 'en',

  // ── local ────────────────────────────────────────────────────────────────────
  setNickname: (n) => set({ nickname: n }),

  inputDigit: (d) => {
    const { inputBuffer, cursorPos, roomState } = get();
    const codeLength = roomState?.rules.codeLength ?? 4;
    if (cursorPos >= codeLength) return;
    const next = [...inputBuffer];
    next[cursorPos] = d;
    set({ inputBuffer: next, cursorPos: Math.min(cursorPos + 1, codeLength) });
    // TODO: M3 — debouncedEmit(C2S.TYPING_UPDATE, { buffer: next })
  },

  deleteDigit: () => {
    const { inputBuffer, cursorPos } = get();
    if (cursorPos === 0 && inputBuffer[0] === null) return;
    const next = [...inputBuffer];
    const target = cursorPos > 0 ? cursorPos - 1 : 0;
    next[target] = null;
    set({ inputBuffer: next, cursorPos: target });
    // TODO: M3 — debouncedEmit(C2S.TYPING_UPDATE, { buffer: next })
  },

  setCursor: (pos) => set({ cursorPos: pos }),
  setLang: (l) => set({ lang: l }),

  // ── stubs (M3) ───────────────────────────────────────────────────────────────
  connect: () => { /* TODO: M3 — init socket, wire events */ },
  createRoom: () => { /* TODO: M3 — socket.emit(C2S.CREATE_ROOM, { nickname, rules }) */ },
  joinRoom: () => { /* TODO: M3 — socket.emit(C2S.JOIN_ROOM, { nickname, code }) */ },
  leaveRoom: () => { /* TODO: M3 — socket.emit(C2S.LEAVE_ROOM) */ },
  toggleReady: () => { /* TODO: M3 — socket.emit(C2S.TOGGLE_READY) */ },
  submitSecret: () => { /* TODO: M3 — socket.emit(C2S.SUBMIT_SECRET, { secret: inputBuffer }) */ },
  submitGuess: () => { /* TODO: M3 — socket.emit(C2S.SUBMIT_GUESS, { guess: inputBuffer }) */ },
  requestRematch: () => { /* TODO: M3 — socket.emit(C2S.REQUEST_REMATCH) */ },

  // ── dev ──────────────────────────────────────────────────────────────────────
  _devSetPhase: (phase, opts = {}) => {
    const mockState = createMockRoomState(phase, opts);
    const codeLength = mockState.rules.codeLength;
    set({
      myId: MOCK_MY_ID,
      roomState: mockState,
      gameEndPayload: phase === 'ended' ? MOCK_GAME_END : null,
      inputBuffer: Array<null>(codeLength).fill(null),
      cursorPos: 0,
    });
  },

  _devLeave: () => set({
    roomState: null,
    myId: null,
    gameEndPayload: null,
    inputBuffer: [null, null, null, null],
    cursorPos: 0,
  }),
}));
