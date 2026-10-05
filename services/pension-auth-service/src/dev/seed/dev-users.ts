import { ROLE, type RoleCode } from '../../lib/permission-codes';

/**
 * LOCAL-ONLY dev users, one per role (docs/SEED_DATA.md §5). Created by `npm run seed` only when
 * APP_ENV=local and DEV_USER_PASSWORD is set; the seed refuses otherwise. All share DEV_USER_PASSWORD
 * from env/local.env and do not have to change it.
 *
 * Names and mobiles are fictitious. Mobiles use the 90000 000xx range, which is not issued to anyone.
 * Places: centers RJ001 (Ajmer) and RJ002 (Alwar) so scope tests have two Centers in two districts.
 */
export interface DevUserSeed {
  userCode: string;
  fullName: string;
  mobile: string;
  role: RoleCode;
  districtLgdCode?: number;
  centerCode?: string;
}

export const DEV_USERS: readonly DevUserSeed[] = [
  { userCode: 'superadmin', fullName: 'Dev Super Admin', mobile: '9000000001', role: ROLE.SUPER_ADMIN },
  { userCode: 'stateadmin', fullName: 'Dev State Admin', mobile: '9000000002', role: ROLE.STATE_ADMIN },
  { userCode: 'verifier', fullName: 'Dev State Verifier', mobile: '9000000003', role: ROLE.STATE_VERIFIER },
  { userCode: 'approver', fullName: 'Dev State Approver', mobile: '9000000004', role: ROLE.STATE_APPROVER },
  { userCode: 'auditor', fullName: 'Dev Auditor', mobile: '9000000005', role: ROLE.AUDITOR },
  { userCode: 'dapcu.ajmer', fullName: 'Dev District Officer Ajmer', mobile: '9000000006', role: ROLE.DISTRICT_OFFICER, districtLgdCode: 86 },
  { userCode: 'incharge.rj001', fullName: 'Dev Incharge RJ001', mobile: '9000000007', role: ROLE.CENTER_INCHARGE, centerCode: 'RJ001' },
  { userCode: 'worker.rj001', fullName: 'Dev Worker RJ001', mobile: '9000000008', role: ROLE.CENTER_WORKER, centerCode: 'RJ001' },
  { userCode: 'worker.rj002', fullName: 'Dev Worker RJ002', mobile: '9000000009', role: ROLE.CENTER_WORKER, centerCode: 'RJ002' },
];
