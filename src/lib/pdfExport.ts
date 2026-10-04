import jsPDF from 'jspdf';
import { formatUtc8DateStamp, formatUtc8Stamp } from './utils';
import type {
  Ticket,
  TicketActivity,
  TicketAttachment,
  TicketPriority,
  TicketStatus,
} from '@/types/types';

type Rgb = [number, number, number];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 26;
const CONTENT_TOP = HEADER_H + 4;
const FOOTER_Y = PAGE_H - 8;

const C_ACCENT: Rgb = [255, 69, 0];
const C_TEXT: Rgb = [17, 24, 39];
const C_BODY: Rgb = [55, 65, 81];
const C_MUTED: Rgb = [107, 114, 128];
const C_LINE: Rgb = [229, 231, 235];
const C_ROW: Rgb = [243, 244, 246];

const STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'NEW',
  assigned: 'ASSIGNED',
  in_progress: 'IN PROGRESS',
  resolved: 'RESOLVED',
  on_hold: 'ON HOLD',
  verified: 'VERIFIED',
  closed: 'CLOSED',
};

const STATUS_COLORS: Record<TicketStatus, Rgb> = {
  new: [59, 130, 246],
  assigned: [245, 158, 11],
  in_progress: [20, 184, 166],
  resolved: [34, 197, 94],
  on_hold: [168, 85, 247],
  verified: [16, 185, 129],
  closed: [107, 114, 128],
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

const PRIORITY_COLORS: Record<TicketPriority, Rgb> = {
  low: [107, 114, 128],
  medium: [59, 130, 246],
  high: [245, 158, 11],
  critical: [220, 38, 38],
};

const STATUS_ORDER: TicketStatus[] = ['new', 'assigned', 'in_progress', 'on_hold', 'resolved', 'verified', 'closed'];
const PRIORITY_ORDER: TicketPriority[] = ['low', 'medium', 'high', 'critical'];

let bayuganLogoDataUrl: string | null = null;

async function loadBayuganLogo(): Promise<string | null> {
  if (bayuganLogoDataUrl) return bayuganLogoDataUrl;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}bayugan_logo.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    bayuganLogoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return bayuganLogoDataUrl;
  } catch {
    return null;
  }
}

/** Add the branded header block to the current page. */
function addHeader(pdf: jsPDF, title: string, meta: string) {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_W, HEADER_H, 'F');
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.6);
  pdf.line(0, HEADER_H, PAGE_W, HEADER_H);

  if (bayuganLogoDataUrl) {
    const logoH = 16;
    const logoW = logoH * (2280 / 2273);
    pdf.addImage(bayuganLogoDataUrl, 'PNG', MARGIN, (HEADER_H - logoH) / 2, logoW, logoH);
  }

  pdf.setFont('courier', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(10);
  pdf.text('CITY INFORMATION OFFICE', PAGE_W / 2, 9, { align: 'center' });
  pdf.setFontSize(8);
  pdf.text('OPERATIONS DIVISION', PAGE_W / 2, 13.5, { align: 'center' });

  pdf.setFont('courier', 'normal');
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(7);
  pdf.text(title, PAGE_W / 2, 18, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  pdf.text(meta, PAGE_W / 2, 22, { align: 'center' });
}

/** Add footer (confidential note, page numbers, generation stamp) to every page. */
function addFooter(pdf: jsPDF) {
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2]);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, FOOTER_Y - 3, PAGE_W - MARGIN, FOOTER_Y - 3);
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
    pdf.text('IT HELPDESK SYSTEM \u00B7 CONFIDENTIAL', MARGIN, FOOTER_Y);
    pdf.text(`PAGE ${i} / ${pages}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' });
    pdf.text(`GENERATED: ${formatUtc8Stamp(new Date())} +08:00`, PAGE_W / 2, FOOTER_Y, { align: 'center' });
  }
}

/** Start a fresh page with header and return the top content Y position. */
function nextPage(pdf: jsPDF, title: string, meta: string): number {
  pdf.addPage();
  addHeader(pdf, title, meta);
  return CONTENT_TOP;
}

/** Add a page if the block would overflow the printable area. */
function ensureSpace(pdf: jsPDF, y: number, needed: number, title: string, meta: string): number {
  return y + needed > FOOTER_Y - 6 ? nextPage(pdf, title, meta) : y;
}

/** Draw a section label with a trailing accent rule. */
function sectionHeader(pdf: jsPDF, y: number, label: string): number {
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(C_ACCENT[0], C_ACCENT[1], C_ACCENT[2]);
  const s = label.toUpperCase();
  pdf.text(s, MARGIN, y + 3.5);
  const w = pdf.getTextWidth(s);
  pdf.setDrawColor(C_ACCENT[0], C_ACCENT[1], C_ACCENT[2]);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN + w + 3, y + 4.5, PAGE_W - MARGIN, y + 4.5);
  return y + 8;
}

/** Draw a filled badge (used for status / priority / SLA). */
function drawBadge(pdf: jsPDF, x: number, y: number, w: number, text: string, color: Rgb) {
  const h = 7;
  pdf.setFillColor(color[0], color[1], color[2]);
  pdf.roundedRect(x, y, w, h, 1.2, 1.2, 'F');
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text(text, x + w / 2, y + h / 2 + 1.2, { align: 'center' });
}

/** Draw a small muted label above a badge. */
function badgeLabel(pdf: jsPDF, x: number, y: number, label: string) {
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(6);
  pdf.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
  pdf.text(label.toUpperCase(), x, y);
}

/** Draw a single label/value cell; returns the cell height used. */
function kvCell(pdf: jsPDF, x: number, y: number, w: number, label: string, value: string): number {
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
  pdf.text(label.toUpperCase(), x, y);
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
  const lines = pdf.splitTextToSize(value || '\u2014', w);
  pdf.text(lines, x, y + 3.8, { lineHeightFactor: 1.5 });
  return 3.5 + lines.length * 4.3;
}

/** Draw a responsive 2-column key/value grid. */
function kvGrid(pdf: jsPDF, y: number, entries: Array<[string, string]>, title: string, meta: string): number {
  const gap = 8;
  const colW = (CONTENT_W - gap) / 2;
  for (let i = 0; i < entries.length; i += 2) {
    const pair = entries.slice(i, i + 2);
    let rowH = 9.5;
    for (const e of pair) {
      const n = e ? pdf.splitTextToSize(e[1] || '\u2014', colW).length : 0;
      rowH = Math.max(rowH, 3.5 + n * 4.3);
    }
    y = ensureSpace(pdf, y, rowH, title, meta);
    for (let c = 0; c < pair.length; c++) {
      kvCell(pdf, MARGIN + c * (colW + gap), y, colW, pair[c][0], pair[c][1]);
    }
    y += rowH;
  }
  return y;
}

/** Draw a body paragraph with wrapping and page-break support. */
function drawParagraph(pdf: jsPDF, y: number, text: string, title: string, meta: string, color: Rgb = C_BODY): number {
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(color[0], color[1], color[2]);
  const lines = pdf.splitTextToSize(text || '\u2014', CONTENT_W);
  for (const ln of lines) {
    y = ensureSpace(pdf, y, 4.2, title, meta);
    pdf.text(ln, MARGIN, y + 2.5);
    y += 4.2;
  }
  return y + 2;
}

interface TableCol {
  header: string;
  width: number;
}

/** Draw a table header row; returns the Y position after it. */
function tableHeader(pdf: jsPDF, y: number, cols: TableCol[]): number {
  pdf.setFillColor(C_ROW[0], C_ROW[1], C_ROW[2]);
  pdf.rect(MARGIN, y - 2.5, CONTENT_W, 6, 'F');
  pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2]);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, y + 3.5, PAGE_W - MARGIN, y + 3.5);
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
  let x = MARGIN;
  for (const c of cols) {
    pdf.text(c.header.toUpperCase(), x + 1, y + 0.5);
    x += c.width;
  }
  return y + 6.5;
}

/** Draw a generic data table with wrapping, alternating rows and page breaks. */
function drawTable(
  pdf: jsPDF,
  y: number,
  cols: TableCol[],
  rows: Array<Array<string>>,
  title: string,
  meta: string,
  colAlign: Array<'left' | 'right'> = [],
): number {
  y = ensureSpace(pdf, y, 12, title, meta);
  y = tableHeader(pdf, y, cols);
  rows.forEach((cells, ri) => {
    const heights = cells.map((c, ci) => pdf.splitTextToSize(c || '', cols[ci].width).length * 3.6 + 3.5);
    const rowH = Math.max(6, ...heights);
    const next = ensureSpace(pdf, y, rowH + 2, title, meta);
    if (next !== y) {
      y = tableHeader(pdf, next, cols);
    }
    if (ri % 2 === 1) {
      pdf.setFillColor(C_ROW[0], C_ROW[1], C_ROW[2]);
      pdf.rect(MARGIN, y - 2, CONTENT_W, rowH, 'F');
    }
    let x = MARGIN;
    cells.forEach((c, ci) => {
      const align = colAlign[ci] === 'right' ? 'right' : 'left';
      const drawX = align === 'right' ? x + cols[ci].width : x + 1;
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
      const lines = pdf.splitTextToSize(c || '', cols[ci].width);
      pdf.text(lines, drawX, y + 2.2, { align, lineHeightFactor: 1.4 });
      x += cols[ci].width;
    });
    y += rowH;
  });
  return y + 2;
}

/** Draw a horizontal bar row (label, count, colored bar). */
function drawBarRow(
  pdf: jsPDF,
  y: number,
  label: string,
  valueText: string,
  value: number,
  max: number,
  color: Rgb,
  title: string,
  meta: string,
): number {
  const labelW = 66;
  const valW = 18;
  const barX = MARGIN + labelW + valW;
  const barW = PAGE_W - MARGIN - barX;
  y = ensureSpace(pdf, y, 9, title, meta);
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
  pdf.text(label, MARGIN + 1, y + 3);
  pdf.setFont('courier', 'bold');
  pdf.text(valueText, barX - 2, y + 3, { align: 'right' });
  pdf.setFillColor(C_ROW[0], C_ROW[1], C_ROW[2]);
  pdf.rect(barX, y, barW, 4, 'F');
  if (max > 0 && value > 0) {
    const w = Math.max(1.2, (value / max) * barW);
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.rect(barX, y, w, 4, 'F');
  }
  pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2]);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN, y + 7, PAGE_W - MARGIN, y + 7);
  return y + 9;
}

/** Draw a row of KPI cards. */
function drawKpis(
  pdf: jsPDF,
  y: number,
  items: Array<{ label: string; value: string; color?: Rgb }>,
  title: string,
  meta: string,
): number {
  const gap = 5;
  const w = (CONTENT_W - gap * (items.length - 1)) / items.length;
  const h = 18;
  y = ensureSpace(pdf, y, h + 4, title, meta);
  items.forEach((it, i) => {
    const x = MARGIN + i * (w + gap);
    pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2]);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(x, y, w, h, 1.5, 1.5, 'S');
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(6.3);
    pdf.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
    pdf.text(it.label.toUpperCase(), x + w / 2, y + 5.5, { align: 'center' });
    const c = it.color ?? C_TEXT;
    pdf.setTextColor(c[0], c[1], c[2]);
    pdf.setFont('courier', 'bold');
    pdf.setFontSize(15);
    pdf.text(it.value, x + w / 2, y + 13.5, { align: 'center' });
  });
  return y + h + 4;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return '\u2014';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  comment: 'COMMENT',
  status_change: 'STATUS',
  assignment: 'ASSIGN',
  resolution: 'RESOLUTION',
  attachment: 'ATTACHMENT',
  system: 'SYSTEM',
};

function activityLabel(type: string): string {
  return ACTIVITY_TYPE_LABELS[type] || type.toUpperCase();
}

function activityText(a: TicketActivity): string {
  const base = (a.content || '').trim();
  const change =
    a.old_value && a.new_value
      ? `${a.old_value.replace(/_/g, ' ')} -> ${a.new_value.replace(/_/g, ' ')}`
      : '';
  return [base, change].filter(Boolean).join(' \u2014 ') || '\u2014';
}

export interface TicketPdfData {
  ticket: Ticket;
  activities: TicketActivity[];
  attachments: TicketAttachment[];
}

/**
 * Export a ticket detail report to PDF.
 */
export async function exportTicketToPdf(data: TicketPdfData): Promise<void> {
  const { ticket, activities, attachments } = data;
  const title = 'IT HELPDESK \u2014 TICKET REPORT';
  const meta = `EXPORTED ${formatUtc8DateStamp(new Date())} \u00B7 ${STATUS_LABELS[ticket.status]} \u00B7 ${PRIORITY_LABELS[ticket.priority]}`;
  bayuganLogoDataUrl = await loadBayuganLogo();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addHeader(pdf, title, meta);

  let y = CONTENT_TOP;

  // Ticket number + subject
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
  pdf.text(ticket.ticket_number, MARGIN, y + 4);
  y += 4;
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(C_BODY[0], C_BODY[1], C_BODY[2]);
  const subjLines = pdf.splitTextToSize(ticket.subject || '', CONTENT_W);
  pdf.text(subjLines, MARGIN, y + 4.5);
  y += 4.5 + (subjLines.length - 1) * 4.8 + 4;

  // Badges
  const badgeW = 34;
  badgeLabel(pdf, MARGIN, y, 'STATUS');
  drawBadge(pdf, MARGIN, y + 2.5, badgeW, STATUS_LABELS[ticket.status], STATUS_COLORS[ticket.status]);
  const x2 = MARGIN + badgeW + 8;
  badgeLabel(pdf, x2, y, 'PRIORITY');
  drawBadge(pdf, x2, y + 2.5, badgeW, PRIORITY_LABELS[ticket.priority], PRIORITY_COLORS[ticket.priority]);
  const x3 = x2 + badgeW + 8;
  let slaText = 'NO SLA';
  let slaColor: Rgb = C_MUTED;
  if (ticket.sla_due_at) {
    if (ticket.sla_breached) {
      slaText = 'SLA BREACHED';
      slaColor = [220, 38, 38];
    } else if (ticket.status === 'closed' || ticket.status === 'resolved' || ticket.status === 'verified') {
      slaText = 'SLA MET';
      slaColor = [22, 163, 74];
    } else {
      slaText = 'ON TRACK';
      slaColor = [22, 163, 74];
    }
  }
  badgeLabel(pdf, x3, y, 'SLA');
  const slaW = Math.max(badgeW, pdf.getTextWidth(slaText) + 6);
  drawBadge(pdf, x3, y + 2.5, slaW, slaText, slaColor);
  y += 12;

  // Ticket information
  y = sectionHeader(pdf, y, 'Ticket Information');
  const requester = ticket.requester
    ? ticket.requester.full_name || ticket.requester.username || '\u2014'
    : '\u2014';
  y = kvGrid(pdf, y, [
    ['Requester', requester],
    ['Office', ticket.requester?.office || ticket.office || '\u2014'],
    ['Contact', ticket.requester?.contact || ticket.contact || '\u2014'],
    ['Location', ticket.location || '\u2014'],
    ['Category', ticket.category?.name || '\u2014'],
    ['Subcategory', ticket.subcategory?.name || '\u2014'],
    ['Assigned To', ticket.assignee?.full_name || ticket.assignee?.username || 'Unassigned'],
    ['Created', formatUtc8Stamp(ticket.created_at, 16)],
    ['SLA Due', ticket.sla_due_at ? formatUtc8Stamp(ticket.sla_due_at, 16) : '\u2014'],
    ['Resolved', ticket.resolved_at ? formatUtc8Stamp(ticket.resolved_at, 16) : '\u2014'],
  ], title, meta);
  y += 2;

  // Description / Resolution / Remarks
  y = sectionHeader(pdf, y, 'Description');
  y = drawParagraph(pdf, y, ticket.description ?? '', title, meta);

  if (ticket.resolution) {
    y = sectionHeader(pdf, y, 'Resolution');
    y = drawParagraph(pdf, y, ticket.resolution, title, meta);
  }
  if (ticket.remarks) {
    y = sectionHeader(pdf, y, 'Remarks');
    y = drawParagraph(pdf, y, ticket.remarks, title, meta, C_MUTED);
  }

  // Activities
  y += 2;
  y = sectionHeader(pdf, y, 'Activity Timeline');
  if (activities.length === 0) {
    y = drawParagraph(pdf, y, 'No activity recorded.', title, meta);
  } else {
    y = drawTable(pdf, y, [
      { header: 'TIME', width: 38 },
      { header: 'ACTOR', width: 42 },
      { header: 'TYPE', width: 26 },
      { header: 'DETAILS', width: 80 },
    ], activities.map(a => [
      formatUtc8Stamp(a.created_at, 16),
      a.actor?.full_name || a.actor?.username || (a.actor_id ? 'User' : 'System'),
      activityLabel(a.activity_type),
      activityText(a),
    ]), title, meta);
  }

  // Attachments
  y += 2;
  y = sectionHeader(pdf, y, 'Attachments');
  if (attachments.length === 0) {
    y = drawParagraph(pdf, y, 'No attachments.', title, meta);
  } else {
    y = drawTable(pdf, y, [
      { header: 'FILE NAME', width: 94 },
      { header: 'SIZE', width: 34 },
      { header: 'UPLOAD DATE', width: 58 },
    ], attachments.map(at => [
      at.file_name,
      formatFileSize(at.file_size),
      formatUtc8DateStamp(at.created_at),
    ]), title, meta, ['left', 'right', 'left']);
  }

  addFooter(pdf);
  pdf.save(`ticket-${ticket.ticket_number}.pdf`);
}

export interface ReportsPdfData {
  tickets: Ticket[];
  idRequestCount: number;
  period?: string;
}

/**
 * Export the reports dashboard to PDF.
 */
export async function exportReportsToPdf(data: ReportsPdfData): Promise<void> {
  const { tickets, idRequestCount, period } = data;
  const title = 'IT HELPDESK \u2014 REPORTS';
  const meta = `PERIOD: ${period ?? 'ALL TIME'} \u00B7 ${formatUtc8DateStamp(new Date())}`;
  bayuganLogoDataUrl = await loadBayuganLogo();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addHeader(pdf, title, meta);

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byTech: Record<string, number> = {};
  let slaBreached = 0;
  tickets.forEach(t => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    const cat = t.category?.name || 'Uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    const tech = t.assignee?.full_name || t.assignee?.username || 'Unassigned';
    byTech[tech] = (byTech[tech] || 0) + 1;
    if (t.sla_breached) slaBreached++;
  });
  const total = tickets.length || 1;
  const compliance = tickets.length > 0 ? ((tickets.length - slaBreached) / tickets.length) * 100 : 100;
  const closed = byStatus['closed'] || 0;

  let y = CONTENT_TOP;

  // KPI cards
  y = sectionHeader(pdf, y, 'Key Performance Indicators');
  y = drawKpis(pdf, y, [
    { label: 'Total Tickets', value: String(tickets.length) },
    {
      label: 'SLA Compliance',
      value: `${compliance.toFixed(1)}%`,
      color: compliance >= 90 ? [22, 163, 74] : compliance >= 80 ? [245, 158, 11] : [220, 38, 38],
    },
    { label: 'SLA Breached', value: String(slaBreached), color: slaBreached > 0 ? [220, 38, 38] : [22, 163, 74] },
    { label: 'Closed', value: String(closed) },
    { label: 'ID Requests', value: String(idRequestCount) },
  ], title, meta);
  y += 2;

  // By status
  y = sectionHeader(pdf, y, 'Tickets by Status');
  const statusEntries = STATUS_ORDER.filter(s => byStatus[s]).map(s => ({ s, n: byStatus[s] }));
  const statusMax = Math.max(1, ...statusEntries.map(e => e.n));
  statusEntries.forEach(e => {
    y = drawBarRow(pdf, y, STATUS_LABELS[e.s], String(e.n), e.n, statusMax, STATUS_COLORS[e.s], title, meta);
  });
  y += 2;

  // By priority
  y = sectionHeader(pdf, y, 'Tickets by Priority');
  PRIORITY_ORDER.forEach(p => {
    const n = byPriority[p] || 0;
    y = drawBarRow(pdf, y, PRIORITY_LABELS[p], `${n} (${((n / total) * 100).toFixed(1)}%)`, n, total, PRIORITY_COLORS[p], title, meta);
  });
  y += 2;

  // Top categories
  y = sectionHeader(pdf, y, 'Top Categories');
  const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const catMax = Math.max(1, ...catEntries.map(e => e[1]));
  catEntries.forEach(([name, n]) => {
    y = drawBarRow(pdf, y, name, String(n), n, catMax, C_ACCENT, title, meta);
  });
  y += 2;

  // By technician
  y = sectionHeader(pdf, y, 'Tickets by Technician');
  const techEntries = Object.entries(byTech).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const techMax = Math.max(1, ...techEntries.map(e => e[1]));
  techEntries.forEach(([name, n]) => {
    y = drawBarRow(pdf, y, name, String(n), n, techMax, [59, 130, 246], title, meta);
  });

  addFooter(pdf);
  pdf.save(`helpdesk-report-${formatUtc8DateStamp(new Date())}.pdf`);
}