module.exports = {
  port: parseInt(process.env.PORT || '3200'),
  dbUrl: process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii',
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*',
  authCode: process.env.AUTH_CODE || 'aloomii888',
  cacheTtl: parseInt(process.env.CACHE_TTL || '30000'),

  // Cloudflare Access (Phase C — set these for production)
  // CF_AUD: your Access Application Audience tag
  // CF_TEAM_DOMAIN: your Cloudflare team domain (e.g. aloomii.cloudflareaccess.com)
  cfAud: process.env.CF_AUD || '',
  cfTeamDomain: process.env.CF_TEAM_DOMAIN || 'aloomii',
};
