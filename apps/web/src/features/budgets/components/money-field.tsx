import { cn } from "@/lib/utils";

interface MoneyFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  className?: string;
}

export function MoneyField({
  id,
  label,
  value,
  onChange,
  placeholder = "0,00",
  className,
}: MoneyFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
        <span className="shrink-0 text-sm font-medium text-muted-foreground">
          R$
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 bg-transparent text-xl font-semibold text-foreground tabular-nums outline-none placeholder:text-muted-foreground/50"
        />
      </div>
    </div>
  );
}
