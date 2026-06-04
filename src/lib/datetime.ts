/**
 * Calendar/date-time helpers built on the Temporal API.
 * Call `ensureTemporal()` from hooks before SSR or client render.
 */

/** Fixed zone for logbook wall-clock → epoch (SSR/client must agree). */
const LOGBOOK_ZONE = 'UTC';

/** Concept2 logbook timestamps: `YYYY-MM-DD HH:MM:SS` (no offset). */
export function parseLogbookDateTime(text: string): Temporal.PlainDateTime | null {
	try {
		return Temporal.PlainDateTime.from(text.trim().replace(' ', 'T'));
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

/** ISO-8601 instant or RFC 3339 string → epoch milliseconds. */
export function parseInstantMillis(text: string): number {
	try {
		return Temporal.Instant.from(text).epochMilliseconds;
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
	if (!pdt) return null;
	return pdt.toPlainDate().subtract({ days: 1 }).toString();
}

const DATE_FMT: Intl.DateTimeFormatOptions = {
	year: 'numeric',
	month: 'short',
	day: 'numeric'
};

/** Short locale date from a logbook string or ISO instant.
 * Accepts optional locale and timeZone for SSR-safe formatting;
 * defaults to the system timezone and locale when omitted. */
export function fmtDate(value: string, locale?: string, timeZone?: string): string {
	// ISO instants have embedded timezone info — check them first so the
	// timezone offset is respected. parseLogbookDateTime uses PlainDateTime
	// which silently discards the offset.
	try {
		return Temporal.Instant.from(value)
			.toZonedDateTimeISO(timeZone ?? Temporal.Now.timeZoneId())
			.toLocaleString(locale, DATE_FMT);
	} catch {
		const pdt = parseLogbookDateTime(value);
		if (pdt) {
			return pdt.toLocaleString(locale, DATE_FMT);
		}
		try {
			return Temporal.PlainDate.from(value).toLocaleString(locale, DATE_FMT);
		} catch {
			return value;
		}
	}
}

/** Locale date-time from a logbook `YYYY-MM-DD HH:MM:SS` string. */
export function fmtLogbookDateTime(value: string, locale?: string): string {
	const pdt = parseLogbookDateTime(value);
	if (!pdt) return value;
	return pdt.toLocaleString(locale);
}

export function fmtDateFromEpochMillis(epochMs: number, locale?: string): string {
	try {
		return Temporal.Instant.fromEpochMilliseconds(epochMs)
			.toZonedDateTimeISO('UTC')
			.toLocaleString(locale, DATE_FMT);
	} catch {
		return '--';
	}
}

/** Today as a `YYYY-MM-DD` key in UTC (SSR and client agree on the boundary). */
export function todayKeyUtc(): string {
	return Temporal.Now.plainDateISO('UTC').toString();
}

/**
 * Convert a logbook PlainDateTime from `fromZone` into the calendar day in
 * `toZone` (or the same zone when `toZone` is omitted / identical).
 * The Concept2 `date` is monitor-local (confirmed in C2 API docs), so when
 * `fromZone` matches the workout's actual timezone the plain-date portion
 * *is* the workout's local day — no conversion needed for same-zone bucketing.
 */
function dayKeyInZone(pdt: Temporal.PlainDateTime, fromZone: string, toZone?: string): string | null {
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
 * Calendar day key for a workout using the resolution chain: workout tz → home
 * tz → plain-date fallback. The Concept2 `date` is monitor-local (confirmed in
 * the C2 API docs), so when `workoutTz` is known the date string is taken as
 * being in that zone — its plain-date portion *is* the workout's local day.
 * Cross-zone conversion is only applied when `homeTz` differs from `workoutTz`.
 * With no zone, the plain date part is used as-is. Never throws; invalid IANA
 * strings fall through silently.
 */
export function workoutLocalDayKey(date: string, workoutTz?: string, homeTz?: string): string {
	if (typeof date !== 'string') return '';
	const cleanWtz = workoutTz?.trim();
	const cleanHtz = homeTz?.trim();
	// Fast path: with no zone to convert into, the plain date part of the
	// offset-less timestamp is the best we can do — skip Temporal parsing and
	// allocation entirely (the overwhelming common case).
	if (!cleanWtz && !cleanHtz) return date.slice(0, 10);

	const pdt = parseLogbookDateTime(date);
	if (!pdt) return date.slice(0, 10);

	if (cleanWtz) {
		// Date IS in workoutTz (monitor-local). Bucket in homeTz when it differs.
		const day = dayKeyInZone(pdt, cleanWtz, cleanHtz !== cleanWtz ? cleanHtz : undefined);
		if (day) return day;
	}
	// Fall back to the plain date part — either only homeTz was given (no source
	// zone to convert from) or workoutTz was invalid.
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

/** `YYYY-MM-DD` day key → UTC-midnight epoch milliseconds; NaN if unparseable. */
export function dayKeyEpochMillis(key: string): number {
	try {
		return Temporal.PlainDate.from(key).toZonedDateTime('UTC').epochMilliseconds;
	} catch {
		return NaN;
	}
}
