"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// A dynamic label for the LAST breadcrumb crumb on a detail page (e.g. the patient name on a bill).
// The DashboardHeader renders static crumbs from the route config; a detail page can override its
// final crumb's text via useSetBreadcrumb(...). The header reads it through useBreadcrumbLabel().
type Label = string | string[] | null;
type BreadcrumbCtx = { label: Label; setLabel: (l: Label) => void };
const Ctx = createContext<BreadcrumbCtx>({ label: null, setLabel: () => {} });

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<Label>(null);
  return <Ctx.Provider value={{ label, setLabel }}>{children}</Ctx.Provider>;
}

export const useBreadcrumbLabel = (): Label => useContext(Ctx).label;

// Detail pages call this with their dynamic title (e.g. the patient name). It is cleared
// automatically when the page unmounts, so other pages fall back to their static crumb.
/** A string replaces the last crumb; an array replaces that many trailing crumbs. */
export function useSetBreadcrumb(label: string | string[] | null | undefined): void {
  const { setLabel } = useContext(Ctx);
  const key = Array.isArray(label) ? label.join("\u0000") : (label ?? "");
  useEffect(() => {
    setLabel(Array.isArray(label) ? label : label || null);
    return () => setLabel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setLabel]);
}
