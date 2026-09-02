import type { GoodsReceiptItem } from "@/features/purchases/types";

export const goodsReceiptItems: GoodsReceiptItem[] = [
  // goods-receipt-1: purchase-order-cimento-areia-1 fully received
  {
    id: "goods-receipt-item-1-cimento",
    goodsReceiptId: "goods-receipt-1",
    purchaseOrderItemId: "item-po1-cimento",
    quantity: 40,
  },
  {
    id: "goods-receipt-item-1-areia",
    goodsReceiptId: "goods-receipt-1",
    purchaseOrderItemId: "item-po1-areia",
    quantity: 5,
  },
  // goods-receipt-2: purchase-order-cimento-brita-2, first partial delivery
  {
    id: "goods-receipt-item-2-cimento",
    goodsReceiptId: "goods-receipt-2",
    purchaseOrderItemId: "item-po2-cimento",
    quantity: 25,
  },
  // goods-receipt-3: purchase-order-cimento-brita-2, second delivery (still partial)
  {
    id: "goods-receipt-item-3-cimento",
    goodsReceiptId: "goods-receipt-3",
    purchaseOrderItemId: "item-po2-cimento",
    quantity: 15,
  },
  {
    id: "goods-receipt-item-3-brita",
    goodsReceiptId: "goods-receipt-3",
    purchaseOrderItemId: "item-po2-brita",
    quantity: 1,
  },
  // goods-receipt-4: purchase-order-vergalhao-cancelado, partial delivery before cancellation
  {
    id: "goods-receipt-item-4-vergalhao",
    goodsReceiptId: "goods-receipt-4",
    purchaseOrderItemId: "item-po3-vergalhao",
    quantity: 8,
  },
  // goods-receipt-5: purchase-order-tinta-edicula, fully received (material
  // later marked inactive in the catalog — still usable, see Task 042)
  {
    id: "goods-receipt-item-5-tinta",
    goodsReceiptId: "goods-receipt-5",
    purchaseOrderItemId: "item-po-tinta-edicula",
    quantity: 10,
  },
];
