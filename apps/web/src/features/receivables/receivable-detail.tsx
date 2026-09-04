"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Receipt as ReceiptIcon, Trash2 } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { getProject } from "@/features/projects/prototype/project-store";
import { getCustomer } from "@/features/customers/prototype/customer-store";
import { RegisterReceiptDialog } from "./register-receipt-dialog";
import { calculateReceivableFinancials, describeDueDate } from "./receivable-status";
import { removeReceipt, removeReceivable } from "./prototype/receivable";
import { useReceivable } from "./prototype/use-receivable";
import { ReceivableStatusBadge } from "./components/status-badge";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function ReceivableDetail({ id }: { id: string }) {
  const router = useRouter();
  const { receivable, receipts, refresh } = useReceivable(id);
  const [registeringOpen, setRegisteringOpen] = useState(false);
  const [deletingReceiptId, setDeletingReceiptId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (receivable === undefined) return null;

  if (receivable === null) {
    return (
      <EmptyState
        icon={ReceiptIcon}
        title="Conta não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  const customer = getCustomer(receivable.customerId);
  const project = receivable.projectId ? getProject(receivable.projectId) : null;
  const { receivedAmount, outstandingAmount, displayStatus } = calculateReceivableFinancials(
    receivable,
    receipts
  );
  const dueHint = displayStatus !== "received" ? describeDueDate(receivable.dueDate) : null;

  function handleConfirmDeleteReceipt() {
    if (!deletingReceiptId) return;
    removeReceipt(deletingReceiptId);
    setDeletingReceiptId(null);
    refresh();
  }

  function handleConfirmDelete() {
    if (!receivable) return;
    const result = removeReceivable(receivable);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    router.push("/financeiro/contas-a-receber");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader
          title={receivable.description}
          onBack={() => router.push("/financeiro/contas-a-receber")}
        />
      </div>

      <div className="flex items-center justify-between gap-3 pl-11">
        <p className="text-2xl font-semibold tabular-nums text-foreground">
          {formatCurrency(receivable.amount)}
        </p>
        <ReceivableStatusBadge status={displayStatus} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <InfoRow label="Descrição" value={receivable.description} />
        <div className="flex items-center justify-between py-1.5">
          <span className="text-sm text-muted-foreground">Cliente</span>
          {customer ? (
            <Link
              href={`/clientes/${customer.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {customer.name}
            </Link>
          ) : (
            <span className="text-sm font-medium text-foreground">Cliente não encontrado</span>
          )}
        </div>
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
        <div className="mt-2 border-t border-border pt-2">
          <InfoRow label="Valor original" value={formatCurrency(receivable.amount)} />
          <InfoRow label="Recebido" value={formatCurrency(receivedAmount)} />
          <InfoRow label="Em aberto" value={formatCurrency(outstandingAmount)} />
        </div>
        <InfoRow
          label="Vencimento"
          value={dueHint ? `${formatDate(receivable.dueDate)} · ${dueHint}` : formatDate(receivable.dueDate)}
        />
        {receivable.notes ? <InfoRow label="Observação" value={receivable.notes} /> : null}
      </div>

      <section aria-labelledby="receivable-receipts" className="space-y-2.5">
        <h2
          id="receivable-receipts"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Recebimentos
        </h2>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum recebimento registrado ainda.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {receipts.map((receipt) => (
              <div key={receipt.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{formatDate(receipt.receivedAt)}</p>
                  {receipt.notes ? (
                    <p className="text-xs text-muted-foreground">{receipt.notes}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(receipt.amount)}
                  </span>
                  <button
                    type="button"
                    aria-label="Excluir recebimento"
                    onClick={() => setDeletingReceiptId(receipt.id)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {outstandingAmount > 0 ? (
        <Button type="button" size="lg" className="w-full" onClick={() => setRegisteringOpen(true)}>
          Registrar recebimento
        </Button>
      ) : null}

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            nativeButton={false}
            render={<Link href={`/financeiro/contas-a-receber/${receivable.id}/editar`}>Editar</Link>}
          />
          <Button type="button" variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
            Excluir
          </Button>
        </div>
        {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
      </div>

      <RegisterReceiptDialog
        receivable={receivable}
        outstandingAmount={outstandingAmount}
        receivedAmount={receivedAmount}
        open={registeringOpen}
        onOpenChange={setRegisteringOpen}
        onRegistered={refresh}
      />

      <ConfirmActionDialog
        open={deletingReceiptId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingReceiptId(null);
        }}
        title="Excluir recebimento?"
        description="Este registro de recebimento será removido — a conta em si não é excluída."
        confirmLabel="Excluir"
        destructive
        onConfirm={handleConfirmDeleteReceipt}
      />

      <ConfirmActionDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) setDeleteError(null);
        }}
        title="Excluir conta?"
        description={`Remover a conta "${receivable.description}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        onConfirm={handleConfirmDelete}
      >
        {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
      </ConfirmActionDialog>
    </div>
  );
}
