import type { ServiceOrderStatus } from "./types";

export const SERVICE_ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const SERVICE_ORDER_STATUS_FILTER_OPTIONS: { value: ServiceOrderStatus | ""; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "open", label: "Abertas" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluídas" },
  { value: "cancelled", label: "Canceladas" },
];
