-- ChamberCore Sprint 1 foundation
-- Creates isolated chamber schema + base tables for chamber-demo foundation work.

CREATE SCHEMA IF NOT EXISTS chamber;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chamber_user_role') THEN
    CREATE TYPE chamber.chamber_user_role AS ENUM ('super_admin', 'member_admin', 'member_rep');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chamber_org_status') THEN
    CREATE TYPE chamber.chamber_org_status AS ENUM ('active', 'pending', 'lapsed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chamber_content_type') THEN
    CREATE TYPE chamber.chamber_content_type AS ENUM ('hot_deal');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chamber_content_status') THEN
    CREATE TYPE chamber.chamber_content_status AS ENUM ('draft', 'pending_review', 'published', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chamber_event_status') THEN
    CREATE TYPE chamber.chamber_event_status AS ENUM ('draft', 'published', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chamber_registration_status') THEN
    CREATE TYPE chamber.chamber_registration_status AS ENUM ('registered', 'checked_in', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chamber_benefit_type') THEN
    CREATE TYPE chamber.chamber_benefit_type AS ENUM ('free_event_tickets', 'hot_deal_posts', 'directory_logo', 'featured_directory_placement');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chamber_ledger_reference_type') THEN
    CREATE TYPE chamber.chamber_ledger_reference_type AS ENUM ('registration', 'content_item', 'manual_adjustment');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS chamber.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  chamber_name TEXT NOT NULL,
  tagline TEXT,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_address TEXT,
  hero_copy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS chamber.tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'annual',
  benefits JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS chamber.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  tier_id UUID REFERENCES chamber.tiers(id) ON DELETE SET NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  status chamber.chamber_org_status NOT NULL DEFAULT 'pending',
  description TEXT,
  logo_url TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  renewal_date DATE,
  payment_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS chamber.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  org_id UUID REFERENCES chamber.organizations(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  role chamber.chamber_user_role NOT NULL,
  first_name TEXT,
  last_name TEXT,
  magic_link_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_magic_link_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS chamber.magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES chamber.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'member_login',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, token)
);

CREATE TABLE IF NOT EXISTS chamber.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  org_id UUID REFERENCES chamber.organizations(id) ON DELETE CASCADE,
  type chamber.chamber_content_type NOT NULL,
  status chamber.chamber_content_status NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  body TEXT,
  terms TEXT,
  url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chamber.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  image_url TEXT,
  status chamber.chamber_event_status NOT NULL DEFAULT 'published',
  member_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS chamber.ticket_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  event_id UUID NOT NULL REFERENCES chamber.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER,
  benefit_type chamber.chamber_benefit_type,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chamber.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  event_id UUID NOT NULL REFERENCES chamber.events(id) ON DELETE CASCADE,
  ticket_type_id UUID REFERENCES chamber.ticket_types(id) ON DELETE SET NULL,
  user_id UUID REFERENCES chamber.users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES chamber.organizations(id) ON DELETE SET NULL,
  status chamber.chamber_registration_status NOT NULL DEFAULT 'registered',
  qr_code TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chamber.benefit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES chamber.organizations(id) ON DELETE CASCADE,
  benefit_type chamber.chamber_benefit_type NOT NULL,
  delta INTEGER NOT NULL,
  reference_type chamber.chamber_ledger_reference_type NOT NULL,
  reference_id UUID NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chamber.page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  org_id UUID REFERENCES chamber.organizations(id) ON DELETE SET NULL,
  content_item_id UUID REFERENCES chamber.content_items(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewer_type TEXT NOT NULL DEFAULT 'public'
);

CREATE INDEX IF NOT EXISTS chamber_orgs_tenant_status_idx ON chamber.organizations (tenant_id, status);
CREATE INDEX IF NOT EXISTS chamber_orgs_tenant_slug_idx ON chamber.organizations (tenant_id, slug);
CREATE INDEX IF NOT EXISTS chamber_users_tenant_role_idx ON chamber.users (tenant_id, role);
CREATE INDEX IF NOT EXISTS chamber_content_tenant_status_idx ON chamber.content_items (tenant_id, status);
CREATE INDEX IF NOT EXISTS chamber_events_tenant_starts_idx ON chamber.events (tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS chamber_regs_tenant_event_idx ON chamber.registrations (tenant_id, event_id);
CREATE INDEX IF NOT EXISTS chamber_ledger_tenant_org_idx ON chamber.benefit_ledger (tenant_id, org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chamber_page_views_tenant_path_idx ON chamber.page_views (tenant_id, path, viewed_at DESC);
