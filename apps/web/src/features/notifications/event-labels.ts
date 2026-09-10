/**
 * Frontend-only presentation labels for the backend's `group`/`event_type`
 * values (Gate NOTIFICATIONS-UI-01 §13/§14) — the API deliberately never
 * ships Portuguese labels itself (that's this file's job, not the
 * registry's).
 */
const GROUP_LABELS: Record<string, string> = {
  service_order: "Ordens de Serviço",
  payable: "Contas a pagar",
  receivable: "Contas a receber",
  project: "Obras",
  purchase: "Compras",
  stock: "Estoque",
  team: "Equipe",
};

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}

const EVENT_LABELS: Record<string, string> = {
  "service_order.created": "Nova ordem de serviço",
  "service_order.scheduled": "OS agendada",
  "service_order.due_2_hours": "OS em 2 horas",
  "service_order.due_tomorrow": "OS para amanhã",
  "service_order.due_today": "OS para hoje",
  "service_order.overdue": "OS atrasada",
  "service_order.started": "OS iniciada",
  "service_order.completed": "OS concluída",
  "service_order.cancelled": "OS cancelada",

  "payable.due_in_7_days": "Conta a pagar vence em 7 dias",
  "payable.due_in_3_days": "Conta a pagar vence em 3 dias",
  "payable.due_tomorrow": "Conta a pagar vence amanhã",
  "payable.due_today": "Conta a pagar vence hoje",
  "payable.overdue": "Conta a pagar vencida",
  "payable.paid": "Conta a pagar quitada",

  "receivable.due_tomorrow": "Recebimento previsto para amanhã",
  "receivable.due_today": "Recebimento previsto para hoje",
  "receivable.overdue": "Recebimento atrasado",
  "receivable.received": "Recebimento confirmado",

  "project.deadline_approaching": "Prazo da obra se aproximando",
  "project.overdue": "Obra atrasada",
  "project.cost_overrun": "Custo da obra acima do previsto",

  "purchase.delivery_today": "Entrega prevista para hoje",
  "purchase.delivery_overdue": "Entrega atrasada",

  "stock.shortage": "Estoque insuficiente",

  "team.period_pending": "Pendência de período da equipe",
};

/** Turns `service_order.due_today` into "Service order due today" as a last-resort fallback — never a raw, unformatted event_type string in the UI. */
function humanizeEventType(eventType: string): string {
  const action = eventType.split(".")[1];
  if (!action) return eventType;

  const words = action.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * §15: a future event type the frontend doesn't recognize yet must never
 * break the screen — it still renders, just with a readable fallback label
 * instead of the raw `event_type` identifier.
 */
export function eventLabel(eventType: string): string {
  const known = EVENT_LABELS[eventType];
  if (known) return known;

  if (process.env.NODE_ENV !== "production") {
    console.warn(`[notifications] no label mapped for event_type "${eventType}"`);
  }

  return humanizeEventType(eventType);
}

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
  7: "Domingo",
};

export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
  value: day,
  label: WEEKDAY_LABELS[day]!,
}));
