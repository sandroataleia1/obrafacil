import type { LucideIcon } from "lucide-react";
import {
  BrickWall,
  Calculator,
  ClipboardList,
  FileText,
  HardHat,
  House,
  Menu,
  Package,
  Receipt,
  Truck,
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

// Visible on the sidebar at every size it renders (md+, tablet and up).
export const DESKTOP_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/calcular", label: "Calcular", icon: Calculator },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/obras", label: "Obras", icon: BrickWall },
  { href: "/clientes", label: "Clientes", icon: Users },
];

// Only shown on the sidebar from lg (1024px) up — on md/tablet these stay
// tucked under "Mais" so the tablet sidebar is unchanged.
export const DESKTOP_NAV_EXTRA_ITEMS: NavItem[] = [
  { href: "/equipe", label: "Equipe", icon: HardHat },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/materiais", label: "Materiais", icon: Package },
  { href: "/compras", label: "Compras", icon: ClipboardList },
];

export const DESKTOP_NAV_FINANCE_ITEMS: NavItem[] = [
  { href: "/financeiro/contas-a-pagar", label: "Contas a pagar", icon: Receipt },
  { href: "/financeiro/contas-a-receber", label: "Contas a receber", icon: Receipt },
];
