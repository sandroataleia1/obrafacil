"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDecimal, parseDecimalInput } from "@/lib/decimal";
import { DecimalField } from "../shared/decimal-field";
import { ceilingRoomAreaM2, type CeilingRoom } from "./types";

interface RoomGroupProps {
  items: CeilingRoom[];
  onChange: (items: CeilingRoom[]) => void;
}

interface DraftState {
  id: string | null;
  name: string;
  length: string;
  width: string;
}

function emptyDraft(nextIndex: number): DraftState {
  return { id: null, name: `Cômodo ${nextIndex}`, length: "", width: "" };
}

export function RoomGroup({ items, onChange }: RoomGroupProps) {
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

  function startEdit(item: CeilingRoom) {
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
      const item: CeilingRoom = {
        id: `room-${Date.now()}`,
        name: draft.name.trim(),
        lengthM: lengthValue,
        widthM: widthValue,
        panelLengthM: null,
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
                  {formatDecimal(ceilingRoomAreaM2(item))} m²
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
      ) : null}

      {draft ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3.5">
          <div className="space-y-1.5">
            <label htmlFor="room-name" className="text-sm font-medium text-foreground">
              Nome do cômodo
            </label>
            <input
              id="room-name"
              type="text"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Ex: Sala, Quarto 1"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DecimalField
              id="room-length"
              label="Comprimento"
              unit="m"
              value={draft.length}
              onChange={(length) => setDraft({ ...draft, length })}
              placeholder="0,00"
            />
            <DecimalField
              id="room-width"
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
          Adicionar cômodo
        </button>
      )}
    </div>
  );
}
