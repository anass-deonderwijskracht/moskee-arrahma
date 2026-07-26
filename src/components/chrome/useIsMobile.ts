import { useEffect, useState } from "react";

/** Breekpunt waarop de app naar de mobiele opmaak schakelt — gelijk aan de CSS. */
export const MOBILE_QUERY = "(max-width: 900px)";

/** True zolang het scherm op het mobiele breekpunt zit. Spiegelt de @media-regel. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}
