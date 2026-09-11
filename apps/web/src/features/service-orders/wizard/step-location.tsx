"use client";

import { useState } from "react";
import { Plus, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Customer, CustomerAddress, CustomerContact } from "@/features/customers/types";
import { CONTACT_NONE } from "./wizard-types";
import { QuickAddressDialog } from "./quick-address-dialog";
import { QuickContactDialog } from "./quick-contact-dialog";

function addressLine(address: CustomerAddress): string {
  const parts = [
    address.street ? `${address.street}${address.number ? `, ${address.number}` : ""}` : null,
    address.city && address.state ? `${address.city}/${address.state}` : address.city,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : address.label;
}

export function StepLocation({
  customerId,
  detail,
  detailStatus,
  onRetry,
  selectedAddressId,
  onSelectAddress,
  selectedContactId,
  onSelectContact,
  onAddressCreated,
  onContactCreated,
  requestCompanyId,
  isStaleRequest,
}: {
  customerId: string;
  detail: Customer | null;
  detailStatus: "loading" | "success" | "error";
  onRetry: () => void;
  selectedAddressId: string | null;
  onSelectAddress: (addressId: string) => void;
  selectedContactId: string;
  onSelectContact: (contactId: string) => void;
  onAddressCreated: (address: CustomerAddress) => void;
  onContactCreated: (contact: CustomerContact) => void;
  requestCompanyId: string | undefined;
  isStaleRequest: (requestCompanyId: string | undefined) => boolean;
}) {
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  if (detailStatus === "loading") {
    return (
      <div className="space-y-3" role="status" aria-busy="true">
        <span className="sr-only">Carregando endereços e contatos</span>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }

  if (detailStatus === "error" || !detail) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          Não foi possível carregar os dados deste cliente agora.
        </p>
        <Button type="button" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const activeContacts = detail.contacts.filter((contact) => contact.active);

  function handleAddressCreated(address: CustomerAddress) {
    if (isStaleRequest(requestCompanyId)) return;
    onAddressCreated(address);
  }

  function handleContactCreated(contact: CustomerContact) {
    if (isStaleRequest(requestCompanyId)) return;
    onContactCreated(contact);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Local da execução</h2>
        {detail.addresses.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">Este cliente ainda não possui endereço.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setAddressDialogOpen(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              Novo endereço
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {detail.addresses.map((address) => (
              <label
                key={address.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                  selectedAddressId === address.id ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                <input
                  type="radio"
                  name="execution-address"
                  className="mt-1"
                  checked={selectedAddressId === address.id}
                  onChange={() => onSelectAddress(address.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{address.label}</span>
                    {address.is_primary ? (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        <Star className="size-3 fill-primary text-primary" aria-hidden="true" />
                        Principal
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{addressLine(address)}</p>
                </div>
              </label>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setAddressDialogOpen(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              Novo endereço
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Contato no cliente</h2>
        <p className="text-xs text-muted-foreground">Opcional — quem pode ser procurado sobre esta O.S.</p>
        <div className="space-y-2">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors ${
              selectedContactId === CONTACT_NONE ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <input
              type="radio"
              name="execution-contact"
              checked={selectedContactId === CONTACT_NONE}
              onChange={() => onSelectContact(CONTACT_NONE)}
            />
            <span className="text-sm font-medium text-foreground">Sem contato</span>
          </label>
          {activeContacts.map((contact) => (
            <label
              key={contact.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                selectedContactId === contact.id ? "border-primary bg-primary/5" : "border-border bg-card"
              }`}
            >
              <input
                type="radio"
                name="execution-contact"
                className="mt-1"
                checked={selectedContactId === contact.id}
                onChange={() => onSelectContact(contact.id)}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">{contact.name}</span>
                  {contact.is_primary ? (
                    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      <Star className="size-3 fill-primary text-primary" aria-hidden="true" />
                      Principal
                    </span>
                  ) : null}
                </div>
                {contact.role ? <p className="text-xs text-muted-foreground">{contact.role}</p> : null}
              </div>
            </label>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setContactDialogOpen(true)}>
          <Plus className="size-3.5" aria-hidden="true" />
          Novo contato
        </Button>
      </section>

      <QuickAddressDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        customerId={customerId}
        onCreated={handleAddressCreated}
      />
      <QuickContactDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        customerId={customerId}
        isFirstContact={detail.contacts.length === 0}
        onCreated={handleContactCreated}
      />
    </div>
  );
}
