# Full-fidelity Concept2 Data — Design

## Overview

This feature widens rowplay's capture of the Concept2 result model from a subset
to **full fidelity**, versions the cached detail payload, surfaces every captured
field, and adds analysis that the new fields make possible. It touches one
vertical slice end-to-end:

```
Concept2 API ──> concept2.ts (RawResult/RawSplit + mapResult/mapSplits)   [widen]
                      │
                      ▼
                 types.ts (Workout / Split / WorkoutDetail / Stroke)      [widen, optional]
                      │
        ┌─────────────┼───────────────────────────┐
        ▼             ▼                            ▼
   db.ts cache    analytics.ts                 detail / replay UI
 (PAYLOAD bump) (recovery, work:rest,         (metadata panel +
                 target-vs-actual)             richer splits) + /r privacy
```

No change to the replay **engine** or **renderer** seam — all new fields are
optional metadata/analysis, not stroke-timeline inputs. The `RenderState`
contract is untouched.

## Field gap (authoritative)

From the Logbook result model versus today's `RawResult` / `RawSplit` /
`RawStroke` in `concept2.ts`:

### Result level

| Field | Today | Action |
|---|---|---|
| `timezone` | dropped | capture |
| `weight_class` (`H`/`L`) | dropped | capture |
| `privacy` | dropped | capture (drives owner-only display) |
| `verified` | dropped | capture |
| `rest_time` (tenths) | dropped | capture → seconds |
| `rest_distance` (m) | dropped | capture |
| `heart_rate.ending` | dropped | capture |
| `heart_rate.recovery` | dropped | capture |
| `heart_rate.{average,min,max}` | kept | keep |
| `workout.targets {stroke_rate, heart_rate_zone, pace, watts, calories}` | dropped | capture (pace tenths→sec) |
| `metadata {pm_version, firmware_version, serial_number, device, device_os, device_os_version, erg_model_type, hr_type, other}` | dropped | capture |
| `stroke_rate, stroke_count, calories_total, wattminutes_total, drag_factor, workout_type, comments` | kept | keep |

### Split / interval level

| Field | Today | Action |
|---|---|---|
| `calories_total` | dropped | capture |
| `wattminutes_total` | dropped | capture |
| `heart_rate {average,min,max,ending,rest,recovery}` | only a scalar avg | capture full object |
| interval `type` (`time`/`distance`/`calorie`/`wattminute`) | dropped | capture |
| interval `rest_time` (tenths) | dropped | capture → seconds |
| interval `rest_distance` (m) | dropped | capture |
| interval `machine` (MultiErg) | dropped | capture |
| `distance, time, stroke_rate` | kept | keep |

### Stroke level

`RawStroke` (`t`, `d`, `p`, `spm`, `hr`) already covers the documented stroke
schema (`t` tenths, `d` decimetres, `p` pace tenths per-500m row/ski / per-1000m
bike, `spm`, `hr`). **No gap.** Task 1 only re-confirms this against a real
response; no widening expected.

## Type changes — `src/lib/types.ts`

All additions **optional** (Req 3.3). New shared shapes:

```ts
export interface HeartRateDetail {
    average?: number;
    min?: number;
    max?: number;
    ending?: number;   // bpm at the end of the effort
    rest?: number;     // bpm during rest (split-level)
    recovery?: number; // bpm after recovery window
}

export interface WorkoutTargets {
    strokeRate?: number;
    heartRateZone?: number; // 0–5
    pace?: number;          // sec / 500m (normalised from tenths)
    watts?: number;
    calories?: number;
}

export interface LoggingMetadata {
    pmVersion?: number;
    firmwareVersion?: string;
    serialNumber?: string;   // sensitive — never on public /r view (Req 6.1)
    device?: string;         // sensitive — owner-only
    deviceOs?: string;
    deviceOsVersion?: string;
    ergModelType?: number;   // 0=D/E/RowErg/Dynamic, 1=C/B, 2=A
    hrType?: 'BT' | 'ANT' | 'Apple' | string;
}
```

`Workout` gains (all optional): `timezone`, `weightClass` (`'H' | 'L'`),
`privacy`, `verified`, `restTime`, `restDistance`, `heartRate?: HeartRateDetail`
(supersedes the flat `heartRateAvg`/`hrMin`/`hrMax` — keep those as redundant
flat properties populated alongside `heartRate` for back-compat),
`targets?: WorkoutTargets`,
`metadata?: LoggingMetadata`.

`Split` gains (all optional): `caloriesTotal`, `wattMinutes`,
`heartRate?: HeartRateDetail`, `type?: 'time'|'distance'|'calorie'|'wattminute'`,
`restTime`, `restDistance`, `machine?: Sport`, and `isRest?: boolean` (Req 2.3).

> **Back-compat note:** keep `heartRateAvg`/`hrMin`/`hrMax` on `Workout` (the
> leaderboard, analytics, and gauges read them). Populate them from
> `heartRate` so no consumer breaks; new code reads the richer object.

## Mapping — `src/lib/server/concept2.ts`

- Extend `RawResult`, `RawSplit` with the new raw keys; add `RawTargets`,
  `RawMetadata`, and a richer `heart_rate` object type.
- `mapResult` / `mapSplits` populate the new optional fields, applying the
  existing unit conventions (`/10` tenths→seconds, decimetres→metres, bike
  pace halving). Absent → `undefined` (Req 1.4).
- Add small pure helpers (`mapHeartRate`, `mapTargets`, `mapMetadata`) kept in
  this file, mirroring the existing `avgHr`/`hrBound` style.

## Cache versioning — `src/lib/server/db.ts`

- Bump `DETAIL_PAYLOAD_VERSION` (Req 3.1). The existing
  `getCachedDetail` version-guard already re-hydrates on mismatch; confirm it
  fails closed (re-fetch) rather than rendering a partial old payload (Req 3.2).
- No D1 *schema* migration needed — detail payloads are stored as a versioned
  JSON blob, so the bump is the migration.

## Analysis — `src/lib/analytics.ts` (pure, tested)

New pure functions (DOM-free, fixture-tested per Req 5.4):

- `hrRecoveryTrend(details: WorkoutDetail[])` → per-session `{ date, ending, recovery, drop }`
  where `drop = ending - recovery`. `ending` / `recovery` come from the **detail**
  endpoint (or D1 detail cache after the athlete opens a workout), not the list
  endpoint — the trend is only available for previously hydrated workouts.
- `workRestEfficiency(detail)` → for interval pieces, work:rest ratio from
  `restTime`/`restDistance` (total + per interval) and average work pace vs the
  rest gap.
- `targetVsActual(detail)` → when `targets` present, compare achieved
  pace/watts/stroke-rate/HR-zone against the logged target, returning signed
  deltas + a hit/miss flag.

These slot beside existing pure analyses (`distancePBs`, CP/W′, power curve) and
are imported by the detail UI.

## UI — metadata panel + richer splits

- **Metadata panel** in `src/routes/replay/[id]/+page.svelte` (and the workout
  detail surface): a `<details>`-style "Full metrics" section listing every
  present field — HR ending/recovery + drop, rest time/distance, weight class,
  drag factor, watt-minutes, verified badge, targets (with target-vs-actual
  deltas), and a **provenance** sub-block (PM version, firmware, erg model, HR
  sensor type). Each row rendered only when its value is present (Req 4.3).
- **Splits/intervals**: extend the existing splits view to show per-split
  calories, watt-minutes, HR detail, and interval type + rest.
- All via `format.ts` + i18n (Req 4.4).

### Privacy on public replays (Req 6.1)

The shared loader (`loadSharedWorkout` in `server/share.ts`) feeds `/r/<token>`.
`getCachedDetailByShareToken` (`db.ts`) **intentionally skips** the
`payload_version` check so anonymous readers are not 404'd when the schema
bumps; old share snapshots therefore keep whatever fields were cached at share
time until the owner re-opens the workout. That is acceptable because all new
fields are optional.

`redactForPublic(detail)` **must** run inside `loadSharedWorkout` (not
optionally at call sites). Strip `serialNumber`, `device`, `deviceOs`, and
`deviceOsVersion` from metadata; keep non-identifying provenance (`pmVersion`,
`firmwareVersion`, `ergModelType`, `hrType`) when present. Unit-test redaction;
handle absent optional fields defensively.

### Targets scope

Result-level `workout.targets` is in scope for steady and fixed-interval pieces.
**Per-interval targets** on variable-interval workouts are **deferred** — only
piece-level `targets` are captured today; `targetVsActual` compares summary
metrics to that block.

### `isRest` on splits

Concept2 may return rest either as **separate** `intervals[]` elements
(`distance === 0`, `time > 0`) or only via `rest_time` / `rest_distance` on work
elements. Mapping sets `isRest` when a row has zero distance and positive time;
work:rest analysis also uses result-level `restTime` / `restDistance`.

## Demo data — `src/lib/mockData.ts`

Extend `mockWorkouts()` / `mockWorkoutDetail()` so demo mode exercises every new
field deterministically (Req 6.2): give at least one interval piece full
`heart_rate` (ending/recovery), `restTime`/`restDistance`, per-split detail,
`targets`, and a `metadata` block; give a steady piece the result-level HR
recovery. This keeps the metadata panel and the three analyses fully explorable
with zero credentials.

## Testing

- **Unit (`concept2.test.ts`)**: `mapResult`/`mapSplits` populate every new field
  with correct units; absent fields → `undefined`; bike pace halving still holds.
- **Unit (`analytics.test.ts`)**: `hrRecoveryTrend`, `workRestEfficiency`,
  `targetVsActual` against fixtures.
- **Unit (`share`/redaction)**: public detail omits `serialNumber`/`device`.
- **E2E**: in demo mode, open an interval replay, expand "Full metrics", assert
  HR-recovery + a target-vs-actual row render; open the same workout via a public
  `/r/<token>` link and assert no serial number / device is shown.

## Read schema verification (task 1)

Verified against the [Concept2 Logbook API documentation](https://log.concept2.com/developers/documentation/) (June 2026). A live token read was not available in this environment; findings below match the published create/read model and the `GET …/results/{id}?include=metadata` contract.

| Item | On read? | rowplay handling |
| --- | --- | --- |
| `workout.targets` (`stroke_rate`, `heart_rate_zone`, `pace`, `watts`, `calories`) | **Yes** — documented under workout details on list and detail responses | Capture when present; target-vs-actual is best-effort |
| Result `metadata` (`pm_version`, `firmware_version`, `serial_number`, `device`, …) | **Opt-in** — returned when `?include=metadata` is passed on `GET /api/users/me/results/{id}` | `getWorkout` requests `include=metadata`; absent → `undefined` |
| Rest in `intervals[]` | **Mixed** — validator examples show zero-distance rest rows; some pieces only expose `rest_time` on work rows | `isRest` when `distance === 0 && time > 0`; else use result-level rest fields |
| `erg_model_type` | **Yes** when metadata included | Numeric codes per Concept2 HTTP headers / BLE `OBJ_ERGMODELTYPE_T` (0=D/E/RowErg/Dynamic, 1=C/B, 2=A) — stored as-is |
| Stroke `stroke_data` | **Yes** (separate `/strokes` endpoint) | Unchanged — already complete |

**Downgrade:** Any field still missing on a given response remains `undefined` (Req 1.4); UI and analysis omit those rows.

## Out of scope (follow-ups)

- The three parked "go faster" specs (rival ghost, PB celebration, target
  pacer). Note: the captured **`targets`** here is the natural data source for
  the target-pacer's reference line — fold that in when the pacer is unparked.
- Force-curve / per-stroke power data (PM/CSAFE/Bluetooth only; ruled out).
- Charting HR-recovery / work:rest as their own dashboard widgets (this spec
  computes + shows them on the detail view; a dashboard trend card is a
  follow-up).
