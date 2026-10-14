/**
 * CSV helpers shared by the export and the import path of the ICT Inventory
 * page (and the ICT Dashboard report).
 *
 * The exporter writes with `buildCsv`, the importer reads with `parseCsv`, so a
 * file that comes out of Export CSV can always be fed straight back into
 * Import CSV: every cell is quoted, embedded quotes are doubled, and a parser
 * that understands both (plus CRLF and a UTF-8 BOM) reads them back unchanged.
 */

export type CsvCell = string | number | boolean | null | undefined;

/** Quotes every field, doubling any quote inside it (RFC 4180). */
export function escapeCsvCell(v: CsvCell): string {
  if (v === null || v === undefined) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}

/** Builds a CSV document: header row first, then one line per record. */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\r\n');
}

/** Triggers a browser download of an already-built CSV document. */
export function downloadCsvFile(csv: string, filename: string) {
  // BOM so Excel reads non-ASCII characters (₱, ñ, …) as UTF-8. parseCsv
  // strips it again on the way back in.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Lower-cases a header and collapses punctuation, so "RAM (GB)" === "ram gb". */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Splits a CSV document into records, honouring quotes, embedded commas, embedded newlines and CRLF. */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = ''; records.push(row); row = [];
    } else if (ch === '\r') {
      if (text[i + 1] !== '\n') { row.push(field); field = ''; records.push(row); row = []; }
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) { row.push(field); records.push(row); }
  return records;
}

export interface ParsedCsv {
  headers: string[];
  /** Data rows (the header line is excluded), keyed by the header text as written. */
  rows: Record<string, string>[];
}

/** Parses a CSV document produced by `buildCsv` (or any other RFC 4180 writer). */
export function parseCsv(text: string): ParsedCsv {
  const records = parseRecords(text.replace(/^\uFEFF/, ''));
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows = records
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows };
}

/**
 * Reads a cell by any of the given header spellings, matching on the
 * normalized form so "RAM (GB)" and "ram gb" find each other.
 */
export function pickCell(row: Record<string, string>, ...keys: string[]): string {
  const entries = Object.entries(row);
  for (const key of keys) {
    const target = normalizeHeader(key);
    const hit = entries.find(([header]) => normalizeHeader(header) === target);
    if (hit) return hit[1];
  }
  return '';
}

/** "true"/"yes"/"1" (and the export's own "true") all mean yes. */
export function csvBoolean(v: string): boolean {
  return ['true', 'yes', 'y', '1'].includes(v.trim().toLowerCase());
}

/** Empty string becomes undefined, otherwise a parsed number (or undefined when not a number). */
export function csvNumber(v: string): number | undefined {
  const s = v.trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
