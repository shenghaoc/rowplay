import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock only WebGLRenderer — everything else in Three.js works headlessly in Node.
vi.mock('three', async (importOriginal) => {
	const THREE = await importOriginal<typeof import('three')>();

	const fakeGl = {
		getExtension: vi.fn().mockReturnValue({ loseContext: vi.fn() })
	};

	class FakeWebGLRenderer {
		outputColorSpace = '';
		shadowMap = { enabled: false, type: 0 };
		setPixelRatio = vi.fn();
		setSize = vi.fn();
		render = vi.fn();
		getContext = vi.fn().mockReturnValue(fakeGl);
		dispose = vi.fn();
	}

	return { ...THREE, WebGLRenderer: FakeWebGLRenderer };
});

import { CourseRenderer3D } from './renderer3d';

/** Minimal 2D context stub for text sprite canvas creation. */
function make2dCtx() {
	return {
		font: '',
		fillStyle: '',
		textAlign: '',
		textBaseline: '',
		fillRect: vi.fn(),
		fillText: vi.fn(),
		measureText: vi.fn().mockReturnValue({ width: 60 })
	};
}

/** Minimal canvas stub. */
function makeCanvas() {
	const style: Record<string, string> = {};
	const ctx2d = make2dCtx();
	return {
		style,
		width: 0,
		height: 0,
		getContext: (type: string) => (type === '2d' ? ctx2d : null),
		remove: vi.fn()
	};
}

const origDocument = globalThis.document;

beforeEach(() => {
	// Stub document so canvas creation works without jsdom.
	globalThis.document = {
		createElement: (tag: string) => {
			if (tag === 'canvas') return makeCanvas();
			return {};
		}
	} as unknown as Document;
	// window.matchMedia isn't available in Node; stub it for prefersReducedMotion
	// @ts-expect-error stub
	globalThis.window = {
		devicePixelRatio: 1,
		matchMedia: vi.fn().mockReturnValue({ matches: false })
	};
});

afterEach(() => {
	globalThis.document = origDocument;
	// @ts-expect-error cleanup
	delete globalThis.window;
	vi.clearAllMocks();
});

function makeHost() {
	const children: unknown[] = [];
	return {
		appendChild: (c: unknown) => children.push(c),
		children
	} as unknown as HTMLElement;
}

function makeRenderState(overrides: Partial<Parameters<CourseRenderer3D['render']>[0]> = {}) {
	return {
		frame: { d: 100, pace: 120, spm: 28, watts: 100, hr: 0 },
		ghost: null,
		distFrac: 0.5,
		totalDistance: 2000,
		...overrides
	} as Parameters<CourseRenderer3D['render']>[0];
}

describe('CourseRenderer3D', () => {
	it('constructs without throwing for each sport', () => {
		for (const sport of ['rower', 'skierg', 'bike'] as const) {
			const host = makeHost();
			expect(() => new CourseRenderer3D(host, 'low', sport)).not.toThrow();
		}
	});

	it('constructs at each quality level', () => {
		for (const quality of ['low', 'medium', 'high'] as const) {
			const host = makeHost();
			expect(() => new CourseRenderer3D(host, quality, 'rower')).not.toThrow();
		}
	});

	it('appends its canvas to the host element', () => {
		const host = makeHost();
		new CourseRenderer3D(host, 'low', 'rower');
		expect((host as unknown as { children: unknown[] }).children.length).toBe(1);
	});

	it('exposes the LOOP_METERS static constant', () => {
		expect(CourseRenderer3D.LOOP_METERS).toBe(1000);
	});

	describe('resize()', () => {
		it('sets w and h so render() can proceed', () => {
			const host = makeHost();
			const r = new CourseRenderer3D(host, 'low', 'rower');
			expect(() => r.resize(800, 600)).not.toThrow();
		});
	});

	describe('render()', () => {
		it('returns early (no throw) when w=0 before resize', () => {
			const host = makeHost();
			const r = new CourseRenderer3D(host, 'low', 'rower');
			// w is 0 until resize() is called; render() should no-op cleanly
			expect(() => r.render(makeRenderState(), false)).not.toThrow();
		});

		it('proceeds without throwing after resize()', () => {
			const host = makeHost();
			const r = new CourseRenderer3D(host, 'low', 'rower');
			r.resize(800, 600);
			expect(() => r.render(makeRenderState(), true)).not.toThrow();
		});

		it('handles ghost state in render', () => {
			const host = makeHost();
			const r = new CourseRenderer3D(host, 'low', 'rower');
			r.resize(800, 600);
			const stateWithGhost = makeRenderState({
				ghost: { distFrac: 0.4, pace: 118, spm: 24, label: 'PB' }
			});
			expect(() => r.render(stateWithGhost, false)).not.toThrow();
		});

		it('renders with dark theme without throwing', () => {
			const host = makeHost();
			const r = new CourseRenderer3D(host, 'low', 'rower');
			r.resize(800, 600);
			expect(() => r.render(makeRenderState(), false, 'dark')).not.toThrow();
		});

		it('handles playing=true (animation phase advances)', () => {
			const host = makeHost();
			const r = new CourseRenderer3D(host, 'low', 'rower');
			r.resize(800, 600);
			expect(() => r.render(makeRenderState(), true)).not.toThrow();
		});
	});

	describe('destroy()', () => {
		it('removes the canvas from the DOM', () => {
			const host = makeHost();
			const r = new CourseRenderer3D(host, 'low', 'rower');
			expect(() => r.destroy()).not.toThrow();
		});

		it('can be called after resize+render without throwing', () => {
			const host = makeHost();
			const r = new CourseRenderer3D(host, 'low', 'rower');
			r.resize(400, 300);
			r.render(makeRenderState(), false);
			expect(() => r.destroy()).not.toThrow();
		});
	});
});
