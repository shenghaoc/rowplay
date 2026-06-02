import { describe, expect, it } from 'vitest';
import { mockWorkoutDetail } from '../mockData';
import { redactForPublic } from './share';

describe('redactForPublic', () => {
	it('removes serial number and device from metadata', () => {
		const detail = mockWorkoutDetail(1005)!;
		expect(detail.metadata?.serialNumber).toBeTruthy();
		const redacted = redactForPublic(detail);
		expect(redacted.metadata?.serialNumber).toBeUndefined();
		expect(redacted.metadata?.device).toBeUndefined();
		expect(redacted.metadata?.deviceOs).toBeUndefined();
		expect(redacted.metadata?.deviceOsVersion).toBeUndefined();
		expect(redacted.metadata?.pmVersion).toBe(detail.metadata?.pmVersion);
	});

	it('leaves detail unchanged when metadata is absent', () => {
		const detail = mockWorkoutDetail(1001)!;
		expect(redactForPublic(detail).metadata).toBeUndefined();
	});
});
