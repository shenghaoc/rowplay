# In-App User Guide — Requirements

## Background

The existing `/docs` page renders a single monolithic markdown blob from the
locale dictionary. It is hard to navigate, impossible to deep-link, and the
large markdown string is difficult to maintain across six locales. The guide
needs to be split into focused, navigable sections with contextual help links
from the rest of the app.

## Requirements

### 1. Multi-section docs route structure

**WHEN** the user navigates to `/docs`  
**THEN** the system SHALL display an overview page with a sidebar navigation
listing all guide sections.

**WHEN** the user navigates to `/docs/<section-slug>`  
**THEN** the system SHALL display the corresponding section content with the
sidebar highlighting the active section.

Sections: Overview, Getting Started, Rowing Metrics, Pace/Splits/Watts,
Charts & Progress, Common Workflows, FAQ, Troubleshooting.

### 2. Keyboard-accessible sidebar navigation

**WHEN** the docs page is rendered  
**THEN** the sidebar SHALL use a daisyUI `menu` component with `aria-current="page"`
on the active section link.

**WHEN** the user presses Tab  
**THEN** focus SHALL traverse sidebar links in order.

### 3. Localized guide content

**WHEN** the user's language is set to any supported locale (en, zh, de, es, fr, ja)  
**THEN** all guide section titles and markdown content SHALL be displayed in
that language.

The old monolithic `docs.guideMarkdown` key SHALL be removed and replaced by
per-section keys (`docs.sections.<key>.navTitle`, `docs.sections.<key>.markdown`).

### 4. Contextual help links

**WHEN** the user encounters an empty state (no workouts, no trend data,
sync error, empty leaderboard, no stroke data for comparison, empty telemetry)
or a settings/connectivity issue  
**THEN** the system SHALL display a link pointing to the relevant docs section.

### 5. Subpath hosting support

**WHEN** the application is deployed on a subpath (SvelteKit `base` config)  
**THEN** all internal docs links SHALL resolve correctly by prepending the
`base` path from `$app/paths`.

### 6. Nav label rename

**WHEN** the user views the main navigation bar  
**THEN** the docs entry SHALL display "Help" (localized) instead of "Docs".

### 7. Source reference

**WHEN** the user is on any docs page  
**THEN** a "View Source" button SHALL link to `docs/usage.md` on GitHub as the
repository-facing English reference.

### 8. No visual regression

The docs layout SHALL be responsive: sidebar collapses to a horizontal
scrollable row on mobile (≤760px). The page chrome (kicker bar with badge and
buttons) SHALL remain visible at all viewport sizes.
