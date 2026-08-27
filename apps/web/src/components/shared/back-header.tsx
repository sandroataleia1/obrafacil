"use client";

import { ChevronLeft } from "lucide-react";

interface BackHeaderProps {
  title: string;
  onBack: () => void;
}

export function BackHeader({ title, onBack }: BackHeaderProps) {
  return (
    <div className="flex items-center gap-2 pb-1">
      <button
        type="button"
        onClick={onBack}
        aria-label="Voltar"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
    </div>
  );
}
