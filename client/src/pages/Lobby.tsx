import { useState } from "react";
import { cn } from "@/lib/utils";
import { TermButton } from "@/components/codebreaker/TermButton";
import { useGameStore } from "@/state/gameStore";
import type { BotDifficulty, Rules } from "../../../shared/types";

type EditingField = keyof Pick<Rules, 'codeLength' | 'allowRepeats' | 'totalRounds'> | null;

const BOT_DIFFICULTIES: BotDifficulty[] = ['easy', 'medium', 'hard'];

export default function Lobby() {
  const { myId, roomState, toggleReady, leaveRoom, updateRules, addBot, kickPlayer } =
    useGameStore();
  const [editing, setEditing] = useState<EditingField>(null);
  const [draft, setDraft] = useState<string>('');
  const [showAddBot, setShowAddBot] = useState(false);

  if (!roomState) return null;

  const { code, players, rules, botDifficulties } = roomState;
  const me = players.find((p) => p.id === myId);
  const isHost = me?.isHost ?? false;
  const allReady = players.length === 2 && players.every((p) => p.isReady);
  const hasOpenSlot = players.length < 2;

  const startEdit = (field: NonNullable<EditingField>) => {
    setEditing(field);
    setDraft(
      field === 'allowRepeats'
        ? String(rules.allowRepeats)
        : String(rules[field])
    );
  };

  const saveEdit = () => {
    if (!editing) return;
    if (editing === 'codeLength') updateRules({ codeLength: Number(draft) });
    else if (editing === 'allowRepeats') updateRules({ allowRepeats: draft === 'true' });
    else if (editing === 'totalRounds') updateRules({ totalRounds: Number(draft) });
    setEditing(null);
  };

  const ruleRows: { field: NonNullable<EditingField>; label: string; display: string }[] = [
    { field: 'codeLength', label: 'digits', display: String(rules.codeLength) },
    { field: 'allowRepeats', label: 'repeats', display: rules.allowRepeats ? 'yes' : 'no' },
    { field: 'totalRounds', label: 'rounds', display: String(rules.totalRounds) },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border-soft px-6 py-4">
        {/* Always shown: kick the bot and the seat is joinable by code again. */}
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
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span>
                    &gt; {p.nickname}
                    {p.isBot && botDifficulties[p.id] && (
                      <span className="text-muted"> · {botDifficulties[p.id].toUpperCase()}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    {p.isHost && (
                      <span className="text-xs text-muted tracking-terminal">HOST</span>
                    )}
                    {/* Bots and humans kick the same way — a seat is a seat. */}
                    {isHost && p.id !== myId && (
                      <TermButton variant="ghost" onClick={() => kickPlayer(p.id)}>
                        [ KICK ]
                      </TermButton>
                    )}
                  </div>
                </li>
              ))}

              {hasOpenSlot && !isHost && <li className="italic text-muted">&gt; waiting...</li>}

              {hasOpenSlot && isHost && (
                <li className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="italic text-muted">&gt; waiting...</span>
                    <TermButton variant="ghost" onClick={() => setShowAddBot((s) => !s)}>
                      [ + ADD BOT {showAddBot ? '▴' : '▾'} ]
                    </TermButton>
                  </div>
                  {showAddBot && (
                    <div className="flex gap-2 pl-4">
                      {BOT_DIFFICULTIES.map((d) => (
                        <button
                          key={d}
                          onClick={() => {
                            setShowAddBot(false);
                            addBot(d);
                          }}
                          className="min-h-[44px] flex-1 border border-border px-3 py-2 text-xs uppercase tracking-terminal transition-colors hover:border-foreground"
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              )}
            </ul>
          </section>

          <section className="border border-border p-8">
            <h2 className="text-xs uppercase tracking-terminal text-muted mb-4">rules</h2>
            <dl className="flex flex-col gap-3">
              {ruleRows.map(({ field, label, display }) => (
                <div
                  key={field}
                  className="flex items-center justify-between border-b border-border-soft pb-2"
                >
                  <div className="flex gap-6 items-center font-mono">
                    <dt className="text-muted">{label}</dt>
                    {editing === field ? (
                      <RuleEditor
                        field={field}
                        draft={draft}
                        onChange={setDraft}
                      />
                    ) : (
                      <dd>{display}</dd>
                    )}
                  </div>
                  {isHost && (
                    editing === field ? (
                      <div className="flex gap-2">
                        <TermButton variant="ghost" onClick={saveEdit}>[ save ]</TermButton>
                        <TermButton variant="ghost" onClick={() => setEditing(null)}>[ x ]</TermButton>
                      </div>
                    ) : (
                      <TermButton variant="ghost" onClick={() => startEdit(field)}>[ edit ]</TermButton>
                    )
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
                    {p.isBot && ' (auto)'}
                  </button>
                </li>
              ))}
            </ul>
            {allReady && (
              <p className="mt-6 text-muted">&gt; all ready — starting...</p>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}

function RuleEditor({
  field,
  draft,
  onChange,
}: {
  field: NonNullable<EditingField>;
  draft: string;
  onChange: (v: string) => void;
}) {
  const selectClass =
    "bg-black text-white border border-gray-700 px-2 py-0.5 focus:outline-none focus:border-foreground";
  const optionClass = "bg-black text-white";

  if (field === 'allowRepeats') {
    return (
      <select className={selectClass} value={draft} onChange={(e) => onChange(e.target.value)}>
        <option className={optionClass} value="false">no</option>
        <option className={optionClass} value="true">yes</option>
      </select>
    );
  }

  if (field === 'codeLength') {
    return (
      <select className={selectClass} value={draft} onChange={(e) => onChange(e.target.value)}>
        {[3, 4, 5, 6].map((n) => (
          <option className={optionClass} key={n} value={n}>{n}</option>
        ))}
      </select>
    );
  }

  return (
    <select className={selectClass} value={draft} onChange={(e) => onChange(e.target.value)}>
      {[5, 10, 15, 20, 30, 50].map((n) => (
        <option className={optionClass} key={n} value={n}>{n}</option>
      ))}
    </select>
  );
}
