import { describe, expect, it } from "vite-plus/test";
import {
  avgPowerWatts,
  durationChipActive,
  filterAndSortWorkouts,
  listQueryIsFiltered,
  parseWorkoutListQuery,
  pbWorkoutIds,
  serializeWorkoutListQuery,
  toggleDistanceChip,
  toggleDurationChip,
} from "./workoutQuery";
import { workout } from "../../tests/unit/fixtures";

const base = { sort: "date" as const, dir: "desc" as const };

describe("parseWorkoutListQuery", () => {
  it("returns defaults when params are empty", () => {
    const q = parseWorkoutListQuery(new URLSearchParams());
    expect(q.sort).toBe("date");
    expect(q.dir).toBe("desc");
    expect(q.sport).toBeUndefined();
  });

  it("parses sport filter", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("sport=rower"));
    expect(q.sport).toBe("rower");
  });

  it("ignores unknown sport values", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("sport=kayak"));
    expect(q.sport).toBeUndefined();
  });

  it("parses sort and dir", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("sort=pace&dir=asc"));
    expect(q.sort).toBe("pace");
    expect(q.dir).toBe("asc");
  });

  it("falls back to date sort for unknown sort field", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("sort=invalid"));
    expect(q.sort).toBe("date");
  });

  it("parses date range", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("from=2026-01-01&to=2026-06-01"));
    expect(q.dateFrom).toBe("2026-01-01");
    expect(q.dateTo).toBe("2026-06-01");
  });

  it("parses distance filter", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("dist=2000"));
    expect(q.distanceM).toBe(2000);
  });

  it("parses distance band key", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("band=r2000"));
    expect(q.distanceBandKey).toBe("r2000");
  });

  it("parses stroke filter", () => {
    expect(parseWorkoutListQuery(new URLSearchParams("stroke=1")).hasStroke).toBe(true);
    expect(parseWorkoutListQuery(new URLSearchParams("stroke=0")).hasStroke).toBe(false);
    expect(parseWorkoutListQuery(new URLSearchParams("stroke=true")).hasStroke).toBe(true);
    expect(parseWorkoutListQuery(new URLSearchParams("stroke=false")).hasStroke).toBe(false);
  });

  it("parses pbsOnly flag", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("pbs=1"));
    expect(q.pbsOnly).toBe(true);
  });

  it("parses duration filters", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("dmin=600&dmax=1200"));
    expect(q.durationMin).toBe(600);
    expect(q.durationMax).toBe(1200);
  });

  it("parses comment search", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("q=morning+row"));
    expect(q.q).toBe("morning row");
  });

  it("parses workout type", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("type=JustRow"));
    expect(q.workoutType).toBe("JustRow");
  });

  it("parses resolved workout tag", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("tag=race-piece"));
    expect(q.tag).toBe("race-piece");
  });

  it("ignores unknown workout tag values", () => {
    const q = parseWorkoutListQuery(new URLSearchParams("tag=sprint"));
    expect(q.tag).toBeUndefined();
  });
});

describe("serializeWorkoutListQuery", () => {
  it("omits default sort and dir", () => {
    const p = serializeWorkoutListQuery({ sort: "date", dir: "desc" });
    expect(p.get("sort")).toBeNull();
    expect(p.get("dir")).toBeNull();
  });

  it("includes non-default sort", () => {
    const p = serializeWorkoutListQuery({ sort: "pace", dir: "asc" });
    expect(p.get("sort")).toBe("pace");
    expect(p.get("dir")).toBe("asc");
  });

  it("round-trips through parseWorkoutListQuery", () => {
    const original = parseWorkoutListQuery(
      new URLSearchParams(
        "sport=bike&tag=interval&type=JustRow&sort=pace&dir=asc&from=2026-01-01&dist=2000&pbs=1",
      ),
    );
    const serialized = serializeWorkoutListQuery(original);
    const parsed = parseWorkoutListQuery(serialized);
    expect(parsed.sport).toBe(original.sport);
    expect(parsed.tag).toBe(original.tag);
    expect(parsed.workoutType).toBe(original.workoutType);
    expect(parsed.sort).toBe(original.sort);
    expect(parsed.dir).toBe(original.dir);
    expect(parsed.dateFrom).toBe(original.dateFrom);
    expect(parsed.distanceM).toBe(original.distanceM);
    expect(parsed.pbsOnly).toBe(original.pbsOnly);
  });
});

describe("listQueryIsFiltered", () => {
  it("returns false for a bare default query", () => {
    expect(listQueryIsFiltered(base)).toBe(false);
  });

  it("returns false for sport-only (sport is a tab, not a list filter)", () => {
    // listQueryIsFiltered intentionally excludes sport — it's a top-level tab,
    // not a list-level filter. Only workoutType/date/dist/etc. count.
    expect(listQueryIsFiltered({ ...base, sport: "rower" })).toBe(false);
  });

  it("returns true when dateFrom is set", () => {
    expect(listQueryIsFiltered({ ...base, dateFrom: "2026-01-01" })).toBe(true);
  });

  it("returns true when distanceM is set", () => {
    expect(listQueryIsFiltered({ ...base, distanceM: 2000 })).toBe(true);
  });

  it("returns true when pbsOnly is set", () => {
    expect(listQueryIsFiltered({ ...base, pbsOnly: true })).toBe(true);
  });

  it("returns true when resolved tag is set", () => {
    expect(listQueryIsFiltered({ ...base, tag: "time-trial" })).toBe(true);
  });
});

describe("filterAndSortWorkouts", () => {
  const w2k = workout({
    id: 1,
    distance: 2000,
    time: 480,
    sport: "rower",
    date: "2026-05-01 06:00:00",
  });
  const w5k = workout({
    id: 2,
    distance: 5000,
    time: 1200,
    sport: "rower",
    date: "2026-04-01 06:00:00",
  });
  const wBike = workout({
    id: 3,
    distance: 2000,
    time: 500,
    sport: "bike",
    date: "2026-03-01 06:00:00",
  });
  const all = [w2k, w5k, wBike];

  it("returns all workouts when no filters active", () => {
    expect(filterAndSortWorkouts(all, base)).toHaveLength(3);
  });

  it("filters by sport", () => {
    const result = filterAndSortWorkouts(all, { ...base, sport: "rower" });
    expect(result).toHaveLength(2);
    expect(result.every((w) => w.sport === "rower")).toBe(true);
  });

  it("filters by distance chip", () => {
    const result = filterAndSortWorkouts(all, { ...base, distanceM: 2000 });
    expect(result).toHaveLength(2);
  });

  it("filters by date range", () => {
    const result = filterAndSortWorkouts(all, {
      ...base,
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("filters by stroke data", () => {
    const wNoStroke = workout({ id: 4, hasStrokeData: false });
    const result = filterAndSortWorkouts([w2k, wNoStroke], { ...base, hasStroke: true });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("filters by comment search", () => {
    const wComment = workout({ id: 5, comments: "morning row session" });
    const result = filterAndSortWorkouts([w2k, wComment], { ...base, q: "morning" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(5);
  });

  it("sorts by date descending by default", () => {
    const result = filterAndSortWorkouts(all, base);
    expect(result[0].date > result[1].date).toBe(true);
  });

  it("sorts by date ascending", () => {
    const result = filterAndSortWorkouts(all, { ...base, dir: "asc" });
    expect(result[0].date < result[1].date).toBe(true);
  });

  it("sorts by distance", () => {
    const result = filterAndSortWorkouts(all, {
      ...base,
      sort: "distance",
      dir: "asc",
      sport: "rower",
    });
    expect(result[0].distance).toBeLessThanOrEqual(result[1].distance);
  });

  it("sorts by time", () => {
    const result = filterAndSortWorkouts(all, {
      ...base,
      sort: "time",
      dir: "asc",
      sport: "rower",
    });
    expect(result[0].time).toBeLessThanOrEqual(result[1].time);
  });

  it("filters by duration min/max", () => {
    const result = filterAndSortWorkouts(all, { ...base, durationMin: 1000, durationMax: 1400 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2); // 5k at 1200s
  });

  it("filters by workout type", () => {
    const wType = workout({ id: 6, workoutType: "JustRow" });
    const result = filterAndSortWorkouts([w2k, wType], { ...base, workoutType: "JustRow" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(6);
  });

  it("filters by resolved workout tag", () => {
    const tagged = workout({ id: 6, distance: 500, time: 100, pace: 100 });
    const other = workout({ id: 7, distance: 30_000, time: 2400, pace: 120 });
    const result = filterAndSortWorkouts([tagged, other], { ...base, tag: "race-piece" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(6);
  });

  it("filters pbsOnly using provided pbIds", () => {
    const pbIds = new Set([1]);
    const result = filterAndSortWorkouts(all, { ...base, pbsOnly: true }, pbIds);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("returns empty when pbsOnly but no pbIds", () => {
    const result = filterAndSortWorkouts(all, { ...base, pbsOnly: true }, new Set());
    expect(result).toHaveLength(0);
  });
});

describe("pbWorkoutIds", () => {
  it("identifies the fastest 2k workout", () => {
    const faster = workout({ id: 1, distance: 2000, time: 480, sport: "rower" });
    const slower = workout({ id: 2, distance: 2000, time: 500, sport: "rower" });
    const ids = pbWorkoutIds([faster, slower]);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(false);
  });

  it("identifies PBs at multiple standard distances", () => {
    const w2k = workout({ id: 1, distance: 2000, time: 480 });
    const w5k = workout({ id: 2, distance: 5000, time: 1200 });
    const ids = pbWorkoutIds([w2k, w5k]);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(true);
  });

  it("applies ±2% tolerance for distance matching", () => {
    const w = workout({ id: 1, distance: 2020, time: 480 }); // 1% over 2000
    const ids = pbWorkoutIds([w]);
    expect(ids.has(1)).toBe(true);
  });

  it("excludes workouts outside the tolerance", () => {
    const w = workout({ id: 1, distance: 2100, time: 480 }); // 5% over 2000
    const ids = pbWorkoutIds([w]);
    expect(ids.has(1)).toBe(false);
  });

  it("filters by sport when provided", () => {
    const rower = workout({ id: 1, distance: 2000, time: 480, sport: "rower" });
    const bike = workout({ id: 2, distance: 2000, time: 460, sport: "bike" });
    const ids = pbWorkoutIds([rower, bike], "rower");
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(false);
  });

  it("returns empty set for empty list", () => {
    expect(pbWorkoutIds([])).toEqual(new Set());
  });
});

describe("avgPowerWatts", () => {
  it("computes average power from wattMinutes and time", () => {
    const w = workout({ id: 1, wattMinutes: 80, time: 480 });
    expect(avgPowerWatts(w)).toBeCloseTo(10);
  });

  it("returns null when wattMinutes is missing", () => {
    const w = workout({ id: 1, wattMinutes: undefined, time: 480 });
    expect(avgPowerWatts(w)).toBeNull();
  });

  it("returns null when time is zero", () => {
    const w = workout({ id: 1, wattMinutes: 80, time: 0 });
    expect(avgPowerWatts(w)).toBeNull();
  });
});

describe("toggleDistanceChip", () => {
  it("sets distanceM when not active", () => {
    const result = toggleDistanceChip(base, 2000);
    expect(result.distanceM).toBe(2000);
  });

  it("clears distanceM when already active (toggle off)", () => {
    const q = { ...base, distanceM: 2000 };
    const result = toggleDistanceChip(q, 2000);
    expect(result.distanceM).toBeUndefined();
  });

  it("clears distanceBandKey when switching to chip", () => {
    const q = { ...base, distanceBandKey: "r2000" };
    const result = toggleDistanceChip(q, 2000);
    expect(result.distanceBandKey).toBeUndefined();
  });
});

describe("toggleDurationChip", () => {
  it("sets durationMin/Max when not active", () => {
    const result = toggleDurationChip(base, 1800);
    expect(result.durationMin).toBe(1620); // 1800 - 10%
    expect(result.durationMax).toBe(1980); // 1800 + 10%
  });

  it("clears duration when already active (toggle off)", () => {
    const q = toggleDurationChip(base, 1800);
    const result = toggleDurationChip(q, 1800);
    expect(result.durationMin).toBeUndefined();
    expect(result.durationMax).toBeUndefined();
  });
});

describe("durationChipActive", () => {
  it("returns true when the chip bounds match the query", () => {
    const q = toggleDurationChip(base, 1800);
    expect(durationChipActive(q, 1800)).toBe(true);
  });

  it("returns false when bounds do not match", () => {
    expect(durationChipActive(base, 1800)).toBe(false);
  });
});
