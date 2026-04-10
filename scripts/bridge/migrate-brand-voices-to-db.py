#!/usr/bin/env python3
import json
from pathlib import Path
import yaml
import psycopg

DB_URL = 'postgresql://superhana@localhost:5432/aloomii'
FILES = [
    ('/Users/superhana/.openclaw/workspace/config/voice-profiles/yohann-calpu.yaml', 'yohann'),
    ('/Users/superhana/.openclaw/workspace/config/voice-profiles/jenny-calpu.yaml', 'jenny'),
]

with psycopg.connect(DB_URL) as conn:
    with conn.cursor() as cur:
        for file, owner in FILES:
            doc = yaml.safe_load(Path(file).read_text())
            phraseology = {
                'preferredPhrases': (doc.get('learned') or {}).get('preferredPhrases', []),
                'hookPatterns': (doc.get('learned') or {}).get('hookPatterns', []) or (doc.get('learned') or {}).get('openingPatterns', []),
                'closingPatterns': (doc.get('learned') or {}).get('closingPatterns', []),
                'signOff': doc.get('signOff'),
            }
            metadata = {
                'yaml_source': file,
                'yaml_version': doc.get('version'),
                'role': doc.get('role'),
                'org': doc.get('org'),
                'contentTypes': doc.get('contentTypes', {}),
                'learned': doc.get('learned', {}),
                'rules': (doc.get('voice') or {}).get('rules', {}),
                'formatting': (doc.get('voice') or {}).get('formatting', {}),
            }
            cur.execute(
                '''
                UPDATE brand_profiles
                   SET display_name = %s,
                       core_position = COALESCE(core_position, %s),
                       phraseology = COALESCE(phraseology, '{}'::jsonb) || %s::jsonb,
                       behaviors = COALESCE(behaviors, ARRAY[]::text[]) || %s::text[],
                       metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb,
                       updated_at = NOW()
                 WHERE owner = %s
                ''',
                (
                    doc.get('displayName'),
                    (doc.get('voice') or {}).get('description'),
                    json.dumps(phraseology),
                    (doc.get('voice') or {}).get('toneAnchors', []),
                    json.dumps(metadata),
                    owner,
                ),
            )
            print(f'Migrated {owner} from {file}')
    conn.commit()
