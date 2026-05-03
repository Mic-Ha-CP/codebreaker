import { cn } from "@/lib/utils";

interface DigitCellsProps {
  values: (number | null)[];
  cursor?: number | null;
  size?: "md" | "lg";
  onCellClick?: (i: number) => void;
}

export function DigitCells({ values, cursor = null, size = "md", onCellClick }: DigitCellsProps) {
  const dims = size === "lg" ? "w-16 h-20 text-4xl" : "w-10 h-12 text-2xl";
  return (
    <div className="flex gap-3">
      {values.map((v, i) => {
        const isCursor = cursor === i;
        return (
          <button
            type="button"
            key={i}
            onClick={() => onCellClick?.(i)}
            className={cn(
              "flex items-end justify-center pb-1 border-b font-mono",
              dims,
              isCursor ? "border-foreground" : "border-border",
              !onCellClick && "pointer-events-none"
            )}
          >
            {v === null ? (
              <span className={cn("text-muted", isCursor && "text-foreground cursor-blink")}>_</span>
            ) : (
              <span>{v}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
