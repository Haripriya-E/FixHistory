/**
 * Loads environment variables and exposes a typed configuration object.
 *
 * The app reads `FixHistory/.env` first (recommended) and then `FixHistory/server/.env`
 * as a fallback. Values already present in the environment are never overwritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(serverDir, '..');

for (const envFile of [path.join(rootDir, '.env'), path.join(serverDir, '.env')]) {
  if (fs.existsSync(envFile)) dotenv.config({ path: envFile, quiet: true });
}

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const trimSlash = (url) => String(url).trim().replace(/\/+$/, '');

// `node server.js --production` forces production mode (used by `npm start` in the root folder).
const nodeEnv = process.argv.includes('--production') ? 'production' : process.env.NODE_ENV || 'development';

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: toNumber(process.env.PORT, 5000),
  mongoUri: (process.env.MONGODB_URI || '').trim(),
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: trimSlash(process.env.CLIENT_URL || 'http://localhost:5173'),
  publicAppUrl: trimSlash(process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || 'http://localhost:5173'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  maxUploadMb: toNumber(process.env.MAX_UPLOAD_MB, 5),
  reminderWindowDays: toNumber(process.env.REMINDER_WINDOW_DAYS, 30),
  transferExpiryHours: toNumber(process.env.TRANSFER_EXPIRY_HOURS, 72),
  serverDir,
  rootDir,
  uploadDir: path.join(serverDir, 'uploads'),
  clientDistDir: path.join(rootDir, 'client', 'dist'),
};

/** Returns a list of human-readable configuration problems (empty when everything is fine). */
export function getConfigProblems() {
  const problems = [];
  if (!env.mongoUri) {
    problems.push('MONGODB_URI is missing. Add it to FixHistory/.env (run `npm run setup` to create the file).');
  } else if (!/^mongodb(\+srv)?:\/\//.test(env.mongoUri)) {
    problems.push('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }
  if (!env.jwtSecret || env.jwtSecret.length < 32 || env.jwtSecret.startsWith('replace_with')) {
    problems.push('JWT_SECRET must be a random value of at least 32 characters. Run `npm run setup` or edit FixHistory/.env.');
  }
  return problems;
}

/** Converts values such as "7d", "12h", "30m" or "45s" to milliseconds. */
export function durationToMs(value, fallbackMs = 7 * 24 * 60 * 60 * 1000) {
  const match = /^(\d+)\s*([smhd])$/i.exec(String(value).trim());
  if (!match) return fallbackMs;
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2].toLowerCase()];
  return Number(match[1]) * unit;
}
