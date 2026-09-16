import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatARS, formatDateLong } from "@/lib/format";
import { uid } from "@/lib/utils";
import {
  payEveryLabel,
  roleLabel,
  slotOf,
  STAFF_PAY,
  STAFF_ROLES,
  weekDays,
} from "@/lib/team";
import type { StaffMember, StaffPayEvery, StaffPayout, StaffRole } from "@/lib/types";
import { useImanStore } from "@/lib/store";

const selectClass =
  "h-11 w-full rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)]";

export function TeamView() {
  const staff = useImanStore((s) => s.staff);
  const roster = useImanStore((s) => s.roster);
  const payouts = useImanStore((s) => s.payouts);
  const shifts = useImanStore((s) => s.settings.shifts);
  const saveStaff = useImanStore((s) => s.saveStaff);
  const deleteStaff = useImanStore((s) => s.deleteStaff);
  const setRoster = useImanStore((s) => s.setRoster);
  const payStaff = useImanStore((s) => s.payStaff);

  const days = useMemo(() => weekDays(), []);
  const active = staff.filter((p) => p.active);
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("cajero");
  const [payEvery, setPayEvery] = useState<StaffPayEvery>("mes");
  const [amount, setAmount] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [payId, setPayId] = useState("");
  const [payAmt, setPayAmt] = useState("");
  const [payKind, setPayKind] = useState<StaffPayout["kind"]>("sueldo");
  const [fromCaja, setFromCaja] = useState(true);

  function addPerson() {
    const n = name.trim();
    if (!n) {
      toast.error("Nombre");
      return;
    }
    const person: StaffMember = {
      id: uid("st"),
      name: n,
      role,
      payEvery,
      amount: Number(amount) || 0,
      whatsapp: whatsapp.trim(),
      active: true,
    };
    saveStaff(person);
    setName("");
    setAmount("");
    setWhatsapp("");
    toast.success("En el equipo");
  }

  function pay() {
    const id = payId || active[0]?.id;
    if (!id) {
      toast.error("Elegí a quién");
      return;
    }
    const res = payStaff({
      staffId: id,
      amount: Number(payAmt),
      kind: payKind,
      fromCaja,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setPayAmt("");
    toast.success(fromCaja ? "Pagado. Salió de caja (retiros)." : "Anotado. No tocó la caja.");
  }

  return (
    <div className="grid h-full min-h-0 gap-3 overflow-hidden lg:grid-cols-2">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Personas</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lucía" />
          </div>
          <div>
            <Label>Rol</Label>
            <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {STAFF_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Pago</Label>
            <select
              className={selectClass}
              value={payEvery}
              onChange={(e) => setPayEvery(e.target.value as StaffPayEvery)}
            >
              {STAFF_PAY.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Monto</Label>
            <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="sm:col-span-2">
            <Label>WhatsApp (opcional)</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="11 5555-1234" />
          </div>
        </div>
        <Button className="mt-3" variant="secondary" onClick={addPerson}>
          Sumar al equipo
        </Button>
        {staff.length ? (
          <ul className="mt-3 min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {staff.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {p.name}
                    {!p.active ? <span className="ml-2 text-xs text-subtle">inactivo</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {roleLabel(p.role)} · {payEveryLabel(p.payEvery)}
                    {p.amount ? ` · ${formatARS(p.amount)}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => saveStaff({ ...p, active: !p.active })}
                  >
                    {p.active ? "Pausar" : "Activar"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteStaff(p.id)}>
                    Sacar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-subtle">Todavía no hay nadie cargado.</p>
        )}
      </section>

      <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
      <section className="min-h-0 flex-1 overflow-hidden rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Turnos de esta semana</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="text-xs text-subtle">
                <th className="pb-2 pr-2 font-medium">Turno</th>
                {days.map((d) => (
                  <th key={d.date} className={d.today ? "pb-2 text-sage" : "pb-2"}>
                    {d.label}
                    <span className="block font-mono text-[10px] font-normal opacity-70">{d.date.slice(8)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shifts.map((sh) => (
                <tr key={sh.key} className="border-t border-border">
                  <td className="py-2 pr-2 text-xs text-muted">{sh.name}</td>
                  {days.map((d) => (
                    <td key={d.date} className="py-1 pr-1">
                      <select
                        className="h-9 w-full rounded-md bg-elevated px-1 text-xs"
                        value={slotOf(roster, d.date, sh.key)}
                        onChange={(e) => setRoster(d.date, sh.key, e.target.value)}
                      >
                        <option value="">—</option>
                        {active.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="shrink-0 overflow-y-auto rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Pagar</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <Label>Quién</Label>
            <select className={selectClass} value={payId} onChange={(e) => setPayId(e.target.value)}>
              <option value="">Elegí</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.amount ? ` · ${formatARS(p.amount)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Monto</Label>
            <Input inputMode="numeric" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <select
              className={selectClass}
              value={payKind}
              onChange={(e) => setPayKind(e.target.value as StaffPayout["kind"])}
            >
              <option value="sueldo">Sueldo</option>
              <option value="adelanto">Adelanto</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted sm:mt-7">
            <input type="checkbox" checked={fromCaja} onChange={(e) => setFromCaja(e.target.checked)} />
            Sale de la caja de hoy
          </label>
        </div>
        <Button className="mt-3" onClick={pay} disabled={!active.length}>
          Registrar pago
        </Button>
        {payouts.length ? (
          <ul className="mt-4 divide-y divide-border">
            {payouts.slice(0, 12).map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-2 py-2 text-sm">
                <span>
                  {p.name}
                  <span className="text-subtle"> · {p.kind}</span>
                  {p.fromCaja ? <span className="text-subtle"> · caja</span> : null}
                </span>
                <span className="num">
                  {formatARS(p.amount)}
                  <span className="ml-2 text-xs text-subtle">{formatDateLong(p.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-subtle">Todavía no hay pagos.</p>
        )}
      </section>
      </div>
    </div>
  );
}
