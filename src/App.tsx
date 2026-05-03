import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "./pages/Landing";
import Lobby from "./pages/Lobby";
import SetSecret from "./pages/SetSecret";
import Game from "./pages/Game";
import End from "./pages/End";
import NotFound from "./pages/NotFound";
import { DevNav } from "./components/mastermind/DevNav";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DevNav />
        <div className="pt-10">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/set-secret" element={<SetSecret />} />
            <Route path="/game" element={<Game />} />
            <Route path="/end" element={<End />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
