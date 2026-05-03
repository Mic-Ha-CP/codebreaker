import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "landing" },
  { to: "/lobby", label: "lobby" },
  { to: "/set-secret", label: "set-secret" },
  { to: "/game", label: "game" },
  { to: "/end", label: "end" },
  { to: "/game?disconnect=1", label: "disconnect" },
];

export function DevNav() {
  if (!import.meta.env.DEV) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 border-b border-border-soft bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-4 px-4 py-2 text-xs tracking-terminal">
        <span className="text-muted">[dev]</span>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              cn(
                "uppercase hover:text-foreground transition-colors",
                isActive ? "text-foreground" : "text-muted"
              )
            }
          >
            {l.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
