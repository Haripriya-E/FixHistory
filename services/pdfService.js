import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { resolveUploadPath } from '../middleware/upload.js';
import { formatDate } from '../utils/dates.js';

/**
 * PDF reports drawn with PDFKit.
 * Uses the built-in Helvetica font, so amounts are written as "INR 1,250"
 * (the rupee symbol is not part of the standard PDF fonts).
 */

const C = {
  dark: '#243447',
  navy: '#34495E',
  blue: '#5B7C99',
  text: '#263238',
  muted: '#718096',
  border: '#D9E0E8',
  zebra: '#F5F7FA',
  success: '#2E8B70',
  warning: '#D69E36',
  error: '#C65D5D',
};

const STATUS_COLORS = { active: C.success, expiring: C.warning, expired: C.error, none: C.muted };

const money = (n) => `INR ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = (d) => (d ? formatDate(d) : '-');

/** Keeps characters the standard PDF font can draw and shortens very long text. */
function clean(value, max = 260) {
  if (value === null || value === undefined || value === '') return '-';
  const text = String(value)
    .replace(/[^\x20-\x7E -ÿ\n]/g, '?')
    .replace(/\s+\n/g, '\n');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function createDoc(title) {
  return new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 56, left: 40, right: 40 },
    bufferPages: true,
    info: { Title: title, Author: 'FixHistory', Creator: 'FixHistory' },
  });
}

const contentWidth = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const bottomLimit = (doc) => doc.page.height - doc.page.margins.bottom;

function ensureSpace(doc, needed) {
  if (doc.y + needed > bottomLimit(doc)) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

function drawHeader(doc, title, subtitle) {
  const width = doc.page.width;
  doc.save().rect(0, 0, width, 80).fill(C.dark).restore();
  doc.save().rect(0, 80, width, 3).fill(C.blue).restore();
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#FFFFFF').text('FixHistory', 40, 24, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor('#C9D3DD').text('Digital Maintenance Passport', 40, 49, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF').text(title, 250, 24, { width: width - 290, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#C9D3DD').text(subtitle, 250, 46, { width: width - 290, align: 'right' });
  doc.x = doc.page.margins.left;
  doc.y = 104;
  doc.fillColor(C.text);
}

function sectionTitle(doc, title, note) {
  ensureSpace(doc, 70);
  doc.y += 10;
  const left = doc.page.margins.left;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.navy).text(title, left, doc.y);
  if (note) doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(note, left, doc.y + 1);
  const y = doc.y + 4;
  doc.save().moveTo(left, y).lineTo(left + contentWidth(doc), y).lineWidth(0.6).strokeColor(C.border).stroke().restore();
  doc.y = y + 8;
}

function statBoxes(doc, items, perRow = 3) {
  const left = doc.page.margins.left;
  const gap = 10;
  const width = (contentWidth(doc) - gap * (perRow - 1)) / perRow;
  const height = 50;
  for (let i = 0; i < items.length; i += perRow) {
    ensureSpace(doc, height + gap);
    const y = doc.y;
    items.slice(i, i + perRow).forEach((item, j) => {
      const x = left + j * (width + gap);
      doc.save().roundedRect(x, y, width, height, 4).lineWidth(0.7).fillAndStroke('#FFFFFF', C.border).restore();
      doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(item.label, x + 10, y + 9, { width: width - 20, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(13).fillColor(item.color || C.text).text(clean(item.value, 40), x + 10, y + 24, {
        width: width - 20,
        lineBreak: false,
      });
    });
    doc.y = y + height + gap;
  }
}

/**
 * Draws a table that continues on the next page when needed.
 * columns: [{ header, width (relative), align, value: (row) => text, color: (row) => hex }]
 */
function table(doc, columns, rows, emptyText = 'No records.') {
  const left = doc.page.margins.left;
  const totalWeight = columns.reduce((sum, c) => sum + c.width, 0);
  const widths = columns.map((c) => (c.width / totalWeight) * contentWidth(doc));
  const padX = 5;
  const padY = 5;

  const drawHead = () => {
    const y = doc.y;
    doc.save().rect(left, y, contentWidth(doc), 20).fill(C.navy).restore();
    let x = left;
    columns.forEach((col, i) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(col.header, x + padX, y + 6, {
        width: widths[i] - padX * 2,
        align: col.align || 'left',
        lineBreak: false,
      });
      x += widths[i];
    });
    doc.y = y + 20;
  };

  ensureSpace(doc, 46);
  drawHead();

  if (!rows.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.muted).text(emptyText, left + padX, doc.y + 7);
    doc.y += 8;
    return;
  }

  rows.forEach((row, rowIndex) => {
    const texts = columns.map((col) => clean(col.value(row), col.max || 260));
    // Measure each cell with the font it is drawn in (bold text is wider).
    const height =
      Math.max(
        ...texts.map((t, i) =>
          doc
            .font(columns[i].bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8.5)
            .heightOfString(t, { width: widths[i] - padX * 2 }),
        ),
      ) +
      padY * 2;

    if (doc.y + height > bottomLimit(doc)) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawHead();
    }

    const y = doc.y;
    if (rowIndex % 2 === 1) doc.save().rect(left, y, contentWidth(doc), height).fill(C.zebra).restore();
    let x = left;
    columns.forEach((col, i) => {
      doc
        .font(col.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8.5)
        .fillColor(col.color ? col.color(row) : C.text)
        .text(texts[i], x + padX, y + padY, { width: widths[i] - padX * 2, align: col.align || 'left' });
      x += widths[i];
    });
    doc.y = y + height;
    doc
      .save()
      .moveTo(left, doc.y)
      .lineTo(left + contentWidth(doc), doc.y)
      .lineWidth(0.4)
      .strokeColor(C.border)
      .stroke()
      .restore();
  });
  doc.x = left;
  doc.y += 6;
}

/** Simple horizontal bar chart for monthly spending. */
function monthlyBars(doc, months) {
  const left = doc.page.margins.left;
  const labelWidth = 62;
  const valueWidth = 96;
  const barMax = contentWidth(doc) - labelWidth - valueWidth - 10;
  const max = Math.max(...months.map((m) => m.total), 1);
  ensureSpace(doc, months.length * 16 + 10);
  months.forEach((m) => {
    const y = doc.y;
    doc.font('Helvetica').fontSize(8.5).fillColor(C.text).text(m.label, left, y + 2, { width: labelWidth, lineBreak: false });
    const barWidth = m.total > 0 ? Math.max(2, (m.total / max) * barMax) : 0;
    doc.save().rect(left + labelWidth, y + 2, barMax, 9).fill(C.zebra).restore();
    if (barWidth) doc.save().rect(left + labelWidth, y + 2, barWidth, 9).fill(C.blue).restore();
    doc.fillColor(C.text).text(money(m.total), left + labelWidth + barMax + 10, y + 2, {
      width: valueWidth,
      align: 'right',
      lineBreak: false,
    });
    doc.y = y + 16;
  });
  doc.y += 4;
}

function keyValueGrid(doc, pairs, width) {
  const left = doc.page.margins.left;
  const colWidth = (width ?? contentWidth(doc)) / 2;
  for (let i = 0; i < pairs.length; i += 2) {
    ensureSpace(doc, 30);
    const y = doc.y;
    pairs.slice(i, i + 2).forEach(([label, value], j) => {
      const x = left + j * colWidth;
      doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(label, x, y, { width: colWidth - 12, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text).text(clean(value, 70), x, y + 11, {
        width: colWidth - 12,
        lineBreak: false,
      });
    });
    doc.y = y + 28;
  }
}

function addFooters(doc, note) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // allow writing inside the bottom margin
    const y = doc.page.height - 34;
    doc
      .save()
      .moveTo(40, y - 6)
      .lineTo(doc.page.width - 40, y - 6)
      .lineWidth(0.5)
      .strokeColor(C.border)
      .stroke()
      .restore();
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted);
    doc.text(note, 40, y, { width: 360, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, doc.page.width - 140, y, { width: 100, align: 'right', lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
}

const warrantyColor = (row) => STATUS_COLORS[row.warranty.status] || C.text;

/** Full account report. Returns the PDFKit document; the caller pipes it to the response. */
export function renderSummaryPdf(report) {
  const doc = createDoc('FixHistory maintenance report');
  drawHeader(doc, 'Maintenance Report', `${report.owner.name}  |  Generated ${date(report.generatedAt)}`);

  sectionTitle(doc, 'Summary');
  statBoxes(doc, [
    { label: 'Total assets', value: String(report.totals.assets) },
    { label: 'Maintenance records', value: String(report.totals.records) },
    { label: 'Total maintenance expenses', value: money(report.totals.totalExpenses) },
    { label: 'Active warranties', value: String(report.warranty.active + report.warranty.expiring), color: C.success },
    { label: 'Expired warranties', value: String(report.warranty.expired), color: C.error },
    {
      label: 'Services due / overdue',
      value: `${report.totals.upcomingServices} / ${report.totals.overdueServices}`,
      color: C.warning,
    },
  ]);

  sectionTitle(doc, 'Asset register', `${report.assets.length} asset(s) currently owned`);
  table(
    doc,
    [
      { header: 'Asset ID', width: 1.35, value: (r) => r.assetId },
      { header: 'Asset', width: 1.75, value: (r) => r.name, bold: true },
      { header: 'Category', width: 1.25, value: (r) => r.category },
      { header: 'Brand / model', width: 1.55, value: (r) => [r.brand, r.model].filter(Boolean).join(' ') },
      { header: 'Purchased', width: 1, value: (r) => date(r.purchaseDate) },
      { header: 'Price', width: 1.1, align: 'right', value: (r) => (r.purchasePrice != null ? money(r.purchasePrice) : '-') },
    ],
    report.assets,
    'No assets registered yet.',
  );

  sectionTitle(doc, 'Asset-wise maintenance expenses');
  table(
    doc,
    [
      { header: 'Asset', width: 2, value: (r) => r.name, bold: true },
      { header: 'Records', width: 0.8, align: 'right', value: (r) => String(r.recordCount) },
      { header: 'Total cost', width: 1.2, align: 'right', value: (r) => money(r.totalExpense) },
      { header: 'Last service', width: 1.1, value: (r) => date(r.lastServiceDate) },
      { header: 'Next service', width: 1.1, value: (r) => date(r.nextServiceDate) },
    ],
    report.assetExpenses,
    'No assets registered yet.',
  );

  sectionTitle(doc, 'Monthly maintenance expenses', 'Last 12 months, by service date');
  monthlyBars(doc, report.monthlyExpenses);

  sectionTitle(doc, 'Spending by service type');
  table(
    doc,
    [
      { header: 'Service type', width: 2, value: (r) => r.type },
      { header: 'Records', width: 1, align: 'right', value: (r) => String(r.count) },
      { header: 'Total cost', width: 1.4, align: 'right', value: (r) => money(r.total) },
    ],
    report.byType.filter((t) => t.count > 0),
    'No maintenance records yet.',
  );

  sectionTitle(doc, 'Warranty status');
  table(
    doc,
    [
      { header: 'Asset', width: 2, value: (r) => r.name, bold: true },
      { header: 'Start', width: 1, value: (r) => date(r.warrantyStart) },
      { header: 'Expiry', width: 1, value: (r) => date(r.warrantyExpiry) },
      {
        header: 'Days left',
        width: 0.9,
        align: 'right',
        value: (r) => (r.warranty.remainingDays == null ? '-' : String(Math.max(0, r.warranty.remainingDays))),
      },
      { header: 'Status', width: 1.1, value: (r) => r.warranty.label, color: warrantyColor, bold: true },
    ],
    [...report.assets].sort((a, b) => (a.warrantyExpiry?.getTime?.() ?? Infinity) - (b.warrantyExpiry?.getTime?.() ?? Infinity)),
    'No assets registered yet.',
  );

  sectionTitle(doc, 'Maintenance history', `${report.maintenance.length} record(s), newest first`);
  table(
    doc,
    [
      { header: 'Date', width: 0.95, value: (r) => date(r.serviceDate) },
      { header: 'Asset', width: 1.3, value: (r) => r.asset?.name, bold: true },
      { header: 'Type', width: 1.15, value: (r) => r.serviceType },
      { header: 'Work performed', width: 2.6, value: (r) => r.workPerformed, max: 180 },
      { header: 'Provider', width: 1.3, value: (r) => r.serviceProvider },
      { header: 'Cost', width: 1, align: 'right', value: (r) => money(r.cost) },
    ],
    report.maintenance,
    'No maintenance records yet.',
  );

  addFooters(doc, `FixHistory report for ${report.owner.name} - contains private information`);
  return doc;
}

/** Single-asset passport report. */
export function renderAssetPdf(data, { qrPng } = {}) {
  const { asset, warranty, records, history, summary } = data;
  const doc = createDoc(`Asset passport ${asset.assetId}`);
  drawHeader(doc, 'Asset Passport', `${asset.assetId}  |  Generated ${date(data.generatedAt)}`);

  const left = doc.page.margins.left;
  const top = doc.y;
  const sideWidth = 120;
  const hasSide = Boolean(qrPng) || ['image/jpeg', 'image/png'].includes(asset.image?.mimeType);
  const mainWidth = hasSide ? contentWidth(doc) - sideWidth - 16 : contentWidth(doc);

  doc.font('Helvetica-Bold').fontSize(17).fillColor(C.text).text(clean(asset.name, 80), left, top, { width: mainWidth });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(C.muted)
    .text(clean([asset.category, asset.brand, asset.model].filter(Boolean).join('  |  '), 120), left, doc.y + 2, {
      width: mainWidth,
    });
  doc.y += 12;

  keyValueGrid(
    doc,
    [
      ['Asset ID', asset.assetId],
      ['Serial number', asset.serialNumber || '-'],
      ['Purchase date', date(asset.purchaseDate)],
      ['Purchase price', asset.purchasePrice != null ? money(asset.purchasePrice) : '-'],
      ['Seller / vendor', asset.seller || '-'],
      ['Current owner', asset.currentOwner?.name || '-'],
      ['Warranty period', asset.warrantyExpiry ? `${date(asset.warrantyStart)} to ${date(asset.warrantyExpiry)}` : '-'],
      ['Warranty status', warranty.remainingDays != null && warranty.remainingDays >= 0 ? `${warranty.label} (${warranty.remainingDays} days left)` : warranty.label],
    ],
    mainWidth,
  );
  const afterGrid = doc.y;

  // Right column: asset photo and/or QR code
  let sideY = top;
  if (['image/jpeg', 'image/png'].includes(asset.image?.mimeType)) {
    try {
      const imagePath = resolveUploadPath('assets', asset.image.filename);
      if (fs.existsSync(imagePath)) {
        doc.image(imagePath, left + contentWidth(doc) - sideWidth, sideY, { fit: [sideWidth, 90], align: 'center' });
        sideY += 98;
      }
    } catch {
      // ignore unreadable images; the rest of the report is still useful
    }
  }
  if (qrPng) {
    const x = left + contentWidth(doc) - sideWidth;
    doc.image(qrPng, x + 10, sideY, { width: sideWidth - 20 });
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text('Scan to open the public passport', x, sideY + sideWidth - 16, { width: sideWidth, align: 'center' });
    sideY += sideWidth + 4;
  }
  doc.y = Math.max(afterGrid, sideY) + 4;
  doc.x = left;

  if (asset.description) {
    doc.font('Helvetica').fontSize(9).fillColor(C.text).text(clean(asset.description, 600), left, doc.y, { width: contentWidth(doc) });
    doc.y += 6;
  }

  sectionTitle(doc, 'Maintenance summary');
  statBoxes(
    doc,
    [
      { label: 'Maintenance records', value: String(summary.recordCount) },
      { label: 'Total maintenance cost', value: money(summary.totalCost) },
      { label: 'Last service', value: date(summary.lastServiceDate) },
      { label: 'Next service', value: date(summary.nextServiceDate) },
    ],
    4,
  );

  sectionTitle(doc, 'Ownership history');
  table(
    doc,
    [
      { header: 'Date', width: 1, value: (r) => date(r.transferDate) },
      { header: 'Event', width: 1, value: (r) => (r.transferStatus === 'Registered' ? 'Registered' : 'Ownership transferred') },
      { header: 'From', width: 1.4, value: (r) => r.previousOwnerName || '-' },
      { header: 'To', width: 1.4, value: (r) => r.newOwnerName || '-' },
    ],
    history,
    'No ownership history recorded.',
  );

  sectionTitle(doc, 'Maintenance timeline', 'Newest first');
  table(
    doc,
    [
      { header: 'Date', width: 0.95, value: (r) => date(r.serviceDate) },
      { header: 'Type', width: 1.05, value: (r) => r.serviceType },
      {
        header: 'Problem and work performed',
        width: 2.9,
        max: 420,
        value: (r) => [r.problemDescription && `Problem: ${r.problemDescription}`, `Work: ${r.workPerformed}`].filter(Boolean).join('\n'),
      },
      { header: 'Parts replaced', width: 1.3, value: (r) => (r.replacedParts?.length ? r.replacedParts.join(', ') : '-') },
      {
        header: 'Provider',
        width: 1.3,
        value: (r) => [r.serviceProvider, r.technician].filter(Boolean).join('\n') || '-',
      },
      { header: 'Cost', width: 0.95, align: 'right', value: (r) => money(r.cost) },
    ],
    records,
    'No maintenance records yet.',
  );

  addFooters(doc, `FixHistory passport ${asset.assetId} - private owner copy`);
  return doc;
}
