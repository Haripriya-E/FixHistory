/**
 * Creates the `.env` file from `.env.example` and generates a random JWT secret.
 * Usage (from the FixHistory folder):  npm run setup
 *
 * If `.env` already exists it is left untouched, so your settings are never overwritten.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const examplePath = path.join(root, '.env.example');
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  console.log('.env already exists - nothing changed.');
  console.log('Edit FixHistory/.env if you need to change MONGODB_URI or other settings.');
  process.exit(0);
}

if (!fs.existsSync(examplePath)) {
  console.error('Could not find .env.example in', root);
  process.exit(1);
}

const secret = crypto.randomBytes(48).toString('hex');
const content = fs
  .readFileSync(examplePath, 'utf8')
  .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);

fs.writeFileSync(envPath, content, 'utf8');
console.log('Created FixHistory/.env with a new random JWT_SECRET.');
console.log('MONGODB_URI is set to a local MongoDB (mongodb://127.0.0.1:27017/fixhistory).');
console.log('If you use MongoDB Atlas, open .env and replace MONGODB_URI with your Atlas connection string.');
