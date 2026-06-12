# Multi-Distance Performance Predictor — Requirements

## Introduction

Concept2 athletes routinely ask "if I can row a 7:04 2k, what should my 5k be?"
The Concept2 community standard answer is **Paul's Law** — a simple power-law
formula used by the Concept2 ranking system. rowplay already stores personal
bests for every standard distance, but it makes no use of them for prediction or
goal-setting.

This feature adds a **Performance Predictor** card to the dashboard. The athlete
enters one known time, and the card shows predicted times across all standard
distances with a colour-coded comparison against their actual personal bests,
making it immediately clear which goals are within reach and which distances
they've never tried.

## Requirements

### Requirement 1 — Predict times

**User story:** As an athlete, I want to enter one race time and see predicted
times for every standard Concept2 distance, so that I can set realistic targets
and understand my cross-distance equivalences.

#### Acceptance criteria

1. WHEN the athlete provides a distance and a time THEN the system SHALL display
   predicted finish times for all other standard distances using Paul's Law
   (`T₂ = T₁ × (D₂/D₁)^1.06`).
2. THE standard distances SHALL be: 500 m, 1 000 m, 2 000 m, 5 000 m,
   6 000 m, 10 000 m, and 21 097 m.
3. THE source distance SHALL appear in the table at the entered time (no
   prediction applied to itself).

### Requirement 2 — Compare with personal bests

**User story:** As an athlete, I want to see my actual personal bests alongside
each prediction so that I know where I've beaten my predicted pace and where I
still have room.

#### Acceptance criteria

1. WHERE the athlete has a personal best for a predicted distance THEN the system
   SHALL display that best time and a status indicator alongside the prediction.
2. THE status SHALL be one of:
   - **Beaten** — athlete's PB is faster than predicted (shown in green).
   - **Behind** — athlete has a result but it is slower than predicted (shown in
     amber).
   - **Untried** — no personal best on record for this distance (shown in grey).
3. WHERE the athlete has no personal best at any distance THEN all rows SHALL
   show status "Untried".

### Requirement 3 — Pre-fill and discoverability

**User story:** As an athlete, I want the predictor to open ready to use with my
best-known time already filled in, so that I don't have to look up my PB
manually.

#### Acceptance criteria

1. WHEN the athlete expands the predictor card THEN the system SHALL pre-select
   2 000 m as the source distance and pre-fill the time with the athlete's RowErg
   2k personal best, when that PB is available.
2. WHERE no 2k PB is available THEN the inputs SHALL start empty.

### Requirement 4 — Input validation

**User story:** As an athlete, I want clear feedback when I enter an invalid
time, so that the predictor doesn't silently produce nonsense.

#### Acceptance criteria

1. WHEN the time input contains a non-parseable or non-positive value THEN the
   system SHALL show an inline error message and SHALL NOT display a prediction
   table.
2. THE time input SHALL accept `M:SS`, `MM:SS`, `M:SS.T`, and `MM:SS.T` formats (minutes:seconds with optional tenths).

### Requirement 5 — Quality

**User story:** As the maintainer, I want the feature to meet rowplay's bar.

#### Acceptance criteria

1. The Paul's Law formula and status-classification logic SHALL be pure functions
   in a dedicated module and SHALL be covered by Vitest unit tests: formula
   accuracy (known Concept2 community equivalences), status boundaries, source
   distance identity, edge cases (zero/negative input rejected upstream).
2. Every user-visible string SHALL be added to all six locale files (en, zh, de,
   es, fr, ja) via `i18n.t()`.
3. The feature SHALL pass the full quality gate: `pnpm run check` (0 errors),
   `pnpm run build`, and `pnpm run test` (count must not decrease).
4. The feature SHALL work in demo mode with mock personal bests.
