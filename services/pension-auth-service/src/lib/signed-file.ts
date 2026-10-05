import { createHmac, timingSafeEqual } from 'node:crypto';

import { AppError } from './errors';

/**
 * Short-lived signed URLs for stored document bytes, verified by this service.
 *
 * A document URL handed to the browser points at THIS service, not at MinIO. The service checks
 * the signature on the URL and then streams the object from the bucket internally. That is one hop
 * fewer than the browser -> Next BFF -> service -> MinIO path it replaces, and it takes the BFF out
 * of the byte path entirely.
 *
 * Why not MinIO presigned URLs, which every service already supports? The presigned URL names the
 * cluster-internal MinIO host, which a browser cannot resolve. Making it resolvable means exposing
 * MinIO publicly, and a presigned URL is a bearer token over the whole bucket lifetime: no session
 * check, no revocation. This keeps the object key, the bucket and the MinIO host server-side.
 *
 * The trade, made deliberately: a signed URL carries no identity, so it bypasses the
 * `document.view` permission check that gates the authenticated file routes. Anyone holding the
 * link reads that ONE object until it expires. The short window is the mitigation, which is why
 * the TTL below is minutes rather than hours.
 *
 * Pure: no database, no object store, no clock beyond `Date.now()`. Verification is an HMAC and an
 * integer compare, which is what makes this cheaper than the route it replaces.
 */

/** 15 minutes: long enough to open and read a PDF, short enough that a leaked link is not a grant. */
export const DEFAULT_FILE_URL_TTL_SECONDS = 900;

/**
 * Pod clocks drift. Without leeway, a link issued by one pod is rejected by another that happens
 * to run a minute fast, which presents as documents that randomly fail to open.
 */
export const CLOCK_SKEW_LEEWAY_SECONDS = 60;

const PAYLOAD_VERSION = 'v1';
const KEY_BYTES = 32;
const SIGNATURE_BYTES = 32; // HMAC-SHA256 digest length.

export interface SignFileInput {
  /** The object-store key. Never sent to a client except inside a signature. */
  objectKey: string;
  /**
   * Stored content type, signed so it cannot be edited in the URL.
   *
   * Serving attacker-chosen `text/html` from this service's own origin would be stored XSS, so the
   * type has to be part of what the signature covers rather than a free query parameter.
   */
  contentType?: string | undefined;
  /** `true` -> Content-Disposition: attachment. Signed, or a download opens in the tab instead. */
  download?: boolean | undefined;
  /** Overrides the default window. Negative values are for tests that need an expired link. */
  ttlSeconds?: number | undefined;
}

export interface VerifiedFile {
  objectKey: string;
  contentType: string | undefined;
  download: boolean;
}

/** The query as Express hands it over: values may be absent, or arrays when a param repeats. */
export type SignedFileQuery = Record<string, string | string[] | undefined>;

let cachedKey: Buffer | null = null;

/** Test seam: the key is memoised, so a test that swaps PII_HMAC_KEY has to clear it. */
export const resetSignedFileKeyForTests = (): void => {
  cachedKey = null;
};

/**
 * The EXISTING per-service secret, not a new one to distribute.
 *
 * Deriving a distinct sub-key would be tidier in the abstract, but every service already loads and
 * validates this one, so reusing it means no new secret in the manifests, the sealed secret, or the
 * local env files.
 */
const signingKey = (): Buffer => {
  if (cachedKey) return cachedKey;
  const raw = process.env['PII_HMAC_KEY'];
  if (!raw) throw new Error('PII_HMAC_KEY is required to sign document URLs (base64, >= 32 bytes)');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length < KEY_BYTES) {
    throw new Error(`PII_HMAC_KEY must decode to >= ${KEY_BYTES} bytes; got ${buf.length}`);
  }
  cachedKey = buf.subarray(0, KEY_BYTES);
  return cachedKey;
};

/**
 * Newline-delimited and version-prefixed.
 *
 * An object key contains "/" and a content type contains "/" and ";", but neither can contain a
 * newline, so no combination of field values can be re-split into a different tuple that signs to
 * the same digest. The version prefix leaves room to change this layout without every live link
 * silently verifying against the new one.
 */
const payload = (objectKey: string, expiresAt: number, download: boolean, contentType: string): string =>
  [PAYLOAD_VERSION, objectKey, String(expiresAt), download ? '1' : '0', contentType].join('\n');

const digest = (data: string): Buffer => createHmac('sha256', signingKey()).update(data, 'utf8').digest();

const invalid = (message: string): AppError =>
  new AppError(403, message, { code: 'E_FILE_SIGNATURE_INVALID', expose: true });

const expired = (): AppError =>
  new AppError(403, 'this document link has expired, reload the page to get a fresh one', {
    code: 'E_FILE_URL_EXPIRED',
    expose: true,
  });

/**
 * Sign an object key into the query string that `verifyFileSignature` accepts.
 *
 * Returns the query alone so the caller can mount it under whatever path its own router uses; most
 * callers want `signFileUrl` instead.
 */
export const signFileQuery = (input: SignFileInput): string => {
  const ttl = input.ttlSeconds ?? DEFAULT_FILE_URL_TTL_SECONDS;
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const download = input.download === true;
  const contentType = input.contentType ?? '';
  const signature = digest(payload(input.objectKey, expiresAt, download, contentType)).toString('base64url');

  // URLSearchParams percent-encodes every value, so a key containing "&", "?" or "#" survives.
  const params = new URLSearchParams({ k: input.objectKey, e: String(expiresAt) });
  if (download) params.set('d', '1');
  if (contentType) params.set('c', contentType);
  params.set('s', signature);
  return params.toString();
};

/** Where one signed object can be fetched from, by whom. */
export interface SignedFilePaths {
  /** This service's own route, e.g. `/patient/api/v1/files`. Only reachable if the service is. */
  backend: string;
  /**
   * The path a BROWSER can actually use, e.g. `/api/gateway/patient/files`.
   *
   * Every backend here is a ClusterIP with no public host, so the browser reaches services through
   * the Next app's gateway proxy: the same way it reaches every other API. That proxy streams
   * non-text responses rather than decoding them, so a PDF survives it intact.
   */
  browser: string;
}

/**
 * The URL a browser is given for one document.
 *
 * Defaults to the gateway path, because that is the ONLY one a browser can resolve today. Handing
 * out the backend path instead produces a URL the browser asks the Next app for, and Next answers
 * with its own 404 page: which is exactly what happened.
 *
 * Set `PUBLIC_API_BASE_URL` to a browser-reachable origin that path-routes by service prefix (an
 * ingress, or `http://localhost:3003` for a single service in dev) and the link becomes absolute,
 * at which point the BFF leaves the byte path for real and the service needs the frontend origin in
 * `CORS_ORIGIN`. Until then the gateway hop stays, and the signature is still what makes the link
 * address ONE object instead of "the newest of this type".
 */
export const signFileUrl = (paths: SignedFilePaths, input: SignFileInput): string => {
  const query = signFileQuery(input);
  const origin = (process.env['PUBLIC_API_BASE_URL'] ?? '').trim().replace(/\/+$/, '');
  return origin ? `${origin}${paths.backend}?${query}` : `${paths.browser}?${query}`;
};

/** Exactly one value, or nothing. An array means the parameter was repeated. */
const single = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * Check a signed query and hand back what it authorises.
 *
 * Order matters: the signature is checked BEFORE the expiry and before the key is returned. `k`
 * is attacker-supplied until the HMAC covers it: trusting it any earlier turns this route into a
 * read of any object in the bucket.
 *
 * @throws AppError 403 when the signature is absent, malformed, forged or expired.
 */
export const verifyFileSignature = (query: SignedFileQuery): VerifiedFile => {
  const objectKey = single(query['k']);
  const rawExpiry = single(query['e']);
  const rawSignature = single(query['s']);
  const rawDownload = single(query['d']);
  const rawContentType = query['c'] === undefined ? '' : single(query['c']);

  // A repeated parameter arrives as an array and reads as `undefined` here, so a smuggled second
  // `k=` is a rejection rather than a coin flip over which arm gets signed and which gets read.
  if (!objectKey || !rawExpiry || !rawSignature || rawContentType === undefined) {
    throw invalid('this document link is missing its signature');
  }
  if (rawDownload !== undefined && rawDownload !== '1') {
    throw invalid('this document link has an invalid signature');
  }
  if (!/^\d+$/.test(rawExpiry)) {
    throw invalid('this document link has an invalid signature');
  }

  const expiresAt = Number(rawExpiry);
  const download = rawDownload === '1';
  const expectedSignature = digest(payload(objectKey, expiresAt, download, rawContentType));
  const presented = Buffer.from(rawSignature, 'base64url');

  // Length first: timingSafeEqual THROWS on a mismatch rather than returning false.
  if (presented.length !== SIGNATURE_BYTES || !timingSafeEqual(presented, expectedSignature)) {
    throw invalid('this document link has an invalid signature');
  }
  if (expiresAt + CLOCK_SKEW_LEEWAY_SECONDS < Math.floor(Date.now() / 1000)) {
    throw expired();
  }

  return { objectKey, contentType: rawContentType || undefined, download };
};

/**
 * Content types this service will hand a browser to render IN PLACE.
 *
 * Everything else is served as an octet-stream attachment. The reason is that this route answers
 * without a session, from this service's own origin, with bytes some user uploaded: serving an
 * attacker-chosen `text/html` inline would be stored XSS against the application. The stored type
 * is signed and therefore un-editable, but "signed" only means the uploader chose it, not that it
 * is safe.
 *
 * SVG is deliberately absent. It renders inertly inside an `<img>`, but a document link is also
 * something a user OPENS IN A TAB, and a top-level SVG navigation executes its script.
 */
const INLINE_SAFE_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/apng',
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'text/plain',
]);

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** The last segment of the object key: a uuid plus a harmless extension, never the patient's name. */
const objectBasename = (objectKey: string): string => {
  const last = objectKey.split('/').pop() ?? '';
  // Quotes would terminate the header value early; strip rather than escape.
  const cleaned = last.replace(/["\\\r\n]/g, '').trim();
  return cleaned || 'document';
};

export interface FileDelivery {
  contentType: string;
  contentDisposition: string;
}

/**
 * The response headers for a verified link, decided the same way in every service.
 *
 * The filename here is the object key's basename, NOT the uploaded filename, which lives encrypted
 * in the metadata row and never travels in a URL. Same-origin download buttons pass the real name
 * through the anchor's `download` attribute, so this only surfaces if the link is ever served
 * cross-origin.
 */
export const fileDelivery = (verified: VerifiedFile): FileDelivery => {
  // "application/pdf; charset=...": match on the media type, ignore parameters and case.
  const mediaType = (verified.contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  const inlineSafe = INLINE_SAFE_CONTENT_TYPES.has(mediaType);
  const filename = objectBasename(verified.objectKey);
  return {
    contentType: inlineSafe ? mediaType : DEFAULT_CONTENT_TYPE,
    // Anything not renderable in place is an attachment: offering it inline just leaves the user
    // on a blank tab.
    contentDisposition: `${verified.download || !inlineSafe ? 'attachment' : 'inline'}; filename="${filename}"`,
  };
};
