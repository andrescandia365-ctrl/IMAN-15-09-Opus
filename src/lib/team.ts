import { todayKey } from "@/lib/format";
import type { RosterSlot, ShiftDef, StaffMember, StaffPayEvery, StaffRole } from "@/lib/types";

export const STAFF_ROLES: { id: StaffRole; label: string }[] = [
  { id: "encargado", label: "Encargado" },
  { id: "cajero", label: "Cajero" },
  { id: "otro", label: "Otro" },
];

export const STAFF_PAY: { id: StaffPayEvery; label: string }[] = [
  { id: "mes", label: "Por mes" },
  { id: "semana", label: "Por semana" },
  { id: "turno", label: "Por turno" },
];

export function roleLabel(role: StaffRole): string {
  return STAFF_ROLES.find((r) => r.id === role)?.label ?? role;
}

export function payEveryLabel(p: StaffPayEvery): string {
  return STAFF_PAY.find((r) => r.id === p)?.label ?? p;
}

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function mondayOf(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function weekDays(from = mondayOf()): { date: string; label: string; today: boolean }[] {
  const today = todayKey();
  return DAY_NAMES.map((label, i) => {
    const x = new Date(from);
    x.setDate(from.getDate() + i);
    const date = todayKey(x);
    return { date, label, today: date === today };
  });
}

export function slotOf(roster: RosterSlot[], date: string, shiftKey: string): string {
  return roster.find((r) => r.date === date && r.shiftKey === shiftKey)?.staffId ?? "";
}

export function onShiftNow(
  staff: StaffMember[],
  roster: RosterSlot[],
  shifts: ShiftDef[],
  hour = new Date().getHours(),
): StaffMember | null {
  const sorted = [...shifts].sort((a, b) => a.start - b.start);
  let key = sorted[0]?.key ?? "manana";
  for (const s of sorted) {
    if (hour >= s.start) key = s.key;
  }
  const id = slotOf(roster, todayKey(), key);
  return staff.find((p) => p.id === id && p.active) ?? null;
}
