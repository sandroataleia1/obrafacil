"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandLogo, BrandMark } from "@/components/layout/brand-logo";
import { ensureMinimumVisualDuration, MIN_LOGIN_LOADING_MS } from "@/lib/min-duration";
import { getAuthErrorMessage } from "./auth-errors";
import { AuthShell } from "./auth-shell";
import { login } from "./auth-client";
import { postAuthRedirectPath } from "./post-auth-redirect";
import { useAuth } from "./auth-provider";

export function LoginForm() {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already authenticated visiting /login → back into the app (or to
  // company selection if that's still pending) — never a login form
  // shown over a valid session.
  useEffect(() => {
    if (auth.status === "authenticated") {
      router.replace(postAuthRedirectPath(auth));
    }
  }, [auth, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    const startedAt = performance.now();
    try {
      const payload = await login(email, password);
      await ensureMinimumVisualDuration(startedAt, MIN_LOGIN_LOADING_MS);
      auth.setSession(payload);
      router.replace(postAuthRedirectPath({ requiresCompanySelection: payload.requires_company_selection }));
    } catch (submitError) {
      await ensureMinimumVisualDuration(startedAt, MIN_LOGIN_LOADING_MS);
      setError(getAuthErrorMessage(submitError));
      setIsSubmitting(false);
    }
  }

  // Still checking for an existing session, or a valid session was just
  // found and the redirect above is about to fire, or the API couldn't be
  // reached at all — never flash the form in any of those cases.
  if (auth.status === "loading" || auth.status === "authenticated") return null;

  if (auth.status === "offline") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <BrandLogo className="mx-auto text-primary" />
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível conectar ao servidor.
          </p>
          <Button type="button" onClick={() => auth.refresh()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AuthShell>
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
            aria-invalid={error ? true : undefined}
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
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
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
          <p id="login-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <BrandMark className="size-4 motion-safe:animate-pulse" />
              Entrando...
            </span>
          ) : (
            "Entrar"
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Ainda não tem uma conta?{" "}
          <Link href="/cadastro" className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
