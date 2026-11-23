# One image: Express serves both the API and the built React app.

# ---- Stage 1: build the React app ----
FROM node:22-alpine AS client
WORKDIR /client

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
# Empty → the app calls /api on its own origin (this same server).
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Stage 2: API + static frontend ----
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Production dependencies first (cached unless package files change).
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server/src ./src
COPY --from=client /client/dist ./public
ENV CLIENT_DIST=/app/public

# Run as the unprivileged "node" user that ships with the image.
USER node

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# node directly (not npm) so SIGTERM reaches the app → graceful shutdown.
CMD ["node", "src/server.js"]
