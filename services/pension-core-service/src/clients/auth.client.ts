import { internalCall } from '../lib/internal-call';

/**
 * What core-service needs from auth-service, always over /internal with a service token
 * (docs/ARCHITECTURE.md §4). Masters change rarely, so they are cached for 5 minutes.
 */
export interface CenterRef {
  id: string;
  code: string;
  name_en: string;
  name_hi: string | null;
  district_id: string;
  is_active: boolean;
  soch_facility_code: string | null;
}

export interface DistrictRef {
  id: string;
  lgd_code: number;
  code: string;
  name_en: string;
  name_hi: string;
}

const TTL_MS = 5 * 60_000;
let centers: { at: number; rows: CenterRef[] } | null = null;
let districts: { at: number; rows: DistrictRef[] } | null = null;

export const authClient = {
  rolePermissions: (roleId: string): Promise<string[]> => internalCall<string[]>('auth', `/internal/roles/${encodeURIComponent(roleId)}/permissions`),

  async centers(): Promise<CenterRef[]> {
    if (!centers || Date.now() - centers.at > TTL_MS) centers = { at: Date.now(), rows: await internalCall<CenterRef[]>('auth', '/internal/centers') };
    return centers.rows;
  },

  async districts(): Promise<DistrictRef[]> {
    if (!districts || Date.now() - districts.at > TTL_MS) districts = { at: Date.now(), rows: await internalCall<DistrictRef[]>('auth', '/internal/districts') };
    return districts.rows;
  },

  clearCache(): void {
    centers = null;
    districts = null;
  },
};
