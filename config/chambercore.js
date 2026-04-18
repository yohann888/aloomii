module.exports = {
  tenantId: process.env.CHAMBER_TENANT_ID || 'caledonia-demo',
  basePath: process.env.CHAMBER_BASE_PATH || '/chamber-demo',
  auth: {
    strategy: 'magic-link',
    emailProvider: process.env.CHAMBER_EMAIL_PROVIDER || 'resend',
    fromEmail: process.env.CHAMBER_FROM_EMAIL || 'hello@aloomii.com',
    adminAccessCode: process.env.CHAMBER_ADMIN_ACCESS_CODE || 'chamberdemo888',
    adminSessionCookie: 'chamber_demo_admin',
  },
  storage: {
    provider: 'cloudflare-r2',
    bucket: process.env.CHAMBER_R2_BUCKET || 'aloomii-chamber-demo',
    publicBaseUrl: process.env.CHAMBER_R2_PUBLIC_BASE_URL || '',
    maxUploadBytes: parseInt(process.env.CHAMBER_MAX_UPLOAD_BYTES || '5242880', 10),
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  },
  benefits: {
    allowedTypes: [
      'free_event_tickets',
      'hot_deal_posts',
      'directory_logo',
      'featured_directory_placement',
    ],
    referenceTypes: ['registration', 'content_item', 'manual_adjustment'],
  },
  roles: ['super_admin', 'member_admin', 'member_rep'],
};
