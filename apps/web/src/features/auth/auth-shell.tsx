import type { ReactNode } from "react";
import { BrickWall, ClipboardList, HardHat, Receipt } from "lucide-react";

const BENEFITS = [
  { icon: BrickWall, label: "Controle das obras" },
  { icon: ClipboardList, label: "Orçamentos e materiais" },
  { icon: HardHat, label: "Equipe e frequência" },
  { icon: Receipt, label: "Gestão financeira" },
];

/**
 * Purely decorative — evokes the BrandLogo's corner-registration marks
 * and a blueprint grid without duplicating the logo itself. No stock
 * imagery, no invented metrics, nothing an AT user needs to hear.
 */
function BrandPanelArt() {
  return (
    <svg
      viewBox="0 0 480 480"
      className="absolute inset-0 size-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeOpacity="0.12" />
        </pattern>
      </defs>
      <rect width="480" height="480" fill="url(#grid)" />

      <path
        d="M40 120V64h56"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M440 360v56h-56"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <rect x="220" y="150" width="120" height="120" rx="14" fill="currentColor" fillOpacity="0.1" />
      <rect x="270" y="210" width="150" height="90" rx="12" fill="currentColor" fillOpacity="0.16" />
      <rect x="190" y="260" width="90" height="70" rx="10" fill="currentColor" fillOpacity="0.22" />
    </svg>
  );
}

/**
 * Shared two-column visual shell for /login and /cadastro (Gate
 * FRONTEND-AUTH-01 §11 — "conversar visualmente com /login... sem copiar
 * centenas de linhas"). `children` renders in the form column; the
 * decorative benefits panel is identical on both screens.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh w-full lg:grid-cols-2">
      <div className="flex items-center justify-center bg-background px-6 py-10 sm:px-10 lg:order-2">
        <div className="w-full max-w-100 space-y-8">{children}</div>
      </div>

      <div
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:order-1 lg:flex lg:flex-col lg:justify-center lg:p-16 xl:p-20"
      >
        <BrandPanelArt />

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight text-balance xl:text-4xl">
              Gestão de obras de forma simples.
            </h2>
            <p className="text-base text-sidebar-foreground/80">
              Organize obras, orçamentos, equipe, materiais e financeiro em um só
              lugar.
            </p>
          </div>

          <ul className="space-y-3">
            {BENEFITS.map((benefit) => (
              <li key={benefit.label} className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
                  <benefit.icon className="size-4" />
                </span>
                <span className="text-sm font-medium text-sidebar-foreground/90">
                  {benefit.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
