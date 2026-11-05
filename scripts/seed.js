/**
 * Demo data seed script  (run from the FixHistory folder:  npm run seed)
 *
 * Creates SAMPLE data for demonstrations:
 *   - demo@fixhistory.test   (main demo account, owns 8 sample assets)
 *   - buyer@fixhistory.test  (second account, used to demonstrate ownership transfer)
 *   - seller@fixhistory.test (previous owner of the sample motorcycle)
 * All three use the password Demo@12345.
 *
 * Dates are calculated relative to today, so warranty states and service
 * reminders always look realistic whenever you run the script.
 *
 * Running it again removes ONLY the previous demo accounts and their data.
 * Accounts you registered yourself are never touched.
 */
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { env, getConfigProblems } from '../config/env.js';
import { connectDB, disconnectDB, maskMongoUri } from '../config/db.js';
import { ensureUploadFolders, resolveUploadPath } from '../middleware/upload.js';
import {
  Asset,
  MaintenanceRecord,
  Notification,
  OwnershipHistory,
  TransferRequest,
  User,
} from '../models/index.js';
import { createUniqueAssetCode } from '../services/assetService.js';
import { syncReminders } from '../services/reminderService.js';
import { generatePublicToken, generateTransferCode, hashTransferCode } from '../utils/codes.js';
import { addDays, formatDate, todayUTC } from '../utils/dates.js';

const DEMO_PASSWORD = 'Demo@12345';
const DEMO_USERS = [
  { key: 'demo', name: 'Arjun Mehta (Demo)', email: 'demo@fixhistory.test' },
  { key: 'buyer', name: 'Priya Raman (Demo Buyer)', email: 'buyer@fixhistory.test' },
  { key: 'seller', name: 'Karthik Iyer (Demo Seller)', email: 'seller@fixhistory.test' },
];

const T = todayUTC();
const day = (offset) => addDays(T, offset);
const SAMPLE = 'Sample data for demonstration.';

/** Sample assets. Day offsets are relative to today (negative = in the past). */
const ASSETS = [
  {
    key: 'car',
    name: 'Honda City ZX',
    category: 'Vehicle',
    brand: 'Honda',
    model: 'City ZX i-VTEC CVT',
    serialNumber: 'MAKGN6250PN104578',
    purchase: -760,
    price: 1325000,
    warranty: [-760, 335],
    seller: 'Sample Motors (demo dealer)',
    description: `Family sedan, petrol, white. ${SAMPLE}`,
    publicPassport: { enabled: true, showServiceHistory: true, showWarranty: true },
    records: [
      { d: -735, type: 'Inspection', work: 'First free inspection at 1,000 km. Checked fluid levels, tyre pressure and underbody.', provider: 'Sample Motors Service Centre', tech: 'R. Prakash', cost: 0, next: -575 },
      { d: -575, type: 'Regular Maintenance', work: 'Periodic service at 10,000 km: engine oil and oil filter changed, cabin filter cleaned.', parts: ['Engine oil 3.5 L', 'Oil filter'], provider: 'Sample Motors Service Centre', tech: 'R. Prakash', cost: 4850, next: -390, invoice: true },
      { d: -395, type: 'Regular Maintenance', work: 'Periodic service at 20,000 km: oil, oil filter, air filter and wiper blades replaced. Wheel alignment done.', parts: ['Engine oil 3.5 L', 'Oil filter', 'Air filter', 'Wiper blades'], provider: 'Sample Motors Service Centre', tech: 'M. Siva', cost: 7320, next: -210 },
      { d: -268, type: 'Repair', problem: 'Front left power window stopped working.', work: 'Replaced faulty power window switch and checked wiring.', parts: ['Power window switch'], provider: 'Sample Motors Service Centre', tech: 'M. Siva', cost: 2150 },
      { d: -170, type: 'Part Replacement', problem: 'Grinding noise while braking.', work: 'Front brake pads replaced, brake fluid topped up, periodic service completed.', parts: ['Front brake pads', 'Brake fluid'], provider: 'Sample Motors Service Centre', tech: 'R. Prakash', cost: 9640, next: 10, invoice: true, notes: 'Rear pads at 40% - check at next service.' },
    ],
  },
  {
    key: 'bike',
    name: 'Royal Enfield Classic 350',
    category: 'Vehicle',
    brand: 'Royal Enfield',
    model: 'Classic 350 Signals',
    serialNumber: 'ME3U3S5C1LK210987',
    purchase: -1200,
    price: 182000,
    warranty: [-1200, -470],
    seller: 'Bought second-hand from previous owner',
    description: `Commuter motorcycle, bought second-hand. ${SAMPLE}`,
    registeredBySeller: true,
    records: [
      { d: -1100, type: 'Regular Maintenance', work: 'Engine oil change and chain lubrication.', parts: ['Engine oil 2.5 L'], provider: 'Sample Bikes Workshop', tech: 'S. Anand', cost: 1450, next: -920 },
      { d: -540, type: 'Repair', problem: 'Engine hard to start in the morning.', work: 'Cleaned carburettor and replaced spark plug.', parts: ['Spark plug'], provider: 'Sample Bikes Workshop', tech: 'S. Anand', cost: 980 },
      { d: -400, type: 'Part Replacement', problem: 'Chain slack and worn sprocket teeth.', work: 'Replaced chain and sprocket kit, adjusted tension.', parts: ['Chain and sprocket kit'], provider: 'Sample Bikes Workshop', tech: 'Imran K.', cost: 3650 },
      { d: -212, type: 'Regular Maintenance', work: 'General service: oil change, brake adjustment, battery check.', parts: ['Engine oil 2.5 L', 'Oil filter'], provider: 'Sample Bikes Workshop', tech: 'Imran K.', cost: 2240, next: -12 },
    ],
  },
  {
    key: 'laptop',
    name: 'Dell XPS 15 Laptop',
    category: 'Electronic Device',
    brand: 'Dell',
    model: 'XPS 15 9530',
    serialNumber: 'DLXPS9530-7H2K91',
    purchase: -340,
    price: 189990,
    warranty: [-340, 25],
    seller: 'Sample Electronics Store',
    description: `Work laptop, 32 GB RAM, 1 TB SSD. ${SAMPLE}`,
    records: [
      { d: -150, type: 'Repair', problem: 'Several keys on the keyboard not responding.', work: 'Keyboard assembly replaced under warranty.', parts: ['Keyboard assembly'], provider: 'Sample Authorised Service Centre', tech: 'On-site engineer', cost: 0, invoice: true, notes: 'Covered by manufacturer warranty.' },
      { d: -40, type: 'Inspection', work: 'Battery health check (91%) and thermal paste inspection. No issues found.', provider: 'Sample Authorised Service Centre', cost: 0 },
    ],
  },
  {
    key: 'fridge',
    name: 'Samsung Double Door Refrigerator',
    category: 'Home Appliance',
    brand: 'Samsung',
    model: 'RT28 253 L',
    serialNumber: 'SMRT28-0098123',
    purchase: -900,
    price: 27490,
    warranty: [-900, -535],
    seller: 'Sample Home Appliances',
    description: `Kitchen refrigerator. ${SAMPLE}`,
    records: [
      { d: -300, type: 'Repair', problem: 'Not cooling properly.', work: 'Detected gas leak at condenser joint, brazed the joint and refilled refrigerant.', parts: ['Refrigerant gas R600a'], provider: 'Sample Cooling Services', tech: 'V. Murugan', cost: 2800, next: 65 },
    ],
  },
  {
    key: 'ac',
    name: 'Daikin Split Air Conditioner',
    category: 'Home Appliance',
    brand: 'Daikin',
    model: 'FTKF50 1.5 Ton Inverter',
    serialNumber: 'DKN-FTKF50-552901',
    purchase: -420,
    price: 46990,
    warranty: [-420, 310],
    seller: 'Sample Home Appliances',
    description: `Bedroom AC. ${SAMPLE}`,
    records: [
      { d: -410, type: 'Inspection', work: 'Installation check: verified mounting, drainage slope and gas pressure.', provider: 'Sample Cooling Services', tech: 'V. Murugan', cost: 0 },
      { d: -290, type: 'Regular Maintenance', work: 'Pre-summer service: filters and indoor coil cleaned, drain line flushed.', provider: 'Sample Cooling Services', tech: 'V. Murugan', cost: 650 },
      { d: -175, type: 'Regular Maintenance', work: 'Wet service of indoor and outdoor units.', provider: 'Sample Cooling Services', tech: 'J. Paul', cost: 950, next: 5 },
    ],
  },
  {
    key: 'washer',
    name: 'LG Front Load Washing Machine',
    category: 'Home Appliance',
    brand: 'LG',
    model: 'FHM1207 7 kg',
    serialNumber: 'LGFHM1207-33410',
    purchase: -600,
    price: 32990,
    warranty: [-600, 130],
    seller: 'Sample Home Appliances',
    description: `Laundry room washing machine. ${SAMPLE}`,
    records: [
      { d: -88, type: 'Repair', problem: 'Water not draining, error code OE.', work: 'Removed blockage and replaced drain pump.', parts: ['Drain pump'], provider: 'Sample Appliance Care', tech: 'K. Dinesh', cost: 1850 },
    ],
  },
  {
    key: 'generator',
    name: 'Kirloskar Diesel Generator',
    category: 'Industrial Equipment',
    brand: 'Kirloskar',
    model: 'KG1-15AS 15 kVA',
    serialNumber: 'KOEL-15AS-2021-0456',
    purchase: -1500,
    price: 385000,
    warranty: [-1500, -770],
    seller: 'Sample Power Systems Pvt Ltd',
    description: `Backup generator for the workshop. ${SAMPLE}`,
    records: [
      { d: -330, type: 'Regular Maintenance', work: '250-hour service: engine oil, oil filter and fuel filter changed.', parts: ['Engine oil 8 L', 'Oil filter', 'Fuel filter'], provider: 'Sample Power Systems Pvt Ltd', tech: 'Field team', cost: 6800 },
      { d: -245, type: 'Emergency Service', problem: 'Generator failed to start during a power cut.', work: 'Replaced weak battery and cleaned starter motor terminals.', parts: ['12V battery'], provider: 'Sample Power Systems Pvt Ltd', tech: 'Field team', cost: 8900 },
      { d: -150, type: 'Regular Maintenance', work: '500-hour service: oil, filters, coolant check and load test.', parts: ['Engine oil 8 L', 'Oil filter', 'Air filter'], provider: 'Sample Power Systems Pvt Ltd', tech: 'Field team', cost: 7450, invoice: true },
      { d: -58, type: 'Inspection', work: 'Quarterly inspection: belts, coolant, battery and earthing checked.', provider: 'Sample Power Systems Pvt Ltd', tech: 'Field team', cost: 1200, next: 28 },
    ],
  },
  {
    key: 'phone',
    name: 'Apple iPhone 15',
    category: 'Electronic Device',
    brand: 'Apple',
    model: 'iPhone 15 128 GB',
    serialNumber: 'F2LXK9QHN7',
    purchase: -200,
    price: 79900,
    warranty: [-200, 165],
    seller: 'Sample Electronics Store',
    description: `Personal phone. ${SAMPLE}`,
    records: [
      { d: -20, type: 'Other', work: 'Applied tempered glass screen protector and cleaned charging port.', parts: ['Tempered glass'], provider: 'Sample Mobile Care', cost: 499 },
    ],
  },
];

/** Creates a small PDF clearly marked as a sample invoice. */
function writeSampleInvoice(filePath, { assetName, record }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#243447').text('SAMPLE INVOICE');
    doc.font('Helvetica').fontSize(9).fillColor('#C65D5D').text('Demonstration data - not a real document');
    doc.moveDown();
    doc.fillColor('#263238').fontSize(10);
    doc.text(`Service provider: ${record.provider}`);
    doc.text(`Date: ${formatDate(day(record.d))}`);
    doc.text(`Asset: ${assetName}`);
    doc.text(`Service type: ${record.type}`);
    doc.moveDown();
    doc.text(`Work performed: ${record.work}`);
    if (record.parts?.length) doc.text(`Parts: ${record.parts.join(', ')}`);
    doc.moveDown();
    doc.font('Helvetica-Bold').text(`Amount: INR ${record.cost.toLocaleString('en-IN')}`);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function removePreviousDemoData() {
  const demoUsers = await User.find({
    $or: [{ isDemo: true }, { email: { $in: DEMO_USERS.map((u) => u.email) } }],
  }).select('_id');
  const userIds = demoUsers.map((u) => u._id);

  const assets = await Asset.find({
    $or: [{ currentOwner: { $in: userIds } }, { isSample: true }],
  }).select('_id image');
  const assetIds = assets.map((a) => a._id);
  const records = await MaintenanceRecord.find({ asset: { $in: assetIds } }).select('invoice');

  for (const a of assets) if (a.image?.filename) fs.rmSync(resolveUploadPath('assets', a.image.filename), { force: true });
  for (const r of records) if (r.invoice?.filename) fs.rmSync(resolveUploadPath('invoices', r.invoice.filename), { force: true });

  await Promise.all([
    MaintenanceRecord.deleteMany({ asset: { $in: assetIds } }),
    OwnershipHistory.deleteMany({ asset: { $in: assetIds } }),
    TransferRequest.deleteMany({ $or: [{ asset: { $in: assetIds } }, { currentOwner: { $in: userIds } }] }),
    Notification.deleteMany({ $or: [{ user: { $in: userIds } }, { asset: { $in: assetIds } }] }),
  ]);
  await Asset.deleteMany({ _id: { $in: assetIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  return { users: userIds.length, assets: assetIds.length };
}

async function seed() {
  const problems = getConfigProblems();
  if (problems.length) {
    problems.forEach((p) => console.error(`- ${p}`));
    process.exit(1);
  }

  ensureUploadFolders();
  console.log(`Connecting to ${maskMongoUri(env.mongoUri)} ...`);
  await connectDB(env.mongoUri);
  await Promise.all([User, Asset, MaintenanceRecord, OwnershipHistory, TransferRequest, Notification].map((m) => m.init()));

  const removed = await removePreviousDemoData();
  if (removed.users || removed.assets) {
    console.log(`Removed previous demo data (${removed.users} demo users, ${removed.assets} sample assets).`);
  }

  const users = {};
  for (const u of DEMO_USERS) {
    // eslint-disable-next-line no-await-in-loop
    users[u.key] = await User.create({ name: u.name, email: u.email, password: DEMO_PASSWORD, isDemo: true });
  }
  const owner = users.demo;

  let recordCount = 0;
  const created = {};
  for (const spec of ASSETS) {
    const registeredBy = spec.registeredBySeller ? users.seller : owner;
    // eslint-disable-next-line no-await-in-loop
    const asset = await Asset.create({
      assetId: await createUniqueAssetCode(),
      currentOwner: owner._id,
      registeredBy: registeredBy._id,
      name: spec.name,
      category: spec.category,
      brand: spec.brand,
      model: spec.model,
      serialNumber: spec.serialNumber,
      purchaseDate: day(spec.purchase),
      purchasePrice: spec.price,
      warrantyStart: day(spec.warranty[0]),
      warrantyExpiry: day(spec.warranty[1]),
      seller: spec.seller,
      description: spec.description,
      isSample: true,
      publicPassport: { token: generatePublicToken(), ...(spec.publicPassport || {}) },
    });
    created[spec.key] = asset;
    // Show sample assets as registered when they were bought (bypasses the automatic timestamp).
    // eslint-disable-next-line no-await-in-loop
    await Asset.collection.updateOne({ _id: asset._id }, { $set: { createdAt: day(spec.purchase) } });

    // Ownership history
    if (spec.registeredBySeller) {
      // eslint-disable-next-line no-await-in-loop
      await OwnershipHistory.create([
        { asset: asset._id, newOwner: users.seller._id, newOwnerName: users.seller.name, transferDate: day(spec.purchase), transferStatus: 'Registered' },
        { asset: asset._id, previousOwner: users.seller._id, previousOwnerName: users.seller.name, newOwner: owner._id, newOwnerName: owner.name, transferDate: day(-480), transferStatus: 'Transferred' },
      ]);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await OwnershipHistory.create({ asset: asset._id, newOwner: owner._id, newOwnerName: owner.name, transferDate: day(spec.purchase), transferStatus: 'Registered' });
    }

    // Maintenance records
    for (const r of spec.records) {
      let invoice = null;
      if (r.invoice) {
        const filename = `sample-invoice-${asset.assetId}-${recordCount}.pdf`;
        const filePath = resolveUploadPath('invoices', filename);
        // eslint-disable-next-line no-await-in-loop
        await writeSampleInvoice(filePath, { assetName: spec.name, record: r });
        invoice = {
          filename,
          originalName: `Sample invoice - ${spec.name} - ${formatDate(day(r.d))}.pdf`,
          mimeType: 'application/pdf',
          size: fs.statSync(filePath).size,
        };
      }
      const recordOwner = r.d < -480 && spec.registeredBySeller ? users.seller : owner;
      // eslint-disable-next-line no-await-in-loop
      await MaintenanceRecord.create({
        asset: asset._id,
        createdBy: recordOwner._id,
        serviceDate: day(r.d),
        serviceType: r.type,
        problemDescription: r.problem,
        workPerformed: r.work,
        replacedParts: r.parts || [],
        technician: r.tech,
        serviceProvider: r.provider,
        cost: r.cost,
        nextServiceDate: r.next !== undefined ? day(r.next) : undefined,
        notes: r.notes ? `${r.notes} ${SAMPLE}` : SAMPLE,
        invoice,
      });
      recordCount += 1;
    }
  }

  // A pending transfer of the washing machine to the demo buyer, so the
  // transfer flow can be demonstrated straight away.
  const transferCode = generateTransferCode();
  const transfer = await TransferRequest.create({
    asset: created.washer._id,
    currentOwner: owner._id,
    newOwnerEmail: users.buyer.email,
    codeHash: hashTransferCode(transferCode),
    message: 'Sample transfer created by the seed script.',
    expiresAt: new Date(Date.now() + env.transferExpiryHours * 60 * 60 * 1000),
  });
  await Notification.create({
    user: users.buyer._id,
    type: 'TRANSFER',
    key: `transfer:${transfer._id}:incoming`,
    title: `${owner.name} wants to transfer "${created.washer.name}" to you`,
    message: 'Enter the transfer code printed by the seed script on the Ownership Transfer page.',
    reminderDate: new Date(),
  });

  await syncReminders(owner._id);

  console.log('\nSample data created successfully.');
  console.log(`  Assets: ${ASSETS.length}   Maintenance records: ${recordCount}`);
  console.log('\nDemo accounts (password for all: Demo@12345)');
  DEMO_USERS.forEach((u) => console.log(`  ${u.email.padEnd(26)} ${u.name}`));
  console.log('\nSample ownership transfer (washing machine -> buyer@fixhistory.test)');
  console.log(`  Transfer code: ${transferCode}`);
  console.log(`  Log in as buyer@fixhistory.test, open "Ownership Transfer" and enter this code.`);
  console.log(`  The code expires in ${env.transferExpiryHours} hours. Run "npm run seed" again for a new one.\n`);

  await disconnectDB();
}

seed().catch(async (error) => {
  console.error('\nSeeding failed:', error.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
