import { cn } from "@/lib/utils";

interface DecimalFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (raw: string) => void;
  unit?: string;
  placeholder?: string;
  error?: string;
  className?: string;
}

export function DecimalField({
  id,
  label,
  value,
  onChange,
  unit,
  placeholder,
  error,
  className,
}: DecimalFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring",
          error && "border-destructive focus-within:border-destructive"
        )}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-full min-w-0 bg-transparent text-2xl font-semibold text-foreground tabular-nums outline-none placeholder:text-muted-foreground/50"
        />
        {unit ? (
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
