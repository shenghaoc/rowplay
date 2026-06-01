import type { Frame } from './engine';
import { fmtPace } from '../format';

// The replay playback itself is essential, user-initiated motion (the user
// presses play), so it is preserved under `prefers-reduced-motion`. What we do
// suppress is the *decorative* wake animation behind each avatar — a continuous
// sine wiggle that isn't conveying any data. One module-level MediaQueryList,
// read per frame: `.matches` updates live with the OS setting, so there's no
// per-frame allocation and no listener to leak.
const reducedMotionQuery =
	typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia('(prefers-reduced-motion: reduce)')
		: null;

function prefersReducedMotion(): boolean {
	return reducedMotionQuery?.matches ?? false;
}

interface CanvasColors {
	tickMajor: string;
	tickMinor: string;
	tickText: string;
	laneLine: string;
	bibFill: string;
	bibText: string;
	bibDot: string;
	finishDark: string;
	finishLight: string;
	labelBg: string;
	labelText: string;
	/** Lane panel background — the "paper" the course is drawn on. */
	courseFill: string;
	/** Live athlete accent (mirrors --live). */
	live: string;
	/** Ghost comparison accent (mirrors --ghost). */
	ghost: string;
}

// Canvas can't read CSS custom properties, so these mirror app.css. The
// `live`/`ghost` values in particular MUST stay in sync with `--live`/`--ghost`
// (light + dark) in app.css — `renderer.test.ts` parses app.css and fails if
// they drift. Exported for that test.
export const COLORS_LIGHT: CanvasColors = {
	tickMajor: '#bed0d7',
	tickMinor: '#d0dbdf',
	tickText: '#4a6470',
	laneLine: '#bed0d7',
	bibFill: '#f0f4f6',
	bibText: '#0f2a36',
	bibDot: '#f7fafb',
	finishDark: '#0f2a36',
	finishLight: '#f7fafb',
	labelBg: '#f7fafb',
	labelText: '#0f2a36',
	courseFill: '#e4ecef',
	live: '#5240ce',
	ghost: '#176b8c'
};

export const COLORS_DARK: CanvasColors = {
	tickMajor: '#3d505a',
	tickMinor: '#2e3d45',
	tickText: '#8aa2ac',
	laneLine: '#3d505a',
	bibFill: '#1c2a32',
	bibText: '#dce6ea',
	bibDot: '#0f2a36',
	finishDark: '#dce6ea',
	finishLight: '#0f2a36',
	labelBg: '#0f2a36',
	labelText: '#dce6ea',
	courseFill: '#142128',
	live: '#7b6de0',
	ghost: '#3aa8cc'
};

export interface AvatarState {
	/** Distance fraction 0..1 (position along the course). */
	distFrac: number;
	/** Pace label shown above the avatar. */
	pace: number;
	/** Stroke rate, drives the bob animation. */
	spm: number;
	/** Prefix shown above the ghost avatar (e.g. "PB", "2:00/500m", a filename). */
	label?: string;
}

export interface RenderState {
	frame: Frame;
	distFrac: number;
	totalDistance: number;
	/** Optional ghost (a past session being raced), drawn in its own lane. */
	ghost?: AvatarState;
}

/**
 * Draws the race-board course strip — warm paper lanes, ink ticks, vermilion YOU
 * and lake GHOST bibs. No gradients; structure from rules and spot colours.
 */
export class CourseRenderer {
	private ctx: CanvasRenderingContext2D;
	private dpr = 1;
	private w = 0;
	private h = 0;
	private phase = 0;
	private ghostPhase = 0;
	private colors: CanvasColors = COLORS_LIGHT;
	// Refreshed each render() from the OS setting; flattens the avatar wake.
	private reduceMotion = false;

	constructor(canvas: HTMLCanvasElement) {
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2d context unavailable');
		this.ctx = ctx;
	}

	resize(cssWidth: number, cssHeight: number) {
		this.dpr = Math.min(window.devicePixelRatio || 1, 2);
		this.w = cssWidth;
		this.h = cssHeight;
		const c = this.ctx.canvas;
		c.width = Math.round(cssWidth * this.dpr);
		c.height = Math.round(cssHeight * this.dpr);
		c.style.width = `${cssWidth}px`;
		c.style.height = `${cssHeight}px`;
		this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
	}

	render(state: RenderState, playing: boolean, themeName: 'light' | 'dark' = 'light') {
		const { ctx, w, h } = this;
		const C = themeName === 'dark' ? COLORS_DARK : COLORS_LIGHT;
		this.colors = C;
		if (w === 0) return;
		this.reduceMotion = prefersReducedMotion();
		// Advance the wake phase only while playing and only when motion is
		// allowed; otherwise the trail is drawn flat (amplitude 0 in drawLane).
		if (playing && !this.reduceMotion) {
			this.phase += 0.15 + state.frame.spm / 600;
			if (state.ghost) this.ghostPhase += 0.15 + state.ghost.spm / 600;
		}

		ctx.clearRect(0, 0, w, h);

		ctx.fillStyle = C.courseFill;
		roundRect(ctx, 0, 0, w, h, 3);
		ctx.fill();

		const padL = 58;
		const padR = 30;
		const startX = padL;
		const finishX = w - padR;
		const span = finishX - startX;

		const hasGhost = !!state.ghost;
		const playerY = hasGhost ? h * 0.7 : h * 0.56;
		const ghostY = h * 0.34;

		// Vertical distance ticks.
		ctx.font = '10px "Source Code Pro", ui-monospace, monospace';
		ctx.textAlign = 'center';
		for (let i = 0; i <= 10; i++) {
			const x = startX + (span * i) / 10;
			ctx.strokeStyle = i % 5 === 0 ? this.colors.tickMajor : this.colors.tickMinor;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(x, 14);
			ctx.lineTo(x, h - 22);
			ctx.stroke();
			if (i % 5 === 0 || i === 10) {
				ctx.fillStyle = this.colors.tickText;
				const m = Math.round((state.totalDistance * i) / 10);
				ctx.fillText(`${m}`, x, h - 8);
			}
		}

		this.drawFinishFlag(finishX, 14, h - 22);

		if (hasGhost && state.ghost) {
			this.drawLane(startX, span, ghostY, state.ghost.distFrac, C.ghost, this.ghostPhase, 'GHOST', padL);
			this.drawBib(
				startX + span * clamp01(state.ghost.distFrac),
				ghostY,
				`${state.ghost.label || 'PB'} · ${Math.round(state.ghost.distFrac * 100)}%`,
				C.ghost,
				false
			);
		}

		this.drawLane(startX, span, playerY, state.distFrac, C.live, this.phase, 'YOU', padL);
		this.drawBib(
			startX + span * clamp01(state.distFrac),
			playerY,
			`${fmtPace(state.frame.pace)} · ${Math.round(state.distFrac * 100)}%`,
			C.live,
			true
		);
	}

	private drawFinishFlag(x: number, y0: number, y1: number) {
		const ctx = this.ctx;
		const cell = 5;
		ctx.save();
		for (let yy = y0, r = 0; yy < y1; yy += cell, r++) {
			ctx.fillStyle = r % 2 === 0 ? this.colors.finishDark : this.colors.finishLight;
			ctx.fillRect(x - 2, yy, 4, cell);
		}
		ctx.restore();
	}

	private drawLane(
		startX: number,
		span: number,
		y: number,
		frac: number,
		color: string,
		phase: number,
		label: string,
		padL: number
	) {
		const ctx = this.ctx;
		const avX = startX + span * clamp01(frac);
		ctx.save();

		ctx.strokeStyle = this.colors.laneLine;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(startX, y);
		ctx.lineTo(startX + span, y);
		ctx.stroke();

		ctx.strokeStyle = color;
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(startX, y);
		const waveAmp = this.reduceMotion ? 0 : 1.2;
		for (let x = startX; x <= avX; x += 6) {
			ctx.lineTo(x, y + Math.sin((x - avX) * 0.18 + phase) * waveAmp);
		}
		ctx.stroke();

		ctx.fillStyle = color;
		ctx.fillRect(6, y - 9, padL - 16, 18);
		ctx.fillStyle = this.colors.labelBg;
		ctx.font = '700 10px "Source Code Pro", ui-monospace, monospace';
		ctx.textAlign = 'center';
		ctx.fillText(label, 6 + (padL - 16) / 2, y + 4);
		ctx.restore();
	}

	private drawBib(x: number, y: number, label: string, color: string, isYou: boolean) {
		const ctx = this.ctx;
		ctx.save();
		ctx.fillStyle = color;
		ctx.strokeStyle = isYou ? color : this.colors.labelText;
		ctx.lineWidth = isYou ? 2.5 : 2;
		ctx.beginPath();
		ctx.arc(x, y, 7, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		if (isYou) {
			ctx.fillStyle = this.colors.bibDot;
			ctx.beginPath();
			ctx.arc(x, y, 2.5, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.fillStyle = this.colors.labelBg;
			ctx.beginPath();
			ctx.arc(x, y, 2.5, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.font = '600 10px "Source Code Pro", ui-monospace, monospace';
		ctx.textAlign = 'center';
		const tw = ctx.measureText(label).width;
		const padX = 5;
		const pillH = 14;
		const pillY = y - 24;
		ctx.fillStyle = isYou ? this.colors.labelBg : color;
		ctx.fillRect(x - tw / 2 - padX, pillY, tw + padX * 2, pillH);
		ctx.fillStyle = isYou ? color : this.colors.labelBg;
		ctx.fillText(label, x, pillY + 10);
		ctx.restore();
	}
}

function clamp01(v: number) {
	return Math.max(0, Math.min(1, v));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}
