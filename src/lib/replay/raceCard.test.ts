import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { downloadRaceCardPng, renderRaceCard, type RaceCardLabels } from "./raceCard";
import type { Stroke, WorkoutDetail } from "$lib/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

const labels: RaceCardLabels = {
  brand: "Ada",
  avgPower: "Avg power",
  avgHr: "Avg HR",
};

function detail(overrides: Partial<WorkoutDetail> = {}): WorkoutDetail {
  return {
    id: 42,
    date: "2026-05-01 06:00:00",
    sport: "rower",
    distance: 2000,
    time: 480,
    pace: 120,
    hasStrokeData: true,
    wattMinutes: 1600,
    heartRateAvg: 148,
    workoutType: "2000m",
    strokes: [
      { t: 0, d: 0, pace: 130, spm: 24, watts: 150 },
      { t: 240, d: 1000, pace: 0, spm: 0, watts: 0 },
      { t: 480, d: 2000, pace: 110, spm: 28, watts: 180 },
    ],
    splits: [],
    isInterval: false,
    ...overrides,
  };
}

function recordingCanvas(strokes: Stroke[] = detail().strokes) {
  const texts: string[] = [];
  let strokeCalls = 0;
  let blob: Blob | null = new Blob(["png"], { type: "image/png" });
  const ctx = {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left" as CanvasTextAlign,
    setTransform() {},
    fillRect() {},
    fillText(text: string) {
      texts.push(text);
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      strokeCalls += 1;
    },
    arc() {},
    fill() {},
  };
  const canvas = {
    width: 0,
    height: 0,
    style: {} as { width?: string; height?: string },
    getContext(kind: string) {
      return kind === "2d" ? ctx : null;
    },
    toBlob(callback: (value: Blob | null) => void, type?: string) {
      expect(type).toBe("image/png");
      callback(blob);
    },
  };
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    texts,
    strokeCount: () => strokeCalls,
    setBlob(next: Blob | null) {
      blob = next;
    },
    strokes,
  };
}

describe("renderRaceCard", () => {
  it("throws when the canvas has no 2d context", () => {
    const canvas = {
      getContext: () => null,
      style: {},
    } as unknown as HTMLCanvasElement;
    expect(() => renderRaceCard(canvas, detail(), "dark", labels)).toThrow(
      "2d context unavailable",
    );
  });

  it("draws the share stats at the 2× export size", () => {
    const recorded = recordingCanvas();
    renderRaceCard(recorded.canvas, detail(), "light", labels);

    expect(recorded.canvas.width).toBe(2160);
    expect(recorded.canvas.height).toBe(2700);
    expect(recorded.canvas.style.width).toBe("1080px");
    expect(recorded.canvas.style.height).toBe("1350px");
    expect(recorded.texts).toEqual(
      expect.arrayContaining([
        "Ada",
        "RACE BOARD",
        "2000m",
        "2.00 km",
        "8:00.0",
        "2:00.0/500m",
        "Avg power: 200 W",
        "Avg HR: 148 bpm",
        "YOU",
        "PACE",
      ]),
    );
    // Ten lane ticks plus one pace sparkline. The zero-pace sample is dropped.
    expect(recorded.strokeCount()).toBe(12);
  });

  it("falls back to the sport name and an em dash when type and heart rate are absent", () => {
    const recorded = recordingCanvas();
    renderRaceCard(
      recorded.canvas,
      detail({ workoutType: "", heartRateAvg: undefined, sport: "skierg" }),
      "dark",
      labels,
    );
    expect(recorded.texts).toContain("SkiErg");
    expect(recorded.texts).toContain("Avg HR: —");
  });

  it("skips the sparkline when fewer than two positive paces exist", () => {
    const strokes: Stroke[] = [
      { t: 0, d: 0, pace: 0, spm: 0, watts: 0 },
      { t: 10, d: 40, pace: -1, spm: 20, watts: 0 },
      { t: 20, d: 80, pace: 120, spm: 24, watts: 180 },
    ];
    const recorded = recordingCanvas(strokes);
    expect(() =>
      renderRaceCard(recorded.canvas, detail({ strokes }), "dark", labels),
    ).not.toThrow();
    expect(recorded.strokeCount()).toBe(11);
  });
});

describe("downloadRaceCardPng", () => {
  it("clicks a workout-named download and revokes the object URL", async () => {
    const recorded = recordingCanvas();
    const anchor = { href: "", download: "", click: vi.fn() };
    const revoked: string[] = [];
    vi.stubGlobal("document", {
      fonts: { ready: Promise.resolve() },
      createElement: (tag: string) => (tag === "a" ? anchor : recorded.canvas),
    });
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:card",
      revokeObjectURL: (url: string) => {
        revoked.push(url);
      },
    });

    await downloadRaceCardPng(detail(), "dark", labels);

    expect(anchor.href).toBe("blob:card");
    expect(anchor.download).toBe("rowplay-42-race-card.png");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(revoked).toEqual(["blob:card"]);
  });

  it("rejects when the canvas cannot encode a PNG", async () => {
    const recorded = recordingCanvas();
    recorded.setBlob(null);
    const anchor = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", {
      createElement: (tag: string) => (tag === "a" ? anchor : recorded.canvas),
    });

    await expect(downloadRaceCardPng(detail(), "light", labels)).rejects.toThrow(
      "Could not encode race card to PNG.",
    );
    expect(anchor.click).not.toHaveBeenCalled();
  });
});
