-- 001_extensions_and_types.sql
-- Enable required Postgres extensions and define reusable ENUM types.
-- CRCC dedicated Neon project — database-per-tenant (Section 5.2).
-- UUIDv7 PKs generated in application code, not via Postgres default (Section 8, resolved).

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid() fallback
CREATE EXTENSION IF NOT EXISTS "vector";       -- pgvector for tenant-scoped embeddings (Section 8, resolved)

-- ENUM types used across multiple tables

CREATE TYPE party_type AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

CREATE TYPE channel AS ENUM (
  'EMAIL', 'PHONE', 'IN_PERSON', 'PORTAL',
  'SYSTEM_GENERATED', 'EXTERNAL'
);

CREATE TYPE direction AS ENUM (
  'INBOUND', 'OUTBOUND', 'BIDIRECTIONAL', 'INTERNAL'
);

CREATE TYPE signal_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE signal_status AS ENUM ('ACTIVE', 'ACTED_UPON', 'EXPIRED', 'DISMISSED');

CREATE TYPE decision_status AS ENUM (
  'PROPOSED', 'RATIFIED', 'ENACTED', 'REVERSED', 'EXPIRED'
);

CREATE TYPE artifact_status AS ENUM (
  'DRAFTED', 'REVIEWED', 'APPROVED', 'DISPATCHED', 'DISCARDED'
);

CREATE TYPE task_status AS ENUM (
  'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
);

CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

CREATE TYPE tenant_status AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED', 'PENDING_DELETION');

CREATE TYPE audit_actor_type AS ENUM ('USER', 'AGENT', 'SYSTEM');
