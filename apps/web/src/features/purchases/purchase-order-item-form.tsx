"use client";

/**
 * SUPPLY-FRONTEND-01C. Real API create/edit — items resolve from the
 * already-loaded `order.items` (no standalone GET-item endpoint exists).
 * Create excludes already-used material ids and defaults `description`
 * to `Material.name`; it never builds an Item locally after the 201 —
 * navigation back to the detail always re-reads the API. Edit shows the
 * Material fixed (immutable) and displays unit via the item's OWN
 * snapshot `unit_code`/`unit_custom_label` — never a live Material
 * lookup for historical unit. Received/remaining guards read the
 * backend's own `received_quantity`/`remaining_quantity` — the backend
 * remains the final authority either way.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { formatMaterialUnitCode } from "@/features/materials/material-unit";
import { useAllMaterials } from "@/features/materials/use-all-materials";
import { createPurchaseOrderItem, updatePurchaseOrderItem } from "./purchase-orders-client";
import { usePurchaseOrder } from "./use-purchase-order";
import { purchaseDecimalApiToInput, purchaseQuantityInputToApi, purchaseUnitPriceInputToApi } from "./purchase-decimal";

export function PurchaseOrderItemForm({ purchaseOrderId, itemId }: { purchaseOrderId: string; itemId?: string }) {
  const router = useRouter();
  const { order, error: orderError, reload: reloadOrder } = usePurchaseOrder(purchaseOrderId);
  const isEditing = Boolean(itemId);
  const existingItem = order && itemId ? order.items.find((item) => item.id === itemId) : undefined;

  const [materialId, setMaterialId] = useState("");
  const [description, setDescription] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { materials: activeMaterials, error: materialsError } = useAllMaterials({ active: true });
  const usedMaterialIds = new Set((order?.items ?? []).map((item) => item.material.id));
  const availableMaterials = (activeMaterials ?? []).filter((material) => !usedMaterialIds.has(material.id));

  useEffect(() => {
    if (!existingItem) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDescription(existingItem.description);
    setQuantityInput(purchaseDecimalApiToInput(existingItem.quantity));
    setPriceInput(purchaseDecimalApiToInput(existingItem.unit_price));
  }, [existingItem]);

  function handleSelectMaterial(id: string) {
    setMaterialId(id);
    const material = availableMaterials.find((item) => item.id === id);
    if (material && description.trim() === "") {
      setDescription(material.name);
    }
  }

  async function handleSubmit() {
    if (!order) return;

    const quantity = purchaseQuantityInputToApi(quantityInput);
    if (quantity === null) {
      setError("Informe uma quantidade válida, maior que zero e com até 3 casas decimais.");
      return;
    }
    const unitPrice = purchaseUnitPriceInputToApi(priceInput);
    if (unitPrice === null) {
      setError("Informe um preço unitário válido, com até 2 casas decimais.");
      return;
    }
    if (!isEditing && !materialId) {
      setError("Selecione um material.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (isEditing && existingItem) {
        await updatePurchaseOrderItem(purchaseOrderId, existingItem.id, {
          description,
          quantity,
          unit_price: unitPrice,
          updated_at: existingItem.updated_at,
        });
      } else {
        await createPurchaseOrderItem(purchaseOrderId, {
          material_id: materialId,
          description,
          quantity,
          unit_price: unitPrice,
        });
      }
      setSubmitting(false);
      router.push(`/compras/${purchaseOrderId}`);
    } catch (submitError) {
      setSubmitting(false);
      if (submitError instanceof ApiError && submitError.status === 409) {
        setError("A compra foi alterada por outra operação. Os dados foram atualizados.");
        reloadOrder();
        return;
      }
      if (submitError instanceof ApiValidationError) {
        const firstMessage =
          submitError.errors.material_id?.[0] ??
          submitError.errors.description?.[0] ??
          submitError.errors.quantity?.[0] ??
          submitError.errors.unit_price?.[0] ??
          Object.values(submitError.errors)[0]?.[0];
        setError(firstMessage ?? submitError.serverMessage ?? "Não foi possível salvar. Verifique os campos.");
        return;
      }
      setError("Não foi possível salvar agora. Tente novamente.");
    }
  }

  if (orderError) {
    return (
      <div className="space-y-6">
        <BackHeader title="Compra" onBack={() => router.push("/compras")} />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar esta compra agora.
          </p>
          <Button type="button" onClick={reloadOrder}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (order === undefined) return null;

  if (order === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Compra não encontrada" onBack={() => router.push("/compras")} />
      </div>
    );
  }

  if (isEditing && existingItem === undefined) {
    return (
      <div className="space-y-6">
        <BackHeader title="Item não encontrado" onBack={() => router.push(`/compras/${purchaseOrderId}`)} />
      </div>
    );
  }

  const selectedNewMaterial = availableMaterials.find((material) => material.id === materialId);

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
              {existingItem!.material.name}
              {!existingItem!.material.active ? " (inativo)" : ""}
            </div>
          ) : (
            <Select value={materialId} onValueChange={(value) => handleSelectMaterial(value ?? "")}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione um material">
                  {(value: string | null) =>
                    availableMaterials.find((material) => material.id === value)?.name ?? "Selecione um material"
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
          {materialsError ? (
            <p className="text-xs text-destructive">Não foi possível carregar os materiais agora.</p>
          ) : !isEditing && activeMaterials !== undefined && availableMaterials.length === 0 ? (
            <p className="text-xs text-muted-foreground">Todos os materiais ativos já foram adicionados a este pedido.</p>
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
            {isEditing && existingItem && Number(existingItem.received_quantity) > 0 ? (
              <p className="text-xs text-muted-foreground">Já recebido: {purchaseDecimalApiToInput(existingItem.received_quantity)}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Unidade</span>
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {isEditing && existingItem
                ? formatMaterialUnitCode(existingItem.unit_code, existingItem.unit_custom_label)
                : selectedNewMaterial
                  ? formatMaterialUnitCode(selectedNewMaterial.unit_code, selectedNewMaterial.unit_custom_label)
                  : "—"}
            </div>
          </div>
        </div>

        <MoneyField id="item-unit-price" label="Preço unitário" value={priceInput} onChange={setPriceInput} />

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        size="lg"
        onClick={() => void handleSubmit()}
        disabled={submitting || (!isEditing && !materialId)}
        className="w-full"
      >
        {isEditing ? "Salvar alterações" : "Adicionar item"}
      </Button>
    </div>
  );
}
