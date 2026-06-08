-- 002_tenant_and_party.sql
-- Tenant root table and Party entity (Section 3.1, 3.7).
-- CRCC is a dedicated Neon project; the tenant table still exists for structural
-- consistency with the canonical model and to support future multi-schema scenarios.

CREATE TABLE tenant (
  id            UUID PRIMARY KEY,
  name          TEXT NOT NULL,
  short_name    TEXT NOT NULL UNIQUE,
  vertical      TEXT NOT NULL,              -- CHAMBER, REAL_ESTATE, ASSOCIATION, etc.
  status        tenant_status NOT NULL DEFAULT 'ACTIVE',
  schema_name   TEXT NOT NULL,              -- Postgres schema name for this tenant
  onboarded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB                       -- Tenant-specific configuration
);

-- Party: the canonical legal entity (Section 3.1).
-- Largely immortal. A person or company does not cease to exist when they leave.
-- CRCC vertical metadata examples (in Party.metadata JSONB):
--   {"business_type": "Restaurant", "employee_count": 12, "year_founded": 2005,
--    "industry_naics": "722511", "website": "https://example.com",
--    "phone": "555-0100", "address": {"street": "...", "city": "Caledonia", ...}}

CREATE TABLE party (
  id                    UUID PRIMARY KEY,        -- UUIDv7, generated in app code
  tenant_id             UUID NOT NULL REFERENCES tenant(id),
  party_type            party_type NOT NULL,      -- INDIVIDUAL or ORGANIZATION
  canonical_name        TEXT NOT NULL,             -- Display name
  canonical_email       TEXT,                      -- Primary email (individuals); null for orgs unless contact-less
  external_identifiers  JSONB,                     -- Vertical-specific IDs: {"crm_id": "abc", "mls_id": "12345"}
  metadata              JSONB,                     -- Vertical-specific surface fields

  -- Universal metadata header (Section 4.1)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,                       -- 'user:<uuid>' | 'agent:<id>:<run_id>' | 'system:<process>'
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,                       -- MANUAL, IMPORT, AGENT, API, MIGRATION
  confidence  DECIMAL(3,2),                        -- Nullable on Party
  version     INTEGER NOT NULL DEFAULT 1
);

-- Party_Relationship: time-bound, typed relationships between Parties (Section 3.1).
-- An individual works at an organization, a contact person represents a member org, etc.

CREATE TABLE party_relationship (
  id                UUID PRIMARY KEY,
  tenant_id         UUID NOT NULL REFERENCES tenant(id),
  from_party_id     UUID NOT NULL REFERENCES party(id),
  to_party_id       UUID NOT NULL REFERENCES party(id),
  relationship_type TEXT NOT NULL,             -- EMPLOYS, OWNS, REPRESENTS, CONTACT_FOR, AFFILIATED_WITH
  started_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ,              -- Null for active relationships
  metadata          JSONB,                    -- Role title, ownership %, etc.

  -- Universal metadata header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,
  confidence  DECIMAL(3,2),
  version     INTEGER NOT NULL DEFAULT 1
);
