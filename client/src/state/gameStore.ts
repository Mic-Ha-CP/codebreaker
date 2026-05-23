import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { C2S } from '../../../shared/events';
import type {
  ClientRoomState,
  ClientPlayerGameState,
  GameEndPayload,
  Player,
  Rules,
  RoomPhase,
} from '../../../shared/types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// Module-level socket reference — initialized once
let socket: Socket | null = null;

function getSocket(): Socket | null {
  return socket;
}

function connectSocket(): Socket {
  if (socket?.connected) return socket;
  socket = io(SERVER_URL);
  return socket;
}

function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

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

  // opponent realtime typing
  opponentTyping: (number | null)[] | null;

  // i18n
  lang: 'en' | 'zh';

  // ── local actions ──────────────────────────────────────────────────────────
  setNickname: (n: string) => void;
  inputDigit: (d: number) => void;
  deleteDigit: () => void;
  setCursor: (pos: number) => void;
  setLang: (l: 'en' | 'zh') => void;

  // ── socket actions ─────────────────────────────────────────────────────────
  connect: () => void;
  disconnect: () => void;
  createRoom: (rules?: Partial<Rules>) => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  toggleReady: () => void;
  updateRules: (rules: Partial<Rules>) => void;
  submitSecret: () => void;
  submitGuess: () => void;
  requestRematch: () => void;

  // ── dev only ───────────────────────────────────────────────────────────────
  _devSetPhase: (phase: RoomPhase, opts?: { opponentDisconnected?: boolean }) => void;
  _devLeave: () => void;
}

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

// ─── Debounced typing emitter ─────────────────────────────────────────────────

let typingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTypingBuffer: (number | null)[] | null = null;

function emitTypingDebounced(buffer: (number | null)[]) {
  pendingTypingBuffer = buffer;
  if (typingTimer) return;

  typingTimer = setTimeout(() => {
    if (pendingTypingBuffer && socket) {
      socket.emit(C2S.TYPING_UPDATE, { buffer: pendingTypingBuffer });
    }
    typingTimer = null;
  }, 50);
}

// ─── Store ────────────────────────────────────────────────────────────────────

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

  // ── local ──────────────────────────────────────────────────────────────────

  setNickname: (n) => set({ nickname: n }),

  inputDigit: (d) => {
    const { inputBuffer, cursorPos, roomState } = get();
    const codeLength = roomState?.rules.codeLength ?? 4;
    if (cursorPos >= codeLength) return;
    const next = [...inputBuffer];
    next[cursorPos] = d;
    set({ inputBuffer: next, cursorPos: Math.min(cursorPos + 1, codeLength) });
    emitTypingDebounced(next);
  },

  deleteDigit: () => {
    const { inputBuffer, cursorPos } = get();
    if (cursorPos === 0 && inputBuffer[0] === null) return;
    const next = [...inputBuffer];
    const target = cursorPos > 0 ? cursorPos - 1 : 0;
    next[target] = null;
    set({ inputBuffer: next, cursorPos: target });
    emitTypingDebounced(next);
  },

  setCursor: (pos) => set({ cursorPos: pos }),
  setLang: (l) => set({ lang: l }),

  // ── socket actions ─────────────────────────────────────────────────────────

  connect: () => {
    const s = connectSocket();
    if (!s) return;

    s.on('connect', () => {
      set({ connected: true, myId: s.id ?? null });
    });

    s.on('disconnect', () => {
      set({ connected: false });
    });

    s.on('s:room_state', (state: ClientRoomState) => {
      const prev = get().roomState;
      const phaseChanged = prev?.phase !== state.phase;

      // Notify when opponent leaves in lobby
      if (prev?.phase === 'lobby' && state.phase === 'lobby') {
        const prevCount = prev.players.length;
        const nextCount = state.players.length;
        if (prevCount === 2 && nextCount === 1) {
          toast.warning('Opponent left the room.');
        }
      }

      set({
        roomState: state,
        ...(phaseChanged ? {
          inputBuffer: Array<null>(state.rules.codeLength).fill(null),
          cursorPos: 0,
        } : {}),
      });
    });

    s.on('s:opponent_typing', ({ buffer }: { buffer: (number | null)[] }) => {
      set({ opponentTyping: buffer });
    });

    s.on('s:reveal_guess', ({ result }: any) => {
      console.log('[store] reveal_guess:', result);
    });

    s.on('s:game_end', (payload: GameEndPayload) => {
      console.log('[store] game_end:', payload);
      set({ gameEndPayload: payload });
    });

    s.on('s:error', ({ message }: { code: string; message: string }) => {
      toast.error(message);
    });

    s.on('s:kick', ({ reason }: { reason: string }) => {
      toast.warning(`Kicked: ${reason}`);
      set({
        roomState: null,
        gameEndPayload: null,
        inputBuffer: [null, null, null, null],
        cursorPos: 0,
      });
    });
  },

  disconnect: () => {
    disconnectSocket();
    set({
      connected: false,
      myId: null,
      roomState: null,
      gameEndPayload: null,
      inputBuffer: [null, null, null, null],
      cursorPos: 0,
    });
  },

  createRoom: (rules) => {
    const { nickname } = get();
    if (!nickname.trim()) return;
    socket?.emit(C2S.CREATE_ROOM, { nickname: nickname.trim(), rules });
  },

  joinRoom: (code) => {
    const { nickname } = get();
    if (!nickname.trim() || !code.trim()) return;
    socket?.emit(C2S.JOIN_ROOM, { nickname: nickname.trim(), code: code.trim() });
  },

  leaveRoom: () => {
    socket?.emit(C2S.LEAVE_ROOM);
    set({
      roomState: null,
      gameEndPayload: null,
      inputBuffer: [null, null, null, null],
      cursorPos: 0,
    });
  },

  toggleReady: () => {
    socket?.emit(C2S.TOGGLE_READY);
  },

  updateRules: (rules) => {
    socket?.emit(C2S.UPDATE_RULES, { rules });
  },

  submitSecret: () => {
    const { inputBuffer, roomState } = get();
    const codeLength = roomState?.rules.codeLength ?? 4;
    socket?.emit(C2S.SUBMIT_SECRET, { secret: inputBuffer.slice(0, codeLength) });
  },

  submitGuess: () => {
    const { inputBuffer, roomState } = get();
    const codeLength = roomState?.rules.codeLength ?? 4;
    socket?.emit(C2S.SUBMIT_GUESS, { guess: inputBuffer.slice(0, codeLength) });
    set({ inputBuffer: Array<null>(codeLength).fill(null), cursorPos: 0 });
  },

  requestRematch: () => {
    socket?.emit(C2S.REQUEST_REMATCH);
  },

  // ── dev ────────────────────────────────────────────────────────────────────

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
