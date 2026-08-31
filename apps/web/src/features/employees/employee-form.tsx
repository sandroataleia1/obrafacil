"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { parseCurrencyInput } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import { digitsOnly, formatPhoneInput } from "@/lib/phone";
import { createEmployeeId, saveEmployee } from "./prototype/employee-store";
import { useEmployee } from "./prototype/use-employee";

export function EmployeeForm({ employeeId }: { employeeId?: string }) {
  const router = useRouter();
  const { employee: existingEmployee } = useEmployee(employeeId ?? "");
  const isEditing = Boolean(employeeId);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [baseSalaryInput, setBaseSalaryInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingEmployee) return;
    // Seed the form once the existing employee loads from localStorage.
    // Safe post-mount update (see useEmployee); only runs when the
    // record becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(existingEmployee.name);
    setRole(existingEmployee.role);
    setPhone(existingEmployee.phone ? formatPhoneInput(existingEmployee.phone) : "");
    setBaseSalaryInput(String(existingEmployee.baseSalary).replace(".", ","));
  }, [existingEmployee]);

  function handleSubmit() {
    const baseSalary = parseCurrencyInput(baseSalaryInput);

    if (name.trim() === "") {
      setError("Informe o nome.");
      return;
    }
    if (role.trim() === "") {
      setError("Informe a função.");
      return;
    }
    if (baseSalary === null || baseSalary <= 0) {
      setError("Informe um valor-base maior que zero.");
      return;
    }
    setError(null);

    const now = todayIso();
    const id = existingEmployee?.id ?? createEmployeeId();
    saveEmployee({
      id,
      name: name.trim(),
      role: role.trim(),
      phone: digitsOnly(phone) || undefined,
      baseSalary,
      status: existingEmployee?.status ?? "active",
      createdAt: existingEmployee?.createdAt ?? now,
      updatedAt: now,
    });

    router.push(`/equipe/${id}`);
  }

  if (isEditing && existingEmployee === undefined) return null;

  if (isEditing && existingEmployee === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Funcionário não encontrado" onBack={() => router.push("/equipe")} />
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
          title={isEditing ? "Editar funcionário" : "Novo funcionário"}
          onBack={() =>
            router.push(existingEmployee ? `/equipe/${existingEmployee.id}` : "/equipe")
          }
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="employee-name" className="text-sm font-medium text-foreground">
            Nome
          </label>
          <input
            id="employee-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="João Pereira"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="employee-role" className="text-sm font-medium text-foreground">
            Função
          </label>
          <input
            id="employee-role"
            type="text"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="Pedreiro"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="employee-phone" className="text-sm font-medium text-foreground">
            Telefone <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="employee-phone"
            type="text"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            placeholder="(11) 98888-0000"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <MoneyField
          id="employee-base-salary"
          label="Valor-base mensal"
          value={baseSalaryInput}
          onChange={setBaseSalaryInput}
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button type="button" size="lg" onClick={handleSubmit} className="w-full">
        {isEditing ? "Salvar alterações" : "Adicionar funcionário"}
      </Button>
    </div>
  );
}
