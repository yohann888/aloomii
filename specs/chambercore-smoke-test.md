# ChamberCore — Smoke Test

## Goal
Verify the first hosted/local server pass is good enough to demo without obvious breakage.

## Public routes
- [x] `/chamber-demo` loads
- [x] `/chamber-demo/directory` loads
- [x] `/chamber-demo/directory/:slug` loads for a real org
- [x] `/chamber-demo/events` loads
- [x] `/chamber-demo/events/:slug` loads for a real event
- [x] `/chamber-demo/join` loads
- [x] join form submit creates a pending organization

## Admin routes
- [x] `/chamber-demo/admin` shows admin login gate when signed out
- [x] admin access code unlocks admin surface
- [x] pending org approval action works
- [x] pending Hot Deal approve/archive action works
- [x] admin logout works

## Member routes
- [x] `/chamber-demo/member-login` loads
- [x] seeded member email can request demo magic link
- [x] magic link consume route logs member in
- [x] `/chamber-demo/member-dashboard` loads after login
- [x] member logout works

## Tenant sanity
- [x] primary tenant (`caledonia-demo`) loads correct chamber branding/data
- [x] alternate tenant verification script still returns distinct snapshots

## Deployment basics
- [x] server starts via `scripts/chamber-demo-server.js`
- [x] env vars are present
- [x] static CSS is served

## Notes from this smoke pass
- Fixed missing `last_magic_link_sent_at` with follow-up migration: `infra/db/migrations/033_chambercore_magic_links_fix.sql`
- Core public/admin/member flow is now materially working in local smoke checks
- Org detail, event detail, CSS serving, and pending-org approval are confirmed
- Server stability improved: `uncaughtException`, `unhandledRejection`, `SIGTERM`, `SIGINT`, `server.on('error')`, `server.on('close')` handlers added to `chamber-demo-local.js`
- All flows verified: org detail, event detail, CSS, pending-org approval, Hot Deal moderation, admin logout, member logout — full smoke pass green
- Bug fixed in `moderateContent`: was passing `resolvedTenantId` to `tenantQuery` which prepends its own; corrected to pass only `[id, nextStatus]`
- `.env` created from `.env.chamber-demo.example` — all vars have fallbacks so app runs without it, but .env is now present for production deploy
