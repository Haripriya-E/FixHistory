/**
 * API integration tests (Node's built-in test runner).
 *
 * Requires a running MongoDB (the MONGODB_URI from .env). The tests use a
 * separate database called "fixhistory_test", which is wiped before the run,
 * so your normal data is never touched.
 *
 * Run from the FixHistory folder:  npm test
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
const { env } = await import('../config/env.js');
const { default: mongoose } = await import('mongoose');
const { createApp } = await import('../app.js');
const { ensureUploadFolders, UPLOAD_FOLDERS } = await import('../middleware/upload.js');

// Remember which uploaded files existed before the tests, so only test files are removed afterwards.
const listUploads = () =>
  Object.values(UPLOAD_FOLDERS).flatMap((dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => path.join(dir, f)) : []));
let uploadsBefore = new Set();

const TEST_DB = 'fixhistory_test';
let server;
let baseUrl;

// 1x1 PNG and a minimal PDF used as upload fixtures
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const isoDay = (offsetDays) => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays));
  return d.toISOString().slice(0, 10);
};

/** Minimal HTTP client that remembers the login cookie like a browser. */
function createClient() {
  let cookie = '';
  async function request(method, path, { json, form, raw = false } = {}) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      body = new FormData();
      for (const [key, value] of Object.entries(form)) {
        if (value && typeof value === 'object' && value.buffer) {
          body.append(key, new Blob([value.buffer], { type: value.type }), value.name);
        } else if (value !== undefined) {
          body.append(key, String(value));
        }
      }
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      cookie = pair.endsWith('=') ? '' : pair;
    }
    if (raw) return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: res.status, headers: res.headers, body: parsed, setCookie };
  }
  return {
    get: (p, o) => request('GET', p, o),
    post: (p, o) => request('POST', p, o),
    put: (p, o) => request('PUT', p, o),
    patch: (p, o) => request('PATCH', p, o),
    del: (p, o) => request('DELETE', p, o),
  };
}

async function registerUser(client, name, email) {
  const res = await client.post('/api/auth/register', { json: { name, email, password: 'Passw0rd!' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.user;
}

before(async () => {
  await mongoose.connect(env.mongoUri, { dbName: TEST_DB, serverSelectionTimeoutMS: 8000 });
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  ensureUploadFolders();
  uploadsBefore = new Set(listUploads());
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  for (const file of listUploads()) if (!uploadsBefore.has(file)) fs.rmSync(file, { force: true });
});

const alice = createClient();
const bob = createClient();
const carol = createClient();
const anonymous = createClient();
const ids = {};

describe('health and authentication', () => {
  test('health endpoint reports database connection', async () => {
    const res = await anonymous.get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.database, 'connected');
  });

  test('registration validates input', async () => {
    const res = await anonymous.post('/api/auth/register', { json: { name: 'A', email: 'nope', password: 'short' } });
    assert.equal(res.status, 422);
    const fields = res.body.errors.map((e) => e.field).sort();
    assert.deepEqual(fields, ['email', 'name', 'password']);
  });

  test('register sets an HTTP-only cookie and hides the password', async () => {
    const res = await alice.post('/api/auth/register', {
      json: { name: 'Alice Owner', email: 'Alice@Example.com', password: 'Passw0rd!' },
    });
    assert.equal(res.status, 201);
    assert.match(res.setCookie, /fh_token=.+HttpOnly/i);
    assert.equal(res.body.data.user.email, 'alice@example.com');
    assert.equal(res.body.data.user.password, undefined);
    ids.alice = res.body.data.user._id;
  });

  test('duplicate email is rejected', async () => {
    const res = await anonymous.post('/api/auth/register', {
      json: { name: 'Other', email: 'alice@example.com', password: 'Passw0rd!' },
    });
    assert.equal(res.status, 409);
  });

  test('login with wrong password fails, correct password works', async () => {
    const wrong = await anonymous.post('/api/auth/login', { json: { email: 'alice@example.com', password: 'wrong123' } });
    assert.equal(wrong.status, 401);
    const ok = await alice.post('/api/auth/login', { json: { email: 'alice@example.com', password: 'Passw0rd!' } });
    assert.equal(ok.status, 200);
    const me = await alice.get('/api/auth/me');
    assert.equal(me.body.data.user.name, 'Alice Owner');
  });

  test('session endpoint answers anonymous visitors without an error', async () => {
    const anon = await anonymous.get('/api/auth/session');
    assert.equal(anon.status, 200);
    assert.equal(anon.body.data.user, null);
    const own = await alice.get('/api/auth/session');
    assert.equal(own.body.data.user.email, 'alice@example.com');
  });

  test('protected routes require login', async () => {
    assert.equal((await anonymous.get('/api/auth/me')).status, 401);
    assert.equal((await anonymous.get('/api/assets')).status, 401);
    assert.equal((await anonymous.get('/api/dashboard/stats')).status, 401);
  });

  test('second and third users register', async () => {
    ids.bob = (await registerUser(bob, 'Bob Buyer', 'bob@example.com'))._id;
    ids.carol = (await registerUser(carol, 'Carol Other', 'carol@example.com'))._id;
  });
});

describe('assets', () => {
  test('create asset with image', async () => {
    const res = await alice.post('/api/assets', {
      form: {
        name: 'Test Car',
        category: 'Vehicle',
        brand: 'Honda',
        model: 'City',
        serialNumber: 'SER123456789',
        purchaseDate: isoDay(-400),
        purchasePrice: '1000000',
        warrantyStart: isoDay(-400),
        warrantyExpiry: isoDay(20), // expiring soon
        seller: 'Dealer',
        image: { buffer: PNG, type: 'image/png', name: 'car.png' },
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.data.assetId, /^FH-[A-Z0-9]{8}$/);
    assert.equal(res.body.data.hasImage, true);
    assert.equal(res.body.data.warranty.status, 'expiring');
    assert.equal(res.body.data.warranty.remainingDays, 20);
    ids.car = res.body.data._id;
  });

  test('more assets in other categories', async () => {
    const laptop = await alice.post('/api/assets', {
      form: { name: 'Work Laptop', category: 'Electronic Device', brand: 'Dell', warrantyStart: isoDay(-800), warrantyExpiry: isoDay(-5) },
    });
    assert.equal(laptop.status, 201);
    assert.equal(laptop.body.data.warranty.status, 'expired');
    ids.laptop = laptop.body.data._id;

    const fridge = await alice.post('/api/assets', {
      form: { name: 'Fridge', category: 'Home Appliance', brand: 'Samsung', warrantyStart: isoDay(-10), warrantyExpiry: isoDay(400) },
    });
    assert.equal(fridge.status, 201);
    assert.equal(fridge.body.data.warranty.status, 'active');
    ids.fridge = fridge.body.data._id;
  });

  test('rejects a file whose content does not match its type', async () => {
    const res = await alice.post('/api/assets', {
      form: { name: 'Bad', category: 'Other', image: { buffer: Buffer.from('<script>alert(1)</script>'), type: 'image/png', name: 'x.png' } },
    });
    assert.equal(res.status, 400);
  });

  test('rejects unsupported file types', async () => {
    const res = await alice.post('/api/assets', {
      form: { name: 'Bad', category: 'Other', image: { buffer: Buffer.from('hello'), type: 'text/html', name: 'x.html' } },
    });
    assert.equal(res.status, 400);
  });

  test('validates required fields', async () => {
    const res = await alice.post('/api/assets', { form: { category: 'Spaceship', purchasePrice: 'abc' } });
    assert.equal(res.status, 422);
    const fields = res.body.errors.map((e) => e.field).sort();
    assert.deepEqual(fields, ['category', 'name', 'purchasePrice']);
  });

  test('validates date order', async () => {
    const res = await alice.post('/api/assets', {
      form: { name: 'Dates', category: 'Other', warrantyStart: isoDay(0), warrantyExpiry: isoDay(-10), purchaseDate: isoDay(5) },
    });
    assert.equal(res.status, 422);
    const fields = res.body.errors.map((e) => e.field).sort();
    assert.deepEqual(fields, ['purchaseDate', 'warrantyExpiry']);
  });

  test('search, category filter and warranty filter', async () => {
    const search = await alice.get('/api/assets?search=dell');
    assert.deepEqual(search.body.data.items.map((a) => a.name), ['Work Laptop']);

    const category = await alice.get('/api/assets?category=Home%20Appliance');
    assert.deepEqual(category.body.data.items.map((a) => a.name), ['Fridge']);

    const expired = await alice.get('/api/assets?warranty=expired');
    assert.deepEqual(expired.body.data.items.map((a) => a.name), ['Work Laptop']);

    const all = await alice.get('/api/assets?limit=2&page=1');
    assert.equal(all.body.data.items.length, 2);
    assert.equal(all.body.data.pagination.total, 3);
    assert.equal(all.body.data.pagination.pages, 2);
  });

  test('update replaces editable fields', async () => {
    const res = await alice.put(`/api/assets/${ids.fridge}`, {
      form: { name: 'Kitchen Fridge', category: 'Home Appliance', brand: 'Samsung', model: 'RT28' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.name, 'Kitchen Fridge');
    assert.equal(res.body.data.warrantyExpiry, undefined, 'cleared field should be removed');
  });

  test('image is served only to the owner', async () => {
    const own = await alice.get(`/api/assets/${ids.car}/image`, { raw: true });
    assert.equal(own.status, 200);
    assert.equal(own.headers.get('content-type'), 'image/png');
    assert.equal((await bob.get(`/api/assets/${ids.car}/image`)).status, 404);
  });

  test("other users cannot read, edit or delete someone else's asset", async () => {
    assert.equal((await bob.get(`/api/assets/${ids.car}`)).status, 404);
    assert.equal((await bob.put(`/api/assets/${ids.car}`, { form: { name: 'Hacked', category: 'Other' } })).status, 404);
    assert.equal((await bob.del(`/api/assets/${ids.car}`)).status, 404);
    assert.equal((await bob.get(`/api/assets/${ids.car}/qr`)).status, 404);
    const list = await bob.get('/api/assets');
    assert.equal(list.body.data.items.length, 0);
  });
});

describe('maintenance records', () => {
  test('create record with invoice', async () => {
    const res = await alice.post('/api/maintenance', {
      form: {
        asset: ids.car,
        serviceDate: isoDay(-30),
        serviceType: 'Regular Maintenance',
        workPerformed: 'Oil change',
        replacedParts: 'Oil filter, Engine oil',
        technician: 'Ravi',
        serviceProvider: 'City Garage',
        cost: '4500',
        nextServiceDate: isoDay(10),
        notes: 'Private note',
        invoice: { buffer: PDF, type: 'application/pdf', name: 'invoice.pdf' },
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.replacedParts, ['Oil filter', 'Engine oil']);
    assert.equal(res.body.data.hasInvoice, true);
    assert.equal(res.body.data.invoice.filename, undefined, 'disk filename is hidden');
    ids.record1 = res.body.data._id;
  });

  test('more records for statistics', async () => {
    const r2 = await alice.post('/api/maintenance', {
      form: { asset: ids.car, serviceDate: isoDay(-200), serviceType: 'Repair', workPerformed: 'Brake repair', cost: '2500', nextServiceDate: isoDay(-100) },
    });
    assert.equal(r2.status, 201);
    const r3 = await alice.post('/api/maintenance', {
      form: { asset: ids.laptop, serviceDate: isoDay(-60), serviceType: 'Repair', workPerformed: 'Keyboard replaced', cost: '3000', nextServiceDate: isoDay(-2) },
    });
    assert.equal(r3.status, 201);
    ids.record3 = r3.body.data._id;
  });

  test('validates service dates', async () => {
    const future = await alice.post('/api/maintenance', {
      form: { asset: ids.car, serviceDate: isoDay(3), serviceType: 'Repair', workPerformed: 'x' },
    });
    assert.equal(future.status, 422);
    const nextBefore = await alice.post('/api/maintenance', {
      form: { asset: ids.car, serviceDate: isoDay(-3), serviceType: 'Repair', workPerformed: 'x', nextServiceDate: isoDay(-5) },
    });
    assert.equal(nextBefore.status, 422);
    assert.equal(nextBefore.body.errors[0].field, 'nextServiceDate');
  });

  test("cannot add a record to someone else's asset", async () => {
    const res = await bob.post('/api/maintenance', {
      form: { asset: ids.car, serviceDate: isoDay(-1), serviceType: 'Repair', workPerformed: 'x' },
    });
    assert.equal(res.status, 404);
    assert.equal((await bob.get(`/api/maintenance/${ids.record1}`)).status, 404);
    assert.equal((await bob.get(`/api/maintenance/${ids.record1}/invoice`)).status, 404);
  });

  test('list, filter, sort and total', async () => {
    const all = await alice.get('/api/maintenance');
    assert.equal(all.body.data.summary.count, 3);
    assert.equal(all.body.data.summary.totalCost, 10000);

    const byCost = await alice.get('/api/maintenance?sort=cost_desc');
    assert.deepEqual(byCost.body.data.items.map((r) => r.cost), [4500, 3000, 2500]);

    const repairs = await alice.get('/api/maintenance?serviceType=Repair');
    assert.equal(repairs.body.data.summary.count, 2);

    const range = await alice.get(`/api/maintenance?from=${isoDay(-90)}&to=${isoDay(0)}`);
    assert.equal(range.body.data.summary.count, 2);

    const search = await alice.get('/api/maintenance?search=keyboard');
    assert.equal(search.body.data.items.length, 1);

    const byAssetName = await alice.get('/api/maintenance?search=test%20car');
    assert.equal(byAssetName.body.data.items.length, 2);

    const oneAsset = await alice.get(`/api/maintenance?asset=${ids.laptop}`);
    assert.equal(oneAsset.body.data.items.length, 1);
  });

  test('invoice download for the owner', async () => {
    const res = await alice.get(`/api/maintenance/${ids.record1}/invoice`, { raw: true });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal(res.buffer.subarray(0, 5).toString(), '%PDF-');
  });

  test('passport shows timeline and totals', async () => {
    const res = await alice.get(`/api/assets/${ids.car}`);
    assert.equal(res.status, 200);
    const { asset, records, ownershipHistory } = res.body.data;
    assert.equal(records.length, 2);
    assert.equal(asset.maintenance.totalCost, 7000);
    assert.equal(asset.maintenance.nextServiceDate.slice(0, 10), isoDay(10), 'next service comes from latest record');
    assert.equal(ownershipHistory.length, 1);
    assert.equal(ownershipHistory[0].transferStatus, 'Registered');
  });
});

describe('dashboard, warranty and reminders', () => {
  test('dashboard stats come from the database', async () => {
    const res = await alice.get('/api/dashboard/stats');
    const s = res.body.data;
    assert.equal(s.totalAssets, 3);
    assert.equal(s.totalRecords, 3);
    assert.equal(s.totalExpenses, 10000);
    assert.equal(s.upcomingServices, 1); // car, in 10 days
    assert.equal(s.overdueServices, 1); // laptop, 2 days ago
    assert.equal(s.activeWarranties, 1); // car (expiring soon counts as active)
    assert.equal(s.expiringWarranties, 1);
    assert.equal(s.expiredWarranties, 1); // laptop
    assert.equal(s.noWarranty, 1); // fridge after edit
  });

  test('charts add up', async () => {
    const res = await alice.get('/api/dashboard/charts');
    const c = res.body.data;
    assert.equal(c.monthlyExpenses.length, 12);
    assert.equal(c.monthlyExpenses.reduce((sum, m) => sum + m.total, 0), 10000);
    assert.equal(c.assetsByCategory.find((x) => x.category === 'Vehicle').count, 1);
    assert.equal(c.recordsByType.find((x) => x.type === 'Repair').count, 2);
  });

  test('warranty page calculates status from dates', async () => {
    const res = await alice.get('/api/warranty');
    const byName = Object.fromEntries(res.body.data.items.map((a) => [a.name, a.warranty.status]));
    assert.deepEqual(byName, { 'Test Car': 'expiring', 'Work Laptop': 'expired', 'Kitchen Fridge': 'none' });
    const expiring = await alice.get('/api/warranty?status=expiring');
    assert.equal(expiring.body.data.items.length, 1);
  });

  test('reminders are generated from stored dates', async () => {
    const res = await alice.get('/api/reminders');
    const { items, counts } = res.body.data;
    const types = items.map((n) => n.type).sort();
    assert.deepEqual(types, ['SERVICE_DUE', 'SERVICE_DUE', 'WARRANTY_EXPIRY']);
    assert.equal(counts.overdue, 1);
    assert.equal(counts.upcomingServices, 1);
    const overdue = items.find((n) => n.isOverdue);
    assert.equal(overdue.daysUntil, -2);
    ids.overdueReminder = overdue._id;
  });

  test('completed reminders stay completed', async () => {
    const res = await alice.put(`/api/reminders/${ids.overdueReminder}`, { json: { status: 'Completed' } });
    assert.equal(res.status, 200);
    const pending = await alice.get('/api/reminders');
    assert.equal(pending.body.data.items.length, 2);
    const completed = await alice.get('/api/reminders?status=Completed');
    assert.equal(completed.body.data.items.length, 1);
    assert.equal((await bob.put(`/api/reminders/${ids.overdueReminder}`, { json: { status: 'Pending' } })).status, 404);
  });

  test('editing a record updates its reminder', async () => {
    const res = await alice.put(`/api/maintenance/${ids.record1}`, {
      form: { asset: ids.car, serviceDate: isoDay(-30), serviceType: 'Regular Maintenance', workPerformed: 'Oil change', cost: '4500', nextServiceDate: isoDay(200) },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.hasInvoice, true, 'invoice kept when no new file is sent');
    const reminders = await alice.get('/api/reminders');
    assert.deepEqual(reminders.body.data.items.map((n) => n.type), ['WARRANTY_EXPIRY']);
  });
});

describe('QR code and public passport', () => {
  test('QR code is generated for the owner', async () => {
    const res = await alice.get(`/api/assets/${ids.car}/qr`);
    assert.equal(res.status, 200);
    assert.match(res.body.data.qrDataUrl, /^data:image\/png;base64,/);
    assert.match(res.body.data.url, /\/p\/[\w-]{20,}$/);
    assert.equal(res.body.data.settings.enabled, false);
    ids.publicToken = res.body.data.url.split('/p/')[1];
  });

  test('public passport is private until the owner enables it', async () => {
    assert.equal((await anonymous.get(`/api/public/passport/${ids.publicToken}`)).status, 404);
    const enable = await alice.put(`/api/assets/${ids.car}/sharing`, {
      json: { enabled: true, showImage: true, showPurchaseInfo: false, showWarranty: true, showServiceHistory: true, showServiceCosts: false },
    });
    assert.equal(enable.status, 200);

    const res = await anonymous.get(`/api/public/passport/${ids.publicToken}`);
    assert.equal(res.status, 200);
    const p = res.body.data;
    const text = JSON.stringify(p);
    assert.equal(p.name, 'Test Car');
    assert.equal(p.serialMasked.endsWith('6789'), true);
    assert.ok(!text.includes('SER123456789'), 'full serial hidden');
    assert.ok(!text.includes('Alice'), 'owner name hidden');
    assert.ok(!text.includes('alice@example.com'), 'owner email hidden');
    assert.ok(!text.includes('Private note'), 'notes hidden');
    assert.ok(!text.includes('Ravi'), 'technician hidden');
    assert.ok(!text.includes('invoice'), 'invoices hidden');
    assert.equal(p.purchase, undefined, 'purchase info hidden when disabled');
    assert.equal(p.serviceHistory.length, 2);
    assert.equal(p.serviceHistory[0].cost, undefined, 'costs hidden when disabled');
    assert.equal(p.viewer.isOwner, false);

    const asOwner = await alice.get(`/api/public/passport/${ids.publicToken}`);
    assert.equal(asOwner.body.data.viewer.isOwner, true);
  });

  test('regenerating the link invalidates the old QR code', async () => {
    const res = await alice.post(`/api/assets/${ids.car}/sharing/regenerate`);
    assert.equal(res.status, 200);
    assert.equal((await anonymous.get(`/api/public/passport/${ids.publicToken}`)).status, 404);
    ids.publicToken = res.body.data.url.split('/p/')[1];
    assert.equal((await anonymous.get(`/api/public/passport/${ids.publicToken}`)).status, 200);
  });
});

describe('ownership transfer', () => {
  test('cannot transfer to yourself', async () => {
    const res = await alice.post('/api/transfers', { json: { asset: ids.car, newOwnerEmail: 'alice@example.com' } });
    assert.equal(res.status, 422);
  });

  test("cannot transfer someone else's asset", async () => {
    const res = await bob.post('/api/transfers', { json: { asset: ids.car, newOwnerEmail: 'carol@example.com' } });
    assert.equal(res.status, 404);
  });

  test('owner creates a transfer and receives a one-time code', async () => {
    const res = await alice.post('/api/transfers', { json: { asset: ids.car, newOwnerEmail: 'bob@example.com', message: 'Sold' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.data.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(res.body.data.transfer.codeHash, undefined, 'hash never returned');
    ids.transferCode = res.body.data.code;
    ids.transferId = res.body.data.transfer._id;

    const second = await alice.post('/api/transfers', { json: { asset: ids.car, newOwnerEmail: 'carol@example.com' } });
    assert.equal(second.status, 409, 'only one pending transfer per asset');
  });

  test('recipient sees the incoming transfer and a notification', async () => {
    const list = await bob.get('/api/transfers');
    assert.equal(list.body.data.incoming.length, 1);
    const reminders = await bob.get('/api/reminders');
    assert.equal(reminders.body.data.counts.transfers, 1);
  });

  test('wrong code or wrong account cannot use the transfer', async () => {
    assert.equal((await bob.post('/api/transfers/preview', { json: { code: 'AAAA-BBBB-CCCC' } })).status, 422);
    assert.equal((await carol.post('/api/transfers/confirm', { json: { code: ids.transferCode } })).status, 422);
    assert.equal((await alice.post('/api/transfers/confirm', { json: { code: ids.transferCode } })).status, 422);
  });

  test('preview shows the asset without changing ownership', async () => {
    const res = await bob.post('/api/transfers/preview', { json: { code: ids.transferCode.toLowerCase().replace(/-/g, ' ') } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.asset.name, 'Test Car');
    assert.equal(res.body.data.fromName, 'Alice Owner');
    assert.equal((await alice.get(`/api/assets/${ids.car}`)).status, 200, 'still owned by Alice');
  });

  test('confirmation moves the asset and its history to the new owner', async () => {
    const res = await bob.post('/api/transfers/confirm', { json: { code: ids.transferCode } });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    assert.equal((await alice.get(`/api/assets/${ids.car}`)).status, 404, 'previous owner lost access');
    const passport = await bob.get(`/api/assets/${ids.car}`);
    assert.equal(passport.status, 200);
    assert.equal(passport.body.data.records.length, 2, 'maintenance history kept');
    assert.equal(passport.body.data.asset.currentOwner.name, 'Bob Buyer');
    assert.deepEqual(passport.body.data.ownershipHistory.map((h) => h.transferStatus), ['Registered', 'Transferred']);
    assert.equal(passport.body.data.asset.publicPassport.enabled, false, 'public sharing reset for new owner');

    const records = await bob.get('/api/maintenance');
    assert.equal(records.body.data.summary.count, 2);
    const aliceStats = await alice.get('/api/dashboard/stats');
    assert.equal(aliceStats.body.data.totalAssets, 2);
  });

  test('a used code cannot be used again', async () => {
    const res = await bob.post('/api/transfers/confirm', { json: { code: ids.transferCode } });
    assert.equal(res.status, 422);
  });

  test('sender can cancel and recipient can decline', async () => {
    const created = await alice.post('/api/transfers', { json: { asset: ids.laptop, newOwnerEmail: 'carol@example.com' } });
    assert.equal(created.status, 201);
    const cancel = await alice.patch(`/api/transfers/${created.body.data.transfer._id}/cancel`);
    assert.equal(cancel.status, 200);
    assert.equal((await carol.post('/api/transfers/confirm', { json: { code: created.body.data.code } })).status, 422);

    const again = await alice.post('/api/transfers', { json: { asset: ids.laptop, newOwnerEmail: 'carol@example.com' } });
    assert.equal(again.status, 201);
    assert.equal((await bob.patch(`/api/transfers/${again.body.data.transfer._id}/reject`)).status, 404);
    const reject = await carol.patch(`/api/transfers/${again.body.data.transfer._id}/reject`);
    assert.equal(reject.status, 200);
    assert.equal((await alice.get(`/api/assets/${ids.laptop}`)).status, 200);
  });
});

describe('reports', () => {
  test('summary report uses real data', async () => {
    const res = await alice.get('/api/reports/summary');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.totals.assets, 2);
    assert.equal(res.body.data.totals.records, 1);
    assert.equal(res.body.data.totals.totalExpenses, 3000);
  });

  test('full PDF report downloads', async () => {
    const res = await alice.get('/api/reports/pdf', { raw: true });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal(res.buffer.subarray(0, 5).toString(), '%PDF-');
    assert.ok(res.buffer.length > 2000);
  });

  test('single-asset PDF only for the owner', async () => {
    const res = await bob.get(`/api/reports/pdf?asset=${ids.car}`, { raw: true });
    assert.equal(res.status, 200);
    assert.equal(res.buffer.subarray(0, 5).toString(), '%PDF-');
    assert.equal((await alice.get(`/api/reports/pdf?asset=${ids.car}`)).status, 404);
  });
});

describe('deletion and logout', () => {
  test('deleting a record and an asset', async () => {
    assert.equal((await alice.del(`/api/maintenance/${ids.record3}`)).status, 200);
    assert.equal((await alice.get(`/api/maintenance/${ids.record3}`)).status, 404);
    assert.equal((await alice.del(`/api/assets/${ids.laptop}`)).status, 200);
    const stats = await alice.get('/api/dashboard/stats');
    assert.equal(stats.body.data.totalAssets, 1);
    assert.equal(stats.body.data.totalRecords, 0);
  });

  test('logout clears the session', async () => {
    const res = await alice.post('/api/auth/logout');
    assert.equal(res.status, 200);
    assert.equal((await alice.get('/api/auth/me')).status, 401);
  });

  test('unknown API routes return JSON 404', async () => {
    const res = await anonymous.get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });
});
