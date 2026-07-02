/**
 * Calendar/time helpers built on the native Temporal API.
 *
 * This module intentionally does not import or install a Temporal polyfill and
 * does not fall back to the legacy JS clock. Runtimes must provide Temporal.
 */

/** Fixed zone for logbook wall-clock -> epoch (SSR/client must agree). */
const LOGBOOK_ZONE = "UTC";

const LOGBOOK_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export type LogbookDateTime = Temporal.PlainDateTime;

function parseDayKey(key: string): Temporal.PlainDate | null {
  const value = key.trim();
  if (!DAY_KEY_RE.test(value)) return null;
  try {
    return Temporal.PlainDate.from(value);
  } catch {
    return null;
  }
}

/** Concept2 logbook timestamps: `YYYY-MM-DD HH:MM:SS` (no offset). */
export function parseLogbookDateTime(text: string): Temporal.PlainDateTime | null {
  const value = text.trim();
  if (!LOGBOOK_RE.test(value)) return null;
  try {
    return Temporal.PlainDateTime.from(value.replace(" ", "T"));
  } catch {
    return null;
  }
}

/** Epoch milliseconds for sorting; logbook wall times interpreted as UTC. */
export function logbookEpochMillis(text: string): number {
  const pdt = parseLogbookDateTime(text);
  if (!pdt) return NaN;
  return pdt.toZonedDateTime(LOGBOOK_ZONE).epochMilliseconds;
}

/** ISO-8601 instant or RFC 3339 string -> epoch milliseconds. */
export function parseInstantMillis(text: string): number {
  try {
    return Temporal.Instant.from(text.trim()).epochMilliseconds;
  } catch {
    return NaN;
  }
}

export function nowEpochMillis(): number {
  return Temporal.Now.instant().epochMilliseconds;
}

/** `YYYY-MM-DD` one calendar day before a logbook date-time string.
 *  Returns null when the input cannot be parsed as a logbook date. */
export function overlapDate(date: string): string | null {
  const pdt = parseLogbookDateTime(date);
  if (pdt) return pdt.toPlainDate().subtract({ days: 1 }).toString();

  const day = parseDayKey(date);
  return day ? day.subtract({ days: 1 }).toString() : null;
}

/** Short locale date from a logbook string or ISO instant.
 * Accepts optional locale and timeZone for SSR-safe formatting;
 * defaults to the system timezone and locale when omitted. */
export function fmtDate(value: string, locale?: string, timeZone?: string): string {
  const cacheKey = `${value}\x00${locale ?? ""}\x00${timeZone ?? ""}`;
  const cached = fmtDateCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: string;
  try {
    result = Temporal.Instant.from(value)
      .toZonedDateTimeISO(timeZone ?? Temporal.Now.timeZoneId())
      .toLocaleString(locale, DATE_FMT);
  } catch {
    const pdt = parseLogbookDateTime(value);
    if (pdt) {
      result = pdt.toZonedDateTime(LOGBOOK_ZONE).toLocaleString(locale, DATE_FMT);
    } else {
      const day = parseDayKey(value);
      result = day ? day.toLocaleString(locale, DATE_FMT) : value;
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
  return pdt.toZonedDateTime(LOGBOOK_ZONE).toLocaleString(locale);
}

export function fmtDateFromEpochMillis(epochMs: number, locale?: string): string {
  try {
    return Temporal.Instant.fromEpochMilliseconds(epochMs)
      .toZonedDateTimeISO("UTC")
      .toLocaleString(locale, DATE_FMT);
  } catch {
    return "--";
  }
}

/** Today as a `YYYY-MM-DD` key in UTC (SSR and client agree on the boundary). */
export function todayKeyUtc(): string {
  return Temporal.Now.plainDateISO("UTC").toString();
}

function dayKeyInZone(
  pdt: Temporal.PlainDateTime,
  fromZone: string,
  toZone?: string,
): string | null {
  try {
    if (!toZone || toZone === fromZone) {
      return pdt.toPlainDate().toString();
    }
    return pdt.toZonedDateTime(fromZone).withTimeZone(toZone).toPlainDate().toString();
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
    const day = dayKeyInZone(pdt, cleanWtz, cleanHtz !== cleanWtz ? cleanHtz : undefined);
    if (day) return day;
  }
  return pdt.toPlainDate().toString();
}

/** Today as `YYYY-MM-DD` in the given IANA zone, or UTC when absent/invalid. */
export function todayKeyForTz(tz?: string): string {
  if (!tz?.trim()) return todayKeyUtc();
  try {
    return Temporal.Now.plainDateISO(tz.trim()).toString();
  } catch {
    return todayKeyUtc();
  }
}

/** `YYYY-MM-DD` day key -> UTC-midnight epoch milliseconds; NaN if unparseable. */
export function dayKeyEpochMillis(key: string): number {
  const day = parseDayKey(key);
  return day ? day.toZonedDateTime("UTC").epochMilliseconds : NaN;
}

export function addDaysToKey(key: string, days: number): string {
  const day = parseDayKey(key);
  return day ? day.add({ days }).toString() : key;
}

export function dayOfWeekUtc(key: string): number {
  const day = parseDayKey(key);
  return day ? day.dayOfWeek % 7 : 0;
}

export function dayOfYearUtc(key: string): number {
  const day = parseDayKey(key);
  return day ? day.dayOfYear : 0;
}

export function daysBetweenUtc(from: string, to: string): number {
  const fromDay = parseDayKey(from);
  const toDay = parseDayKey(to);
  if (!fromDay || !toDay) return 0;
  return Math.max(0, fromDay.until(toDay, { largestUnit: "day" }).days);
}

export function addMonthsToKey(key: string, months: number): string {
  const day = parseDayKey(key);
  return day ? day.add({ months }, { overflow: "constrain" }).toString() : key;
}

/** Current instant as an ISO-8601 string. */
export function nowIsoString(): string {
  return Temporal.Now.instant().toString();
}

/** Parse an ISO instant / RFC 3339 timestamp to a Temporal instant, or null. */
export function parseInstant(text: string): Temporal.Instant | null {
  try {
    return Temporal.Instant.from(text.trim());
  } catch {
    return null;
  }
}

/** ISO-8601 timestamp from logbook date + elapsed seconds, with invalid inputs falling back to now. */
export function logbookDatePlusSecondsIso(date: string, elapsedSec: number): string {
  const base = date.trim().replace(" ", "T");
  const withTz = base.includes("Z") || /[+-]\d{2}:\d{2}$/.test(base) ? base : `${base}Z`;
  const instant = parseInstant(withTz) ?? Temporal.Now.instant();
  return instant.add({ milliseconds: Math.round(elapsedSec * 1000) }).toString();
}

/** Current UTC calendar year. */
export function currentUtcYear(): number {
  return Temporal.Now.plainDateISO("UTC").year;
}

export function instantIsoFromEpochMillis(epochMs: number): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toString();
}

export function fmtTimeFromEpochMillis(
  epochMs: number,
  locale?: string,
  timeZone?: string,
): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMs)
    .toZonedDateTimeISO(timeZone || Temporal.Now.timeZoneId())
    .toLocaleString(locale, TIME_FMT);
}

export function monthShortName(month: number, locale?: string): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) return "";
  return Temporal.PlainDate.from({ year: 2000, month, day: 1 }).toLocaleString(locale, {
    month: "short",
  });
}
