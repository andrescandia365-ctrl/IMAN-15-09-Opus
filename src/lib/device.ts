import { useEffect, useState } from "react";

export function isPhoneUi(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 639px)").matches;
}

/**
 * Arranca sabiendo el ancho: si arrancaba en false, el celu pintaba un cuadro
 * del Mostrador de la PC (con el buscador enfocado) antes de pasar a Vender.
 */
export function usePhoneUi(): boolean {
  const [phone, setPhone] = useState(isPhoneUi);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const go = () => setPhone(mq.matches);
    go();
    mq.addEventListener("change", go);
    return () => mq.removeEventListener("change", go);
  }, []);
  return phone;
}
