"use client";

import { useQuery } from "@tanstack/react-query";

import type { Center, District, Role } from "@/lib/api-types";
import { api, gw } from "@/lib/client/api";
import { P } from "@/lib/shared/permission-codes";
import { searchText } from "@/lib/shared/validators";
import { useSession } from "@/providers/session-provider";

/** All 41 districts (no paging). Only fetched when the role may see them. */
export function useDistricts() {
  const { can } = useSession();
  return useQuery({
    queryKey: ["districts"],
    queryFn: () => api.get<District[]>(gw("auth", "districts")),
    enabled: can(P.MASTER_DISTRICT_VIEW),
    staleTime: 5 * 60_000,
  });
}

/** The role catalogue (also the source of the "assignable" roles for user creation). */
export function useRoles() {
  const { can } = useSession();
  return useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<Role[]>(gw("auth", "roles")),
    enabled: can(P.ROLE_CATALOGUE_VIEW, P.USER_ASSIGNMENT_MANAGE),
    staleTime: 60_000,
  });
}

/** Active Centers matching a search (code or name), first 20, for pickers. */
export function useCenterSearch(q: string, enabled = true) {
  const { can } = useSession();
  return useQuery({
    queryKey: ["center-search", q],
    // Only text the service accepts as `q` (V-030) is sent; anything else lists the first 20.
    queryFn: () => api.get<Center[]>(gw("auth", "centers"), { q: q && searchText.safeParse(q).success ? q : undefined, is_active: "true", limit: 20, page: 1, sort: "code", dir: "asc" }),
    enabled: enabled && can(P.MASTER_CENTER_VIEW),
    staleTime: 30_000,
  });
}
