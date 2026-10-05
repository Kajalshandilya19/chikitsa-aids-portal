import { AppError, BadRequestError } from '../lib/errors';

/**
 * Upload checks for spreadsheet imports (docs/API_DATA.md §3, docs/SECURITY.md S-FILE-1..5).
 * Everything is decided from the BYTES; the browser's file name and MIME type are not trusted (the
 * extension only has to agree with what the bytes are).
 *
 *   .xlsx  must be a zip containing [Content_Types].xml and xl/workbook.xml, at most 200 entries,
 *          at most 100 MB uncompressed in total, compression ratio at most 100, no zip64, and no
 *          macros (vbaProject.bin), external links, ActiveX controls or embedded OLE objects.
 *   .csv   must be valid UTF-8 text (BOM allowed) with no NUL bytes and must not start with markup.
 *   .xls (old binary Excel) and every other type are refused.
 */
export type SpreadsheetType = 'xlsx' | 'csv';

const MAX_ENTRIES = 200;
const MAX_UNCOMPRESSED = 100 * 1024 * 1024;
const MAX_RATIO = 100;
const FORBIDDEN_ENTRY = /(^|\/)vbaProject\.bin$|^xl\/externalLinks\/|^xl\/activeX\/|^xl\/embeddings\//i;

const fileType = (msg: string) => new BadRequestError(msg, { code: 'E_FILE_TYPE' });
const unsafe = (msg: string) => new BadRequestError(msg, { code: 'E_FILE_UNSAFE' });

interface ZipEntry {
  name: string;
  compressed: number;
  uncompressed: number;
}

/** Reads the zip central directory (no decompression). Throws E_FILE_UNSAFE on anything unusual. */
export const zipEntries = (b: Buffer): ZipEntry[] => {
  // End of central directory: signature 0x06054b50, within the last 22 + 65535 bytes.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw unsafe('The file is not a valid .xlsx workbook.');
  const total = b.readUInt16LE(eocd + 10);
  const cdSize = b.readUInt32LE(eocd + 12);
  const cdOffset = b.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdOffset === 0xffffffff) throw unsafe('Zip64 workbooks are not accepted.');
  if (total > MAX_ENTRIES) throw unsafe('The workbook has too many parts.');
  if (cdOffset + cdSize > b.length) throw unsafe('The file is not a valid .xlsx workbook.');
  const out: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw unsafe('The file is not a valid .xlsx workbook.');
    const compressed = b.readUInt32LE(p + 20);
    const uncompressed = b.readUInt32LE(p + 24);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    if (compressed === 0xffffffff || uncompressed === 0xffffffff) throw unsafe('Zip64 workbooks are not accepted.');
    const name = b.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    out.push({ name, compressed, uncompressed });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
};

export const inspectXlsx = (b: Buffer): void => {
  const entries = zipEntries(b);
  const names = new Set(entries.map((e) => e.name));
  if (!names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) throw fileType('The file is a zip but not an Excel .xlsx workbook.');
  const forbidden = entries.find((e) => FORBIDDEN_ENTRY.test(e.name));
  if (forbidden) throw unsafe('The workbook contains macros, external links or embedded objects. Save a plain copy (.xlsx) and upload that.');
  const totalUncompressed = entries.reduce((s, e) => s + e.uncompressed, 0);
  const totalCompressed = entries.reduce((s, e) => s + e.compressed, 0);
  if (totalUncompressed > MAX_UNCOMPRESSED) throw unsafe('The workbook is too large when unpacked.');
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > MAX_RATIO) throw unsafe('The workbook is unusually compressed and was refused.');
};

export const inspectCsv = (b: Buffer): void => {
  if (b.includes(0)) throw fileType('The file is not a text CSV file.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    throw fileType('The CSV file must be saved as UTF-8. In Excel use "Save As" > "CSV UTF-8".');
  }
  if (/^﻿?\s*</.test(text)) throw fileType('The file is not a CSV file.');
};

/** Decides the type from the bytes, checks the extension agrees, and runs the type's checks. */
export const guardSpreadsheet = (b: Buffer, originalName: string, maxBytes: number): SpreadsheetType => {
  if (b.length === 0) throw new BadRequestError('The file is empty.', { code: 'E_FILE_EMPTY' });
  if (b.length > maxBytes) throw new AppError(413, `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`, { code: 'E_FILE_TOO_LARGE' });
  const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(originalName)?.[1] ?? '').toLowerCase();
  const isZip = b.length > 4 && b.readUInt32LE(0) === 0x04034b50;
  const isOle = b.length > 8 && b.readUInt32BE(0) === 0xd0cf11e0 && b.readUInt32BE(4) === 0xa1b11ae1;
  if (isOle) throw fileType('Old Excel files (.xls) are not accepted. Open the file in Excel, save it as .xlsx and upload again.');
  if (isZip) {
    if (ext !== 'xlsx') throw fileType('The file content is an Excel workbook but the name does not end in .xlsx.');
    inspectXlsx(b);
    return 'xlsx';
  }
  if (ext !== 'csv') throw fileType('Only .xlsx and .csv files are accepted.');
  inspectCsv(b);
  return 'csv';
};
