UPDATE content_posts cp
SET brand_profile_id = bp.id
FROM brand_profiles bp
WHERE cp.brand_profile_id IS NULL
  AND cp.adapter = bp.owner
  AND bp.owner IN ('yohann','jenny');
