import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "filled";

interface TermButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  className?: string;
  type?: "button" | "submit";
  title?: string;
}

export function TermButton({
  children,
  onClick,
  disabled,
  variant = "primary",
  className,
  type = "button",
  title,
}: TermButtonProps) {
  const base =
    "inline-flex items-center justify-center px-4 py-2 border text-sm tracking-terminal uppercase transition-colors duration-100 select-none";
  const variants: Record<ButtonVariant, string> = {
    primary:
      "border-foreground text-foreground bg-transparent hover:bg-foreground hover:text-background",
    secondary:
      "border-border text-muted hover:border-foreground hover:text-foreground",
    ghost:
      "border-transparent text-muted hover:text-foreground",
    filled:
      "border-foreground bg-foreground text-background hover:bg-transparent hover:text-foreground",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        base,
        variants[variant],
        disabled && "opacity-30 pointer-events-none",
        className
      )}
    >
      {children}
    </button>
  );
}
