# 🏛️ AI Legal & Citizen Services Assistant

An AI-powered assistant that helps Indian citizens understand their legal rights and apply for government services in **Uttar Pradesh**. It answers questions in **English, Hindi and Hinglish**, using only verified government sources (RAG), and hands over to a human agent when it is not confident.

- 🌐 **Live app:** `https://ai-legal-assisstant-frontend.vercel.app/`

> ⚠️ This project gives general legal information for public awareness. It is not a substitute for advice from a qualified lawyer.

---

## ✨ Features

- **AI assistant (RAG)**: answers grounded in verified sources, with source links, confidence score and language detection (English / Hindi / Hinglish)
- **Human escalation**: low-confidence or out-of-scope questions can be escalated to an agent, with a case thread for messages
- **Service directory**: search government services, view eligibility and required documents
- **Document checklist**: tick off the documents you have before visiting an office
- **Office finder**: find nearby offices by city or GPS (Haversine distance)
- **Applications**: start an application, upload documents, track status
- **Role-based access**: `CITIZEN`, `AGENT`, `ADMIN` (admin portal for cases and service management)
- **Safety guards**: unknown-field guard (e.g. processing time), similarity threshold, prompt-injection-resistant system prompt, rate limiting

### Knowledge covered

- **Certificates (UP):** Income, Caste, Domicile, Birth, Death, Marriage, EWS, Disability, Character
- **Legal rights:** Fundamental Rights, Free Legal Aid (UPSLSA), Legal Services Authorities Act, BNSS (police procedure), PWDVA 2005, POCSO 2012, Juvenile Justice Act 2015, Consumer Protection Act 2019, Women Helpline 181, Child Helpline 1098, National Cyber Crime Reporting Portal

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, React Router 7, Axios |
| Backend | Node.js, Express 4, Zod, JWT, bcryptjs, Multer, Helmet |
| Database | PostgreSQL (Supabase) with Prisma 5 |
| AI / RAG | Google Gemini (generation + embeddings), Groq (fallback), Qdrant (vector search) |
| Cache | Redis (optional; falls back to in-memory) |
| Hosting | Vercel (frontend), Render (backend) |

---

## 📁 Project Structure

```
.
├── frontend/                 # React + Vite app
│   ├── src/
│   │   ├── pages/            # Landing, Assistant, Services, Applications, Cases, admin/*
│   │   ├── components/
│   │   ├── services/         # API clients (axios)
│   │   └── context/          # AuthContext
│   └── vercel.json           # SPA rewrites
│
└── backend/
    ├── src/
    │   ├── app.js, server.js
    │   ├── config/           # env, db, redis, ai
    │   ├── middleware/       # auth, role, validate, error
    │   ├── modules/          # auth, users, ai, services, offices,
    │   │                     # applications, escalations, dashboard, admin
    │   ├── prisma/schema.prisma
    │   └── utils/
    ├── data/
    │   ├── services/         # certificate knowledge (JSON)
    │   └── legal/            # legal knowledge (JSON)
    ├── scripts/              # ingestKnowledge, ingestLegalKnowledge, evaluateRag
    └── tests/
```

---

## 🚀 Run Locally

**Requirements:** Node.js 22+, a PostgreSQL database, a Gemini API key, a Qdrant Cloud cluster. (Groq key and Redis are optional.)

### 1. Backend

```bash
cd backend
npm install
```

Create `backend/.env` (see the [environment variables](#-environment-variables) table below), then:

```bash
npm run prisma:generate
npm run prisma:push       # create tables
npm run prisma:seed       # users, services, offices
npm run ingest            # certificate knowledge → Postgres + Qdrant
npm run ingest:legal      # legal knowledge → Postgres + Qdrant
npm run dev               # http://localhost:5000
```

> If PostgreSQL or Redis are offline, the API falls back to in-memory stores so you can still try it out.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

In development, Vite proxies `/api` to `http://localhost:5000`, so no frontend env is needed.

---

## 🔐 Environment Variables

### Backend (`backend/.env` locally, Render dashboard in production)

| Key | Required | Example / Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL URL. With Supabase on Render, use the **Session pooler** URL |
| `JWT_SECRET` | ✅ | Long random string (never commit it) |
| `JWT_EXPIRES_IN` | | `7d` |
| `NODE_ENV` | | `development` / `production` |
| `PORT` | | `5000` locally (Render sets it automatically) |
| `BASE_URL` | ✅ | Public URL of the backend, e.g. `https://<app>.onrender.com` |
| `LLM_PROVIDER` | | `gemini` (default), `groq`, or `auto` |
| `GEMINI_API_KEY` | ✅ | Google AI Studio key |
| `GEMINI_MODEL` | | `gemini-2.5-flash` |
| `GEMINI_EMBEDDING_MODEL` | | `gemini-embedding-001` |
| `GROQ_API_KEY` | | Fallback provider |
| `GROQ_MODEL` | | `openai/gpt-oss-120b` |
| `QDRANT_URL` | ✅ | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | ✅ | Qdrant API key |
| `QDRANT_COLLECTION` | | `citizen_service_chunks` |
| `SIMILARITY_THRESHOLD` | | `0.30` |
| `AI_REQUEST_TIMEOUT_MS` | | `15000` |
| `RAG_ALLOW_LOCAL_FALLBACK` | | `true` |
| `REDIS_URL` | | Optional; in-memory fallback if unset |
| `MAX_FILE_SIZE_MB` | | `10` |
| `ALLOWED_FILE_EXTENSIONS` | | `pdf,jpg,jpeg,png,doc,docx` |
| `RATE_LIMIT_AI_MAX` | | `10` |
| `RATE_LIMIT_AI_WINDOW_SECONDS` | | `60` |

### Frontend (Vercel dashboard only)

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://<your-render-app>.onrender.com/api/v1` |

> `VITE_API_URL` is baked in at build time. Redeploy after changing it.

---

## ☁️ Deployment

Deploy in this order: **database → backend → seed/ingest → frontend**.

### 1. Database (Supabase)

Copy the **Session pooler** connection string (`...pooler.supabase.com:5432`). Render cannot reach Supabase's direct IPv6-only host.

### 2. Backend on Render (Web Service)

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm install --include=dev && npx prisma generate --schema=src/prisma/schema.prisma && npx prisma db push --schema=src/prisma/schema.prisma` |
| Start Command | `npm start` |
| Health Check Path | `/api/v1/health` |

Add all backend environment variables from the table above. Do **not** set `PORT`.

### 3. Seed and ingest (run once, from your laptop)

Point your local `backend/.env` at the production database (and Qdrant), then:

```bash
npm run prisma:seed
npm run ingest
npm run ingest:legal
```

Then restore your local `.env`.

> 🔒 The seed script creates demo admin and agent accounts. Change their passwords (or delete them) before sharing the app publicly.

### 4. Frontend on Vercel

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Env var | `VITE_API_URL` = `https://<your-render-app>.onrender.com/api/v1` |

`frontend/vercel.json` rewrites all routes to `index.html` so React Router URLs work on refresh:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Deployment notes

- Render's free tier sleeps after ~15 minutes idle, so the first request can take 30–60 seconds.
- Render's free disk is ephemeral, so uploaded documents are lost on redeploy. Use Cloudinary or S3 for permanent storage.

---

## 🧪 Tests

```bash
cd backend
npm test            # API test suite (test-api.js)
npm run test:ai     # RAG / AI unit tests
npm run eval        # end-to-end RAG evaluation (add -- --no-llm to skip the LLM)
```

---

## 📡 API Overview

Base URL: `/api/v1`

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| AI | `POST/GET /ai/conversations`, `GET /ai/conversations/:id`, `POST /ai/conversations/:id/messages` |
| Services | `GET /services`, `GET /services/:id`, `GET /services/:id/checklist` |
| Offices | `GET /offices` |
| Applications | `POST/GET /applications`, `GET /applications/:id`, `POST /applications/:id/documents` |
| Escalations | `POST/GET /escalations`, `GET /escalations/:id`, `POST /escalations/:id/messages` |
| Dashboard | `GET /dashboard` |
| Admin | `/admin/escalations*`, `/admin/services*` (ADMIN / AGENT only) |

All responses follow one contract:

```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "...", "message": "...", "details": [] } }
```

---

