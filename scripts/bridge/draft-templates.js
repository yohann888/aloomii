/**
 * Draft Template Engine — Command Center v2
 * Static template hydration (no LLM calls).
 * Picks template by signal_source, hydrates with signal data.
 */

const templates = {
  // ── Reddit reply ────────────────────────────────────────────────────────────
  reddit_reply: (signal) => {
    const handle = signal.handle || 'there';
    const company = signal.company || 'your company';
    const text = truncate(signal.signal_text, 120);
    const angle = icpAngle(signal.icp_match);

    return `Hey ${handle}, saw your post about ${company}. ${angle} Would love to share what's worked for founders in your position. Mind if I DM you?`;
  },

  // ── LinkedIn connect ─────────────────────────────────────────────────────────
  linkedin_connect: (signal) => {
    const contactName = signal.contact_name || signal.handle || 'there';
    const company = signal.company || 'your company';
    const text = truncate(signal.signal_text, 100);
    const angle = icpAngle(signal.icp_match);

    return `Hi ${contactName} — noticed ${company} is working through ${angle.toLowerCase()}. We've been helping founders at your stage with exactly this. Would love to connect.`;
  },

  // ── X / Twitter reply ───────────────────────────────────────────────────────
  x_reply: (signal) => {
    const handle = signal.handle || '@there';
    const text = truncate(signal.signal_text, 100);
    const angle = icpAngle(signal.icp_match);

    return `@${handle} ${angle}. Founders in similar situations have found this useful — happy to share more if relevant.`;
  },

  // ── Cold email ──────────────────────────────────────────────────────────────
  email_cold: (signal) => {
    const contactName = signal.contact_name || signal.handle || 'there';
    const company = signal.company || '';
    const text = truncate(signal.signal_text, 150);
    const angle = icpAngle(signal.icp_match);

    const subject = company
      ? `Quick note on ${company} + GTM question`
      : `GTM question for ${contactName}`;

    return `Subject: ${subject}\n\n${contactName}${company ? ` at ${company}` : ''},\n\n${text ? `Came across your situation — ${text.toLowerCase().replace(/[.!?]$/, '')}. ` : ''}${angle}\n\nWorth a 15-min call this week?\n\nBest,\nYohann`;
  },

  // ── Generic fallback ────────────────────────────────────────────────────────
  default: (signal) => {
    const handle = signal.handle || signal.contact_name || 'there';
    const company = signal.company || '';
    const angle = icpAngle(signal.icp_match);

    return `Hi ${handle}${company ? ` from ${company}` : ''} — ${angle} Happy to share what's worked for others in your position. Open to connecting?`;
  },
};

/**
 * ICP angle text based on icp_match field from signal-scout.
 */
function icpAngle(icpMatch) {
  switch (icpMatch) {
    case 'sprint':
      return 'We help B2B founders go from invisible to 12 qualified conversations in 90 days — without hiring an SDR or burning out on cold outreach.';
    case 'ai_workforce':
      return 'We help relationship-driven businesses (insurance, finance, professional services) automate client follow-up and retention without losing the personal touch.';
    case 'deal_flow':
      return "Worth a quick chat — could be a strong fit for what you're building.";
    default:
      return 'We help B2B founders build predictable pipeline without the DIY grind or agency overhead.';
  }
}

/**
 * Pick template and hydrate. Returns string draft_text.
 */
function generateDraft(signal) {
  const source = signal.signal_source || signal.source || 'other';

  let template;
  switch (source) {
    case 'reddit':
    case 'reddit_signal':
      template = templates.reddit_reply;
      break;
    case 'linkedin':
    case 'linkedin_signal':
      template = templates.linkedin_connect;
      break;
    case 'x':
    case 'x_search':
    case 'twitter':
      template = templates.x_reply;
      break;
    case 'email':
    case 'email_cold':
      template = templates.email_cold;
      break;
    default:
      template = templates.default;
  }

  return template(signal);
}

/**
 * Truncate text to maxLen characters, breaking on word boundary.
 */
function truncate(text, maxLen) {
  if (!text) return '';
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3).replace(/\\S+$/, '') + '...';
}

module.exports = { generateDraft, templates, truncate };
