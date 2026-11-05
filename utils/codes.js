import crypto from 'node:crypto';
import { env } from '../config/env.js';

// No 0/O or 1/I/L so codes are easy to read aloud and type.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomString(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

/** Human-readable asset ID, e.g. FH-7KQ29XMR */
export function generateAssetCode() {
  return `FH-${randomString(8)}`;
}

/** Ownership transfer code shown once to the current owner, e.g. 4KXQ-92MT-HZ7P */
export function generateTransferCode() {
  const raw = randomString(12);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** Removes spaces/dashes and upper-cases a code typed by a user. */
export function normaliseTransferCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Transfer codes are never stored in plain text. We store an HMAC so that a
 * database leak does not reveal usable codes.
 */
export function hashTransferCode(code) {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`transfer:${normaliseTransferCode(code)}`)
    .digest('hex');
}

/** Unguessable token used in public QR passport links. */
export function generatePublicToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/** Escapes user input before it is used inside a MongoDB regular expression. */
export function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
