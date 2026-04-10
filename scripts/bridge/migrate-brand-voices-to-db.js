#!/usr/bin/env node
'use strict';

const fs = require('fs');
const yaml = require('js-yaml');
const { Client } = require('pg');

const DB_URL = 'postgresql://superhana@localhost:5432/aloomii';
const FILES = [
  ['/Users/superhana/.openclaw/workspace/config/voice-profiles/yohann-calpu.yaml', 'yohann'],
  ['/Users/superhana/.openclaw/workspace/config/voice-profiles/jenny-calpu.yaml', 'jenny'],
];

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    for (const [file, owner] of FILES) {
      const doc = yaml.load(fs.readFileSync(file, 'utf8'));
      await client.query(
        `UPDATE brand_profiles
         SET display_name = $2,
             archetypes = COALESCE(archetypes, ARRAY[]::text[]),
             core_position = COALESCE(core_position, $3),
             phraseology = COALESCE(phraseology, '{}'::jsonb) || $4::jsonb,
             channels = COALESCE(channels, ARRAY[]::text[]),
             behaviors = COALESCE(behaviors, ARRAY[]::text[]) || $5::text[],
             metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb,
             updated_at = NOW()
         WHERE owner = $1`,
        [
          owner,
          doc.displayName,
          doc.voice?.description || null,
          JSON.stringify({
            preferredPhrases: doc.learned?.preferredPhrases || [],
            hookPatterns: doc.learned?.hookPatterns || doc.learned?.openingPatterns || [],
            closingPatterns: doc.learned?.closingPatterns || [],
            signOff: doc.signOff || null,
          }),
          doc.voice?.toneAnchors || [],
          JSON.stringify({
            yaml_source: file,
            yaml_version: doc.version,
            role: doc.role,
            org: doc.org,
            contentTypes: doc.contentTypes || {},
            learned: doc.learned || {},
            rules: doc.voice?.rules || {},
            formatting: doc.voice?.formatting || {},
          }),
        ]
      );
      console.log(`Migrated ${owner} from ${file}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
