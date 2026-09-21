"use client";

/**
 * SUPPLY-FRONTEND-01C. Real API create/edit — no browser UUID, no
 * `todayIso()` fabricated id, server is authority. Outer-wrapper +
 * keyed-Inner tenant-ownership pattern mirrors `RequirementForm`/
 * `MaterialForm`/`SupplierForm`: the outer owns `activeCompanyIdRef`/
 * `orderIdRef` (written together via `useLayoutEffect`) and force-
 * remounts the Inner via `key={`${activeCompanyId}:${orderId ?? "new"}`}`
 * on any Company/id switch.
 *
 * Field-locking follows the backend's own rule: `draft` allows editing
 * supplier/project/order_date; `ordered` locks those three but keeps
 * `expected_delivery_date`/`notes` editable; `cancelled` is fully
 * read-only (return to draft first). `updated_at` is captured from the
 * last-loaded order and echoed back verbatim on submit; a 409 shows a
 * controlled notice and refetches truth, never a silent retry.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { todayIso } from "@/lib/date";
import { useAuth } from "@/features/auth/auth-provider";
import { useAllSuppliers } from "@/features/suppliers/use-all-suppliers";
import { useAllProjects } from "@/features/projects/use-all-projects";
import { createPurchaseOrder, updatePurchaseOrder } from "./purchase-orders-client";
import { usePurchaseOrder } from "./use-purchase-order";

const NONE = "none";

function PurchaseOrderFormInner({
  orderId,
  lockedProjectId,
  lockedSupplierId,
  activeCompanyIdRef,
  orderIdRef,
}: {
  orderId?: string;
  lockedProjectId: string | null;
  lockedSupplierId: string | null;
  activeCompanyIdRef: React.RefObject<string | undefined>;
  orderIdRef: React.RefObject<string>;
}) {
  const router = useRouter();
  const isEditing = Boolean(orderId);
  const { order: existingOrder, error: orderError, reload: reloadOrder } = usePurchaseOrder(orderId ?? "");

  const { suppliers: allSuppliers, error: suppliersError } = useAllSuppliers();
  const suppliers = allSuppliers ?? [];
  const { projects: allProjects, error: projectsError } = useAllProjects();
  const projects = allProjects ?? [];

  const [supplierId, setSupplierId] = useState(NONE);
  const [projectId, setProjectId] = useState(NONE);
  const [orderDate, setOrderDate] = useState(todayIso());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isEditing || !lockedSupplierId || allSuppliers === undefined) return;
    const locked = allSuppliers.find((supplier) => supplier.id === lockedSupplierId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (locked && locked.active) setSupplierId(locked.id);
  }, [lockedSupplierId, allSuppliers, isEditing]);

  useEffect(() => {
    if (isEditing || !lockedProjectId || allProjects === undefined) return;
    const locked = allProjects.find((project) => project.id === lockedProjectId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (locked) setProjectId(locked.id);
  }, [lockedProjectId, allProjects, isEditing]);

  useEffect(() => {
    if (!existingOrder) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupplierId(existingOrder.supplier.id);
    setProjectId(existingOrder.project.id);
    setOrderDate(existingOrder.order_date);
    setExpectedDeliveryDate(existingOrder.expected_delivery_date ?? "");
    setNotes(existingOrder.notes ?? "");
  }, [existingOrder]);

  const isCancelled = existingOrder?.commercial_status === "cancelled";
  const locksSupplierProjectDate = existingOrder?.commercial_status === "ordered";

  const selectableSuppliers = suppliers.filter(
    (supplier) => supplier.active || supplier.id === existingOrder?.supplier.id
  );

  const submitCompanyId = activeCompanyIdRef.current;
  const submitOrderId = orderIdRef.current;
  const isStale = useCallback(
    () => activeCompanyIdRef.current !== submitCompanyId || orderIdRef.current !== submitOrderId,
    [activeCompanyIdRef, orderIdRef, submitCompanyId, submitOrderId]
  );

  const handleSubmit = useCallback(async () => {
    if (supplierId === NONE) {
      setError("Selecione um fornecedor.");
      return;
    }
    if (projectId === NONE) {
      setError("Selecione uma obra.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let saved;
      if (isEditing && existingOrder) {
        saved = await updatePurchaseOrder(existingOrder.id, {
          supplier_id: supplierId,
          project_id: projectId,
          order_date: orderDate,
          expected_delivery_date: expectedDeliveryDate || null,
          notes: notes.trim() || null,
          updated_at: existingOrder.updated_at,
        });
      } else {
        saved = await createPurchaseOrder({
          supplier_id: supplierId,
          project_id: projectId,
          order_date: orderDate,
          expected_delivery_date: expectedDeliveryDate || null,
          notes: notes.trim() || null,
        });
      }

      if (isStale()) return;
      setSubmitting(false);
      router.push(`/compras/${saved.id}`);
    } catch (submitError) {
      if (isStale()) return;
      setSubmitting(false);
      if (submitError instanceof ApiError && submitError.status === 409) {
        setError("A compra foi alterada por outra operação. Os dados foram atualizados.");
        reloadOrder();
        return;
      }
      if (submitError instanceof ApiValidationError) {
        const firstMessage =
          submitError.errors.supplier_id?.[0] ??
          submitError.errors.project_id?.[0] ??
          submitError.errors.order_date?.[0] ??
          submitError.errors.expected_delivery_date?.[0] ??
          Object.values(submitError.errors)[0]?.[0];
        setError(firstMessage ?? submitError.serverMessage ?? "Não foi possível salvar. Verifique os campos.");
        return;
      }
      setError("Não foi possível salvar agora. Tente novamente.");
    }
  }, [isEditing, existingOrder, supplierId, projectId, orderDate, expectedDeliveryDate, notes, isStale, router, reloadOrder]);

  if (isEditing && orderError) {
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

  if (isEditing && existingOrder === undefined) return null;

  if (isEditing && existingOrder === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Compra não encontrada" onBack={() => router.push("/compras")} />
        <p className="pl-11 text-sm text-muted-foreground">Ela pode ter sido removida ou o link está incorreto.</p>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="space-y-6">
        <BackHeader title="Compra cancelada" onBack={() => router.push(`/compras/${existingOrder!.id}`)} />
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
          onBack={() => router.push(existingOrder ? `/compras/${existingOrder.id}` : "/compras")}
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Fornecedor</span>
          {locksSupplierProjectDate ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {existingOrder!.supplier.name}
            </div>
          ) : (
            <Select value={supplierId} onValueChange={(value) => setSupplierId(value ?? NONE)}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione um fornecedor">
                  {(value: string | null) => {
                    const selected = suppliers.find((supplier) => supplier.id === value);
                    if (!selected) return "Selecione um fornecedor";
                    return !selected.active ? `${selected.name} (inativo)` : selected.name;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {selectableSuppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                    {!supplier.active ? " (inativo)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {suppliersError ? (
            <p className="text-xs text-destructive">Não foi possível carregar os fornecedores agora.</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Obra</span>
          {locksSupplierProjectDate ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {existingOrder!.project.name}
            </div>
          ) : (
            <Select value={projectId} onValueChange={(value) => setProjectId(value ?? NONE)}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione uma obra">
                  {(value: string | null) => projects.find((project) => project.id === value)?.name ?? "Selecione uma obra"}
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
          )}
          {projectsError ? (
            <p className="text-xs text-destructive">Não foi possível carregar as obras agora.</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="purchase-order-date" className="text-sm font-medium text-foreground">
            Data do pedido
          </label>
          {locksSupplierProjectDate ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {orderDate}
            </div>
          ) : (
            <input
              id="purchase-order-date"
              type="date"
              value={orderDate}
              onChange={(event) => setOrderDate(event.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          )}
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

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Button type="button" size="lg" onClick={() => void handleSubmit()} disabled={submitting} className="w-full">
        {isEditing ? "Salvar alterações" : "Criar pedido"}
      </Button>
    </div>
  );
}

export function PurchaseOrderForm({ purchaseOrderId }: { purchaseOrderId?: string }) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  const orderIdRef = useRef(purchaseOrderId ?? "new");
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    orderIdRef.current = purchaseOrderId ?? "new";
  }, [activeCompanyId, purchaseOrderId]);

  const searchParams = useSearchParams();
  const lockedProjectId = searchParams.get("projectId");
  const lockedSupplierId = searchParams.get("supplierId");

  return (
    <PurchaseOrderFormInner
      key={`${activeCompanyId}:${purchaseOrderId ?? "new"}`}
      orderId={purchaseOrderId}
      lockedProjectId={lockedProjectId}
      lockedSupplierId={lockedSupplierId}
      activeCompanyIdRef={activeCompanyIdRef}
      orderIdRef={orderIdRef}
    />
  );
}
