import { Router, type RequestHandler } from 'express';
import { authenticate, authOf, authorize, caller } from '../../lib/auth-middleware';
import { ok, paged } from '../../lib/envelopes';
import { P } from '../../lib/permission-codes';
import { validateBody, validateParams, validateQuery } from '../../lib/validate';
import { idParams } from '../../dtos/master.dto';
import {
  assignmentInput,
  userAssignmentParams,
  userCreateSchema,
  userListQuery,
  userPatchSchema,
  type AssignmentInput,
  type UserCreate,
  type UserListQuery,
  type UserPatch,
} from '../../dtos/user.dto';
import { userService } from '../../services/user.service';
import { limits } from './limits';

/** /users (docs/API_AUTH.md §5). */
export const usersRouter = Router();
/** Every route: logged in, then the per-user admin rate limit. Applied per route, never with router.use(). */
const guard: RequestHandler[] = [authenticate(), limits.admin];

const id = (p: Record<string, unknown>) => p['id'] as string;

usersRouter.get('/users', ...guard, authorize(P.USER_ACCOUNT_VIEW), validateQuery(userListQuery), async (req, res) => {
  const q = req.query as unknown as UserListQuery;
  const r = await userService.list(authOf(res), q);
  res.json(paged(r.rows, r.total, q));
});

usersRouter.get('/users/:id', ...guard, authorize(P.USER_ACCOUNT_VIEW), validateParams(idParams), async (req, res) => {
  res.json(ok(await userService.get(authOf(res), id(req.params))));
});

usersRouter.post('/users', ...guard, authorize(P.USER_ACCOUNT_CREATE), validateBody(userCreateSchema), async (req, res) => {
  const c = await caller(res);
  res.status(201).json(ok(await userService.create(c.auth, c.perms, req.body as UserCreate)));
});

usersRouter.patch('/users/:id', ...guard, authorize(P.USER_ACCOUNT_EDIT), validateParams(idParams), validateBody(userPatchSchema), async (req, res) => {
  res.json(ok(await userService.update(authOf(res), id(req.params), req.body as UserPatch)));
});

usersRouter.post('/users/:id/activate', ...guard, authorize(P.USER_ACCOUNT_ACTIVATE), validateParams(idParams), async (req, res) => {
  res.json(ok(await userService.setActive(authOf(res), id(req.params), true)));
});

usersRouter.post('/users/:id/deactivate', ...guard, authorize(P.USER_ACCOUNT_ACTIVATE), validateParams(idParams), async (req, res) => {
  res.json(ok(await userService.setActive(authOf(res), id(req.params), false)));
});

usersRouter.post('/users/:id/unlock', ...guard, authorize(P.USER_ACCOUNT_ACTIVATE), validateParams(idParams), async (req, res) => {
  res.json(ok(await userService.unlock(authOf(res), id(req.params))));
});

usersRouter.post('/users/:id/password-reset', ...guard, authorize(P.USER_ACCOUNT_PASSWORD_RESET), validateParams(idParams), async (req, res) => {
  res.json(ok(await userService.adminResetPassword(authOf(res), id(req.params))));
});

usersRouter.get('/users/:id/assignments', ...guard, authorize(P.USER_ACCOUNT_VIEW), validateParams(idParams), async (req, res) => {
  res.json(ok(await userService.listAssignments(authOf(res), id(req.params))));
});

usersRouter.post('/users/:id/assignments', ...guard, authorize(P.USER_ASSIGNMENT_MANAGE), validateParams(idParams), validateBody(assignmentInput), async (req, res) => {
  const c = await caller(res);
  res.status(201).json(ok(await userService.addAssignment(c.auth, c.perms, id(req.params), req.body as AssignmentInput)));
});

usersRouter.delete('/users/:id/assignments/:assignmentId', ...guard, authorize(P.USER_ASSIGNMENT_MANAGE), validateParams(userAssignmentParams), async (req, res) => {
  const c = await caller(res);
  res.json(ok(await userService.removeAssignment(c.auth, c.perms, id(req.params), req.params['assignmentId'] as string)));
});
