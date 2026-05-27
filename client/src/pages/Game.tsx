import { useEffect, useState } from "react";
import { TermButton } from "@/components/codebreaker/TermButton";
import { NumberPad } from "@/components/codebreaker/NumberPad";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/state/gameStore";
import type { GuessResult } from "../../../shared/types";

type DigitMark = 'exact' | 'partial' | 'wrong';

// Per-digit mark using the same exact-first, then partial (left-to-right
// frequency-consuming) rule as server/src/game/feedback.ts.
function markDigits(guess: number[], secret: number[]): DigitMark[] {
  const marks: DigitMark[] = guess.map(() => 'wrong');
  const consumed = new Array(secret.length).fill(false);

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) {
      marks[i] = 'exact';
      consumed[i] = true;
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'exact') continue;
    for (let j = 0; j < secret.length; j++) {
      if (!consumed[j] && secret[j] === guess[i]) {
        marks[i] = 'partial';
        consumed[j] = true;
        break;
      }
    }
  }
  return marks;
}

const MARK_COLOR: Record<DigitMark, string> = {
  exact: '#4ADE80',
  partial: '#FBBF24',
  wrong: '#ffffff',
};

function GuessLine({ row, marks }: { row: GuessResult; marks?: DigitMark[] }) {
  return (
    <div className="font-mono flex items-center gap-6 text-base">
      <span className="text-muted">  </span>
      <span className="tracking-[0.3em] flex gap-2">
        {row.guess.map((d, i) => (
          <span
            key={i}
            style={marks ? { color: MARK_COLOR[marks[i]] } : undefined}
          >
            {d}
          </span>
        ))}
      </span>
      <span className="text-muted text-sm">
        E{row.exact}<span className="px-1">·</span>P{row.partial}
      </span>
    </div>
  );
}

function PendingLine({
  values,
  prefix,
  label,
  cursor,
}: {
  values: (number | null)[];
  prefix: string;
  label?: string;
  cursor?: number | null;
}) {
  return (
    <div className="font-mono flex items-center gap-6 text-base">
      <span className="text-foreground">{prefix}</span>
      <span className="tracking-[0.3em] flex gap-2">
        {values.map((v, i) => (
          <span
            key={i}
            className={cn(
              cursor === i
                ? "text-foreground cursor-blink"
                : v === null
                ? "text-muted"
                : "text-foreground"
            )}
          >
            {v === null ? "_" : v}
          </span>
        ))}
      </span>
      {label && <span className="text-muted text-xs">{label}</span>}
    </div>
  );
}

export default function Game() {
  const {
    myId,
    roomState,
    inputBuffer,
    cursorPos,
    inputDigit,
    deleteDigit,
    setCursor,
    submitGuess,
    leaveRoom,
  } = useGameStore();

  const [showHelp, setShowHelp] = useState(false);
  const [disconnectSecs, setDisconnectSecs] = useState(30);

  const rules = roomState?.rules;
  const codeLength = rules?.codeLength ?? 4;
  const yourTurn = roomState?.currentTurnPlayerId === myId;
  const opponent = roomState?.players.find((p) => p.id !== myId) ?? null;
  const opponentId = opponent?.id ?? '';
  const myHistory = (myId ? roomState?.playerStates[myId]?.history : undefined) ?? [];
  const oppHistory = (opponentId ? roomState?.playerStates[opponentId]?.history : undefined) ?? [];
  const mySecret = (myId ? roomState?.playerStates[myId]?.secret : undefined) ?? null;
  const oppTyping = roomState?.opponentTypingBuffer ?? null;
  const opponentDisconnected = opponent
    ? !opponent.connected && opponent.disconnectedAt !== null
    : false;

  useEffect(() => {
    if (!opponentDisconnected) { setDisconnectSecs(30); return; }
    if (disconnectSecs <= 0) return;
    const t = setTimeout(() => setDisconnectSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [opponentDisconnected, disconnectSecs]);

  const digits = inputBuffer.slice(0, codeLength);

  const onDigit = (d: number) => {
    if (!yourTurn) return;
    // Guesses may always repeat digits, regardless of rules.allowRepeats —
    // that constraint only governs the secret code itself.
    inputDigit(d);
  };

  const onDelete = () => {
    if (!yourTurn) return;
    deleteDigit();
  };

  const onSubmit = () => {
    if (!yourTurn || !digits.every((d) => d !== null)) return;
    submitGuess();
  };

  // Hardware keyboard: digits, backspace, enter, arrows.
  // Ignored when it's not your turn or the buffer is otherwise locked.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!yourTurn || opponentDisconnected) return;
      // Don't hijack keys when the user is typing in an input/textarea
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        inputDigit(parseInt(e.key, 10));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        deleteDigit();
      } else if (e.key === 'Enter') {
        if (digits.every((d) => d !== null)) {
          e.preventDefault();
          submitGuess();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCursor(Math.max(0, cursorPos - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCursor(Math.min(codeLength - 1, cursorPos + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [yourTurn, opponentDisconnected, cursorPos, codeLength, digits, inputDigit, deleteDigit, setCursor, submitGuess]);

  const status = opponentDisconnected
    ? `opponent disconnected — ${disconnectSecs}s`
    : yourTurn
    ? "your turn. enter your guess."
    : "opponent's turn.";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border-soft px-6 py-3 text-xs tracking-terminal text-muted">
        <div className="flex items-center gap-8">
          <span className="text-foreground">ROOM #{roomState?.code}</span>
          <span>
            ROUND <span className="text-foreground">{roomState?.currentRound ?? 1}</span>{" "}
            / {rules?.totalRounds ?? 10}
          </span>
          <span>{codeLength}d · {rules?.allowRepeats ? 'repeats' : 'no-rep'}</span>
        </div>
        <TermButton variant="ghost" onClick={leaveRoom}>[ LEAVE ]</TermButton>
      </header>

      <div className="flex-1 grid grid-cols-2">
        <section className="border-r border-border p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-base font-semibold tracking-terminal">YOU</h2>
            <p className="text-xs text-muted tracking-terminal">// breaking opponent's code</p>
            {mySecret && (
              <p className="text-xs text-muted tracking-terminal mt-2">
                your secret: <span className="tracking-[0.3em] ml-1">{mySecret.join(" ")}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {/* Guesser side — never highlight per-digit (player must work out which digits are correct). */}
            {myHistory.map((r, i) => <GuessLine key={i} row={r} />)}
            <PendingLine
              prefix=">"
              values={digits}
              cursor={yourTurn ? cursorPos : null}
              label={!yourTurn ? "(locked)" : undefined}
            />
          </div>
        </section>

        <section className="p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-base font-semibold tracking-terminal">OPPONENT</h2>
            <p className="text-xs text-muted tracking-terminal">// breaking your code</p>
          </div>
          <div className="flex flex-col gap-2">
            {/* Code-setter side — we know our own secret, so we can color each digit
                green/amber/white. Compute marks client-side; no server change needed. */}
            {oppHistory.map((r, i) => (
              <GuessLine
                key={i}
                row={r}
                marks={mySecret ? markDigits(r.guess, mySecret) : undefined}
              />
            ))}
            {oppTyping && (
              <PendingLine prefix=">" values={oppTyping} label="(typing...)" />
            )}
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-border-soft px-6 py-3 text-sm tracking-terminal">
        <div>
          <span className="text-muted">STATUS:</span> <span>{status}</span>
        </div>
        <button
          onClick={() => setShowHelp((s) => !s)}
          className="border border-border w-8 h-8 hover:bg-foreground hover:text-background transition-colors"
        >
          ?
        </button>
      </div>

      <div className="border-t border-border-soft p-6">
        <div className="max-w-[640px] mx-auto">
          <NumberPad
            onDigit={onDigit}
            onDelete={onDelete}
            onSubmit={onSubmit}
            canSubmit={yourTurn && digits.every((d) => d !== null)}
            disabled={!yourTurn || opponentDisconnected}
          />
        </div>
      </div>

      {showHelp && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/80"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="border border-border bg-background p-8 max-w-md font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm tracking-terminal text-muted mb-4">// FEEDBACK</h3>
            <p className="mb-2">E = exact   <span className="text-muted">(digit and position correct)</span></p>
            <p>P = partial <span className="text-muted">(digit correct, wrong position)</span></p>
            <div className="mt-6 flex justify-end">
              <TermButton variant="secondary" onClick={() => setShowHelp(false)}>[ CLOSE ]</TermButton>
            </div>
          </div>
        </div>
      )}

      {opponentDisconnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90">
          <div className="border border-border bg-background p-10 max-w-sm w-full font-mono text-center">
            <h3 className="text-sm tracking-terminal mb-6">OPPONENT DISCONNECTED</h3>
            <p className="text-muted mb-8">reconnecting... {disconnectSecs}s</p>
            <TermButton
              variant="filled"
              disabled={disconnectSecs > 0}
              onClick={leaveRoom}
            >
              [ CLAIM WIN ]
            </TermButton>
          </div>
        </div>
      )}
    </div>
  );
}
