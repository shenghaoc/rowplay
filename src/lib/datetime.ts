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

function dayKeyInZone(pdt: Temporal.PlainDateTime, tz: string): string | null {
	try {
		return pdt.toZonedDateTime(tz).toPlainDate().toString();
	} catch {
		return null;
	}
}

/**
 * Calendar day key for a workout using: workout tz → home tz → the logbook
 * timestamp's own date. The final fallback is NOT a UTC conversion — the
 * Concept2 `date` field is already monitor-local (the end-of-workout wall
 * clock), so its date part is the local calendar day when no IANA zone is known.
 * Never throws; invalid IANA strings fall through silently.
 */
export function workoutLocalDayKey(date: string, workoutTz?: string, homeTz?: string): string {
	const cleanWtz = workoutTz?.trim();
	const cleanHtz = homeTz?.trim();
	// Fast path: with no zone to apply, the logbook timestamp is already
	// monitor-local, so its date part is the answer — skip Temporal parsing and
	// allocation entirely (this is the overwhelming common case). The defensive
	// typeof guard also avoids a throw on a corrupt/missing date.
	if (!cleanWtz && !cleanHtz) return typeof date === 'string' ? date.slice(0, 10) : '';

	const pdt = parseLogbookDateTime(date);
	if (!pdt) return typeof date === 'string' ? date.slice(0, 10) : '';

	if (cleanWtz) {
		const key = dayKeyInZone(pdt, cleanWtz);
		if (key) return key;
	}
	if (cleanHtz) {
		const key = dayKeyInZone(pdt, cleanHtz);
		if (key) return key;
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

/** `YYYY-MM-DD` day key → UTC-midnight epoch milliseconds; NaN if unparseable. */
export function dayKeyEpochMillis(key: string): number {
	try {
		return Temporal.PlainDate.from(key).toZonedDateTime('UTC').epochMilliseconds;
	} catch {
		return NaN;
	}
}
