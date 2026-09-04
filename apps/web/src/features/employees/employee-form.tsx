"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { parseCurrencyInput } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import { digitsOnly, formatPhoneInput } from "@/lib/phone";
import { ISO_WEEKDAYS, ISO_WEEKDAY_LABEL } from "./prototype/attendance";
import { createEmployeeId, saveEmployee } from "./prototype/employee-store";
import { useEmployee } from "./prototype/use-employee";
import {
  EMPLOYMENT_TYPE_LABEL,
  PAYMENT_MODEL_LABEL,
  type Employee,
  type EmploymentType,
  type PaymentModel,
} from "./types";

const EMPLOYMENT_TYPE_OPTIONS: EmploymentType[] = ["employee", "contractor"];
const PAYMENT_MODEL_OPTIONS: PaymentModel[] = ["monthly", "daily"];
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

export function EmployeeForm({
  employeeId,
  onSuccess,
  onCancel,
}: {
  employeeId?: string;
  /** When provided (quick-create in a Dialog/Sheet), called with the saved Employee instead of navigating. */
  onSuccess?: (employee: Employee) => void;
  /** When provided, renders a Cancelar action next to the submit button and hides the page-only BackHeader. */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const { employee: existingEmployee } = useEmployee(employeeId ?? "");
  const isEditing = Boolean(employeeId);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("employee");
  const [paymentModel, setPaymentModel] = useState<PaymentModel>("monthly");
  const [baseSalaryInput, setBaseSalaryInput] = useState("");
  const [dailyRateInput, setDailyRateInput] = useState("");
  const [workDays, setWorkDays] = useState<number[]>(DEFAULT_WORK_DAYS);
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
    setEmploymentType(existingEmployee.employmentType);
    setPaymentModel(existingEmployee.paymentModel);
    setBaseSalaryInput(
      existingEmployee.paymentModel === "monthly"
        ? String(existingEmployee.baseSalary).replace(".", ",")
        : ""
    );
    setDailyRateInput(
      existingEmployee.dailyRate !== undefined ? String(existingEmployee.dailyRate).replace(".", ",") : ""
    );
    setWorkDays(existingEmployee.workDays ?? DEFAULT_WORK_DAYS);
  }, [existingEmployee]);

  function toggleWorkDay(day: number) {
    setWorkDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort()
    );
  }

  function handleSubmit() {
    if (name.trim() === "") {
      setError("Informe o nome.");
      return;
    }
    if (role.trim() === "") {
      setError("Informe a função.");
      return;
    }

    let baseSalary = 0;
    let dailyRate: number | undefined;

    if (paymentModel === "monthly") {
      const parsedSalary = parseCurrencyInput(baseSalaryInput);
      if (parsedSalary === null || parsedSalary <= 0) {
        setError("Informe um salário mensal maior que zero.");
        return;
      }
      if (workDays.length === 0) {
        setError("Selecione ao menos um dia de trabalho da semana.");
        return;
      }
      baseSalary = parsedSalary;
    } else {
      const parsedDailyRate = parseCurrencyInput(dailyRateInput);
      if (parsedDailyRate === null || parsedDailyRate <= 0) {
        setError("Informe um valor de diária maior que zero.");
        return;
      }
      dailyRate = parsedDailyRate;
    }
    setError(null);

    const now = todayIso();
    const id = existingEmployee?.id ?? createEmployeeId();
    const employee: Employee = {
      id,
      name: name.trim(),
      role: role.trim(),
      phone: digitsOnly(phone) || undefined,
      employmentType,
      paymentModel,
      baseSalary,
      dailyRate,
      workDays: paymentModel === "monthly" ? workDays : undefined,
      status: existingEmployee?.status ?? "active",
      createdAt: existingEmployee?.createdAt ?? now,
      updatedAt: now,
    };
    saveEmployee(employee);

    if (onSuccess) {
      onSuccess(employee);
      return;
    }
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
      {onCancel ? null : (
        <div className="space-y-1">
          <BackHeader
            title={isEditing ? "Editar funcionário" : "Novo funcionário"}
            onBack={() =>
              router.push(existingEmployee ? `/equipe/${existingEmployee.id}` : "/equipe")
            }
          />
        </div>
      )}

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

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Tipo de vínculo</span>
          <div className="grid grid-cols-2 gap-2">
            {EMPLOYMENT_TYPE_OPTIONS.map((option) => {
              const selected = employmentType === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setEmploymentType(option)}
                  className={
                    selected
                      ? "rounded-lg border border-primary bg-primary/5 py-2.5 text-sm font-semibold text-primary"
                      : "rounded-lg border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:border-primary/30"
                  }
                >
                  {EMPLOYMENT_TYPE_LABEL[option]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Forma de remuneração</span>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_MODEL_OPTIONS.map((option) => {
              const selected = paymentModel === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPaymentModel(option)}
                  className={
                    selected
                      ? "rounded-lg border border-primary bg-primary/5 py-2.5 text-sm font-semibold text-primary"
                      : "rounded-lg border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:border-primary/30"
                  }
                >
                  {PAYMENT_MODEL_LABEL[option]}
                </button>
              );
            })}
          </div>
        </div>

        {paymentModel === "monthly" ? (
          <>
            <MoneyField
              id="employee-base-salary"
              label="Salário mensal"
              value={baseSalaryInput}
              onChange={setBaseSalaryInput}
            />
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Dias de trabalho da semana</span>
              <div className="grid grid-cols-7 gap-1.5">
                {ISO_WEEKDAYS.map((day) => {
                  const selected = workDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleWorkDay(day)}
                      className={
                        selected
                          ? "rounded-lg border border-primary bg-primary/5 py-2 text-xs font-semibold text-primary"
                          : "rounded-lg border border-border bg-card py-2 text-xs font-semibold text-foreground hover:border-primary/30"
                      }
                    >
                      {ISO_WEEKDAY_LABEL[day]}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <MoneyField
            id="employee-daily-rate"
            label="Valor da diária"
            value={dailyRateInput}
            onChange={setDailyRateInput}
          />
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      {onCancel ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {isEditing ? "Salvar alterações" : "Salvar colaborador"}
          </Button>
        </div>
      ) : (
        <Button type="button" size="lg" onClick={handleSubmit} className="w-full">
          {isEditing ? "Salvar alterações" : "Adicionar funcionário"}
        </Button>
      )}
    </div>
  );
}
