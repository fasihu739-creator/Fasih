# AI Engineering Intelligence Brain

**"Understand the Past. Predict the Impact. Protect the Future."**

An enterprise engineering intelligence SaaS platform built for UK software development organisations (50–249 employees, 15–150 engineers) connecting **Engineering Decisions → Code Changes → Dependencies → Historical Incidents → Future Change Impact**.

---

## Core Architecture

- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (Light & Dark themes), Vite.
- **Backend API**: Express (`server.ts`, `src/server/routes/*`) with strict Firebase Auth ID token verification and multi-tenant `organization_id` RBAC enforcement (`owner`, `admin`, `architect`, `engineer`, `viewer`).
- **Database**: Cloud SQL (**PostgreSQL**) managed via **Drizzle ORM** (`src/db/schema.ts`, `src/db/index.ts`).
- **AI Intelligence**: Server-side `@google/genai` (`gemini-4-hydrogen`) grounded strictly in tenant-scoped records, separating **Confirmed Facts** from **AI-Generated Hypotheses** with explicit citations, confidence levels, and limitations.
- **Integrations**: Least-privilege GitHub OAuth & REST API ingestion (`src/server/services/githubService.ts`) paired with TypeScript/JavaScript/Python static import & complexity parsing (`src/server/services/dependencyParser.ts`).

---

## Key API Endpoints

- `GET /api/public/plans` — Configurable Starter / Professional / Enterprise pricing plans.
- `POST /api/public/demo-request` — Book-a-demo intake stored in PostgreSQL.
- `GET /api/me` & `POST /api/orgs` — User profile, Demo Workspace isolation, and clean Production Organisation provisioning.
- `GET /api/orgs/:orgId/overview` — Transparent engineering intelligence KPIs with explicit calculation formulas.
- `GET|POST /api/orgs/:orgId/decisions` — Engineering Decision DNA (ADRs linked to PRs & outcomes).
- `GET|POST /api/orgs/:orgId/incidents` — Technical Mistake Memory (bugs, rollbacks, DB/security incidents).
- `GET /api/orgs/:orgId/architecture` — Component topology & architecture drift detection.
- `GET|POST|PATCH /api/orgs/:orgId/technical-debt` — Prioritised technical debt radar & scanning.
- `GET|POST /api/orgs/:orgId/impact/analyze` — AI Change Impact Predictor generating structured evidence reports.
- `GET|POST /api/orgs/:orgId/assistant/ask` — Grounded AI Engineering Assistant.
- `GET|POST|PATCH|DELETE /api/orgs/:orgId/integrations/github/*` — Least-privilege GitHub OAuth, repository authorisation, and live AST/commit sync.
- `GET|PUT /api/admin/plans` — Platform Admin configurable subscription pricing & limits.

---

## Running & Testing

- **Development**: `npm run dev` (starts Express + Vite middleware on port `3000`)
- **Type Check**: `npm run lint` (`tsc --noEmit`)
- **Automated Tests**: `npm test` (`tsx --test tests/*.test.ts`)
- **Production Build**: `npm run build` followed by `NODE_ENV=production npm start`

## GitHub OAuth Setup (Optional for Private Repositories)

Configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in Secrets and register:
- `<APP_URL>/auth/github/callback`
