"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Users } from "lucide-react";
import { formatPhoneInput, digitsOnly } from "@/lib/phone";
import { createCustomer, saveCustomer } from "./prototype/customer-store";
import { useCustomer } from "./prototype/use-customer";

export function CustomerForm({ customerId }: { customerId?: string }) {
  const isEditing = Boolean(customerId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const { customer } = useCustomer(customerId ?? "");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [document, setDocument] = useState("");

  useEffect(() => {
    if (customer) {
      // Safe post-mount update — see useCustomer for the hydration
      // reasoning. Only re-syncs when a *different* customer loads.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(customer.name);
      setPhone(formatPhoneInput(customer.phone));
      setEmail(customer.email ?? "");
      setDocument(customer.document ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  const canSubmit = name.trim() !== "" && digitsOnly(phone).length >= 10;

  if (isEditing && customer === null) {
    return (
      <EmptyState
        icon={Users}
        title="Cliente não encontrado"
        description="Ele pode ter sido removido ou o link está incorreto."
      />
    );
  }

  function handleSubmit() {
    if (!canSubmit) return;

    if (isEditing && customer) {
      saveCustomer({
        ...customer,
        name: name.trim(),
        phone: digitsOnly(phone),
        email: email.trim() || undefined,
        document: document.trim() || undefined,
        updatedAt: new Date().toISOString().slice(0, 10),
      });
      router.push(`/clientes/${customer.id}`);
      return;
    }

    const created = createCustomer({
      name: name.trim(),
      phone: digitsOnly(phone),
      email: email.trim() || undefined,
      document: document.trim() || undefined,
    });

    if (returnTo) {
      router.push(`${returnTo}?customerId=${created.id}`);
    } else {
      router.push(`/clientes/${created.id}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader
          title={isEditing ? "Editar cliente" : "Novo cliente"}
          onBack={() =>
            router.push(isEditing && customerId ? `/clientes/${customerId}` : "/clientes")
          }
        />
        {isEditing ? null : (
          <p className="pl-11 text-sm text-muted-foreground">
            Informe o essencial para começar.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="customer-name" className="text-sm font-medium text-foreground">
            Nome
          </label>
          <input
            id="customer-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="João Oliveira"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="customer-phone" className="text-sm font-medium text-foreground">
            Telefone
          </label>
          <input
            id="customer-phone"
            type="text"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            placeholder="(11) 99999-9999"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="customer-email" className="text-sm font-medium text-foreground">
            E-mail <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="customer-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="joao@email.com"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="customer-document" className="text-sm font-medium text-foreground">
            CPF/CNPJ <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="customer-document"
            type="text"
            value={document}
            onChange={(event) => setDocument(event.target.value)}
            placeholder="000.000.000-00"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full"
      >
        {isEditing ? "Salvar alterações" : "Criar cliente"}
      </Button>
    </div>
  );
}
