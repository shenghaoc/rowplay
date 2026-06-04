/** Paul's Law exponent (Concept2 community standard). */
export const PAUL_EXPONENT = 1.06;

/** Standard Concept2 race distances in metres. */
export const PREDICTOR_DISTANCES = [500, 1000, 2000, 5000, 6000, 10000, 21097] as const;

export type PredictorDistance = (typeof PREDICTOR_DISTANCES)[number];

export type PredictionStatus = 'beaten' | 'behind' | 'untried';

export interface PredictionRow {
	distance: PredictorDistance;
	predictedSeconds: number;
	actualBestSeconds: number | null;
	status: PredictionStatus;
}

/**
 * Apply Paul's Law from one known (distance, time) pair.
 * Returns predicted seconds for each standard distance; the source distance
 * maps to `knownSeconds` exactly.
 */
export function predictTimes(
	knownDistance: number,
	knownSeconds: number
): Map<PredictorDistance, number> {
	const out = new Map<PredictorDistance, number>();
	for (const d of PREDICTOR_DISTANCES) {
		if (d === knownDistance) {
			out.set(d, knownSeconds);
		} else {
			out.set(d, knownSeconds * Math.pow(d / knownDistance, PAUL_EXPONENT));
		}
	}
	return out;
}

function classifyStatus(predictedSeconds: number, actualBestSeconds: number | null): PredictionStatus {
	if (actualBestSeconds == null) return 'untried';
	if (actualBestSeconds < predictedSeconds) return 'beaten';
	return 'behind';
}

/**
 * Build the full prediction table with status by comparing predictions
 * against the athlete's personal bests (fastest time per distance wins).
 */
export function buildPredictionTable(
	knownDistance: number,
	knownSeconds: number,
	personalBests: Array<{ distance: number; time: number }>
): PredictionRow[] {
	const pbByDist = new Map<number, number>();
	for (const pb of personalBests) {
		const cur = pbByDist.get(pb.distance);
		if (cur == null || pb.time < cur) pbByDist.set(pb.distance, pb.time);
	}

	const predicted = predictTimes(knownDistance, knownSeconds);
	return PREDICTOR_DISTANCES.map((distance) => {
		const predictedSeconds = predicted.get(distance)!;
		const actualBestSeconds = pbByDist.get(distance) ?? null;
		return {
			distance,
			predictedSeconds,
			actualBestSeconds,
			status: classifyStatus(predictedSeconds, actualBestSeconds)
		};
	});
}
