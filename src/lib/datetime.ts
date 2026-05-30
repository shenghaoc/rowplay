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

/** Short locale date from a logbook string or ISO instant. */
export function fmtDate(value: string): string {
	const pdt = parseLogbookDateTime(value);
	if (pdt) {
		return pdt.toLocaleString(undefined, DATE_FMT);
	}
	try {
		return Temporal.Instant.from(value)
			.toZonedDateTimeISO(Temporal.Now.timeZoneId())
			.toLocaleString(undefined, DATE_FMT);
	} catch {
		try {
			return Temporal.PlainDate.from(value).toLocaleString(undefined, DATE_FMT);
		} catch {
			return value;
		}
	}
}

/** Locale date-time from a logbook `YYYY-MM-DD HH:MM:SS` string. */
export function fmtLogbookDateTime(value: string): string {
	const pdt = parseLogbookDateTime(value);
	if (!pdt) return value;
	return pdt.toLocaleString();
}

export function fmtDateFromEpochMillis(epochMs: number): string {
	return Temporal.Instant.fromEpochMilliseconds(epochMs)
		.toZonedDateTimeISO('UTC')
		.toLocaleString(undefined, DATE_FMT);
}
