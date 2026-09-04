"use client";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { ISO_WEEKDAY_LABEL, isoWeekday } from "../prototype/attendance";
import { DERIVED_DAY_STATUS_LABEL, type AttendanceStatus, type DerivedDayStatus } from "../types";

const ATTENDANCE_ACTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "full_day", label: "Dia completo" },
  { value: "half_day", label: "Meio período" },
  { value: "absent", label: "Falta" },
];

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-09-14" -> "14 de setembro". Plain string parsing, no Date/timezone involved. */
function formatDayTitle(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(day)} de ${MONTH_NAMES[Number(month) - 1]}`;
}

/**
 * The single ResponsiveDialog used for every editable day, both
 * monthly and daily (Demo-Ready 009B §11/§14) — replaces the inline
 * `DayActionPanel`/per-row action grid that used to grow the page.
 * Always mounted by the caller (`AttendanceCalendar`) regardless of
 * `date`/`open`, so `ResponsiveDialog`'s breakpoint hook settles well
 * before the user's first click — see that component's own doc.
 */
export function AttendanceDayDialog({
  date,
  status,
  isDaily,
  open,
  onOpenChange,
  onSetStatus,
  onClear,
}: {
  date: string | null;
  status: DerivedDayStatus;
  isDaily: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetStatus: (date: string, status: AttendanceStatus) => void;
  onClear: (date: string) => void;
}) {
  const weekday = date ? ISO_WEEKDAY_LABEL[isoWeekday(date)] : "";
  const weekdayFull: Record<string, string> = {
    Seg: "Segunda-feira", Ter: "Terça-feira", Qua: "Quarta-feira",
    Qui: "Quinta-feira", Sex: "Sexta-feira", Sáb: "Sábado", Dom: "Domingo",
  };
  const description = isDaily
    ? status === "unrecorded"
      ? `${weekdayFull[weekday] ?? weekday} · Sem lançamento`
      : weekdayFull[weekday] ?? weekday
    : `${weekdayFull[weekday] ?? weekday} · Dia previsto de trabalho`;
  const hasEntry = status !== "unrecorded" && status !== "scheduled_day_off";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={date ? formatDayTitle(date) : ""}
      description={description}
      size="sm"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Status atual: <span className="font-medium text-foreground">{DERIVED_DAY_STATUS_LABEL[status]}</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ATTENDANCE_ACTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={status === option.value ? "default" : "outline"}
              onClick={() => date && onSetStatus(date, option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {hasEntry ? (
          <Button type="button" variant="ghost" className="w-full" onClick={() => date && onClear(date)}>
            Limpar apontamento
          </Button>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
