import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ClientRoomState, Rules } from '../../../shared/types';

// Fake socket — collects event handlers so tests can fire them
type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Handler>();
const emitted: Array<{ event: string; payload: unknown }> = [];

const fakeSocket = {
  id: 'mySocketId',
  connected: false,
  on(event: string, handler: Handler) {
    handlers.set(event, handler);
  },
  emit(event: string, payload: unknown) {
    emitted.push({ event, payload });
  },
  disconnect() {
    fakeSocket.connected = false;
  },
};

vi.mock('socket.io-client', () => ({
  io: () => fakeSocket,
  Socket: class {},
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

// Imported AFTER the mocks above so they take effect
import { useGameStore } from './gameStore';

const RULES_4: Rules = { codeLength: 4, allowRepeats: false, totalRounds: 10 };
const RULES_3: Rules = { codeLength: 3, allowRepeats: false, totalRounds: 10 };

function mockRoomState(rules: Rules, phase: ClientRoomState['phase']): ClientRoomState {
  return {
    code: 'TEST',
    phase,
    rules,
    players: [],
    spectators: [],
    currentRound: 0,
    currentTurnPlayerId: null,
    playerStates: {},
    winnerId: null,
    isDraw: false,
    pendingTiebreaker: null,
    opponentTypingBuffer: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

beforeEach(() => {
  handlers.clear();
  emitted.length = 0;
  // Reset zustand store to its initial shape
  useGameStore.setState({
    connected: false,
    myId: null,
    nickname: '',
    roomState: null,
    gameEndPayload: null,
    inputBuffer: [null, null, null, null],
    cursorPos: 0,
    opponentTyping: null,
  });
});

describe('gameStore — input actions', () => {
  it('inputDigit appends at cursor and advances', () => {
    useGameStore.setState({ roomState: mockRoomState(RULES_4, 'in_progress') });
    useGameStore.getState().inputDigit(5);
    expect(useGameStore.getState().inputBuffer).toEqual([5, null, null, null]);
    expect(useGameStore.getState().cursorPos).toBe(1);

    useGameStore.getState().inputDigit(3);
    expect(useGameStore.getState().inputBuffer).toEqual([5, 3, null, null]);
    expect(useGameStore.getState().cursorPos).toBe(2);
  });

  it('inputDigit clamps at codeLength', () => {
    useGameStore.setState({
      roomState: mockRoomState(RULES_4, 'in_progress'),
      inputBuffer: [1, 2, 3, 4],
      cursorPos: 4,
    });
    useGameStore.getState().inputDigit(9);
    expect(useGameStore.getState().inputBuffer).toEqual([1, 2, 3, 4]);
    expect(useGameStore.getState().cursorPos).toBe(4);
  });

  it('inputDigit overwrites at current cursor position', () => {
    useGameStore.setState({
      roomState: mockRoomState(RULES_4, 'in_progress'),
      inputBuffer: [1, 2, null, null],
      cursorPos: 0,
    });
    useGameStore.getState().inputDigit(9);
    expect(useGameStore.getState().inputBuffer).toEqual([9, 2, null, null]);
    expect(useGameStore.getState().cursorPos).toBe(1);
  });

  it('deleteDigit removes preceding cell and moves cursor back', () => {
    useGameStore.setState({
      roomState: mockRoomState(RULES_4, 'in_progress'),
      inputBuffer: [1, 2, 3, null],
      cursorPos: 3,
    });
    useGameStore.getState().deleteDigit();
    expect(useGameStore.getState().inputBuffer).toEqual([1, 2, null, null]);
    expect(useGameStore.getState().cursorPos).toBe(2);
  });

  it('deleteDigit at cursor=0 with empty cell is a no-op', () => {
    useGameStore.setState({
      roomState: mockRoomState(RULES_4, 'in_progress'),
      inputBuffer: [null, null, null, null],
      cursorPos: 0,
    });
    useGameStore.getState().deleteDigit();
    expect(useGameStore.getState().inputBuffer).toEqual([null, null, null, null]);
    expect(useGameStore.getState().cursorPos).toBe(0);
  });

  it('deleteDigit at cursor=0 with a value clears index 0', () => {
    useGameStore.setState({
      roomState: mockRoomState(RULES_4, 'in_progress'),
      inputBuffer: [5, 2, null, null],
      cursorPos: 0,
    });
    useGameStore.getState().deleteDigit();
    expect(useGameStore.getState().inputBuffer).toEqual([null, 2, null, null]);
    expect(useGameStore.getState().cursorPos).toBe(0);
  });

  it('setCursor moves the cursor', () => {
    useGameStore.getState().setCursor(2);
    expect(useGameStore.getState().cursorPos).toBe(2);
  });
});

describe('gameStore — phase change resets input buffer to current codeLength', () => {
  beforeEach(() => {
    useGameStore.getState().connect();
  });

  it('lobby → setting_secret with codeLength=3 produces a length-3 null buffer', () => {
    // Seed prior state (lobby)
    handlers.get('s:room_state')!(mockRoomState(RULES_3, 'lobby'));
    expect(useGameStore.getState().inputBuffer).toHaveLength(3);
    expect(useGameStore.getState().inputBuffer).toEqual([null, null, null]);

    // Dirty the buffer
    useGameStore.setState({ inputBuffer: [9, 8, 7], cursorPos: 3 });

    // Phase change → setting_secret with same rules
    handlers.get('s:room_state')!(mockRoomState(RULES_3, 'setting_secret'));
    expect(useGameStore.getState().inputBuffer).toEqual([null, null, null]);
    expect(useGameStore.getState().cursorPos).toBe(0);
  });

  it('same-phase room_state does NOT reset the input buffer', () => {
    handlers.get('s:room_state')!(mockRoomState(RULES_4, 'in_progress'));
    useGameStore.setState({ inputBuffer: [1, 2, null, null], cursorPos: 2 });

    handlers.get('s:room_state')!(mockRoomState(RULES_4, 'in_progress'));
    expect(useGameStore.getState().inputBuffer).toEqual([1, 2, null, null]);
    expect(useGameStore.getState().cursorPos).toBe(2);
  });

  it('phase change uses the NEW rules.codeLength for the reset', () => {
    // Start in lobby with codeLength=4
    handlers.get('s:room_state')!(mockRoomState(RULES_4, 'lobby'));
    expect(useGameStore.getState().inputBuffer).toHaveLength(4);

    // Switch to setting_secret with codeLength=3
    handlers.get('s:room_state')!(mockRoomState(RULES_3, 'setting_secret'));
    expect(useGameStore.getState().inputBuffer).toHaveLength(3);
  });
});

describe('gameStore — socket emit actions', () => {
  beforeEach(() => {
    useGameStore.getState().connect();
  });

  it('submitGuess emits with a buffer sliced to codeLength', () => {
    useGameStore.setState({
      roomState: mockRoomState(RULES_3, 'in_progress'),
      inputBuffer: [1, 2, 3, 9], // stale 4-slot buffer
      cursorPos: 3,
    });
    useGameStore.getState().submitGuess();
    const ev = emitted.find((e) => e.event === 'c:submit_guess');
    expect(ev?.payload).toEqual({ guess: [1, 2, 3] });
    // Buffer cleared to current codeLength
    expect(useGameStore.getState().inputBuffer).toEqual([null, null, null]);
    expect(useGameStore.getState().cursorPos).toBe(0);
  });

  it('submitSecret emits with a buffer sliced to codeLength', () => {
    useGameStore.setState({
      roomState: mockRoomState(RULES_3, 'setting_secret'),
      inputBuffer: [4, 5, 6, 7],
    });
    useGameStore.getState().submitSecret();
    const ev = emitted.find((e) => e.event === 'c:submit_secret');
    expect(ev?.payload).toEqual({ secret: [4, 5, 6] });
  });

  it('createRoom requires a nickname', () => {
    useGameStore.setState({ nickname: '' });
    useGameStore.getState().createRoom();
    expect(emitted.find((e) => e.event === 'c:create_room')).toBeUndefined();

    useGameStore.setState({ nickname: 'alice' });
    useGameStore.getState().createRoom();
    expect(emitted.find((e) => e.event === 'c:create_room')).toBeDefined();
  });
});

describe('gameStore — reveal delay defers room_state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().connect();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('after reveal_guess, the next room_state apply is held for 600ms', () => {
    // Seed with an initial state
    handlers.get('s:room_state')!(mockRoomState(RULES_4, 'in_progress'));
    const initial = useGameStore.getState().roomState;
    expect(initial?.currentRound).toBe(0);

    // Reveal fires
    handlers.get('s:reveal_guess')!({ result: {} });

    // New state arrives — should NOT apply yet
    const later: ClientRoomState = { ...mockRoomState(RULES_4, 'in_progress'), currentRound: 2 };
    handlers.get('s:room_state')!(later);
    expect(useGameStore.getState().roomState?.currentRound).toBe(0);

    // After 600ms the deferred state lands
    vi.advanceTimersByTime(600);
    expect(useGameStore.getState().roomState?.currentRound).toBe(2);
  });

  it('with no recent reveal, room_state applies immediately', () => {
    // Flush any reveal-hold left over from earlier tests (module-level state).
    vi.advanceTimersByTime(700);
    handlers.get('s:room_state')!(mockRoomState(RULES_4, 'in_progress'));
    expect(useGameStore.getState().roomState).not.toBeNull();
  });
});
