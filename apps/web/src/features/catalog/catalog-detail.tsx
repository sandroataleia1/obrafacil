"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pencil, Tags } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { ApiError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { useAuth } from "@/features/auth/auth-provider";
import { getCatalogItem, updateCatalogItem } from "./catalog-client";
import { catalogItemToUpdatePayload } from "./catalog-item-payload";
import { CATALOG_ITEM_TYPE_LABELS } from "./labels";
import type { CatalogItem } from "./types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function CatalogDetail({ id }: { id: string }) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<"loading" | "success" | "error" | "not_found">("loading");
  const [item, setItem] = useState<CatalogItem | null>(null);
  // §47: the tenant the *current* status/item outcome actually belongs
  // to — set on every settled outcome (success, 404, or error), so a
  // failure never gets masked behind the loading skeleton forever, and
  // never shown for a tenant the user has since switched away from.
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | undefined>(undefined);

  const [togglingActive, setTogglingActive] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [confirmingInactivate, setConfirmingInactivate] = useState(false);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    // §47: never keep showing the previous tenant's item, or a pending
    // confirmation aimed at it, while the new GET is in flight.
    setStatus("loading");
    setItem(null);
    setConfirmingInactivate(false);
    setToggleError(null);
    try {
      const data = await getCatalogItem(id);
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setItem(data);
      setResolvedCompanyId(requestCompanyId);
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setResolvedCompanyId(requestCompanyId);
      if (error instanceof ApiError && error.status === 404) {
        setStatus("not_found");
        return;
      }
      setStatus("error");
    }
  }, [id, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const isCurrentTenant = resolvedCompanyId !== undefined && resolvedCompanyId === activeCompanyId;

  async function handleToggleActive(nextActive: boolean) {
    if (!item) return;
    setTogglingActive(true);
    setToggleError(null);
    try {
      const updated = await updateCatalogItem(item.id, catalogItemToUpdatePayload(item, { active: nextActive }));
      setItem(updated);
      setConfirmingInactivate(false);
    } catch {
      setToggleError(nextActive ? "Não foi possível reativar este item agora." : "Não foi possível inativar este item agora.");
    } finally {
      setTogglingActive(false);
    }
  }

  if (status === "loading" || !isCurrentTenant) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <span className="sr-only">Carregando item</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <EmptyState icon={Tags} title="Item não encontrado" description="Ele pode ter sido removido ou o link está incorreto." />
    );
  }

  if (status === "error" || !item) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          Não foi possível carregar este item agora.
        </p>
        <Button type="button" onClick={() => void load()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <BackLink title={item.name} icon={Tags} href="/catalogo" />

      <div className="rounded-xl border border-border bg-card p-4">
        <InfoRow label="Tipo" value={CATALOG_ITEM_TYPE_LABELS[item.type]} />
        {item.code ? <InfoRow label="Código" value={item.code} /> : null}
        {item.category ? <InfoRow label="Categoria" value={item.category} /> : null}
        <InfoRow label="Unidade" value={item.unit} />
        <InfoRow label="Custo base" value={decimalStringToBrlDisplay(item.cost_price) ?? "Não informado"} />
        <InfoRow label="Preço de venda" value={decimalStringToBrlDisplay(item.sale_price) ?? "Não informado"} />
        <InfoRow label="Status" value={item.active ? "Ativo" : "Inativo"} />
        {item.description ? (
          <div className="pt-2">
            <p className="text-sm text-muted-foreground">{item.description}</p>
          </div>
        ) : null}
      </div>

      {toggleError ? (
        <p role="alert" className="text-sm text-destructive">
          {toggleError}
        </p>
      ) : null}

      {/* §39: no delete action anywhere on this page. */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link href={`/catalogo/${item.id}/editar`}>
              <Pencil className="size-4" aria-hidden="true" />
              Editar
            </Link>
          }
        />
        {item.active ? (
          <Button variant="outline" onClick={() => setConfirmingInactivate(true)} disabled={togglingActive}>
            Inativar
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void handleToggleActive(true)} disabled={togglingActive}>
            {togglingActive ? "Reativando..." : "Reativar"}
          </Button>
        )}
      </div>

      <ConfirmActionDialog
        open={confirmingInactivate}
        onOpenChange={setConfirmingInactivate}
        title="Inativar este item?"
        description="Ele continuará cadastrado, mas ficará indisponível para novas seleções."
        confirmLabel="Inativar"
        disabled={togglingActive}
        onConfirm={() => void handleToggleActive(false)}
      />
    </div>
  );
}
