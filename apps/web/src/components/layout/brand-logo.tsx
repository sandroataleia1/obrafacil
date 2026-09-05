import { cn } from "@/lib/utils";

/**
 * ObraFácil wordmark + icon, reused everywhere the brand appears in
 * the primary navigation shell (currently only `desktop-sidebar.tsx`
 * — the mobile bottom nav has no brand mark of its own).
 *
 * The icon is two opposing blueprint/plan corner-registration marks
 * (an architectural-drafting convention — the small right-angle marks
 * that frame a plan for precise measurement) enclosing one solid
 * rounded block: precision + structure + a single "módulo" under
 * management, read together. Deliberately NOT a bar chart, not a
 * house silhouette, not a tool, not a Lucide menu icon reused as a
 * logo — three simple geometric strokes/shapes with 180° rotational
 * symmetry, legible at 18–24px. Single color, no gradient/shadow/3D —
 * icon and wordmark both use `currentColor`/inherit text color, so
 * the caller controls contrast entirely via one className (e.g.
 * `text-sidebar-foreground` on a blue sidebar), never a second
 * hardcoded color to keep in sync.
 *
 * "Obra"/"Fácil" are differentiated by font weight (bold/medium), not
 * by opacity or hue — both render at full contrast against whatever
 * background the caller places them on, so the brand never reads as
 * partially disabled.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" aria-hidden="true">
        <path
          d="M3 9V3h6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M21 15v6h-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
      </svg>
      <span className="text-lg leading-none tracking-tight">
        <span className="font-bold">Obra</span>
        <span className="font-medium">Fácil</span>
      </span>
    </span>
  );
}
