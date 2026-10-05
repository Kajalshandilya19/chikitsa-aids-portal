import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../../config';
import { authenticate, authorize, caller } from '../../lib/auth-middleware';
import { ok, paged } from '../../lib/envelopes';
import { AppError, BadRequestError } from '../../lib/errors';
import { P } from '../../lib/permission-codes';
import { perUser } from '../../lib/rate-limit';
import { validateParams, validateQuery } from '../../lib/validate';
import { pageQuery, uuid } from '../../lib/validators';
import { IMPORT_KINDS } from '../../imports/registry';
import { importService } from '../../services/import.service';

/**
 * Everything under /data/api/v1 (docs/API_DATA.md). Fixed route order (R-API-4):
 * authenticate, rate limit, authorize (coarse), validate, [multer], handler (fine-grained per kind).
 */
export const apiRouter = Router();

const ANY_IMPORT = [P.IMPORT_BATCH_VIEW, P.IMPORT_CENTER_UPLOAD, P.IMPORT_CENTER_COMMIT, P.IMPORT_SOCH_UPLOAD, P.IMPORT_SOCH_COMMIT, P.PAYMENT_FILE_IMPORT] as const;
const guard: RequestHandler[] = [authenticate(), perUser({ name: 'data-api', windowMs: 60_000, limit: 120 }), authorize(...ANY_IMPORT)];
const uploadLimit = perUser({ name: 'data-upload', windowMs: 60_000, limit: 10 });

const kindParams = z.object({ kind: z.enum(IMPORT_KINDS) }).strict();
const idParams = z.object({ id: uuid }).strict();
const listQuery = z
  .object({ kind: z.enum(IMPORT_KINDS).optional(), status: z.enum(['VALIDATED', 'REJECTED', 'COMMITTING', 'COMMITTED', 'FAILED', 'CANCELLED']).optional(), ...pageQuery })
  .strict();
const rowsQuery = z.object({ status: z.enum(['VALID', 'ERROR', 'DUPLICATE']).optional(), ...pageQuery }).strict();

/** Memory storage, one file, no other fields. Multer's own errors become our error codes. */
const singleFile: RequestHandler = (req, res, next) => {
  const max = config().IMPORT_MAX_FILE_MB * 1024 * 1024;
  multer({ storage: multer.memoryStorage(), limits: { fileSize: max, files: 1, fields: 5, parts: 6 } }).single('file')(req, res, (err: unknown) => {
    if (!err) return req.file ? next() : next(new BadRequestError('Attach the file in the "file" field.', { code: 'E_FILE_MISSING' }));
    const code = (err as { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') return next(new AppError(413, `The file is larger than ${config().IMPORT_MAX_FILE_MB} MB.`, { code: 'E_FILE_TOO_LARGE' }));
    return next(new BadRequestError('The upload could not be read. Send one file in the "file" field.', { code: 'E_FILE_UPLOAD' }));
  });
};

apiRouter.get('/imports/templates/:kind', ...guard, validateParams(kindParams), async (req, res) => {
  const kind = req.params['kind'] as string;
  const buf = await importService.template(await caller(res), kind);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${kind}-template.xlsx"`);
  res.send(buf);
});

apiRouter.get('/imports', ...guard, validateQuery(listQuery), async (req, res) => {
  const q = req.query as unknown as z.infer<typeof listQuery>;
  const r = await importService.list(await caller(res), q);
  res.json(paged(r.rows, r.total, q));
});

apiRouter.post('/imports/:kind', ...guard, uploadLimit, validateParams(kindParams), singleFile, async (req, res) => {
  const file = req.file as Express.Multer.File;
  res.status(201).json(ok(await importService.upload(await caller(res), req.params['kind'] as string, file)));
});

apiRouter.get('/imports/:id', ...guard, validateParams(idParams), async (req, res) => {
  res.json(ok(await importService.get(await caller(res), req.params['id'] as string)));
});

apiRouter.get('/imports/:id/rows', ...guard, validateParams(idParams), validateQuery(rowsQuery), async (req, res) => {
  const q = req.query as unknown as z.infer<typeof rowsQuery>;
  const r = await importService.rows(await caller(res), req.params['id'] as string, q);
  res.json(paged(r.rows, r.total, q));
});

apiRouter.post('/imports/:id/commit', ...guard, validateParams(idParams), async (req, res) => {
  res.json(ok(await importService.commit(await caller(res), req.params['id'] as string)));
});

apiRouter.post('/imports/:id/cancel', ...guard, validateParams(idParams), async (req, res) => {
  res.json(ok(await importService.cancel(await caller(res), req.params['id'] as string)));
});
