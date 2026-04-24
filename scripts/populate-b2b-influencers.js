const { Client } = require('pg');

const config = {
  connectionString: 'postgresql://superhana@localhost:5432/aloomii'
};

const influencers = [
  // --- ICP: The Table (Sprint) ---
  {
    handle: 'johnbarrows',
    platform_primary: 'LinkedIn',
    followers: 400000,
    engagement_rate: 1.5,
    niche_tags: 'Sales Training, B2B, GTM',
    profile_url: 'https://www.linkedin.com/in/johnbarrows/',
    icp_target: 'the_table',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'High (Runs coaching/partnerships)',
    pricing_estimate: 'TBD',
    contact_method: 'LinkedIn/Email',
    notes: 'Legendary sales coach for B2B founders. Perfectly aligned with Sprint ICP for technical founders needing sales systems.'
  },
  {
    handle: 'joshbraun',
    platform_primary: 'LinkedIn',
    followers: 300000,
    engagement_rate: 2.5,
    niche_tags: 'Cold Outreach, Sales, B2B',
    profile_url: 'https://www.linkedin.com/in/joshbraun/',
    icp_target: 'the_table',
    lead_score: 10,
    lead_tier: 'tier_1',
    collab_readiness: 'High (Active in community)',
    pricing_estimate: 'TBD',
    contact_method: 'Email',
    notes: 'The authority on cold outreach. Aloomii’s "human review on every output" resonates with his "unsleazy" sales philosophy.'
  },
  {
    handle: 'chriswalker',
    platform_primary: 'LinkedIn',
    followers: 150000,
    engagement_rate: 3.0,
    niche_tags: 'Demand Gen, Marketing Strategy, SaaS',
    profile_url: 'https://www.linkedin.com/in/chriswalker163/',
    icp_target: 'the_table',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'Medium',
    pricing_estimate: 'TBD',
    contact_method: 'LinkedIn',
    notes: 'Champion of demand gen vs lead gen. Speaks to the $50k-$100k MRR founder trying to scale.'
  },
  {
    handle: 'davegerhardt',
    platform_primary: 'LinkedIn',
    followers: 200000,
    engagement_rate: 2.0,
    niche_tags: 'B2B Marketing, Brand, SaaS',
    profile_url: 'https://www.linkedin.com/in/davegerhardt/',
    icp_target: 'the_table',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'High (Runs Exit Five community)',
    pricing_estimate: 'TBD',
    contact_method: 'Exit Five/Email',
    notes: 'B2B marketing powerhouse. Focus on positioning and brand fits Aloomii’s "invisible in market" pain point.'
  },
  {
    handle: 'jasonlemkin',
    platform_primary: 'X/Twitter',
    followers: 250000,
    engagement_rate: 1.2,
    niche_tags: 'SaaS, VC, GTM',
    profile_url: 'https://x.com/jasonlk',
    icp_target: 'the_table',
    lead_score: 10,
    lead_tier: 'tier_1',
    collab_readiness: 'Medium (Saastr)',
    pricing_estimate: 'High',
    contact_method: 'Saastr/X',
    notes: 'Founder of Saastr. The ultimate voice for SaaS founders at the stage Aloomii targets.'
  },
  {
    handle: 'hitenshah',
    platform_primary: 'X/Twitter',
    followers: 230000,
    engagement_rate: 1.0,
    niche_tags: 'Product, SaaS, Growth',
    profile_url: 'https://x.com/hnshah',
    icp_target: 'the_table',
    lead_score: 8,
    lead_tier: 'tier_2',
    collab_readiness: 'Medium',
    pricing_estimate: 'TBD',
    contact_method: 'X',
    notes: 'Product-led growth expert. Connects well with technical founders.'
  },
  {
    handle: 'arvidkahl',
    platform_primary: 'X/Twitter',
    followers: 120000,
    engagement_rate: 4.0,
    niche_tags: 'Bootstrapping, SaaS, Build in Public',
    profile_url: 'https://x.com/arvidkahl',
    icp_target: 'the_table',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'High (Author/Creator)',
    pricing_estimate: 'Moderate',
    contact_method: 'X/Email',
    notes: 'The voice for bootstrapped/indie SaaS founders. Perfect for the $50k MRR segment.'
  },
  {
    handle: 'justinwelsh',
    platform_primary: 'LinkedIn',
    followers: 500000,
    engagement_rate: 5.0,
    niche_tags: 'Solopreneur, Content Strategy',
    profile_url: 'https://www.linkedin.com/in/justinwelsh/',
    icp_target: 'the_table',
    lead_score: 8,
    lead_tier: 'tier_2',
    collab_readiness: 'Medium',
    pricing_estimate: 'High',
    contact_method: 'Website/LinkedIn',
    notes: 'Master of content systems. Speaks to the "DIY 11 PM session" founder.'
  },
  {
    handle: 'amandanatividad',
    platform_primary: 'X/Twitter',
    followers: 100000,
    engagement_rate: 2.2,
    niche_tags: 'Content Marketing, B2B, SaaS',
    profile_url: 'https://x.com/amandanat',
    icp_target: 'the_table',
    lead_score: 8,
    lead_tier: 'tier_2',
    collab_readiness: 'Medium (SparkToro)',
    pricing_estimate: 'TBD',
    contact_method: 'X',
    notes: 'Expert in audience research. Fits the "who to target" part of GTM.'
  },
  {
    handle: 'randfish',
    platform_primary: 'X/Twitter',
    followers: 450000,
    engagement_rate: 1.5,
    niche_tags: 'Marketing, SEO, Audience Intelligence',
    profile_url: 'https://x.com/randfish',
    icp_target: 'the_table',
    lead_score: 7,
    lead_tier: 'tier_2',
    collab_readiness: 'Medium',
    pricing_estimate: 'TBD',
    contact_method: 'X',
    notes: 'Founder of SparkToro/Moz. Speaks to founders who are tired of standard ads.'
  },

  // --- ICP: AI Workforce (Professional Services) ---
  {
    handle: 'samanth Russell',
    platform_primary: 'LinkedIn',
    followers: 50000,
    engagement_rate: 3.5,
    niche_tags: 'Financial Advisors, Digital Marketing',
    profile_url: 'https://www.linkedin.com/in/samanthacrussell/',
    icp_target: 'ai_workforce',
    lead_score: 10,
    lead_tier: 'tier_1',
    collab_readiness: 'High',
    pricing_estimate: 'TBD',
    contact_method: 'LinkedIn',
    notes: 'Top influencer for financial advisors. Teaches them how to grow via digital channels. Perfect for AI Workforce.'
  },
  {
    handle: 'robertsofia',
    platform_primary: 'LinkedIn',
    followers: 45000,
    engagement_rate: 2.8,
    niche_tags: 'Wealth Management, Marketing Automation',
    profile_url: 'https://www.linkedin.com/in/robertsofia/',
    icp_target: 'ai_workforce',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'Medium (CEO Snappy Kraken)',
    pricing_estimate: 'TBD',
    contact_method: 'LinkedIn',
    notes: 'CEO of Snappy Kraken. Focuses on marketing automation for financial services.'
  },
  {
    handle: 'cherylnash',
    platform_primary: 'LinkedIn',
    followers: 25000,
    engagement_rate: 1.8,
    niche_tags: 'Wealth Tech, FinTech, Leadership',
    profile_url: 'https://www.linkedin.com/in/cherylnash/',
    icp_target: 'ai_workforce',
    lead_score: 8,
    lead_tier: 'tier_2',
    collab_readiness: 'Medium',
    pricing_estimate: 'TBD',
    contact_method: 'LinkedIn',
    notes: 'CEO of Financial Supermarket. Expert in wealth tech and relationship-driven business.'
  },
  {
    handle: 'nigelwalsh',
    platform_primary: 'LinkedIn',
    followers: 35000,
    engagement_rate: 2.0,
    niche_tags: 'InsurTech, Google Cloud, Digital Transformation',
    profile_url: 'https://www.linkedin.com/in/nigelwalsh/',
    icp_target: 'ai_workforce',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'Medium (Google Executive)',
    pricing_estimate: 'N/A',
    contact_method: 'LinkedIn',
    notes: 'Leading voice in InsurTech. Connects Aloomii to insurance brokerage digital transformation.'
  },
  {
    handle: 'matteocarbone',
    platform_primary: 'LinkedIn',
    followers: 30000,
    engagement_rate: 2.5,
    niche_tags: 'Insurance Innovation, IoT, InsurTech',
    profile_url: 'https://www.linkedin.com/in/matteocarbone',
    icp_target: 'ai_workforce',
    lead_score: 8,
    lead_tier: 'tier_2',
    collab_readiness: 'Medium',
    pricing_estimate: 'TBD',
    contact_method: 'LinkedIn',
    notes: 'Thought leader in insurance innovation. Proponent of tech-driven efficiency.'
  },
  {
    handle: 'denisegarth',
    platform_primary: 'LinkedIn',
    followers: 20000,
    engagement_rate: 1.5,
    niche_tags: 'Insurance, GTM, Digital Transformation',
    profile_url: 'https://www.linkedin.com/in/denisegarth',
    icp_target: 'ai_workforce',
    lead_score: 7,
    lead_tier: 'tier_2',
    collab_readiness: 'Medium',
    pricing_estimate: 'TBD',
    contact_method: 'LinkedIn',
    notes: 'Focuses on strategic marketing for insurance carriers and brokers.'
  },
  {
    handle: 'michaelkitces',
    platform_primary: 'X/Twitter',
    followers: 100000,
    engagement_rate: 2.2,
    niche_tags: 'Financial Planning, Advisor Growth',
    profile_url: 'https://x.com/michaelkitces',
    icp_target: 'ai_workforce',
    lead_score: 10,
    lead_tier: 'tier_1',
    collab_readiness: 'Medium (Huge audience)',
    pricing_estimate: 'High',
    contact_method: 'Email/Website',
    notes: 'The most influential blogger/podcaster in the financial advisor space.'
  },
  {
    handle: 'craigiskowitz',
    platform_primary: 'LinkedIn',
    followers: 15000,
    engagement_rate: 2.0,
    niche_tags: 'Wealth Management Tech, FinTech',
    profile_url: 'https://www.linkedin.com/in/craigiskowitz/',
    icp_target: 'ai_workforce',
    lead_score: 8,
    lead_tier: 'tier_2',
    collab_readiness: 'High (Consultant)',
    pricing_estimate: 'TBD',
    contact_method: 'LinkedIn',
    notes: 'Host of Wealth Management Today. Deep tech focus.'
  },

  // --- ICP: Deal Flow (VCs) ---
  {
    handle: 'lennyrachitsky',
    platform_primary: 'Newsletter/Podcast',
    followers: 600000,
    engagement_rate: 4.0,
    niche_tags: 'Product, Growth, Startups',
    profile_url: 'https://www.lennysnewsletter.com/',
    icp_target: 'deal_flow',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'Medium',
    pricing_estimate: 'High',
    contact_method: 'Email',
    notes: 'The definitive voice for growth/product. VCs follow him to find the next big thing and advise portfolio companies.'
  },
  {
    handle: 'harrystebbings',
    platform_primary: 'Podcast',
    followers: 200000,
    engagement_rate: 3.5,
    niche_tags: 'VC, 20VC, Fundraising',
    profile_url: 'https://thetwentyminutevc.com/',
    icp_target: 'deal_flow',
    lead_score: 10,
    lead_tier: 'tier_1',
    collab_readiness: 'Medium',
    pricing_estimate: 'High',
    contact_method: 'Email/X',
    notes: 'Host of 20VC. Every VC in the world listens to him. Perfect for Deal Flow signal.'
  },
  {
    handle: 'andrewchen',
    platform_primary: 'X/Twitter',
    followers: 300000,
    engagement_rate: 1.5,
    niche_tags: 'VC, A16z, Consumer Tech, Games',
    profile_url: 'https://x.com/andrewchen',
    icp_target: 'deal_flow',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'Medium (A16z Partner)',
    pricing_estimate: 'N/A',
    contact_method: 'X',
    notes: 'A16z Partner. Highly influential voice in the VC community.'
  },
  {
    handle: 'pault',
    platform_primary: 'X/Twitter',
    followers: 1500000,
    engagement_rate: 1.0,
    niche_tags: 'YC, Startups, VC',
    profile_url: 'https://x.com/paulg',
    icp_target: 'deal_flow',
    lead_score: 8,
    lead_tier: 'tier_2',
    collab_readiness: 'Low',
    pricing_estimate: 'N/A',
    contact_method: 'N/A',
    notes: 'Paul Graham. Not for partnership, but for signal and authority in the deal flow world.'
  },
  {
    handle: 'eladgil',
    platform_primary: 'X/Twitter',
    followers: 200000,
    engagement_rate: 1.2,
    niche_tags: 'Scaling, VC, Startups',
    profile_url: 'https://x.com/eladgil',
    icp_target: 'deal_flow',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'Medium',
    pricing_estimate: 'TBD',
    contact_method: 'X',
    notes: 'Super-angel and author of High Growth Handbook. Trusted by every Series A+ VC.'
  },
  {
    handle: 'elizabethyahn',
    platform_primary: 'X/Twitter',
    followers: 80000,
    engagement_rate: 2.5,
    niche_tags: 'VC, Hustle Fund, Early Stage',
    profile_url: 'https://x.com/elizabethyahn',
    icp_target: 'deal_flow',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'High (Active content creator)',
    pricing_estimate: 'TBD',
    contact_method: 'X',
    notes: 'Hustle Fund co-founder. Speaks directly to the seed/series A sourcing pain.'
  },
  {
    handle: 'macconwell',
    platform_primary: 'X/Twitter',
    followers: 60000,
    engagement_rate: 4.5,
    niche_tags: 'VC, RareBreed, Early Stage',
    profile_url: 'https://x.com/macconwell',
    icp_target: 'deal_flow',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'High',
    pricing_estimate: 'Moderate',
    contact_method: 'X/DM',
    notes: 'Vocal VC on X. High engagement with early-stage founders and other VCs.'
  },
  {
    handle: 'sarahguem',
    platform_primary: 'X/Twitter',
    followers: 50000,
    engagement_rate: 2.0,
    niche_tags: 'VC, Canvas, Sourcing',
    profile_url: 'https://x.com/sarahguem',
    icp_target: 'deal_flow',
    lead_score: 8,
    lead_tier: 'tier_2',
    collab_readiness: 'Medium',
    pricing_estimate: 'TBD',
    contact_method: 'X',
    notes: 'VC at Canvas Ventures. Speaks to sourcing and deal flow mechanics.'
  },
  {
    handle: 'shaiw',
    platform_primary: 'X/Twitter',
    followers: 40000,
    engagement_rate: 1.8,
    niche_tags: 'VC, Lerer Hippeau, Early Stage',
    profile_url: 'https://x.com/shaiw',
    icp_target: 'deal_flow',
    lead_score: 7,
    lead_tier: 'tier_2',
    collab_readiness: 'Medium',
    pricing_estimate: 'TBD',
    contact_method: 'X',
    notes: 'Managing Partner at Lerer Hippeau. Influential in the NY VC scene.'
  },
  {
    handle: 'packym',
    platform_primary: 'Newsletter',
    followers: 150000,
    engagement_rate: 3.0,
    niche_tags: 'VC, Tech Strategy, Not Boring',
    profile_url: 'https://www.notboring.co/',
    icp_target: 'deal_flow',
    lead_score: 9,
    lead_tier: 'tier_1',
    collab_readiness: 'Medium',
    pricing_estimate: 'High',
    contact_method: 'Email',
    notes: 'Not Boring. Deep strategy dives that VCs share with their LPs and founders.'
  }
];

async function populate() {
  const client = new Client(config);
  try {
    await client.connect();
    console.log('Connected to DB');

    for (const influencer of influencers) {
      const query = `
        INSERT INTO influencer_pipeline (
          handle, platform_primary, platform, followers, engagement_rate, 
          niche_tags, profile_url, icp_target, lead_score, lead_tier, 
          collab_readiness, pricing_estimate, contact_method, notes, status
        ) 
        VALUES (
          $1::varchar, 
          $2::text, 
          $3::varchar, 
          $4::integer, 
          $5::numeric, 
          $6::text, 
          $7::text, 
          $8::text, 
          $9::integer, 
          $10::text, 
          $11::text, 
          $12::text, 
          $13::varchar, 
          $14::text, 
          'Identified'
        )
        ON CONFLICT (handle) DO UPDATE SET
          platform_primary = EXCLUDED.platform_primary,
          platform = EXCLUDED.platform,
          followers = EXCLUDED.followers,
          engagement_rate = EXCLUDED.engagement_rate,
          niche_tags = EXCLUDED.niche_tags,
          profile_url = EXCLUDED.profile_url,
          icp_target = EXCLUDED.icp_target,
          lead_score = EXCLUDED.lead_score,
          lead_tier = EXCLUDED.lead_tier,
          collab_readiness = EXCLUDED.collab_readiness,
          pricing_estimate = EXCLUDED.pricing_estimate,
          contact_method = EXCLUDED.contact_method,
          notes = EXCLUDED.notes;
      `;
      
      const values = [
        influencer.handle,
        influencer.platform_primary,
        influencer.platform_primary, // mapping both to primary for consistency
        influencer.followers,
        influencer.engagement_rate,
        influencer.niche_tags,
        influencer.profile_url,
        influencer.icp_target,
        influencer.lead_score,
        influencer.lead_tier,
        influencer.collab_readiness,
        influencer.pricing_estimate,
        influencer.contact_method,
        influencer.notes
      ];

      await client.query(query, values);
      console.log(`Populated: ${influencer.handle}`);
    }

    console.log('Finished population.');
  } catch (err) {
    console.error('Error populating DB:', err);
  } finally {
    await client.end();
  }
}

populate();
