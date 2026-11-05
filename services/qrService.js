import QRCode from 'qrcode';
import { env } from '../config/env.js';

const QR_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 320,
  color: { dark: '#243447', light: '#FFFFFF' },
};

/** Address opened when the QR code is scanned. Contains only the random token. */
export function publicPassportUrl(token) {
  return `${env.publicAppUrl}/p/${token}`;
}

export function qrDataUrl(text) {
  return QRCode.toDataURL(text, QR_OPTIONS);
}

export function qrPngBuffer(text) {
  return QRCode.toBuffer(text, { ...QR_OPTIONS, type: 'png' });
}
