import { internalCall } from '../lib/internal-call';

/** What data-service needs from auth-service, over /internal with a service token. Never cached here:
 * an import validates against the masters as they are at upload and at commit time. */
export interface CenterRef {
  id: string;
  code: string;
  name_en: string;
  name_hi: string | null;
  center_type: string;
  soch_facility_code: string | null;
  is_active: boolean;
  district_id: string;
}

export interface DistrictRef {
  id: string;
  lgd_code: number;
  code: string;
  name_en: string;
}

export const authClient = {
  rolePermissions: (roleId: string): Promise<string[]> => internalCall<string[]>('auth', `/internal/roles/${encodeURIComponent(roleId)}/permissions`),
  centers: (): Promise<CenterRef[]> => internalCall<CenterRef[]>('auth', '/internal/centers'),
  districts: (): Promise<DistrictRef[]> => internalCall<DistrictRef[]>('auth', '/internal/districts'),
  upsertCenters: (actorUserId: string, rows: unknown[]) =>
    internalCall<{ created: number; updated: number; unchanged: number }>('auth', '/internal/centers/upsert-batch', {
      method: 'POST',
      body: { actor_user_id: actorUserId, rows },
      timeoutMs: 60_000,
    }),
};
