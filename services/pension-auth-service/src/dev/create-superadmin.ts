import 'reflect-metadata';
import { config } from '../config';
import { AppDataSource } from '../config/datasource';
import { UserEntity } from '../entities/user.entity';
import { AUDIT, writeAudit } from '../lib/audit';
import { registerServiceName } from '../lib/internal-call';
import { last4 } from '../lib/mask';
import { ROLE } from '../lib/permission-codes';
import { blindIndex, nameBlindIndexes } from '../lib/pii';
import { mobile as mobileSchema, personName, userCode as userCodeSchema } from '../lib/validators';
import { generateTemporaryPassword, hashPassword } from '../services/password.service';

/**
 * Creates the FIRST Super Admin of an environment (docs/DEPLOYMENT.md §4). Run once by the operator:
 *
 *   node dist/dev/create-superadmin.js <user_code> <mobile> "<Full Name>"          (in the image, as a Job)
 *   npm run superadmin:create -- <user_code> <mobile> "<Full Name>"               (locally)
 *
 * Prints a temporary password ONCE. The account must change it (with an SMS OTP) at first login and
 * enrol TOTP. Refuses when a Super Admin already exists: further admins are created in the UI.
 */
const main = async () => {
  const [rawCode, rawMobile, rawName] = process.argv.slice(2);
  const cfg = config();
  if (!cfg.DB_ALLOW_MIGRATIONS) throw new Error('refusing: DB_ALLOW_MIGRATIONS is not true');
  const userCode = userCodeSchema.parse(rawCode ?? '');
  const mobile = mobileSchema.parse(rawMobile ?? '');
  const fullName = personName.parse(rawName ?? '');
  registerServiceName('pension-auth-service');
  await AppDataSource.initialize();

  const existing = (await AppDataSource.query(
    `SELECT count(*)::int AS n FROM pension_auth.user_roles a JOIN pension_auth.roles r ON r.id = a.role_id WHERE r.code = $1 AND a.is_active`,
    [ROLE.SUPER_ADMIN],
  )) as { n: number }[];
  if ((existing[0]?.n ?? 0) > 0) throw new Error('a Super Admin already exists; create further admins in the portal');

  const temporary = generateTemporaryPassword();
  const hash = await hashPassword(temporary);
  await AppDataSource.transaction(async (em) => {
    const u = await em.getRepository(UserEntity).save(
      em.getRepository(UserEntity).create({
        userCode,
        fullName,
        fullNameTokens: nameBlindIndexes(fullName),
        mobile,
        mobileLookup: blindIndex(mobile),
        mobileLast4: last4(mobile) ?? '',
        email: null,
        emailLookup: null,
        passwordHash: hash,
        previousPasswordHashes: [],
        mustChangePassword: true,
        mfaEnabled: false,
        failedLoginCount: 0,
        isActive: true,
      }),
    );
    await em.query('INSERT INTO pension_auth.user_roles (user_id, role_id) SELECT $1, id FROM pension_auth.roles WHERE code = $2', [u.id, ROLE.SUPER_ADMIN]);
    await writeAudit(em, { action: AUDIT.USER_CREATED, actorUserId: null, entityType: 'user', entityId: u.id, data: { user_code: userCode, via: 'create-superadmin' } });
  });
  console.log(`Super Admin "${userCode}" created. Temporary password (shown once, change at first login): ${temporary}`);
  await AppDataSource.destroy();
};

main().catch((err) => {
  console.error(`create-superadmin error: ${(err as Error).message}`);
  process.exit(1);
});
