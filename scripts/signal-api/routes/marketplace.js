const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii' });

// Middleware for simple API key auth (Hardcoded for MVP)
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== 'aloomii_test_vendor_key') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.vendorId = 'vendor_test_01'; // MVP mock
  next();
};

// GET /v1/marketplace/feed
router.get('/feed', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, created_at, raw_data->'marketplace_payload' as payload
      FROM signals
      WHERE raw_data ? 'marketplace_payload'
        AND planning IN ('active', NULL)
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    const feed = rows.map(row => ({
      signal_id: row.id,
      timestamp: row.created_at,
      company: row.payload.company,
      pain: row.payload.pain,
      route_available: row.payload.route_available,
      action_url: `https://api.aloomii.com/v1/marketplace/route/${row.id}`
    }));

    res.json({ data: feed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /v1/marketplace/route/:id
// Phase 3: The Routing Concierge
router.post('/route/:id', authenticate, async (req, res) => {
  const signalId = req.params.id;
  try {
    const { rows } = await pool.query(`
      SELECT raw_data->'marketplace_payload' as payload 
      FROM signals 
      WHERE id = $1 AND raw_data ? 'marketplace_payload'
        AND planning IN ('active', NULL)
    `, [signalId]);

    if (rows.length === 0) return res.status(404).json({ error: 'Signal not found or not available in marketplace.' });
    
    const company = rows[0].payload.company;
    
    console.log(`[Marketplace] Vendor ${req.vendorId} requested route for ${company} (Signal: ${signalId})`);
    
    // In production, this would trigger an internal Discord webhook
    // so Yohann/Jenny can approve and run the graph internally.

    res.json({ 
      status: 'Route requested', 
      message: `Aloomii Concierge has been notified. We are calculating the relationship path to ${company} and will reach out shortly.`,
      signal_id: signalId
    });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;