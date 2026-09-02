"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, parseCurrencyInput } from "@/lib/currency";
import { formatQuantity } from "@/lib/quantity";
import { formatMaterialUnit } from "@/features/materials/material-unit";
import { listActiveMaterials, getMaterial } from "@/features/materials/prototype/material-store";
import type { Material } from "@/features/materials/types";
import { calculateItemFulfillment, calculatePurchaseOrderFulfillment } from "./prototype/fulfillment";
import { listReceiptItemsByPurchaseOrder } from "./prototype/goods-receipt-item-store";
import { addPurchaseOrderItem, updatePurchaseOrderItem } from "./prototype/purchase-order";
import { listItemsByPurchaseOrder } from "./prototype/purchase-order-item-store";
import { usePurchaseOrder } from "./prototype/use-purchase-order";
import { usePurchaseOrderItem } from "./prototype/use-purchase-order-item";
import type { GoodsReceiptItem } from "./types";

export function PurchaseOrderItemForm({
  purchaseOrderId,
  itemId,
}: {
  purchaseOrderId: string;
  itemId?: string;
}) {
  const router = useRouter();
  const { purchaseOrder } = usePurchaseOrder(purchaseOrderId);
  const { item: existingItem } = usePurchaseOrderItem(itemId ?? "");
  const isEditing = Boolean(itemId);

  const [availableMaterials, setAvailableMaterials] = useState<Material[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [description, setDescription] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receiptItems, setReceiptItems] = useState<GoodsReceiptItem[] | undefined>(undefined);

  useEffect(() => {
    const usedMaterialIds = new Set(
      listItemsByPurchaseOrder(purchaseOrderId).map((item) => item.materialId)
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvailableMaterials(
      listActiveMaterials().filter((material) => !usedMaterialIds.has(material.id))
    );
    setReceiptItems(listReceiptItemsByPurchaseOrder(purchaseOrderId));
  }, [purchaseOrderId]);

  useEffect(() => {
    if (!existingItem) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaterialId(existingItem.materialId);
    setDescription(existingItem.description);
    setQuantityInput(String(existingItem.quantity).replace(".", ","));
    setPriceInput(String(existingItem.unitPrice).replace(".", ","));
  }, [existingItem]);

  function handleSelectMaterial(id: string) {
    setMaterialId(id);
    const material = availableMaterials.find((item) => item.id === id);
    if (material && description.trim() === "") {
      setDescription(material.name);
    }
  }

  const selectedMaterial = materialId ? getMaterial(materialId) : null;

  function parseQuantity(raw: string): number | null {
    const normalized = raw.replace(/\./g, "").replace(",", ".").trim();
    if (normalized === "") return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function handleSubmit() {
    const quantity = parseQuantity(quantityInput);
    if (quantity === null || quantity <= 0) {
      setError("Informe uma quantidade maior que zero.");
      return;
    }
    const unitPrice = parseCurrencyInput(priceInput) ?? 0;

    if (!purchaseOrder || receiptItems === undefined) return;

    const orderItems = listItemsByPurchaseOrder(purchaseOrderId);
    const result = existingItem
      ? updatePurchaseOrderItem(
          purchaseOrder,
          existingItem,
          { description, quantity, unitPrice },
          calculateItemFulfillment(existingItem, receiptItems).receivedQuantity
        )
      : addPurchaseOrderItem(
          purchaseOrder,
          { materialId, description, quantity, unitPrice },
          calculatePurchaseOrderFulfillment(orderItems, receiptItems) === "received"
        );

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    router.push(`/compras/${purchaseOrderId}`);
  }

  if (purchaseOrder === undefined) return null;
  if (isEditing && existingItem === undefined) return null;

  if (purchaseOrder === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Compra não encontrada" onBack={() => router.push("/compras")} />
      </div>
    );
  }

  if (isEditing && existingItem === null) {
    return (
      <div className="space-y-6">
        <BackHeader
          title="Item não encontrado"
          onBack={() => router.push(`/compras/${purchaseOrderId}`)}
        />
      </div>
    );
  }

  const total = (parseQuantity(quantityInput) ?? 0) * (parseCurrencyInput(priceInput) ?? 0);

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title={isEditing ? "Editar item" : "Adicionar item"}
          onBack={() => router.push(`/compras/${purchaseOrderId}`)}
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Material</span>
          {isEditing ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {selectedMaterial?.name ?? "—"}
            </div>
          ) : (
            <Select value={materialId} onValueChange={(value) => handleSelectMaterial(value ?? "")}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione um material">
                  {(value: string | null) =>
                    availableMaterials.find((material) => material.id === value)?.name ??
                    "Selecione um material"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableMaterials.map((material) => (
                  <SelectItem key={material.id} value={material.id}>
                    {material.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!isEditing && availableMaterials.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Todos os materiais ativos já foram adicionados a este pedido.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="item-description" className="text-sm font-medium text-foreground">
            Descrição
          </label>
          <input
            id="item-description"
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Cimento CP-II 50kg Votoran"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="item-quantity" className="text-sm font-medium text-foreground">
              Quantidade
            </label>
            <input
              id="item-quantity"
              type="text"
              inputMode="decimal"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
            {isEditing && existingItem && receiptItems !== undefined ? (
              (() => {
                const itemFulfillment = calculateItemFulfillment(existingItem, receiptItems);
                if (itemFulfillment.receivedQuantity <= 0) return null;
                return itemFulfillment.state === "received" ? (
                  <p className="text-xs text-muted-foreground">
                    Totalmente recebido — quantidade travada.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Já recebido: {formatQuantity(itemFulfillment.receivedQuantity)}
                  </p>
                );
              })()
            ) : null}
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Unidade</span>
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {selectedMaterial ? formatMaterialUnit(selectedMaterial.defaultUnit) : "—"}
            </div>
          </div>
        </div>

        <MoneyField
          id="item-unit-price"
          label="Preço unitário"
          value={priceInput}
          onChange={setPriceInput}
        />

        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-sm text-muted-foreground">Total do item</span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(total)}
          </span>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button
        type="button"
        size="lg"
        onClick={handleSubmit}
        disabled={!isEditing && !materialId}
        className="w-full"
      >
        {isEditing ? "Salvar alterações" : "Adicionar item"}
      </Button>
    </div>
  );
}
