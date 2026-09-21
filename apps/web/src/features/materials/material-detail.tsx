"use client";

/**
 * SUPPLY-FRONTEND-01A §34. Real API — loading/404/error+retry/success.
 */

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ApiValidationError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { formatMaterialUnitCode } from "./material-unit";
import { updateMaterial } from "./materials-client";
import { useMaterial } from "./use-material";
import { MaterialStatusBadge } from "./components/status-badge";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function MaterialDetail({ id }: { id: string }) {
  const router = useRouter();
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const { material, error, reload } = useMaterial(id);
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
        <BackHeader title="Material" onBack={() => router.push("/materiais")} />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar este material agora.
          </p>
          <Button type="button" onClick={reload}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (material === undefined) return null;

  if (material === null) {
    return (
      <EmptyState icon={Package} title="Material não encontrado" description="Ele pode ter sido removido ou o link está incorreto." />
    );
  }

  async function handleToggleStatus() {
    if (!material) return;
    const requestCompanyId = activeCompanyIdRef.current;
    const requestId = idRef.current;
    setToggling(true);
    setToggleError(null);
    try {
      await updateMaterial(material.id, {
        name: material.name,
        unit_code: material.unit_code,
        unit_custom_label: material.unit_custom_label,
        notes: material.notes,
        active: !material.active,
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
        <BackHeader title={material.name} onBack={() => router.push("/materiais")} />
      </div>

      <div className="pl-11">
        <MaterialStatusBadge active={material.active} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <InfoRow label="Unidade" value={formatMaterialUnitCode(material.unit_code, material.unit_custom_label)} />
        {material.notes ? <InfoRow label="Observação" value={material.notes} /> : null}
      </div>

      {toggleError ? (
        <p role="alert" className="text-sm text-destructive">
          {toggleError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={`/materiais/${material.id}/editar`}>Editar</Link>} />
        <Button type="button" variant="outline" onClick={() => void handleToggleStatus()} disabled={toggling}>
          {material.active ? "Inativar" : "Ativar"}
        </Button>
      </div>
    </div>
  );
}
