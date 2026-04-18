#!/usr/bin/env node
'use strict';

const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const TENANT_ID = process.env.CHAMBER_TENANT_ID || 'caledonia-demo';
const NOW = new Date();
const directoryDetails = require('../config/chambercore-directory-details.json');

const tierDefs = [
  {
    slug: 'bronze',
    name: 'Bronze',
    price_cents: 29900,
    billing_cycle: 'annual',
    sort_order: 1,
    benefits: {
      free_event_tickets: 1,
      hot_deal_posts: 1,
      directory_logo: true,
      featured_directory_placement: false,
    },
  },
  {
    slug: 'silver',
    name: 'Silver',
    price_cents: 59900,
    billing_cycle: 'annual',
    sort_order: 2,
    benefits: {
      free_event_tickets: 3,
      hot_deal_posts: 3,
      directory_logo: true,
      featured_directory_placement: true,
    },
  },
  {
    slug: 'founding',
    name: 'Founding Partner',
    price_cents: 99900,
    billing_cycle: 'annual',
    sort_order: 3,
    benefits: {
      free_event_tickets: 6,
      hot_deal_posts: 6,
      directory_logo: true,
      featured_directory_placement: true,
    },
  },
];

const directorySections = {
  'Community Organizations': [
    'Caledonia & District Food Bank',
    'Caledonia Community Foundation',
    'Caledonia Firefighters Stn. 1',
    'Caledonia Gymmies',
    'Caledonia Legion',
    'Caledonia Lions',
    'Caledonia Ministerial Association',
    'Caledonia Regional Chamber of Commerce',
    'Caledonia Studio of Dance',
    'Child & Family Services of Grand Erie (Foundation)',
    'Edinburgh Square Heritage & Cultural Centre',
    'Grand Erie Business Centre Inc.',
    'Haldimand Horticultural Society',
    'Inclusions Developmental Services Haldimand',
    'Knights of Columbus',
    'SOAR Community Services',
    'Societe Alzheimer Society',
  ],
  Construction: [
    'CMI',
    'Northern Foam Tech',
    'On the 6 Designs',
    'Schilthuis Construction Inc.',
    'Schouten Sod Supply Ltd.',
    'Smyths Custom Exteriors',
    'Strategy Construction',
    'Zen Construction Inc.',
  ],
  'Financial Services': [
    'BMO Bank of Montreal',
    'Cayuga Mutual Insurance',
    'Desjardins Insurance',
    'EverRose Solutions Ltd',
    'Faith Financial Coaching',
    'FENA Insurance',
    'Grand River Wealth Management',
    'Haldimand Insurance Brokers',
    'Julie A. Henning, CPA',
    'Libro Credit Union',
    'MACS Accounting & Taxation',
    'Moore Financial Inc.',
    'Scotiabank',
    'Steve Hayward Mortgages',
    'The Evers Financial Group Inc.',
    'Vineet Nair CPA Professional Corporation',
  ],
  'Food & Water Services': [
    'Cafecito House',
    'JCA Food Services',
    'Mr. Boba',
    'Neptune Water Services Ltd.',
    'Tastebudz Pizza Ltd',
    "Tony's Corner Xpress",
    'Wally Parr Sausage',
  ],
  'Health Care': [
    'Caledonia Orthodontics',
    'Dr. Lorelei F. Zeiler, Optometrist',
    'Haldimand Physiotherapy',
    'Liminality End-Of-Life Doula Services',
    'The Elder Care Company Ltd.',
  ],
  'Legal Services': [
    'Arrell Law LLP',
    'Ballachey Moore Lawyers',
    'Benedict Ferguson & Marshall Law',
  ],
  'Media & Entertainment': [
    '92.9 The Grand - CHTG-FM',
    'Aloomii Inc',
    'Artline Graphics',
    'Haldimand County Pulse',
    'JMDV',
    'Sound Productions',
    'Summit Aerial Drone Services',
  ],
  'Personal Services': [
    'Caledonia Chiropractic',
    'Drip Hot Yoga',
    'Jen Bubleit Coaching',
    "Maria's Mop & Bucket Cleaning Service",
    "Mr. J's Taxi",
    'Oxford Learning Caledonia',
    "Patrick's Haircare",
    'Young Reflections',
    'Your Mortgage Minute',
  ],
  'Real Estate': [
    'Michael Estey Real Estate - Ridgeview Realty Group',
    'Nancy DiCosimo - RE/Max Escarpment Realty Inc',
    'Nick & Traci Realty',
  ],
  'Retail & Services': [
    '4 Wheels Enterprises',
    'ACS Valves (Ancaster Conveying Systems)',
    'Air Bounce Inflatables & Party Rentals',
    'AMT-ITS Corp',
    'Atlantis Pools Construction',
    "Biker's Haven",
    'Caledonia Auto Supply Inc.',
    'Cedar Prints',
    'Dixon Cycle',
    'Elevated Maintenance Inc.',
    'Garrcorp Inc.',
    'Grand River Home Hardware',
    "Hoppe's Pool & Spa Ltd.",
    'Hunsingers',
    'Lipsit Trucking Ltd.',
    'Murt Timson Auto',
    'Oranje Son Brewing',
    'Politically Incorrect Pets!',
    "Pressman's Print & Copy Centre",
    'Revival Coffee Shop',
    'Rustic & Reclaimed',
    "Shaver's Flowers",
    'TeamGear Canada',
    'Transport Sales and Service',
    'Winegard Motors Inc.',
  ],
  'Tourism & Sports': [
    'Broecheler Inn',
    'Caledonia BIA',
    'Forge FC',
    'Grand River Dinner Cruise',
    'Hamilton Tiger-Cats',
    'Near North Aviation',
    'Roosts and Roots Flower Farm',
    'Ruthven Park',
  ],
};

const events = [
  {
    slug: 'haldimand-business-symposium',
    title: 'Haldimand Business Symposium',
    description: 'Join fellow entrepreneurs for appetizers, local beverages, and an AI-focused talk with Avery Swartz, CEO of Camp Tech.',
    location: 'Haldimand County Administration Building, 53 Thorburn St S, Cayuga',
    startsAt: '2026-04-16T17:00:00-04:00',
    endsAt: '2026-04-16T20:00:00-04:00',
    memberOnly: false,
  },
  {
    slug: 'caledonia-chili-cook-off',
    title: '10th Annual Caledonia Chili Cook-Off',
    description: 'Hosted by the Knights of Columbus, this community fundraiser supports local families with young children facing life-altering conditions and other charitable initiatives.',
    location: 'Riverside Exhibition Centre',
    startsAt: '2026-04-18T16:00:00-04:00',
    endsAt: '2026-04-18T20:00:00-04:00',
    memberOnly: false,
  },
  {
    slug: 'chamber-members-speed-networking-event',
    title: 'Chamber Members Speed Networking Event',
    description: 'Hosted at Cafecito House with coffee, snacks, and fast-paced introductions designed to help chamber members build meaningful local connections.',
    location: 'Cafecito House, 271 Argyle St S, Caledonia',
    startsAt: '2026-03-05T17:00:00-05:00',
    endsAt: '2026-03-05T19:00:00-05:00',
    memberOnly: true,
  },
  {
    slug: 'small-business-breakfast',
    title: 'Small Business Breakfast Roundtable',
    description: 'A practical morning roundtable for owners and operators to swap ideas, referrals, and local growth tactics.',
    location: 'Caledonia Legion',
    startsAt: '2026-05-07T08:00:00-04:00',
    endsAt: '2026-05-07T09:30:00-04:00',
    memberOnly: false,
  },
  {
    slug: 'summer-waterfront-mixer',
    title: 'Summer Waterfront Mixer',
    description: 'An evening social for members, partners, and local leaders to connect before the summer season ramps up.',
    location: 'Grand River Dinner Cruise Dock',
    startsAt: '2026-06-11T17:30:00-04:00',
    endsAt: '2026-06-11T20:00:00-04:00',
    memberOnly: false,
  },
  {
    slug: 'fall-membership-open-house',
    title: 'Fall Membership Open House',
    description: 'Bring a prospective member and join the chamber team for a guided intro to upcoming programming, partnerships, and benefits.',
    location: 'Caledonia Regional Chamber of Commerce',
    startsAt: '2026-09-17T18:00:00-04:00',
    endsAt: '2026-09-17T20:00:00-04:00',
    memberOnly: true,
  },
];

const posts = [
  {
    slug: 'directory-refresh',
    title: 'Caledonia Chamber Directory Refresh',
    teaser: 'Organization listings now reflect the extracted chamber directory members.',
    status: 'published',
    orgSlug: 'caledonia-regional-chamber-of-commerce',
  },
  {
    slug: 'speed-networking-preview',
    title: 'Chamber Members Speed Networking Event',
    teaser: 'Upcoming chamber event seeded from the website extraction. Final event details are still pending confirmation.',
    status: 'published',
    orgSlug: 'caledonia-regional-chamber-of-commerce',
  },
  {
    slug: 'member-offer-review',
    title: 'Member promotion submission under review',
    teaser: 'Pending moderation example for the admin content workflow.',
    status: 'pending_review',
    orgSlug: 'aloomii-inc',
  },
];

function plusDays(days) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildOrganizations() {
  const seen = new Map();
  const rows = [];

  for (const [category, names] of Object.entries(directorySections)) {
    for (const name of names) {
      const baseSlug = slugify(name);
      const count = (seen.get(baseSlug) || 0) + 1;
      seen.set(baseSlug, count);
      const slug = count === 1 ? baseSlug : `${baseSlug}-${count}`;
      const isFeatured = name === 'Caledonia Regional Chamber of Commerce' || name === 'Aloomii Inc';
      const tierSlug = name === 'Caledonia Regional Chamber of Commerce' ? 'founding' : (isFeatured ? 'silver' : 'bronze');

      rows.push({
        name,
        slug,
        category,
        tierSlug,
        featured: isFeatured,
        description: `${name} is listed in the ${category} section of the Caledonia Regional Chamber of Commerce directory.`,
        city: 'Caledonia Region',
        province: 'Ontario',
        ...(directoryDetails[name] || {}),
      });
    }
  }

  return rows;
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const organizations = buildOrganizations();

  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM chamber.benefit_ledger WHERE tenant_id = $1`, [TENANT_ID]);
    await client.query(`DELETE FROM chamber.registrations WHERE tenant_id = $1`, [TENANT_ID]);
    await client.query(`DELETE FROM chamber.ticket_types WHERE tenant_id = $1`, [TENANT_ID]);
    await client.query(`DELETE FROM chamber.magic_links WHERE tenant_id = $1`, [TENANT_ID]);
    await client.query(`DELETE FROM chamber.content_items WHERE tenant_id = $1`, [TENANT_ID]);
    await client.query(`DELETE FROM chamber.events WHERE tenant_id = $1`, [TENANT_ID]);
    await client.query(`DELETE FROM chamber.users WHERE tenant_id = $1`, [TENANT_ID]);
    await client.query(`DELETE FROM chamber.organizations WHERE tenant_id = $1`, [TENANT_ID]);

    await client.query(
      `INSERT INTO chamber.settings (tenant_id, chamber_name, tagline, logo_url, primary_color, secondary_color, contact_email, contact_phone, contact_address, hero_copy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (tenant_id) DO UPDATE SET
         chamber_name = EXCLUDED.chamber_name,
         tagline = EXCLUDED.tagline,
         logo_url = EXCLUDED.logo_url,
         primary_color = EXCLUDED.primary_color,
         secondary_color = EXCLUDED.secondary_color,
         contact_email = EXCLUDED.contact_email,
         contact_phone = EXCLUDED.contact_phone,
         contact_address = EXCLUDED.contact_address,
         hero_copy = EXCLUDED.hero_copy,
         updated_at = NOW()`,
      [
        TENANT_ID,
        'Caledonia Regional Chamber of Commerce',
        'Connecting local members, regional organizations, and upcoming chamber events.',
        '/demo/assets/caledonia-chamber-logo-new.svg',
        '#1B2A4A',
        '#D4A843',
        'hello@caledoniachamberdemo.ca',
        '(905) 765-0330',
        'Caledonia, Ontario',
        'A chamber directory and member experience built for member visibility, event participation, and local growth.',
      ]
    );

    const tierIds = new Map();
    for (const tier of tierDefs) {
      const result = await client.query(
        `INSERT INTO chamber.tiers (tenant_id, slug, name, price_cents, billing_cycle, benefits, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (tenant_id, slug) DO UPDATE SET
           name = EXCLUDED.name,
           price_cents = EXCLUDED.price_cents,
           billing_cycle = EXCLUDED.billing_cycle,
           benefits = EXCLUDED.benefits,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()
         RETURNING id`,
        [TENANT_ID, tier.slug, tier.name, tier.price_cents, tier.billing_cycle, JSON.stringify(tier.benefits), tier.sort_order]
      );
      tierIds.set(tier.slug, result.rows[0].id);
    }

    const orgRows = [];
    for (const org of organizations) {
      const result = await client.query(
        `INSERT INTO chamber.organizations (tenant_id, tier_id, slug, name, status, description, logo_url, website, phone, email, address, city, province, postal_code, categories, featured, renewal_date, payment_status)
         VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (tenant_id, slug) DO UPDATE SET
           tier_id = EXCLUDED.tier_id,
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           description = EXCLUDED.description,
           logo_url = EXCLUDED.logo_url,
           website = EXCLUDED.website,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           address = EXCLUDED.address,
           city = EXCLUDED.city,
           province = EXCLUDED.province,
           postal_code = EXCLUDED.postal_code,
           categories = EXCLUDED.categories,
           featured = EXCLUDED.featured,
           renewal_date = EXCLUDED.renewal_date,
           payment_status = EXCLUDED.payment_status,
           updated_at = NOW()
         RETURNING id`,
        [
          TENANT_ID,
          tierIds.get(org.tierSlug),
          org.slug,
          org.name,
          org.description,
          org.slug === 'caledonia-regional-chamber-of-commerce' ? '/demo/assets/caledonia-chamber-logo-new.svg' : '',
          org.website || '',
          org.phone || '',
          org.email || '',
          org.address || '',
          org.city || '',
          org.province || '',
          org.postal_code || '',
          [org.category],
          org.featured,
          plusDays(365),
          'paid',
        ]
      );
      orgRows.push({ ...org, id: result.rows[0].id });
    }

    for (const org of orgRows) {
      const email = `member+${org.slug}@caledoniachamberdemo.ca`;
      const role = org.slug === 'caledonia-regional-chamber-of-commerce' ? 'member_admin' : 'member_rep';
      await client.query(
        `INSERT INTO chamber.users (tenant_id, org_id, email, role, first_name, last_name)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (tenant_id, email) DO UPDATE SET
           org_id = EXCLUDED.org_id,
           role = EXCLUDED.role,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           updated_at = NOW()`,
        [TENANT_ID, org.id, email, role, 'Member', org.name.split(' ')[0]]
      );
    }

    const aloomiiOrgId = orgRows.find(org => org.slug === 'aloomii-inc')?.id || null;
    if (aloomiiOrgId) {
      await client.query(
        `INSERT INTO chamber.users (tenant_id, org_id, email, role, first_name, last_name)
         VALUES ($1, $2, $3, 'member_admin', 'Yohann', 'Calpu')
         ON CONFLICT (tenant_id, email) DO UPDATE SET
           org_id = EXCLUDED.org_id,
           role = EXCLUDED.role,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           updated_at = NOW()`,
        [TENANT_ID, aloomiiOrgId, 'yohann@aloomii.com']
      );
    }

    await client.query(
      `INSERT INTO chamber.users (tenant_id, org_id, email, role, first_name, last_name)
       VALUES ($1, NULL, $2, 'super_admin', 'Chamber', 'Admin')
       ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
      [TENANT_ID, 'admin@caledoniachamberdemo.ca']
    );

    const eventIds = [];
    for (const eventDef of events) {
      const event = await client.query(
        `INSERT INTO chamber.events (tenant_id, slug, title, description, location, starts_at, ends_at, image_url, status, member_only)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'published',$9)
         ON CONFLICT (tenant_id, slug) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           location = EXCLUDED.location,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at,
           member_only = EXCLUDED.member_only,
           updated_at = NOW()
         RETURNING id`,
        [
          TENANT_ID,
          eventDef.slug,
          eventDef.title,
          eventDef.description,
          eventDef.location,
          eventDef.startsAt || plusDays(eventDef.days || 14),
          eventDef.endsAt || eventDef.startsAt || plusDays(eventDef.days || 14),
          '',
          eventDef.memberOnly,
        ]
      );
      const eventId = event.rows[0].id;
      eventIds.push(eventId);
      await client.query(
        `INSERT INTO chamber.ticket_types (tenant_id, event_id, name, price_cents, capacity, benefit_type)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [TENANT_ID, eventId, 'Member Ticket', 0, 150, 'free_event_tickets']
      );
    }

    const orgBySlug = new Map(orgRows.map(org => [org.slug, org]));
    for (const post of posts) {
      const orgId = orgBySlug.get(post.orgSlug)?.id || orgRows[0]?.id || null;
      await client.query(
        `INSERT INTO chamber.content_items (tenant_id, org_id, type, status, title, body, terms, url, metadata, published_at)
         VALUES ($1,$2,'hot_deal',$3,$4,$5,$6,$7,$8::jsonb,$9)
         ON CONFLICT DO NOTHING`,
        [
          TENANT_ID,
          orgId,
          post.status,
          post.title,
          `${post.teaser} This item exists to support the ChamberCore demo and moderation flow.`,
          'Replace with a verified member offer or chamber announcement before launch.',
          '',
          JSON.stringify({ teaser: post.teaser, source: 'caledonia-directory-seed' }),
          post.status === 'published' ? plusDays(-3) : null,
        ]
      );
    }

    const sampleOrg = orgBySlug.get('caledonia-regional-chamber-of-commerce') || orgRows[0];
    const sampleEventId = eventIds[0];
    const sampleRegistrationId = (await client.query(
      `INSERT INTO chamber.registrations (tenant_id, event_id, ticket_type_id, user_id, org_id, status, qr_code)
       SELECT $1, e.id, tt.id, u.id, o.id, 'registered', $2
       FROM chamber.events e
       JOIN chamber.ticket_types tt ON tt.event_id = e.id
       JOIN chamber.organizations o ON o.id = $3
       JOIN chamber.users u ON u.org_id = o.id
       WHERE e.id = $4 AND u.tenant_id = $1
       LIMIT 1
       RETURNING id`,
      [TENANT_ID, `QR-${sampleOrg.slug.toUpperCase()}`, sampleOrg.id, sampleEventId]
    )).rows[0]?.id;

    if (sampleRegistrationId) {
      await client.query(
        `INSERT INTO chamber.benefit_ledger (tenant_id, org_id, benefit_type, delta, reference_type, reference_id, note)
         VALUES ($1,$2,'free_event_tickets',-1,'registration',$3,$4)
         ON CONFLICT DO NOTHING`,
        [TENANT_ID, sampleOrg.id, sampleRegistrationId, 'Demo ticket redemption']
      );
    }

    const sampleContentId = (await client.query(
      `SELECT id FROM chamber.content_items WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [TENANT_ID]
    )).rows[0]?.id;

    if (sampleContentId) {
      await client.query(
        `INSERT INTO chamber.benefit_ledger (tenant_id, org_id, benefit_type, delta, reference_type, reference_id, note)
         VALUES ($1,$2,'hot_deal_posts',-1,'content_item',$3,$4)
         ON CONFLICT DO NOTHING`,
        [TENANT_ID, sampleOrg.id, sampleContentId, 'Demo Hot Deal posting redemption']
      );
    }

    await client.query('COMMIT');
    console.log(`ChamberCore Sprint 1 seed complete for tenant ${TENANT_ID}. Organizations: ${orgRows.length}. Events: ${events.length}.`);
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
