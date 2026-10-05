import 'reflect-metadata';
import { config } from '../config';
import { AppDataSource } from '../config/datasource';
import { syncRbacCatalogue } from '../domain/rbac-sync';
import { last4 } from '../lib/mask';
import { blindIndex, nameBlindIndexes } from '../lib/pii';
import { hashPassword } from '../services/password.service';
import { UserEntity } from '../entities/user.entity';
import { PLACEHOLDER_CENTERS } from './seed/centers';
import { DEV_USERS } from './seed/dev-users';
import { DISTRICTS } from './seed/districts';

/**
 * `npm run seed` (scripts/dev.sh seed). Idempotent: safe to run after every migration.
 *   1. RBAC catalogue + role templates          (every environment)
 *   2. 41 districts                             (every environment; existing rows keep their edits)
 *   3. placeholder Centers RJ001..RJ041         (every environment, ONLY when no Center exists yet)
 *   4. dev users, one per role                  (APP_ENV=local only)
 */
const main = async () => {
  const cfg = config();
  if (!cfg.DB_ALLOW_MIGRATIONS) throw new Error('refusing to seed: DB_ALLOW_MIGRATIONS is not true');
  await AppDataSource.initialize();

  await AppDataSource.transaction(async (em) => {
    const r = await syncRbacCatalogue(em);
    console.log(`rbac: ${r.permissions} permissions (${r.pruned} pruned), ${r.roles} roles`);

    for (const d of DISTRICTS) {
      await em.query(
        `INSERT INTO pension_auth.districts (lgd_code, code, name_en, name_hi) VALUES ($1, $2, $3, $4)
         ON CONFLICT (lgd_code) DO NOTHING`,
        [d.lgdCode, d.code, d.nameEn, d.nameHi],
      );
    }
    console.log(`districts: ${DISTRICTS.length} ensured`);

    const centerCount = ((await em.query('SELECT count(*)::int AS n FROM pension_auth.centers')) as { n: number }[])[0]?.n ?? 0;
    if (centerCount === 0) {
      for (const c of PLACEHOLDER_CENTERS) {
        await em.query(
          `INSERT INTO pension_auth.centers (code, name_en, name_hi, district_id, center_type, is_placeholder)
           SELECT $1, $2, $3, d.id, 'ART', true FROM pension_auth.districts d WHERE d.lgd_code = $4`,
          [c.code, c.nameEn, c.nameHi, c.districtLgdCode],
        );
      }
      console.log(`centers: ${PLACEHOLDER_CENTERS.length} placeholder Centers created`);
    } else {
      console.log(`centers: ${centerCount} exist, placeholders skipped`);
    }
  });

  if (cfg.APP_ENV !== 'local') {
    console.log('dev users: skipped (APP_ENV is not local)');
  } else if (!cfg.DEV_USER_PASSWORD) {
    console.log('dev users: skipped (DEV_USER_PASSWORD is empty)');
  } else {
    const hash = await hashPassword(cfg.DEV_USER_PASSWORD);
    const users = AppDataSource.getRepository(UserEntity);
    let created = 0;
    for (const u of DEV_USERS) {
      if (await users.exist({ where: { userCode: u.userCode } })) continue;
      await AppDataSource.transaction(async (em) => {
        const saved = await em.getRepository(UserEntity).save(
          em.getRepository(UserEntity).create({
            userCode: u.userCode,
            fullName: u.fullName,
            fullNameTokens: nameBlindIndexes(u.fullName),
            mobile: u.mobile,
            mobileLookup: blindIndex(u.mobile),
            mobileLast4: last4(u.mobile) ?? '',
            email: null,
            emailLookup: null,
            passwordHash: hash,
            previousPasswordHashes: [],
            mustChangePassword: false,
            mfaEnabled: false,
            failedLoginCount: 0,
            isActive: true,
          }),
        );
        await em.query(
          `INSERT INTO pension_auth.user_roles (user_id, role_id, district_id, center_id)
           SELECT $1, r.id,
                  COALESCE((SELECT id FROM pension_auth.districts WHERE lgd_code = $3), (SELECT district_id FROM pension_auth.centers WHERE code = $4)),
                  (SELECT id FROM pension_auth.centers WHERE code = $4)
           FROM pension_auth.roles r WHERE r.code = $2`,
          [saved.id, u.role, u.districtLgdCode ?? null, u.centerCode ?? null],
        );
      });
      created++;
    }
    console.log(`dev users: ${created} created, ${DEV_USERS.length - created} already present (password = DEV_USER_PASSWORD)`);
  }
  await AppDataSource.destroy();
};

main().catch((err) => {
  console.error(`seed error: ${(err as Error).message}`);
  process.exit(1);
});
