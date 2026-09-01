import type { PurchaseOrder } from "@/features/purchases/types";

export const purchaseOrders: PurchaseOrder[] = [
  {
    id: "purchase-order-cimento-draft",
    supplierId: "supplier-casa-materiais-silva",
    projectId: "edicula-fundos-obra",
    orderDate: "2026-08-25",
    commercialStatus: "draft",
    notes: "Aguardando confirmação de preço com o fornecedor.",
    createdAt: "2026-08-25",
    updatedAt: "2026-08-25",
  },
  {
    id: "purchase-order-cimento-areia-1",
    supplierId: "supplier-casa-materiais-silva",
    projectId: "edicula-fundos-obra",
    orderDate: "2026-08-15",
    expectedDeliveryDate: "2026-08-22",
    commercialStatus: "ordered",
    createdAt: "2026-08-15",
    updatedAt: "2026-08-16",
  },
  {
    id: "purchase-order-cimento-brita-2",
    supplierId: "supplier-deposito-sao-lucas",
    projectId: "edicula-fundos-obra",
    orderDate: "2026-08-20",
    expectedDeliveryDate: "2026-08-28",
    commercialStatus: "ordered",
    createdAt: "2026-08-20",
    updatedAt: "2026-08-21",
  },
  {
    id: "purchase-order-vergalhao-cancelado",
    supplierId: "supplier-ferragens-central",
    projectId: "reforma-cozinha-martins",
    orderDate: "2026-08-10",
    commercialStatus: "cancelled",
    notes: "Fornecedor sem estoque disponível.",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-12",
  },
];
