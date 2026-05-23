import { TermButton } from "@/components/codebreaker/TermButton";
import { useGameStore } from "@/state/gameStore";
import type { GuessResult } from "../../../shared/types";

function GuessLine({ row }: { row: GuessResult }) {
  return (
    <div className="font-mono flex items-center gap-6 text-base">
      <span className="text-muted">  </span>
      <span className="tracking-[0.3em]">{row.guess.join(" ")}</span>
      <span className="text-muted text-sm">
        E{row.exact}<span className="px-1">·</span>P{row.partial}
      </span>
    </div>
  );
}

export default function End() {
  const { myId, roomState, gameEndPayload, requestRematch, leaveRoom } = useGameStore();

  if (!roomState) return null;

  const outcome = roomState.isDraw || roomState.winnerId === null
    ? 'draw'
    : roomState.winnerId === myId
    ? 'win'
    : 'lose';

  const headline =
    outcome === 'win' ? 'YOU WIN' : outcome === 'lose' ? 'YOU LOSE' : 'DRAW';

  const opponent = roomState.players.find((p) => p.id !== myId);
  const opponentId = opponent?.id ?? '';
  const myHistory =
    (myId ? roomState.playerStates[myId]?.history : undefined) ?? [];
  const oppHistory =
    (opponentId ? roomState.playerStates[opponentId]?.history : undefined) ?? [];
  const opponentSecret = gameEndPayload?.revealedSecrets[opponentId];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border-soft px-6 py-3 text-xs tracking-terminal">
        <div className="flex items-center gap-8">
          <span className="text-foreground">ROOM #{roomState.code}</span>
          <span className="text-muted">GAME OVER</span>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-2 relative">
        <section className="border-r border-border p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-base font-semibold tracking-terminal">YOU</h2>
            <p className="text-xs text-muted tracking-terminal">// breaking opponent's code</p>
          </div>
          <div className="flex flex-col gap-2">
            {myHistory.map((r, i) => <GuessLine key={i} row={r} />)}
          </div>
        </section>

        <section className="p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-base font-semibold tracking-terminal">OPPONENT</h2>
            <p className="text-xs text-muted tracking-terminal">// breaking your code</p>
          </div>
          <div className="flex flex-col gap-2">
            {oppHistory.map((r, i) => <GuessLine key={i} row={r} />)}
          </div>
        </section>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="border border-border bg-background p-12 text-center pointer-events-auto min-w-[420px]">
            <h1 className="text-5xl tracking-brand font-semibold mb-4">{headline}</h1>
            {opponentSecret && (
              <p className="text-muted tracking-terminal mb-8">
                opponent's code was{" "}
                <span className="text-foreground tracking-[0.3em] ml-2">
                  {opponentSecret.join(" ")}
                </span>
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <TermButton variant="filled" onClick={requestRematch}>
                [ REMATCH ]
              </TermButton>
              <TermButton variant="secondary" onClick={leaveRoom}>
                [ LEAVE ROOM ]
              </TermButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
