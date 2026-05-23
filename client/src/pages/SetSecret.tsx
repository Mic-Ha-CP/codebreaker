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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border-soft px-6 py-4 text-sm tracking-terminal">
        <div>
          ROOM <span className="text-muted">#</span>{roomState?.code ?? '—'}
          <span className="text-muted"> // SET YOUR CODE</span>
        </div>
        <TermButton variant="secondary" onClick={leaveRoom}>[ LEAVE ]</TermButton>
      </header>

      <main className="flex-1 grid grid-cols-[1fr_280px]">
        <section className="flex flex-col items-center justify-center p-12 gap-10 border-r border-border-soft">
          <DigitCells
            values={digits}
            cursor={locked ? null : cursorPos}
            size="lg"
            onCellClick={locked ? undefined : setCursor}
          />
          <p className="text-sm text-muted tracking-terminal">
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

        <aside className="p-8">
          <h3 className="text-xs uppercase tracking-terminal text-muted mb-4">opponent</h3>
          <p className="font-mono text-sm">&gt; setting code...</p>
        </aside>
      </main>
    </div>
  );
}
