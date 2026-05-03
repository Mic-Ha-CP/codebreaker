import { cn } from "@/lib/utils";
import { TermButton } from "@/components/codebreaker/TermButton";
import { useGameStore } from "@/state/gameStore";

export default function Lobby() {
  const { myId, roomState, toggleReady, leaveRoom } = useGameStore();

  if (!roomState) return null;

  const { code, players, rules } = roomState;
  const me = players.find((p) => p.id === myId);
  const allReady = players.length === 2 && players.every((p) => p.isReady);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border-soft px-6 py-4">
        <div className="text-sm tracking-terminal">
          ROOM <span className="text-muted">#</span>{code}
        </div>
        <TermButton variant="secondary" onClick={leaveRoom}>[ LEAVE ]</TermButton>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-[560px] flex flex-col gap-12">

          <section className="border border-border p-8">
            <h2 className="text-xs uppercase tracking-terminal text-muted mb-4">players</h2>
            <ul className="flex flex-col gap-2 font-mono">
              {players.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>&gt; {p.nickname}</span>
                  {p.isHost && (
                    <span className="text-xs text-muted tracking-terminal">HOST</span>
                  )}
                </li>
              ))}
              {players.length < 2 && (
                <li className="italic text-muted">&gt; waiting...</li>
              )}
            </ul>
          </section>

          <section className="border border-border p-8">
            <h2 className="text-xs uppercase tracking-terminal text-muted mb-4">rules</h2>
            <dl className="flex flex-col gap-3">
              {[
                { k: 'digits', v: String(rules.codeLength) },
                { k: 'repeats', v: rules.allowRepeats ? 'yes' : 'no' },
                { k: 'rounds', v: String(rules.totalRounds) },
              ].map((r) => (
                <div
                  key={r.k}
                  className="flex items-center justify-between border-b border-border-soft pb-2"
                >
                  <div className="flex gap-6">
                    <dt className="text-muted">{r.k}</dt>
                    <dd>{r.v}</dd>
                  </div>
                  {me?.isHost && (
                    <TermButton variant="ghost">[ edit ]</TermButton>
                  )}
                </div>
              ))}
            </dl>
          </section>

          <section className="border border-border p-8">
            <h2 className="text-xs uppercase tracking-terminal text-muted mb-4">ready</h2>
            <ul className="flex flex-col gap-2 font-mono">
              {players.map((p) => (
                <li key={p.id}>
                  <button
                    disabled={p.id !== myId}
                    onClick={() => p.id === myId && toggleReady()}
                    className={cn(
                      "hover:text-foreground transition-colors",
                      p.id !== myId && "opacity-50 pointer-events-none"
                    )}
                  >
                    [{p.isReady ? 'X' : ' '}] {p.nickname} — {p.isReady ? 'ready' : 'not ready'}
                  </button>
                </li>
              ))}
            </ul>
            {allReady && (
              <p className="mt-6 text-muted">&gt; starting in 5...</p>
            )}
          </section>

          <div className="flex justify-end">
            <TermButton variant="filled" disabled={!allReady} onClick={() => {}}>
              [ START NOW ]
            </TermButton>
          </div>

        </div>
      </main>
    </div>
  );
}
