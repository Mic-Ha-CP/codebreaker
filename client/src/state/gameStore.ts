import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { C2S } from '../../../shared/events';
import type {
  BotDifficulty,
  ClientRoomState,
  ClientPlayerGameState,
  GameEndPayload,
  Player,
  Rules,
  RoomPhase,
} from '../../../shared/types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const PLAYER_ID_KEY = 'cb_playerId';
const SESSION_KEY = 'cb_session';

// Stable client-generated identity. Decouples player identity from
// socket.id so reconnects re-bind to the same player slot server-side.
function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

interface StoredSession {
  roomCode: string;
  playerId: string;
}

function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function setStoredSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// Module-level socket reference — initialized once
let socket: Socket | null = null;

function connectSocket(): Socket {
  if (socket?.connected) return socket;
  // Auto-reconnect is on. A successful low-level reconnect emits 'connect'
  // again; the handler then sends c:reconnect with our stable playerId so
  // the server re-binds the new socket to our existing player slot.
  socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
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
  forceReconnect: () => void;
  createRoom: (rules?: Partial<Rules>) => void;
  createSolo: (difficulty: BotDifficulty) => void;
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
    botDifficulty: null,
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

// ─── Reveal delay (600ms after a guess) ───────────────────────────────────────
// When `s:reveal_guess` arrives, we hold off applying the next `s:room_state`
// briefly so the new guess line has time to "settle" visually before history
// updates.
export const REVEAL_DELAY_MS = 600;
let revealHoldUntil = 0;
let deferredRoomStateTimer: ReturnType<typeof setTimeout> | null = null;

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

    const playerId = getOrCreatePlayerId();
    set({ myId: playerId });

    s.on('connect', () => {
      set({ connected: true, myId: playerId });
      // If we already have a session (mid-game disconnect, then auto-reconnect
      // fires, OR a tab refresh), re-bind to the existing player slot.
      const session = getStoredSession();
      if (session) {
        s.emit(C2S.RECONNECT, session);
      }
    });

    s.on('disconnect', () => {
      set({ connected: false });
    });

    const applyRoomState = (state: ClientRoomState) => {
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

      // Persist session on every room_state so a fresh page load can recover.
      setStoredSession({ roomCode: state.code, playerId });

      set({
        roomState: state,
        ...(phaseChanged ? {
          inputBuffer: Array<null>(state.rules.codeLength).fill(null),
          cursorPos: 0,
        } : {}),
      });
    };

    s.on('s:room_state', (state: ClientRoomState) => {
      const remaining = revealHoldUntil - Date.now();
      if (remaining > 0) {
        // A reveal is in-flight — defer this state apply until the delay elapses
        if (deferredRoomStateTimer) clearTimeout(deferredRoomStateTimer);
        deferredRoomStateTimer = setTimeout(() => {
          deferredRoomStateTimer = null;
          applyRoomState(state);
        }, remaining);
      } else {
        applyRoomState(state);
      }
    });

    s.on('s:opponent_typing', ({ buffer }: { buffer: (number | null)[] }) => {
      set({ opponentTyping: buffer });
    });

    s.on('s:reveal_guess', () => {
      revealHoldUntil = Date.now() + REVEAL_DELAY_MS;
      // Clear the opponent's typing buffer so it doesn't linger over the reveal
      set({ opponentTyping: null });
    });

    s.on('s:game_end', (payload: GameEndPayload) => {
      console.log('[store] game_end:', payload);
      set({ gameEndPayload: payload });
    });

    s.on('s:error', ({ code, message }: { code: string; message: string }) => {
      // If the server can't honour our stored session (room gone, slot
      // freed, etc.) wipe it so we don't keep retrying every reconnect.
      if (code === 'reconnect_failed') {
        clearStoredSession();
        set({
          roomState: null,
          gameEndPayload: null,
          inputBuffer: [null, null, null, null],
          cursorPos: 0,
        });
        return;
      }
      toast.error(message);
    });

    s.on('s:kick', ({ reason }: { reason: string }) => {
      toast.warning(`Kicked: ${reason}`);
      clearStoredSession();
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

  forceReconnect: () => {
    // Used by the visibility handler when we suspect the WebView/tab was
    // frozen and the socket silently died. Cheap when already connected.
    if (!socket) return;
    if (!socket.connected) socket.connect();
  },

  createRoom: (rules) => {
    const { nickname } = get();
    if (!nickname.trim()) return;
    const playerId = getOrCreatePlayerId();
    socket?.emit(C2S.CREATE_ROOM, { playerId, nickname: nickname.trim(), rules });
  },

  createSolo: (difficulty) => {
    const { nickname } = get();
    if (!nickname.trim()) return;
    const playerId = getOrCreatePlayerId();
    socket?.emit(C2S.CREATE_SOLO, { playerId, nickname: nickname.trim(), difficulty });
  },

  joinRoom: (code) => {
    const { nickname } = get();
    if (!nickname.trim() || !code.trim()) return;
    const playerId = getOrCreatePlayerId();
    socket?.emit(C2S.JOIN_ROOM, { playerId, nickname: nickname.trim(), code: code.trim() });
  },

  leaveRoom: () => {
    socket?.emit(C2S.LEAVE_ROOM);
    clearStoredSession();
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
