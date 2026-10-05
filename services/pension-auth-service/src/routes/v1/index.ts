import { Router } from 'express';
import { authRouter } from './auth.routes';
import { mastersRouter } from './masters.routes';
import { rolesAuditRouter } from './roles-audit.routes';
import { usersRouter } from './users.routes';

/** Everything under /auth/api/v1. Order matters: the public auth routes come first. */
export const apiRouter = Router();
apiRouter.use(authRouter);
apiRouter.use(mastersRouter);
apiRouter.use(usersRouter);
apiRouter.use(rolesAuditRouter);
