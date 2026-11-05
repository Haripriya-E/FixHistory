import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';

/** Small request logger for development (method, path, status, duration). */
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });
  next();
}

/** Removes keys that start with "$" or contain "." (MongoDB operator injection). */
function stripMongoOperators(value) {
  if (Array.isArray(value)) return value.map(stripMongoOperators);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) delete value[key];
      else value[key] = stripMongoOperators(value[key]);
    }
  }
  return value;
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (env.isProduction) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Only ask browsers to upgrade to HTTPS when the app is really served over HTTPS.
          upgradeInsecureRequests: env.cookieSecure ? [] : null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: [env.clientUrl, env.publicAppUrl],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    if (req.body) stripMongoOperators(req.body);
    next();
  });
  if (!env.isProduction && !env.isTest) app.use(requestLogger);

  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        time: new Date().toISOString(),
      },
    });
  });

  app.use('/api', apiRoutes);
  app.use('/api', notFound);

  // In production (`npm run build` then `npm start`) the API also serves the React app.
  const indexHtml = path.join(env.clientDistDir, 'index.html');
  if (env.isProduction && fs.existsSync(indexHtml)) {
    app.use(express.static(env.clientDistDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method) || req.path.startsWith('/api')) return next();
      return res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
