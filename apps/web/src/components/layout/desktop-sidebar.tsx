"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { DESKTOP_NAV_ITEMS } from "./nav-items";

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
  icon: (typeof DESKTOP_NAV_ITEMS)[number]["icon"];
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg py-2 pr-3 pl-4 text-sm font-medium transition-colors",
        active
          ? "bg-primary/8 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {active ? (
        <span
          className="absolute top-1/2 left-0 h-4 w-1 -translate-y-1/2 rounded-full bg-primary"
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

export function DesktopSidebar() {
  const pathname = usePathname();
  const mainItems = DESKTOP_NAV_ITEMS.filter((item) => item.href !== "/mais");
  const moreItem = DESKTOP_NAV_ITEMS.find((item) => item.href === "/mais");

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-5 md:flex">
      <div className="px-2 pb-1">
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-foreground">Obra</span>
          <span className="text-primary">Fácil</span>
        </span>
      </div>

      <nav
        aria-label="Navegação principal"
        className="mt-6 flex flex-1 flex-col"
      >
        <ul className="flex flex-col gap-1">
          {mainItems.map((item) => (
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

        {moreItem ? (
          <ul className="mt-auto flex flex-col gap-1 border-t border-border pt-3">
            <li>
              <NavLink
                href={moreItem.href}
                label={moreItem.label}
                icon={moreItem.icon}
                active={isActive(pathname, moreItem.href)}
              />
            </li>
          </ul>
        ) : null}
      </nav>
    </aside>
  );
}
