/**
 * Calendar/date-time helpers built on the Temporal API.
 * Call `ensureTemporal()` from hooks before SSR or client render.
 */

/** Concept2 logbook timestamps: `YYYY-MM-DD HH:MM:SS` (no offset). */
export function parseLogbookDateTime(text: string): Temporal.PlainDateTime | null {
	try {
		return Temporal.PlainDateTime.from(text.trim().replace(' ', 'T'));
	} catch {
		return null;
	}
}

/** Epoch milliseconds for sorting; treats logbook times in the user's local zone. */
export function logbookEpochMillis(text: string): number {
	const pdt = parseLogbookDateTime(text);
	if (!pdt) return NaN;
	return pdt.toZonedDateTime(Temporal.Now.timeZoneId()).epochMilliseconds;
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

/** `YYYY-MM-DD` one calendar day before a logbook date-time string. */
export function overlapDate(date: string): string {
	const pdt = parseLogbookDateTime(date);
	if (!pdt) return date.slice(0, 10);
	return pdt.toPlainDate().subtract({ days: 1 }).toString();
}

/** Short locale date from a logbook string or ISO instant. */
export function fmtDate(value: string): string {
	const pdt = parseLogbookDateTime(value);
	if (pdt) {
		return logbookToZoned(pdt).toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
	try {
		return Temporal.Instant.from(value)
			.toZonedDateTimeISO(Temporal.Now.timeZoneId())
			.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	} catch {
		return value;
	}
}

/** Locale date-time from a logbook `YYYY-MM-DD HH:MM:SS` string. */
export function fmtLogbookDateTime(value: string): string {
	const pdt = parseLogbookDateTime(value);
	if (!pdt) return value;
	return logbookToZoned(pdt).toLocaleString();
}

export function fmtDateFromEpochMillis(epochMs: number): string {
	return fmtDate(Temporal.Instant.fromEpochMilliseconds(epochMs).toString());
}

function logbookToZoned(pdt: Temporal.PlainDateTime): Temporal.ZonedDateTime {
	return pdt.toZonedDateTime(Temporal.Now.timeZoneId());
}
