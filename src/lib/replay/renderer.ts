import type { Frame } from './engine';
import type { Sport } from '../types';
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
	/** Strip background top (sky gradient top). */
	skyTop: string;
	/** Strip background bottom (sky gradient bottom). */
	skyBottom: string;
	/** Buoy dot at tick × waterline. */
	markerCap: string;
	/** Bow wave / pod highlight. */
	foam: string;
	/** Pod cast shadow base (rgba mix). */
	shadow: string;
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
	ghost: '#176b8c',
	skyTop: '#f2f7f9',
	skyBottom: '#e3edf1',
	markerCap: '#9fb8c2',
	foam: '#ffffff',
	shadow: '#0f2a36'
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
	live: '#8c7cf0',
	ghost: '#3aa8cc',
	skyTop: '#0e1d26',
	skyBottom: '#0a151c',
	markerCap: '#3d505a',
	foam: '#bcd3dd',
	shadow: '#000000'
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
	/** Optional sport, used for the avatar pod glyph. Renderer degrades to a neutral marker when absent. */
	sport?: Sport;
}

/** Shared contract for 2D canvas and lazy-loaded 3D WebGL renderers. */
export interface ReplayRenderer {
	render(state: RenderState, playing: boolean, theme: 'light' | 'dark'): void;
	resize(cssWidth: number, cssHeight: number): void;
	destroy(): void;
}

// ── Constants ───────────────────────────────────────────────────────────────
const PAD_L = 58;
const PAD_R = 30;
const WATER_H = 34;
const POD_R = 9;
const BOB_AMP = 2.2;

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(v: number) {
	return Math.max(0, Math.min(1, v));
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

/**
 * Convert `#rgb` or `#rrggbb` to `rgba(r,g,b,a)`.
 * Pure, no allocation concerns.
 */
function withAlpha(hex: string, a: number): string {
	let r = 0,
		g = 0,
		b = 0;
	const h = hex.replace('#', '');
	if (h.length === 3) {
		r = parseInt(h[0] + h[0], 16);
		g = parseInt(h[1] + h[1], 16);
		b = parseInt(h[2] + h[2], 16);
	} else {
		r = parseInt(h.slice(0, 2), 16);
		g = parseInt(h.slice(2, 4), 16);
		b = parseInt(h.slice(4, 6), 16);
	}
	return `rgba(${r},${g},${b},${a})`;
}

/**
 * Map pace (seconds per 500m) to a speed-streak length.
 * Faster (smaller pace) => longer streak. Clamped to [6, 22].
 * Safe for pace === 0 or NaN.
 */
function streakLen(pace: number): number {
	if (!pace || !isFinite(pace)) return 6;
	// Reference range: 90s/500m (sprint) -> 22, 200s/500m (slow) -> 6
	const clamped = Math.max(90, Math.min(200, pace));
	const t = (clamped - 90) / (200 - 90); // 0 = fast, 1 = slow
	return 22 - t * (22 - 6); // 22 down to 6
}

// ── Sport glyph ──────────────────────────────────────────────────────────────

function drawSportGlyph(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	sport: Sport | undefined,
	color: string
) {
	ctx.save();
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.lineWidth = 1.2;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	const s = POD_R * 1.0; // glyph scale, fits within ~POD_R*1.2

	switch (sport) {
		case 'rower': {
			// Sailboat: hull arc + mast + triangular sail
			// Hull — shallow arc below cy
			ctx.beginPath();
			ctx.moveTo(cx - s * 0.7, cy + s * 0.15);
			ctx.quadraticCurveTo(cx, cy + s * 0.6, cx + s * 0.7, cy + s * 0.15);
			ctx.stroke();
			// Mast — vertical line
			ctx.beginPath();
			ctx.moveTo(cx - s * 0.05, cy + s * 0.1);
			ctx.lineTo(cx - s * 0.05, cy - s * 0.75);
			ctx.stroke();
			// Sail — right-leaning triangle
			ctx.beginPath();
			ctx.moveTo(cx - s * 0.05, cy - s * 0.75);
			ctx.lineTo(cx + s * 0.65, cy - s * 0.05);
			ctx.lineTo(cx - s * 0.05, cy - s * 0.05);
			ctx.closePath();
			ctx.save();
			ctx.globalAlpha *= 0.5;
			ctx.fill();
			ctx.restore();
			ctx.stroke();
			break;
		}
		case 'skierg': {
			// Snowflake: 3 lines at 0°/60°/120° with tiny end barbs
			const angles = [0, Math.PI / 3, (2 * Math.PI) / 3];
			const armLen = s * 0.72;
			const barbLen = s * 0.22;
			const barbAngle = Math.PI / 4;
			for (const angle of angles) {
				for (const sign of [1, -1]) {
					const ax = cx + Math.cos(angle) * armLen * sign;
					const ay = cy + Math.sin(angle) * armLen * sign;
					ctx.beginPath();
					ctx.moveTo(cx, cy);
					ctx.lineTo(ax, ay);
					ctx.stroke();
					// Two barbs at each end
					for (const bSign of [1, -1]) {
						const ba = angle + Math.PI / 2 + (sign > 0 ? 0 : Math.PI);
						ctx.beginPath();
						ctx.moveTo(ax, ay);
						ctx.lineTo(
							ax + Math.cos(ba + barbAngle * bSign) * barbLen,
							ay + Math.sin(ba + barbAngle * bSign) * barbLen
						);
						ctx.stroke();
					}
				}
			}
			break;
		}
		case 'bike': {
			// Bike: two small wheels + frame stroke
			const wheelR = s * 0.32;
			const leftX = cx - s * 0.45;
			const rightX = cx + s * 0.45;
			const wheelY = cy + s * 0.2;
			// Rear wheel
			ctx.beginPath();
			ctx.arc(leftX, wheelY, wheelR, 0, Math.PI * 2);
			ctx.stroke();
			// Front wheel
			ctx.beginPath();
			ctx.arc(rightX, wheelY, wheelR, 0, Math.PI * 2);
			ctx.stroke();
			// Frame: seat tube + top tube + down tube + chain stay
			const seatX = cx - s * 0.12;
			const seatY = cy - s * 0.38;
			// Down tube: head-tube top → bottom bracket
			ctx.beginPath();
			ctx.moveTo(rightX - wheelR * 0.4, cy - s * 0.3);
			ctx.lineTo(leftX + wheelR * 0.3, wheelY - wheelR);
			ctx.stroke();
			// Top tube: seat -> head
			ctx.beginPath();
			ctx.moveTo(seatX, seatY);
			ctx.lineTo(rightX - wheelR * 0.4, cy - s * 0.3);
			ctx.stroke();
			// Seat tube
			ctx.beginPath();
			ctx.moveTo(seatX, seatY);
			ctx.lineTo(leftX + wheelR * 0.3, wheelY - wheelR);
			ctx.stroke();
			break;
		}
		default: {
			// Neutral: small filled dot
			ctx.beginPath();
			ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2);
			ctx.fill();
			break;
		}
	}
	ctx.restore();
}

// ── Lane types ───────────────────────────────────────────────────────────────

interface LaneOpts {
	startX: number;
	span: number;
	y: number;
	frac: number;
	accent: string;
	phase: number;
	pace: number;
	isYou: boolean;
	nameTab: string;
	padL: number;
}

interface AvatarOpts {
	x: number;
	y: number;
	accent: string;
	phase: number;
	spm: number;
	isYou: boolean;
	sport?: Sport;
	label: string;
}

/**
 * Draws the race-board course strip — a layered, broadcast-style race scene:
 * depth background, water lanes, illuminated wake with speed streaks, glossy
 * sport-aware avatar pods, buoy-capped markers, and a checkered finish gate.
 */
export class CourseRenderer implements ReplayRenderer {
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

		// ── Coordinate model ──────────────────────────────────────────────────
		const startX = PAD_L;
		const finishX = w - PAD_R;
		const span = finishX - startX;

		const hasGhost = !!state.ghost;
		const playerY = hasGhost ? h * 0.7 : h * 0.56;
		const ghostY = h * 0.34;

		// ── Scene layers ──────────────────────────────────────────────────────
		this.drawBackground(w, h);
		this.drawGrid(startX, span, h, state.totalDistance, playerY);
		this.drawFinishGate(finishX, 10, h - 10);

		// Ghost first so YOU overlaps on top
		if (hasGhost && state.ghost) {
			const ghostFrac = clamp01(state.ghost.distFrac);
			const ghostAvX = startX + span * ghostFrac;
			this.drawLane({
				startX,
				span,
				y: ghostY,
				frac: ghostFrac,
				accent: C.ghost,
				phase: this.ghostPhase,
				pace: state.ghost.pace,
				isYou: false,
				nameTab: 'GHOST',
				padL: PAD_L
			});
			this.drawAvatar({
				x: ghostAvX,
				y: ghostY,
				accent: C.ghost,
				phase: this.ghostPhase,
				spm: state.ghost.spm,
				isYou: false,
				sport: state.sport,
				label: `${state.ghost.label || 'PB'} · ${Math.round(ghostFrac * 100)}%`
			});
		}

		const playerFrac = clamp01(state.distFrac);
		const playerAvX = startX + span * playerFrac;
		this.drawLane({
			startX,
			span,
			y: playerY,
			frac: playerFrac,
			accent: C.live,
			phase: this.phase,
			pace: state.frame.pace,
			isYou: true,
			nameTab: 'YOU',
			padL: PAD_L
		});
		this.drawAvatar({
			x: playerAvX,
			y: playerY,
			accent: C.live,
			phase: this.phase,
			spm: state.frame.spm,
			isYou: true,
			sport: state.sport,
			label: `${fmtPace(state.frame.pace)} · ${Math.round(playerFrac * 100)}%`
		});
	}

	destroy() {
		// 2D canvas has no GPU resources to release.
	}

	// ── Background ────────────────────────────────────────────────────────────

	private drawBackground(w: number, h: number) {
		const { ctx } = this;
		const C = this.colors;
		ctx.save();
		roundRect(ctx, 0, 0, w, h, 3);
		ctx.clip();
		const grad = ctx.createLinearGradient(0, 0, 0, h);
		grad.addColorStop(0, C.skyTop);
		grad.addColorStop(1, C.skyBottom);
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, w, h);
		ctx.restore();
	}

	// ── Grid + buoys ──────────────────────────────────────────────────────────

	private drawGrid(
		startX: number,
		span: number,
		h: number,
		totalDistance: number,
		primaryY: number
	) {
		const { ctx } = this;
		const C = this.colors;
		ctx.save();
		ctx.font = '10px "Source Code Pro", ui-monospace, monospace';
		ctx.textAlign = 'center';

		for (let i = 0; i <= 10; i++) {
			const x = startX + (span * i) / 10;
			const isMajor = i % 5 === 0;
			ctx.strokeStyle = isMajor ? C.tickMajor : C.tickMinor;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(x, 10);
			ctx.lineTo(x, h - 18);
			ctx.stroke();

			// Buoy cap at the primary waterline
			ctx.fillStyle = C.markerCap;
			ctx.beginPath();
			ctx.arc(x, primaryY, isMajor ? 3.5 : 2.5, 0, Math.PI * 2);
			ctx.fill();

			if (isMajor || i === 10) {
				ctx.fillStyle = C.tickText;
				const m = Math.round((totalDistance * i) / 10);
				// Right-align the final label so it clears the finish gate posts.
				if (i === 10) {
					ctx.textAlign = 'right';
					ctx.fillText(`${m}`, x - 5, h - 6);
					ctx.textAlign = 'center';
				} else {
					ctx.fillText(`${m}`, x, h - 6);
				}
			}
		}
		ctx.restore();
	}

	// ── Finish gate ───────────────────────────────────────────────────────────

	private drawFinishGate(x: number, y0: number, y1: number) {
		const { ctx } = this;
		const C = this.colors;
		ctx.save();

		// Posts (slim, 2px wide)
		ctx.fillStyle = C.finishDark;
		ctx.fillRect(x - 1, y0, 2, y1 - y0);
		ctx.fillRect(x + 4, y0, 2, y1 - y0);

		// Checkered banner column (4px wide, between posts)
		const cell = 5;
		for (let yy = y0, r = 0; yy < y1; yy += cell, r++) {
			ctx.fillStyle = r % 2 === 0 ? C.finishDark : C.finishLight;
			ctx.fillRect(x + 1, yy, 3, Math.min(cell, y1 - yy));
		}

		// Faint accent glow line on the left post
		ctx.shadowColor = C.live;
		ctx.shadowBlur = 6;
		ctx.strokeStyle = withAlpha(C.live, 0.35);
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(x - 1, y0);
		ctx.lineTo(x - 1, y1);
		ctx.stroke();
		ctx.shadowBlur = 0;

		ctx.restore();
	}

	// ── Lane scene ────────────────────────────────────────────────────────────

	private drawLane(o: LaneOpts) {
		const { ctx } = this;
		const C = this.colors;
		const { startX, span, y, frac, accent, phase, pace, isYou, nameTab, padL } = o;
		const avX = startX + span * frac;

		ctx.save();
		if (!isYou) {
			ctx.globalAlpha = 0.82;
		}

		// 1. Water band
		const waterTop = y - WATER_H * 0.3;
		const waterBottom = y + WATER_H * 0.7;
		const waterGrad = ctx.createLinearGradient(0, waterTop, 0, waterBottom);
		waterGrad.addColorStop(0, withAlpha(accent, 0.05));
		waterGrad.addColorStop(1, withAlpha(accent, 0.2));
		ctx.fillStyle = waterGrad;
		roundRect(ctx, startX, waterTop, span, waterBottom - waterTop, 4);
		ctx.fill();

		// 2. Waterline (1px laneLine)
		ctx.strokeStyle = C.laneLine;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(startX, y);
		ctx.lineTo(startX + span, y);
		ctx.stroke();

		// 3. Ripples (2 sine polylines just below waterline)
		const rippleAmp = this.reduceMotion ? 0 : 1.5;
		for (let ri = 0; ri < 2; ri++) {
			const offsetY = y + 5 + ri * 6;
			const phaseOff = ri * 1.1;
			ctx.strokeStyle = withAlpha(accent, 0.25);
			ctx.lineWidth = 0.8;
			ctx.beginPath();
			ctx.moveTo(startX, offsetY);
			for (let rx = startX; rx <= startX + span; rx += 6) {
				ctx.lineTo(rx, offsetY + Math.sin((rx * 0.12) + phase + phaseOff) * rippleAmp);
			}
			ctx.stroke();
		}

		// 4. Wake trail: outer glow + core sine
		if (avX > startX) {
			const waveAmp = this.reduceMotion ? 0 : 1.2;

			// Outer glow
			ctx.save();
			ctx.shadowColor = accent;
			ctx.shadowBlur = 8;
			ctx.strokeStyle = withAlpha(accent, 0.45);
			ctx.lineWidth = 7;
			ctx.beginPath();
			ctx.moveTo(startX, y);
			for (let x = startX; x <= avX; x += 6) {
				ctx.lineTo(x, y + Math.sin((x - avX) * 0.18 + phase) * waveAmp);
			}
			ctx.stroke();
			ctx.shadowBlur = 0;
			ctx.restore();

			// Core stroke
			ctx.strokeStyle = accent;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(startX, y);
			for (let x = startX; x <= avX; x += 6) {
				ctx.lineTo(x, y + Math.sin((x - avX) * 0.18 + phase) * waveAmp);
			}
			ctx.stroke();
		}

		// 5. Speed streaks behind avX
		const sLen = clamp01((streakLen(pace) - 6) / (22 - 6)) * 16 + 6; // 6..22
		const streakY = [y - 3, y, y + 3, y - 5];
		const streakAlphas = [0.35, 0.28, 0.22, 0.16];
		const streakLens = [sLen, sLen * 0.75, sLen * 0.55, sLen * 0.4];
		for (let si = 0; si < 4; si++) {
			const shimmerOffset = this.reduceMotion ? 0 : Math.sin(phase + si * 0.8) * 3;
			const sx = avX - streakLens[si] - shimmerOffset;
			if (sx >= startX) {
				ctx.strokeStyle = withAlpha(accent, streakAlphas[si]);
				ctx.lineWidth = 1.2;
				ctx.beginPath();
				ctx.moveTo(sx, streakY[si]);
				ctx.lineTo(avX - shimmerOffset, streakY[si]);
				ctx.stroke();
			}
		}

		// 6. Lane name tab (rounded rect in gutter)
		const tabX = 6;
		const tabW = padL - 16;
		const tabH = 18;
		roundRect(ctx, tabX, y - 9, tabW, tabH, 4);
		ctx.fillStyle = accent;
		ctx.fill();
		ctx.fillStyle = C.labelBg;
		ctx.font = '700 10px "Source Code Pro", ui-monospace, monospace';
		ctx.textAlign = 'center';
		ctx.fillText(nameTab, tabX + tabW / 2, y + 4);

		ctx.restore();
	}

	// ── Avatar pod ────────────────────────────────────────────────────────────

	private drawAvatar(o: AvatarOpts) {
		const { ctx } = this;
		const C = this.colors;
		const { x, y, accent, phase, spm, isYou, sport, label } = o;

		ctx.save();
		if (!isYou) {
			ctx.globalAlpha = 0.82;
		}

		// 1. Bob — pod, shadow, bow wave, HUD all reference by
		const bobY = y + (this.reduceMotion ? 0 : Math.sin(phase) * BOB_AMP);

		// 2. Cast shadow (anchored to waterline y, not bobY, so pod appears to lift)
		ctx.save();
		ctx.fillStyle = withAlpha(C.shadow, 0.18);
		ctx.beginPath();
		ctx.ellipse(x, y + 6, POD_R * 1.8, POD_R * 0.5, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();

		// 3. Bow wave (foam crescent just ahead of pod)
		ctx.save();
		const bowX = x + POD_R;
		const bowAmp = this.reduceMotion ? 0.5 : 0.5 + (spm / 60) * 0.5;
		ctx.strokeStyle = withAlpha(C.foam, 0.7);
		ctx.lineWidth = 1.5;
		ctx.lineCap = 'round';
		ctx.beginPath();
		// Upper arc of crescent
		ctx.arc(bowX, bobY, POD_R * 0.7 * bowAmp, -Math.PI * 0.6, Math.PI * 0.6);
		ctx.stroke();
		ctx.restore();

		// 4. Pod — glossy circle
		ctx.save();
		// Main fill
		ctx.fillStyle = accent;
		ctx.beginPath();
		ctx.arc(x, bobY, POD_R, 0, Math.PI * 2);
		ctx.fill();

		// Top highlight for gloss effect
		const highlightGrad = ctx.createRadialGradient(
			x - POD_R * 0.3,
			bobY - POD_R * 0.4,
			0,
			x,
			bobY,
			POD_R
		);
		highlightGrad.addColorStop(0, withAlpha(C.foam, 0.5));
		highlightGrad.addColorStop(0.5, withAlpha(C.foam, 0.1));
		highlightGrad.addColorStop(1, withAlpha(C.foam, 0));
		ctx.fillStyle = highlightGrad;
		ctx.beginPath();
		ctx.arc(x, bobY, POD_R, 0, Math.PI * 2);
		ctx.fill();

		// Rim stroke
		ctx.strokeStyle = isYou ? accent : C.labelText;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(x, bobY, POD_R, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();

		// 5. Sport glyph
		ctx.save();
		drawSportGlyph(ctx, x, bobY, sport, C.labelBg);
		ctx.restore();

		// 6. HUD pill (rounded label above pod)
		ctx.save();
		ctx.font = '600 10px "Source Code Pro", ui-monospace, monospace';
		ctx.textAlign = 'center';
		const tw = ctx.measureText(label).width;
		const padX = 6;
		const pillH = 16;
		const pillW = tw + padX * 2;
		const pillX = x - pillW / 2;
		const pillY = bobY - 24 - pillH;

		// Pill background: YOU gets labelBg (light chip), GHOST gets accent
		roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
		ctx.fillStyle = isYou ? C.labelBg : accent;
		ctx.fill();

		// Caret (tiny downward triangle pointing at the pod)
		const caretSize = 4;
		ctx.fillStyle = isYou ? C.labelBg : accent;
		ctx.beginPath();
		ctx.moveTo(x - caretSize, pillY + pillH);
		ctx.lineTo(x + caretSize, pillY + pillH);
		ctx.lineTo(x, pillY + pillH + caretSize);
		ctx.closePath();
		ctx.fill();

		// Pill text
		ctx.fillStyle = isYou ? accent : C.labelBg;
		ctx.fillText(label, x, pillY + pillH - 4);
		ctx.restore();

		ctx.restore(); // globalAlpha restore for non-you
	}
}
