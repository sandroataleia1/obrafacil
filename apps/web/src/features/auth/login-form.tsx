"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { BrickWall, ClipboardList, HardHat, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/brand-logo";
import { authenticateDemoUser } from "./demo-auth";
import { useDemoAuthSession } from "./use-demo-auth";

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
 * Pilot-Ready demo login. Credentials are never pre-filled here — the
 * client receives them separately, and the point of this screen is to
 * exercise a realistic login, not a pre-populated one (Demo-Ready
 * "Login de Demonstração" §17).
 */
export function LoginForm() {
  const router = useRouter();
  const { session } = useDemoAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already authenticated visiting /login → back to the app, never a
  // login form shown over a valid session.
  useEffect(() => {
    if (session?.authenticated) {
      router.replace("/");
    }
  }, [session, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    const result = authenticateDemoUser(email, password);
    if (!result.ok) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }
    router.replace("/");
  }

  // Still checking for an existing session, or a valid session was
  // just found and the redirect above is about to fire — never flash
  // the form in either case.
  if (session === undefined || session?.authenticated) return null;

  return (
    <div className="grid min-h-dvh w-full lg:grid-cols-2">
      <div className="flex items-center justify-center bg-background px-6 py-10 sm:px-10 lg:order-2">
        <div className="w-full max-w-100 space-y-8">
          <BrandLogo className="text-primary" />

          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Acesse sua conta</h1>
            <p className="text-sm text-muted-foreground">Entre para continuar no sistema.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-sm font-medium text-foreground">
                E-mail
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-sm font-medium text-foreground">
                Senha
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>
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
