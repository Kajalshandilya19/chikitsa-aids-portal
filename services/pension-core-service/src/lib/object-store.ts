import type { Readable } from 'node:stream';
import * as Minio from 'minio';
import { baseConfig } from './base-config';
import { AppError, NotFoundError } from './errors';

/**
 * Private object storage (MinIO / S3) for consent documents, import files and export files
 * (docs/SECURITY.md S-FILE-1..5).
 *
 * Browsers NEVER see MinIO: they get a short-lived link signed by the owning service (lib/signed-file.ts)
 * and the bytes stream through that service and the BFF. Object keys are `<area>/<yyyy>/<mm>/<uuid><ext>`;
 * the uploaded file name never appears in a key (it can be personal data).
 */
export class ObjectStore {
  private readonly client: Minio.Client;
  readonly bucket: string;
  private readonly where: string;

  constructor() {
    const cfg = baseConfig();
    this.client = new Minio.Client({
      endPoint: cfg.MINIO_ENDPOINT,
      port: cfg.MINIO_PORT,
      useSSL: cfg.MINIO_USE_SSL,
      accessKey: cfg.MINIO_ACCESS_KEY,
      secretKey: cfg.MINIO_SECRET_KEY,
      region: cfg.MINIO_REGION,
    });
    this.bucket = cfg.MINIO_BUCKET;
    this.where = `${cfg.MINIO_ENDPOINT}:${cfg.MINIO_PORT} (bucket "${this.bucket}")`;
  }

  async ping(): Promise<boolean> {
    return this.client.bucketExists(this.bucket);
  }

  /** Creates the bucket when missing. Called by the data-service at boot; idempotent. */
  async ensureBucket(): Promise<void> {
    if (!(await this.client.bucketExists(this.bucket))) await this.client.makeBucket(this.bucket, baseConfig().MINIO_REGION);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.putObject(this.bucket, key, body, body.length, { 'Content-Type': contentType });
    } catch (err) {
      throw this.describe(err, key);
    }
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    return Buffer.concat(chunks);
  }

  async getStream(key: string): Promise<Readable> {
    try {
      return await this.client.getObject(this.bucket, key);
    } catch (err) {
      throw this.describe(err, key);
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  private describe(err: unknown, key: string): Error {
    const code = (err as { code?: string } | null)?.code ?? '';
    if (code === 'NoSuchKey' || code === 'NotFound') return new NotFoundError(`file "${key}" is not in the object store`);
    if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNRESET'].includes(code))
      return new AppError(503, `object store unreachable at ${this.where}`, { code: 'E_OBJECT_STORE_UNREACHABLE', expose: true, cause: err });
    if (code === 'AccessDenied' || code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch')
      return new AppError(502, `object store rejected our credentials for ${this.where}`, { code: 'E_OBJECT_STORE_AUTH', expose: true, cause: err });
    return new AppError(502, `object store error (${code || 'unknown'})`, { code: 'E_OBJECT_STORE', expose: true, cause: err });
  }
}

let store: ObjectStore | undefined;
export const objectStore = (): ObjectStore => (store ??= new ObjectStore());

/** `<area>/<yyyy>/<mm>/<id><ext>`: no user-supplied text ever lands in a key. */
export const objectKey = (area: 'consent' | 'import' | 'export' | 'ppo', id: string, ext: string): string => {
  const now = new Date();
  const safeExt = /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
  return `${area}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}${safeExt}`;
};
