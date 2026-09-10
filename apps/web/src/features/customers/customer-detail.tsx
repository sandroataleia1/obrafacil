"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BrickWall,
  ChevronRight,
  FileText,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Star,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { formatCep, formatCpfCnpj, formatE164PhoneForDisplay } from "@/lib/document";
import { formatCurrency } from "@/lib/currency";
import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import { listAllBudgets } from "@/features/budgets/prototype/budget-store";
import { StatusBadge } from "@/features/budgets/components/status-badge";
import type { Budget } from "@/features/budgets/types";
import { listProjectsByCustomer } from "@/features/projects/prototype/project-store";
import { ProjectStatusBadge } from "@/features/projects/components/status-badge";
import type { Project } from "@/features/projects/types";
import { toE164BR } from "@/features/auth/phone-e164";
import { AddressFields, EMPTY_ADDRESS_FIELDS, type AddressFieldsValue } from "./address-fields";
import { ContactFields, EMPTY_CONTACT_FIELDS, type ContactFieldsValue } from "./contact-fields";
import {
  createAddress,
  createContact,
  deleteAddress,
  deleteContact,
  deleteCustomer,
  getCustomer,
  updateAddress,
  updateContact,
} from "./customers-client";
import { ADDRESS_TYPE_LABELS } from "./labels";
import type { Customer, CustomerAddress, CustomerContact } from "./types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function BudgetRow({ budget }: { budget: Budget }) {
  const { total } = calculateBudgetTotals(budget);
  return (
    <Link href={`/orcamentos/${budget.id}`} className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{budget.name}</p>
          <StatusBadge status={budget.status} />
        </div>
        <p className="text-sm font-semibold text-foreground">{formatCurrency(total)}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <Link href={`/obras/${project.id}`} className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
          <ProjectStatusBadge status={project.status} />
        </div>
        {project.reference ? <p className="text-xs text-muted-foreground">{project.reference}</p> : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function addressLine(address: CustomerAddress): string {
  const parts = [
    address.street ? `${address.street}${address.number ? `, ${address.number}` : ""}` : null,
    address.complement,
  ].filter(Boolean);
  return parts.join(" — ");
}

function addressCityLine(address: CustomerAddress): string {
  const parts = [address.neighborhood, address.city && address.state ? `${address.city}/${address.state}` : address.city].filter(
    Boolean
  );
  return parts.join(" · ");
}

export function CustomerDetail({ id }: { id: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "not_found">("loading");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);

  const [addressDialog, setAddressDialog] = useState<{ address: CustomerAddress | null } | null>(null);
  const [addressDraft, setAddressDraft] = useState<AddressFieldsValue>(EMPTY_ADDRESS_FIELDS);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const [contactDialog, setContactDialog] = useState<{ contact: CustomerContact | null } | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactFieldsValue>(EMPTY_CONTACT_FIELDS);
  const [contactActive, setContactActive] = useState(true);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const [deletingAddress, setDeletingAddress] = useState<CustomerAddress | null>(null);
  const [deleteAddressError, setDeleteAddressError] = useState<string | null>(null);
  const [deletingContact, setDeletingContact] = useState<CustomerContact | null>(null);
  const [deleteContactError, setDeleteContactError] = useState<string | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const [deleteCustomerError, setDeleteCustomerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await getCustomer(id);
      setCustomer(data);
      setStatus("success");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setStatus("not_found");
        return;
      }
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    // §11 transitional: Budget/Project stay localStorage prototypes for now.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBudgets(listAllBudgets().filter((budget) => budget.customerId === id));
    setProjects(listProjectsByCustomer(id));
  }, [id]);

  function openAddAddress() {
    setAddressError(null);
    setAddressDraft(EMPTY_ADDRESS_FIELDS);
    setAddressDialog({ address: null });
  }

  function openEditAddress(address: CustomerAddress) {
    setAddressError(null);
    setAddressDraft({
      label: address.label,
      type: address.type,
      postal_code: address.postal_code ?? "",
      street: address.street ?? "",
      number: address.number ?? "",
      complement: address.complement ?? "",
      neighborhood: address.neighborhood ?? "",
      city: address.city ?? "",
      state: address.state ?? "",
      reference_point: address.reference_point ?? "",
    });
    setAddressDialog({ address });
  }

  async function handleSaveAddress() {
    if (!customer || !addressDialog) return;
    setAddressSaving(true);
    setAddressError(null);
    try {
      const payload = {
        label: addressDraft.label,
        type: addressDraft.type,
        postal_code: addressDraft.postal_code || null,
        street: addressDraft.street || null,
        number: addressDraft.number || null,
        complement: addressDraft.complement || null,
        neighborhood: addressDraft.neighborhood || null,
        city: addressDraft.city || null,
        state: addressDraft.state || null,
        reference_point: addressDraft.reference_point || null,
      };
      if (addressDialog.address) {
        await updateAddress(customer.id, addressDialog.address.id, { ...payload, is_primary: addressDialog.address.is_primary });
      } else {
        await createAddress(customer.id, payload);
      }
      setAddressDialog(null);
      await load();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setAddressError(Object.values(error.errors)[0]?.[0] ?? "Não foi possível salvar este endereço.");
      } else {
        setAddressError("Não foi possível salvar este endereço agora.");
      }
    } finally {
      setAddressSaving(false);
    }
  }

  async function handleSetPrimaryAddress(address: CustomerAddress) {
    if (!customer) return;
    try {
      await updateAddress(customer.id, address.id, {
        label: address.label,
        type: address.type,
        postal_code: address.postal_code,
        street: address.street,
        number: address.number,
        complement: address.complement,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
        reference_point: address.reference_point,
        is_primary: true,
      });
      await load();
    } catch {
      // Non-blocking: the list simply keeps its previous primary on failure.
    }
  }

  async function handleConfirmDeleteAddress() {
    if (!customer || !deletingAddress) return;
    try {
      await deleteAddress(customer.id, deletingAddress.id);
      setDeletingAddress(null);
      setDeleteAddressError(null);
      await load();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setDeleteAddressError(
          Object.values(error.errors)[0]?.[0] ?? "Defina outro endereço principal antes de excluir este endereço."
        );
      } else {
        setDeleteAddressError("Não foi possível excluir este endereço agora.");
      }
    }
  }

  function openAddContact() {
    setContactError(null);
    setContactDraft(EMPTY_CONTACT_FIELDS);
    setContactActive(true);
    setContactDialog({ contact: null });
  }

  function openEditContact(contact: CustomerContact) {
    setContactError(null);
    setContactDraft({
      name: contact.name,
      role: contact.role ?? "",
      department: contact.department ?? "",
      phone: contact.phone ? formatE164PhoneForDisplay(contact.phone) : "",
      whatsapp: contact.whatsapp ? formatE164PhoneForDisplay(contact.whatsapp) : "",
      email: contact.email ?? "",
      notes: contact.notes ?? "",
    });
    setContactActive(contact.active);
    setContactDialog({ contact });
  }

  async function handleSaveContact() {
    if (!customer || !contactDialog) return;
    setContactSaving(true);
    setContactError(null);
    try {
      const payload = {
        name: contactDraft.name,
        role: contactDraft.role || null,
        department: contactDraft.department || null,
        phone: contactDraft.phone ? toE164BR(contactDraft.phone) : null,
        whatsapp: contactDraft.whatsapp ? toE164BR(contactDraft.whatsapp) : null,
        email: contactDraft.email || null,
        notes: contactDraft.notes || null,
        active: contactActive,
      };
      if (contactDialog.contact) {
        await updateContact(customer.id, contactDialog.contact.id, { ...payload, is_primary: contactDialog.contact.is_primary });
      } else {
        await createContact(customer.id, payload);
      }
      setContactDialog(null);
      await load();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setContactError(Object.values(error.errors)[0]?.[0] ?? "Não foi possível salvar este contato.");
      } else {
        setContactError("Não foi possível salvar este contato agora.");
      }
    } finally {
      setContactSaving(false);
    }
  }

  async function handleSetPrimaryContact(contact: CustomerContact) {
    if (!customer) return;
    try {
      await updateContact(customer.id, contact.id, {
        name: contact.name,
        role: contact.role,
        department: contact.department,
        phone: contact.phone,
        whatsapp: contact.whatsapp,
        email: contact.email,
        notes: contact.notes,
        active: contact.active,
        is_primary: true,
      });
      await load();
    } catch {
      // Non-blocking.
    }
  }

  async function handleConfirmDeleteContact() {
    if (!customer || !deletingContact) return;
    try {
      await deleteContact(customer.id, deletingContact.id);
      setDeletingContact(null);
      setDeleteContactError(null);
      await load();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setDeleteContactError(
          Object.values(error.errors)[0]?.[0] ?? "Defina outro contato principal antes de excluir este contato."
        );
      } else {
        setDeleteContactError("Não foi possível excluir este contato agora.");
      }
    }
  }

  async function handleConfirmDeleteCustomer() {
    if (!customer) return;
    setDeletingCustomer(true);
    try {
      await deleteCustomer(customer.id);
      router.push("/clientes");
    } catch {
      setDeleteCustomerError("Não foi possível excluir este cliente agora.");
      setDeletingCustomer(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <span className="sr-only">Carregando cliente</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <EmptyState icon={Users} title="Cliente não encontrado" description="Ele pode ter sido removido ou o link está incorreto." />
    );
  }

  if (status === "error" || !customer) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          Não foi possível carregar este cliente agora.
        </p>
        <Button type="button" onClick={() => void load()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const hasLocalLinks = (budgets?.length ?? 0) > 0 || (projects?.length ?? 0) > 0;

  return (
    <div className="space-y-6 pb-6">
      <BackLink title={customer.name} href="/clientes" />

      <div className="rounded-xl border border-border bg-card p-4">
        <InfoRow label="Tipo" value={customer.kind === "company" ? "Pessoa jurídica" : "Pessoa física"} />
        {customer.kind === "company" && customer.legal_name ? <InfoRow label="Razão social" value={customer.legal_name} /> : null}
        {customer.kind === "company" && customer.trade_name ? <InfoRow label="Nome fantasia" value={customer.trade_name} /> : null}
        {customer.document ? <InfoRow label={customer.kind === "company" ? "CNPJ" : "CPF"} value={formatCpfCnpj(customer.document)} /> : null}
        {customer.phone ? <InfoRow label="Telefone" value={formatE164PhoneForDisplay(customer.phone)} /> : null}
        {customer.email ? <InfoRow label="E-mail" value={customer.email} /> : null}
        <InfoRow label="Status" value={customer.active ? "Ativo" : "Inativo"} />
        {customer.notes ? (
          <div className="pt-2">
            <p className="text-sm text-muted-foreground">{customer.notes}</p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={`/clientes/${customer.id}/editar`} />}>
          <Pencil className="size-4" aria-hidden="true" />
          Editar
        </Button>
        <Button
          variant="outline"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => {
            setDeleteCustomerError(null);
            setDeletingCustomer(true);
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Excluir
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={
            <Link href={`/orcamentos/novo?customerId=${customer.id}`}>
              <Plus className="size-4" aria-hidden="true" />
              Novo orçamento
            </Link>
          }
        />
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={
            <Link href={`/obras/nova?customerId=${customer.id}`}>
              <Plus className="size-4" aria-hidden="true" />
              Nova obra
            </Link>
          }
        />
      </div>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Endereços</h2>
          <Button type="button" variant="ghost" size="sm" onClick={openAddAddress}>
            <Plus className="size-3.5" aria-hidden="true" />
            Adicionar
          </Button>
        </div>
        {customer.addresses.length === 0 ? (
          <EmptyState compact icon={MapPin} title="Nenhum endereço cadastrado" />
        ) : (
          <div className="space-y-2">
            {customer.addresses.map((address) => (
              <div key={address.id} className="space-y-1.5 rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {address.is_primary ? <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" /> : null}
                    <p className="text-sm font-medium text-foreground">{address.label}</p>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {ADDRESS_TYPE_LABELS[address.type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!address.is_primary ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => void handleSetPrimaryAddress(address)}>
                        Tornar principal
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openEditAddress(address)}
                      aria-label={`Editar endereço ${address.label}`}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteAddressError(null);
                        setDeletingAddress(address);
                      }}
                      aria-label={`Excluir endereço ${address.label}`}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {addressLine(address) ? <p className="text-sm text-foreground">{addressLine(address)}</p> : null}
                {addressCityLine(address) ? <p className="text-xs text-muted-foreground">{addressCityLine(address)}</p> : null}
                {address.postal_code ? <p className="text-xs text-muted-foreground">CEP {formatCep(address.postal_code)}</p> : null}
                {address.reference_point ? (
                  <p className="text-xs text-muted-foreground">Referência: {address.reference_point}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Contatos</h2>
          <Button type="button" variant="ghost" size="sm" onClick={openAddContact}>
            <Plus className="size-3.5" aria-hidden="true" />
            Adicionar
          </Button>
        </div>
        {customer.contacts.length === 0 ? (
          <EmptyState compact icon={UserRound} title="Nenhum contato cadastrado" />
        ) : (
          <div className="space-y-2">
            {customer.contacts.map((contact) => (
              <div key={contact.id} className="space-y-1.5 rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {contact.is_primary ? <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" /> : null}
                    <p className="text-sm font-medium text-foreground">{contact.name}</p>
                    {!contact.active ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Inativo
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    {!contact.is_primary ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => void handleSetPrimaryContact(contact)}>
                        Tornar principal
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openEditContact(contact)}
                      aria-label={`Editar contato ${contact.name}`}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteContactError(null);
                        setDeletingContact(contact);
                      }}
                      aria-label={`Excluir contato ${contact.name}`}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {contact.role || contact.department ? (
                  <p className="text-xs text-muted-foreground">{[contact.role, contact.department].filter(Boolean).join(" · ")}</p>
                ) : null}
                {contact.phone ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="size-3.5" aria-hidden="true" />
                    {formatE164PhoneForDisplay(contact.phone)}
                  </div>
                ) : null}
                {contact.whatsapp ? <p className="text-xs text-muted-foreground">WhatsApp: {formatE164PhoneForDisplay(contact.whatsapp)}</p> : null}
                {contact.email ? <p className="text-xs text-muted-foreground">{contact.email}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="customer-budgets" className="space-y-2.5">
        <h2 id="customer-budgets" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Orçamentos
        </h2>
        {budgets === null ? null : budgets.length === 0 ? (
          <EmptyState compact icon={FileText} title="Nenhum orçamento ainda" description="Os orçamentos criados para este cliente aparecerão aqui." />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {budgets.map((budget) => (
              <BudgetRow key={budget.id} budget={budget} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="customer-projects" className="space-y-2.5">
        <h2 id="customer-projects" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Obras
        </h2>
        {projects === null ? null : projects.length === 0 ? (
          <EmptyState compact icon={BrickWall} title="Nenhuma obra ainda" description="As obras deste cliente aparecerão aqui." />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {projects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      <ResponsiveDialog
        open={addressDialog !== null}
        onOpenChange={(open) => !open && setAddressDialog(null)}
        title={addressDialog?.address ? "Editar endereço" : "Adicionar endereço"}
        footer={
          <Button type="button" onClick={() => void handleSaveAddress()} disabled={addressDraft.label.trim() === "" || addressSaving}>
            {addressSaving ? "Salvando..." : "Salvar"}
          </Button>
        }
      >
        <div className="space-y-3 px-1">
          <AddressFields value={addressDraft} onChange={(patch) => setAddressDraft((prev) => ({ ...prev, ...patch }))} idPrefix="detail-address" />
          {addressError ? (
            <p role="alert" className="text-sm text-destructive">
              {addressError}
            </p>
          ) : null}
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={contactDialog !== null}
        onOpenChange={(open) => !open && setContactDialog(null)}
        title={contactDialog?.contact ? "Editar contato" : "Adicionar contato"}
        footer={
          <Button type="button" onClick={() => void handleSaveContact()} disabled={contactDraft.name.trim() === "" || contactSaving}>
            {contactSaving ? "Salvando..." : "Salvar"}
          </Button>
        }
      >
        <div className="space-y-3 px-1">
          <ContactFields value={contactDraft} onChange={(patch) => setContactDraft((prev) => ({ ...prev, ...patch }))} idPrefix="detail-contact" />
          {contactError ? (
            <p role="alert" className="text-sm text-destructive">
              {contactError}
            </p>
          ) : null}
        </div>
      </ResponsiveDialog>

      <ConfirmActionDialog
        open={deletingAddress !== null}
        onOpenChange={(open) => !open && setDeletingAddress(null)}
        title="Excluir endereço?"
        description={deletingAddress ? `Excluir o endereço "${deletingAddress.label}"?` : undefined}
        confirmLabel="Excluir"
        destructive
        onConfirm={() => void handleConfirmDeleteAddress()}
      >
        {deleteAddressError ? (
          <p role="alert" className="text-sm text-destructive">
            {deleteAddressError}
          </p>
        ) : null}
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={deletingContact !== null}
        onOpenChange={(open) => !open && setDeletingContact(null)}
        title="Excluir contato?"
        description={deletingContact ? `Excluir o contato "${deletingContact.name}"?` : undefined}
        confirmLabel="Excluir"
        destructive
        onConfirm={() => void handleConfirmDeleteContact()}
      >
        {deleteContactError ? (
          <p role="alert" className="text-sm text-destructive">
            {deleteContactError}
          </p>
        ) : null}
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={deletingCustomer}
        onOpenChange={(open) => !open && setDeletingCustomer(false)}
        title="Excluir cliente?"
        description={`Excluir o cliente "${customer.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        disabled={hasLocalLinks}
        onConfirm={() => void handleConfirmDeleteCustomer()}
      >
        {hasLocalLinks ? (
          <p role="alert" className="text-sm text-destructive">
            Este cliente possui orçamentos ou obras vinculados e não pode ser excluído.
          </p>
        ) : deleteCustomerError ? (
          <p role="alert" className="text-sm text-destructive">
            {deleteCustomerError}
          </p>
        ) : null}
      </ConfirmActionDialog>
    </div>
  );
}
