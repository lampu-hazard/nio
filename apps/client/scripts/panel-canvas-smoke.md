# Panel editor acceptance — 2026-11-03

## Navigation and save flow

- Open a saved panel at `/dashboard/<guildId>/panels/<panelId>`.
- Edit contains Content, Appearance, and Settings. Inactive sections stay mounted so draft fields/history are not discarded.
- Content shows the Simple text fields or Canvas, not both long editors. Templates and server image preview start collapsed.
- Appearance contains native embed visibility, color/style, and Simple banner crop. Canvas dimensions are image dimensions, not the native Discord embed width.
- Settings contains name, type, channel, and role interaction policy. Invalid required fields reveal their section when Save is pressed.
- Self-role panels have a separate Roles view; Discord preview is separate from editing. Save/Publish actions stick to the viewport bottom while scrolling within Edit.
- Save before Publish. A role mutation increments the panel revision; stale publication must reject rather than send an older design.

## Automated and image evidence

- `bun scripts/check-client.ts` (repository root): includes section visibility/mounted field retention, media URLs, mode retention, crop geometry, history, preview abort/blob disposal, and static control rendering.
- `bun scripts/sync-panel-visual.ts --check`: canonical document/layout sources match generated frontend sources.
- Server tests cover Simple presentation defaults, Canvas attachments, ordered role/link buttons, MENU row packing, capacity limits, cleared generated attachments on legacy rollback, permission rejection, stale revisions, real guarded preview HTTP requests, raster limits and worker cancellation.
- Cross-layer publish spec saves a document through PanelsService, renders a real worker PNG, publishes through fake Discord transport, rejects a stale revision after adding a role, then restores legacy rendering and verifies the old attachment is removed.
- Compiled Bun renderer produced an 800 × 400 PNG with bundled bold text and rounded shapes; inspected with Read. A second PNG with text and a cropped static local raster was also inspected. Artifacts are in the ignored plan workspace, not production storage.
- One combined sharp fixture-generation + renderer smoke process exceeded the five-second deadline; generating the fixture in a separate process and rendering with compiled Bun succeeded. This does not establish that simultaneous native image workloads are fully accepted.

## Database error reproduction

A read-only check against the configured database reproduced Prisma `P2022` on the reported panel: `Panel.visualDocument` is absent (the revision column is also absent). Migration status lists all 17 migrations as pending even though legacy tables exist. No migration, baseline write, reset, or schema push was performed. The API now returns actionable `503 DATABASE_SCHEMA_OUTDATED` rather than an opaque 500; the panel page preserves this explanation.

An administrator must reconcile actual schema versus migration history before applying the additive panel migration using the existing Prisma deployment scripts. Error handling is not a substitute for applying the schema change.

## Acceptance gaps

- No Playwright, browser automation, live Discord sends, or authentication bypass was used.
- Actual desktop/mobile layout, pointer drag/resize, focus behavior, narrow-screen overflow, sticky actions, and hidden-field validation need manual browser acceptance. Static markup checks are not interaction acceptance.
- Source and compiled worker output and guarded HTTP rendering were exercised; production Docker build was not (Docker CLI unavailable).
- Jest has existing open handles. The final whole suite uses explicit `--forceExit`; a normal run reported results but did not exit on its own.
- No production migration, push, or deployment is implied by passing checks.
