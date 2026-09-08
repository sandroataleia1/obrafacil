import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  BrickWall,
  Calculator,
  ClipboardList,
  DatabaseBackup,
  FileText,
  HardHat,
  House,
  Menu,
  Package,
  Receipt,
  ScrollText,
  Truck,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Real navigation, real page — just not a functional module yet. Renders an "Em breve" badge wherever this item appears. */
  comingSoon?: boolean;
}

export const MOBILE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: House },
  { href: "/calcular", label: "Calcular", icon: Calculator },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/mais", label: "Mais", icon: Menu },
];

// Visible on the sidebar at every size it renders (md+, tablet and up).
export const DESKTOP_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: House },
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
  { href: "/estoque", label: "Estoque", icon: Boxes },
];

export const DESKTOP_NAV_FINANCE_ITEMS: NavItem[] = [
  { href: "/financeiro/contas-a-pagar", label: "Contas a pagar", icon: Receipt },
  { href: "/financeiro/contas-a-receber", label: "Contas a receber", icon: Receipt },
  { href: "/notas-fiscais", label: "Notas Fiscais", icon: ScrollText, comingSoon: true },
];

// Utility/system-level destinations — not a business module, so it gets
// its own quiet group instead of crowding "Gestão" or "Financeiro".
export const DESKTOP_NAV_SYSTEM_ITEMS: NavItem[] = [
  { href: "/dados-e-backup", label: "Dados e backup", icon: DatabaseBackup },
];
