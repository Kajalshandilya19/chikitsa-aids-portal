import { DISTRICTS } from './districts';

/**
 * PLACEHOLDER Center list: one ART Centre per district, codes RJ001..RJ041 in LGD order.
 *
 * These are NOT the real RSACS Center codes (docs/OPEN_QUESTIONS.md Q-04). The NAME is kept plain
 * ("ART Centre, Ajmer") because it is shown on the login screen; the placeholder status lives in the
 * is_placeholder column and the "Placeholder" badge on the Centers screen. They exist so logins, scoping
 * and imports can be built and tested. Each row is stored with is_placeholder = true. Replace them by
 * importing the RSACS list through Masters > Centers > Bulk Import (docs/SEED_DATA.md §3): a row with
 * the same code updates the placeholder and clears the flag.
 */
export interface CenterSeed {
  code: string;
  nameEn: string;
  nameHi: string;
  districtLgdCode: number;
}

export const PLACEHOLDER_CENTERS: readonly CenterSeed[] = DISTRICTS.map((d, i) => ({
  code: `RJ${String(i + 1).padStart(3, '0')}`,
  nameEn: `ART Centre, ${d.nameEn}`,
  nameHi: `एआरटी केंद्र, ${d.nameHi}`,
  districtLgdCode: d.lgdCode,
}));
