import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TermButton } from "@/components/codebreaker/TermButton";

export default function Lobby() {
  const navigate = useNavigate();
  const [bobJoined, setBobJoined] = useState(false);
  const [aliceReady, setAliceReady] = useState(false);
  const [bobReady, setBobReady] = useState(false);

  const bothReady = bobJoined && aliceReady && bobReady;

  const rules = [
    { k: "digits", v: "4" },
    { k: "repeats", v: "no" },
    { k: "rounds", v: "10" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* top bar */}
      <header className="flex items-center justify-between border-b border-border-soft px-6 py-4">
        <div className="text-sm tracking-terminal">
          ROOM <span className="text-muted">#</span>X3K9
        </div>
        <TermButton variant="secondary" onClick={() => navigate("/")}>
          [ LEAVE ]
        </TermButton>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-[560px] flex flex-col gap-12">
          {/* PLAYERS */}
          <section className="border border-border p-8">
            <h2 className="text-xs uppercase tracking-terminal text-muted mb-4">players</h2>
            <ul className="flex flex-col gap-2 font-mono">
              <li className="flex items-center justify-between">
                <span>&gt; alice</span>
                <span className="text-xs text-muted tracking-terminal">HOST</span>
              </li>
              <li className="flex items-center justify-between">
                {bobJoined ? (
                  <span>&gt; bob</span>
                ) : (
                  <span className="italic text-muted">&gt; waiting...</span>
                )}
              </li>
            </ul>
            <div className="mt-6">
              <TermButton variant="ghost" onClick={() => setBobJoined((b) => !b)}>
                [mock: player 2 {bobJoined ? "leave" : "join"}]
              </TermButton>
            </div>
          </section>

          {/* RULES */}
          <section className="border border-border p-8">
            <h2 className="text-xs uppercase tracking-terminal text-muted mb-4">rules</h2>
            <dl className="flex flex-col gap-3">
              {rules.map((r) => (
                <div key={r.k} className="flex items-center justify-between border-b border-border-soft pb-2">
                  <div className="flex gap-6">
                    <dt className="text-muted">{r.k}</dt>
                    <dd>{r.v}</dd>
                  </div>
                  <TermButton variant="ghost">[ edit ]</TermButton>
                </div>
              ))}
            </dl>
          </section>

          {/* READY */}
          <section className="border border-border p-8">
            <h2 className="text-xs uppercase tracking-terminal text-muted mb-4">ready</h2>
            <ul className="flex flex-col gap-2 font-mono">
              <li>
                <button
                  onClick={() => setAliceReady((r) => !r)}
                  className="hover:text-foreground transition-colors"
                >
                  [{aliceReady ? "X" : " "}] alice — {aliceReady ? "ready" : "not ready"}
                </button>
              </li>
              <li>
                <button
                  disabled={!bobJoined}
                  onClick={() => setBobReady((r) => !r)}
                  className={
                    "hover:text-foreground transition-colors " +
                    (!bobJoined ? "opacity-30 pointer-events-none" : "")
                  }
                >
                  [{bobReady ? "X" : " "}] bob — {bobReady ? "ready" : "not ready"}
                </button>
              </li>
            </ul>
            {bothReady && (
              <p className="mt-6 text-muted">&gt; starting in 5...</p>
            )}
          </section>

          <div className="flex justify-end">
            <TermButton
              variant="filled"
              disabled={!bothReady}
              onClick={() => navigate("/set-secret")}
            >
              [ START NOW ]
            </TermButton>
          </div>
        </div>
      </main>
    </div>
  );
}
