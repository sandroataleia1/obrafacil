"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayIso } from "@/lib/date";
import { listSuppliers } from "@/features/suppliers/prototype/supplier-store";
import type { Supplier } from "@/features/suppliers/types";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import type { Project } from "@/features/projects/types";
import { createPurchaseOrder, updatePurchaseOrder } from "./prototype/purchase-order";
import { usePurchaseOrder } from "./prototype/use-purchase-order";

const NONE = "none";

export function PurchaseOrderForm({ purchaseOrderId }: { purchaseOrderId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lockedProjectId = searchParams.get("projectId");
  const lockedSupplierId = searchParams.get("supplierId");

  const { purchaseOrder: existingPurchaseOrder } = usePurchaseOrder(purchaseOrderId ?? "");
  const isEditing = Boolean(purchaseOrderId);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [supplierId, setSupplierId] = useState(lockedSupplierId ?? NONE);
  const [projectId, setProjectId] = useState(lockedProjectId ?? NONE);
  const [orderDate, setOrderDate] = useState(todayIso());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSuppliers(listSuppliers());
    setProjects(listAllProjects());
  }, []);

  useEffect(() => {
    if (!existingPurchaseOrder) return;
    // Seed the form once the existing purchase order loads from
    // localStorage. Safe post-mount update (see usePurchaseOrder).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupplierId(existingPurchaseOrder.supplierId);
    setProjectId(existingPurchaseOrder.projectId);
    setOrderDate(existingPurchaseOrder.orderDate);
    setExpectedDeliveryDate(existingPurchaseOrder.expectedDeliveryDate ?? "");
    setNotes(existingPurchaseOrder.notes ?? "");
  }, [existingPurchaseOrder]);

  const isCancelled = existingPurchaseOrder?.commercialStatus === "cancelled";

  function handleSubmit() {
    if (supplierId === NONE) {
      setError("Selecione um fornecedor.");
      return;
    }
    if (projectId === NONE) {
      setError("Selecione uma obra.");
      return;
    }

    const input = {
      supplierId,
      projectId,
      orderDate,
      expectedDeliveryDate: expectedDeliveryDate || undefined,
      notes,
    };

    const result = existingPurchaseOrder
      ? updatePurchaseOrder(existingPurchaseOrder, input)
      : createPurchaseOrder(input);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    router.push(`/compras/${result.purchaseOrder.id}`);
  }

  if (isEditing && existingPurchaseOrder === undefined) return null;

  if (isEditing && existingPurchaseOrder === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Compra não encontrada" onBack={() => router.push("/compras")} />
        <p className="pl-11 text-sm text-muted-foreground">
          Ela pode ter sido removida ou o link está incorreto.
        </p>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="space-y-6">
        <BackHeader
          title="Compra cancelada"
          onBack={() => router.push(`/compras/${existingPurchaseOrder!.id}`)}
        />
        <p className="pl-11 text-sm text-muted-foreground">
          Pedidos cancelados não podem ser editados diretamente. Reative para rascunho primeiro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title={isEditing ? "Editar compra" : "Nova compra"}
          onBack={() =>
            router.push(existingPurchaseOrder ? `/compras/${existingPurchaseOrder.id}` : "/compras")
          }
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Fornecedor</span>
          <Select value={supplierId} onValueChange={(value) => setSupplierId(value ?? NONE)}>
            <SelectTrigger className="h-12 w-full px-4 text-base">
              <SelectValue placeholder="Selecione um fornecedor">
                {(value: string | null) =>
                  suppliers.find((supplier) => supplier.id === value)?.name ?? "Selecione um fornecedor"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                  {supplier.status === "inactive" ? " (inativo)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Obra</span>
          <Select value={projectId} onValueChange={(value) => setProjectId(value ?? NONE)}>
            <SelectTrigger className="h-12 w-full px-4 text-base">
              <SelectValue placeholder="Selecione uma obra">
                {(value: string | null) =>
                  projects.find((project) => project.id === value)?.name ?? "Selecione uma obra"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="purchase-order-date" className="text-sm font-medium text-foreground">
            Data do pedido
          </label>
          <input
            id="purchase-order-date"
            type="date"
            value={orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="purchase-order-expected" className="text-sm font-medium text-foreground">
            Previsão de entrega <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="purchase-order-expected"
            type="date"
            value={expectedDeliveryDate}
            onChange={(event) => setExpectedDeliveryDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="purchase-order-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="purchase-order-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Detalhes adicionais"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button type="button" size="lg" onClick={handleSubmit} className="w-full">
        {isEditing ? "Salvar alterações" : "Criar pedido"}
      </Button>
    </div>
  );
}
