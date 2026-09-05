"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import {
  DESKTOP_NAV_EXTRA_ITEMS,
  DESKTOP_NAV_FINANCE_ITEMS,
  DESKTOP_NAV_ITEMS,
  type NavItem,
} from "./nav-items";

const MAIS_ITEM: NavItem = { href: "/mais", label: "Mais", icon: Menu };

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: NavItem["icon"];
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg py-2 pr-3 pl-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active
          ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      {active ? (
        <span
          className="absolute top-1/2 left-0 h-4 w-1 -translate-y-1/2 rounded-full bg-sidebar-accent-foreground"
          aria-hidden="true"
        />
      ) : null}
      <Icon
        className={cn("size-4", active && "stroke-[2.25]")}
        aria-hidden="true"
      />
      {label}
    </Link>
  );
}

function NavGroup({ title, items, pathname }: { title?: string; items: NavItem[]; pathname: string }) {
  return (
    <ul className="hidden flex-col gap-1 lg:flex">
      {title ? (
        <li className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-sidebar-foreground/90 uppercase">
          {title}
        </li>
      ) : null}
      {items.map((item) => (
        <li key={item.href}>
          <NavLink
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(pathname, item.href)}
          />
        </li>
      ))}
    </ul>
  );
}

export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
      <div className="px-2 pb-1">
        <BrandLogo className="text-sidebar-foreground" />
      </div>

      <nav
        aria-label="Navegação principal"
        className="mt-6 flex flex-1 flex-col overflow-y-auto"
      >
        <ul className="flex flex-col gap-1">
          {DESKTOP_NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(pathname, item.href)}
              />
            </li>
          ))}
        </ul>

        <NavGroup title="Gestão" items={DESKTOP_NAV_EXTRA_ITEMS} pathname={pathname} />
        <NavGroup title="Financeiro" items={DESKTOP_NAV_FINANCE_ITEMS} pathname={pathname} />

        <ul className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-3 lg:hidden">
          <li>
            <NavLink
              href={MAIS_ITEM.href}
              label={MAIS_ITEM.label}
              icon={MAIS_ITEM.icon}
              active={isActive(pathname, MAIS_ITEM.href)}
            />
          </li>
        </ul>
      </nav>
    </aside>
  );
}
