"use client";

/**
 * SUPPLY-FRONTEND-01A §44/§47. Real API — loading/404/error+retry/
 * success. The "Pedidos / Total comprado" numeric summary is REMOVED
 * (not just hidden with a flag) — it was computed from the local
 * PurchaseOrder prototype, which would misrepresent itself as the real
 * Supplier's authoritative purchase history now that Supplier is API-
 * backed. Returns in SUPPLY-FRONTEND-01C once PurchaseOrder itself is
 * API-backed and can be queried for real. The "Ver compras"/"Nova
 * compra" navigation is preserved — that's just routing, not a number
 * that could misrepresent a mixed data source.
 */

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ApiValidationError } from "@/lib/api-client";
import { formatDate } from "@/lib/date";
import { formatCpfCnpj } from "@/lib/document";
import { useAuth } from "@/features/auth/auth-provider";
import { updateSupplier } from "./suppliers-client";
import { useSupplier } from "./use-supplier";
import { supplierPhoneApiToInput } from "./supplier-phone";
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
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const { supplier, error, reload } = useSupplier(id);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const activeCompanyIdRef = useRef(activeCompanyId);
  const idRef = useRef(id);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    idRef.current = id;
  }, [activeCompanyId, id]);

  if (error) {
    return (
      <div className="space-y-6">
        <BackHeader title="Fornecedor" onBack={() => router.push("/fornecedores")} />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar este fornecedor agora.
          </p>
          <Button type="button" onClick={reload}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (supplier === undefined) return null;

  if (supplier === null) {
    return (
      <EmptyState icon={Truck} title="Fornecedor não encontrado" description="Ele pode ter sido removido ou o link está incorreto." />
    );
  }

  async function handleToggleStatus() {
    if (!supplier) return;
    const requestCompanyId = activeCompanyIdRef.current;
    const requestId = idRef.current;
    setToggling(true);
    setToggleError(null);
    try {
      await updateSupplier(supplier.id, {
        name: supplier.name,
        document: supplier.document,
        contact_name: supplier.contact_name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes,
        active: !supplier.active,
      });
      if (activeCompanyIdRef.current !== requestCompanyId || idRef.current !== requestId) return;
      reload();
    } catch (submitError) {
      if (activeCompanyIdRef.current !== requestCompanyId || idRef.current !== requestId) return;
      if (submitError instanceof ApiValidationError) {
        setToggleError(submitError.serverMessage ?? Object.values(submitError.errors)[0]?.[0] ?? "Não foi possível atualizar agora.");
      } else {
        setToggleError("Não foi possível atualizar agora.");
      }
    } finally {
      if (activeCompanyIdRef.current === requestCompanyId && idRef.current === requestId) {
        setToggling(false);
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader title={supplier.name} onBack={() => router.push("/fornecedores")} />
      </div>

      <div className="pl-11">
        <SupplierStatusBadge active={supplier.active} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {supplier.document ? <InfoRow label="Documento" value={formatCpfCnpj(supplier.document)} /> : null}
        {supplier.contact_name ? <InfoRow label="Contato" value={supplier.contact_name} /> : null}
        {supplier.phone ? <InfoRow label="Telefone" value={supplierPhoneApiToInput(supplier.phone)} /> : null}
        {supplier.email ? <InfoRow label="E-mail" value={supplier.email} /> : null}
        {supplier.address ? <InfoRow label="Endereço" value={supplier.address} /> : null}
        <InfoRow label="Cadastrado em" value={formatDate(supplier.created_at)} />
        {supplier.notes ? <InfoRow label="Observação" value={supplier.notes} /> : null}
      </div>

      {toggleError ? (
        <p role="alert" className="text-sm text-destructive">
          {toggleError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={`/fornecedores/${supplier.id}/editar`}>Editar</Link>} />
        <Button type="button" variant="outline" onClick={() => void handleToggleStatus()} disabled={toggling}>
          {supplier.active ? "Inativar" : "Ativar"}
        </Button>
      </div>

      <section aria-labelledby="supplier-purchases" className="space-y-2.5">
        <h2 id="supplier-purchases" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Compras
        </h2>
        <div className={supplier.active ? "grid grid-cols-2 gap-2" : undefined}>
          <Button variant="outline" className={supplier.active ? undefined : "w-full"} nativeButton={false} render={<Link href="/compras">Ver compras</Link>} />
          {supplier.active ? (
            <Button variant="outline" nativeButton={false} render={<Link href={`/compras/nova?supplierId=${supplier.id}`}>Nova compra</Link>} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
