import { Router } from 'express';

/**
 * /core/api/v1/internal/* : service token ONLY (lib/http-app.ts mounts it behind requireServiceToken).
 * Phase 1 adds POST /beneficiaries/upsert-batch (SOCH import commit from data-service, docs/IMPORT_PIPELINE.md).
 * Phase 5 adds POST /payments/upsert-batch.
 */
export const internalRouter = Router();
