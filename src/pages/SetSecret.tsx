import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DigitCells } from "@/components/mastermind/DigitCells";
import { NumberPad } from "@/components/mastermind/NumberPad";
import { TermButton } from "@/components/mastermind/TermButton";

export default function SetSecret() {
  const navigate = useNavigate();
  const [digits, setDigits] = useState<(number | null)[]>([null, null, null, null]);
  const [locked, setLocked] = useState(false);

  const cursor = locked ? null : digits.findIndex((d) => d === null);

  const onDigit = (d: number) => {
    if (locked) return;
    if (digits.includes(d)) return; // no repeats
    const i = digits.findIndex((x) => x === null);
    if (i === -1) return;
    const next = [...digits];
    next[i] = d;
    setDigits(next);
  };
  const onDelete = () => {
    if (locked) return;
    const filled = [...digits];
    for (let i = filled.length - 1; i >= 0; i--) {
      if (filled[i] !== null) {
        filled[i] = null;
        break;
      }
    }
    setDigits(filled);
  };
  const onSubmit = () => {
    if (digits.every((d) => d !== null)) setLocked(true);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border-soft px-6 py-4 text-sm tracking-terminal">
        <div>
          ROOM <span className="text-muted">#</span>X3K9
          <span className="text-muted"> // SET YOUR CODE</span>
        </div>
        <TermButton variant="secondary" onClick={() => navigate("/lobby")}>[ LEAVE ]</TermButton>
      </header>

      <main className="flex-1 grid grid-cols-[1fr_280px]">
        <section className="flex flex-col items-center justify-center p-12 gap-10 border-r border-border-soft">
          <DigitCells values={digits} cursor={cursor} size="lg" />
          <p className="text-sm text-muted tracking-terminal">Pick 4 digits. Repeats not allowed.</p>

          <div className="w-full max-w-[420px]">
            <NumberPad
              onDigit={onDigit}
              onDelete={onDelete}
              onSubmit={onSubmit}
              canSubmit={digits.every((d) => d !== null) && !locked}
              disabled={locked}
            />
          </div>

          {locked && (
            <div className="font-mono text-muted text-sm">
              &gt; code locked. waiting for opponent...
            </div>
          )}
        </section>

        <aside className="p-8">
          <h3 className="text-xs uppercase tracking-terminal text-muted mb-4">opponent</h3>
          <p className="font-mono text-sm">&gt; setting code...</p>
          <div className="mt-8">
            <TermButton variant="ghost" onClick={() => navigate("/game")}>
              [mock: continue →]
            </TermButton>
          </div>
        </aside>
      </main>
    </div>
  );
}
