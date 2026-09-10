"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandLogo, BrandMark } from "@/components/layout/brand-logo";
import { formatPhoneInput } from "@/lib/phone";
import { ApiValidationError } from "@/lib/api-client";
import { ensureMinimumVisualDuration, MIN_LOGIN_LOADING_MS } from "@/lib/min-duration";
import { getAuthErrorMessage } from "./auth-errors";
import { AuthShell } from "./auth-shell";
import { register } from "./auth-client";
import { useAuth } from "./auth-provider";
import { postAuthRedirectPath } from "./post-auth-redirect";
import { toE164BR } from "./phone-e164";

interface FieldErrors {
  company_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
}

/** Maps Laravel's `errors.<field>: string[]` shape onto this form's fields. */
function mapValidationErrors(errors: Record<string, string[]>): FieldErrors {
  const pick = (key: string) => errors[key]?.[0];
  return {
    company_name: pick("company_name"),
    name: pick("name"),
    email: pick("email"),
    phone: pick("phone"),
    password: pick("password"),
  };
}

export function RegisterForm() {
  const router = useRouter();
  const auth = useAuth();

  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Already authenticated visiting /cadastro → this screen creates a new
  // account, not a second company for an existing one (API itself also
  // enforces this with 409) — never let the form render over a session.
  useEffect(() => {
    if (auth.status === "authenticated") {
      router.replace(postAuthRedirectPath(auth));
    }
  }, [auth, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    setGeneralError(null);

    const startedAt = performance.now();
    try {
      const payload = await register({
        company_name: companyName.trim(),
        name: name.trim(),
        email: email.trim(),
        phone: toE164BR(phoneDisplay),
        password,
        password_confirmation: passwordConfirmation,
      });
      await ensureMinimumVisualDuration(startedAt, MIN_LOGIN_LOADING_MS);
      auth.setSession(payload);
      router.replace(postAuthRedirectPath({ requiresCompanySelection: payload.requires_company_selection }));
    } catch (submitError) {
      await ensureMinimumVisualDuration(startedAt, MIN_LOGIN_LOADING_MS);
      if (submitError instanceof ApiValidationError) {
        setFieldErrors(mapValidationErrors(submitError.errors));
      } else {
        setGeneralError(getAuthErrorMessage(submitError));
      }
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Criar sua conta</h1>
        <p className="text-sm text-muted-foreground">Comece a organizar suas obras em poucos minutos.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="register-company-name" className="text-sm font-medium text-foreground">
            Nome da empresa *
          </label>
          <input
            id="register-company-name"
            type="text"
            autoComplete="organization"
            required
            maxLength={255}
            aria-invalid={fieldErrors.company_name ? true : undefined}
            aria-describedby={fieldErrors.company_name ? "register-company-name-error" : undefined}
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.company_name ? (
            <p id="register-company-name-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.company_name}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-name" className="text-sm font-medium text-foreground">
            Seu nome *
          </label>
          <input
            id="register-name"
            type="text"
            autoComplete="name"
            required
            maxLength={255}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "register-name-error" : undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.name ? (
            <p id="register-name-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-email" className="text-sm font-medium text-foreground">
            E-mail *
          </label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.email ? (
            <p id="register-email-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-phone" className="text-sm font-medium text-foreground">
            WhatsApp *
          </label>
          <input
            id="register-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required
            placeholder="(11) 99999-9999"
            aria-invalid={fieldErrors.phone ? true : undefined}
            aria-describedby={fieldErrors.phone ? "register-phone-error" : undefined}
            value={phoneDisplay}
            onChange={(event) => setPhoneDisplay(formatPhoneInput(event.target.value))}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.phone ? (
            <p id="register-phone-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.phone}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-password" className="text-sm font-medium text-foreground">
            Senha *
          </label>
          <div className="relative">
            <input
              id="register-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby="register-password-hint"
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
          <p id="register-password-hint" className="text-xs text-muted-foreground">
            Mínimo de 8 caracteres.
          </p>
          {fieldErrors.password ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-password-confirmation" className="text-sm font-medium text-foreground">
            Confirmar senha *
          </label>
          <input
            id="register-password-confirmation"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {generalError ? (
          <p role="alert" className="text-sm text-destructive">
            {generalError}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <BrandMark className="size-4 motion-safe:animate-pulse" />
              Criando conta...
            </span>
          ) : (
            "Criar conta"
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Já possui uma conta?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
