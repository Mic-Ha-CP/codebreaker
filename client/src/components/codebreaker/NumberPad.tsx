import { TermButton } from "./TermButton";

interface NumberPadProps {
  onDigit: (d: number) => void;
  onDelete: () => void;
  onSubmit: () => void;
  canSubmit?: boolean;
  disabled?: boolean;
}

export function NumberPad({ onDigit, onDelete, onSubmit, canSubmit = true, disabled }: NumberPadProps) {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <div className="flex flex-wrap gap-2 justify-center">
        {digits.map((d) => (
          <button
            key={d}
            onClick={() => onDigit(d)}
            className="w-12 h-12 border border-border text-foreground hover:bg-foreground hover:text-background transition-colors text-lg"
          >
            {d}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-4 gap-2">
        <TermButton variant="secondary" onClick={onDelete}>
          ⌫ DELETE
        </TermButton>
        <TermButton variant="filled" onClick={onSubmit} disabled={!canSubmit}>
          SUBMIT →
        </TermButton>
      </div>
    </div>
  );
}
