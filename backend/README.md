# AI Legal Assistant - Backend

Modular monolithic Express backend for the AI Legal & Citizen Services Assistant.

## 🚀 Features

- **Node + Express Architecture**: Follows the strict modular monolithic backend directory structure.
- **Prisma & PostgreSQL**: Full relational schema for Users, AI Conversations, Messages, Government Services, Documents, Applications, Escalations, and Knowledge Base chunks.
- **RAG & Google Gemini AI**:
  - Language detection & Query normalization
  - Knowledge retrieval & Verified source filtering
  - Structured Gemini outputs with `confidence` (number) and `needsHuman` (boolean)
  - Strict guardrails against prompt injection
- **Redis Caching & Rate Limiting**:
  - Service directory & details caching
  - Query hash caching for frequent AI queries
  - AI rate limiting (10 queries/minute per user)
  - Zero-crash fallback to in-memory store if Redis is offline
- **Security & Authorization**:
  - Password hashing with `bcryptjs`
  - JWT authentication (`sub`, `role`)
  - Role-based authorization (`CITIZEN`, `AGENT`, `ADMIN`)
  - Zod validation for request body, query, and path parameters
  - Strict file upload validation (mime-type, extension, file size)
- **Standardized API Error & Response Contract**:
  - Success format: `{ success: true, data: ..., message: ... }`
  - Error format: `{ success: false, error: { code: ..., message: ..., details: [...] } }`

---

## 📁 Directory Structure

```
backend/
│
├── src/
│   ├── app.js
│   ├── server.js
│   │
│   ├── config/
│   │   ├── env.js
│   │   ├── db.js
│   │   ├── redis.js
│   │   └── ai.js
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── role.middleware.js
│   │   ├── validate.middleware.js
│   │   └── error.middleware.js
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.routes.js
│   │   │   └── auth.schema.js
│   │   │
│   │   ├── users/
│   │   │   ├── users.controller.js
│   │   │   ├── users.service.js
│   │   │   ├── users.routes.js
│   │   │   └── users.schema.js
│   │   │
│   │   ├── ai/
│   │   │   ├── ai.controller.js
│   │   │   ├── ai.service.js
│   │   │   ├── rag.service.js
│   │   │   ├── gemini.service.js
│   │   │   ├── ai.routes.js
│   │   │   └── ai.schema.js
│   │   │
│   │   ├── services/
│   │   │   ├── service.controller.js
│   │   │   ├── service.service.js
│   │   │   ├── service.routes.js
│   │   │   └── service.schema.js
│   │   │
│   │   ├── applications/
│   │   │   ├── application.controller.js
│   │   │   ├── application.service.js
│   │   │   ├── application.routes.js
│   │   │   └── application.schema.js
│   │   │
│   │   ├── escalations/
│   │   │   ├── escalation.controller.js
│   │   │   ├── escalation.service.js
│   │   │   ├── escalation.routes.js
│   │   │   └── escalation.schema.js
│   │   │
│   │   ├── offices/
│   │   │   ├── office.controller.js
│   │   │   ├── office.service.js
│   │   │   ├── office.routes.js
│   │   │   └── office.schema.js
│   │   │
│   │   ├── dashboard/
│   │   │   ├── dashboard.controller.js
│   │   │   ├── dashboard.service.js
│   │   │   └── dashboard.routes.js
│   │   │
│   │   └── admin/
│   │       ├── admin.controller.js
│   │       ├── admin.service.js
│   │       ├── admin.routes.js
│   │       └── admin.schema.js
│   │
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   └── utils/
│       ├── apiError.js
│       ├── apiResponse.js
│       ├── logger.js
│       ├── rateLimiter.js
│       ├── seed.js
│       └── upload.js
│
├── uploads/
├── .env
├── .env.example
├── package.json
└── test-api.js
```

---

## ⚙️ Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your variables:
```bash
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ailegal?schema=public"
JWT_SECRET="ai-legal-assistant-super-secure-jwt-secret-key-2026"
REDIS_URL="redis://localhost:6379"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3.8-flash"
BASE_URL="http://localhost:5000"
```

### 3. Setup Database (Optional if running PostgreSQL)
```bash
# Generate Prisma Client
npm run prisma:generate

# Push Schema to PostgreSQL
npm run prisma:push

# Seed initial data (Services, Offices, Knowledge Base)
npm run prisma:seed
```
*Note: If PostgreSQL or Redis are not running, the application gracefully operates using built-in in-memory fallback stores with pre-seeded data.*

### 4. Run Test Suite
```bash
npm test
```
Executes the automated test suite testing all 27 API endpoints, Zod validations, rate limiting, and error handling contracts (94 assertions).

### 5. Start Server
```bash
# Production mode
npm start

# Development mode with hot-reloading
npm run dev
```

---

## 📡 REST API Reference

Base URL: `/api/v1`

| # | Method | Endpoint | Description | Auth Required | Role |
|---|---|---|---|---|---|
| 1 | `POST` | `/auth/register` | Register new user | No | - |
| 2 | `POST` | `/auth/login` | Login user & get JWT | No | - |
| 3 | `GET` | `/auth/me` | Get current user profile | Yes | Any |
| 4 | `POST` | `/ai/conversations` | Create new AI conversation | Yes | Any |
| 5 | `GET` | `/ai/conversations` | List user's conversations | Yes | Any |
| 6 | `GET` | `/ai/conversations/:id` | Get conversation & messages | Yes | Any |
| 7 | `POST` | `/ai/conversations/:id/messages` | Ask AI (RAG + Gemini) | Yes | Any |
| 8 | `GET` | `/services` | Search service directory | No | - |
| 9 | `GET` | `/services/:id` | Get service details & docs | No | - |
| 10 | `GET` | `/services/:id/checklist` | Get document checklist | No | - |
| 11 | `GET` | `/offices` | Find nearby offices (Haversine) | No | - |
| 12 | `POST` | `/applications` | Create service application | Yes | CITIZEN |
| 13 | `GET` | `/applications` | Get my applications | Yes | CITIZEN |
| 14 | `GET` | `/applications/:id` | Get application details | Yes | CITIZEN |
| 15 | `POST` | `/applications/:id/documents` | Upload document (multipart) | Yes | CITIZEN |
| 16 | `POST` | `/escalations` | Create human case escalation | Yes | CITIZEN |
| 17 | `GET` | `/escalations` | List my escalation cases | Yes | CITIZEN |
| 18 | `GET` | `/escalations/:id` | Get case details & messages | Yes | CITIZEN / AGENT |
| 19 | `POST` | `/escalations/:id/messages` | Citizen message in case | Yes | CITIZEN |
| 20 | `GET` | `/dashboard` | Citizen dashboard summary | Yes | CITIZEN |
| 21 | `GET` | `/admin/escalations` | Escalation queue | Yes | ADMIN / AGENT |
| 22 | `GET` | `/admin/escalations/:id` | Case details for admin | Yes | ADMIN / AGENT |
| 23 | `PATCH` | `/admin/escalations/:id` | Update case status | Yes | ADMIN / AGENT |
| 24 | `POST` | `/admin/escalations/:id/messages` | Admin / Agent reply | Yes | ADMIN / AGENT |
| 25 | `POST` | `/admin/services` | Create government service | Yes | ADMIN |
| 26 | `PATCH` | `/admin/services/:id` | Update government service | Yes | ADMIN |
| 27 | `DELETE` | `/admin/services/:id` | Deactivate service (soft-delete) | Yes | ADMIN |
