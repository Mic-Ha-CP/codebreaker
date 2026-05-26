import { useEffect } from "react";
import { useGameStore } from "@/state/gameStore";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TermButton } from "@/components/codebreaker/TermButton";
import Landing from "./pages/Landing";
import Lobby from "./pages/Lobby";
import SetSecret from "./pages/SetSecret";
import Game from "./pages/Game";
import End from "./pages/End";
import { DevNav } from "./components/codebreaker/DevNav";

const App = () => {
  const phase = useGameStore((s) => s.roomState?.phase);
  const connected = useGameStore((s) => s.connected);
  const inRoom = useGameStore((s) => s.roomState !== null);
  const connect = useGameStore((s) => s.connect);
  const disconnect = useGameStore((s) => s.disconnect);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  // Auto-reconnect is disabled (see gameStore connectSocket). If the socket
  // drops while in a room, the user has no path back — show a blocking banner.
  const showConnectionLost = !connected && inRoom;

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {import.meta.env.DEV && <DevNav />}
      <div className={import.meta.env.DEV ? "pt-10" : undefined}>
        {!phase && <Landing />}
        {phase === 'lobby' && <Lobby />}
        {phase === 'setting_secret' && <SetSecret />}
        {(phase === 'in_progress' || phase === 'revealing') && <Game />}
        {phase === 'ended' && <End />}
      </div>

      {showConnectionLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90">
          <div className="border border-border bg-background p-10 max-w-sm w-full font-mono text-center">
            <h3 className="text-sm tracking-terminal mb-6">CONNECTION LOST</h3>
            <p className="text-muted mb-2">disconnected from server.</p>
            <p className="text-muted text-xs mb-8">
              your opponent will be awarded the win after 30s.
            </p>
            <TermButton
              variant="filled"
              onClick={() => window.location.reload()}
            >
              [ REFRESH ]
            </TermButton>
          </div>
        </div>
      )}
    </TooltipProvider>
  );
};

export default App;
