import {
  Box,
  BrickWall,
  Grid3x3,
  Layers,
  PaintRoller,
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
    id: "contrapiso",
    name: "Contrapiso",
    description: "Calcule área e materiais necessários",
    icon: Layers,
  },
  {
    id: "piso",
    name: "Piso",
    description: "Calcule peças, área e perdas",
    icon: Grid3x3,
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
