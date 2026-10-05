import { z } from 'zod';
import { P } from '../../lib/permission-codes';
import { centerCode, centerType, englishLabel, hindiText, lgdCode, optional, sochBeneficiaryId } from '../../lib/validators';
import { authClient } from '../../clients/auth.client';
import type { Classified, ImportColumn, Importer } from '../types';

/**
 * Center master import (docs/API_DATA.md §4). Commits into auth-service /internal/centers/upsert-batch.
 * Same code = update of that Center (and clears its placeholder flag); a new code = a new Center.
 */
const columns: readonly ImportColumn[] = [
  { header: 'Center Code', field: 'code', required: true, hint: 'V-003: 3 to 16 letters, digits or hyphen, starting with a letter. Example RJ001.', example: 'RJ001' },
  { header: 'Center Name', field: 'name_en', required: true, hint: 'V-038: English letters, digits, spaces and . , ( ) \' / & -', example: 'ART Centre, JLN Medical College Hospital' },
  { header: 'Center Name (Hindi)', field: 'name_hi', required: false, hint: 'V-035: Devanagari text. Optional.', example: 'एआरटी केंद्र, जेएलएन चिकित्सा महाविद्यालय' },
  { header: 'District LGD Code', field: 'district_lgd_code', required: true, hint: 'V-027: the district LGD code (Masters > Districts lists them).', example: '86' },
  { header: 'Center Type', field: 'center_type', required: true, hint: 'V-040: ART, LAC, COE or OTHER.', example: 'ART' },
  { header: 'SOCH Facility Code', field: 'soch_facility_code', required: false, hint: 'V-025: the facility code used in SOCH exports. Optional.', example: '' },
];

const rowSchema = z
  .object({
    code: centerCode,
    name_en: englishLabel,
    name_hi: optional(hindiText).optional(),
    district_lgd_code: lgdCode,
    center_type: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), centerType),
    soch_facility_code: optional(sochBeneficiaryId).optional(),
  })
  .strict();
export type CenterRow = z.infer<typeof rowSchema>;

export const centersImporter: Importer<CenterRow> = {
  kind: 'centers',
  uploadPermission: P.IMPORT_CENTER_UPLOAD,
  commitPermission: P.IMPORT_CENTER_COMMIT,
  columns,
  rowSchema,
  keyField: 'code',

  async classify(rows) {
    const [centers, districts] = await Promise.all([authClient.centers(), authClient.districts()]);
    const byCode = new Map(centers.map((c) => [c.code, c]));
    const bySoch = new Map(centers.filter((c) => c.soch_facility_code).map((c) => [c.soch_facility_code as string, c.code]));
    const districtByLgd = new Map(districts.map((d) => [d.lgd_code, d]));
    const sochInFile = new Map<string, string>();
    return rows.map((r): Classified => {
      const errors: Classified['errors'] = [];
      const d = districtByLgd.get(r.district_lgd_code);
      if (!d) errors.push({ field: 'district_lgd_code', rule: 'V-027', message: 'Unknown district LGD code' });
      if (r.soch_facility_code) {
        const owner = bySoch.get(r.soch_facility_code);
        if (owner && owner !== r.code) errors.push({ field: 'soch_facility_code', rule: 'BR-M2', message: 'This SOCH facility code already belongs to another Center' });
        const seen = sochInFile.get(r.soch_facility_code);
        if (seen && seen !== r.code) errors.push({ field: 'soch_facility_code', rule: 'BR-M2', message: 'This SOCH facility code appears for two Centers in the file' });
        sochInFile.set(r.soch_facility_code, r.code);
      }
      if (errors.length) return { errors };
      const existing = byCode.get(r.code);
      if (!existing) return { action: 'CREATE' };
      const same =
        existing.name_en === r.name_en &&
        (existing.name_hi ?? null) === (r.name_hi ?? null) &&
        existing.district_id === d?.id &&
        existing.center_type === r.center_type &&
        (existing.soch_facility_code ?? null) === (r.soch_facility_code ?? null);
      return { action: same ? 'UNCHANGED' : 'UPDATE' };
    });
  },

  async commit(rows, actorUserId) {
    return authClient.upsertCenters(
      actorUserId,
      rows.map((r) => ({ ...r, name_hi: r.name_hi ?? null, soch_facility_code: r.soch_facility_code ?? null })),
    );
  },
};
