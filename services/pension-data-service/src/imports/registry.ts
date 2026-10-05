import { NotFoundError } from '../lib/errors';
import { centersImporter } from './importers/centers.importer';
import type { AnyImporter } from './types';

/**
 * Every importer, by kind. Phase 1 adds `soch` (importers/soch.importer.ts), Phase 5 `payments`.
 * docs/IMPORT_PIPELINE.md §5 is the step-by-step for adding one.
 */
export const IMPORTERS: Readonly<Record<string, AnyImporter>> = {
  centers: centersImporter,
};

export const IMPORT_KINDS = Object.keys(IMPORTERS) as [string, ...string[]];

export const importerFor = (kind: string): AnyImporter => {
  const imp = IMPORTERS[kind];
  if (!imp) throw new NotFoundError(`unknown import kind ${kind}`);
  return imp;
};
