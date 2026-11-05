import dns from 'node:dns';
import { env, getConfigProblems } from './config/env.js';
import { connectDB, disconnectDB, maskMongoUri } from './config/db.js';
import { createApp } from './app.js';
import { ensureUploadFolders } from './middleware/upload.js';
dns.setServers(['8.8.8.8', '8.8.4.4']);
async function start() {
  const problems = getConfigProblems();
  if (problems.length) {
    console.error('\nFixHistory cannot start because of configuration problems:\n');
    problems.forEach((p) => console.error(`  - ${p}`));
    console.error('\nSee README.md > "Configure environment variables".\n');
    process.exit(1);
  }

  ensureUploadFolders();

  console.log(`Connecting to MongoDB at ${maskMongoUri(env.mongoUri)} ...`);
  const db = await connectDB(env.mongoUri);
  console.log(`MongoDB connected (database: ${db.name})`);

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`FixHistory API running on http://localhost:${env.port}  (${env.nodeEnv})`);
    if (env.isProduction) console.log(`Open the app at http://localhost:${env.port}`);
    else console.log(`React app (when started with "npm run dev"): ${env.clientUrl}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${env.port} is already in use. Close the other program or change PORT in .env.`);
    } else {
      console.error(error);
    }
    process.exit(1);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close();
    await disconnectDB().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
