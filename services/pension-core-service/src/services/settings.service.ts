import { AppDataSource } from '../config/datasource';
import { AppSettingEntity } from '../entities/app-setting.entity';
import { AUDIT, writeAudit } from '../lib/audit';
import { NotFoundError, ValidationError } from '../lib/errors';
import { SETTINGS, SETTING_BY_KEY } from '../domain/settings';

/** Portal settings (docs/API_CORE.md §2). Reads fall back to the code default when no row exists. */
export const settingsService = {
  async list() {
    const rows = await AppDataSource.getRepository(AppSettingEntity).find();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return SETTINGS.map((s) => {
      const row = byKey.get(s.key);
      return {
        key: s.key,
        value: row ? row.value : s.default,
        is_default: !row,
        placeholder: s.placeholder && !row,
        description: s.description,
        question: 'question' in s ? s.question : null,
        updated_at: row?.updatedAt ?? null,
      };
    });
  },

  async get<T>(key: string): Promise<T> {
    const def = SETTING_BY_KEY.get(key);
    if (!def) throw new NotFoundError(`unknown setting ${key}`);
    const row = await AppDataSource.getRepository(AppSettingEntity).findOne({ where: { key } });
    return (row ? row.value : def.default) as T;
  },

  async set(actorUserId: string, key: string, value: unknown) {
    const def = SETTING_BY_KEY.get(key);
    if (!def) throw new NotFoundError(`unknown setting ${key}`);
    const parsed = def.schema.safeParse(value);
    if (!parsed.success) {
      throw new ValidationError(`invalid value for ${key}`, {
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.') || 'value', message: i.message })),
      });
    }
    await AppDataSource.transaction(async (em) => {
      await em.query(
        `INSERT INTO pension_core.app_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(parsed.data), actorUserId],
      );
      await writeAudit(em, { action: AUDIT.SETTINGS_UPDATED, entityType: 'setting', entityId: key });
    });
    return (await this.list()).find((s) => s.key === key);
  },
};
