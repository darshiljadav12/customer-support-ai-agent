# Customer Support AI Agent

A full-stack AI customer-support chat app. Users sign up, chat with an AI support assistant whose replies **stream in token by token**, and come back later to their saved conversations.

**Stack:** React 19 + Vite + Tailwind · Node.js + Express 5 · MongoDB (Mongoose) · JWT + bcrypt · OpenRouter (free LLMs) · Docker Compose

---

## Features

**Authentication**
- Signup / login / logout with **JWT**, passwords hashed with **bcrypt** (12 rounds)
- Token stored in an **httpOnly cookie** (never readable by JavaScript → not stealable via XSS); `Authorization: Bearer` also accepted for API clients
- Protected routes on both API and frontend; session restored on reload via `/auth/me`

**Chat**
- **Streaming replies** (Server-Sent Events) with a smooth typewriter reveal, typing indicator and **Stop generating** button
- Conversation history per user (sidebar), multi-turn context (last 20 messages sent to the model)
- Markdown rendering, retry on failure, delete conversations, suggestion prompts
- Responsive (mobile drawer), automatic dark mode, accessible labels

**Robustness & security**
- Strict input validation (zod), centralised JSON errors, no stack traces in production
- **Rate limiting**: 300 req/15 min per IP globally, 20 auth attempts/15 min per IP, 10 AI messages/min **per user**
- All chat data is user-scoped; another user's conversation id returns 404 (no id probing)
- Free-model resilience: fallback model list, one automatic retry on empty replies, timeouts, upstream request cancelled when the user stops or disconnects
- **Dev/prod config switching** via `NODE_ENV` and validated environment variables (the API refuses to start with a missing/weak config)

---

## Quick start (Docker)

Requirements: Docker Desktop (or Docker Engine + Compose v2).

```bash
git clone https://github.com/darshiljadav12/customer-support-ai-agent.git
cd customer-support-ai-agent

cp server/.env.example server/.env
# edit server/.env:
#   OPENROUTER_API_KEY=...   (free key: https://openrouter.ai/keys)
#   JWT_SECRET=...           (node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

docker compose up --build
```

Open **http://localhost:8080**.

| Service | What | Exposed |
|---|---|---|
| `app` | One container: Express serves the API (`/api/*`) **and** the built React app (`NODE_ENV=production`) | `localhost:8080` (`APP_PORT` to change) |
| `mongo` | MongoDB 7 with a named volume (`mongo-data`) | internal only |

The root [`Dockerfile`](Dockerfile) is multi-stage: it builds the React app, then copies the result next to the API.

Use **MongoDB Atlas** instead of the local container:

```bash
MONGO_URI="mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/support-agent" docker compose up --build
```

`docker compose down` stops everything and keeps your data; `docker compose down -v` also deletes the database volume.

---

## Local development

Requirements: Node.js 20+ and a MongoDB (local install, Docker, or Atlas).

```bash
# 1) API (http://localhost:5000, auto-restarts on change)
cd server
cp .env.example .env        # set OPENROUTER_API_KEY, JWT_SECRET, MONGO_URI
npm install
npm run dev

# 2) Frontend (http://localhost:5173) — in a second terminal
cd client
npm install
npm run dev
```

In development Vite proxies `/api/*` to `localhost:5000`, so the browser only ever talks to one origin — the same as in Docker/production, where Express serves the frontend itself.

Other scripts: `npm run lint` and `npm run build` (client), `npm start` (server, no watch).

---

## Architecture

```
                    ┌──────────── Express (one server) ────────────┐
Browser ──────────► │  /api/*        → API routes ──► MongoDB       │
  httpOnly JWT      │                        └──────► OpenRouter    │
  cookie, same      │  /assets/*     → React build (cached 1 year)  │
  origin, no CORS   │  page loads    → index.html (React Router)    │
                    └───────────────────────────────────────────────┘
```

`/chat/...` exists both as a page and as an API path. Express tells them apart by the `Accept` header: a browser page load (`text/html`) gets `index.html`, API calls (JSON) reach the API. Responses are gzip-compressed, except streams, which are never buffered.

```
server/src
├── server.js            boot, DB connect, graceful shutdown
├── app.js               middleware (helmet, cors, compression, cookies, logging, rate limit),
│                        API routes, and serving the React build in production
├── config/              validated env config (dev/prod), Mongo connection
├── models/              User, Conversation, Message
├── controllers/         auth, chat (JSON + SSE streaming)
├── services/ai.service  OpenRouter client (normal + streaming, error mapping, timeouts)
├── middleware/          requireAuth, validate (zod), rateLimit, error handler
└── routes/

client/src
├── lib/api.js           axios instance, SSE stream reader, error helpers
├── lib/typewriter.js    smooths bursty token streams into a steady reveal
├── context/AuthContext  session state, login/signup/logout
├── components/          route guards, auth form parts, chat UI
└── pages/               Login, Signup, Chat
```

**Data model:** `User` → many `Conversation` (title, lastMessageAt) → many `Message` (role, content, model, stopped). Every message also stores its owner so all queries are scoped to the user. Indexes: `{user, lastMessageAt}` and `{conversation, createdAt}`.

**Persistence rules for a reply:** completed → saved; user pressed Stop after some text → saved with `stopped: true`; AI error → nothing saved (the user can retry, history never contains half-failed exchanges).

---

## API reference

All endpoints accept/return JSON. Errors: `{ "error": { "message": "...", "details": [...]? } }`.
Routes marked 🔒 need the auth cookie or `Authorization: Bearer <token>`.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/signup` | `{ name, email, password }` (password 8–72 chars) | `201 { user, token }` + cookie |
| POST | `/auth/login` | `{ email, password }` | `200 { user, token }` + cookie |
| POST | `/auth/logout` | – | `200`, clears cookie |
| GET 🔒 | `/auth/me` | – | `{ user }` |
| POST 🔒 | `/chat/send` | `{ message, conversationId? }` | `201 { conversation, userMessage, reply }` |
| POST 🔒 | `/chat/send/stream` | `{ message, conversationId? }` | `text/event-stream` (see below) |
| GET 🔒 | `/chat/history` | – | `{ conversations: [...] }` newest first |
| GET 🔒 | `/chat/history/:id` | – | `{ conversation, messages: [...] }` |
| DELETE 🔒 | `/chat/history/:id` | – | `204` |
| GET | `/health` | – | `{ status, env, db }` |

Omit `conversationId` to start a new conversation. Every endpoint is available both at the path above and with an `/api` prefix (`/api/auth/signup`, …); the frontend uses the `/api` form.

**Streaming events** (`/chat/send/stream`):

```
event: meta   data: {"conversation":{...}}
event: delta  data: {"text":"Hello"}          (repeated)
event: done   data: {"conversation":{...},"userMessage":{...},"reply":{...}}
event: error  data: {"message":"..."}         (instead of done, on failure)
```

Errors that happen before streaming starts (validation, 404, AI unavailable) are returned as normal JSON with a proper status code.

```bash
# Example with curl
curl -c jar.txt -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"secret123"}' http://localhost:8080/api/auth/login
curl -N -b jar.txt -H 'Content-Type: application/json' \
  -d '{"message":"My order hasn'\''t arrived"}' http://localhost:8080/api/chat/send/stream
```

---

## Configuration

Server (`server/.env`, see [`server/.env.example`](server/.env.example)):

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` → secure cookies, combined logs, no error details |
| `PORT` | `5000` | |
| `MONGO_URI` | – (required) | local or Atlas connection string |
| `JWT_SECRET` | – (required, ≥ 32 chars) | |
| `JWT_EXPIRES_IN` | `7d` | |
| `CORS_ORIGINS` | `http://localhost:5173` | comma separated; only needed for cross-origin hosting |
| `COOKIE_SAMESITE` | `lax` | `none` when frontend and API are on different sites (forces Secure) |
| `COOKIE_SECURE` | auto | defaults to `true` in production; compose sets `false` for http://localhost |
| `TRUST_PROXY` | `1` in production, else `0` | number of proxies in front of the app: Render alone = 1, Vercel rewrite → Render = 2, nothing in front (docker compose) = 0. Too high a value lets clients fake their IP to dodge rate limits |
| `CLIENT_DIST` | – | folder of the React build; when set, Express serves the frontend (the Dockerfile sets it) |
| `OPENROUTER_API_KEY` | – | free key at openrouter.ai/keys |
| `OPENROUTER_MODELS` | 3 free models | comma-separated fallback list, tried in order |
| `AI_MAX_TOKENS` / `AI_TIMEOUT_MS` / `AI_HISTORY_LIMIT` | `1024` / `60000` / `20` | |
| `APP_NAME` | `Customer Support AI Agent` | used in the assistant's system prompt |

Client (`client/.env`, build-time): `VITE_API_URL` — leave empty (same-origin `/api`); set only if the API is on another domain.

---

## Deployment: Render (API) + Vercel (frontend)

```
Browser ──► Vercel (React app)
              └─ /api/*  ──rewrite──► Render (Express API) ──► MongoDB Atlas
```

Vercel forwards `/api/*` to Render, so the browser only talks to the Vercel domain: the auth cookie is
**first-party** (works in Safari and other browsers that block third-party cookies) and no CORS setup is needed.

**1. Database — MongoDB Atlas (free M0)**
Create a cluster and a database user, allow network access from anywhere (`0.0.0.0/0`, Render's IPs are not fixed),
and copy the connection string.

**2. API — Render** (*New → Web Service* → this repo)

| Setting | Value |
|---|---|
| Root directory | `server` |
| Runtime | Node |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check path | `/health` |

Environment variables: `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `OPENROUTER_API_KEY`,
`APP_URL=https://<your-app>.vercel.app`, and `TRUST_PROXY=2` (requests pass through Vercel *and* Render's proxy;
the API needs the real client IP for rate limiting).

Note: Render's free instances sleep after ~15 minutes without traffic; the first request afterwards takes a while.

**3. Frontend — Vercel** (*Add New → Project* → this repo)

| Setting | Value |
|---|---|
| Root directory | `client` |
| Framework preset | Vite (build `npm run build`, output `dist`) |
| Environment variables | none (`VITE_API_URL` stays empty → same-origin `/api`) |

Then put your Render URL in [`client/vercel.json`](client/vercel.json) (the `/api` rewrite must come before the SPA fallback):

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<your-api>.onrender.com/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**4. Check:** `https://<your-app>.vercel.app/api/health` returns `{"status":"ok",…}`; then sign up and send a message.

*Fallback (direct cross-origin calls, no rewrite):* set `VITE_API_URL=https://<your-api>.onrender.com` on Vercel and
`CORS_ORIGINS=https://<your-app>.vercel.app`, `COOKIE_SAMESITE=none`, `TRUST_PROXY=1` on Render. This works only in browsers
that allow third-party cookies (not Safari by default).

---

## Troubleshooting

- **"The AI service is busy right now"** — the free model is rate-limited upstream, or your OpenRouter account hit its **daily free-request limit** (check the API logs — `docker compose logs app` locally, the *Logs* tab on Render; the limit resets daily, adding credits raises it). You can also change `OPENROUTER_MODELS` to other free models from [openrouter.ai/models](https://openrouter.ai/models?q=free).
- **API exits with "Invalid environment configuration"** — a required variable is missing or too short; the message lists which.
- **Port 8080 already in use** — `APP_PORT=3000 docker compose up`.
- **Logged out immediately in production** — you're serving over plain HTTP with `NODE_ENV=production`; use HTTPS or set `COOKIE_SECURE=false` for local testing only.
