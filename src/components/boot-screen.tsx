export function BootScreen({ label = "Abriendo el mostrador…" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg text-fg">
      <div className="text-center">
        <p className="font-display text-4xl tracking-tight">IMAN</p>
        <p className="mt-2 text-sm text-subtle">{label}</p>
      </div>
    </div>
  );
}
