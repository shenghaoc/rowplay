import type { Sport, Stroke, Workout, WorkoutDetail } from '../types';

/** Escape a CSV field (RFC 4180). */
function csvCell(value: string | number | boolean | null | undefined): string {
	if (value == null || value === '') return '';
	const s = String(value);
	if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

const CSV_HEADERS = [
	'id',
	'date',
	'sport',
	'distance_m',
	'time_s',
	'pace_s_per_500m',
	'stroke_rate',
	'stroke_count',
	'heart_rate_avg',
	'hr_min',
	'hr_max',
	'calories',
	'watt_minutes',
	'drag_factor',
	'workout_type',
	'comments',
	'has_stroke_data'
] as const;

/** Full logbook export as CSV (one row per workout). */
export function workoutsToCsv(workouts: Workout[]): string {
	const lines = [CSV_HEADERS.join(',')];
	for (const w of workouts) {
		lines.push(
			[
				w.id,
				w.date,
				w.sport,
				w.distance,
				w.time,
				w.pace,
				w.strokeRate ?? '',
				w.strokeCount ?? '',
				w.heartRateAvg ?? '',
				w.hrMin ?? '',
				w.hrMax ?? '',
				w.caloriesTotal ?? '',
				w.wattMinutes ?? '',
				w.dragFactor ?? '',
				w.workoutType ?? '',
				w.comments ?? '',
				w.hasStrokeData ? 1 : 0
			]
				.map(csvCell)
				.join(',')
		);
	}
	return lines.join('\n') + '\n';
}

/** Full logbook export as JSON (array of workout summaries). */
export function workoutsToJson(workouts: Workout[]): string {
	return JSON.stringify(
		workouts.map((w) => ({
			id: w.id,
			date: w.date,
			sport: w.sport,
			distance: w.distance,
			time: w.time,
			pace: w.pace,
			strokeRate: w.strokeRate,
			strokeCount: w.strokeCount,
			heartRateAvg: w.heartRateAvg,
			hrMin: w.hrMin,
			hrMax: w.hrMax,
			caloriesTotal: w.caloriesTotal,
			wattMinutes: w.wattMinutes,
			dragFactor: w.dragFactor,
			workoutType: w.workoutType,
			comments: w.comments,
			hasStrokeData: w.hasStrokeData
		})),
		null,
		2
	);
}

function xmlEscape(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** ISO-8601 UTC timestamp for TCX Time elements from logbook date + elapsed seconds. */
function tcxTime(date: string, elapsedSec: number): string {
	const base = date.trim().replace(' ', 'T');
	const withTz = base.includes('Z') || /[+-]\d{2}:\d{2}$/.test(base) ? base : `${base}Z`;
	const ms = Date.parse(withTz);
	if (!isFinite(ms)) return new Date().toISOString();
	return new Date(ms + elapsedSec * 1000).toISOString();
}

const SPORT_TCX: Record<Sport, string> = {
	rower: 'Other',
	skierg: 'Other',
	bike: 'Biking'
};

/** Minimal TCX 2 with per-stroke trackpoints for Garmin / Strava import. */
export function workoutDetailToTcx(detail: WorkoutDetail): string {
	const name = detail.workoutType || `rowplay ${detail.id}`;
	const sport = SPORT_TCX[detail.sport];
	const start = tcxTime(detail.date, 0);
	let elapsed = 0;
	const laps =
		detail.splits.length > 0
			? detail.splits
					.map((s) => {
						const lapStart = tcxTime(detail.date, elapsed);
						elapsed += s.time;
						return `
        <Lap StartTime="${xmlEscape(lapStart)}">
          <TotalTimeSeconds>${s.time.toFixed(1)}</TotalTimeSeconds>
          <DistanceMeters>${s.distance}</DistanceMeters>
          <MaximumSpeed>${s.pace > 0 ? (500 / s.pace).toFixed(3) : 0}</MaximumSpeed>
          <Calories>0</Calories>
          <Intensity>Active</Intensity>
          <TriggerMethod>Manual</TriggerMethod>
        </Lap>`;
					})
					.join('')
			: `
        <Lap StartTime="${xmlEscape(start)}">
          <TotalTimeSeconds>${detail.time}</TotalTimeSeconds>
          <DistanceMeters>${detail.distance}</DistanceMeters>
          <Intensity>Active</Intensity>
          <TriggerMethod>Manual</TriggerMethod>
        </Lap>`;

	const trackpoints = strokeTrackpoints(detail.date, detail.strokes);

	return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="${sport}">
      <Id>${xmlEscape(start)}</Id>
      <Name>${xmlEscape(name)}</Name>${laps}
      <Track>${trackpoints}
      </Track>
    </Activity>
  </Activities>
</TrainingCenterDatabase>
`;
}

function strokeTrackpoints(date: string, strokes: Stroke[]): string {
	if (!strokes.length) return '';
	return strokes
		.map((s) => {
			const parts = [
				`<Time>${xmlEscape(tcxTime(date, s.t))}</Time>`,
				`<DistanceMeters>${s.d.toFixed(1)}</DistanceMeters>`
			];
			if (s.spm > 0) parts.push(`<Cadence>${Math.round(s.spm)}</Cadence>`);
			if (s.hr != null && s.hr > 0) parts.push(`<HeartRateBpm><Value>${s.hr}</Value></HeartRateBpm>`);
			if (s.watts > 0) parts.push(`<Extensions><TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Watts>${Math.round(s.watts)}</Watts></TPX></Extensions>`);
			return `\n        <Trackpoint>${parts.join('')}</Trackpoint>`;
		})
		.join('');
}

export function exportFilename(ext: string): string {
	const day = new Date().toISOString().slice(0, 10);
	return `rowplay-logbook-${day}.${ext}`;
}

export function workoutExportFilename(id: number, ext: string): string {
	return `rowplay-workout-${id}.${ext}`;
}
