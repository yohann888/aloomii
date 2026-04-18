#!/usr/bin/env node
'use strict';

process.env.CHAMBER_TENANT_ID = process.env.CHAMBER_TENANT_ID || 'hamilton-demo';

const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const TENANT_ID = process.env.CHAMBER_TENANT_ID;
const NOW = new Date();

function plusDays(days) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO chamber.settings (tenant_id, chamber_name, tagline, logo_url, primary_color, secondary_color, contact_email, contact_phone, contact_address, hero_copy)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id) DO UPDATE SET
         chamber_name = EXCLUDED.chamber_name,
         tagline = EXCLUDED.tagline,
         primary_color = EXCLUDED.primary_color,
         secondary_color = EXCLUDED.secondary_color,
         contact_email = EXCLUDED.contact_email,
         contact_phone = EXCLUDED.contact_phone,
         contact_address = EXCLUDED.contact_address,
         hero_copy = EXCLUDED.hero_copy,
         updated_at = NOW()`,
      [
        TENANT_ID,
        'Hamilton Chamber of Commerce Demo',
        'A chamber demo tenant used to verify isolation and tenant-aware routing patterns.',
        '',
        '#3A1C5A',
        '#F29E4C',
        'hello@hamiltonchamberdemo.ca',
        '905-555-0211',
        '200 King Street West, Hamilton, Ontario',
        'A second chamber tenant used to prove ChamberCore data separation is real.',
      ]
    );

    const tiers = [
      ['starter', 'Starter', 19900, 'annual', 1, { free_event_tickets: 1, hot_deal_posts: 1, directory_logo: true, featured_directory_placement: false }],
      ['growth', 'Growth', 49900, 'annual', 2, { free_event_tickets: 2, hot_deal_posts: 2, directory_logo: true, featured_directory_placement: true }],
      ['partner', 'Partner', 89900, 'annual', 3, { free_event_tickets: 5, hot_deal_posts: 5, directory_logo: true, featured_directory_placement: true }],
    ];

    const tierIds = new Map();
    for (const [slug, name, price, cycle, sortOrder, benefits] of tiers) {
      const result = await client.query(
        `INSERT INTO chamber.tiers (tenant_id, slug, name, price_cents, billing_cycle, benefits, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         ON CONFLICT (tenant_id, slug) DO UPDATE SET
           name = EXCLUDED.name,
           price_cents = EXCLUDED.price_cents,
           billing_cycle = EXCLUDED.billing_cycle,
           benefits = EXCLUDED.benefits,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()
         RETURNING id`,
        [TENANT_ID, slug, name, price, cycle, JSON.stringify(benefits), sortOrder]
      );
      tierIds.set(slug, result.rows[0].id);
    }

    const orgs = [
      ['Steel City CPAs', 'steel-city-cpas', 'Professional Services', 'Hamilton'],
      ['Locke Street Fitness', 'locke-street-fitness', 'Fitness', 'Hamilton'],
      ['Bayfront Brewing', 'bayfront-brewing', 'Food & Beverage', 'Hamilton'],
      ['West Harbour Realty', 'west-harbour-realty', 'Real Estate', 'Hamilton'],
      ['King West Dental', 'king-west-dental', 'Healthcare', 'Hamilton'],
      ['Red Hill Digital', 'red-hill-digital', 'Technology', 'Hamilton'],
      ['James North Florals', 'james-north-florals', 'Retail', 'Hamilton'],
      ['McMaster Physio Group', 'mcmaster-physio', 'Healthcare', 'Hamilton'],
    ];

    const orgIds = [];
    for (let i = 0; i < orgs.length; i++) {
      const [name, slug, category, city] = orgs[i];
      const tierSlug = i % 3 === 0 ? 'partner' : (i % 2 === 0 ? 'growth' : 'starter');
      const result = await client.query(
        `INSERT INTO chamber.organizations (tenant_id, tier_id, slug, name, status, description, website, phone, email, city, province, categories, featured, renewal_date, payment_status)
         VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,'Ontario',$10,$11,$12,$13)
         ON CONFLICT (tenant_id, slug) DO UPDATE SET
           tier_id = EXCLUDED.tier_id,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           website = EXCLUDED.website,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           city = EXCLUDED.city,
           categories = EXCLUDED.categories,
           featured = EXCLUDED.featured,
           renewal_date = EXCLUDED.renewal_date,
           payment_status = EXCLUDED.payment_status,
           updated_at = NOW()
         RETURNING id`,
        [
          TENANT_ID,
          tierIds.get(tierSlug),
          slug,
          name,
          `${name} is part of the alternate tenant seed for tenant-isolation validation.`,
          `https://${slug}.ca`,
          `905-777-${String(1000 + i).slice(-4)}`,
          `hello@${slug}.ca`,
          city,
          [category],
          tierSlug !== 'starter',
          plusDays(45 + i),
          'paid',
        ]
      );
      orgIds.push({ id: result.rows[0].id, slug, name });
    }

    for (const org of orgIds) {
      await client.query(
        `INSERT INTO chamber.users (tenant_id, org_id, email, role, first_name, last_name)
         VALUES ($1,$2,$3,'member_rep',$4,$5)
         ON CONFLICT (tenant_id, email) DO UPDATE SET org_id = EXCLUDED.org_id, updated_at = NOW()`,
        [TENANT_ID, org.id, `owner+${org.slug}@hamiltonchamberdemo.ca`, 'Demo', org.name.split(' ')[0]]
      );
    }

    await client.query(
      `INSERT INTO chamber.users (tenant_id, org_id, email, role, first_name, last_name)
       VALUES ($1,NULL,$2,'super_admin','Hamilton','Admin')
       ON CONFLICT (tenant_id, email) DO UPDATE SET updated_at = NOW()`,
      [TENANT_ID, 'admin@hamiltonchamberdemo.ca']
    );

    const events = [
      ['harbour-networking-night', 'Harbour Networking Night', 'An alternate-tenant event for Hamilton businesses.', 'Pier 8', 12],
      ['manufacturing-growth-forum', 'Manufacturing Growth Forum', 'A Hamilton-focused growth and supply chain session.', 'Bayfront Centre', 20],
    ];

    for (const [slug, title, description, location, days] of events) {
      await client.query(
        `INSERT INTO chamber.events (tenant_id, slug, title, description, location, starts_at, ends_at, status, member_only)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'published',true)
         ON CONFLICT (tenant_id, slug) DO UPDATE SET updated_at = NOW()`,
        [TENANT_ID, slug, title, description, location, plusDays(days), plusDays(days)]
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded alternate ChamberCore tenant: ${TENANT_ID}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
