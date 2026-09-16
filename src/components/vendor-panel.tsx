import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  issueLicenses,
  listLicenses,
  rotateShopSecret,
  setLicenseStatus,
  testMint,
  updateVendor,
  type LicenseRow,
  type MyAccess,
} from "@/lib/license";
import { PLAN_LABEL, PLAN_MONTHS, PLAN_SEATS, type PlanMonths, type PlanSeats } from "@/lib/plan";
import { formatDateLong } from "@/lib/format";
import { clearFlashSecret, readFlashSecret, saveFlashSecret } from "@/lib/shop-secret-flash";
import { errorText } from "@/lib/errors";

function wooSnippet(origin: string, secret: string): string {
  const key = secret || "PEGÁ_LA_CLAVE_ACÁ";
  return `<?php
/**
 * IMAN Path 2 — al marcar el pedido Completado, IMAN fabrica el código y lo manda por mail.
 * Pegar en el plugin Code Snippets, Run everywhere.
 */
add_action('woocommerce_order_status_completed', 'iman_mint_license', 20, 1);
add_action('woocommerce_email_order_meta', 'iman_email_code', 20, 3);

function iman_pack_months($order) {
  foreach ($order->get_items() as $item) {
    $product = $item->get_product();
    $sku = $product ? $product->get_sku() : '';
    if (preg_match('/iman-?36/i', $sku)) return 36;
    if (preg_match('/iman-?24/i', $sku)) return 24;
    if (preg_match('/iman-?12/i', $sku)) return 12;
  }
  return 0;
}

function iman_mint_license($order_id) {
  $order = wc_get_order($order_id);
  if (!$order) return;
  if (!iman_pack_months($order)) return;
  if ($order->get_meta('_iman_code')) return;

  $items = array();
  foreach ($order->get_items() as $item) {
    $product = $item->get_product();
    $items[] = array(
      'sku'  => $product ? $product->get_sku() : '',
      'name' => $item->get_name(),
    );
  }

  $res = wp_remote_post('${origin}/api/woo/issue', array(
    'headers' => array(
      'Content-Type'  => 'application/json',
      'Authorization' => 'Bearer ${key}',
    ),
    'body' => wp_json_encode(array(
      'order_id'   => (string) $order_id,
      'email'      => $order->get_billing_email(),
      'line_items' => $items,
    )),
    'timeout' => 20,
  ));

  if (is_wp_error($res)) {
    $order->add_order_note('IMAN error: ' . $res->get_error_message());
    $order->save();
    return;
  }

  $data = json_decode(wp_remote_retrieve_body($res), true);
  if (empty($data['code'])) {
    $order->add_order_note('IMAN no mintió código: ' . wp_remote_retrieve_body($res));
    $order->save();
    return;
  }

  $order->update_meta_data('_iman_code', $data['code']);
  $order->update_meta_data('_iman_activate', '${origin}' . $data['activate_path']);
  $order->add_order_note('IMAN mint: ' . $data['code']);
  $order->save();

  $link = '${origin}' . $data['activate_path'];
  $code = $data['code'];
  wp_mail(
    $order->get_billing_email(),
    'Tu código IMAN',
    "Pagaste el pack IMAN.\\n\\nCódigo:\\n" . $code . "\\n\\nActivalo:\\n" . $link . "\\n"
  );
}

function iman_email_code($order, $sent_to_admin, $plain) {
  if ($sent_to_admin) return;
  $code = $order->get_meta('_iman_code');
  if (!$code) return;
  $link = $order->get_meta('_iman_activate');
  echo '<p><strong>Código IMAN:</strong> ' . esc_html($code) . '</p>';
  if ($link) echo '<p><a href="' . esc_url($link) . '">Activar el mostrador</a></p>';
}
`;
}

export function VendorPanel({
  access,
  onAccess,
}: {
  access: MyAccess;
  onAccess: (next: MyAccess) => void;
}) {
  const [sellerName, setSellerName] = useState(access.sellerName);
  const [salesUrl, setSalesUrl] = useState(access.salesUrl);
  const [months, setMonths] = useState<PlanMonths>(12);
  const [seats, setSeats] = useState<PlanSeats>(1);
  const [quantity, setQuantity] = useState(5);
  const [fresh, setFresh] = useState<string[]>([]);
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [shopSecret, setShopSecret] = useState("");
  const [testCode, setTestCode] = useState("");
  const [testMonths, setTestMonths] = useState<PlanMonths>(12);
  const [testSeats, setTestSeats] = useState<PlanSeats>(1);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    const flash = readFlashSecret();
    if (flash) setShopSecret(flash);
    void listLicenses()
      .then(setRows)
      .catch((err) => console.error("[vendor] list", err));
  }, []);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  async function onSaveShop(e: FormEvent) {
    e.preventDefault();
    setBusy("shop");
    try {
      const next = await updateVendor({ data: { sellerName, salesUrl } });
      onAccess({ ...access, sellerName: next.sellerName, salesUrl: next.salesUrl });
      toast.success("Tienda guardada");
    } catch (err) {
      toast.error(errorText(err, "No se pudo guardar"));
    } finally {
      setBusy(null);
    }
  }

  async function onRotate() {
    setBusy("secret");
    try {
      const res = await rotateShopSecret();
      setShopSecret(res.secret);
      saveFlashSecret(res.secret);
      onAccess({ ...access, hasShopSecret: true });
      toast.success("Clave nueva — copiala. La anterior deja de servir.");
    } catch (err) {
      toast.error(errorText(err, "No se pudo crear la clave"));
    } finally {
      setBusy(null);
    }
  }

  async function onTestMint(e: FormEvent) {
    e.preventDefault();
    setBusy("mint");
    try {
      const res = await testMint({ data: { months: testMonths, seats: testSeats } });
      setTestCode(res.code);
      const list = await listLicenses();
      setRows(list);
      toast.success("Código mintido (pedido de prueba)");
    } catch (err) {
      toast.error(errorText(err, "No se pudo mintir"));
    } finally {
      setBusy(null);
    }
  }

  async function onIssue(e: FormEvent) {
    e.preventDefault();
    setBusy("issue");
    try {
      const res = await issueLicenses({ data: { months, seats, quantity } });
      setFresh(res.codes);
      const list = await listLicenses();
      setRows(list);
      toast.success(res.codes.length === 1 ? "Código listo" : `${res.codes.length} códigos listos`);
    } catch (err) {
      toast.error(errorText(err, "No se pudieron generar"));
    } finally {
      setBusy(null);
    }
  }

  const unused = rows.filter((r) => !r.redeemedAt).map((r) => r.code);
  const issueUrl = origin ? `${origin}/api/woo/issue` : "/api/woo/issue";

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <p className="text-[11px] uppercase tracking-[0.14em] text-sage">Path 2 · automático</p>
        <h2 className="mt-1 font-display text-xl tracking-tight">WooCommerce minta el código al pagar</h2>
        <p className="mt-2 text-sm text-muted">
          El dueño paga. WooCommerce marca Completado. IMAN fabrica un código nuevo y se lo manda
          por mail. El lector se despacha como producto físico aparte.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>
            Quince variaciones. SKU:{" "}
            <span className="font-mono text-fg">iman-12-1l</span> a{" "}
            <span className="font-mono text-fg">iman-12-5l</span>, lo mismo con{" "}
            <span className="font-mono text-fg">iman-24</span> y{" "}
            <span className="font-mono text-fg">iman-36</span>. El 12/24/36 es el período. El
            número con l es la cantidad de locales.
          </li>
          <li>Guardá la URL de la tienda y copiá la clave.</li>
          <li>
            Plugin <span className="text-fg">Code Snippets</span>, Run everywhere: pegá el PHP de
            abajo.
          </li>
          <li>Pedido de prueba a tu mail, estado Completado. Tiene que llegar el código.</li>
        </ol>

        <form onSubmit={(e) => void onSaveShop(e)} className="mt-5 space-y-3">
          <div>
            <Label htmlFor="seller-name">Nombre con el que vendés</Label>
            <Input
              id="seller-name"
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="sales-url">URL de WooCommerce</Label>
            <Input
              id="sales-url"
              value={salesUrl}
              onChange={(e) => setSalesUrl(e.target.value)}
              placeholder="https://tutienda.com"
              inputMode="url"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={busy !== null}>
            {busy === "shop" ? "Guardando…" : "Guardar tienda"}
          </Button>
        </form>

        <div className="mt-5 rounded-md bg-bg px-3 py-3">
          <p className="text-xs uppercase tracking-[0.12em] text-subtle">Endpoint</p>
          <p className="mt-1 break-all font-mono text-xs">{issueUrl}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => void copy(issueUrl)}>
            Copiar URL
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void onRotate()}>
            {busy === "secret"
              ? "Creando…"
              : shopSecret || access.hasShopSecret
                ? "Rotar clave"
                : "Crear clave de tienda"}
          </Button>
        </div>
        {shopSecret ? (
          <div className="mt-3 rounded-md bg-bg px-3 py-3">
            <p className="text-xs uppercase tracking-[0.12em] text-subtle">Clave — copiala ahora</p>
            <p className="mt-1 break-all font-mono text-sm">{shopSecret}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => void copy(shopSecret)}>
                Copiar clave
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearFlashSecret();
                  setShopSecret("");
                }}
              >
                Ya la guardé
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-subtle">
            {access.hasShopSecret
              ? "Hay una clave activa. Si la perdiste, rotá y actualizá el snippet."
              : "Todavía no hay clave. Creala antes de pegar el PHP."}
          </p>
        )}

        <Label className="mt-5">Snippet PHP (Code Snippets)</Label>
        <textarea
          readOnly
          id="woo-snippet"
          className="mt-1.5 min-h-48 w-full rounded-md bg-bg p-3 font-mono text-[11px] text-muted shadow-[var(--shadow-border)]"
          value={wooSnippet(origin, shopSecret)}
        />
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => void copy(wooSnippet(origin, shopSecret))}
        >
          Copiar snippet
        </Button>
        <p className="mt-3 text-xs text-subtle">
          El snippet no minta si el pedido no trae un SKU iman-12/24/36 con 1l–5l, y no duplica si
          WooCommerce reintenta el mismo pedido.
        </p>
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl tracking-tight">Pedido de prueba (sin WooCommerce)</h2>
        <p className="mt-1 text-sm text-muted">
          IMAN fabrica un código como si el dueño hubiera pagado. Sirve para ver el mint antes de
          tocar WordPress.
        </p>
        <form onSubmit={(e) => void onTestMint(e)} className="mt-4">
          <Label>Período</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PLAN_MONTHS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTestMonths(m)}
                className={
                  testMonths === m
                    ? "rounded-md bg-accent px-3 py-2 text-sm text-accent-fg"
                    : "rounded-md bg-elevated px-3 py-2 text-sm text-muted hover:text-fg"
                }
              >
                {PLAN_LABEL[m]}
              </button>
            ))}
          </div>
          <Label className="mt-4">Locales</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PLAN_SEATS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTestSeats(n)}
                className={
                  testSeats === n
                    ? "rounded-md bg-accent px-3 py-2 text-sm text-accent-fg"
                    : "rounded-md bg-elevated px-3 py-2 text-sm text-muted hover:text-fg"
                }
              >
                {n} {n === 1 ? "local" : "locales"}
              </button>
            ))}
          </div>
          <Button type="submit" className="mt-4" disabled={busy !== null}>
            {busy === "mint" ? "Mintiendo…" : "Mintir código de prueba"}
          </Button>
        </form>
        {testCode ? (
          <div className="mt-4 rounded-md bg-bg px-3 py-3">
            <p className="text-xs uppercase tracking-[0.12em] text-subtle">Código mintido</p>
            <p className="mt-1 font-mono text-sm">{testCode}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => void copy(testCode)}>
                Copiar
              </Button>
              <a className="text-sm text-sage hover:underline" href={`/activar?codigo=${encodeURIComponent(testCode)}`}>
                Abrir Activar
              </a>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl tracking-tight">Reserva · códigos a mano</h2>
        <p className="mt-1 text-sm text-muted">
          Si WooCommerce está caído, generá una tira y mandala por WhatsApp. Path 2 no usa esta
          pila.
        </p>
        <form onSubmit={(e) => void onIssue(e)} className="mt-4">
          <Label>Período</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PLAN_MONTHS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonths(m)}
                className={
                  months === m
                    ? "rounded-md bg-accent px-3 py-2 text-sm text-accent-fg"
                    : "rounded-md bg-elevated px-3 py-2 text-sm text-muted hover:text-fg"
                }
              >
                {PLAN_LABEL[m]}
              </button>
            ))}
          </div>
          <Label className="mt-4">Locales</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PLAN_SEATS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSeats(n)}
                className={
                  seats === n
                    ? "rounded-md bg-accent px-3 py-2 text-sm text-accent-fg"
                    : "rounded-md bg-elevated px-3 py-2 text-sm text-muted hover:text-fg"
                }
              >
                {n} {n === 1 ? "local" : "locales"}
              </button>
            ))}
          </div>
          <div className="mt-4 max-w-32">
            <Label htmlFor="qty">Cantidad</Label>
            <Input
              id="qty"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(Math.min(25, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <Button type="submit" variant="secondary" className="mt-4" disabled={busy !== null}>
            {busy === "issue" ? "Generando…" : "Generar códigos"}
          </Button>
        </form>
        {fresh.length ? (
          <div className="mt-4 rounded-md bg-bg px-3 py-3">
            <ul className="space-y-1 font-mono text-sm">
              {fresh.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => void copy(fresh.join("\n"))}>
              Copiar
            </Button>
          </div>
        ) : null}
        {unused.length ? (
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => void copy(unused.join("\n"))}>
            Copiar {unused.length} sin usar
          </Button>
        ) : null}
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl tracking-tight">Emitidos</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Todavía no hay códigos.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {rows.map((r) => (
              <li key={r.code} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <p className="font-mono text-sm">{r.code}</p>
                  <p className="text-xs text-subtle">
                    {PLAN_LABEL[r.months as PlanMonths] ?? `${r.months} meses`}
                    {` · ${r.seats} ${r.seats === 1 ? "local" : "locales"}`}
                    {r.cancelledAt
                      ? " · cancelado"
                      : r.redeemedAt
                        ? ` · ${r.redeemedEmail || r.redeemedName || "activado"}`
                        : " · sin usar"}
                    {r.wooOrderId ? ` · pedido ${r.wooOrderId}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted">
                    {r.expiresAt ? `vence ${formatDateLong(r.expiresAt)}` : "a la espera"}
                  </p>
                  {r.redeemedAt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => {
                        const action = r.cancelledAt ? "reactivate" : "cancel";
                        setBusy(action);
                        void setLicenseStatus({ data: { code: r.code, action } })
                          .then(() => listLicenses())
                          .then(setRows)
                          .then(() => toast.success(action === "cancel" ? "Cancelado" : "Reactivado"))
                          .catch((err) => toast.error(errorText(err, "No se pudo")))
                          .finally(() => setBusy(null));
                      }}
                    >
                      {r.cancelledAt ? "Reactivar" : "Cancelar"}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
