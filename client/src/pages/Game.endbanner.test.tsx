// The end-of-game banner replaced a modal that covered both history panels.
// These render the real Game screen at phase 'ended' and assert the thing that
// complaint was about: the boards stay readable.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ClientRoomState, GuessResult, Rules } from '../../../shared/types';

vi.mock('@/components/codebreaker/NumberPad', () => ({
  NumberPad: () => <div data-testid="number-pad" />,
}));

import Game from './Game';
import { useGameStore } from '@/state/gameStore';

const RULES: Rules = { codeLength: 4, allowRepeats: false, totalRounds: 10 };
const ME = 'me';
const OPP = 'opp';
const MY_CODE = [7, 3, 9, 1];
const OPP_CODE = [5, 3, 4, 2];

const guess = (g: number[], exact: number, partial: number, guesserId: string): GuessResult => ({
  guess: g,
  exact,
  partial,
  guesserId,
  round: 1,
  timestamp: 0,
});

function endedRoom(
  over: {
    winnerId?: string | null;
    isDraw?: boolean;
    // Deliberately NOT defaulted with ??: an explicit null means "the server
    // did not reveal this", which is a case worth being able to set up.
    oppSecret?: number[] | null;
  } = {}
): ClientRoomState {
  return {
    code: 'AAAA',
    phase: 'ended',
    rules: RULES,
    players: [
      { id: ME, nickname: 'me', isHost: true, isReady: true, connected: true, disconnectedAt: null },
      { id: OPP, nickname: 'them', isHost: false, isReady: true, connected: true, disconnectedAt: null },
    ],
    spectators: [],
    currentRound: 6,
    currentTurnPlayerId: null,
    playerStates: {
      [ME]: {
        secret: MY_CODE,
        history: [guess([4, 8, 3, 1], 2, 1, ME), guess(OPP_CODE, 4, 0, ME)],
        hasGuessedCorrectly: true,
        guessedCorrectlyAtRound: 6,
      },
      [OPP]: {
        secret: 'oppSecret' in over ? over.oppSecret! : OPP_CODE,
        history: [guess([0, 2, 6, 9], 0, 1, OPP), guess(MY_CODE, 4, 0, OPP)],
        hasGuessedCorrectly: true,
        guessedCorrectlyAtRound: 6,
      },
    },
    winnerId: over.winnerId ?? null,
    isDraw: over.isDraw ?? false,
    pendingTiebreaker: null,
    botDifficulties: {},
    isPrivate: false,
    displayNumber: 1,
    opponentTypingBuffer: null,
    createdAt: 0,
    lastActivityAt: 0,
  };
}

function mount(state: ClientRoomState, gameEndPayload = null as never) {
  useGameStore.setState({
    myId: ME,
    roomState: state,
    gameEndPayload,
    inputBuffer: [null, null, null, null],
    cursorPos: 0,
  });
  return render(<Game />);
}

const banner = () => screen.getByTestId('result-banner');

describe('end-of-game banner', () => {
  beforeEach(() => {
    useGameStore.setState({ myId: null, roomState: null, gameEndPayload: null });
  });

  it('leaves both boards on screen — the whole point of killing the modal', () => {
    const { container } = mount(endedRoom({ winnerId: ME }));

    expect(screen.getByText('YOU')).toBeTruthy();
    expect(screen.getByText('OPPONENT')).toBeTruthy();
    // Your own secret still shown, as during play.
    expect(screen.getByText(/your secret:/i)).toBeTruthy();
    // Every guess row from both sides is still rendered.
    const text = container.textContent ?? '';
    expect(text).toContain('E2·P1');
    expect(text).toContain('E0·P1');
    // ...and nothing is a full-screen overlay any more.
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
  });

  it('swaps the number pad for the result, and only once the game is over', () => {
    const live = {
      ...endedRoom(),
      phase: 'in_progress' as const,
      currentTurnPlayerId: ME,
    };
    const { unmount } = mount(live);
    expect(screen.getByTestId('number-pad')).toBeTruthy();
    expect(screen.queryByTestId('result-banner')).toBeNull();
    unmount();

    mount(endedRoom({ winnerId: ME }));
    expect(screen.queryByTestId('number-pad')).toBeNull();
    expect(banner()).toBeTruthy();
  });

  it('reads the outcome off the room state', () => {
    const { unmount: u1 } = mount(endedRoom({ winnerId: ME }));
    expect(within(banner()).getByText('YOU WIN')).toBeTruthy();
    u1();

    const { unmount: u2 } = mount(endedRoom({ winnerId: OPP }));
    expect(within(banner()).getByText('YOU LOSE')).toBeTruthy();
    u2();

    mount(endedRoom({ isDraw: true }));
    expect(within(banner()).getByText('DRAW')).toBeTruthy();
  });

  it('reveals the opponent code on a win or a loss', () => {
    mount(endedRoom({ winnerId: ME }));
    expect(banner().textContent).toContain("opponent's code was");
    expect(within(banner()).getByText('5 3 4 2')).toBeTruthy();
  });

  it('shows both codes symmetrically on a draw', () => {
    // "opponent's code was" reads wrong when both players cracked it.
    mount(endedRoom({ isDraw: true }));
    const text = banner().textContent ?? '';
    expect(text).not.toContain("opponent's code was");
    expect(text).toContain('codes — yours');
    expect(text).toContain('theirs');
    expect(within(banner()).getByText('7 3 9 1')).toBeTruthy();
    expect(within(banner()).getByText('5 3 4 2')).toBeTruthy();
  });

  it('offers rematch and leave', () => {
    mount(endedRoom({ winnerId: ME }));
    expect(within(banner()).getByText(/REMATCH/)).toBeTruthy();
    expect(within(banner()).getByText(/LEAVE/)).toBeTruthy();
  });

  it('falls back to the game_end payload when room state has no revealed secret', () => {
    mount(endedRoom({ winnerId: ME, oppSecret: null }), {
      winnerId: ME,
      isDraw: false,
      reason: 'guessed',
      revealedSecrets: { [OPP]: [1, 1, 1, 1] },
    } as never);
    expect(within(banner()).getByText('1 1 1 1')).toBeTruthy();
  });

  it('mobile strip carries the reveal instead of the typing buffer', () => {
    const { container } = mount(endedRoom({ winnerId: ME }));
    const strip = container.querySelector('.md\\:hidden.px-4')!;
    expect(strip.textContent).toContain('OPP:');
    expect(strip.textContent).toContain('5 3 4 2');
    expect(strip.textContent).toContain('(revealed)');
  });
});
