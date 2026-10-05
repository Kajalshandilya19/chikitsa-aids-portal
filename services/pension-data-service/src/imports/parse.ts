import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { AppError, BadRequestError } from '../lib/errors';
import type { SpreadsheetType } from './file-guard';

/**
 * Turns a checked file into `{ headers, rows }` of plain strings (docs/IMPORT_PIPELINE.md §3).
 *   - only the FIRST worksheet of a workbook is read; row 1 is the header row
 *   - a formula cell yields its cached result (formulas are never evaluated)
 *   - dates become YYYY-MM-DD; numbers become their plain decimal text; rich text is flattened
 *   - fully empty rows are skipped but still counted, so row numbers match what the user sees in Excel
 */
export interface ParsedSheet {
  headers: string[];
  /** [excelRowNumber, cells] where excelRowNumber counts the header as row 1 */
  rows: Array<[number, string[]]>;
}

const tooMany = (max: number) => new AppError(422, `The file has more than ${max} data rows. Split it and upload the parts.`, { code: 'E_TOO_MANY_ROWS' });

const pad = (n: number) => String(n).padStart(2, '0');

export const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return cellText((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ('text' in v && typeof (v as { text?: unknown }).text === 'string') return (v as { text: string }).text;
    if ('error' in v) return '';
  }
  return String(v);
};

export const parseXlsx = async (b: Buffer, maxRows: number): Promise<ParsedSheet> => {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(b as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestError('The workbook could not be read. Open it in Excel, save it again as .xlsx and retry.', { code: 'E_FILE_UNREADABLE' });
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new BadRequestError('The workbook has no worksheet.', { code: 'E_HEADER' });
  const headerRow = ws.getRow(1);
  const width = Math.max(headerRow.cellCount, ws.columnCount);
  const headers = Array.from({ length: width }, (_, i) => cellText(headerRow.getCell(i + 1).value).trim());
  const rows: Array<[number, string[]]> = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = Array.from({ length: width }, (_, i) => cellText(row.getCell(i + 1).value).trim());
    if (cells.every((c) => c === '')) continue;
    if (rows.length >= maxRows) throw tooMany(maxRows);
    rows.push([r, cells]);
  }
  return { headers, rows };
};

export const parseCsv = (b: Buffer, maxRows: number): ParsedSheet => {
  const text = b.toString('utf8').replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: false, delimiter: '' });
  const all = parsed.data;
  const headers = (all[0] ?? []).map((h) => String(h).trim());
  const rows: Array<[number, string[]]> = [];
  for (let i = 1; i < all.length; i++) {
    const cells = (all[i] ?? []).map((c) => String(c ?? '').trim());
    if (cells.every((c) => c === '')) continue;
    if (rows.length >= maxRows) throw tooMany(maxRows);
    rows.push([i + 1, cells]);
  }
  return { headers, rows };
};

export const parseSpreadsheet = (b: Buffer, type: SpreadsheetType, maxRows: number): Promise<ParsedSheet> =>
  type === 'xlsx' ? parseXlsx(b, maxRows) : Promise.resolve(parseCsv(b, maxRows));
