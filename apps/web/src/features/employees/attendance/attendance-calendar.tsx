"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  ISO_WEEKDAYS,
  ISO_WEEKDAY_LABEL,
  deriveDayStatus,
  getPeriodDates,
  isoWeekday,
} from "../prototype/attendance";
import {
  DERIVED_DAY_STATUS_LABEL,
  type AttendanceStatus,
  type DerivedDayStatus,
  type EmployeeWorkPeriod,
} from "../types";

const ATTENDANCE_ACTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "full_day", label: "Completo" },
  { value: "half_day", label: "Meio" },
  { value: "absent", label: "Falta" },
];

const SHORT_STATUS_LABEL: Record<DerivedDayStatus, string> = {
  full_day: "Compl.",
  half_day: "½ dia",
  absent: "Falta",
  unrecorded: "—",
  scheduled_day_off: "Folga",
};

const STATUS_TONE_CLASS: Record<DerivedDayStatus, string> = {
  full_day: "border-primary/40 bg-primary/5 text-primary",
  half_day: "border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-400",
  absent: "border-destructive/40 bg-destructive/5 text-destructive",
  unrecorded: "border-border bg-muted/40 text-muted-foreground",
  scheduled_day_off: "border-transparent bg-transparent text-muted-foreground",
};

function dayLabel(date: string): { day: string; weekday: string } {
  const [, month, day] = date.split("-");
  return { day: `${day}/${month}`, weekday: ISO_WEEKDAY_LABEL[isoWeekday(date)] };
}

interface AttendanceCalendarProps {
  workPeriod: EmployeeWorkPeriod;
  /** Individual full/half/absent/clear actions are shown for the active day. */
  editable: boolean;
  /** Multi-select mode (daily bulk action) — tapping a day toggles selection instead of opening the action panel. */
  selectable?: boolean;
  selectedDates?: string[];
  onToggleSelect?: (date: string) => void;
  onSetStatus?: (date: string, status: AttendanceStatus) => void;
  onClear?: (date: string) => void;
}

function DayActionPanel({
  date,
  status,
  onSetStatus,
  onClear,
}: {
  date: string;
  status: DerivedDayStatus;
  onSetStatus: (date: string, status: AttendanceStatus) => void;
  onClear: (date: string) => void;
}) {
  const { day, weekday } = dayLabel(date);
  const hasEntry = status !== "unrecorded" && status !== "scheduled_day_off";

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {weekday}, {day}
        </p>
        <span className="text-xs text-muted-foreground">{DERIVED_DAY_STATUS_LABEL[status]}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {ATTENDANCE_ACTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={status === option.value}
            onClick={() => onSetStatus(date, option.value)}
            className={
              status === option.value
                ? "rounded-lg border border-primary bg-primary/5 py-1.5 text-xs font-semibold text-primary"
                : "rounded-lg border border-border bg-card py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
            }
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          disabled={!hasEntry}
          onClick={() => onClear(date)}
          className="rounded-lg border border-border bg-card py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/30 disabled:opacity-40"
        >
          Limpar
        </button>
      </div>
    </div>
  );
}

function CalendarCell({
  date,
  status,
  interactive,
  selectable,
  selected,
  active,
  onClick,
}: {
  date: string;
  status: DerivedDayStatus;
  interactive: boolean;
  selectable: boolean;
  selected: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const [, , day] = date.split("-");

  if (status === "scheduled_day_off") {
    return (
      <div className="flex aspect-square flex-col items-center justify-center rounded-lg text-muted-foreground/70">
        <span className="text-xs font-medium">{Number(day)}</span>
        <span className="text-[10px]">Folga</span>
      </div>
    );
  }

  const label = `${day}, ${DERIVED_DAY_STATUS_LABEL[status]}`;

  return (
    <button
      type="button"
      disabled={!interactive}
      aria-pressed={selectable ? selected : active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-xs transition-colors",
        STATUS_TONE_CLASS[status],
        (active || selected) && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        interactive && "cursor-pointer hover:border-primary/40",
        !interactive && "cursor-default"
      )}
    >
      {selectable ? (
        <input type="checkbox" checked={selected} readOnly tabIndex={-1} className="size-3" aria-hidden />
      ) : null}
      <span className="font-semibold">{Number(day)}</span>
      <span className="text-[10px]">{SHORT_STATUS_LABEL[status]}</span>
    </button>
  );
}

function DayListRow({
  date,
  status,
  editable,
  selectable,
  selected,
  onToggleSelect,
  onSetStatus,
  onClear,
}: {
  date: string;
  status: DerivedDayStatus;
  editable: boolean;
  selectable: boolean;
  selected: boolean;
  onToggleSelect?: (date: string) => void;
  onSetStatus: (date: string, status: AttendanceStatus) => void;
  onClear: (date: string) => void;
}) {
  const { day, weekday } = dayLabel(date);

  if (status === "scheduled_day_off") {
    return (
      <div className="flex items-center justify-between py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{day}</span>
          <span className="text-xs text-muted-foreground">{weekday}</span>
        </div>
        <span className="text-xs text-muted-foreground">Folga prevista</span>
      </div>
    );
  }

  const hasEntry = status !== "unrecorded";
  const statusClass =
    status === "absent" ? "text-destructive" : status === "unrecorded" ? "text-muted-foreground" : "text-primary";

  if (selectable) {
    return (
      <label className="flex items-center justify-between gap-3 py-2.5">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(date)}
            className="size-4"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">{day}</span>
            <span className="text-xs text-muted-foreground">{weekday}</span>
          </div>
        </div>
        <span className={`text-xs font-medium ${statusClass}`}>{DERIVED_DAY_STATUS_LABEL[status]}</span>
      </label>
    );
  }

  return (
    <div className="space-y-1.5 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{day}</span>
          <span className="text-xs text-muted-foreground">{weekday}</span>
        </div>
        <span className={`text-xs font-medium ${statusClass}`}>{DERIVED_DAY_STATUS_LABEL[status]}</span>
      </div>
      {editable ? (
        <div className="grid grid-cols-4 gap-1.5">
          {ATTENDANCE_ACTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={status === option.value}
              onClick={() => onSetStatus(date, option.value)}
              className={
                status === option.value
                  ? "rounded-lg border border-primary bg-primary/5 py-1.5 text-xs font-semibold text-primary"
                  : "rounded-lg border border-border bg-card py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
              }
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            disabled={!hasEntry}
            onClick={() => onClear(date)}
            className="rounded-lg border border-border bg-card py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/30 disabled:opacity-40"
          >
            Limpar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AttendanceCalendar({
  workPeriod,
  editable,
  selectable = false,
  selectedDates = [],
  onToggleSelect,
  onSetStatus,
  onClear,
}: AttendanceCalendarProps) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const dates = getPeriodDates(workPeriod.period);
  const leadingBlanks = isoWeekday(dates[0]) - 1;

  function handleCellClick(date: string, status: DerivedDayStatus) {
    if (status === "scheduled_day_off") return;
    if (selectable) {
      onToggleSelect?.(date);
      return;
    }
    if (!editable) {
      setActiveDate((current) => (current === date ? null : date));
      return;
    }
    setActiveDate((current) => (current === date ? null : date));
  }

  return (
    <div id="attendance-calendar" className="space-y-3">
      <div className="hidden rounded-xl border border-border bg-card p-4 lg:block">
        <div className="grid grid-cols-7 gap-1.5">
          {ISO_WEEKDAYS.map((weekday) => (
            <div key={weekday} className="pb-1 text-center text-xs font-semibold text-muted-foreground">
              {ISO_WEEKDAY_LABEL[weekday]}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }).map((_, index) => (
            <div key={`blank-${index}`} />
          ))}
          {dates.map((date) => {
            const status = deriveDayStatus(workPeriod, date);
            return (
              <CalendarCell
                key={date}
                date={date}
                status={status}
                interactive={(editable || selectable) && status !== "scheduled_day_off"}
                selectable={selectable}
                selected={selectedDates.includes(date)}
                active={activeDate === date}
                onClick={() => handleCellClick(date, status)}
              />
            );
          })}
        </div>

        {!selectable && activeDate ? (
          editable ? (
            <DayActionPanel
              date={activeDate}
              status={deriveDayStatus(workPeriod, activeDate)}
              onSetStatus={(date, status) => onSetStatus?.(date, status)}
              onClear={(date) => onClear?.(date)}
            />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {dayLabel(activeDate).weekday}, {dayLabel(activeDate).day} —{" "}
              {DERIVED_DAY_STATUS_LABEL[deriveDayStatus(workPeriod, activeDate)]}
            </p>
          )
        ) : null}
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-card px-4 lg:hidden">
        {dates.map((date) => (
          <DayListRow
            key={date}
            date={date}
            status={deriveDayStatus(workPeriod, date)}
            editable={editable}
            selectable={selectable}
            selected={selectedDates.includes(date)}
            onToggleSelect={onToggleSelect}
            onSetStatus={(d, status) => onSetStatus?.(d, status)}
            onClear={(d) => onClear?.(d)}
          />
        ))}
      </div>
    </div>
  );
}
