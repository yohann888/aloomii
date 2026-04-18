# ChamberCore — Deployment Shape (Phase 1)

## Goal
Define the shortest credible path from the current local ChamberCore demo to a deployable version at:
- `aloomii.com/chamber-demo`

This is not full production hardening.
This is the deployment shape needed to move from local-only demo infrastructure to a hosted chamber demo path.

---

## 1. Current state

Already working locally:
- `chamber.*` schema in PostgreSQL
- base migration + seed scripts
- tenant-aware helper path
- public routes
- admin routes + actions
- member magic-link scaffolding
- local Node server serving chamber-demo pages and JSON endpoints

Current local server:
- `scripts/chamber-demo-local.js`

---

## 2. Phase 1 deployment objective

Deploy a chamber demo that supports:
- public chamber-demo pages
- admin demo route
- member login/request-link path
- seeded tenant-backed data

without requiring a full platform rewrite first.

---

## 3. Recommended deployment posture

### Keep for now
- existing PostgreSQL database
- `chamber.*` schema
- current demo HTML + local Node route style

### Minimal deployment shape
Use a dedicated Node process for ChamberCore demo serving.

Recommended first deploy posture:
- run `scripts/chamber-demo-local.js` (or renamed production-safe equivalent) under a stable process manager
- reverse proxy requests from `aloomii.com/chamber-demo` into that process
- keep the chamber demo isolated from the rest of the app surface by path routing, not by mixing it into unrelated handlers yet

This preserves momentum and avoids a rewrite during the first hosted step.

---

## 4. Needed deployment artifacts

### 4.1 Production-safe entry point
Create a clearer deployment entry point than `chamber-demo-local.js`.

Implemented:
- `scripts/chamber-demo-server.js`

This file currently:
- wraps the current local-server logic
- gives deployment/process docs a production-safe name
- avoids “local” naming in the deploy path

Follow-up:
- gradually move more deploy-specific boot concerns into this wrapper as the hosted path matures

### 4.2 Environment contract
Document and require:
- `DATABASE_URL`
- `CHAMBER_TENANT_ID`
- `CHAMBER_BASE_PATH=/chamber-demo`
- `CHAMBER_EMAIL_PROVIDER`
- `CHAMBER_FROM_EMAIL`
- `CHAMBER_ADMIN_ACCESS_CODE`
- `CHAMBER_R2_BUCKET`
- `CHAMBER_R2_PUBLIC_BASE_URL`
- any R2 credentials needed

Implemented reference file:
- `.env.chamber-demo.example`

### 4.3 Process management
Run the chamber demo process under a stable supervisor.
Examples:
- systemd
- pm2
- existing service runner if already used in repo

### 4.4 Proxy/routing
Route:
- `/chamber-demo`
- `/api/chamber-demo/*`
- `/demo/chamber-ui.css`

to the chamber demo Node process.

---

## 5. Pre-deploy checklist

### Data
- run migration on target DB
- run primary tenant seed
- confirm target tenant exists
- optionally skip alternate tenant seed in first hosted pass unless needed

### Security baseline
- change default admin access code from demo default
- confirm admin routes are gated
- confirm cookies are working in hosted environment
- confirm tenant-aware helper path remains in use

### Asset/storage
- provision R2 bucket
- confirm fallback behavior if bucket is empty
- confirm static CSS/page serving works behind proxy

### Email
- decide whether hosted phase uses:
  - real Resend send
  - stub/demo send path
- do not deploy a broken magic-link UX pretending to send real email if it does not

---

## 6. Risks in current shape

### 6.1 The server name is still local-oriented
`chamber-demo-local.js` is fine for development but weak for deploy clarity.

### 6.2 HTML pages are still static-file style
This is acceptable for first hosted demo deployment, but not the long-term product posture.

### 6.3 Auth is still lightweight
Good for demo, but it needs careful env handling and no default shared codes in hosted use.

### 6.4 No test harness yet
A minimal smoke test should exist before deployment:
- home loads
- directory loads
- events load
- join POST works
- admin auth works
- member request-link path works

Implemented checklist:
- `specs/chambercore-smoke-test.md`

---

## 7. Recommended immediate deployment steps

1. create `scripts/chamber-demo-server.js`
2. extract any local-only naming assumptions
3. create `.env` example / deployment env contract
4. add minimal deploy run instructions
5. add smoke-test checklist
6. run hosted trial behind path routing

---

## 8. What not to do yet
- do not rewrite the demo into a totally different framework structure before first hosted pass
- do not expand product scope during deployment work
- do not mix unrelated Aloomii app logic into the chamber demo process prematurely
- do not pretend email is real if the hosted send path is still stubbed

---

## 9. Success definition

Deployment-shape work is successful when:
- ChamberCore can be run as a named server process
- path routing to `/chamber-demo` is clear
- env contract is documented
- smoke-test steps are documented
- the first hosted pass can happen without architectural churn
