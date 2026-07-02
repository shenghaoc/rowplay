/**
 * Calendar/date-time helpers for Workers-compatible runtimes.
 *
 * Keep parsing strict and route timezone work through Date/Intl so Workers,
 * browsers, and tests all share the same behavior without a polyfill.
 */

/** Fixed zone for logbook wall-clock -> epoch (SSR/client must agree). */
const LOGBOOK_ZONE = "UTC";

export interface LogbookDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const LOGBOOK_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_SECOND = 1000;
const MS_PER_DAY = 86_400_000;

function utcEpochMillis(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0, 0);
  return date.getTime();
}

function dateFromUtcParts(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): Date {
  return new Date(utcEpochMillis(parts));
}

function validParts(parts: LogbookDateTime): boolean {
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59
  ) {
    return false;
  }
  const date = dateFromUtcParts(parts);
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day &&
    date.getUTCHours() === parts.hour &&
    date.getUTCMinutes() === parts.minute &&
    date.getUTCSeconds() === parts.second
  );
}

function parseDayKey(key: string): Pick<LogbookDateTime, "year" | "month" | "day"> | null {
  const match = DAY_KEY_RE.exec(key.trim());
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const full = { ...parts, hour: 0, minute: 0, second: 0 };
  return validParts(full) ? parts : null;
}

/** Concept2 logbook timestamps: `YYYY-MM-DD HH:MM:SS` (no offset). */
export function parseLogbookDateTime(text: string): LogbookDateTime | null {
  const match = LOGBOOK_RE.exec(text.trim());
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  };
  return validParts(parts) ? parts : null;
}

/** Epoch milliseconds for sorting; logbook wall times interpreted as UTC. */
export function logbookEpochMillis(text: string): number {
  const pdt = parseLogbookDateTime(text);
  if (!pdt) return NaN;
  return utcEpochMillis(pdt);
}

/** ISO-8601 instant or RFC 3339 string -> epoch milliseconds. */
export function parseInstantMillis(text: string): number {
  const trimmed = text.trim();
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) return NaN;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : NaN;
}

export function nowEpochMillis(): number {
  return Date.now();
}

function isoDayFromEpoch(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function addDaysToParts(parts: Pick<LogbookDateTime, "year" | "month" | "day">, days: number) {
  return isoDayFromEpoch(utcEpochMillis({ ...parts }) + days * MS_PER_DAY);
}

/** `YYYY-MM-DD` one calendar day before a logbook date-time string.
 *  Returns null when the input cannot be parsed as a logbook date. */
export function overlapDate(date: string): string | null {
  const pdt = parseLogbookDateTime(date);
  if (pdt) return addDaysToParts(pdt, -1);
  const day = parseDayKey(date);
  return day ? addDaysToParts(day, -1) : null;
}

const DATE_FMT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

const fmtDateCache = new Map<string, string>();
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
  locale: string | undefined,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cacheKey = `${locale ?? ""}\x00${timeZone ?? ""}\x00${JSON.stringify(options)}`;
  const cached = formatterCache.get(cacheKey);
  if (cached) return cached;

  if (formatterCache.size > 100) {
    formatterCache.clear();
  }
  const formatter = new Intl.DateTimeFormat(locale, {
    ...options,
    ...(timeZone ? { timeZone } : {}),
  });
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

function formatDate(epochMs: number, locale?: string, timeZone = "UTC"): string {
  return getFormatter(locale, timeZone, DATE_FMT).format(new Date(epochMs));
}

/** Short locale date from a logbook string or ISO instant.
 * Accepts optional locale and timeZone for SSR-safe formatting;
 * defaults to the system timezone and locale when omitted. */
export function fmtDate(value: string, locale?: string, timeZone?: string): string {
  const cacheKey = `${value}\x00${locale ?? ""}\x00${timeZone ?? ""}`;
  const cached = fmtDateCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: string;
  const instantMs = parseInstantMillis(value);
  if (Number.isFinite(instantMs)) {
    result = formatDate(instantMs, locale, timeZone);
  } else {
    const pdt = parseLogbookDateTime(value);
    if (pdt) {
      result = formatDate(utcEpochMillis(pdt), locale, LOGBOOK_ZONE);
    } else {
      const day = parseDayKey(value);
      result = day ? formatDate(utcEpochMillis(day), locale, "UTC") : value;
    }
  }

  if (fmtDateCache.size > 1000) {
    fmtDateCache.clear();
  }
  fmtDateCache.set(cacheKey, result);
  return result;
}

/** Locale date-time from a logbook `YYYY-MM-DD HH:MM:SS` string. */
export function fmtLogbookDateTime(value: string, locale?: string): string {
  const pdt = parseLogbookDateTime(value);
  if (!pdt) return value;
  return getFormatter(locale, LOGBOOK_ZONE, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(utcEpochMillis(pdt)));
}

export function fmtDateFromEpochMillis(epochMs: number, locale?: string): string {
  if (!Number.isFinite(epochMs)) return "--";
  return formatDate(epochMs, locale, "UTC");
}

/** Today as a `YYYY-MM-DD` key in UTC (SSR and client agree on the boundary). */
export function todayKeyUtc(): string {
  return isoDayFromEpoch(Date.now());
}

function formatParts(epochMs: number, timeZone: string): LogbookDateTime {
  const formatter = getFormatter("en-US", timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(epochMs))) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function offsetMillisForZone(epochMs: number, timeZone: string): number {
  const parts = formatParts(epochMs, timeZone);
  return utcEpochMillis(parts) - epochMs;
}

function zonedWallTimeToEpochMillis(parts: LogbookDateTime, timeZone: string): number | null {
  try {
    let epoch = utcEpochMillis(parts);
    for (let i = 0; i < 3; i++) {
      const next = utcEpochMillis(parts) - offsetMillisForZone(epoch, timeZone);
      if (next === epoch) return epoch;
      epoch = next;
    }
    return epoch;
  } catch {
    return null;
  }
}

function dayKeyForEpochInZone(epochMs: number, timeZone: string): string | null {
  try {
    const parts = formatParts(epochMs, timeZone);
    return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

/**
 * Calendar day key for a workout using the resolution chain: workout tz -> home
 * tz -> plain-date fallback. The Concept2 `date` is monitor-local (confirmed in
 * the C2 API docs), so when `workoutTz` is known the date string is taken as
 * being in that zone - its plain-date portion is the workout's local day.
 * Cross-zone conversion is only applied when `homeTz` differs from `workoutTz`.
 * With no zone, the plain date part is used as-is. Never throws; invalid IANA
 * strings fall through silently.
 */
export function workoutLocalDayKey(date: string, workoutTz?: string, homeTz?: string): string {
  if (typeof date !== "string") return "";
  const cleanWtz = workoutTz?.trim();
  const cleanHtz = homeTz?.trim();
  if (!cleanWtz && !cleanHtz) return date.slice(0, 10);

  const pdt = parseLogbookDateTime(date);
  if (!pdt) return date.slice(0, 10);

  if (cleanWtz) {
    if (!cleanHtz || cleanHtz === cleanWtz) {
      return date.slice(0, 10);
    }
    const epoch = zonedWallTimeToEpochMillis(pdt, cleanWtz);
    if (epoch != null) {
      const day = dayKeyForEpochInZone(epoch, cleanHtz);
      if (day) return day;
    }
  }
  return date.slice(0, 10);
}

/** Today as `YYYY-MM-DD` in the given IANA zone, or UTC when absent/invalid. */
export function todayKeyForTz(tz?: string): string {
  if (!tz?.trim()) return todayKeyUtc();
  return dayKeyForEpochInZone(Date.now(), tz.trim()) ?? todayKeyUtc();
}

/** `YYYY-MM-DD` day key -> UTC-midnight epoch milliseconds; NaN if unparseable. */
export function dayKeyEpochMillis(key: string): number {
  const parts = parseDayKey(key);
  return parts ? utcEpochMillis(parts) : NaN;
}

export function addDaysToKey(key: string, days: number): string {
  const parts = parseDayKey(key);
  return parts ? addDaysToParts(parts, days) : key;
}

export function dayOfWeekUtc(key: string): number {
  const ms = dayKeyEpochMillis(key);
  return Number.isFinite(ms) ? new Date(ms).getUTCDay() : 0;
}

export function dayOfYearUtc(key: string): number {
  const parts = parseDayKey(key);
  if (!parts) return 0;
  const current = utcEpochMillis(parts);
  const start = utcEpochMillis({ year: parts.year, month: 1, day: 1 });
  return Math.floor((current - start) / MS_PER_DAY) + 1;
}

export function daysBetweenUtc(from: string, to: string): number {
  const fromMs = dayKeyEpochMillis(from);
  const toMs = dayKeyEpochMillis(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.max(0, Math.round((toMs - fromMs) / MS_PER_DAY));
}

export function addMonthsToKey(key: string, months: number): string {
  const parts = parseDayKey(key);
  if (!parts) return key;
  const monthIndex = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(monthIndex / 12);
  const month = (((monthIndex % 12) + 12) % 12) + 1;
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const lastDay = new Date(utcEpochMillis({ ...nextMonth, day: 1 }) - MS_PER_DAY).getUTCDate();
  const day = Math.min(parts.day, lastDay);
  return isoDayFromEpoch(utcEpochMillis({ year, month, day }));
}

/** Current instant as an ISO-8601 string. */
export function nowIsoString(): string {
  return new Date(Date.now()).toISOString();
}

/** Parse an ISO instant / RFC 3339 timestamp to a Date, or null. */
export function parseInstant(text: string): Date | null {
  const ms = parseInstantMillis(text);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** ISO-8601 timestamp from logbook date + elapsed seconds, with invalid inputs falling back to now. */
export function logbookDatePlusSecondsIso(date: string, elapsedSec: number): string {
  const base = date.trim().replace(" ", "T");
  const withTz = base.includes("Z") || /[+-]\d{2}:\d{2}$/.test(base) ? base : `${base}Z`;
  const ms = parseInstantMillis(withTz);
  const baseMs = Number.isFinite(ms) ? ms : Date.now();
  return new Date(baseMs + Math.round(elapsedSec * MS_PER_SECOND)).toISOString();
}

/** Current UTC calendar year. */
export function currentUtcYear(): number {
  return new Date(Date.now()).getUTCFullYear();
}

export function instantIsoFromEpochMillis(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

export function fmtTimeFromEpochMillis(
  epochMs: number,
  locale?: string,
  timeZone?: string,
): string {
  return getFormatter(locale, timeZone, TIME_FMT).format(new Date(epochMs));
}

export function monthShortName(month: number, locale?: string): string {
  return getFormatter(locale, "UTC", { month: "short" }).format(
    new Date(utcEpochMillis({ year: 2000, month, day: 1 })),
  );
}
