import { useState } from "react";
import { TermButton } from "@/components/codebreaker/TermButton";
import { useGameStore } from "@/state/gameStore";
import type { BotDifficulty } from "../../../shared/types";

const DIFFICULTIES: Array<{ id: BotDifficulty; label: string; blurb: string }> = [
  { id: "easy", label: "EASY", blurb: "forgets what you told it" },
  { id: "medium", label: "MEDIUM", blurb: "a fair fight" },
  { id: "hard", label: "HARD", blurb: "forgets nothing" },
];

export default function Landing() {
  const [nickname, setNicknameLocal] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [showSolo, setShowSolo] = useState(false);
  const [code, setCode] = useState("");

  const { setNickname, createRoom, createSolo, joinRoom } = useGameStore();

  const handleCreate = () => {
    setNickname(nickname);
    createRoom(); // stub — M3: connects socket + emits C2S.CREATE_ROOM
  };

  const handleJoin = () => {
    setNickname(nickname);
    joinRoom(code); // stub — M3: connects socket + emits C2S.JOIN_ROOM
  };

  const handleSolo = (difficulty: BotDifficulty) => {
    setNickname(nickname);
    createSolo(difficulty);
  };

  const toggleJoin = () => {
    setShowJoin((s) => !s);
    setShowSolo(false);
  };

  const toggleSolo = () => {
    setShowSolo((s) => !s);
    setShowJoin(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-[400px] flex flex-col gap-10">
        <header className="text-center">
          <h1 className="text-4xl tracking-brand font-semibold">CODEBREAKER</h1>
          <p className="mt-2 text-sm text-muted tracking-terminal">// 2-player codebreaking</p>
        </header>

        <div className="flex flex-col gap-3">
          <label className="text-xs uppercase tracking-terminal text-muted">nickname</label>
          <input
            value={nickname}
            onChange={(e) => setNicknameLocal(e.target.value)}
            placeholder="enter nickname"
            className="w-full bg-transparent border border-border px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
          />
        </div>

        <div className="flex flex-col gap-3">
          <TermButton variant="primary" disabled={!nickname} onClick={handleCreate}>
            CREATE ROOM
          </TermButton>
          <TermButton variant="secondary" onClick={toggleJoin}>
            JOIN ROOM
          </TermButton>

          {showJoin && (
            <div className="flex flex-col gap-2 mt-2">
              <label className="text-xs uppercase tracking-terminal text-muted">room code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="ENTER CODE"
                maxLength={4}
                className="w-full bg-transparent border border-border px-4 py-4 text-2xl tracking-[0.3em] text-center uppercase focus:outline-none focus:border-foreground transition-colors"
              />
              <TermButton
                variant="filled"
                disabled={code.length !== 4 || !nickname}
                onClick={handleJoin}
              >
                ENTER →
              </TermButton>
            </div>
          )}

          <TermButton variant="secondary" onClick={toggleSolo}>
            VS COMPUTER
          </TermButton>

          {showSolo && (
            <div className="flex flex-col gap-2 mt-2">
              <label className="text-xs uppercase tracking-terminal text-muted">difficulty</label>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  disabled={!nickname}
                  onClick={() => handleSolo(d.id)}
                  className="w-full min-h-[44px] flex items-baseline justify-between gap-3 border border-border px-4 py-3 text-left transition-colors hover:border-foreground disabled:opacity-40 disabled:hover:border-border"
                >
                  <span className="tracking-terminal">{d.label}</span>
                  <span className="text-xs text-muted tracking-terminal">// {d.blurb}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <footer className="text-center text-xs text-muted tracking-terminal">v0.1</footer>
      </div>
    </main>
  );
}
