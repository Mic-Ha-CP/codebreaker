import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TermButton } from "@/components/codebreaker/TermButton";
import { NumberPad } from "@/components/codebreaker/NumberPad";
import { cn } from "@/lib/utils";

interface GuessRow { guess: number[]; exact: number; partial: number }

const YOUR_HISTORY: GuessRow[] = [
  { guess: [4, 8, 3, 1], exact: 2, partial: 1 },
  { guess: [1, 2, 5, 9], exact: 1, partial: 1 },
  { guess: [7, 0, 6, 2], exact: 0, partial: 1 },
];
const OPP_HISTORY: GuessRow[] = [
  { guess: [5, 2, 9, 0], exact: 1, partial: 2 },
  { guess: [7, 3, 4, 1], exact: 0, partial: 2 },
];
const OPP_TYPING: (number | null)[] = [5, 2, null, null];

function GuessLine({ row, prefix = "  " }: { row: GuessRow; prefix?: string }) {
  return (
    <div className="font-mono flex items-center gap-6 text-base">
      <span className="text-muted">{prefix}</span>
      <span className="tracking-[0.3em]">{row.guess.join(" ")}</span>
      <span className="text-muted text-sm">
        E{row.exact}<span className="px-1">·</span>P{row.partial}
      </span>
    </div>
  );
}

function PendingLine({ values, prefix, label, cursor }: { values: (number | null)[]; prefix: string; label?: string; cursor?: number | null }) {
  return (
    <div className="font-mono flex items-center gap-6 text-base">
      <span className="text-foreground">{prefix}</span>
      <span className="tracking-[0.3em] flex gap-2">
        {values.map((v, i) => (
          <span key={i} className={cn(cursor === i ? "text-foreground cursor-blink" : v === null ? "text-muted" : "text-foreground")}>
            {v === null ? "_" : v}
          </span>
        ))}
      </span>
      {label && <span className="text-muted text-xs">{label}</span>}
    </div>
  );
}

export default function Game() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const showDisconnect = params.get("disconnect") === "1";

  const [yourTurn, setYourTurn] = useState(true);
  const [input, setInput] = useState<(number | null)[]>([null, null, null, null]);
  const [showHelp, setShowHelp] = useState(false);
  const [disconnectSecs, setDisconnectSecs] = useState(28);

  useEffect(() => {
    if (!showDisconnect) return;
    if (disconnectSecs <= 0) return;
    const t = setTimeout(() => setDisconnectSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [showDisconnect, disconnectSecs]);

  const cursor = yourTurn ? input.findIndex((d) => d === null) : null;

  const onDigit = (d: number) => {
    if (!yourTurn) return;
    if (input.includes(d)) return;
    const i = input.findIndex((x) => x === null);
    if (i === -1) return;
    const next = [...input];
    next[i] = d;
    setInput(next);
  };
  const onDelete = () => {
    if (!yourTurn) return;
    const next = [...input];
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i] !== null) { next[i] = null; break; }
    }
    setInput(next);
  };
  const onSubmit = () => {
    if (input.every((d) => d !== null)) {
      setInput([null, null, null, null]);
      setYourTurn(false);
    }
  };

  const status = showDisconnect
    ? `opponent disconnected — ${disconnectSecs}s`
    : yourTurn
    ? "your turn. enter your guess."
    : "opponent's turn.";

  return (
    <div className="min-h-screen flex flex-col">
      {/* top bar */}
      <header className="flex items-center justify-between border-b border-border-soft px-6 py-3 text-xs tracking-terminal text-muted">
        <div className="flex items-center gap-8">
          <span className="text-foreground">ROOM #X3K9</span>
          <span>ROUND <span className="text-foreground">3</span> / 10</span>
          <span>4d · no-rep · IBM Plex Mono</span>
        </div>
        <TermButton variant="ghost" onClick={() => navigate("/")}>[ LEAVE ]</TermButton>
      </header>

      {/* two column board */}
      <div className="flex-1 grid grid-cols-2">
        {/* YOU */}
        <section className="border-r border-border p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-base font-semibold tracking-terminal">YOU</h2>
            <p className="text-xs text-muted tracking-terminal">// breaking opponent's code</p>
          </div>
          <div className="flex flex-col gap-2">
            {YOUR_HISTORY.map((r, i) => <GuessLine key={i} row={r} />)}
            <PendingLine
              prefix=">"
              values={input}
              cursor={cursor}
              label={!yourTurn ? "(locked)" : undefined}
            />
          </div>
        </section>

        {/* OPPONENT */}
        <section className={cn("p-8 flex flex-col gap-6", !yourTurn && "")}>
          <div>
            <h2 className="text-base font-semibold tracking-terminal">OPPONENT</h2>
            <p className="text-xs text-muted tracking-terminal">// breaking your code</p>
          </div>
          <div className="flex flex-col gap-2">
            {OPP_HISTORY.map((r, i) => <GuessLine key={i} row={r} />)}
            <PendingLine prefix=">" values={OPP_TYPING} label="(typing...)" />
          </div>
        </section>
      </div>

      {/* status */}
      <div className="flex items-center justify-between border-t border-border-soft px-6 py-3 text-sm tracking-terminal">
        <div>
          <span className="text-muted">STATUS:</span> <span>{status}</span>
        </div>
        <div className="flex items-center gap-3">
          <TermButton variant="ghost" onClick={() => setYourTurn((v) => !v)} title="dev: toggle turn">
            [mock: toggle turn]
          </TermButton>
          <button
            onClick={() => setShowHelp((s) => !s)}
            className="border border-border w-8 h-8 hover:bg-foreground hover:text-background transition-colors"
          >
            ?
          </button>
        </div>
      </div>

      {/* number pad */}
      <div className="border-t border-border-soft p-6">
        <div className="max-w-[640px] mx-auto">
          <NumberPad
            onDigit={onDigit}
            onDelete={onDelete}
            onSubmit={onSubmit}
            canSubmit={yourTurn && input.every((d) => d !== null)}
            disabled={!yourTurn || showDisconnect}
          />
        </div>
      </div>

      {/* help tooltip */}
      {showHelp && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80" onClick={() => setShowHelp(false)}>
          <div className="border border-border bg-background p-8 max-w-md font-mono" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm tracking-terminal text-muted mb-4">// FEEDBACK</h3>
            <p className="mb-2">E = exact   <span className="text-muted">(digit and position correct)</span></p>
            <p>P = partial <span className="text-muted">(digit correct, wrong position)</span></p>
            <div className="mt-6 flex justify-end">
              <TermButton variant="secondary" onClick={() => setShowHelp(false)}>[ CLOSE ]</TermButton>
            </div>
          </div>
        </div>
      )}

      {/* disconnect modal */}
      {showDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90">
          <div className="border border-border bg-background p-10 max-w-sm w-full font-mono text-center">
            <h3 className="text-sm tracking-terminal mb-6">OPPONENT DISCONNECTED</h3>
            <p className="text-muted mb-8">reconnecting... {disconnectSecs}s</p>
            <TermButton
              variant="filled"
              disabled={disconnectSecs > 0}
              onClick={() => navigate("/end")}
            >
              [ CLAIM WIN ]
            </TermButton>
          </div>
        </div>
      )}
    </div>
  );
}
