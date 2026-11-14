# DRAIN-X P0.7.1 — DEPLOYMENT CONFIGURATION REPORT

> **Document Version:** 1.0.0  
> **Milestone:** P0.7.1 — Actual Staging Deployment Preparation  
> **Repository Context:** `https://github.com/DivyakantSarraf/Drain-X`  
> **Target Branch / Baseline Commit:** `main` @ `4d9713f`  
> **Working Tree:** `C:\Users\jonathan raposo\OneDrive\Documents\DRAIN-X-CLEAN`  
> **Execution Status:** **CONFIGURATION PREPARATION COMPLETED / READY FOR OPERATOR PROVISIONING**  
> **Live Deployment Status:** **NOT DEPLOYED (Configuration & Local Verification Only)**  

---

## 1. Executive Summary

Milestone **P0.7.1** prepares all deployment configuration assets, container definitions, environment routing, and healthcheck probes for the **DRAIN-X Predictive Urban Drainage Intelligence System** without performing live deployment execution or claiming live hosting.

All configurations strictly adhere to the existing DRAIN-X contracts, preserving:
- FastAPI backend routes and real-time WebSocket telemetry hub (`/api/v1/telemetry/stream`).
- Supabase Cloud PostgREST persistence and Row-Level Security (RLS) policies.
- React 18 + Vite municipal dashboard and 3D digital twin.
- 100% of existing unit, integration, and contract tests across backend and frontend.

---

## 2. Files Created and Modified

| File Path | Action | Description / Rationale |
| :--- | :---: | :--- |
| `backend/Dockerfile` | **Created** | Multi-stage production container (`python:3.12-slim`, non-root user `drainx`, dynamic `$PORT` binding for Render/Cloud Run, native `/api/v1/health/liveness` healthcheck). |
| `backend/Procfile` | **Created** | Direct PaaS process declaration (`web: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`). |
| `render.yaml` | **Created** | Infrastructure-as-code Blueprint for deploying the FastAPI backend as a Render Web Service with healthcheck routing and secure environment variable placeholders. |
| `frontend/vercel.json` | **Created** | Edge deployment specification for Vercel providing SPA client-side history fallback (`/* -> /index.html`) and security headers (`X-Frame-Options`, `X-Content-Type-Options`). |
| `frontend/src/vite-env.d.ts` | **Created** | Strict TypeScript declaration file for Vite environment variables (`VITE_API_BASE_URL`, `VITE_WS_BASE_URL`). |
| `backend/app/core/config.py` | **Modified** | Added optional `ADDITIONAL_CORS_ORIGINS` setting for flexible cloud staging domains without breaking localhost defaults. |
| `backend/app/main.py` | **Modified** | Updated `CORSMiddleware` to dynamically merge `settings.CORS_ORIGINS` with comma-separated entries from `ADDITIONAL_CORS_ORIGINS`. |
| `backend/app/api/v1/health.py` | **Modified** | Extended health endpoints to provide distinct container liveness (`/api/v1/health/liveness`) and Supabase persistence readiness (`/api/v1/health/ready`). |
| `frontend/src/api/client.ts` | **Modified** | Configured `API_BASE` to dynamically resolve from `import.meta.env.VITE_API_BASE_URL` with relative `/api/v1` fallback. |
| `frontend/src/api/streamClient.ts` | **Modified** | Configured `getWebSocketStreamUrl` to dynamically resolve from `import.meta.env.VITE_WS_BASE_URL` with automatic `wss://` protocol conversion and window fallback. |

---

## 3. Exact Startup and Build Commands

### Backend:
- **Build Command (Local / Render Native):**
  ```bash
  pip install -r backend/requirements.txt
  ```
- **Startup Command (Render Native / Procfile):**
  ```bash
  cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
  ```
- **Docker Container Build & Run:**
  ```bash
  docker build -f backend/Dockerfile -t drainx-backend backend/
  docker run -p 8000:8000 -e PORT=8000 drainx-backend
  ```

### Frontend:
- **Build Command (Vercel / Local Production):**
  ```bash
  npm run build
  # Executes: tsc && vite build
  ```
- **Output Directory:**
  ```
  dist/
  ```

---

## 4. Environment Variables Specification

No secrets are embedded, committed, or exposed. Below is the definitive catalog of variables and their target configuration panels.

### Backend Environment Variables (Configure in Render Dashboard):
| Variable Name | Required | Default / Staging Value | Purpose |
| :--- | :---: | :--- | :--- |
| `ENVIRONMENT` | Yes | `development` (staging) / `production` | Dictates strictness of fail-closed security assertions. |
| `DEBUG` | Yes | `false` | Disables debug stack traces in staging. |
| `SYSTEM_MODE` | Yes | `SIMULATION` (or `PHYSICAL` / `SAFE_HOLD`) | Initial operational posture of state store. |
| `PORT` | Auto | Assigned by Render (e.g. `10000`) | Bound port for ASGI server. |
| `HOST` | Yes | `0.0.0.0` | Container network binding. |
| `SUPABASE_URL` | Optional | `https://<project-ref>.supabase.co` | Supabase Cloud PostgREST and Auth endpoint. |
| `SUPABASE_KEY` | Optional | `eyJ...` (anon public key) | PostgREST client key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | `eyJ...` (service_role secret) | Backend privileged key for high-throughput persistence. |
| `SUPABASE_AUTH_ENABLED` | Yes | `false` (or `true` if enforcing JWT) | Enables Bearer token verification on operational routes. |
| `SUPABASE_JWT_SECRET` | Optional | `[REDACTED_SECRET]` | Validates signature of user tokens. |
| `DEVICE_INGEST_API_KEY` | Optional | `[REDACTED_INGEST_SECRET]` | Secret key for hardware ingest (`X-API-Key`). |
| `ADDITIONAL_CORS_ORIGINS` | Yes | `https://drainx-dashboard.vercel.app` | Comma-separated list of allowed frontend origins. |

### Frontend Environment Variables (Configure in Vercel Dashboard):
| Variable Name | Required | Example Staging Value | Purpose |
| :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | No | `https://drainx-backend.onrender.com` | Base URL of deployed FastAPI backend. |
| `VITE_WS_BASE_URL` | No | `wss://drainx-backend.onrender.com` | WebSocket base URL for real-time telemetry stream. |

> [!IMPORTANT]
> Never configure `SUPABASE_SERVICE_ROLE_KEY` in Vercel. Frontend builds must only ever receive public/anon keys if client-side database queries are enabled.

---

## 5. Health vs. Readiness Probes

To ensure robust cloud orchestration without false restarts, DRAIN-X distinguishes process liveness from downstream dependency health:

1. **Liveness Probe (`GET /api/v1/health/liveness`):**
   - **Purpose:** Verifies that the Uvicorn ASGI event loop is active and accepting HTTP connections.
   - **Status Code:** HTTP `200 OK`.
   - **Usage:** Configured as Render `healthCheckPath` (`/api/v1/health/liveness`). Does not fail if Supabase has transient network blips, preventing unnecessary container restarts.

2. **Readiness Probe (`GET /api/v1/health/ready`):**
   - **Purpose:** Verifies whether downstream persistence (Supabase Cloud PostgREST) is connected and reachable.
   - **Status Code:** HTTP `200 OK` when healthy or running in configured in-memory mode; HTTP `503 Service Unavailable` if Supabase credentials are configured but the endpoint is unreachable.

3. **Status Probe (`GET /api/v1/health`):**
   - **Purpose:** Returns comprehensive system metadata (uptime, system mode, operational state, version).

---

## 6. Verification & Test Execution Results

All automated test suites and production build scripts were executed locally in the clean workspace:

| Scope | Command Executed | Result | Details |
| :--- | :--- | :---: | :--- |
| **Backend Tests** | `python -m pytest backend/tests -q` | **116 passed** | Execution time: 4.86s (100% pass rate). |
| **Frontend Tests** | `npm test -- --run` | **54 passed** | Execution time: 19.23s (9 test files, 100% pass rate). |
| **Frontend Production Build** | `npm run build` (`tsc && vite build`) | **SUCCESS** | 0 TypeScript errors, bundle size: 494.55 kB (gzip: 135.5 kB). |

---

## 7. Actual vs. Simulated Validation

| Validation Category | Status | Details |
| :--- | :---: | :--- |
| **Configuration Files & Formats** | **ACTUAL** | Dockerfile, render.yaml, vercel.json, and TypeScript declarations verified on disk. |
| **Local Build Compatibility** | **ACTUAL** | TypeScript compilation and Vite minification executed cleanly. |
| **Test Suite Compatibility** | **ACTUAL** | All 116 backend tests and 54 frontend tests pass without regression. |
| **Live Remote Hosting** | **NOT EXECUTED** | No live deployments were triggered; staging accounts remain pending user provisioning. |

---

## 8. Remaining Deployment Blockers & Next Actions

1. **Operator Deployment Action Required:**
   - Link `https://github.com/DivyakantSarraf/Drain-X` to Render and deploy via Blueprint (`render.yaml`).
   - Import the repository in Vercel with root directory set to `frontend`.
   - Add the resulting Vercel domain to `ADDITIONAL_CORS_ORIGINS` in Render.
2. **Milestone P0.8 Prerequisite:**
   - Physical ESP32 hardware testing remains strictly scheduled for **Milestone P0.8** and was not initiated.
