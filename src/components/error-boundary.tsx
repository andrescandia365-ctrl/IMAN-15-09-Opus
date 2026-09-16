import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[iman] crash", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
        <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-[var(--shadow-border)]">
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">IMAN</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight">Algo se trabó</h1>
          <p className="mt-3 text-sm text-muted">
            El mostrador no debería perder el último ticket si la caja estaba abierta. Recargá.
            Si vuelve a pasar, el historial viejo ya está recortado a propósito — no es un bug, es el techo.
          </p>
          <p className="mt-3 font-mono text-xs text-subtle">{this.state.error.message}</p>
          <Button className="mt-5 w-full" onClick={() => window.location.assign("/")}>
            Recargar
          </Button>
        </div>
      </main>
    );
  }
}
