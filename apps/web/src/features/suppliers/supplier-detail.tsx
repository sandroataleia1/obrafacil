"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { formatPhoneInput } from "@/lib/phone";
import { listPurchaseOrdersBySupplier } from "@/features/purchases/prototype/purchase-order-store";
import { listItemsByPurchaseOrders } from "@/features/purchases/prototype/purchase-order-item-store";
import { calculatePurchaseOrderTotal } from "@/features/purchases/prototype/purchase-totals";
import type { PurchaseOrder } from "@/features/purchases/types";
import { saveSupplier } from "./prototype/supplier-store";
import { useSupplier } from "./prototype/use-supplier";
import { SupplierStatusBadge } from "./components/status-badge";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function SupplierDetail({ id }: { id: string }) {
  const router = useRouter();
  const { supplier, refresh } = useSupplier(id);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPurchaseOrders(listPurchaseOrdersBySupplier(id));
  }, [id]);

  if (supplier === undefined) return null;

  if (supplier === null) {
    return (
      <EmptyState
        icon={Truck}
        title="Fornecedor não encontrado"
        description="Ele pode ter sido removido ou o link está incorreto."
      />
    );
  }

  function handleToggleStatus() {
    if (!supplier) return;
    saveSupplier({
      ...supplier,
      status: supplier.status === "active" ? "inactive" : "active",
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader title={supplier.name} onBack={() => router.push("/fornecedores")} />
      </div>

      <div className="pl-11">
        <SupplierStatusBadge status={supplier.status} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {supplier.document ? <InfoRow label="Documento" value={supplier.document} /> : null}
        {supplier.contactName ? <InfoRow label="Contato" value={supplier.contactName} /> : null}
        {supplier.phone ? (
          <InfoRow label="Telefone" value={formatPhoneInput(supplier.phone)} />
        ) : null}
        {supplier.email ? <InfoRow label="E-mail" value={supplier.email} /> : null}
        {supplier.address ? <InfoRow label="Endereço" value={supplier.address} /> : null}
        <InfoRow label="Cadastrado em" value={formatDate(supplier.createdAt)} />
        {supplier.notes ? <InfoRow label="Observação" value={supplier.notes} /> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/fornecedores/${supplier.id}/editar`}>Editar</Link>}
        />
        <Button type="button" variant="outline" onClick={handleToggleStatus}>
          {supplier.status === "active" ? "Inativar" : "Ativar"}
        </Button>
      </div>

      <section aria-labelledby="supplier-purchases" className="space-y-2.5">
        <h2
          id="supplier-purchases"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Compras
        </h2>
        <div className="flex items-center gap-6 rounded-xl border border-border bg-card p-4">
          <div>
            <p className="text-xs text-muted-foreground">Pedidos</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {purchaseOrders?.length ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total comprado</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {formatCurrency(
                calculatePurchaseOrderTotal(
                  listItemsByPurchaseOrders(
                    (purchaseOrders ?? [])
                      .filter((purchaseOrder) => purchaseOrder.commercialStatus === "ordered")
                      .map((purchaseOrder) => purchaseOrder.id)
                  )
                )
              )}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/compras">Ver compras</Link>}
          />
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/compras/nova?supplierId=${supplier.id}`}>Nova compra</Link>}
          />
        </div>
      </section>
    </div>
  );
}
