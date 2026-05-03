import { useGameStore } from "@/state/gameStore";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "./pages/Landing";
import Lobby from "./pages/Lobby";
import SetSecret from "./pages/SetSecret";
import Game from "./pages/Game";
import End from "./pages/End";
import { DevNav } from "./components/codebreaker/DevNav";

const App = () => {
  const phase = useGameStore((s) => s.roomState?.phase);

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <DevNav />
      <div className="pt-10">
        {!phase && <Landing />}
        {phase === 'lobby' && <Lobby />}
        {phase === 'setting_secret' && <SetSecret />}
        {(phase === 'in_progress' || phase === 'revealing') && <Game />}
        {phase === 'ended' && <End />}
      </div>
    </TooltipProvider>
  );
};

export default App;
