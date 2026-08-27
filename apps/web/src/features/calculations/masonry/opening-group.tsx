"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDecimal, parseDecimalInput } from "@/lib/decimal";
import { DecimalField } from "../shared/decimal-field";
import type { OpeningItem } from "./types";

interface OpeningGroupProps {
  icon: LucideIcon;
  title: string;
  addLabel: string;
  items: OpeningItem[];
  onChange: (items: OpeningItem[]) => void;
}

interface DraftState {
  id: string | null;
  width: string;
  height: string;
  quantity: string;
}

const EMPTY_DRAFT: DraftState = { id: null, width: "", height: "", quantity: "1" };

export function OpeningGroup({
  icon: Icon,
  title,
  addLabel,
  items,
  onChange,
}: OpeningGroupProps) {
  const [draft, setDraft] = useState<DraftState | null>(null);

  const widthValue = draft ? parseDecimalInput(draft.width) : null;
  const heightValue = draft ? parseDecimalInput(draft.height) : null;
  const quantityValue = draft ? Number(draft.quantity) : null;
  const canSave =
    widthValue !== null &&
    widthValue > 0 &&
    heightValue !== null &&
    heightValue > 0 &&
    Number.isInteger(quantityValue) &&
    (quantityValue ?? 0) > 0;

  function startAdd() {
    setDraft({ ...EMPTY_DRAFT });
  }

  function startEdit(item: OpeningItem) {
    setDraft({
      id: item.id,
      width: formatDecimal(item.widthM),
      height: formatDecimal(item.heightM),
      quantity: String(item.quantity),
    });
  }

  function cancelDraft() {
    setDraft(null);
  }

  function saveDraft() {
    if (!draft || widthValue === null || heightValue === null || !canSave) {
      return;
    }

    const item: OpeningItem = {
      id: draft.id ?? `${title}-${Date.now()}`,
      widthM: widthValue,
      heightM: heightValue,
      quantity: quantityValue ?? 1,
    };

    if (draft.id) {
      onChange(items.map((existing) => (existing.id === draft.id ? item : existing)));
    } else {
      onChange([...items, item]);
    }
    setDraft(null);
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-foreground">
        <Icon className="size-4" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5"
            >
              <button
                type="button"
                onClick={() => startEdit(item)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-foreground focus-visible:outline-none"
              >
                <span className="font-medium">
                  {formatDecimal(item.widthM)} × {formatDecimal(item.heightM)}{" "}
                  m
                </span>
                <span className="text-muted-foreground">
                  · qtd. {item.quantity}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  aria-label={`Editar ${title.toLowerCase()}`}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remover ${title.toLowerCase()}`}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {draft ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3.5">
          <div className="grid grid-cols-2 gap-3">
            <DecimalField
              id={`${title}-width`}
              label="Largura"
              unit="m"
              value={draft.width}
              onChange={(width) => setDraft({ ...draft, width })}
              placeholder="0,00"
            />
            <DecimalField
              id={`${title}-height`}
              label="Altura"
              unit="m"
              value={draft.height}
              onChange={(height) => setDraft({ ...draft, height })}
              placeholder="0,00"
            />
          </div>
          <div className="max-w-[8rem] space-y-1.5">
            <label
              htmlFor={`${title}-quantity`}
              className="text-sm font-medium text-foreground"
            >
              Quantidade
            </label>
            <input
              id={`${title}-quantity`}
              type="text"
              inputMode="numeric"
              value={draft.quantity}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  quantity: event.target.value.replace(/[^0-9]/g, ""),
                })
              }
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-2xl font-semibold text-foreground tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={cancelDraft}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveDraft}
              disabled={!canSave}
              className="flex-1"
            >
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Plus className="size-4" aria-hidden="true" />
          {addLabel}
        </button>
      )}
    </div>
  );
}
