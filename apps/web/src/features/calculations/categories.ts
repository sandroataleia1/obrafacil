import {
  Box,
  BrickWall,
  Grid3x3,
  Layers,
  PaintRoller,
  PanelTop,
  SquareStack,
  type LucideIcon,
} from "lucide-react";

export interface CalculatorCategory {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  href?: string;
}

export const CALCULATOR_CATEGORIES: CalculatorCategory[] = [
  {
    id: "alvenaria",
    name: "Alvenaria",
    description: "Parede com tijolos ou blocos",
    icon: BrickWall,
    href: "/calcular/alvenaria",
  },
  {
    id: "piso",
    name: "Piso",
    description: "Calcule área, caixas e perda",
    icon: Grid3x3,
    href: "/calcular/piso",
  },
  {
    id: "forro",
    name: "Forro",
    description: "Calcule placas e acabamento",
    icon: PanelTop,
    href: "/calcular/forro",
  },
  {
    id: "laje",
    name: "Laje",
    description: "Estime volume e materiais",
    icon: SquareStack,
    href: "/calcular/laje",
  },
  {
    id: "contrapiso",
    name: "Contrapiso",
    description: "Calcule área e materiais necessários",
    icon: Layers,
  },
  {
    id: "pintura",
    name: "Pintura",
    description: "Calcule área e consumo de tinta",
    icon: PaintRoller,
  },
  {
    id: "concreto",
    name: "Concreto",
    description: "Calcule volume e materiais",
    icon: Box,
  },
];
