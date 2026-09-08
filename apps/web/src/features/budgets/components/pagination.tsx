import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type PageItem = number | "ellipsis";

/**
 * Windowed page-number list with ellipses — always keeps page 1 and the
 * last page reachable, plus `siblingCount` neighbors around the current
 * page, so it stays usable no matter how many pages exist (never renders
 * every page number in a row).
 */
function getPageItems(current: number, totalPages: number, siblingCount: number): PageItem[] {
  const totalSlots = siblingCount * 2 + 5; // first + last + current + 2 ellipses
  if (totalSlots >= totalPages) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, totalPages);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < totalPages - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftCount = 3 + siblingCount * 2;
    return [...Array.from({ length: leftCount }, (_, i) => i + 1), "ellipsis", totalPages];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightCount = 3 + siblingCount * 2;
    return [
      1,
      "ellipsis",
      ...Array.from({ length: rightCount }, (_, i) => totalPages - rightCount + i + 1),
    ];
  }

  return [
    1,
    "ellipsis",
    ...Array.from({ length: rightSibling - leftSibling + 1 }, (_, i) => leftSibling + i),
    "ellipsis",
    totalPages,
  ];
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onChange,
  siblingCount = 1,
  itemLabel = "orçamentos",
  ariaLabel = "Paginação de orçamentos",
  showSinglePageSummary = false,
  className,
}: {
  /** 0-indexed current page. */
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onChange: (page: number) => void;
  siblingCount?: number;
  itemLabel?: string;
  ariaLabel?: string;
  showSinglePageSummary?: boolean;
  className?: string;
}) {
  if (totalItems === 0 || (totalPages <= 1 && !showSinglePageSummary)) return null;

  const current = page + 1;
  const items = totalPages > 1 ? getPageItems(current, totalPages, siblingCount) : [];
  const rangeStart = page * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize + pageSize, totalItems);

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <p className="text-xs text-muted-foreground">
        Mostrando {rangeStart}–{rangeEnd} de {totalItems} {itemLabel}
      </p>

      {totalPages > 1 ? (
        <nav aria-label={ariaLabel} className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Página anterior"
            disabled={page === 0}
            onClick={() => onChange(page - 1)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>

          {items.map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center text-sm text-muted-foreground"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={`Ir para página ${item}`}
                aria-current={item === current ? "page" : undefined}
                onClick={() => onChange(item - 1)}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item === current
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted"
                )}
              >
                {item}
              </button>
            )
          )}

          <button
            type="button"
            aria-label="Próxima página"
            disabled={page >= totalPages - 1}
            onClick={() => onChange(page + 1)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
