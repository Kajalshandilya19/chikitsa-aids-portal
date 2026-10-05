import { z } from 'zod';
import { boolQuery, centerCode, centerType, englishLabel, hindiText, lgdCode, optional, pageQuery, searchText, sochBeneficiaryId, uuid } from '../lib/validators';

/** Districts and Centers (docs/API_AUTH.md §4). */

export const districtListQuery = z.object({ is_active: boolQuery.optional() }).strict();

export const districtPatchSchema = z
  .object({ name_hi: hindiText.optional(), is_active: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type DistrictPatch = z.infer<typeof districtPatchSchema>;

/** Sort keys to TypeORM PROPERTY paths (not column names: with skip/take + joins TypeORM needs properties). */
export const CENTER_SORT = { code: 'c.code', name_en: 'c.nameEn', district: 'd.nameEn' } as const;

export const centerListQuery = z
  .object({
    q: searchText.optional(),
    district_id: uuid.optional(),
    is_active: boolQuery.optional(),
    sort: z.enum(['code', 'name_en', 'district']).optional(),
    dir: z.enum(['asc', 'desc']).optional(),
    ...pageQuery,
  })
  .strict();
export type CenterListQuery = z.infer<typeof centerListQuery>;

/** SOCH Facility Code uses the SOCH identifier rule (V-025). */
const sochFacilityCode = sochBeneficiaryId;

export const centerCreateSchema = z
  .object({
    code: centerCode,
    name_en: englishLabel,
    name_hi: optional(hindiText).optional(),
    district_id: uuid,
    center_type: centerType,
    soch_facility_code: optional(sochFacilityCode).optional(),
  })
  .strict();
export type CenterCreate = z.infer<typeof centerCreateSchema>;

export const centerPatchSchema = z
  .object({
    name_en: englishLabel.optional(),
    name_hi: optional(hindiText).optional(),
    district_id: uuid.optional(),
    center_type: centerType.optional(),
    soch_facility_code: optional(sochFacilityCode).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type CenterPatch = z.infer<typeof centerPatchSchema>;

/** One row of the internal upsert used by the data-service Center import. */
export const centerUpsertRow = z
  .object({
    code: centerCode,
    name_en: englishLabel,
    name_hi: optional(hindiText).optional(),
    district_lgd_code: lgdCode,
    center_type: centerType,
    soch_facility_code: optional(sochFacilityCode).optional(),
  })
  .strict();
export type CenterUpsertRow = z.infer<typeof centerUpsertRow>;

export const centerUpsertBatchSchema = z
  .object({
    actor_user_id: uuid,
    rows: z.array(centerUpsertRow).min(1).max(500),
  })
  .strict();
export type CenterUpsertBatch = z.infer<typeof centerUpsertBatchSchema>;

export const idParams = z.object({ id: uuid }).strict();
