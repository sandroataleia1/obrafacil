import type { GoodsReceipt } from "@/features/purchases/types";

export const goodsReceipts: GoodsReceipt[] = [
  {
    id: "goods-receipt-1",
    purchaseOrderId: "purchase-order-cimento-areia-1",
    receivedAt: "2026-08-21",
    createdAt: "2026-08-21",
    updatedAt: "2026-08-21",
  },
  {
    id: "goods-receipt-2",
    purchaseOrderId: "purchase-order-cimento-brita-2",
    receivedAt: "2026-08-24",
    createdAt: "2026-08-24",
    updatedAt: "2026-08-24",
  },
  {
    id: "goods-receipt-3",
    purchaseOrderId: "purchase-order-cimento-brita-2",
    receivedAt: "2026-08-27",
    notes: "Entrega parcial, restante previsto para a próxima semana.",
    createdAt: "2026-08-27",
    updatedAt: "2026-08-27",
  },
  {
    id: "goods-receipt-4",
    purchaseOrderId: "purchase-order-vergalhao-cancelado",
    receivedAt: "2026-08-11",
    notes: "Entrega parcial antes do cancelamento do restante.",
    createdAt: "2026-08-11",
    updatedAt: "2026-08-11",
  },
  {
    id: "goods-receipt-5",
    purchaseOrderId: "purchase-order-tinta-edicula",
    receivedAt: "2026-08-09",
    createdAt: "2026-08-09",
    updatedAt: "2026-08-09",
  },
];
