"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseCurrencyInput } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import type { Project } from "@/features/projects/types";
import {
  PROJECT_COST_CATEGORIES,
  PROJECT_COST_CATEGORY_LABEL,
  type ProjectCostCategory,
} from "@/features/project-costs/types";
import { createPayableId, savePayable } from "./prototype/payable-store";
import { usePayable } from "./prototype/use-payable";
import { getPayableStatus } from "./payable-status";

const NO_PROJECT = "none";

export function PayableForm({ payableId }: { payableId?: string }) {
  const router = useRouter();
  const { payable: existingPayable } = usePayable(payableId ?? "");
  const isEditing = Boolean(payableId);

  const [projects, setProjects] = useState<Project[]>([]);
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState<ProjectCostCategory>("materials");
  const [amountInput, setAmountInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState(NO_PROJECT);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjects(listAllProjects());
  }, []);

  useEffect(() => {
    if (!existingPayable) return;
    // Seed the form once the existing payable loads from localStorage.
    // Safe post-mount update (see usePayable); only runs when the
    // record becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDescription(existingPayable.description);
    setSupplier(existingPayable.supplier ?? "");
    setCategory(existingPayable.category);
    setAmountInput(String(existingPayable.amount).replace(".", ","));
    setDueDate(existingPayable.dueDate);
    setProjectId(existingPayable.projectId ?? NO_PROJECT);
    setNotes(existingPayable.notes ?? "");
  }, [existingPayable]);

  const isRestricted = existingPayable?.originType === "employee-period";

  function handleSubmit() {
    if (dueDate.trim() === "") {
      setError("Informe o vencimento.");
      return;
    }

    if (isRestricted && existingPayable) {
      setError(null);
      savePayable({
        ...existingPayable,
        dueDate,
        notes: notes.trim() || undefined,
        updatedAt: todayIso(),
      });
      router.push(`/financeiro/contas-a-pagar/${existingPayable.id}`);
      return;
    }

    const amount = parseCurrencyInput(amountInput);

    if (description.trim() === "") {
      setError("Informe uma descrição.");
      return;
    }
    if (amount === null || amount <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    setError(null);

    const now = todayIso();
    savePayable({
      id: existingPayable?.id ?? createPayableId(),
      description: description.trim(),
      supplier: supplier.trim() || undefined,
      category,
      amount,
      dueDate,
      projectId: projectId === NO_PROJECT ? undefined : projectId,
      notes: notes.trim() || undefined,
      createdAt: existingPayable?.createdAt ?? now,
      updatedAt: now,
    });

    router.push(
      existingPayable ? `/financeiro/contas-a-pagar/${existingPayable.id}` : "/financeiro/contas-a-pagar"
    );
  }

  if (isEditing && existingPayable === undefined) return null;

  if (isEditing && existingPayable === null) {
    return (
      <div className="space-y-6">
        <BackHeader
          title="Conta não encontrada"
          onBack={() => router.push("/financeiro/contas-a-pagar")}
        />
        <p className="pl-11 text-sm text-muted-foreground">
          Ela pode ter sido removida ou o link está incorreto.
        </p>
      </div>
    );
  }

  if (isEditing && existingPayable && getPayableStatus(existingPayable) === "paid") {
    return (
      <div className="space-y-6">
        <BackHeader
          title="Conta paga"
          onBack={() => router.push(`/financeiro/contas-a-pagar/${existingPayable.id}`)}
        />
        <p className="pl-11 text-sm text-muted-foreground">
          Contas pagas não podem ser editadas diretamente. Desfaça o pagamento primeiro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title={isEditing ? "Editar conta" : "Nova conta a pagar"}
          onBack={() =>
            router.push(
              existingPayable
                ? `/financeiro/contas-a-pagar/${existingPayable.id}`
                : "/financeiro/contas-a-pagar"
            )
          }
        />
      </div>

      <div className="space-y-4">
        {isRestricted ? (
          <p className="text-sm text-muted-foreground">
            Descrição, fornecedor, categoria e valor vêm do período da Equipe e não podem ser
            alterados aqui. Desfaça o fechamento do período para corrigi-los.
          </p>
        ) : null}

        {!isRestricted ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="payable-description" className="text-sm font-medium text-foreground">
                Descrição
              </label>
              <input
                id="payable-description"
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Compra de cimento"
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="payable-supplier" className="text-sm font-medium text-foreground">
                Fornecedor / responsável <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="payable-supplier"
                type="text"
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                placeholder="Casa dos Materiais Silva"
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Categoria</span>
              <Select
                value={category}
                onValueChange={(value) => setCategory((value as ProjectCostCategory) ?? "materials")}
              >
                <SelectTrigger className="h-12 w-full px-4 text-base">
                  <SelectValue placeholder="Selecione uma categoria">
                    {(value: string | null) =>
                      PROJECT_COST_CATEGORY_LABEL[(value as ProjectCostCategory) ?? "materials"]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_COST_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {PROJECT_COST_CATEGORY_LABEL[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <MoneyField id="payable-amount" label="Valor" value={amountInput} onChange={setAmountInput} />
          </>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="payable-due-date" className="text-sm font-medium text-foreground">
            Vencimento
          </label>
          <input
            id="payable-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {!isRestricted ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Obra <span className="text-muted-foreground">(opcional)</span>
            </span>
            <Select value={projectId} onValueChange={(value) => setProjectId(value ?? NO_PROJECT)}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Sem obra vinculada">
                  {(value: string | null) =>
                    value && value !== NO_PROJECT
                      ? (projects.find((project) => project.id === value)?.name ?? "Sem obra vinculada")
                      : "Sem obra vinculada"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>Sem obra vinculada</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="payable-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="payable-notes"
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
        {isEditing ? "Salvar alterações" : "Criar conta"}
      </Button>
    </div>
  );
}
