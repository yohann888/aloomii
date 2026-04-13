-- Allow draft rows in content_posts without a published timestamp.
-- Drafts should live in Command Center first and only get a published_at
-- value once they are actually distributed.

ALTER TABLE content_posts
  ALTER COLUMN published_at DROP NOT NULL;
