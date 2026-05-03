import { cn } from "@/lib/utils";
import { useGameStore } from "@/state/gameStore";
import type { RoomPhase } from "../../../../shared/types";

type DevLink =
  | { label: string; action: 'leave' }
  | { label: string; phase: RoomPhase; opts?: { opponentDisconnected?: boolean } };

const links: DevLink[] = [
  { label: 'landing', action: 'leave' },
  { label: 'lobby', phase: 'lobby' },
  { label: 'set-secret', phase: 'setting_secret' },
  { label: 'game', phase: 'in_progress' },
  { label: 'disconnect', phase: 'in_progress', opts: { opponentDisconnected: true } },
  { label: 'end', phase: 'ended' },
];

export function DevNav() {
  if (!import.meta.env.DEV) return null;

  const { _devSetPhase, _devLeave, roomState } = useGameStore();
  const currentPhase = roomState?.phase;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 border-b border-border-soft bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-4 px-4 py-2 text-xs tracking-terminal">
        <span className="text-muted">[dev]</span>
        {links.map((link) => {
          const isActive =
            'action' in link ? !roomState : currentPhase === link.phase;

          return (
            <button
              key={link.label}
              onClick={() =>
                'action' in link
                  ? _devLeave()
                  : _devSetPhase(link.phase, link.opts)
              }
              className={cn(
                'uppercase hover:text-foreground transition-colors',
                isActive ? 'text-foreground' : 'text-muted'
              )}
            >
              {link.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
