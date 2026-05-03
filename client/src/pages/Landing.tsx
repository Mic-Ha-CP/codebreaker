import { useState } from "react";
import { TermButton } from "@/components/codebreaker/TermButton";
import { useGameStore } from "@/state/gameStore";

export default function Landing() {
  const [nickname, setNicknameLocal] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [code, setCode] = useState("");

  const { setNickname, createRoom, joinRoom } = useGameStore();

  const handleCreate = () => {
    setNickname(nickname);
    createRoom(); // stub — M3: connects socket + emits C2S.CREATE_ROOM
  };

  const handleJoin = () => {
    setNickname(nickname);
    joinRoom(code); // stub — M3: connects socket + emits C2S.JOIN_ROOM
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
          <TermButton variant="secondary" onClick={() => setShowJoin((s) => !s)}>
            JOIN ROOM
          </TermButton>

          {showJoin && (
            <div className="flex flex-col gap-2 mt-2">
              <label className="text-xs uppercase tracking-terminal text-muted">room code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="X3K9"
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
        </div>

        <footer className="text-center text-xs text-muted tracking-terminal">v0.1</footer>
      </div>
    </main>
  );
}
