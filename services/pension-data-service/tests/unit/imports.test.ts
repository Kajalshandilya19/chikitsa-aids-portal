import ExcelJS from 'exceljs';
import { guardSpreadsheet, zipEntries } from '../../src/imports/file-guard';
import { cellText, parseCsv, parseXlsx } from '../../src/imports/parse';
import { centersImporter } from '../../src/imports/importers/centers.importer';

/** UT-IMP-*: file checks and parsing (docs/IMPORT_PIPELINE.md §2-3, docs/SECURITY.md S-FILE-*). */

const MB = 1024 * 1024;

/** Minimal STORED zip (no compression). `fake` lets a test lie about the uncompressed size. */
const makeZip = (files: Array<{ name: string; data?: string; fakeUncompressed?: number }>): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const data = Buffer.from(f.data ?? 'x');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(f.fakeUncompressed ?? data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(f.fakeUncompressed ?? data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
};

const XLSX_PARTS = [{ name: '[Content_Types].xml' }, { name: 'xl/workbook.xml' }];

const realXlsx = async (rows: unknown[][]): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
};

describe('file guard', () => {
  test('UT-IMP-001 a real .xlsx passes; the same bytes named .csv are refused', async () => {
    const b = await realXlsx([['Center Code'], ['RJ001']]);
    expect(guardSpreadsheet(b, 'centers.xlsx', 10 * MB)).toBe('xlsx');
    expect(() => guardSpreadsheet(b, 'centers.csv', 10 * MB)).toThrow(expect.objectContaining({ code: 'E_FILE_TYPE' }));
  });

  test('UT-IMP-002 old binary .xls is refused with a "save as .xlsx" message', () => {
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(100)]);
    expect(() => guardSpreadsheet(ole, 'old.xls', 10 * MB)).toThrow(/\.xlsx/);
  });

  test('UT-IMP-003 macros, external links and embedded objects are refused', () => {
    for (const bad of ['xl/vbaProject.bin', 'xl/externalLinks/externalLink1.xml', 'xl/activeX/activeX1.xml', 'xl/embeddings/oleObject1.bin']) {
      const z = makeZip([...XLSX_PARTS, { name: bad }]);
      expect(() => guardSpreadsheet(z, 'x.xlsx', 10 * MB)).toThrow(expect.objectContaining({ code: 'E_FILE_UNSAFE' }));
    }
  });

  test('UT-IMP-004 zip bombs (huge declared size or ratio) are refused', () => {
    const big = makeZip([...XLSX_PARTS, { name: 'xl/worksheets/sheet1.xml', data: 'abc', fakeUncompressed: 200 * MB }]);
    expect(() => guardSpreadsheet(big, 'x.xlsx', 10 * MB)).toThrow(expect.objectContaining({ code: 'E_FILE_UNSAFE' }));
    const ratio = makeZip([...XLSX_PARTS, { name: 'xl/worksheets/sheet1.xml', data: 'abc', fakeUncompressed: 5 * MB }]);
    expect(() => guardSpreadsheet(ratio, 'x.xlsx', 10 * MB)).toThrow(expect.objectContaining({ code: 'E_FILE_UNSAFE' }));
  });

  test('UT-IMP-005 a zip that is not a workbook, too many entries, and zip64 are refused', () => {
    expect(() => guardSpreadsheet(makeZip([{ name: 'readme.txt' }]), 'x.xlsx', 10 * MB)).toThrow(expect.objectContaining({ code: 'E_FILE_TYPE' }));
    const many = makeZip([...XLSX_PARTS, ...Array.from({ length: 205 }, (_, i) => ({ name: `xl/p${i}.xml` }))]);
    expect(() => guardSpreadsheet(many, 'x.xlsx', 10 * MB)).toThrow(expect.objectContaining({ code: 'E_FILE_UNSAFE' }));
    expect(zipEntries(makeZip(XLSX_PARTS)).map((e) => e.name)).toEqual(['[Content_Types].xml', 'xl/workbook.xml']);
  });

  test('UT-IMP-006 CSV must be UTF-8 text without NUL and must not be markup', () => {
    expect(guardSpreadsheet(Buffer.from('﻿Center Code\nRJ001\n'), 'c.csv', 10 * MB)).toBe('csv');
    expect(() => guardSpreadsheet(Buffer.from([0x43, 0x00, 0x44]), 'c.csv', 10 * MB)).toThrow(expect.objectContaining({ code: 'E_FILE_TYPE' }));
    expect(() => guardSpreadsheet(Buffer.from([0x43, 0xff, 0xfe, 0x44]), 'c.csv', 10 * MB)).toThrow(/UTF-8/);
    expect(() => guardSpreadsheet(Buffer.from('<html><script>x</script>'), 'c.csv', 10 * MB)).toThrow(expect.objectContaining({ code: 'E_FILE_TYPE' }));
    expect(() => guardSpreadsheet(Buffer.from('a,b'), 'c.txt', 10 * MB)).toThrow(expect.objectContaining({ code: 'E_FILE_TYPE' }));
  });

  test('UT-IMP-007 size limit and empty files', () => {
    expect(() => guardSpreadsheet(Buffer.alloc(0), 'c.csv', 10 * MB)).toThrow(expect.objectContaining({ code: 'E_FILE_EMPTY' }));
    expect(() => guardSpreadsheet(Buffer.alloc(11), 'c.csv', 10)).toThrow(expect.objectContaining({ code: 'E_FILE_TOO_LARGE' }));
  });
});

describe('parsing', () => {
  test('UT-IMP-008 xlsx: first sheet, header row, dates as YYYY-MM-DD, formulas as their result, empty rows skipped', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['Code', 'When', 'Sum']);
    ws.addRow(['RJ001', new Date(Date.UTC(2015, 5, 30)), { formula: '1+1', result: 2 }]);
    ws.addRow([]);
    ws.addRow(['RJ002', '2016-01-01', 7]);
    wb.addWorksheet('Ignored').addRow(['secret']);
    const p = await parseXlsx(Buffer.from(await wb.xlsx.writeBuffer()), 100);
    expect(p.headers).toEqual(['Code', 'When', 'Sum']);
    expect(p.rows).toEqual([
      [2, ['RJ001', '2015-06-30', '2']],
      [4, ['RJ002', '2016-01-01', '7']],
    ]);
  });

  test('UT-IMP-009 row limit is enforced', async () => {
    const b = await realXlsx([['Code'], ['A1'], ['A2'], ['A3']]);
    await expect(parseXlsx(b, 2)).rejects.toMatchObject({ code: 'E_TOO_MANY_ROWS' });
    expect(() => parseCsv(Buffer.from('Code\nA\nB\nC\n'), 2)).toThrow(expect.objectContaining({ code: 'E_TOO_MANY_ROWS' }));
  });

  test('UT-IMP-010 csv: BOM removed, quoted commas kept, row numbers match the spreadsheet', () => {
    const p = parseCsv(Buffer.from('﻿Code,Name\nRJ001,"ART Centre, Ajmer"\n\nRJ002,X\n'), 10);
    expect(p.headers).toEqual(['Code', 'Name']);
    expect(p.rows).toEqual([
      [2, ['RJ001', 'ART Centre, Ajmer']],
      [4, ['RJ002', 'X']],
    ]);
    expect(cellText({ richText: [{ text: 'a' }, { text: 'b' }] } as ExcelJS.CellValue)).toBe('ab');
  });
});

describe('centers importer row schema', () => {
  test('UT-IMP-011 normalises and validates a Center row with the shared validators', () => {
    const ok = centersImporter.rowSchema.safeParse({ code: 'rj050', name_en: 'ART Centre Test', district_lgd_code: '86', center_type: 'art' });
    expect(ok.success && ok.data).toMatchObject({ code: 'RJ050', district_lgd_code: 86, center_type: 'ART' });
    const bad = centersImporter.rowSchema.safeParse({ code: '50', name_en: '<b>', district_lgd_code: 'x', center_type: 'PHC' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues.map((i) => i.path[0]).sort()).toEqual(['center_type', 'code', 'district_lgd_code', 'name_en']);
  });
});

describe('SOCH column dictionary (docs/SOCH_IMPORT_SPEC.md)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SOCH_COLUMNS, sochArtStatus, sochDate, sochSex } = require('../../src/imports/soch-columns') as typeof import('../../src/imports/soch-columns');

  test('UT-IMP-012 every SOCH column has a unique header and field and names a V- rule', () => {
    expect(new Set(SOCH_COLUMNS.map((c) => c.header)).size).toBe(SOCH_COLUMNS.length);
    expect(new Set(SOCH_COLUMNS.map((c) => c.field)).size).toBe(SOCH_COLUMNS.length);
    for (const c of SOCH_COLUMNS) expect(c.rule).toMatch(/^V-\d{3}$/);
  });

  test('UT-IMP-013 SOCH spellings map to our enums; unknown spellings map to null', () => {
    expect(sochSex('f')).toBe('FEMALE');
    expect(sochSex('TS')).toBe('TRANSGENDER');
    expect(sochSex('X')).toBeNull();
    expect(sochArtStatus('on  art')).toBe('ON_ART');
    expect(sochArtStatus('MIS')).toBe('MISSED');
    expect(sochArtStatus('Death')).toBe('DIED');
    expect(sochArtStatus('Lost')).toBeNull();
  });

  test('UT-IMP-014 Indian date formats become YYYY-MM-DD', () => {
    expect(sochDate('5/6/2015')).toBe('2015-06-05');
    expect(sochDate('30-06-2015')).toBe('2015-06-30');
    expect(sochDate('2015-06-30')).toBe('2015-06-30');
  });
});
