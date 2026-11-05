import { findOwnedAsset } from '../services/assetService.js';
import { renderAssetPdf, renderSummaryPdf } from '../services/pdfService.js';
import { publicPassportUrl, qrPngBuffer } from '../services/qrService.js';
import { buildAssetReport, buildSummaryReport } from '../services/reportService.js';
import { sendSuccess } from '../utils/response.js';

/** GET /api/reports/summary - all report data as JSON (shown on the Reports page) */
export async function summary(req, res) {
  sendSuccess(res, await buildSummaryReport(req.user));
}

function streamPdf(res, doc, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  doc.pipe(res);
  doc.end();
}

/**
 * GET /api/reports/pdf            - full report for all of the user's assets
 * GET /api/reports/pdf?asset=<id> - passport report for one asset
 */
export async function pdf(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const { asset: assetId } = req.validatedQuery;

  if (assetId) {
    const asset = await findOwnedAsset(req.user._id, assetId);
    const data = await buildAssetReport(asset);
    const qrPng = asset.publicPassport.enabled
      ? await qrPngBuffer(publicPassportUrl(asset.publicPassport.token))
      : null;
    return streamPdf(res, renderAssetPdf(data, { qrPng }), `FixHistory-${asset.assetId}-${today}.pdf`);
  }

  const report = await buildSummaryReport(req.user);
  return streamPdf(res, renderSummaryPdf(report), `FixHistory-report-${today}.pdf`);
}
