import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared shell for every page-level skeleton: one `role="status"` +
 * `aria-busy` announcement for the whole screen (the sr-only text),
 * not one per decorative block. Three variants below cover the
 * layouts that actually recur across `(app)` — dashboard, list pages,
 * detail pages — chosen centrally in `template.tsx` by route, so no
 * individual `page.tsx` needs its own loading logic. A page whose
 * shape doesn't fit one of the three (e.g. `/calcular`, `/mais`) falls
 * back to `DetailPageSkeleton`, which is generic enough not to look
 * wrong; a closer match is a QA follow-up, not a blocker here.
 */
function SkeletonScreen({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Carregando página</span>
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <SkeletonScreen>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </SkeletonScreen>
  );
}

export function ListPageSkeleton() {
  return (
    <SkeletonScreen>
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    </SkeletonScreen>
  );
}

export function DetailPageSkeleton() {
  return (
    <SkeletonScreen>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </SkeletonScreen>
  );
}
