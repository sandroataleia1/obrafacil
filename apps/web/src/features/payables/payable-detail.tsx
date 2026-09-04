"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { getProject } from "@/features/projects/prototype/project-store";
import { getEmployee } from "@/features/employees/prototype/employee-store";
import { getWorkPeriod } from "@/features/employees/prototype/work-period-store";
import { formatPeriodShort } from "@/features/employees/prototype/period-label";
import { getPurchaseOrder } from "@/features/purchases/prototype/purchase-order-store";
import { PROJECT_COST_CATEGORY_LABEL } from "@/features/project-costs/types";
import { MarkAsPaidDialog } from "./mark-as-paid-dialog";
import { removePayable } from "./prototype/payable";
import { undoPayablePayment } from "./prototype/payable-payment";
import { usePayable } from "./prototype/use-payable";
import { describeDueDate, getPayableStatus } from "./payable-status";
import { PayableStatusBadge } from "./components/status-badge";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function PayableDetail({ id }: { id: string }) {
  const router = useRouter();
  const { payable, refresh } = usePayable(id);
  const [payingOpen, setPayingOpen] = useState(false);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (payable === undefined) return null;

  if (payable === null) {
    return (
      <EmptyState
        icon={Receipt}
        title="Conta não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  const status = getPayableStatus(payable);
  const project = payable.projectId ? getProject(payable.projectId) : null;
  const dueHint = status !== "paid" ? describeDueDate(payable.dueDate) : null;
  const originWorkPeriod =
    payable.originType === "employee-period" && payable.originId
      ? getWorkPeriod(payable.originId)
      : null;
  const originEmployee = originWorkPeriod ? getEmployee(originWorkPeriod.employeeId) : null;
  const originPurchaseOrder =
    payable.originType === "purchase-order" && payable.originId
      ? getPurchaseOrder(payable.originId)
      : null;

  function handleConfirmUndoPayment() {
    if (!payable) return;
    undoPayablePayment(payable.id);
    setUndoConfirmOpen(false);
    refresh();
  }

  function handleConfirmDelete() {
    if (!payable) return;
    const result = removePayable(payable);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    router.push("/financeiro/contas-a-pagar");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader
          title={payable.supplier ?? payable.description}
          onBack={() => router.push("/financeiro/contas-a-pagar")}
        />
      </div>

      <div className="flex items-center justify-between gap-3 pl-11">
        <p className="text-2xl font-semibold tabular-nums text-foreground">
          {formatCurrency(payable.amount)}
        </p>
        <PayableStatusBadge status={status} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <InfoRow label="Descrição" value={payable.description} />
        {payable.supplier ? <InfoRow label="Fornecedor" value={payable.supplier} /> : null}
        <InfoRow label="Categoria" value={PROJECT_COST_CATEGORY_LABEL[payable.category]} />
        <InfoRow
          label="Vencimento"
          value={dueHint ? `${formatDate(payable.dueDate)} · ${dueHint}` : formatDate(payable.dueDate)}
        />
        {status === "paid" && payable.paidAt ? (
          <InfoRow label="Pago em" value={formatDate(payable.paidAt)} />
        ) : null}
        {project ? (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-muted-foreground">Obra</span>
            <Link
              href={`/obras/${project.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {project.name}
            </Link>
          </div>
        ) : null}
        {payable.notes ? <InfoRow label="Observação" value={payable.notes} /> : null}
        {originWorkPeriod && originEmployee ? (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-muted-foreground">Origem</span>
            <Link
              href={`/equipe/${originEmployee.id}/periodos/${originWorkPeriod.period}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Equipe · {originEmployee.name} · {formatPeriodShort(originWorkPeriod.period)}
            </Link>
          </div>
        ) : null}
        {originPurchaseOrder ? (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-muted-foreground">Origem</span>
            <Link
              href={`/compras/${originPurchaseOrder.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Compra · {payable.supplier ?? "Fornecedor"} · {formatDate(originPurchaseOrder.orderDate)}
            </Link>
          </div>
        ) : null}
      </div>

      {status === "paid" ? (
        <div className="space-y-3">
          {project ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Custo registrado na obra
              </p>
              <p className="text-sm font-medium text-foreground">{project.name}</p>
              <Link
                href={`/obras/${project.id}/custos`}
                className="mt-1 inline-block text-sm text-primary hover:underline"
              >
                Ver custos da obra
              </Link>
            </div>
          ) : null}
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setUndoConfirmOpen(true)}>
            Desfazer pagamento
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Button type="button" size="lg" className="w-full" onClick={() => setPayingOpen(true)}>
            Marcar como paga
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/financeiro/contas-a-pagar/${payable.id}/editar`}>Editar</Link>}
            />
            <Button type="button" variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
              Excluir
            </Button>
          </div>
        </div>
      )}

      <MarkAsPaidDialog payable={payable} open={payingOpen} onOpenChange={setPayingOpen} onConfirmed={refresh} />

      <ConfirmActionDialog
        open={undoConfirmOpen}
        onOpenChange={setUndoConfirmOpen}
        title="Desfazer pagamento?"
        description="Se ela gerou um custo na obra, esse custo será removido."
        confirmLabel="Desfazer pagamento"
        destructive
        onConfirm={handleConfirmUndoPayment}
      />

      <ConfirmActionDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) setDeleteError(null);
        }}
        title="Excluir conta?"
        description={`Remover a conta "${payable.description}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        onConfirm={handleConfirmDelete}
      >
        {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
      </ConfirmActionDialog>
    </div>
  );
}
