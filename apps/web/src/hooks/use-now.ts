"use client";

import { useEffect, useState } from "react";

/** Relógio que atualiza a cada `intervalMs`, para comparações com "agora" durante o render. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
