"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";

import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { performDemoLogout } from "@/features/auth/logout-button";
import type { DemoAuthUser } from "@/features/auth/demo-auth";
import { releaseInfo } from "@/lib/release-info";
import { companyName } from "@/lib/pilot-config";

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
 * "Topbar Global" §6–§9). Receives `user` as a prop — resolved once by
 * `AppShell`'s own session gate — instead of re-reading the session
 * locally, so there is no second async read that could render with an
 * empty user for a frame before filling in (§20).
 *
 * `performDemoLogout` is the exact same function the sidebar's
 * (now-removed) and `/mais`'s "Sair" triggers use — no second logout
 * implementation.
 */
export function UserMenu({ user }: { user: DemoAuthUser }) {
  const router = useRouter();
  const initials = getInitials(user.name);

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Conta de ${user.name}`}
        className="flex items-center gap-2 rounded-lg py-1.5 pr-2 pl-1.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
          aria-hidden="true"
        >
          {initials}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </MenuTrigger>
      <MenuContent>
        <div className="min-w-0 px-3 py-2">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <MenuSeparator />
        <div className="min-w-0 px-3 py-2 text-xs text-muted-foreground">
          <p className="max-w-56 truncate font-medium text-foreground/80">{companyName}</p>
        </div>
        <MenuSeparator />
        <div className="min-w-0 px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80">{releaseInfo.channel}</p>
          <p>Versão {releaseInfo.version}</p>
          <p>Build {releaseInfo.build}</p>
        </div>
        <MenuSeparator />
        <MenuItem closeOnClick onClick={() => performDemoLogout(router)}>
          Sair
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
