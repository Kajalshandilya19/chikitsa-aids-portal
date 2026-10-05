"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Show a toast once the page has mounted. A toast fired during the first render (or in the first
 * effect pass) is dropped: <Toaster/> subscribes after the app subtree. So wait a tick.
 */
export function useMountToast(message: string | null, kind: "success" | "info" | "error" = "success"): void {
  const shown = useRef(false);
  useEffect(() => {
    if (!message || shown.current) return;
    shown.current = true;
    const timer = window.setTimeout(() => toast[kind](message), 60);
    return () => window.clearTimeout(timer);
  }, [message, kind]);
}
