ALTER TABLE "DiscordAgentSettings"
ADD COLUMN "userTokenRules" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Preserve explicit personal chat grants without retaining the old implicit image grant.
UPDATE "DiscordAgentSettings" AS settings
SET "userTokenRules" = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId', member_id, 'dailyTokenLimit', NULL)), '[]'::jsonb)
  FROM (SELECT DISTINCT unnest(settings."allowedUserIds") AS member_id) AS members
  WHERE member_id <> '*'
)
WHERE settings."accessMode" = 'ROLE_QUOTAS';
