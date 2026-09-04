"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { formatPhoneInput } from "@/lib/phone";
import { todayIso } from "@/lib/date";
import { createSupplierId, saveSupplier } from "./prototype/supplier-store";
import { useSupplier } from "./prototype/use-supplier";
import type { Supplier } from "./types";

export function SupplierForm({
  supplierId,
  onSuccess,
  onCancel,
}: {
  supplierId?: string;
  /** When provided (quick-create in a Dialog/Sheet), called with the saved Supplier instead of navigating. */
  onSuccess?: (supplier: Supplier) => void;
  /** When provided, renders a Cancelar action next to the submit button and hides the page-only BackHeader. */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const { supplier: existingSupplier } = useSupplier(supplierId ?? "");
  const isEditing = Boolean(supplierId);

  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingSupplier) return;
    // Seed the form once the existing supplier loads from localStorage.
    // Safe post-mount update (see useSupplier); only runs once the
    // record becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(existingSupplier.name);
    setDocument(existingSupplier.document ?? "");
    setContactName(existingSupplier.contactName ?? "");
    setPhone(existingSupplier.phone ? formatPhoneInput(existingSupplier.phone) : "");
    setEmail(existingSupplier.email ?? "");
    setAddress(existingSupplier.address ?? "");
    setNotes(existingSupplier.notes ?? "");
  }, [existingSupplier]);

  function handleSubmit() {
    if (name.trim() === "") {
      setError("Informe o nome do fornecedor.");
      return;
    }
    setError(null);

    const now = todayIso();
    const supplier = {
      id: existingSupplier?.id ?? createSupplierId(),
      name: name.trim(),
      document: document.trim() || undefined,
      contactName: contactName.trim() || undefined,
      phone: phone.trim() ? phone.replace(/\D/g, "") : undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
      status: existingSupplier?.status ?? ("active" as const),
      createdAt: existingSupplier?.createdAt ?? now,
      updatedAt: now,
    };
    saveSupplier(supplier);

    if (onSuccess) {
      onSuccess(supplier);
      return;
    }
    router.push(`/fornecedores/${supplier.id}`);
  }

  if (isEditing && existingSupplier === undefined) return null;

  if (isEditing && existingSupplier === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Fornecedor não encontrado" onBack={() => router.push("/fornecedores")} />
        <p className="pl-11 text-sm text-muted-foreground">
          Ele pode ter sido removido ou o link está incorreto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {onCancel ? null : (
        <div className="space-y-1">
          <BackHeader
            title={isEditing ? "Editar fornecedor" : "Novo fornecedor"}
            onBack={() =>
              router.push(
                existingSupplier ? `/fornecedores/${existingSupplier.id}` : "/fornecedores"
              )
            }
          />
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="supplier-name" className="text-sm font-medium text-foreground">
            Nome
          </label>
          <input
            id="supplier-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Casa dos Materiais Silva"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-document" className="text-sm font-medium text-foreground">
            CNPJ/CPF <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-document"
            type="text"
            value={document}
            onChange={(event) => setDocument(event.target.value)}
            placeholder="00.000.000/0000-00"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-contact" className="text-sm font-medium text-foreground">
            Contato <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-contact"
            type="text"
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            placeholder="Roberto Silva"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-phone" className="text-sm font-medium text-foreground">
            Telefone <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-phone"
            type="text"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            placeholder="(11) 99999-9999"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-email" className="text-sm font-medium text-foreground">
            E-mail <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="contato@fornecedor.com.br"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-address" className="text-sm font-medium text-foreground">
            Endereço <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Av. Industrial, 450 - São Paulo/SP"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Detalhes adicionais"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      {onCancel ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {isEditing ? "Salvar alterações" : "Salvar fornecedor"}
          </Button>
        </div>
      ) : (
        <Button type="button" size="lg" onClick={handleSubmit} className="w-full">
          {isEditing ? "Salvar alterações" : "Cadastrar fornecedor"}
        </Button>
      )}
    </div>
  );
}
