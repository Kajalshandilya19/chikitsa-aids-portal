import { z } from 'zod';
import { boolQuery, email, mobile, optional, pageQuery, personName, searchText, userCode, uuid } from '../lib/validators';

/** Users and assignments (docs/API_AUTH.md §5). */

export const userListQuery = z
  .object({
    q: searchText.optional(),
    role_code: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/).optional(),
    district_id: uuid.optional(),
    center_id: uuid.optional(),
    is_active: boolQuery.optional(),
    ...pageQuery,
  })
  .strict();
export type UserListQuery = z.infer<typeof userListQuery>;

export const assignmentInput = z
  .object({
    role_id: uuid,
    district_id: uuid.optional(),
    center_id: uuid.optional(),
  })
  .strict();
export type AssignmentInput = z.infer<typeof assignmentInput>;

export const userCreateSchema = z
  .object({
    user_code: userCode,
    full_name: personName,
    mobile,
    email: optional(email).optional(),
    assignment: assignmentInput,
  })
  .strict();
export type UserCreate = z.infer<typeof userCreateSchema>;

export const userPatchSchema = z
  .object({
    full_name: personName.optional(),
    mobile: mobile.optional(),
    email: optional(email).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UserPatch = z.infer<typeof userPatchSchema>;

export const userAssignmentParams = z.object({ id: uuid, assignmentId: uuid }).strict();
