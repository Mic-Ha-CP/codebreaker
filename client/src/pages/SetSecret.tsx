import { useEffect } from "react";
import { DigitCells } from "@/components/codebreaker/DigitCells";
import { NumberPad } from "@/components/codebreaker/NumberPad";
import { TermButton } from "@/components/codebreaker/TermButton";
import { useGameStore } from "@/state/gameStore";

export default function SetSecret() {
  const {
    myId,
    roomState,
    inputBuffer,
    cursorPos,
    inputDigit,
    deleteDigit,
    setCursor,
    submitSecret,
    leaveRoom,
  } = useGameStore();

  const rules = roomState?.rules;
  const codeLength = rules?.codeLength ?? 4;
  const digits = inputBuffer.slice(0, codeLength);
  const locked = roomState?.playerStates?.[myId ?? '']?.secret != null;
  const canSubmit = digits.every((d) => d !== null) && !locked;

  const onDigit = (d: number) => {
    if (locked) return;
    if (!rules?.allowRepeats && digits.includes(d)) return;
    inputDigit(d);
  };

  const onDelete = () => {
    if (locked) return;
    deleteDigit();
  };

  const onSubmit = () => {
    if (!canSubmit) return;
    submitSecret();
  };

  // Hardware keyboard: same shape as Game.tsx, plus the SetSecret
  // no-repeats guard. Disabled once the secret is locked in.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (locked) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        onDigit(parseInt(e.key, 10));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        deleteDigit();
      } else if (e.key === 'Enter') {
        if (canSubmit) {
          e.preventDefault();
          submitSecret();
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
  }, [locked, canSubmit, cursorPos, codeLength, digits, rules?.allowRepeats, inputDigit, deleteDigit, setCursor, submitSecret]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border-soft px-6 py-4 text-sm tracking-terminal">
        <div>
          ROOM <span className="text-muted">#</span>{roomState?.code ?? '—'}
          <span className="text-muted"> // SET YOUR CODE</span>
        </div>
        <TermButton variant="secondary" onClick={leaveRoom}>[ LEAVE ]</TermButton>
      </header>

      <main className="flex-1 flex flex-col md:grid md:grid-cols-[1fr_280px]">
        <section className="flex flex-col items-center justify-center p-6 md:p-12 gap-8 md:gap-10 md:border-r md:border-border-soft">
          <DigitCells
            values={digits}
            cursor={locked ? null : cursorPos}
            size="lg"
            onCellClick={locked ? undefined : setCursor}
          />
          <p className="text-sm text-muted tracking-terminal text-center">
            Pick {codeLength} digits.{rules?.allowRepeats ? '' : ' Repeats not allowed.'}
          </p>

          <div className="w-full max-w-[420px]">
            <NumberPad
              onDigit={onDigit}
              onDelete={onDelete}
              onSubmit={onSubmit}
              canSubmit={canSubmit}
              disabled={locked}
            />
          </div>

          {locked && (
            <p className="font-mono text-muted text-sm">&gt; code locked. waiting for opponent...</p>
          )}
        </section>

        <aside className="p-6 md:p-8 border-t md:border-t-0 border-border-soft">
          <h3 className="text-xs uppercase tracking-terminal text-muted mb-4">opponent</h3>
          <p className="font-mono text-sm">&gt; setting code...</p>
        </aside>
      </main>
    </div>
  );
}
