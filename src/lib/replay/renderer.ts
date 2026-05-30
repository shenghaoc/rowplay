import type { Frame } from './engine';
import type { SportTheme } from './sports';
import { fmtPace } from '../format';

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
 * Draws the virtual course strip. Supports an optional ghost avatar in a second
 * lane — the geometry is a pure function of each avatar's distance fraction, so
 * "you vs a PB" needs no engine changes.
 */
export class CourseRenderer {
	private ctx: CanvasRenderingContext2D;
	private theme: SportTheme;
	private dpr = 1;
	private w = 0;
	private h = 0;
	private phase = 0;
	private ghostPhase = 0;

	constructor(canvas: HTMLCanvasElement, theme: SportTheme) {
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2d context unavailable');
		this.ctx = ctx;
		this.theme = theme;
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

	render(state: RenderState, playing: boolean) {
		const { ctx, w, h, theme } = this;
		if (w === 0) return;
		if (playing) {
			this.phase += 0.15 + state.frame.spm / 600;
			if (state.ghost) this.ghostPhase += 0.15 + state.ghost.spm / 600;
		}

		ctx.clearRect(0, 0, w, h);

		// Course background gradient.
		const grad = ctx.createLinearGradient(0, 0, 0, h);
		grad.addColorStop(0, theme.courseTop);
		grad.addColorStop(1, theme.courseBottom);
		ctx.fillStyle = grad;
		roundRect(ctx, 0, 0, w, h, 12);
		ctx.fill();

		const pad = 28;
		const startX = pad;
		const finishX = w - pad;
		const span = finishX - startX;

		const hasGhost = !!state.ghost;
		const playerY = hasGhost ? h * 0.72 : h * 0.62;
		const ghostY = h * 0.42;

		// Distance lane markers (every 10%) on the player's lane.
		ctx.strokeStyle = 'rgba(255,255,255,0.08)';
		ctx.lineWidth = 1;
		ctx.fillStyle = 'rgba(255,255,255,0.35)';
		ctx.font = '10px ui-monospace, monospace';
		ctx.textAlign = 'center';
		for (let i = 0; i <= 10; i++) {
			const x = startX + (span * i) / 10;
			ctx.beginPath();
			ctx.moveTo(x, playerY - 16);
			ctx.lineTo(x, playerY + 16);
			ctx.stroke();
			if (i % 5 === 0) {
				const m = Math.round((state.totalDistance * i) / 10);
				ctx.fillText(`${m}m`, x, playerY + 32);
			}
		}

		// Finish flags (drawn, not emoji).
		this.drawFinishFlag(finishX, playerY);
		if (hasGhost) this.drawFinishFlag(finishX, ghostY);

		if (hasGhost && state.ghost) {
			this.drawLane(startX, span, ghostY, state.ghost.distFrac, '#8b949e', 0.55);
			this.drawAvatar(
				startX + span * clamp01(state.ghost.distFrac),
				ghostY,
				`${state.ghost.label || 'PB'} · ${Math.round(state.ghost.distFrac * 100)}%`,
				'#8b949e',
				0.55,
				playing ? Math.sin(this.ghostPhase) * 2 : 0
			);
		}

		this.drawLane(startX, span, playerY, state.distFrac, theme.color, 1);
		this.drawAvatar(
			startX + span * clamp01(state.distFrac),
			playerY,
			`${Math.round(state.distFrac * 100)}% · ${fmtPace(state.frame.pace)}`,
			theme.color,
			1,
			playing ? Math.sin(this.phase) * 2 : 0
		);
	}

	/** A small checkered flag drawn at the finish line. */
	private drawFinishFlag(x: number, baseY: number) {
		const ctx = this.ctx;
		const poleH = 26;
		const top = baseY - poleH;
		const fw = 14;
		const fh = 10;
		const cell = fh / 2;
		ctx.save();
		// Pole.
		ctx.strokeStyle = 'rgba(255,255,255,0.55)';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(x, baseY);
		ctx.lineTo(x, top);
		ctx.stroke();
		// Checker.
		for (let row = 0; row < fh / cell; row++) {
			for (let col = 0; col < fw / cell; col++) {
				ctx.fillStyle = (row + col) % 2 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)';
				ctx.fillRect(x + col * cell, top + row * cell, cell, cell);
			}
		}
		ctx.restore();
	}

	private drawLane(startX: number, span: number, y: number, frac: number, color: string, alpha: number) {
		const ctx = this.ctx;
		const avX = startX + span * clamp01(frac);
		ctx.save();
		ctx.globalAlpha = alpha;

		// Track line.
		ctx.strokeStyle = 'rgba(255,255,255,0.15)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(startX, y);
		ctx.lineTo(startX + span, y);
		ctx.stroke();

		// Wake/trail behind the avatar.
		const trail = ctx.createLinearGradient(startX, 0, avX, 0);
		trail.addColorStop(0, 'rgba(255,255,255,0)');
		trail.addColorStop(1, hexA(color, 0.5));
		ctx.strokeStyle = trail;
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(startX, y);
		for (let x = startX; x <= avX; x += 6) {
			const ripple = Math.sin((x - avX) * 0.25 + this.phase) * 1.5;
			ctx.lineTo(x, y + ripple);
		}
		ctx.stroke();
		ctx.restore();
	}

	private drawAvatar(x: number, y: number, label: string, color: string, alpha: number, bob: number) {
		const ctx = this.ctx;
		const cy = y - 8 + bob;
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.textAlign = 'center';

		// Glowing puck marker.
		ctx.shadowColor = color;
		ctx.shadowBlur = 12;
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(x, cy, 6, 0, Math.PI * 2);
		ctx.fill();
		ctx.shadowBlur = 0;
		// Inner highlight.
		ctx.fillStyle = 'rgba(255,255,255,0.85)';
		ctx.beginPath();
		ctx.arc(x, cy, 2.5, 0, Math.PI * 2);
		ctx.fill();

		// Label above.
		ctx.font = '600 11px ui-monospace, monospace';
		ctx.fillStyle = color;
		ctx.fillText(label, x, y - 28);
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

function hexA(hex: string, a: number): string {
	const m = hex.replace('#', '');
	const r = parseInt(m.slice(0, 2), 16);
	const g = parseInt(m.slice(2, 4), 16);
	const b = parseInt(m.slice(4, 6), 16);
	return `rgba(${r},${g},${b},${a})`;
}
