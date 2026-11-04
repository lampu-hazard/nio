# AI Agent Role Quotas & Images — Manual & Controlled Acceptance Checklist

This checklist covers manual browser interaction and controlled runtime verification for the 4-section AI Agent dashboard (`/dashboard/[guildId]/ai-agent`) and Discord bot routing without paid provider calls or unauthorized live Discord mutations.

## 1. Dashboard Navigation & Draft Preservation (`apps/client`)

1. Open `/dashboard/<guildId>/ai-agent` as an authenticated guild manager (`Administrator`, `ManageGuild`, or `ManageRoles`).
2. Verify the four navigation tabs render one active section at a time:
   - `Model & key`
   - `Access & quotas`
   - `Images`
   - `Usage`
3. Edit `Model` in `Model & key`, switch to `Access & quotas` to add a role rule, switch to `Images`, and return to `Model & key`:
   - Confirm unsaved edits and the dirty-state banner persist across section switches.
4. Enter an invalid value in a non-active section (for example `maxRunTokens <= maxOutputTokens` in `Model & key`, then switch to `Images` and click **Save changes**):
   - Confirm the page switches back to the offending section (`Model & key`) and shows the validation message without sending a `PATCH` request.
5. Enter a new API key or Image API key and click **Save changes**:
   - Confirm the password field clears to blank after the save completes and the badge updates to `Configured`.
   - Confirm entering a replacement key disables the `Remove stored key` checkbox, and checking `Remove stored key` clears the text input.

## 2. Role Quotas & Independent Maximum Preview

1. In `Access & quotas`, select **Role quotas**.
2. Add two role rules:
   - Role A: `Chat = on (10,000 tokens/day)`, `Images = off (0 images/day)`
   - Role B: `Chat = on (25,000 tokens/day)`, `Images = on (5 images/day)`
3. Confirm the maximum single-member allowance preview displays `25,000 tokens` and `5 images` (independent maximums, never summed to `35,000`).
4. Switch to **Legacy user allowlist**:
   - Confirm the warning banner explains that daily token/image limits are not enforced in Legacy mode and image generation is disabled.

## 3. Usage & Today's Live Quota Counters

1. Open the `Usage` tab.
2. Confirm both **Today's quota buckets** (`committed + reserved / limit · remaining`) and **Historical token log** (`1–90 days`) render independently:
   - Verify UTC period start and reset timestamps are displayed alongside local time.
   - Verify a bucket with `30 committed + 20 reserved / 100` shows `50 remaining`.
   - Verify a member row whose current Discord roles cannot be resolved shows `unavailable` for limit/remaining rather than inventing a quota.
   - Verify clicking **Load more members** appends the next page using the opaque cursor without resetting the selected historical day window.

## 4. Controlled Discord & Provider Acceptance (Opt-In)

- **Disposable PostgreSQL concurrency**:
  ```sh
  cd apps/server
  AGENT_QUOTA_TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nio_quota_test" bun run test:quota-integration
  ```
- **Live Discord / Paid Provider Smoke (Requires Separate Explicit Authorization)**:
  - Do not run against production guilds or paid API keys without explicit approval.
  - When authorized in a test guild, test `@nio gambar <prompt>`, `@nio buat gambar <prompt>`, and `@nio generate image <prompt>`, plus conversational phrasing (`@nio tolong gambarkan ...`) to confirm only the three explicit prefixes invoke the image endpoint.
