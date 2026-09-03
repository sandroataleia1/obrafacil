"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDecimal, parseDecimalInput } from "@/lib/decimal";
import { DecimalField } from "./decimal-field";
import { areaRoomAreaM2, totalAreaM2, type AreaRoom } from "./area-room";

interface AreaRoomGroupProps {
  items: AreaRoom[];
  onChange: (items: AreaRoom[]) => void;
}

interface DraftState {
  id: string | null;
  name: string;
  length: string;
  width: string;
}

function emptyDraft(nextIndex: number): DraftState {
  return { id: null, name: `Ambiente ${nextIndex}`, length: "", width: "" };
}

function createRoomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AreaRoomGroup({ items, onChange }: AreaRoomGroupProps) {
  const [draft, setDraft] = useState<DraftState | null>(null);

  const lengthValue = draft ? parseDecimalInput(draft.length) : null;
  const widthValue = draft ? parseDecimalInput(draft.width) : null;
  const canSave =
    Boolean(draft && draft.name.trim() !== "") &&
    lengthValue !== null &&
    lengthValue > 0 &&
    widthValue !== null &&
    widthValue > 0;

  function startAdd() {
    setDraft(emptyDraft(items.length + 1));
  }

  function startEdit(item: AreaRoom) {
    setDraft({
      id: item.id,
      name: item.name,
      length: formatDecimal(item.lengthM),
      width: formatDecimal(item.widthM),
    });
  }

  function cancelDraft() {
    setDraft(null);
  }

  function saveDraft() {
    if (!draft || lengthValue === null || widthValue === null || !canSave) {
      return;
    }

    if (draft.id) {
      onChange(
        items.map((existing) =>
          existing.id === draft.id
            ? { ...existing, name: draft.name.trim(), lengthM: lengthValue, widthM: widthValue }
            : existing
        )
      );
    } else {
      const item: AreaRoom = {
        id: createRoomId(),
        name: draft.name.trim(),
        lengthM: lengthValue,
        widthM: widthValue,
      };
      onChange([...items, item]);
    }
    setDraft(null);
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-2.5">
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
                className="flex min-w-0 flex-1 flex-col items-start text-left focus-visible:outline-none"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {item.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDecimal(item.lengthM)} × {formatDecimal(item.widthM)} m ·{" "}
                  {formatDecimal(areaRoomAreaM2(item))} m²
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  aria-label={`Editar ${item.name}`}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remover ${item.name}`}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          Nenhum ambiente adicionado.
        </p>
      )}

      {items.length > 0 ? (
        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 text-sm">
          <span className="text-muted-foreground">Área total</span>
          <span className="font-semibold text-foreground">
            {formatDecimal(totalAreaM2(items))} m²
          </span>
        </div>
      ) : null}

      {draft ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3.5">
          <div className="space-y-1.5">
            <label htmlFor="area-room-name" className="text-sm font-medium text-foreground">
              Nome do ambiente
            </label>
            <input
              id="area-room-name"
              type="text"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Ex.: Sala"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DecimalField
              id="area-room-length"
              label="Comprimento"
              unit="m"
              value={draft.length}
              onChange={(length) => setDraft({ ...draft, length })}
              placeholder="0,00"
            />
            <DecimalField
              id="area-room-width"
              label="Largura"
              unit="m"
              value={draft.width}
              onChange={(width) => setDraft({ ...draft, width })}
              placeholder="0,00"
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
          Adicionar ambiente
        </button>
      )}
    </div>
  );
}
