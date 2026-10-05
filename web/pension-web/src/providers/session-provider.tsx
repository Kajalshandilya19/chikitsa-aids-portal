"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Me } from "@/lib/api-types";
import type { PermissionCode } from "@/lib/shared/permission-codes";

interface SessionValue {
  user: Me;
  /**
   * Any-of check against the active role's permissions. UX only: it hides what the user cannot
   * use. Every service checks the same permission again on every request.
   */
  can: (...codes: readonly PermissionCode[]) => boolean;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ user, children }: { user: Me; children: ReactNode }) {
  const value = useMemo<SessionValue>(() => {
    const set = new Set(user.permissions);
    return { user, can: (...codes) => codes.some((c) => set.has(c)) };
  }, [user]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = (): SessionValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
};
