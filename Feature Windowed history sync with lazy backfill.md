# Feature: Windowed history sync with lazy backfill

Exported: 03/06/2026, 01:59:35

## Steering Documents

**Workspace:**
- AGENTS.md
- product.md
- structure.md
- tech.md

---

**User:**

Feature: Windowed history sync with lazy backfill
Create a Kiro spec (requirements.md, design.md, tasks.md) under .kiro/specs/history-windowing/, following the format and conventions of the existing specs (read .kiro/specs/raw-field-inspector/ as a template and AGENTS.md for the project rules: demo mode, i18n across all six locales, EARS acceptance criteria, and the check/build/test/test:e2e quality gate).
Problem. On first connect, the sync currently pages the Concept2 results API backward through the athlete's entire history into D1 (Concept2Client.listWorkoutsPage(page, from?, number=250) in src/lib/server/concept2.ts, driven by src/routes/api/sync/+server.ts). For a long-time athlete that's many API calls and a slow first sync, and data from many years ago has little analytical value.
Decision (locked). First connect syncs only the most recent 12 months fast (so the dashboard/replay are usable almost immediately), then lazily backfills older history in the background / on demand. The window length should be a single named constant, not hardcoded inline.
Requirements to capture:
First connect pulls only workouts on/after today − 12 months (reuse the existing from param on listWorkoutsPage) and completes quickly without blocking first dashboard paint.
Older history backfills progressively after the window lands — resumable across sessions via a persisted watermark/cursor (how far back we've synced) in D1, idempotent so re-sync never duplicates rows (D1 upsert keyed by workout id).
Respect the API's 250-results-per-page max and avoid hammering it (sensible paging/backoff).
A sync-status affordance shows window state and backfill progress; all strings i18n'd in all six locales.
Demo mode works with no credentials (mock data is already bounded — the spec should say demo skips real paging).
The window length is configurable via one constant; design notes how a user could later trigger a full backfill on demand.
Produce the three spec files only (no implementation). Keep server-only logic server-side. Reference but don't re-spec the existing detail-cache and D1 schema.

---

**Assistant:**

The decision is already locked and the scope is clear — this is a new feature spec.

---
