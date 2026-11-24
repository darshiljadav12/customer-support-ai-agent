// Centralised, validated configuration. NODE_ENV switches dev/prod behaviour.
import { z } from 'zod';

// Load server/.env when present (local development). Variables that are
// already set — by Render, Docker Compose or the shell — always win.
try {
  process.loadEnvFile();
} catch (err) {
  if (err.code !== 'ENOENT') throw err; // no .env file is fine (production)
}

// The only AI provider this app supports.
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Comma-separated list of allowed frontend origins (only needed when the
  // client is served from a different origin than the API).
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  // Set to "none" when frontend and API live on different sites (e.g. Vercel + Render).
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  // Optional override. Default: secure in production. Set "false" only for a
  // production build served over plain http://localhost (e.g. docker compose).
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),

  // Number of reverse proxies in front of the app (Render = 1; Vercel rewrite → Render = 2).
  // Used to read the real client IP for rate limiting. Default: 1 in
  // production, 0 otherwise. Must be 0 when nothing sits in front of the app,
  // or clients could spoof X-Forwarded-For to dodge rate limits.
  TRUST_PROXY: z.coerce.number().int().min(0).optional(),

  // Folder with the built React app (client/dist). When set, Express serves
  // the frontend too → one server, same origin. Unset in development (Vite).
  CLIENT_DIST: z.string().optional(),

  // AI (OpenRouter). OPENROUTER_MODELS is a comma-separated fallback list:
  // OpenRouter tries them in order if one is rate-limited or unavailable.
  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_MODELS: z
    .string()
    .default('google/gemma-4-31b-it:free,nvidia/nemotron-3.5-lightning:free,inclusionai/ling-3.2-flash:free'),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  // How many previous messages of the conversation are sent as context.
  AI_HISTORY_LIMIT: z.coerce.number().int().positive().default(20),
  APP_URL: z.string().default('http://localhost:5173'),
  APP_NAME: z.string().default('Customer Support AI Agent'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;
const isProd = env.NODE_ENV === 'production';

export const config = {
  env: env.NODE_ENV,
  isProd,
  port: env.PORT,
  mongoUri: env.MONGO_URI,
  trustProxy: env.TRUST_PROXY ?? (isProd ? 1 : 0),
  clientDist: env.CLIENT_DIST,
  jwt: { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN },
  corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  cookie: {
    name: 'token',
    sameSite: env.COOKIE_SAMESITE,
    // SameSite=None always requires Secure; otherwise secure in production
    // unless explicitly overridden.
    secure:
      env.COOKIE_SAMESITE === 'none' ||
      (env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE === 'true' : isProd),
  },
  ai: {
    apiKey: env.OPENROUTER_API_KEY,
    models: env.OPENROUTER_MODELS.split(',').map((m) => m.trim()).filter(Boolean),
    baseUrl: OPENROUTER_BASE_URL,
    maxTokens: env.AI_MAX_TOKENS,
    timeoutMs: env.AI_TIMEOUT_MS,
    historyLimit: env.AI_HISTORY_LIMIT,
    appUrl: env.APP_URL,
    appName: env.APP_NAME,
  },
};
