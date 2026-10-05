import { z } from 'zod';
import { pageQuery, uuid } from '../lib/validators';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD (V-016)');

export const auditListQuery = z
  .object({
    action: z.string().regex(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/).optional(),
    outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
    actor_user_id: uuid.optional(),
    entity_type: z.string().regex(/^[a-z_]{2,64}$/).optional(),
    entity_id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).optional(),
    center_id: uuid.optional(),
    from: day.optional(),
    to: day.optional(),
    ...pageQuery,
  })
  .strict();
export type AuditListQuery = z.infer<typeof auditListQuery>;

export const rolePermissionsSchema = z.object({ permissions: z.array(z.string().max(80)).max(200) }).strict();
