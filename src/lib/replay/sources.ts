import type { Stroke } from "../types";
import { paceToWatts } from "../format";
import { parsePaceInput } from "../paceInput";
import { parseInstantMillis } from "../datetime";

export { parsePaceInput };

/**
 * Ghost "sources" for the replay comparison: a constant pace, or an uploaded
 * CSV / TCX / FIT file. Each resolves to a Stroke[] that the replay renders in
 * the ghost lane via the existing `sampleAt`.
 */

/**
 * A flat-pace pacer ghost over `totalDistance`. Two points suffice because
 * `sampleAt` interpolates linearly between samples.
 */
export function constantPaceGhost(pacePer500: number, totalDistance: number): Stroke[] {
  if (pacePer500 <= 0 || totalDistance <= 0) return [];
  const totalTime = (totalDistance / 500) * pacePer500;
  const watts = paceToWatts(pacePer500);
  return [
    { t: 0, d: 0, pace: pacePer500, spm: 0, watts },
    { t: totalTime, d: totalDistance, pace: pacePer500, spm: 0, watts },
  ];
}

export interface ParsedWorkout {
  strokes: Stroke[];
  name: string;
}

/** Detect the format by extension/content and parse into a ghost stroke array. */
export async function parseWorkoutFile(file: File): Promise<ParsedWorkout> {
  const name = file.name;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "fit") {
    return { strokes: finalize(parseFit(await file.arrayBuffer())), name };
  }
  const text = await file.text();
  if (ext === "tcx" || /<TrainingCenterDatabase|<Trackpoint/i.test(text)) {
    return { strokes: finalize(parseTcx(text)), name };
  }
  return { strokes: finalize(parseCsv(text)), name };
}

// ---- intermediate sample shape (before pace/watts are filled in) ----

interface RawSample {
  t: number;
  d: number;
  pace?: number;
  spm?: number;
  hr?: number;
  watts?: number;
}

/**
 * Turn loosely-parsed samples into clean strokes: sort by time, derive pace
 * from distance/time deltas where missing, and watts from pace.
 */
function finalize(raw: RawSample[]): Stroke[] {
  const pts = raw
    .filter((s) => isFinite(s.t) && isFinite(s.d) && s.d >= 0)
    .sort((a, b) => a.t - b.t);
  const out: Stroke[] = [];
  for (let i = 0; i < pts.length; i++) {
    const s = pts[i];
    let pace = s.pace;
    if (pace == null || !isFinite(pace) || pace <= 0) {
      const prev = pts[i - 1];
      const dd = prev ? s.d - prev.d : 0;
      const dt = prev ? s.t - prev.t : 0;
      pace = dd > 0 && dt > 0 ? dt / (dd / 500) : out.length ? out[out.length - 1].pace : 0;
    }
    const watts = s.watts != null && isFinite(s.watts) && s.watts > 0 ? s.watts : paceToWatts(pace);
    out.push({ t: s.t, d: s.d, pace, spm: s.spm ?? 0, hr: s.hr, watts });
  }
  return out;
}

// ---- CSV (flexible column detection) ----

function parseCsv(text: string): RawSample[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const header = splitCsv(lines[0]).map((h) => h.trim().toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const ti = find("time", "seconds", "elapsed");
  const di = find("distance", "meter", "metre");
  const pi = find("pace");
  const hi = find("heart", "hr", "bpm");
  // Prefer explicit stroke-rate names; fall back to a generic 'rate' column
  // only if it isn't the heart-rate column we already found.
  let si = find("stroke rate", "strokerate", "spm", "cadence");
  if (si < 0) {
    const rateIdx = header.findIndex((h) => h.includes("rate"));
    if (rateIdx >= 0 && rateIdx !== hi) si = rateIdx;
  }
  const wi = find("watt", "power");
  if (ti < 0 || di < 0) return [];

  const out: RawSample[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsv(lines[i]);
    const t = parseClock(c[ti]);
    const d = numOrNaN(c[di]);
    if (!isFinite(t) || !isFinite(d)) continue;
    const pace = pi >= 0 ? parseClock(c[pi]) : NaN;
    out.push({
      t,
      d,
      pace: isFinite(pace) && pace > 0 ? pace : undefined,
      spm: si >= 0 ? numOrUndef(c[si]) : undefined,
      hr: hi >= 0 ? numOrUndef(c[hi]) : undefined,
      watts: wi >= 0 ? numOrUndef(c[wi]) : undefined,
    });
  }
  return out;
}

function splitCsv(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

/** Numeric seconds, or an "M:SS(.t)" / "H:MM:SS" clock string, into seconds. */
function parseClock(v: string | undefined): number {
  if (v == null) return NaN;
  const s = v.trim();
  if (!s) return NaN;
  if (s.includes(":")) {
    const parts = s.split(":").map(Number);
    if (parts.some((p) => !isFinite(p))) return NaN;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

function numOrNaN(v: string | undefined): number {
  const n = parseFloat(v ?? "");
  return isFinite(n) ? n : NaN;
}
function numOrUndef(v: string | undefined): number | undefined {
  const n = parseFloat(v ?? "");
  return isFinite(n) ? n : undefined;
}

// ---- TCX (Garmin Training Center XML) ----

function parseTcx(text: string): RawSample[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return [];
  const tps = Array.from(doc.getElementsByTagNameNS("*", "Trackpoint"));
  const out: RawSample[] = [];
  let t0: number | null = null;
  for (const tp of tps) {
    const timeText = text1(tp, "Time") ?? "";
    let ms = parseInstantMillis(timeText);
    if (!isFinite(ms) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(timeText)) {
      // Fallback for timezone-less ISO strings, interpreting them as UTC.
      ms = parseInstantMillis(`${timeText}Z`);
    }
    if (isFinite(ms) && t0 == null) t0 = ms;
    const t = isFinite(ms) && t0 != null ? (ms - t0) / 1000 : NaN;
    const d = numOrNaN(text1(tp, "DistanceMeters"));
    if (!isFinite(t) || !isFinite(d)) continue;
    const hrEl = el1(tp, "HeartRateBpm");
    out.push({
      t,
      d,
      spm: numOrUndef(text1(tp, "Cadence")),
      hr: hrEl ? numOrUndef(text1(hrEl, "Value")) : undefined,
      watts: numOrUndef(text1(tp, "Watts")),
    });
  }
  return out;
}

function el1(parent: Element, name: string): Element | null {
  return parent.getElementsByTagNameNS("*", name)[0] ?? null;
}
function text1(parent: Element, name: string): string | undefined {
  return el1(parent, name)?.textContent?.trim() || undefined;
}

// ---- FIT (binary; minimal `record`-message decoder) ----

const FIT_RECORD = 20;

interface FieldDef {
  num: number;
  size: number;
  baseType: number;
}
interface MsgDef {
  global: number;
  le: boolean;
  fields: FieldDef[];
}
interface FitRecord {
  ts?: number;
  dist?: number;
  speed?: number;
  power?: number;
  cad?: number;
  hr?: number;
}

function parseFit(buf: ArrayBuffer): RawSample[] {
  const dv = new DataView(buf);
  if (dv.byteLength < 14) return [];
  const headerSize = dv.getUint8(0);
  const dataSize = dv.getUint32(4, true);
  const sig = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
  if (sig !== ".FIT") return [];

  const end = Math.min(dv.byteLength, headerSize + dataSize);
  const defs: Record<number, MsgDef> = {};
  const records: FitRecord[] = [];
  let pos = headerSize;

  while (pos < end) {
    const header = dv.getUint8(pos++);
    if (header & 0x80) {
      // Compressed-timestamp data message — skip it (timestamp lives in the
      // header; not needed for the common case).
      const def = defs[(header >> 5) & 0x3];
      if (!def) break;
      pos += def.fields.reduce((a, f) => a + f.size, 0);
      continue;
    }
    const local = header & 0x0f;
    if (header & 0x40) {
      // Definition message.
      const le = dv.getUint8(pos + 1) === 0;
      const global = dv.getUint16(pos + 2, le);
      const numFields = dv.getUint8(pos + 4);
      pos += 5;
      const fields: FieldDef[] = [];
      for (let i = 0; i < numFields; i++) {
        fields.push({
          num: dv.getUint8(pos),
          size: dv.getUint8(pos + 1),
          baseType: dv.getUint8(pos + 2),
        });
        pos += 3;
      }
      if (header & 0x20) {
        const numDev = dv.getUint8(pos++);
        for (let i = 0; i < numDev; i++) {
          fields.push({ num: -1, size: dv.getUint8(pos + 1), baseType: 0x0d });
          pos += 3;
        }
      }
      defs[local] = { global, le, fields };
    } else {
      // Data message.
      const def = defs[local];
      if (!def) break;
      const rec: FitRecord = {};
      for (const f of def.fields) {
        if (def.global === FIT_RECORD && f.num >= 0) {
          const v = readBase(dv, pos, f.baseType, def.le);
          if (v != null) assignRecordField(rec, f.num, v);
        }
        pos += f.size;
      }
      if (def.global === FIT_RECORD && rec.ts != null) records.push(rec);
    }
  }

  if (!records.length) return [];
  // reduce, not Math.min(...spread): a multi-hour/high-frequency FIT can have
  // 100k+ records and spreading them as args overflows the call stack.
  const ts0 = records.reduce((min, r) => Math.min(min, r.ts as number), Infinity);
  return records
    .map((r): RawSample => {
      const speed = r.speed != null ? r.speed / 1000 : undefined; // m/s
      return {
        t: (r.ts as number) - ts0,
        d: r.dist != null ? r.dist / 100 : NaN,
        pace: speed && speed > 0 ? 500 / speed : undefined,
        spm: r.cad,
        hr: r.hr,
        watts: r.power,
      };
    })
    .filter((s) => isFinite(s.t) && isFinite(s.d));
}

function assignRecordField(rec: FitRecord, num: number, v: number) {
  switch (num) {
    case 253:
      rec.ts = v;
      break; // timestamp (s since 1989)
    case 5:
      rec.dist = v;
      break; // distance, scale 100 -> m
    case 6:
      rec.speed = v;
      break; // speed, scale 1000 -> m/s
    case 73:
      if (rec.speed == null) rec.speed = v;
      break; // enhanced_speed
    case 7:
      rec.power = v;
      break; // watts
    case 4:
      rec.cad = v;
      break; // cadence / stroke rate
    case 3:
      rec.hr = v;
      break; // heart rate
  }
}

/** Read the first element of a FIT field; returns undefined for invalid values. */
function readBase(dv: DataView, pos: number, baseType: number, le: boolean): number | undefined {
  switch (baseType & 0x0f) {
    case 1: {
      const v = dv.getInt8(pos);
      return v === 0x7f ? undefined : v;
    }
    case 0:
    case 2:
    case 10:
    case 13: {
      const v = dv.getUint8(pos);
      return v === 0xff ? undefined : v;
    }
    case 3: {
      const v = dv.getInt16(pos, le);
      return v === 0x7fff ? undefined : v;
    }
    case 4:
    case 11: {
      const v = dv.getUint16(pos, le);
      return v === 0xffff ? undefined : v;
    }
    case 5: {
      const v = dv.getInt32(pos, le);
      return v === 0x7fffffff ? undefined : v;
    }
    case 6:
    case 12: {
      const v = dv.getUint32(pos, le) >>> 0;
      return v === 0xffffffff ? undefined : v;
    }
    case 8: {
      const v = dv.getFloat32(pos, le);
      return isNaN(v) ? undefined : v;
    }
    case 9: {
      const v = dv.getFloat64(pos, le);
      return isNaN(v) ? undefined : v;
    }
    default:
      return undefined; // strings / 64-bit ints: not needed here
  }
}
