import type { LucideIcon } from "lucide-react";
import {
  BrickWall,
  Calculator,
  FileText,
  House,
  Menu,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const MOBILE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/calcular", label: "Calcular", icon: Calculator },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/mais", label: "Mais", icon: Menu },
];

export const DESKTOP_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/calcular", label: "Calcular", icon: Calculator },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/obras", label: "Obras", icon: BrickWall },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/mais", label: "Mais", icon: Menu },
];
