import type { Receipt } from "@/features/receivables/types";

export const receipts: Receipt[] = [
  {
    id: "receipt-recebida-edicula-1",
    receivableId: "receivable-recebida-edicula",
    amount: 10000,
    receivedAt: "2026-08-18",
    createdAt: "2026-08-18",
    updatedAt: "2026-08-18",
  },
  {
    id: "receipt-parcial-mariana-1",
    receivableId: "receivable-parcial-mariana",
    amount: 12000,
    receivedAt: "2026-08-28",
    createdAt: "2026-08-28",
    updatedAt: "2026-08-28",
  },
  {
    id: "receipt-parcial-vencida-edicula-1",
    receivableId: "receivable-parcial-vencida-edicula",
    amount: 12000,
    receivedAt: "2026-08-15",
    createdAt: "2026-08-15",
    updatedAt: "2026-08-15",
  },
];
