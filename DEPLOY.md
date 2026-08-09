# Deploying to Vercel

Vercel serves the **compliance-drift frontend** as a static build
(`vercel.json` at the repo root drives the install/build/output settings).

## Steps

1. `vercel` (or import the GitHub repo in the Vercel dashboard). The root
   `vercel.json` handles everything — no framework preset needed.
2. Set the environment variable **`VITE_API_BASE`** in the Vercel project to
   the public origin of the Vocare backend (`src/server.js`), e.g.
   `https://api.your-backend.example`. It is baked in at build time and used
   for the assistant API, voice transcription, and the officer-voice
   WebSocket (`wss` is derived automatically).
3. Redeploy after changing `VITE_API_BASE` (build-time variable).

Without `VITE_API_BASE` the UI still deploys and browses fully (cases,
monitoring, evidence, PDFs — all static), but the assistant chat, voice
transcription, and live voice degrade with visible errors.

## The backend is NOT deployable to Vercel

`src/server.js` needs long-lived WebSockets (voice bridges to Azure
realtime), local `.env`/`.env.local` secrets, neo4j, and heavy ML deps —
host it on a VM/container platform (Railway, Fly.io, Azure Container Apps…)
and point `VITE_API_BASE` at it. CORS: the backend currently assumes
same-origin via the Vite proxy; if the Vercel domain differs from the
backend origin, add CORS headers for the Vercel domain in `src/server.js`.
