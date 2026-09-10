"use client";

import { formatPhoneInput } from "@/lib/phone";

export interface ContactFieldsValue {
  name: string;
  role: string;
  department: string;
  /** BR-masked as typed; converted to E.164 only at submit time. */
  phone: string;
  whatsapp: string;
  email: string;
  notes: string;
}

export const EMPTY_CONTACT_FIELDS: ContactFieldsValue = {
  name: "",
  role: "",
  department: "",
  phone: "",
  whatsapp: "",
  email: "",
  notes: "",
};

/** Shared field set for a contact draft (create flow) and the detail-page
 * edit dialog (§40-42/§53). Phone and WhatsApp are independent — neither
 * is ever copied into the other automatically (§42). */
export function ContactFields({
  value,
  onChange,
  idPrefix,
}: {
  value: ContactFieldsValue;
  onChange: (patch: Partial<ContactFieldsValue>) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium text-foreground">
          Nome
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="João Pereira"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-role`} className="text-sm font-medium text-foreground">
            Cargo / função <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id={`${idPrefix}-role`}
            type="text"
            value={value.role}
            onChange={(event) => onChange({ role: event.target.value })}
            placeholder="Engenheiro civil"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-department`} className="text-sm font-medium text-foreground">
            Departamento <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id={`${idPrefix}-department`}
            type="text"
            value={value.department}
            onChange={(event) => onChange({ department: event.target.value })}
            placeholder="Financeiro"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-phone`} className="text-sm font-medium text-foreground">
            Telefone <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id={`${idPrefix}-phone`}
            type="text"
            inputMode="tel"
            value={value.phone}
            onChange={(event) => onChange({ phone: formatPhoneInput(event.target.value) })}
            placeholder="(31) 3333-4444"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-whatsapp`} className="text-sm font-medium text-foreground">
            WhatsApp <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id={`${idPrefix}-whatsapp`}
            type="text"
            inputMode="tel"
            value={value.whatsapp}
            onChange={(event) => onChange({ whatsapp: formatPhoneInput(event.target.value) })}
            placeholder="(31) 99999-9999"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-email`} className="text-sm font-medium text-foreground">
          E-mail <span className="text-muted-foreground">(opcional)</span>
        </label>
        <input
          id={`${idPrefix}-email`}
          type="email"
          value={value.email}
          onChange={(event) => onChange({ email: event.target.value })}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-notes`} className="text-sm font-medium text-foreground">
          Observações <span className="text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          value={value.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          rows={2}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>
    </div>
  );
}
