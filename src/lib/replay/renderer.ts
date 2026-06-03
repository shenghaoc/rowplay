import type { Frame } from './engine';
import type { Sport } from '../types';
import { fmtPace, fmtTime } from '../format';
import { SPORT_LANE_COLORS } from './sports';

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
	/** Active machine for this frame (lane + avatar). */
	sport: Sport;
	segmentIndex?: number;
	/** 0..1 during a rest interval between machines. */
	transitionPhase?: number;
	transitionFrom?: Sport;
	transitionTo?: Sport;
	/** Seconds left in the current rest (for HUD). */
	transitionRemaining?: number;
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
 *
 * Memoised: the renderer calls this ~20×/frame but only ever with a small,
 * constant set of `(hex, alpha)` pairs per theme, so the cache keeps the hot
 * path allocation-free after warm-up (no per-frame `parseInt` or string churn).
 */
const alphaCache = new Map<string, string>();
function withAlpha(hex: string, a: number): string {
	const key = `${hex}@${a}`;
	const cached = alphaCache.get(key);
	if (cached) return cached;
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
	const rgba = `rgba(${r},${g},${b},${a})`;
	alphaCache.set(key, rgba);
	return rgba;
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

// ── Sport avatars ─────────────────────────────────────────────────────────────
// Each draws a side-profile athlete (facing the finish, +x) animated by the
// stroke `phase`, so the marker both identifies the machine and conveys cadence.
// `y` is the waterline; `bobY` is the bobbing centre; figures are drawn in the
// lane `accent` with a contrast `rim` and `foam` highlights. `s = sin(phase)`
// drives the stroke; under reduced motion the caller passes a frozen pose.

/** Rounded limb / strut segment. */
function limb(
	ctx: CanvasRenderingContext2D,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	w: number,
	color: string
) {
	ctx.strokeStyle = color;
	ctx.lineWidth = w;
	ctx.lineCap = 'round';
	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(x2, y2);
	ctx.stroke();
}

/** Filled disc (head / hub / joint). */
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fill();
}

interface AvatarDrawCtx {
	x: number;
	/** Waterline / ground. */
	y: number;
	/** Bobbing centre for floating parts. */
	bobY: number;
	/** sin(phase): stroke driver, −1..1 (frozen pose under reduced motion). */
	s: number;
	/** Raw phase for continuous rotation (wheels). */
	phase: number;
	accent: string;
	rim: string;
	foam: string;
	reduce: boolean;
}

/** Rowing shell with a rower whose torso + oar sweep through the stroke. */
function drawRower(ctx: CanvasRenderingContext2D, a: AvatarDrawCtx) {
	const { x, bobY, s, accent, rim, foam, reduce } = a;
	const HL = 16;
	const HH = 2.6;

	// Hull — long, pointed racing shell on the water.
	ctx.fillStyle = accent;
	ctx.beginPath();
	ctx.moveTo(x - HL, bobY);
	ctx.quadraticCurveTo(x - HL * 0.2, bobY - HH, x + HL, bobY);
	ctx.quadraticCurveTo(x - HL * 0.2, bobY + HH, x - HL, bobY);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = rim;
	ctx.lineWidth = 1;
	ctx.stroke();

	// Rower — seat at mid-hull; torso swings with the stroke. At the catch
	// (s → +1) the body is forward over the stretcher; at the finish (s → −1)
	// it lays back toward the bow — moving with the oar, not against it.
	const seatX = x - 2;
	const seatY = bobY - 2;
	const shX = seatX + s * 3.5;
	const shY = bobY - 9;
	limb(ctx, seatX, seatY, x + 7, bobY - 1, 2, accent); // legs to stretcher
	limb(ctx, seatX, seatY, shX, shY, 2.4, accent); // torso
	disc(ctx, shX, shY - 3, 2.3, accent); // head

	// Oar — sweeps fore/aft; blade dips and splashes on the drive.
	const bladeX = x + s * 13;
	const inWater = s > -0.15;
	const bladeY = bobY + (inWater ? 4.5 : 1.5);
	const handX = shX + 2.5;
	const handY = shY + 2;
	limb(ctx, handX, handY, bladeX, bladeY, 1.6, rim); // shaft
	limb(ctx, bladeX - 1.6, bladeY - 1.6, bladeX + 1.6, bladeY + 1.6, 2.4, accent); // blade
	if (!reduce && inWater) {
		disc(ctx, bladeX, bobY + 2, 1, foam);
		disc(ctx, bladeX + 2, bobY + 1, 0.8, foam);
	}
}

/** Skier double-poling: arms/poles swing from a high reach to a low back-pull. */
function drawSkier(ctx: CanvasRenderingContext2D, a: AvatarDrawCtx) {
	const { x, y, bobY, s, accent, rim } = a;
	const hipX = x;
	const hipY = bobY - 7;
	const crouch = (1 - s) * 0.6; // deeper crouch on the pull (s → −1)
	const shX = x + 0.5 + (s < 0 ? 1.5 : 0);
	const shY = bobY - 13 + crouch;

	// Legs planted on the snow (the waterline).
	limb(ctx, hipX, hipY + crouch, x + 4, y, 2.2, accent);
	limb(ctx, hipX, hipY + crouch, x - 3, y, 2.2, accent);
	// Torso + head.
	limb(ctx, hipX, hipY + crouch, shX, shY, 2.6, accent);
	disc(ctx, shX, shY - 3, 2.3, accent);
	// Arm + pole: hands high & forward on the reach (s → +1), low & back on pull.
	const handX = shX + 4 + s * 2;
	const handY = shY + 4 - s * 4;
	limb(ctx, shX, shY + 1, handX, handY, 2, accent);
	limb(ctx, handX, handY, handX - 6 + s * 2, y, 1.2, rim); // pole to snow
}

/** Cyclist whose wheels spin and legs pedal with the phase. */
function drawCyclist(ctx: CanvasRenderingContext2D, a: AvatarDrawCtx) {
	const { x, y, accent, rim, phase, reduce } = a;
	const wr = 5;
	const rearX = x - 8;
	const frontX = x + 8;
	const wheelY = y - wr;
	const spin = reduce ? 0.3 : phase * 2;

	// Wheels: rim + rotating spokes + hub.
	for (const wx of [rearX, frontX]) {
		ctx.strokeStyle = accent;
		ctx.lineWidth = 1.4;
		ctx.beginPath();
		ctx.arc(wx, wheelY, wr, 0, Math.PI * 2);
		ctx.stroke();
		for (let k = 0; k < 4; k++) {
			const ang = spin + (k * Math.PI) / 2;
			limb(ctx, wx, wheelY, wx + Math.cos(ang) * wr, wheelY + Math.sin(ang) * wr, 0.8, rim);
		}
		disc(ctx, wx, wheelY, 1, accent);
	}

	// Frame + rider bob with the stroke; the wheels stay grounded on `y`.
	const lift = a.bobY - y;
	const bbX = x;
	const bbY = wheelY + 1 + lift;
	const seatX = x - 3;
	const seatY = wheelY - 7 + lift;
	const barX = frontX - 1;
	const barY = wheelY - 6 + lift;
	limb(ctx, rearX, wheelY, bbX, bbY, 1.6, accent);
	limb(ctx, bbX, bbY, seatX, seatY, 1.6, accent);
	limb(ctx, seatX, seatY, barX, barY, 1.6, accent);
	limb(ctx, bbX, bbY, barX, barY, 1.6, accent);
	limb(ctx, frontX, wheelY, barX, barY, 1.6, accent);

	// Rider: torso → bars, head, arm, and a pedalling leg on the crank.
	const rShX = x + 1;
	const rShY = wheelY - 12 + lift;
	limb(ctx, seatX, seatY, rShX, rShY, 2.4, accent);
	disc(ctx, rShX + 1, rShY - 2.5, 2.3, accent);
	limb(ctx, rShX, rShY, barX, barY, 1.8, accent);
	const crankX = bbX + Math.cos(spin) * 2.4;
	const crankY = bbY + Math.sin(spin) * 2.4;
	limb(ctx, seatX + 1, seatY + 1, crankX, crankY, 1.8, accent);
}

/** Glossy neutral pod — fallback when `sport` is absent. */
function drawNeutralPod(
	ctx: CanvasRenderingContext2D,
	x: number,
	bobY: number,
	accent: string,
	rim: string,
	foam: string
) {
	ctx.fillStyle = accent;
	ctx.beginPath();
	ctx.arc(x, bobY, POD_R, 0, Math.PI * 2);
	ctx.fill();
	const gloss = ctx.createRadialGradient(x - POD_R * 0.3, bobY - POD_R * 0.4, 0, x, bobY, POD_R);
	gloss.addColorStop(0, withAlpha(foam, 0.5));
	gloss.addColorStop(0.5, withAlpha(foam, 0.1));
	gloss.addColorStop(1, withAlpha(foam, 0));
	ctx.fillStyle = gloss;
	ctx.beginPath();
	ctx.arc(x, bobY, POD_R, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = rim;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(x, bobY, POD_R, 0, Math.PI * 2);
	ctx.stroke();
	disc(ctx, x, bobY, 2.5, withAlpha(foam, 0.85));
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
	sport: Sport;
}

interface AvatarOpts {
	x: number;
	y: number;
	accent: string;
	phase: number;
	spm: number;
	isYou: boolean;
	sport: Sport;
	label: string;
	frozenPose?: boolean;
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
		const laneSport =
			state.transitionPhase != null && state.transitionFrom != null
				? state.transitionFrom
				: state.sport;
		const inRest = state.transitionPhase != null;
		const avatarLabel = inRest
			? `Rest · ${fmtTime(state.transitionRemaining ?? 0, true)}`
			: `${fmtPace(state.frame.pace)} · ${Math.round(clamp01(state.distFrac) * 100)}%`;

		// ── Scene layers ──────────────────────────────────────────────────────
		this.drawBackground(w, h);
		this.drawGrid(startX, span, h, state.totalDistance, hasGhost ? [ghostY, playerY] : [playerY]);
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
				padL: PAD_L,
				sport: laneSport
			});
			this.drawAvatar({
				x: ghostAvX,
				y: ghostY,
				accent: C.ghost,
				phase: this.ghostPhase,
				spm: state.ghost.spm,
				isYou: false,
				sport: laneSport,
				label: `${state.ghost.label || 'PB'} · ${Math.round(ghostFrac * 100)}%`,
				frozenPose: inRest
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
			padL: PAD_L,
			sport: laneSport
		});
		this.drawAvatar({
			x: playerAvX,
			y: playerY,
			accent: C.live,
			phase: inRest ? 0 : this.phase,
			spm: state.frame.spm,
			isYou: true,
			sport: laneSport,
			label: avatarLabel,
			frozenPose: inRest
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
		waterlines: number[]
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

			// Buoy cap on every lane's waterline (so the ghost lane has parity).
			ctx.fillStyle = C.markerCap;
			for (const ly of waterlines) {
				ctx.beginPath();
				ctx.arc(x, ly, isMajor ? 3.5 : 2.5, 0, Math.PI * 2);
				ctx.fill();
			}

			if (isMajor) {
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

		// Faint accent glow on the left post. The gate is shared across lanes, so
		// it always uses the live accent (`C.live`) rather than a per-lane colour.
		ctx.shadowColor = C.live;
		ctx.shadowBlur = 6;
		ctx.strokeStyle = withAlpha(C.live, 0.35);
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(x - 1, y0);
		ctx.lineTo(x - 1, y1);
		ctx.stroke();

		ctx.restore(); // restore() resets shadowBlur with the saved state
	}

	// ── Lane scene ────────────────────────────────────────────────────────────

	private drawLane(o: LaneOpts) {
		const { ctx } = this;
		const C = this.colors;
		const { startX, span, y, frac, accent, phase, pace, isYou, nameTab, padL, sport } = o;
		const avX = startX + span * frac;
		const themeName = C === COLORS_DARK ? 'dark' : 'light';
		const isRow = sport === 'rower';

		ctx.save();
		if (!isYou) {
			ctx.globalAlpha = 0.82;
		}

		// 1. Lane band (water gradient for rower; flat snow/asphalt for ski/bike)
		const waterTop = y - WATER_H * 0.3;
		const waterBottom = y + WATER_H * 0.7;
		if (isRow) {
			const waterGrad = ctx.createLinearGradient(0, waterTop, 0, waterBottom);
			waterGrad.addColorStop(0, withAlpha(accent, 0.05));
			waterGrad.addColorStop(1, withAlpha(accent, 0.2));
			ctx.fillStyle = waterGrad;
		} else {
			ctx.fillStyle = SPORT_LANE_COLORS[sport][themeName];
		}
		roundRect(ctx, startX, waterTop, span, waterBottom - waterTop, 4);
		ctx.fill();

		// 2. Waterline (1px laneLine)
		ctx.strokeStyle = C.laneLine;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(startX, y);
		ctx.lineTo(startX + span, y);
		ctx.stroke();

		// 3. Ripples (rower only)
		if (isRow) {
			for (let ri = 0; ri < 2; ri++) {
				const offsetY = y + 5 + ri * 6;
				ctx.strokeStyle = withAlpha(accent, 0.25);
				ctx.lineWidth = 0.8;
				ctx.beginPath();
				ctx.moveTo(startX, offsetY);
				if (this.reduceMotion) {
					ctx.lineTo(startX + span, offsetY);
				} else {
					const phaseOff = ri * 1.1;
					for (let rx = startX; rx <= startX + span; rx += 6) {
						ctx.lineTo(rx, offsetY + Math.sin(rx * 0.12 + phase + phaseOff) * 1.5);
					}
				}
				ctx.stroke();
			}
		}

		// 4. Wake trail: outer glow + core. Reduced motion → a flat line (no trig).
		if (avX > startX) {
			const traceWake = () => {
				ctx.beginPath();
				ctx.moveTo(startX, y);
				if (this.reduceMotion || !isRow) {
					ctx.lineTo(avX, y);
				} else {
					for (let x = startX; x <= avX; x += 6) {
						ctx.lineTo(x, y + Math.sin((x - avX) * 0.18 + phase) * 1.2);
					}
				}
			};

			// Outer glow
			ctx.save();
			ctx.shadowColor = accent;
			ctx.shadowBlur = 8;
			ctx.strokeStyle = withAlpha(accent, 0.45);
			ctx.lineWidth = 7;
			traceWake();
			ctx.stroke();
			ctx.restore(); // restore() resets shadowBlur with the saved state

			// Core stroke
			ctx.strokeStyle = accent;
			ctx.lineWidth = 3;
			traceWake();
			ctx.stroke();
		}

		// 5. Speed streaks behind avX (streakLen already returns a 6..22 length)
		const sLen = streakLen(pace);
		const streakY = [y - 3, y, y + 3, y - 5];
		const streakAlphas = [0.35, 0.28, 0.22, 0.16];
		const streakLens = [sLen, sLen * 0.75, sLen * 0.55, sLen * 0.4];
		for (let si = 0; si < 4; si++) {
			const shimmerOffset = this.reduceMotion ? 0 : Math.sin(phase + si * 0.8) * 3;
			// Clamp the start to the gate so streaks shorten gradually near the
			// line rather than winking out the moment they cross it.
			const sx = Math.max(avX - streakLens[si] - shimmerOffset, startX);
			const ex = avX - shimmerOffset;
			if (sx < ex) {
				ctx.strokeStyle = withAlpha(accent, streakAlphas[si]);
				ctx.lineWidth = 1.2;
				ctx.beginPath();
				ctx.moveTo(sx, streakY[si]);
				ctx.lineTo(ex, streakY[si]);
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
		const { x, y, accent, phase, isYou, sport, label, frozenPose } = o;

		ctx.save();
		if (!isYou) {
			ctx.globalAlpha = 0.82;
		}

		// Bob the floating/upper parts; figures stay rooted to the waterline.
		const s = frozenPose || this.reduceMotion ? 0 : Math.sin(phase);
		const bobY = y + (this.reduceMotion ? 0 : Math.sin(phase) * BOB_AMP);
		// Contrast rim that reads on the accent fill in both themes.
		const rim = C.labelText;

		// Cast shadow on the water (anchored to the waterline, so the avatar lifts).
		ctx.save();
		ctx.fillStyle = withAlpha(C.shadow, 0.18);
		ctx.beginPath();
		ctx.ellipse(x, y + 5, POD_R * 1.9, POD_R * 0.45, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();

		// Sport-specific animated athlete (or neutral pod fallback).
		ctx.save();
		const a: AvatarDrawCtx = { x, y, bobY, s, phase, accent, rim, foam: C.foam, reduce: this.reduceMotion };
		switch (sport) {
			case 'rower':
				drawRower(ctx, a);
				break;
			case 'skierg':
				drawSkier(ctx, a);
				break;
			case 'bike':
				drawCyclist(ctx, a);
				break;
			default:
				drawNeutralPod(ctx, x, bobY, accent, rim, C.foam);
				break;
		}
		ctx.restore();

		// HUD pill — anchored to the waterline (not the bob) so it stays steady.
		ctx.save();
		ctx.font = '600 10px "Source Code Pro", ui-monospace, monospace';
		ctx.textAlign = 'center';
		const tw = ctx.measureText(label).width;
		const padX = 6;
		const pillH = 16;
		const pillW = tw + padX * 2;
		// Keep the pill on-canvas at the start/finish; the caret still points at x.
		const pillX = Math.max(4, Math.min(x - pillW / 2, this.w - pillW - 4));
		const caretSize = 4;
		const caretY = y - 22; // tip sits just above the figure
		const pillY = caretY - caretSize - pillH;

		// Pill background: YOU gets labelBg (light chip), GHOST gets accent.
		roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
		ctx.fillStyle = isYou ? C.labelBg : accent;
		ctx.fill();

		// Caret (tiny downward triangle pointing at the avatar).
		ctx.beginPath();
		ctx.moveTo(x - caretSize, pillY + pillH);
		ctx.lineTo(x + caretSize, pillY + pillH);
		ctx.lineTo(x, caretY);
		ctx.closePath();
		ctx.fill();

		// Pill text (centred on the pill, which may be clamped away from x).
		ctx.fillStyle = isYou ? accent : C.labelBg;
		ctx.fillText(label, pillX + pillW / 2, pillY + pillH - 4);
		ctx.restore();

		ctx.restore(); // globalAlpha restore for non-you
	}
}
