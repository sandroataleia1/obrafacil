"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { formatPhoneInput, digitsOnly } from "@/lib/phone";
import { createCustomer } from "./prototype/customer-store";

export function CustomerForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [document, setDocument] = useState("");

  const canSubmit = name.trim() !== "" && digitsOnly(phone).length >= 10;

  function handleSubmit() {
    if (!canSubmit) return;

    const customer = createCustomer({
      name: name.trim(),
      phone: digitsOnly(phone),
      email: email.trim() || undefined,
      document: document.trim() || undefined,
    });

    if (returnTo) {
      router.push(`${returnTo}?customerId=${customer.id}`);
    } else {
      router.push(`/clientes/${customer.id}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader title="Novo cliente" onBack={() => router.push("/clientes")} />
        <p className="pl-11 text-sm text-muted-foreground">
          Informe o essencial para começar.
        </p>
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
        Criar cliente
      </Button>
    </div>
  );
}
