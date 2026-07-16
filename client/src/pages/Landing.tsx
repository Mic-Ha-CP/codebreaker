import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TermButton } from "@/components/codebreaker/TermButton";
import { getOrCreateNickname, persistNickname } from "@/lib/nickname";
import { useGameStore } from "@/state/gameStore";
import type { BotDifficulty, RoomSummary, Rules } from "../../../shared/types";

const DIFFICULTIES: Array<{ id: BotDifficulty; label: string; blurb: string }> = [
  { id: "easy", label: "EASY", blurb: "forgets what you told it" },
  { id: "medium", label: "MEDIUM", blurb: "a fair fight" },
  { id: "hard", label: "HARD", blurb: "forgets nothing" },
];

/** "4d · no-rep · 10r" */
function rulesSummary(rules: Rules): string {
  return `${rules.codeLength}d · ${rules.allowRepeats ? "rep" : "no-rep"} · ${rules.totalRounds}r`;
}

export default function Landing() {
  const [nickname, setNicknameLocal] = useState(getOrCreateNickname);
  const [showJoin, setShowJoin] = useState(false);
  const [showSolo, setShowSolo] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState("");

  const {
    setNickname,
    createRoom,
    createSolo,
    joinRoom,
    lobbyRooms,
    lobbySubscribe,
    lobbyUnsubscribe,
  } = useGameStore();

  // Mounted iff we are on Landing, so this maps exactly to "watching the lobby".
  useEffect(() => {
    lobbySubscribe();
    return () => lobbyUnsubscribe();
  }, [lobbySubscribe, lobbyUnsubscribe]);

  const editNickname = (value: string) => {
    setNicknameLocal(value);
    persistNickname(value);
  };

  const handleCreate = () => {
    setNickname(nickname);
    createRoom({ isPrivate });
  };

  const handleJoin = (roomCode: string) => {
    setNickname(nickname);
    joinRoom(roomCode);
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

  const isJoinable = (room: RoomSummary) =>
    room.status === "waiting" && room.playerCount < room.maxPlayers;

  return (
    <main className="min-h-screen flex items-start justify-center px-6 py-12">
      <div className="w-full max-w-[520px] flex flex-col gap-10">
        <header className="text-center">
          <h1 className="text-4xl tracking-brand font-semibold">CODEBREAKER</h1>
          <p className="mt-2 text-sm text-muted tracking-terminal">// 2-player codebreaking</p>
        </header>

        <div className="flex flex-col gap-3">
          <label className="text-xs uppercase tracking-terminal text-muted">nickname</label>
          <input
            value={nickname}
            onChange={(e) => editNickname(e.target.value)}
            placeholder="enter nickname"
            className="w-full bg-transparent border border-border px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 text-xs uppercase tracking-terminal text-muted cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="accent-foreground w-4 h-4"
            />
            private room
            <span className="normal-case text-muted">// unlisted, join by code only</span>
          </label>

          <TermButton variant="primary" disabled={!nickname.trim()} onClick={handleCreate}>
            CREATE ROOM
          </TermButton>

          <TermButton variant="secondary" onClick={toggleSolo}>
            VS COMPUTER
          </TermButton>

          {showSolo && (
            <div className="flex flex-col gap-2 mt-2">
              <label className="text-xs uppercase tracking-terminal text-muted">difficulty</label>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  disabled={!nickname.trim()}
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

        {/* Room discovery — the reason you no longer have to send a code. */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs uppercase tracking-terminal text-muted">
            open rooms <span className="text-muted">// {lobbyRooms.length}</span>
          </h2>

          {lobbyRooms.length === 0 ? (
            <p className="italic text-muted font-mono text-sm">
              &gt; no public rooms. create one.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 font-mono text-sm">
              {lobbyRooms.map((room) => {
                const joinable = isJoinable(room);
                return (
                  <li key={room.code}>
                    <button
                      disabled={!joinable || !nickname.trim()}
                      onClick={() => handleJoin(room.code)}
                      className={cn(
                        "w-full min-h-[44px] flex items-center justify-between gap-3 border border-border px-4 py-3 text-left transition-colors",
                        joinable
                          ? "hover:border-foreground"
                          : "opacity-40 cursor-default"
                      )}
                    >
                      <span className="flex items-baseline gap-3">
                        <span className="tracking-terminal">#{room.displayNumber}</span>
                        <span className="truncate">{room.hostNickname}</span>
                      </span>
                      <span className="flex items-baseline gap-3 text-xs text-muted shrink-0">
                        <span>{rulesSummary(room.rules)}</span>
                        <span>
                          {room.playerCount}/{room.maxPlayers}
                        </span>
                        <span className="tracking-terminal uppercase">{room.status}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Secondary: the way into a private room. */}
        <div className="flex flex-col gap-3">
          <TermButton variant="secondary" onClick={toggleJoin}>
            JOIN BY CODE
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
                disabled={code.length !== 4 || !nickname.trim()}
                onClick={() => handleJoin(code)}
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
