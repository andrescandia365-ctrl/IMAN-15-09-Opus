import type { Supplier } from "./types";
import { todayKey, weekdayMon1 } from "./format";

export function isMonthly(
  s: Pick<Supplier, "cadence" | "monthDays" | "monthOrderDays">,
): boolean {
  return (
    s.cadence === "monthly" &&
    ((s.monthDays?.length ?? 0) > 0 || (s.monthOrderDays?.length ?? 0) > 0)
  );
}

export function parseMonthDays(raw: string): number[] {
  const out: number[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > 31) continue;
    if (!out.includes(n)) out.push(n);
    if (out.length >= 4) break;
  }
  return out.sort((a, b) => a - b);
}

export function monthDaysLabel(days: number[]): string {
  const d = [...days].sort((a, b) => a - b);
  if (!d.length) return "Mensual";
  if (d.length === 1) return `El ${d[0]}`;
  const last = d[d.length - 1];
  return `El ${d.slice(0, -1).join(", ")} y el ${last}`;
}

export function monthlyHit(
  s: Pick<Supplier, "cadence" | "monthDays" | "monthOrderDays">,
  date = new Date(),
): "order" | "deliver" | null {
  if (!isMonthly(s)) return null;
  const n = date.getDate();
  if ((s.monthDays ?? []).includes(n)) return "deliver";
  if ((s.monthOrderDays ?? []).includes(n)) return "order";
  return null;
}

export function supplierMatchesDay(s: Supplier, weekday: number, date = new Date()): boolean {
  if (isMonthly(s)) {
    return weekday === weekdayMon1(date) && monthlyHit(s, date) != null;
  }
  return (s.orderDays ?? s.days).includes(weekday) || s.days.includes(weekday);
}

export function supplierHoy(s: Supplier, weekday: number, date = new Date()): boolean {
  if (isMonthly(s)) return monthlyHit(s, date) != null;
  return (s.orderDays ?? s.days).includes(weekday) || s.days.includes(weekday);
}

/** Próxima fecha de levante y de entrega, si el proveedor las tiene. */
export function nextCadenceDates(
  s: Pick<Supplier, "cadence" | "monthDays" | "monthOrderDays" | "days" | "orderDays">,
  from = new Date(),
): { liftAt?: string; deliverAt?: string } {
  if (isMonthly(s)) {
    return {
      liftAt: nextMonthDayKey(s.monthOrderDays ?? [], from),
      deliverAt: nextMonthDayKey(s.monthDays ?? [], from),
    };
  }
  return {
    liftAt: nextWeekdayKey(s.orderDays ?? s.days, from),
    deliverAt: nextWeekdayKey(s.days, from),
  };
}

function nextMonthDayKey(days: number[], from: Date): string | undefined {
  const clean = days.filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
  if (!clean.length) return undefined;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 62; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (clean.includes(d.getDate())) return todayKey(d);
  }
  return undefined;
}

function nextWeekdayKey(days: number[], from: Date): string | undefined {
  const clean = days.filter((n) => n >= 1 && n <= 7);
  if (!clean.length) return undefined;
  for (let i = 0; i < 8; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (clean.includes(weekdayMon1(d))) return todayKey(d);
  }
  return undefined;
}
