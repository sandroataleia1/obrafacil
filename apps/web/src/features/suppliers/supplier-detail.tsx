"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/date";
import { formatPhoneInput } from "@/lib/phone";
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
    </div>
  );
}
