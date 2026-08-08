# Vocare arrearage agent — single-container deployment.
#
# One process serves three things: the REST API, the built React SPA, and the
# WebSocket voice bridge to Azure gpt-realtime. They must stay in one container
# because the bridge holds a live socket per case and the workflow state machine
# keeps cases in memory — see the replica note in the deploy docs.

# ── stage 1: build the SPA ───────────────────────────────────────────
FROM node:22-slim AS frontend
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# vite.config.js writes the bundle to ../frontend-dist, i.e. /app/frontend-dist.
RUN npm run build

# ── stage 2: runtime ─────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src/ ./src/
COPY data/ ./data/
COPY public/ ./public/
COPY --from=frontend /app/frontend-dist ./frontend-dist

# Container Apps routes to this port; server.js reads PORT. No .env file is
# baked into the image — every secret arrives as a container environment
# variable, and dotenv silently no-ops when the files are absent.
ENV PORT=8080
EXPOSE 8080

# Run as the stock non-root user. The only runtime write is the knowledge-gaps
# file, which lives under /app/data and is ephemeral by design.
RUN chown -R node:node /app/data
USER node

CMD ["node", "src/server.js"]
