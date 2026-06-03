import { beforeAll, describe, expect, it } from 'vitest';
import { mapResult, mapStrokes, mapSplits } from './concept2';
import type { Split, Stroke } from '../types';
import rowerSteady from '../../../tests/fixtures/golden/rower-steady.fixture.json' with { type: 'json' };
import bikeSteady from '../../../tests/fixtures/golden/bike-steady.fixture.json' with { type: 'json' };
import skiSteady from '../../../tests/fixtures/golden/ski-steady.fixture.json' with { type: 'json' };
import rowerInterval from '../../../tests/fixtures/golden/rower-interval.fixture.json' with { type: 'json' };

type ExpectedStroke = Partial<Stroke> & { _index: number };
type ExpectedSplit = Partial<Split> & { _index: number };

interface GoldenFixture {
	description: string;
	rawResult: Parameters<typeof mapResult>[0];
	rawStrokes: { t: number; d: number; p: number; spm: number; hr?: number }[];
	expected: {
		result: Partial<ReturnType<typeof mapResult>>;
		strokes: ExpectedStroke[];
		splits: ExpectedSplit[];
	};
	_rep2FirstIndex?: number;
	_rep1FinalT?: number;
	_rep1FinalD?: number;
}

function assertStroke(actual: Stroke, expected: Partial<Stroke>) {
	if (expected.t != null) expect(actual.t).toBeCloseTo(expected.t, 3);
	if (expected.d != null) expect(actual.d).toBeCloseTo(expected.d, 3);
	if (expected.pace != null) expect(actual.pace).toBeCloseTo(expected.pace, 3);
	if (expected.rawT != null) expect(actual.rawT).toBeCloseTo(expected.rawT, 3);
	if (expected.rawD != null) expect(actual.rawD).toBeCloseTo(expected.rawD, 3);
}

function assertSplit(actual: Split, expected: Partial<Split>) {
	if (expected.time != null) expect(actual.time).toBeCloseTo(expected.time, 3);
	if (expected.distance != null) expect(actual.distance).toBe(expected.distance);
	if (expected.pace != null) expect(actual.pace).toBeCloseTo(expected.pace, 3);
}

function runGoldenSuite(name: string, fixture: GoldenFixture) {
	describe(`golden: ${name}`, () => {
		// Compute in beforeAll, not at describe/collection time: a throw here then
		// surfaces as a named test failure rather than a test-collection error.
		let result: ReturnType<typeof mapResult>;
		let strokes: Stroke[] = [];

		beforeAll(() => {
			result = mapResult(fixture.rawResult);
			if (fixture.rawStrokes.length > 0) {
				strokes = mapStrokes(fixture.rawStrokes, result.sport);
			}
		});

		it('mapResult normalises summary fields', () => {
			const exp = fixture.expected.result;
			if (exp.sport != null) expect(result.sport).toBe(exp.sport);
			if (exp.time != null) expect(result.time).toBeCloseTo(exp.time, 3);
			if (exp.distance != null) expect(result.distance).toBe(exp.distance);
			if (exp.pace != null) expect(result.pace).toBeCloseTo(exp.pace, 3);
			// Only assert metadata when the fixture pins it; otherwise assert absence.
			// A future full-fidelity fixture can add `expected.result.metadata`
			// without this hardcoded `toBeUndefined()` failing the whole suite.
			if ('metadata' in exp) {
				expect(result.metadata).toEqual(exp.metadata);
			} else {
				expect(result.metadata).toBeUndefined();
			}
		});

		if (fixture.rawStrokes.length > 0) {
			it('mapStrokes matches hand-verified key strokes', () => {
				for (const expected of fixture.expected.strokes) {
					const { _index, ...fields } = expected;
					const stroke = strokes[_index];
					expect(stroke, `stroke at index ${_index} should be defined`).toBeDefined();
					assertStroke(stroke, fields);
				}
			});
		}

		if (fixture.expected.splits.length > 0) {
			it('mapSplits matches hand-verified splits', () => {
				const splits = mapSplits(fixture.rawResult);
				for (const expected of fixture.expected.splits) {
					const { _index, ...fields } = expected;
					const split = splits[_index];
					expect(split, `split at index ${_index} should be defined`).toBeDefined();
					assertSplit(split, fields);
				}
			});
		}
	});
}

runGoldenSuite('rower-steady', rowerSteady as GoldenFixture);
runGoldenSuite('bike-steady', bikeSteady as GoldenFixture);
runGoldenSuite('ski-steady', skiSteady as GoldenFixture);
runGoldenSuite('rower-interval', rowerInterval as GoldenFixture);

describe('golden: bike-steady pace halving', () => {
	it('normalised pace is raw p / 10 / 2 (per-1000m to per-500m)', () => {
		const fixture = bikeSteady as GoldenFixture;
		const result = mapResult(fixture.rawResult);
		const strokes = mapStrokes(fixture.rawStrokes, result.sport);
		const rawP = fixture.rawStrokes[0].p;
		expect(strokes[0].pace).toBeCloseTo(rawP / 10 / 2, 3);
	});
});

describe('golden: rower-interval offset', () => {
	it('rep 2 first stroke applies rep 1 final t/d offset after wire reset', () => {
		const fixture = rowerInterval as GoldenFixture;
		const result = mapResult(fixture.rawResult);
		const strokes = mapStrokes(fixture.rawStrokes, result.sport);
		const rep2First = strokes[fixture._rep2FirstIndex!];
		expect(rep2First, `stroke at index ${fixture._rep2FirstIndex} should be defined`).toBeDefined();
		expect(rep2First.rawT).toBeCloseTo(0, 3);
		expect(rep2First.rawD).toBeCloseTo(0, 3);
		expect(rep2First.t).toBeCloseTo(fixture._rep1FinalT!, 3);
		expect(rep2First.d).toBeCloseTo(fixture._rep1FinalD!, 3);
	});
});
