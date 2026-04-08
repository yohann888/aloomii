// GET /api/command — Command Center data endpoint
// Cloudflare Pages Function — queries PostgreSQL via Hyperdrive or falls back to static data
// This is the CF Pages adapter. For local dev, use scripts/dashboard/command-api.js with Express.

export async function onRequestGet({ env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=30'
  };

  // For now, return mock data that matches the spec shape.
  // Once Hyperdrive or a proxy is configured, this will query the real DB.
  // The local Express version (scripts/dashboard/command-api.js) queries Postgres directly.
  
  const mockData = {
    briefing: {
      decay_count: 2,
      decay_contacts: [
        { name: "Vincent Pronesti", id: "mock-1" },
        { name: "NationGraph", id: "mock-2" }
      ],
      drafts_pending: 3,
      stalled_opps: 1,
      overnight_signals: 8,
      high_score_signals: 2,
      overdue_outreach: 1,
      all_clear: false
    },
    contacts: [],
    signals: [],
    outreach_queue: [],
    drafts_pending: [],
    pipeline: {
      by_stage: {
        prospect: { count: 12, value: 0 },
        warm: { count: 8, value: 24000 },
        engaged: { count: 5, value: 42000 },
        proposal: { count: 3, value: 18000 },
        closed_won: { count: 2, value: 12000 },
        closed_lost: { count: 1, value: 0 }
      },
      win_loss: {
        won_quarter: 2,
        lost_quarter: 1,
        revenue_won: 12000,
        conversion_rate: 0.67
      }
    },
    notifications: [],
    fleet: { healthy: 21, attention: 6, offline: 3 },
    economics: {
      weekly_cost_usd: 12.10,
      human_value_usd: 1258,
      roi_multiplier: 108,
      breakdown: {
        content_drafts: 50,
        contacts_managed: 640,
        hot_leads: 500,
        signals_scanned: 68
      }
    },
    events: [
      { id: "e1", name: "Collision Conference", date: "2026-06-16", city: "Toronto", match_status: "priority", yohann_attending: true, contact_overlap: 4, total_score: 87 },
      { id: "e2", name: "Bitcoin Conference", date: "2026-05-15", city: "Miami", match_status: "attend", yohann_attending: true, contact_overlap: 2, total_score: 72 },
      { id: "e3", name: "Consensus 2026", date: "2026-05-05", city: "Miami", match_status: "monitor", yohann_attending: false, contact_overlap: 1, total_score: 55 }
    ],
    content_queue: [],
    client_pilots: [],
    webhooks: [],
    updated_at: new Date().toISOString()
  };

  return new Response(JSON.stringify(mockData), { headers });
}
