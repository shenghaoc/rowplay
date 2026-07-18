# Design-system polish — Design

## Scope

This phase is a presentation-layer consolidation. It does not add storage,
change workout schemas, create a second renderer, or alter replay-engine
semantics. Existing route and component boundaries remain in place; shared
visual primitives live in `src/app.css`, while page-specific layout stays
scoped to the owning Svelte view.

## Token layer

`src/app.css` is the source of truth for:

- `--text-*` type sizes and `--leading-*` line heights;
- `--fw-*` font weights;
- `--space-*` dense UI spacing;
- `--r-data`, `--r-ctrl`, `--r-card`, `--r-pill`, and `--r-round` radii;
- `--bd*` borders and `--shadow-*` elevation.

`DESIGN.md` documents the same vocabulary and the "Training Log" rules.
`PRODUCT.md` records the product and privacy framing without replacing Kiro
steering as the architecture source of truth.

## Replay comparison controls

The primary comparison `join` keeps solo and past-session choices visible.
Constant pace and uploaded file move into native `details.ghost-more`, whose
`summary` supplies keyboard and assistive-technology behavior without a custom
disclosure state machine. The `open` value follows the selected advanced mode
so an active mode never becomes hidden.

## Replay transport

Desktop keeps the existing flex transport and adds a compact inline shortcut
hint. At `760px` and below, the inline hint is hidden, the complete shortcut
disclosure spans the grid, and touch controls receive a 44px minimum target. At
`420px` and below, play, scrub, and speed controls span the card while clock and
distance share the compact status row.

## Interval and goal bars

The interval row uses a fixed-width track and clipping container. Its inner fill
owns the color and scales from the left; the pace label is positioned at the
same percentage on the fixed track. Annual-goal progress uses the same
left-origin `scaleX` pattern. The global reduced-motion rule and a local replay
fallback collapse transitions for users who request reduced motion.

## Copy and privacy

Locale dictionaries remain the source of in-app guide and UI copy. All six FAQ
variants explicitly describe the unavailable public-sharing/leaderboard
surface required by the stateless-storage-removal spec. `docs/usage.md` remains
the English repository-backed user guide and records the real keyboard and
ghost-control paths.

## Architecture

The large replay route remains an existing hotspot, but this phase adds no new
domain model, persistence path, renderer, or coordinator. New behavior is
limited to native disclosure markup and responsive presentation that depends on
existing local replay state. Extracting it would require widening a prop/event
surface without reducing domain responsibility, so the minimal phase refactor
keeps it colocated and documents the risk rather than creating a duplicate
control system.

## Verification

- `git diff --check`
- `vp run validate:locales`
- `vp check`
- `vp test`
- `vp run test:e2e:smoke`
- `vp run test:e2e tests/e2e/replay-keyboard.spec.ts`
- Demo-mode visual inspection at desktop and phone widths
