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
import { useProject } from "@/features/projects/prototype/use-project";
import {
  createProjectCostId,
  deleteProjectCost,
  saveProjectCost,
} from "./prototype/project-cost-store";
import { useProjectCost } from "./prototype/use-project-cost";
import {
  PROJECT_COST_CATEGORIES,
  PROJECT_COST_CATEGORY_LABEL,
  type ProjectCostCategory,
} from "./types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CostForm({
  projectId,
  costId,
}: {
  projectId: string;
  costId?: string;
}) {
  const router = useRouter();
  const { project } = useProject(projectId);
  const existingCost = useProjectCost(costId ?? null);
  const isEditing = Boolean(costId);

  const [category, setCategory] = useState<ProjectCostCategory>("materials");
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [date, setDate] = useState(todayIso());
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingCost) return;
    // Seed the form once the existing cost loads from localStorage. Safe
    // post-mount update (see useProjectCost); only runs when the record
    // becomes available, not on every keystroke.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategory(existingCost.category);
    setDescription(existingCost.description);
    setAmountInput(String(existingCost.amount).replace(".", ","));
    setDate(existingCost.date);
    setSupplier(existingCost.supplier ?? "");
    setNotes(existingCost.notes ?? "");
  }, [existingCost]);

  function handleSubmit() {
    const amount = parseCurrencyInput(amountInput);

    if (description.trim() === "") {
      setError("Informe uma descrição.");
      return;
    }
    if (amount === null || amount <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    if (date.trim() === "") {
      setError("Informe a data.");
      return;
    }
    setError(null);

    const now = new Date().toISOString().slice(0, 10);
    saveProjectCost({
      id: existingCost?.id ?? createProjectCostId(),
      projectId,
      date,
      category,
      description: description.trim(),
      amount,
      supplier: supplier.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: existingCost?.createdAt ?? now,
      updatedAt: now,
    });

    router.push(`/obras/${projectId}/custos`);
  }

  function handleDelete() {
    if (!existingCost) return;
    const confirmed = window.confirm(
      `Remover o custo "${existingCost.description}"? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    deleteProjectCost(existingCost.id);
    router.push(`/obras/${projectId}/custos`);
  }

  if (isEditing && existingCost === undefined) return null;
  if (isEditing && existingCost === null) {
    return (
      <div className="space-y-6">
        <BackHeader
          title="Custo não encontrado"
          onBack={() => router.push(`/obras/${projectId}/custos`)}
        />
        <p className="pl-11 text-sm text-muted-foreground">
          Ele pode ter sido removido ou o link está incorreto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title={isEditing ? "Editar custo" : "Registrar custo"}
          onBack={() => router.push(`/obras/${projectId}/custos`)}
        />
        <p className="pl-11 text-sm text-muted-foreground">
          {project ? project.name : "Obra"}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Categoria</span>
          <Select
            value={category}
            onValueChange={(value) =>
              setCategory((value as ProjectCostCategory) ?? "materials")
            }
          >
            <SelectTrigger className="h-12 w-full px-4 text-base">
              <SelectValue placeholder="Selecione uma categoria">
                {(value: string | null) =>
                  PROJECT_COST_CATEGORY_LABEL[
                    (value as ProjectCostCategory) ?? "materials"
                  ]
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

        <div className="space-y-1.5">
          <label htmlFor="cost-description" className="text-sm font-medium text-foreground">
            Descrição
          </label>
          <input
            id="cost-description"
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Compra de cimento"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <MoneyField
          id="cost-amount"
          label="Valor"
          value={amountInput}
          onChange={setAmountInput}
        />

        <div className="space-y-1.5">
          <label htmlFor="cost-date" className="text-sm font-medium text-foreground">
            Data
          </label>
          <input
            id="cost-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cost-supplier" className="text-sm font-medium text-foreground">
            Fornecedor / responsável <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="cost-supplier"
            type="text"
            value={supplier}
            onChange={(event) => setSupplier(event.target.value)}
            placeholder="Casa dos Materiais Silva"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cost-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="cost-notes"
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
        {isEditing ? "Salvar alterações" : "Registrar custo"}
      </Button>

      {isEditing ? (
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={handleDelete}
          className="w-full"
        >
          Excluir custo
        </Button>
      ) : null}
    </div>
  );
}
