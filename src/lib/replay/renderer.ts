import type { Frame } from './engine';
import type { SportTheme } from './sports';
import { fmtPace } from '../format';

export interface RenderState {
	frame: Frame;
	/** Distance fraction 0..1 (avatar position along the course). */
	distFrac: number;
	totalDistance: number;
}

/**
 * Draws the virtual course strip with the moving avatar. Takes the full canvas
 * width; height ~140px works well. Built to later accept a `ghost` frame and
 * draw a second avatar — the geometry is already a pure function of distFrac.
 */
export class CourseRenderer {
	private ctx: CanvasRenderingContext2D;
	private theme: SportTheme;
	private dpr = 1;
	private w = 0;
	private h = 0;
	private phase = 0;

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
		if (playing) this.phase += 0.15 + state.frame.spm / 600;

		ctx.clearRect(0, 0, w, h);

		// Course background gradient.
		const grad = ctx.createLinearGradient(0, 0, 0, h);
		grad.addColorStop(0, theme.courseTop);
		grad.addColorStop(1, theme.courseBottom);
		ctx.fillStyle = grad;
		roundRect(ctx, 0, 0, w, h, 12);
		ctx.fill();

		const pad = 28;
		const trackY = h * 0.62;
		const startX = pad;
		const finishX = w - pad;
		const span = finishX - startX;

		// Distance lane markers (every 10%).
		ctx.strokeStyle = 'rgba(255,255,255,0.08)';
		ctx.lineWidth = 1;
		ctx.fillStyle = 'rgba(255,255,255,0.35)';
		ctx.font = '10px ui-monospace, monospace';
		ctx.textAlign = 'center';
		for (let i = 0; i <= 10; i++) {
			const x = startX + (span * i) / 10;
			ctx.beginPath();
			ctx.moveTo(x, trackY - 18);
			ctx.lineTo(x, trackY + 18);
			ctx.stroke();
			if (i % 5 === 0) {
				const m = Math.round((state.totalDistance * i) / 10);
				ctx.fillText(`${m}m`, x, trackY + 34);
			}
		}

		// Water/track line.
		ctx.strokeStyle = 'rgba(255,255,255,0.15)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(startX, trackY);
		ctx.lineTo(finishX, trackY);
		ctx.stroke();

		const avX = startX + span * clamp01(state.distFrac);

		// Wake/trail behind the avatar.
		const trail = ctx.createLinearGradient(startX, 0, avX, 0);
		trail.addColorStop(0, 'rgba(255,255,255,0)');
		trail.addColorStop(1, hexA(theme.color, 0.5));
		ctx.strokeStyle = trail;
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(startX, trackY);
		for (let x = startX; x <= avX; x += 6) {
			const ripple = Math.sin((x - avX) * 0.25 + this.phase) * 1.5;
			ctx.lineTo(x, trackY + ripple);
		}
		ctx.stroke();

		// Finish flag.
		ctx.font = '20px serif';
		ctx.textAlign = 'center';
		ctx.fillText('🏁', finishX, trackY - 22);

		// Avatar (bobs with stroke phase while playing).
		const bob = playing ? Math.sin(this.phase) * 2 : 0;
		ctx.font = '26px serif';
		ctx.fillText(theme.avatar, avX, trackY - 6 + bob);

		// Progress + pace label above avatar.
		ctx.font = '600 12px ui-monospace, monospace';
		ctx.fillStyle = theme.color;
		ctx.fillText(
			`${Math.round(state.distFrac * 100)}% · ${fmtPace(state.frame.pace)}`,
			avX,
			trackY - 34
		);
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
