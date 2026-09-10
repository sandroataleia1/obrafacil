"use client";

import { ChevronDown } from "lucide-react";

import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { usePerformLogout } from "@/features/auth/logout-button";
import { useAuth } from "@/features/auth/auth-provider";
import { releaseInfo } from "@/lib/release-info";

/**
 * "Sandro Almeida" -> "SA" (first letter of the first two words);
 * a single-word name falls back to just that letter. Never derives
 * initials from anything but the real `name` already in the session.
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
}

/**
 * Session identity + logout, surfaced from the Topbar (Gate Shell
 * "Topbar Global" §6–§9). Reads the session directly from `useAuth()` —
 * the same single source `AppShell` already gated on — instead of a
 * second, separate read, so there is never a frame where this renders
 * with a stale or empty identity (§20).
 */
export function UserMenu() {
  const auth = useAuth();
  const { performLogout, status: logoutStatus, error: logoutError } = usePerformLogout();

  // AppShell only renders this once authenticated with an active
  // company, but stay defensive rather than assume it non-null here.
  if (auth.user === null) return null;

  const initials = getInitials(auth.user.name);

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Conta de ${auth.user.name}`}
        className="flex items-center gap-2 rounded-lg py-1.5 pr-2 pl-1.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
          aria-hidden="true"
        >
          {initials}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{auth.user.name}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </MenuTrigger>
      <MenuContent>
        <div className="min-w-0 px-3 py-2">
          <p className="truncate text-sm font-medium text-foreground">{auth.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{auth.user.email}</p>
        </div>
        <MenuSeparator />
        {auth.activeCompany ? (
          <>
            <div className="min-w-0 px-3 py-2 text-xs text-muted-foreground">
              <p className="max-w-56 truncate font-medium text-foreground/80">{auth.activeCompany.name}</p>
            </div>
            <MenuSeparator />
          </>
        ) : null}
        <div className="min-w-0 px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80">{releaseInfo.channel}</p>
          <p>Versão {releaseInfo.version}</p>
          <p>Build {releaseInfo.build}</p>
        </div>
        <MenuSeparator />
        <MenuItem
          closeOnClick={false}
          disabled={logoutStatus === "pending"}
          onClick={() => void performLogout()}
        >
          {logoutStatus === "pending" ? "Saindo..." : "Sair"}
        </MenuItem>
        {logoutStatus === "error" && logoutError ? (
          <div className="px-3 pb-2">
            <p role="alert" className="text-xs text-destructive">
              {logoutError}
            </p>
          </div>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
