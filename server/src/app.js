import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { config } from './config/index.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import chatRoutes from './routes/chat.routes.js';

export function createApp() {
  const app = express();

  // Real client IP behind a hosting proxy (rate limiting, secure cookies).
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Only force https sub-resources when we're actually served over https.
          upgradeInsecureRequests: config.cookie.secure ? [] : null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true, // allow the auth cookie cross-origin
    }),
  );
  app.use(
    compression({
      // Never compress Server-Sent Events: gzip would buffer the stream.
      filter: (req, res) =>
        !String(res.getHeader('Content-Type') ?? '').startsWith('text/event-stream') &&
        compression.filter(req, res),
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(morgan(config.isProd ? 'combined' : 'dev'));

  // ---- Frontend (production / Docker): serve the built React app ----------
  const clientDist = config.clientDist && path.resolve(config.clientDist);
  if (clientDist && fs.existsSync(path.join(clientDist, 'index.html'))) {
    // Hashed build files never change → cache for a year.
    app.use('/assets', express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(clientDist, { index: false }));

    // SPA fallback: a browser *page load* of /login, /chat/<id>, … gets
    // index.html and React Router takes over. API calls (fetch/axios send
    // JSON or */* Accept headers) fall through to the API routes below —
    // this matters because /chat/... exists both as a page and an API path.
    app.use((req, res, next) => {
      const isPageLoad =
        (req.method === 'GET' || req.method === 'HEAD') && (req.get('accept') ?? '').includes('text/html');
      if (!isPageLoad || req.path.startsWith('/api/')) return next();
      // Always revalidate index.html so new deploys are picked up immediately.
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'), { cacheControl: false });
    });
    console.log(`🖥️  Serving frontend from ${clientDist}`);
  }

  // ---- API ------------------------------------------------------------------
  const api = Router();
  api.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      env: config.env,
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  });
  api.use('/auth', authRoutes);
  api.use('/chat', chatRoutes);

  app.use(apiLimiter);
  app.use('/api', api); // used by the frontend (same as the Vite dev proxy)
  app.use(api); // also at the root: /auth/signup, /chat/send, … as in the spec

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
