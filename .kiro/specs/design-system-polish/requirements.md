# Design-system polish — Requirements

## Context

The dashboard, replay, landing page, settings, and supporting components used
the same product language but expressed spacing, typography, radius, border,
and elevation choices inconsistently. The replay also hid useful keyboard
shortcuts, presented every ghost mode at once, animated interval bars through
layout, and became cramped on phones. This phase formalizes the existing
"Training Log" visual system while preserving rowplay's stateless product and
replay behavior.

## Requirements

### 1. Shared design tokens

1. Global CSS SHALL define named tokens for supported type sizes, line heights,
   font weights, spacing, radii, borders, and shadows.
2. Changed components SHALL use the shared tokens instead of introducing
   equivalent hard-coded values.
3. Small data marks SHALL use a data-mark radius rather than the larger control
   radius; controls, cards, pills, and circles SHALL retain distinct tokens.
4. Latin and CJK font requests SHALL include only weights used by the rendered
   product, while preserving readable system fallbacks.

### 2. Clear hierarchy and restrained interaction

1. The dashboard SHALL keep one purposeful eyebrow in its core summary and
   remove redundant eyebrows from the workout, records, and advanced sections.
2. Non-interactive landing-page feature cards SHALL not use hover motion that
   implies they can be clicked.
3. Replay headings SHALL form a valid hierarchy below the page `h1`; conditional
   sections SHALL not introduce skipped heading levels.
4. User-visible copy SHALL be direct and factual and SHALL not promise zero
   latency or functionality that is unavailable.

### 3. Replay controls and comparison disclosure

1. Desktop replay controls SHALL show the primary Space and arrow-key shortcuts
   beside the transport controls, while the complete shortcut list remains
   available in its existing disclosure.
2. Constant-pace and uploaded-file ghost modes SHALL live under a native
   `details`/`summary` disclosure; solo and comparable past-session modes SHALL
   remain immediately available.
3. Selecting an advanced ghost mode SHALL keep its disclosure open, and the
   disclosure SHALL expose an accessible comparison-group label in every
   locale.
4. At mobile widths, replay controls SHALL preserve coherent rows, full-width
   scrub/speed controls, usable touch targets, and full-width ghost inputs.

### 4. Compositor-safe progress motion

1. Interval comparison bars and annual-goal progress SHALL animate their fill
   with `transform: scaleX()` from the left, not by transitioning width.
2. Interval pace labels SHALL remain visually attached to their bar endpoints.
3. Rounded bar corners SHALL be owned by a fixed clipping container so scaling
   does not distort them.
4. New transitions SHALL respect `prefers-reduced-motion: reduce`.

### 5. Privacy, documentation, and localization

1. The in-app FAQ in all six locales SHALL state that public sharing and
   leaderboards are unavailable in the stateless product.
2. Token and workout-storage copy SHALL distinguish request-time Worker
   processing from server-side persistence and SHALL not claim that data never
   leaves Concept2.
3. The usage guide SHALL document advanced ghost options and the actual ±10
   second arrow-key seek behavior.
4. Every added or changed visible string SHALL be present in English, German,
   Spanish, French, Japanese, and Chinese with matching locale shape.

### 6. Verification

1. Formatting, lint, type checking, unit tests, production build, and locale
   validation SHALL pass.
2. The replay keyboard E2E flow SHALL open the advanced comparison disclosure
   before selecting a constant-pace ghost.
3. The Chromium smoke flow SHALL cover dashboard → replay → playback and the
   advanced constant-pace comparison path in demo mode.
4. Desktop and mobile replay states SHALL be visually inspected for hierarchy,
   disclosure, transport layout, labels, overflow, and touch affordances.
