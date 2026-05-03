import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TermButton } from "@/components/mastermind/TermButton";

interface GuessRow { guess: number[]; exact: number; partial: number }

const YOUR_HISTORY: GuessRow[] = [
  { guess: [4, 8, 3, 1], exact: 2, partial: 1 },
  { guess: [1, 2, 5, 9], exact: 1, partial: 1 },
  { guess: [7, 0, 6, 2], exact: 0, partial: 1 },
  { guess: [4, 8, 1, 3], exact: 4, partial: 0 },
];
const OPP_HISTORY: GuessRow[] = [
  { guess: [5, 2, 9, 0], exact: 1, partial: 2 },
  { guess: [7, 3, 4, 1], exact: 0, partial: 2 },
  { guess: [5, 2, 9, 1], exact: 2, partial: 1 },
];

function GuessLine({ row }: { row: GuessRow }) {
  return (
    <div className="font-mono flex items-center gap-6 text-base">
      <span className="text-muted">  </span>
      <span className="tracking-[0.3em]">{row.guess.join(" ")}</span>
      <span className="text-muted text-sm">E{row.exact}<span className="px-1">·</span>P{row.partial}</span>
    </div>
  );
}

type Outcome = "win" | "lose" | "draw";

export default function End() {
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<Outcome>("win");

  const headline = outcome === "win" ? "YOU WIN" : outcome === "lose" ? "YOU LOSE" : "DRAW";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border-soft px-6 py-3 text-xs tracking-terminal">
        <div className="flex items-center gap-8">
          <span className="text-foreground">ROOM #X3K9</span>
          <span className="text-muted">GAME OVER</span>
        </div>
        <div className="flex items-center gap-3">
          <TermButton variant="ghost" onClick={() => setOutcome("win")}>[mock: win]</TermButton>
          <TermButton variant="ghost" onClick={() => setOutcome("lose")}>[mock: lose]</TermButton>
          <TermButton variant="ghost" onClick={() => setOutcome("draw")}>[mock: draw]</TermButton>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-2 relative">
        <section className="border-r border-border p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-base font-semibold tracking-terminal">YOU</h2>
            <p className="text-xs text-muted tracking-terminal">// breaking opponent's code</p>
          </div>
          <div className="flex flex-col gap-2">
            {YOUR_HISTORY.map((r, i) => <GuessLine key={i} row={r} />)}
          </div>
        </section>

        <section className="p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-base font-semibold tracking-terminal">OPPONENT</h2>
            <p className="text-xs text-muted tracking-terminal">// breaking your code</p>
          </div>
          <div className="flex flex-col gap-2">
            {OPP_HISTORY.map((r, i) => <GuessLine key={i} row={r} />)}
          </div>
        </section>

        {/* center overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="border border-border bg-background p-12 text-center pointer-events-auto min-w-[420px]">
            <h1 className="text-5xl tracking-brand font-semibold mb-4">{headline}</h1>
            <p className="text-muted tracking-terminal mb-8">
              opponent's code was <span className="text-foreground tracking-[0.3em] ml-2">4 8 3 1</span>
            </p>
            <div className="flex gap-3 justify-center">
              <TermButton variant="filled" onClick={() => navigate("/set-secret")}>[ REMATCH ]</TermButton>
              <TermButton variant="secondary" onClick={() => navigate("/")}>[ LEAVE ROOM ]</TermButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
