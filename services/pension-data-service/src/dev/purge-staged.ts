import 'reflect-metadata';
import { config } from '../config';
import { AppDataSource } from '../config/datasource';

/**
 * `npm run purge`: deletes staged import rows older than IMPORT_STAGE_RETENTION_DAYS (docs/SECURITY.md
 * S-RET-1). Batch summaries are kept. Batches still waiting for confirmation that old are CANCELLED.
 * Runs as a Kubernetes CronJob (kube-manifests/purge-cronjob.yaml), daily at 02:30 IST.
 */
const main = async () => {
  const days = config().IMPORT_STAGE_RETENTION_DAYS;
  await AppDataSource.initialize();
  const cancelled = (await AppDataSource.query(
    `UPDATE pension_data.import_batches SET status = 'CANCELLED', updated_at = now()
     WHERE status = 'VALIDATED' AND uploaded_at < now() - ($1::int * interval '1 day') RETURNING id`,
    [days],
  )) as [unknown[], number];
  const deleted = (await AppDataSource.query(
    `DELETE FROM pension_data.import_rows r USING pension_data.import_batches b
     WHERE r.batch_id = b.id AND b.uploaded_at < now() - ($1::int * interval '1 day') RETURNING r.id`,
    [days],
  )) as [unknown[], number];
  console.log(`purge: ${cancelled[0].length} stale batches cancelled, ${deleted[0].length} staged rows deleted (older than ${days} days)`);
  await AppDataSource.destroy();
};

main().catch((err) => {
  console.error(`purge error: ${(err as Error).message}`);
  process.exit(1);
});
