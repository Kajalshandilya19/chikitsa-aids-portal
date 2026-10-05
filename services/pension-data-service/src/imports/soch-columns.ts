import type { ImportColumn } from './types';

/**
 * SOCH beneficiary export: the column dictionary (docs/SOCH_IMPORT_SPEC.md).
 *
 * PLACEHOLDER until a real SOCH export is seen (docs/OPEN_QUESTIONS.md Q-01): the headers follow the
 * field list in the SRD §3. Phase 1 builds importers/soch.importer.ts on top of THIS list; when the real
 * headers are known, change `header` here (and only here) and regenerate the fixture.
 *
 * Every field names its validation rule; 🔒 marks personal data that core-service stores encrypted.
 */
export const SOCH_COLUMNS: readonly (ImportColumn & { rule: string; pii: boolean })[] = [
  { header: 'Beneficiary ID', field: 'soch_beneficiary_id', required: true, rule: 'V-025', pii: true, hint: 'SOCH beneficiary id', example: 'B0000123' },
  { header: 'UID', field: 'soch_uid', required: true, rule: 'V-021', pii: true, hint: 'SOCH UID (match key 1)', example: 'RJUID0000123' },
  { header: 'ART Registration Date', field: 'art_registration_date', required: false, rule: 'V-016', pii: false, hint: 'YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY', example: '2015-06-30' },
  { header: 'Pre ART Number', field: 'pre_art_number', required: false, rule: 'V-023', pii: true, hint: '', example: 'PREART/RJ001/0001' },
  { header: 'ART Registration Number', field: 'art_number', required: false, rule: 'V-022', pii: true, hint: 'changes on transfer; never a key', example: 'ART/RJ001/2015/0001' },
  { header: 'PID Number', field: 'pid_number', required: false, rule: 'V-024', pii: true, hint: 'match key 2', example: 'PID00000000000000000123' },
  { header: 'Patient Name', field: 'patient_name', required: true, rule: 'V-001', pii: true, hint: '', example: 'Asha Devi' },
  { header: 'Complete Address', field: 'address', required: false, rule: 'V-013', pii: true, hint: '', example: 'Ward 4, Near Bus Stand' },
  { header: 'Taluk/Tehsil', field: 'tehsil', required: false, rule: 'V-038', pii: false, hint: '', example: 'Kishangarh' },
  { header: 'District', field: 'district_name', required: false, rule: 'V-038', pii: false, hint: 'informational; the Center decides the district', example: 'Ajmer' },
  { header: 'State', field: 'state_name', required: false, rule: 'V-038', pii: false, hint: 'informational', example: 'Rajasthan' },
  { header: 'Contact Number', field: 'contact_number', required: false, rule: 'V-004', pii: true, hint: '', example: '' },
  { header: 'Aadhaar Number', field: 'aadhaar', required: false, rule: 'V-007', pii: true, hint: '', example: '' },
  { header: 'Age', field: 'age', required: false, rule: 'V-017', pii: true, hint: '', example: '45' },
  { header: 'Sex', field: 'sex', required: true, rule: 'V-018', pii: true, hint: 'M / F / TG, or Male / Female / Transgender', example: 'F' },
  { header: 'ART Status', field: 'art_status', required: false, rule: 'V-039', pii: true, hint: 'SOCH wording, mapped by sochArtStatus()', example: 'On ART' },
  { header: 'Date of Last Visit', field: 'last_visit_date', required: false, rule: 'V-016', pii: true, hint: 'YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY', example: '2026-08-14' },
  { header: 'Facility Name', field: 'facility_name', required: false, rule: 'V-038', pii: false, hint: 'informational', example: 'ART Centre Ajmer' },
  { header: 'Facility Code', field: 'facility_code', required: true, rule: 'V-025', pii: false, hint: 'maps to the Center (SOCH facility code, else Center code)', example: 'RJ001' },
  { header: 'ABHA', field: 'abha_number', required: false, rule: 'V-026', pii: true, hint: '14 digits', example: '' },
];

/** SOCH sex spellings to V-018 values. Unknown spellings return null (row error). */
export const sochSex = (v: string): 'MALE' | 'FEMALE' | 'TRANSGENDER' | null => {
  const s = v.trim().toUpperCase();
  if (['M', 'MALE'].includes(s)) return 'MALE';
  if (['F', 'FEMALE'].includes(s)) return 'FEMALE';
  if (['TG', 'TS', 'T', 'TRANSGENDER', 'TRANS GENDER', 'H/TG'].includes(s)) return 'TRANSGENDER';
  return null;
};

/** SOCH ART status wording (NACO ART guidelines 2021 §3.1.3) to V-039 values. */
const ART_STATUS: Readonly<Record<string, string>> = {
  'ON ART': 'ON_ART',
  MIS: 'MISSED',
  MISSED: 'MISSED',
  LFU: 'ON_ART_LFU',
  'ON ART LFU': 'ON_ART_LFU',
  'PRE ART LFU': 'PRE_ART_LFU',
  'PRE-ART LFU': 'PRE_ART_LFU',
  'OPTED OUT': 'OPTED_OUT',
  'STOPPED TREATMENT': 'STOPPED',
  STOPPED: 'STOPPED',
  DIED: 'DIED',
  DEATH: 'DIED',
  DEAD: 'DIED',
  'TRANSFERRED OUT': 'TRANSFERRED_OUT',
  TO: 'TRANSFERRED_OUT',
  'TRANSFERRED IN': 'TRANSFERRED_IN',
  TI: 'TRANSFERRED_IN',
  'IN TRANSIT': 'IN_TRANSIT',
  'LINKED OUT': 'LINKED_OUT',
};
export const sochArtStatus = (v: string): string | null => ART_STATUS[v.trim().toUpperCase().replace(/\s+/g, ' ')] ?? null;

/** DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY or YYYY-MM-DD to YYYY-MM-DD (then checked by V-016). */
export const sochDate = (v: string): string => {
  const s = v.trim();
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  return s;
};
