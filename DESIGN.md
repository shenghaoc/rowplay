---
name: rowplay
description: Concept2 logbook analytics + real-time workout replay
colors:
  electric-violet: "#5240ce"
  jet-set-blue: "#176b8c"
  sea-green: "#2f8f6e"
  cool-blue-grey-paper: "#f4f8fa"
  paper-raised: "#ffffff"
  paper-inset: "#e7eff2"
  deep-teal-navy-ink: "#0f2a36"
  muted-ink: "#44616e"
  behind-amber: "#c2851a"
  alarm-red: "#c0392b"
  rate-teal: "#1e8c8c"
  hr-rose: "#b0467e"
  rower-blue: "#2b5e78"
  skierg-green: "#2e8c7e"
  bike-purple: "#6257b8"
typography:
  display:
    fontFamily: '"Source Sans 3", "Noto Sans JP", "Noto Sans SC", system-ui, -apple-system, sans-serif'
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  body:
    fontFamily: '"Source Sans 3", "Noto Sans JP", "Noto Sans SC", system-ui, -apple-system, sans-serif'
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: '"Source Code Pro", "Noto Sans JP", "Noto Sans SC", ui-monospace, "SF Mono", monospace'
    fontWeight: 400
    fontFeature: '"tnum" 1'
rounded:
  ctrl: "0.625rem"
  card: "1rem"
  pill: "999px"
spacing:
  container-padding: "1.75rem 1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.electric-violet}"
    textColor: "#f7fafb"
    rounded: "{rounded.ctrl}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.ctrl}"
  card:
    backgroundColor: "{colors.paper-raised}"
    rounded: "{rounded.card}"
  input:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.deep-teal-navy-ink}"
    rounded: "{rounded.ctrl}"
  badge-primary:
    backgroundColor: "{colors.electric-violet}"
    textColor: "#f7fafb"
    rounded: "{rounded.pill}"
---

# Design System: rowplay

## 1. Overview

**Creative North Star: "The Training Log"**

rowplay is a well-kept athlete's notebook rendered in pixels: personal,
data-dense, and refined without being precious. Every surface carries the
weight of a training session; every number earns its place on the page. The
Jet Set Blue system pairs electric violet — the athlete's color, the "you"
who just finished a workout — with Jet Set Blue teal — the ghost they're
chasing from last month's session. The result is a tool that feels like gear
you want to use, not software you have to use.

This system explicitly rejects the clinical utilitarianism of erg-native apps
(ErgData, ErgZone, EXR), the hero-metric-template SaaS aesthetic, and the
dark-mode-by-default neon fitness-app vernacular. It is quiet, confident, and
athletic — data that breathes.

**Key Characteristics:**

- Refined and restrained: speaks through data, not decoration
- Lifted but restrained elevation: soft ambient shadows, not aggressive depth
- Two-accent strategy: violet for the live athlete, teal for the ghost/chase
- Monospaced numbers with tabular-nums: digits never jitter during replay
- Six locales, WCAG AAA ambition, reduced-motion first

## 2. Colors

The palette is cool, athletic, and deliberate. A blue-grey paper ground holds
deep teal-navy ink; two accents — electric violet and Jet Set Blue teal —
carry the "you vs. ghost" narrative across the entire interface.

### Primary

- **Electric Violet** (`#5240ce`): The athlete's color. Used for the live/live-mode indicator, primary buttons, focus rings, selection highlights, and pace readouts. Appears on ≤10% of any given screen — its rarity is the point.
- **Jet Set Blue** (`#176b8c`): The ghost's color, the chase target. Used for secondary accents, links, the brand mark (play-triangle), masthead active tabs, and ghost-replay indicators. Also serves as the `--chrome` alias.

### Secondary

- **Sea-Green** (`#2f8f6e`): Ahead / improving. Used for positive deltas, personal-best badges, and success states. Also the success semantic color.

### Neutral

- **Cool Blue-Grey Paper** (`#f4f8fa`): The training-log page. Body background, sheet surfaces, inset panels.
- **Paper Raised** (`#ffffff`): Elevated surfaces — cards, inputs, masthead background.
- **Paper Inset** (`#e7eff2`): Recessed areas, secondary surfaces, muted backdrops.
- **Deep Teal-Navy Ink** (`#0f2a36`): Body text, primary content. The pen on the page.
- **Muted Ink** (`#44616e`): Secondary text, labels, supporting copy. 62% opacity mix of ink over paper.

### Semantic

- **Behind Amber** (`#c2851a`): Warning, behind-pace, negative deltas.
- **Alarm Red** (`#c0392b`): Errors, danger, critical alerts.
- **Rate Teal** (`#1e8c8c`): Stroke-rate readouts and chart series.
- **HR Rose** (`#b0467e`): Heart-rate readouts and chart series.

### Sport Identity

- **Rower Blue** (`#2b5e78`): RowErg branding.
- **SkiErg Green** (`#2e8c7e`): SkiErg branding.
- **Bike Purple** (`#6257b8`): BikeErg branding.

### Named Rules

**The One Voice Rule.** Electric violet appears on ≤10% of any screen. Its
impact comes from restraint — a single live badge, one primary button, the
current pace digit. When everything is violet, nothing is live.

**The Ghost-Chase Rule.** Jet Set Blue always marks the target — the ghost
replay, the comparison reference, the "what you're chasing." Violet marks the
athlete. Never swap these roles.

## 3. Typography

**Display Font:** Source Sans 3 (with system-ui, -apple-system, Noto Sans JP/SC fallbacks)
**Body Font:** Source Sans 3 (same stack)
**Mono Font:** Source Code Pro (with ui-monospace, SF Mono, Noto Sans JP/SC fallbacks)

**Character:** Source Sans 3 is a workhorse humanist sans — legible at small
sizes for data tables, authoritative at display weights for headlines. Source
Code Pro provides the technical, instrument-panel voice for numbers and code.
The pairing is functional, not decorative; it's chosen for clarity at all
densities.

### Hierarchy

- **Display** (700, clamp context-dependent, 1.08): Page titles, hero numbers on the dashboard. Tight letter-spacing (-0.015em) for a modern, athletic feel.
- **Title** (700, ~1.25rem, 1.2): Section headings, card titles, panel headers.
- **Body** (400, 0.95–1rem, 1.5): Primary content, descriptions, workout metadata. Max line length 65–75ch on prose surfaces.
- **Label** (600, 0.74rem, 0.12em letter-spacing, uppercase): Micro-labels, eyebrow text, chart axis labels. Muted ink color.
- **Mono** (400, 0.8rem, tabular-nums): All numeric readouts, pace/split displays, chart legends, code blocks. `font-variant-numeric: tabular-nums` prevents digit jitter during replay.

### Named Rules

**The Tabular Rule.** Every number that updates during replay uses the mono
stack with `font-feature-settings: "tnum"`. Digits that jitter are digits
that lie.

## 4. Elevation

The system uses **lifted but restrained** depth: surfaces float subtly above
the paper ground through soft, ambient shadows. Borders (1px hairlines) carry
structural separation; shadows carry atmosphere. Depth is static and ambient,
not state-driven — surfaces don't dramatically lift on hover.

### Shadow Vocabulary

- **sm** (`0 1px 2px rgba(15,42,54,0.06), 0 1px 3px rgba(15,42,54,0.05)`): Subtle lift for cards, inputs, and masthead at rest.
- **md** / **stamp** (`0 2px 6px rgba(15,42,54,0.07), 0 10px 24px -10px rgba(15,42,54,0.18)`): Default card elevation, dropdowns, elevated panels.
- **lg** (`0 4px 12px rgba(15,42,54,0.08), 0 18px 40px -14px rgba(15,42,54,0.24)`): Modal surfaces, drawers, highest elevation.
- **stamp-live** (`0 2px 6px rgba(82,64,206,0.16), 0 14px 32px -12px rgba(82,64,206,0.34)`): Special elevation for live-mode indicators — the violet glow signals immediacy.
- **stamp-ghost** (`0 2px 6px rgba(23,107,140,0.15), 0 14px 32px -12px rgba(23,107,140,0.3)`): Special elevation for ghost-replay indicators — the teal glow signals the chase.

### Named Rules

**The Ambient Rule.** Shadows set mood, not structure. Borders (1px hairlines
at `var(--hairline)`) are the primary depth mechanism. Shadows are the
atmosphere around the border — they make the page feel dimensional without
making it feel layered or heavy.

## 5. Components

### Buttons

- **Shape:** `--r-ctrl` (0.625rem) rounded corners. daisyUI `btn` class provides the base; theme tokens color the variants.
- **Primary (`btn-primary`):** Electric violet background, near-white text. Used for the single most important action on any screen. Rare by design.
- **Ghost (`btn-ghost`):** Transparent background, muted ink text. Used for secondary actions, navigation, and theme/language toggles. Hover reveals subtle background tint.
- **Square icon buttons (`btn-square`, `iconbtn`):** Paper-raised background, hairline border. Muted ink icon, shifts to full ink on hover.

### Cards

- **Corner Style:** `--r-card` (1rem) — softly rounded, not pill-shaped.
- **Background:** Paper-raised (`#ffffff`) with hairline border (`1px solid var(--hairline)`).
- **Shadow:** `--stamp` (md shadow) as default elevation.
- **Internal Padding:** ~1.25rem (varies by context). Collapses to 0.95rem on mobile.

### Inputs / Fields

- **Style:** Paper-raised background, hairline border, rounded at `--r-ctrl`.
- **Placeholder:** Ink-3 color (45% opacity mix), meeting WCAG AA contrast.
- **Focus:** Border shifts to electric violet with a 3px violet glow ring (18% opacity). The glow is part of the border, not a separate element.
- **Error / Disabled:** Standard daisyUI treatments, overridden by theme tokens.

### Chips / Badges

- **Solid badge (`badge`):** Pill-shaped (999px), background from theme token, content-color text. Used for sport filters, status indicators.
- **Soft badge (`badge-soft`):** Tinted background, darkened foreground for WCAG AA contrast. Used for demo-mode indicator, personal-best tags.
- **ChipButton:** Ghost-style button with active-state background tint. Used for multi-select filters (sport toggles, time ranges).

### Navigation

- **Masthead:** Sticky top bar, paper background with bottom hairline border. Brand mark (Jet Set Blue play-triangle) + "rowplay" wordmark in display weight.
- **Desktop tabs:** Uppercase, 0.05em letter-spacing, muted ink. Active tab gets full ink + Jet Set Blue 3px bottom border.
- **Mobile drawer:** `<dialog>` top-sheet with backdrop blur. Slide-down entrance, tap-outside-to-close. Same tab styling as desktop.

### Signature: The Replay Gauge

- **MetricGauge:** Circular or arc-shaped readout for pace/split, stroke rate, power, heart rate. Large board-style number (display font, 700 weight) with a muted label below. Color-coded: violet for pace, teal for rate, amber for power, rose for HR. Updates in real-time during replay with tabular-nums.

## 6. Do's and Don'ts

### Do:

- **Do** use the two-accent strategy: violet for the live athlete, teal for the ghost/chase. Never swap these roles.
- **Do** use monospaced tabular-nums for every numeric readout that updates during replay. Digits that jitter undermine trust.
- **Do** use daisyUI component classes (`btn`, `card`, `badge`, `input`, `toggle`, `join`) as the primary component vocabulary. Custom CSS only when daisyUI doesn't cover the pattern.
- **Do** keep electric violet on ≤10% of any screen. One primary button, one live badge, the pace digit — that's it.
- **Do** use borders (1px hairlines) for structural separation; shadows are ambient atmosphere, not the primary depth mechanism.
- **Do** pass every user-visible string through `i18n.t()` in all six locale files. Sport names (RowErg, SkiErg, BikeErg) stay untranslated.

### Don't:

- **Don't** use the clinical erg-app aesthetic: dense raw-data tables, sport-utility visual language, un-styled form controls (the ErgData/ErgZone/EXR anti-reference).
- **Don't** use gradient text, glassmorphism, or neon-on-dark fitness-app tropes. The palette is deliberate and restrained.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards, list items, or callouts.
- **Don't** use the hero-metric template (big number, small label, supporting stats, gradient accent). The dashboard is a training log, not a SaaS landing page.
- **Don't** use arbitrary z-index values (999, 9999). The scale is: drawer backdrop → sticky masthead → modal → toast.
- **Don't** animate CSS layout properties (width, height, top, left). Use `transform` and `opacity` for all motion. Every animation must have a `prefers-reduced-motion: reduce` fallback.
- **Don't** place mute gray body text on a tinted near-white background. Contrast must hit ≥4.5:1 for body text. The muted-ink color (`#44616e`) is calibrated for this against paper.
