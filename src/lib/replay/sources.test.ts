import { describe, expect, it } from 'vitest';
import { constantPaceGhost, parsePaceInput, parseWorkoutFile } from './sources';

// ---------------------------------------------------------------------------
// parsePaceInput
// ---------------------------------------------------------------------------

describe('parsePaceInput', () => {
	it('parses M:SS format', () => {
		expect(parsePaceInput('1:52')).toBe(112);
	});

	it('parses M:SS.t format with decimal seconds', () => {
		expect(parsePaceInput('1:52.5')).toBe(112.5);
	});

	it('parses a bare integer number of seconds', () => {
		expect(parsePaceInput('112')).toBe(112);
	});

	it('parses a bare decimal seconds value', () => {
		expect(parsePaceInput('90.5')).toBe(90.5);
	});

	it('parses with leading/trailing whitespace', () => {
		expect(parsePaceInput('  2:00  ')).toBe(120);
	});

	it('returns null for garbage input', () => {
		expect(parsePaceInput('abc')).toBeNull();
		expect(parsePaceInput('')).toBeNull();
	});

	it('returns null for zero value', () => {
		expect(parsePaceInput('0')).toBeNull();
		expect(parsePaceInput('0:00')).toBeNull();
	});

	it('returns null for seconds >= 60 in M:SS format', () => {
		expect(parsePaceInput('1:60')).toBeNull();
		expect(parsePaceInput('1:99')).toBeNull();
	});

	it('returns null for negative values', () => {
		expect(parsePaceInput('-1:30')).toBeNull();
	});

	it('parses common rowing paces correctly', () => {
		expect(parsePaceInput('2:00')).toBe(120);
		expect(parsePaceInput('1:40')).toBe(100);
		expect(parsePaceInput('1:30')).toBe(90);
	});
});

// ---------------------------------------------------------------------------
// constantPaceGhost
// ---------------------------------------------------------------------------

describe('constantPaceGhost', () => {
	it('returns exactly two strokes for a valid pace and distance', () => {
		const strokes = constantPaceGhost(120, 2000);
		expect(strokes).toHaveLength(2);
	});

	it('first stroke starts at t=0, d=0', () => {
		const strokes = constantPaceGhost(120, 2000);
		expect(strokes[0].t).toBe(0);
		expect(strokes[0].d).toBe(0);
	});

	it('last stroke ends at the correct total time', () => {
		// pace=120 sec/500m, distance=2000m → time = (2000/500)*120 = 480s
		const strokes = constantPaceGhost(120, 2000);
		expect(strokes[1].t).toBe(480);
		expect(strokes[1].d).toBe(2000);
	});

	it('uses the given pace throughout', () => {
		const strokes = constantPaceGhost(100, 5000);
		expect(strokes[0].pace).toBe(100);
		expect(strokes[1].pace).toBe(100);
	});

	it('computes non-zero watts from pace', () => {
		const strokes = constantPaceGhost(120, 2000);
		expect(strokes[0].watts).toBeGreaterThan(0);
	});

	it('sets spm to 0 (no real stroke data)', () => {
		const strokes = constantPaceGhost(120, 2000);
		expect(strokes[0].spm).toBe(0);
	});

	it('returns an empty array for zero or negative pace', () => {
		expect(constantPaceGhost(0, 2000)).toEqual([]);
		expect(constantPaceGhost(-1, 2000)).toEqual([]);
	});

	it('returns an empty array for zero or negative distance', () => {
		expect(constantPaceGhost(120, 0)).toEqual([]);
		expect(constantPaceGhost(120, -100)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// parseWorkoutFile — CSV
// ---------------------------------------------------------------------------

/** Build a minimal File object for testing without browser APIs. */
function makeTextFile(name: string, content: string): File {
	return new File([content], name, { type: 'text/plain' });
}

const CSV_CONTENT = `time,distance,pace,stroke_rate,heart_rate
0,0,2:00,28,140
10,50,1:58,30,145
20,100,1:56,32,150
`;

describe('parseWorkoutFile — CSV', () => {
	it('detects CSV by file extension and parses strokes', async () => {
		const file = makeTextFile('workout.csv', CSV_CONTENT);
		const { strokes, name } = await parseWorkoutFile(file);
		expect(name).toBe('workout.csv');
		expect(strokes.length).toBeGreaterThan(0);
	});

	it('returns strokes with t, d, pace populated', async () => {
		const file = makeTextFile('workout.csv', CSV_CONTENT);
		const { strokes } = await parseWorkoutFile(file);
		for (const s of strokes) {
			expect(Number.isFinite(s.t)).toBe(true);
			expect(Number.isFinite(s.d)).toBe(true);
			expect(s.d).toBeGreaterThanOrEqual(0);
		}
	});

	it('extracts heart rate from the HR column', async () => {
		const file = makeTextFile('workout.csv', CSV_CONTENT);
		const { strokes } = await parseWorkoutFile(file);
		const withHr = strokes.filter((s) => s.hr != null);
		expect(withHr.length).toBeGreaterThan(0);
	});

	it('extracts stroke rate from the cadence column', async () => {
		const file = makeTextFile('workout.csv', CSV_CONTENT);
		const { strokes } = await parseWorkoutFile(file);
		const withSpm = strokes.filter((s) => (s.spm ?? 0) > 0);
		expect(withSpm.length).toBeGreaterThan(0);
	});

	it('handles a CSV without pace column (derives pace from dist/time)', async () => {
		const noPace = `time,distance,heart_rate\n0,0,140\n10,50,145\n20,100,150\n`;
		const file = makeTextFile('no-pace.csv', noPace);
		const { strokes } = await parseWorkoutFile(file);
		expect(strokes.length).toBeGreaterThan(0);
		// pace should be computed
		for (const s of strokes.slice(1)) {
			expect(Number.isFinite(s.pace)).toBe(true);
		}
	});

	it('returns empty strokes for a CSV with missing required columns', async () => {
		const incomplete = `pace,heart_rate\n2:00,140\n1:58,145\n`;
		const file = makeTextFile('incomplete.csv', incomplete);
		const { strokes } = await parseWorkoutFile(file);
		expect(strokes).toHaveLength(0);
	});

	it('returns empty strokes for a single-line CSV (header only)', async () => {
		const file = makeTextFile('empty.csv', 'time,distance\n');
		const { strokes } = await parseWorkoutFile(file);
		expect(strokes).toHaveLength(0);
	});

	it('handles clock-format time values (M:SS)', async () => {
		const csv = `time,distance\n0:00,0\n0:10,50\n0:20,100\n`;
		const file = makeTextFile('clock.csv', csv);
		const { strokes } = await parseWorkoutFile(file);
		expect(strokes[1]?.t).toBe(10);
	});

	it('handles H:MM:SS clock format', async () => {
		const csv = `time,distance\n0:00:00,0\n0:00:10,50\n0:01:00,500\n`;
		const file = makeTextFile('long.csv', csv);
		const { strokes } = await parseWorkoutFile(file);
		expect(strokes[1]?.t).toBe(10);
		expect(strokes[2]?.t).toBe(60);
	});

	it('skips rows with non-numeric distance', async () => {
		const csv = `time,distance\n0,0\n10,n/a\n20,100\n`;
		const file = makeTextFile('bad.csv', csv);
		const { strokes } = await parseWorkoutFile(file);
		// Only rows with valid numerics are included
		expect(strokes.length).toBeLessThan(3);
	});

	it('returns the file name', async () => {
		const file = makeTextFile('my-session.csv', CSV_CONTENT);
		const { name } = await parseWorkoutFile(file);
		expect(name).toBe('my-session.csv');
	});
});

// ---------------------------------------------------------------------------
// parseWorkoutFile — FIT binary
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid FIT binary for testing.
 * Encodes 3 record messages with timestamp, distance, speed, and heart_rate fields.
 */
function buildFitBuffer(): ArrayBuffer {
	// FIT record (global 20) field definitions (little-endian):
	//   253 (timestamp):  uint32 (size 4, baseType 0x86)
	//   5   (distance):   uint32 (size 4, baseType 0x86)  scale=100 → m
	//   6   (speed):      uint16 (size 2, baseType 0x84)  scale=1000 → m/s
	//   3   (heart_rate): uint8  (size 1, baseType 0x02)
	const numFields = 4;
	const defBodySize = 5 + numFields * 3; // reserved(1) + arch(1) + global(2) + numFields(1) + fields
	const defMsgSize = 1 + defBodySize; // header byte + body

	const recordSize = 1 + 4 + 4 + 2 + 1; // header + ts(4) + dist(4) + speed(2) + hr(1)
	const numRecords = 3;
	const dataSize = defMsgSize + numRecords * recordSize;

	const buf = new ArrayBuffer(14 + dataSize);
	const dv = new DataView(buf);
	let pos = 0;

	// --- FIT file header (14 bytes) ---
	dv.setUint8(pos++, 14);           // headerSize
	dv.setUint8(pos++, 0x10);         // protocolVersion
	dv.setUint16(pos, 0x0800, true);  // profileVersion (little-endian)
	pos += 2;
	dv.setUint32(pos, dataSize, true); // dataSize (little-endian)
	pos += 4;
	dv.setUint8(pos++, 0x2e); // '.'
	dv.setUint8(pos++, 0x46); // 'F'
	dv.setUint8(pos++, 0x49); // 'I'
	dv.setUint8(pos++, 0x54); // 'T'
	dv.setUint16(pos, 0x0000, true); // header CRC (ignored)
	pos += 2;

	// --- Definition message (local 0, global 20 = record) ---
	dv.setUint8(pos++, 0x40);         // header: definition, local 0
	dv.setUint8(pos++, 0x00);         // reserved
	dv.setUint8(pos++, 0x00);         // architecture: little-endian
	dv.setUint16(pos, 20, true);       // global message number (record)
	pos += 2;
	dv.setUint8(pos++, numFields);    // number of fields

	// timestamp: field 253, size 4, uint32
	dv.setUint8(pos++, 253); dv.setUint8(pos++, 4); dv.setUint8(pos++, 0x86);
	// distance: field 5, size 4, uint32
	dv.setUint8(pos++, 5);   dv.setUint8(pos++, 4); dv.setUint8(pos++, 0x86);
	// speed: field 6, size 2, uint16
	dv.setUint8(pos++, 6);   dv.setUint8(pos++, 2); dv.setUint8(pos++, 0x84);
	// heart_rate: field 3, size 1, uint8
	dv.setUint8(pos++, 3);   dv.setUint8(pos++, 1); dv.setUint8(pos++, 0x02);

	// --- Data records ---
	// pace = 120 sec/500m → speed = 500/120 ≈ 4.167 m/s → stored as 4167
	const speed = 4167;
	const records = [
		{ ts: 1_000_000, dist: 0,      hr: 140 },
		{ ts: 1_000_010, dist: 50_00,  hr: 145 }, // 50m → dist * 100 = 5000
		{ ts: 1_000_020, dist: 100_00, hr: 150 }  // 100m → dist * 100 = 10000
	];

	for (const r of records) {
		dv.setUint8(pos++, 0x00); // data message header, local 0
		dv.setUint32(pos, r.ts, true);   pos += 4;
		dv.setUint32(pos, r.dist, true); pos += 4;
		dv.setUint16(pos, speed, true);  pos += 2;
		dv.setUint8(pos++, r.hr);
	}

	return buf;
}

describe('parseWorkoutFile — FIT', () => {
	it('parses a minimal FIT file and returns strokes', async () => {
		const buf = buildFitBuffer();
		const file = new File([buf], 'workout.fit');
		const { strokes, name } = await parseWorkoutFile(file);
		expect(name).toBe('workout.fit');
		expect(strokes.length).toBeGreaterThan(0);
	});

	it('produces monotonically non-decreasing time', async () => {
		const file = new File([buildFitBuffer()], 'workout.fit');
		const { strokes } = await parseWorkoutFile(file);
		for (let i = 1; i < strokes.length; i++) {
			expect(strokes[i].t).toBeGreaterThanOrEqual(strokes[i - 1].t);
		}
	});

	it('produces non-negative distances', async () => {
		const file = new File([buildFitBuffer()], 'workout.fit');
		const { strokes } = await parseWorkoutFile(file);
		for (const s of strokes) {
			expect(s.d).toBeGreaterThanOrEqual(0);
		}
	});

	it('extracts heart rate', async () => {
		const file = new File([buildFitBuffer()], 'workout.fit');
		const { strokes } = await parseWorkoutFile(file);
		const withHr = strokes.filter((s) => s.hr != null && s.hr > 0);
		expect(withHr.length).toBeGreaterThan(0);
	});

	it('returns empty strokes for an invalid FIT signature', async () => {
		const buf = new ArrayBuffer(20);
		const dv = new DataView(buf);
		dv.setUint8(0, 14);
		// Set wrong signature bytes
		dv.setUint8(8, 0x41); // 'A' — not '.FIT'
		const file = new File([buf], 'bad.fit');
		const { strokes } = await parseWorkoutFile(file);
		expect(strokes).toHaveLength(0);
	});

	it('returns empty strokes for a truncated FIT buffer', async () => {
		const file = new File([new ArrayBuffer(5)], 'tiny.fit');
		const { strokes } = await parseWorkoutFile(file);
		expect(strokes).toHaveLength(0);
	});
});
