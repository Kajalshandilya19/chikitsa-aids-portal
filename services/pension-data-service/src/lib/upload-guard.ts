/// <reference types="multer" />
import type { RequestHandler } from 'express';
import { BadRequestError } from './errors';

/*
 * Upload allowlist by CONTENT, not by what the browser claims (VAPT 389/26-27/2798 #6, CWE-434).
 *
 * Mount right after multer: `upload.single('file'), guardUploads(), ...`. Every buffered part is
 * identified from its leading bytes; anything that is not an allowed image or a PDF is refused
 * with 400, and so is a PDF carrying scripts, launch actions or embedded files. For accepted parts
 * the client's `mimetype` is REPLACED by the detected one and the file name's extension is made to
 * match, so what gets stored and later served is what the bytes really are. An uploaded `.html`
 * page can therefore never come back as `text/html`.
 *
 * Byte-identical in every service that accepts uploads.
 */

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/avif'] as const;
export const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'] as const;

interface Sniffed {
  mime: string;
  ext: string;
  /** Extensions a correct name for this type may already carry. */
  exts: string[];
}

const ascii = (b: Buffer, from: number, to: number): string => b.subarray(from, to).toString('latin1');
const hasBytes = (b: Buffer, sig: number[]): boolean => b.length >= sig.length && sig.every((x, i) => b[i] === x);

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/** The file type told by the leading bytes, or null when it is none of the types we accept. */
export const sniffFileType = (b: Buffer): Sniffed | null => {
  if (hasBytes(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: '.png', exts: ['.png'] };
  if (hasBytes(b, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: '.jpg', exts: ['.jpg', '.jpeg', '.jfif'] };
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return { mime: 'image/gif', ext: '.gif', exts: ['.gif'] };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { mime: 'image/webp', ext: '.webp', exts: ['.webp'] };
  if (ascii(b, 4, 8) === 'ftyp') {
    const brand = ascii(b, 8, 12);
    if (brand === 'avif' || brand === 'avis') return { mime: 'image/avif', ext: '.avif', exts: ['.avif'] };
    if (HEIC_BRANDS.has(brand)) return { mime: 'image/heic', ext: '.heic', exts: ['.heic', '.heif'] };
  }
  if (ascii(b, 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: '.pdf', exts: ['.pdf'] };
  return null;
};

// PDF names that run code or smuggle another file. `\b` keeps `/JSON`-like names from matching.
const PDF_ACTIVE_CONTENT = /\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b/;

export const pdfHasActiveContent = (b: Buffer): boolean => PDF_ACTIVE_CONTENT.test(b.toString('latin1'));

/** `name` with its extension made to agree with the detected type. */
const renamed = (name: string, t: Sniffed): string => {
  const m = /^(.*?)(\.[A-Za-z0-9]{1,10})?$/.exec(name.trim());
  const base = m?.[1] || 'document';
  const ext = m?.[2]?.toLowerCase();
  return ext && t.exts.includes(ext) ? name.trim() : `${base}${t.ext}`;
};

const partsOf = (req: Parameters<RequestHandler>[0]): Express.Multer.File[] => {
  const out: Express.Multer.File[] = [];
  if (req.file) out.push(req.file);
  const files = req.files;
  if (Array.isArray(files)) out.push(...files);
  else if (files) for (const list of Object.values(files)) out.push(...list);
  return out;
};

export const guardUploads =
  (allowed: readonly string[] = DOCUMENT_TYPES): RequestHandler =>
  (req, _res, next) => {
    for (const part of partsOf(req)) {
      const t = sniffFileType(part.buffer);
      if (!t || !allowed.includes(t.mime)) {
        const kinds = allowed.includes('application/pdf') ? 'a PDF or an image (PNG, JPEG, WebP, GIF, HEIC)' : 'an image (PNG, JPEG, WebP, GIF, HEIC)';
        return next(new BadRequestError(`file type not allowed: upload ${kinds}`, { code: 'E_FILE_TYPE' }));
      }
      if (t.mime === 'application/pdf' && pdfHasActiveContent(part.buffer)) {
        return next(new BadRequestError('this PDF contains scripts, launch actions or embedded files and was refused', { code: 'E_FILE_TYPE' }));
      }
      part.mimetype = t.mime;
      part.originalname = renamed(part.originalname, t);
    }
    return next();
  };
