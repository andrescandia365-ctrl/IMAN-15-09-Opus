import { useEffect, useRef } from "react";

/** Pointer drag after ~10px so a tap/click still fires. Starts on the header and body, including idle inputs. */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false;
    let dragged = false;
    let startX = 0;
    let startY = 0;
    let sl = 0;
    let st = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const hit = e.target as HTMLElement | null;
      if (hit?.closest("button, select, a, [role='button']")) return;
      const field = hit?.closest("input, textarea");
      if (field && document.activeElement === field) return;
      down = true;
      dragged = false;
      startX = e.clientX;
      startY = e.clientY;
      sl = el.scrollLeft;
      st = el.scrollTop;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragged && Math.hypot(dx, dy) < 10) return;
      dragged = true;
      const active = document.activeElement;
      if (active instanceof HTMLElement && el.contains(active)) active.blur();
      el.scrollLeft = sl - dx;
      el.scrollTop = st - dy;
      e.preventDefault();
    };
    const onUp = () => {
      down = false;
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return ref;
}
