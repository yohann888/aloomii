UPDATE brand_profiles
SET phraseology = COALESCE(phraseology, '{}'::jsonb) || $$
{
  "preferredPhrases": ["here's what we built", "the honest answer", "most founders", "worth a 15-min call", "what actually works", "the real problem", "No agenda", "I just wanted to", "I appreciate", "world class", "since day one"],
  "openingPatterns": ["Direct statement of the problem", "Specific number or data point", "Story that proves the point", "Acknowledgement of timing or context before getting to the point"],
  "closingPatterns": ["Clear next step", "Single question", "Link with context", "No agenda close: state intent, wish well, let it land"]
}
$$::jsonb,
metadata = COALESCE(metadata, '{}'::jsonb) || $$
{
  "yaml_source": "/Users/superhana/.openclaw/workspace/config/voice-profiles/yohann-calpu.yaml",
  "yaml_version": 1,
  "role": "co-founder",
  "org": "aloomii"
}
$$::jsonb,
behaviors = ARRAY(SELECT DISTINCT unnest(COALESCE(behaviors, ARRAY[]::text[]) || ARRAY['smart friend not a marketer','founder voice not copywriter voice','patient and specific','warm but not soft']))
WHERE owner = 'yohann';

UPDATE brand_profiles
SET phraseology = COALESCE(phraseology, '{}'::jsonb) || $$
{
  "preferredPhrases": ["Pretty cool, huh?", "How fun was that?!", "I certainly enjoyed that", "Until next time", "Feel free to ask any questions or just talk to me", "Too rich for my blood", "I will fully admit", "I'm learning and finding my gut", "It's always a fun, and sometimes mildly stressful ride", "I will say that right now", "Keep an eye out", "Hope you enjoy it"],
  "hookPatterns": ["Single-word or single-line answer to an implied question: 'Why? Azuki is why.'", "Rhetorical question that pulls reader in", "Direct address", "Declarative observation about something specific she noticed"],
  "closingPatterns": ["Open invitation to continue the conversation", "Specific question to the reader", "P.S. with a next-step or invitation", "Personal sign-off: — Jenny"]
}
$$::jsonb,
metadata = COALESCE(metadata, '{}'::jsonb) || $$
{
  "yaml_source": "/Users/superhana/.openclaw/workspace/config/voice-profiles/jenny-calpu.yaml",
  "yaml_version": 1,
  "role": "co-founder, creative director",
  "org": "aloomii"
}
$$::jsonb,
behaviors = ARRAY(SELECT DISTINCT unnest(COALESCE(behaviors, ARRAY[]::text[]) || ARRAY['inviting, not selling','honest about imperfection','curious creator, not expert pundit','warmth is genuine, not performed','specific visual thinking','quietly ambitious']))
WHERE owner = 'jenny';
