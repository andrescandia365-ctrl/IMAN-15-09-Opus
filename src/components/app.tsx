import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Toaster, toast } from "sonner";
import { ActivateScreen } from "@/components/activate-screen";
import { HubScreen } from "@/components/hub-screen";
import { LandingScreen } from "@/components/landing-screen";
import { LocalsWizard } from "@/components/locals-wizard";
import { OpeningScreen } from "@/components/opening-screen";
import { Shell } from "@/components/shell";
import { useCurrentUserState, type AppUser } from "@/lib/auth/use-current-user";
import { loadAccount, saveOwnerProfile, selectStore, type AccountBundle, type StoreMeta } from "@/lib/kiosk";
import { localHasCopy, mergePayload, prunePayload } from "@/lib/cap";
import { getMyAccess, redeemLicense, type MyAccess } from "@/lib/license";
import {
  clearPendingCode,
  clearPendingPhone,
  clearPendingTrial,
  readPendingCode,
  readPendingPhone,
  readPendingTrial,
} from "@/lib/pending-code";
import { snapshotKiosk, useImanStore } from "@/lib/store";
import {
  appendSyncLog,
  lastKnownStore,
  loadLocalSnapshot,
  loadSession,
  saveLocalSnapshot,
  saveSession,
  setActiveLocalStore,
  writeBlobRev,
} from "@/lib/local-db";
import { flushDeskOutbox } from "@/lib/desk-outbox";
import { recallLocalName, rememberLocalName } from "@/lib/local-name";
import { decideFloorBoot, isBrowserOnline, lockFloor, readFloorLockSync, type FloorLock } from "@/lib/floor-lock";
import { backupOnHide, flushCopy, pushQuiet, startFromCopy } from "@/lib/sync";
import { applyPwaUpdate, registerPwa, subscribePwaUpdate } from "@/lib/pwa";
import { authEnabled } from "@/lib/auth/client";
import { errorText } from "@/lib/errors";

const LOCAL_ACCESS: MyAccess = {
  isVendor: false,
  vendorClaimed: false,
  sellerName: "IMAN",
  salesUrl: "",
  hasShopSecret: false,
  extraSeats: 0,
  seatsAllowed: 5,
  trial: null,
  license: {
    code: "LOCAL",
    months: 12,
    seats: 5,
    startsAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    active: true,
  },
};

type Gate = "hub" | "wizard" | "activate" | "desk";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

function userFromLock(lock: FloorLock): AppUser {
  return {
    id: lock.userId,
    displayName: lock.displayName,
    primaryEmail: lock.email,
    profileImageUrl: null,
    isDevFallback: false,
  };
}

export function App() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const theme = useImanStore((s) => s.settings.theme);
  const hydrated = useImanStore((s) => s.hydrated);
  const hydrateKiosk = useImanStore((s) => s.hydrateKiosk);
  const resetDemo = useImanStore((s) => s.resetDemo);
  const setHydrated = useImanStore((s) => s.setHydrated);
  const [authFail, setAuthFail] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [lock, setLock] = useState<FloorLock | null>(null);
  const [access, setAccess] = useState<MyAccess | null>(() => (authEnabled ? null : LOCAL_ACCESS));
  const [stores, setStores] = useState<StoreMeta[]>(() =>
    authEnabled
      ? []
      : [{ id: "s1", name: "Kiosco El Faro", alias: "", updatedAt: new Date().toISOString() }],
  );
  const [activeStoreId, setActiveStoreId] = useState("s1");
  const [gate, setGate] = useState<Gate>(() => (authEnabled ? "hub" : "desk"));
  const [floor, setFloor] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pwaUpdate, setPwaUpdate] = useState(false);
  // El local ya tiene sus datos. Hasta entonces se ve la pantalla de apertura
  // y nada guarda ni sube: el store todavía no es el local.
  const [localReady, setLocalReady] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  // No abrió: ni copia en el aparato ni fotocopia del servidor.
  const [openFailed, setOpenFailed] = useState(false);
  const noCopyHere = useRef(false);
  const noCopyRemote = useRef(false);

  const floorUser = user ?? (lock ? userFromLock(lock) : null);
  const userId = floorUser?.id ?? null;

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => subscribePwaUpdate(setPwaUpdate), []);

  useEffect(() => {
    registerPwa();
    const found = readFloorLockSync();
    setLock(found);
    if (found) {
      setGate("desk");
      setFloor(true);
      setActiveStoreId(found.storeId);
      setActiveLocalStore(found.storeId);
      setAccess((prev) => prev ?? LOCAL_ACCESS);
      setHydrated(true);
    }
    setMounted(true);
    try {
      window.localStorage.removeItem("iman-kiosk");
    } catch {
      /* ignore */
    }
  }, [setHydrated]);

  useEffect(() => {
    if (!mounted) return;
    if (!authEnabled) {
      let cancelled = false;
      const last = lastKnownStore() || "s1";
      setActiveLocalStore(last);
      void loadLocalSnapshot(last).then((snap) => {
        if (cancelled) return;
        if (snap) hydrateKiosk(snap);
        else resetDemo();
        const name = useImanStore.getState().settings.name || "Local";
        setAccess(LOCAL_ACCESS);
        setStores([{ id: last, name, alias: "", updatedAt: new Date().toISOString() }]);
        setActiveStoreId(last);
        setLocalReady(true);
        setGate("desk");
      });
      return () => {
        cancelled = true;
      };
    }

    const currentLock = readFloorLockSync();
    if (!userId && !currentLock) {
      if (!isPending) {
        setAccess(null);
        setStores([]);
        setGate("hub");
      }
      return;
    }

    const waitForRemote = Boolean(userId && isBrowserOnline() && !currentLock);
    if (waitForRemote) {
      return;
    }

    let cancelled = false;
    setAuthFail(false);
    const last = currentLock?.storeId || lastKnownStore();
    setActiveLocalStore(last);

    void (async () => {
      try {
        const [session, snap] = await Promise.all([loadSession(), loadLocalSnapshot(last)]);
        if (cancelled) return;
        if (session) {
          setAccess(session.access);
          setStores(session.stores);
          const id = currentLock?.storeId || session.activeStoreId;
          setActiveStoreId(id);
          setActiveLocalStore(id);
        } else if (currentLock) {
          setAccess(LOCAL_ACCESS);
        }
        let loaded = Boolean(snap);
        if (snap) hydrateKiosk(snap);
        else if (currentLock) setHydrated(true);
        if (currentLock) {
          setFloor(true);
          setActiveStoreId(currentLock.storeId);
          setActiveLocalStore(currentLock.storeId);
          if (!snap) {
            const other = await loadLocalSnapshot(currentLock.storeId);
            if (!cancelled && other) {
              hydrateKiosk(other);
              loaded = true;
            }
          }
        }
        if (cancelled) return;
        if (loaded) setLocalReady(true);
        else if (currentLock) noCopyOnDevice();
      } catch (err) {
        console.error("[kiosk] local boot", err);
        if (!cancelled && currentLock) setHydrated(true);
        if (!cancelled && currentLock) noCopyOnDevice();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, mounted, isPending, hydrateKiosk, resetDemo, setHydrated]);

  useEffect(() => {
    if (!mounted || !authEnabled) return;
    if (!userId) return;
    if (!isBrowserOnline()) return;
    let cancelled = false;

    const phone = readPendingPhone();
    if (phone) {
      void saveOwnerProfile({ data: { name: "", phone } })
        .then(() => clearPendingPhone())
        .catch(() => {});
    }

    const hasFloor = Boolean(readFloorLockSync());
    const remoteWork = Promise.all([loadAccount(), getMyAccess()]);
    const remote = hasFloor ? withTimeout(remoteWork, 4000) : remoteWork;
    void remote
      .then(async ([account, loaded]) => {
        if (cancelled) return;
        let nextAccess = loaded;
        setAccess(nextAccess);
        const pending = readPendingCode();
        if (pending && !nextAccess.isVendor && !nextAccess.license?.active) {
          try {
            const redeemed = await redeemLicense({ data: { code: pending } });
            if (cancelled) return;
            setAccess(redeemed);
            if (redeemed.license?.active) clearPendingCode();
            nextAccess = redeemed;
          } catch {
            /* stays pending */
          }
        }
        if (readPendingTrial()) clearPendingTrial();
        setPullError(null);
        if (account) {
          setStores(account.stores);
          const keep = readFloorLockSync()?.storeId || account.activeStoreId;
          const storeId = account.stores.some((s) => s.id === keep) ? keep : account.activeStoreId;
          setActiveStoreId(storeId);
          setActiveLocalStore(storeId);
          void writeBlobRev(storeId, account.rev);
          const local = await loadLocalSnapshot(storeId);
          const payload = localHasCopy(local)
            ? mergePayload(account.payload, local!)
            : account.payload;
          // Sin copia propia el aparato arranca de la fotocopia: sigue la cinta desde donde llega la foto.
          if (!localHasCopy(local)) await startFromCopy(storeId, account.payload);
          hydrateKiosk(payload, { restore: !localHasCopy(local) });
          setLocalReady(true);
          void saveLocalSnapshot(storeId, payload);
          void saveSession({
            access: nextAccess,
            stores: account.stores,
            activeStoreId: storeId,
          });
          return;
        }
        if (!readFloorLockSync()) {
          setStores([]);
          setHydrated(true);
        } else {
          noCopyOnServer();
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = errorText(err, "");
        if (msg === "Unauthorized" && !readFloorLockSync()) {
          setAuthFail(true);
          return;
        }
        if (readFloorLockSync()) {
          noCopyOnServer();
          return;
        }
        console.error("[kiosk] load failed", err);
        const last = lastKnownStore();
        void loadLocalSnapshot(last).then((local) => {
          if (cancelled) return;
          if (localHasCopy(local)) {
            hydrateKiosk(local!);
            toast.error("Sin red. El local de este aparato sigue.");
            return;
          }
          setPullError("No pude traer el local");
          setHydrated(true);
        });
      });

    return () => {
      cancelled = true;
    };
  }, [userId, mounted, hydrateKiosk, resetDemo, setHydrated]);

  useEffect(() => {
    if (!userId || gate !== "desk" || !activeStoreId) return;
    const next = lockFloor({
      userId,
      displayName: floorUser?.displayName ?? null,
      email: floorUser?.primaryEmail ?? null,
      storeId: activeStoreId,
    });
    setLock(next);
  }, [userId, gate, activeStoreId, floorUser?.displayName, floorUser?.primaryEmail]);

  useEffect(() => {
    if (!userId || !hydrated || gate !== "desk" || !localReady) return;
    let t: number | undefined;
    let last = "";
    let subido = "";
    const DATA = [
      "products",
      "categories",
      "sales",
      "settings",
      "suppliers",
      "shifts",
      "drops",
      "orders",
      "movements",
      "refunds",
      "books",
      "monthAggs",
      "monthMark",
      "monthSheets",
      "staff",
      "roster",
      "payouts",
      "ticket",
      "payMethod",
    ] as const;

    const loggedProductIds = new Set<string>();
    let seededLog = false;
    const persist = (immediate: boolean) => {
      const run = () => {
        const snap = prunePayload(snapshotKiosk(useImanStore.getState()));
        const json = JSON.stringify(snap);
        if (json === last) return;
        last = json;
        if (!seededLog) {
          seededLog = true;
          for (const p of snap.products) loggedProductIds.add(p.id);
        } else {
          const catalogChanged = snap.products.some((p) => !loggedProductIds.has(p.id));
          if (catalogChanged) {
            for (const p of snap.products) loggedProductIds.add(p.id);
            void appendSyncLog(activeStoreId, {
              kind: "catalog",
              title: "Catálogo",
              detail: "sube al sincronizar",
              status: "pending",
            }).catch(() => {});
          }
        }
        const name = snap.settings.name.trim();
        if (name) {
          setStores((prev) =>
            prev.map((s) => (s.id === activeStoreId ? { ...s, name } : s)),
          );
        }
        void saveLocalSnapshot(activeStoreId, snap).catch(() => {});
        // La cinta sube sola. La fotocopia no (invariante 6): sube con
        // Sincronizar, al cerrar el turno y al cerrar la app. Si subiera en cada
        // cambio, el botón sería decorativo y las fotocopias se pisarían.
        if (isBrowserOnline()) void pushQuiet(activeStoreId).catch(() => {});
      };
      window.clearTimeout(t);
      if (immediate) {
        run();
        // Al cerrar o esconder la app, si cambió algo desde la última vez.
        if (last !== subido) {
          subido = last;
          void backupOnHide(activeStoreId).catch(() => {});
        }
        return;
      }
      t = window.setTimeout(run, 400);
    };

    const unsub = useImanStore.subscribe((next, prev) => {
      if (DATA.every((k) => next[k] === prev[k])) return;
      persist(false);
    });
    const onHide = () => persist(true);
    window.addEventListener("pagehide", onHide);
    const onVis = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      unsub();
      window.clearTimeout(t);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId, hydrated, gate, activeStoreId, localReady]);

  useEffect(() => {
    const flush = () => {
      if (!isBrowserOnline()) return;
      void flushDeskOutbox().catch(() => {});
      // La fotocopia pendiente se vuelve a armar con el store: antes de tener
      // el local, subiría otra cosa.
      if (gate === "desk" && activeStoreId && localReady) {
        void flushCopy(activeStoreId).catch(() => {});
        void pushQuiet(activeStoreId).catch(() => {});
      }
    };
    window.addEventListener("online", flush);
    if (isBrowserOnline()) flush();
    return () => window.removeEventListener("online", flush);
  }, [gate, activeStoreId, localReady]);

  useEffect(() => {
    if (gate !== "desk" || !localReady || !activeStoreId) return;
    const save = (name: string) => {
      if (name) rememberLocalName(activeStoreId, name);
    };
    save(useImanStore.getState().settings.name);
    return useImanStore.subscribe((s, prev) => {
      if (s.settings.name !== prev.settings.name) save(s.settings.name);
    });
  }, [gate, localReady, activeStoreId]);

  // Nunca se abre un local con datos que no son suyos. Sin copia en el aparato
  // se espera la fotocopia del servidor; si tampoco llega, se avisa.
  function noCopyOnDevice() {
    noCopyHere.current = true;
    if (!isBrowserOnline() || noCopyRemote.current) setOpenFailed(true);
  }
  function noCopyOnServer() {
    noCopyRemote.current = true;
    if (noCopyHere.current) setOpenFailed(true);
  }

  // Si nada contesta (IndexedDB trabado, la red colgada), tampoco se queda
  // girando para siempre.
  useEffect(() => {
    if (localReady || openFailed || gate !== "desk") return;
    const t = window.setTimeout(() => setOpenFailed(true), 12_000);
    return () => window.clearTimeout(t);
  }, [localReady, openFailed, gate]);

  function applyBundle(bundle: AccountBundle, nextGate: Gate) {
    setStores(bundle.stores);
    setActiveStoreId(bundle.activeStoreId);
    void writeBlobRev(bundle.activeStoreId, bundle.rev);
    hydrateKiosk(bundle.payload);
    setGate(nextGate);
  }

  async function enterLocal(id: string) {
    setActiveLocalStore(id);
    setLocalReady(false);
    setOpening(stores.find((s) => s.id === id)?.name || "el local");
    try {
      const local = await loadLocalSnapshot(id);
      if (local) hydrateKiosk(local);
      if (!isBrowserOnline()) {
        if (local) {
          setActiveStoreId(id);
          setLocalReady(true);
          setGate("desk");
          toast("Sin red. Abrimos la copia de este aparato.");
          return;
        }
        toast.error("Sin red. Este aparato no tiene una copia de ese local.");
        return;
      }
      const bundle = await selectStore({ data: { storeId: id } });
      const payload = localHasCopy(local)
        ? mergePayload(bundle.payload, local!)
        : bundle.payload;
      setStores(bundle.stores);
      setActiveStoreId(bundle.activeStoreId);
      void writeBlobRev(bundle.activeStoreId, bundle.rev);
      if (!localHasCopy(local)) await startFromCopy(bundle.activeStoreId, bundle.payload);
      hydrateKiosk(payload, { restore: !localHasCopy(local) });
      setLocalReady(true);
      setGate("desk");
      void saveLocalSnapshot(id, payload);
    } catch (err) {
      const local = await loadLocalSnapshot(id);
      if (local) {
        setActiveStoreId(id);
        hydrateKiosk(local);
        setLocalReady(true);
        setGate("desk");
        toast("Sin red. Abrimos la copia de este aparato.");
        return;
      }
      console.error("[stores] enter", err);
      toast.error(errorText(err, "No se pudo abrir el local"));
    } finally {
      setOpening(null);
    }
  }

  const boot = decideFloorBoot({
    mounted,
    authPending: isPending,
    userId,
    floorLock: lock,
  });

  const updateBar = pwaUpdate ? (
    <button
      type="button"
      className="fixed inset-x-0 top-0 z-[80] bg-accent px-4 py-3 text-center text-sm font-medium text-accent-fg"
      onClick={applyPwaUpdate}
    >
      Hay una versión nueva. Tocá para actualizar.
    </button>
  ) : null;

  if (boot === "boot")
    return (
      <>
        {updateBar}
        <OpeningScreen beforeJs />
      </>
    );
  if (boot === "landing" || (authFail && !lock))
    return (
      <>
        {updateBar}
        <LandingScreen />
      </>
    );
  if (pullError && !lock) {
    return (
      <>
        {updateBar}
      <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
        <div className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <p className="font-display text-2xl tracking-tight">IMAN</p>
          <p className="mt-3 text-sm text-danger">{pullError}</p>
          <p className="mt-2 text-sm text-muted">No abrimos un inventario vacío. Reintentá cuando haya red.</p>
          <button
            type="button"
            className="mt-5 w-full rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-fg"
            onClick={() => {
              setPullError(null);
              setHydrated(false);
              window.location.reload();
            }}
          >
            Reintentar
          </button>
        </div>
      </main>
      </>
    );
  }
  if (authEnabled && (!hydrated || !access))
    return (
      <>
        {updateBar}
        <OpeningScreen />
      </>
    );
  if (!access)
    return (
      <>
        {updateBar}
        <OpeningScreen />
      </>
    );

  const onFloor = gate === "desk" || Boolean(lock) || floor;
  const licensed =
    Boolean(access.license?.active) ||
    Boolean(access.trial?.active) ||
    access.isVendor ||
    onFloor;
  const planSeats = access.seatsAllowed ?? 1;
  const remaining = Math.max(0, planSeats - stores.length);
  const mustRegister = licensed && stores.length === 0 && !access.isVendor;
  const showWizard =
    gate !== "desk" && !access.isVendor && (mustRegister || (gate === "wizard" && remaining > 0));

  return (
    <>
      {updateBar}
      {!licensed ? (
        <ActivateScreen access={access} onAccess={setAccess} />
      ) : showWizard ? (
        <LocalsWizard
          seats={planSeats}
          existing={stores}
          onDone={(b) => applyBundle(b, "hub")}
          onSkip={stores.length ? () => setGate("hub") : undefined}
        />
      ) : gate === "activate" ? (
        <ActivateScreen
          access={access}
          onAccess={(next) => {
            setAccess(next);
            setGate("hub");
          }}
        />
      ) : gate === "desk" && !localReady && openFailed ? (
        <main className="fixed inset-0 grid place-items-center bg-[#14130f] px-4 text-[#ebe4d4]">
          <div className="w-full max-w-sm text-center">
            <p className="text-base">No pude abrir el local. Probá de nuevo.</p>
            <button
              type="button"
              className="mt-5 w-full rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-fg"
              onClick={() => window.location.reload()}
            >
              Reintentar
            </button>
          </div>
        </main>
      ) : gate === "desk" && !localReady ? (
        <OpeningScreen name={recallLocalName(activeStoreId)} />
      ) : gate === "desk" ? (
        <Shell
          access={access}
          stores={stores}
          activeStoreId={activeStoreId}
          seats={planSeats}
          onStores={setStores}
          onActiveStore={setActiveStoreId}
          onLeave={() => setGate("hub")}
          onStudio={
            access.isVendor
              ? () => {
                  void navigate({ to: "/estudio" });
                }
              : undefined
          }
        />
      ) : (
        <>
          <HubScreen
            access={access}
            stores={stores}
            remaining={remaining}
            onEnter={(id) => void enterLocal(id)}
            onActivate={() => setGate("activate")}
            onRegisterMore={() => setGate("wizard")}
            onStudio={
              access.isVendor
                ? () => {
                    void navigate({ to: "/estudio" });
                  }
                : undefined
            }
          />
          {/* Encima del hub: los primeros 300 ms es transparente y el hub queda a la vista. */}
          {opening ? <OpeningScreen name={opening} /> : null}
        </>
      )}
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
