"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";

import { ApiError } from "@/lib/api-client";
import { BrandLogo } from "@/components/layout/brand-logo";
import { activateCompany } from "./auth-client";
import { useAuth } from "./auth-provider";
import type { CompanyRole } from "./types";

const ROLE_LABEL: Record<CompanyRole, string> = {
  owner: "Dono",
  admin: "Administrador",
  member: "Membro",
};

/**
 * Only renders companies that came back on the session's own memberships
 * list (from /login, /register, or /me) — never a company ID typed into
 * the URL or otherwise supplied by the client. The backend is still the
 * real authority: POST /companies/{id}/activate verifies membership again
 * before accepting the selection (Gate FRONTEND-AUTH-01 §21).
 */
export function CompanySelect() {
  const router = useRouter();
  const auth = useAuth();
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (auth.status === "authenticated" && !auth.requiresCompanySelection) {
      router.replace("/");
    }
  }, [auth, router]);

  async function handleActivate(companyId: string) {
    if (activatingId) return;
    setActivatingId(companyId);
    setError(null);

    try {
      const payload = await activateCompany(companyId);
      auth.setSession(payload);
      router.replace("/");
    } catch (activateError) {
      if (activateError instanceof ApiError && activateError.status === 404) {
        setError("Essa empresa não está mais disponível para sua conta.");
        await auth.refresh();
      } else {
        setError("Não foi possível selecionar essa empresa. Tente novamente.");
      }
      setActivatingId(null);
    }
  }

  if (auth.status === "loading" || auth.status === "unauthenticated") return null;
  if (auth.status === "authenticated" && !auth.requiresCompanySelection) return null;

  if (auth.status === "offline") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <BrandLogo className="mx-auto text-primary" />
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível conectar ao servidor.
          </p>
          <button
            type="button"
            onClick={() => auth.refresh()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <BrandLogo className="mx-auto text-primary" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Selecione uma empresa</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta tem acesso a mais de uma empresa. Escolha com qual deseja continuar.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <ul className="space-y-3">
          {auth.memberships.map((membership) => (
            <li key={membership.company.id}>
              <button
                type="button"
                disabled={activatingId !== null}
                onClick={() => handleActivate(membership.company.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/30 disabled:opacity-60"
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  aria-hidden="true"
                >
                  <Building2 className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {membership.company.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Papel: {ROLE_LABEL[membership.role]}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
