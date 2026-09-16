const chains = new Map<string, Promise<unknown>>();

/**
 * Serializa lecturas-y-escrituras sobre la misma clave. Sin esto, dos
 * movimientos anotados en el mismo instante leen la cola vieja y el segundo
 * pisa al primero: la venta o la devolución se pierde.
 */
export function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/** Espera a que se vacíe la fila de una clave (tests, cierre de turno). */
export async function keyLockIdle(key: string): Promise<void> {
  await (chains.get(key) ?? Promise.resolve());
}
