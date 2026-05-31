import { fmtDistance, fmtLogbookDateTime, fmtPace, fmtTime, paceToWatts, SPORT_LABEL } from '../format';
import { themeFor } from './sports';
import type { WorkoutDetail } from '../types';

export interface RaceCardLabels {
	brand: string;
	avgPower: string;
	avgHr: string;
}

const W = 1080;
const H = 1350;

function drawSparkline(
	ctx: CanvasRenderingContext2D,
	strokes: { pace: number }[],
	x: number,
	y: number,
	w: number,
	h: number,
	color: string
) {
	const ps = strokes.map((s) => s.pace).filter((p) => p > 0);
	if (ps.length < 2) return;
	const min = Math.min(...ps);
	const max = Math.max(...ps);
	const span = max - min || 1;
	ctx.strokeStyle = color;
	ctx.lineWidth = 3;
	ctx.beginPath();
	for (let i = 0; i < ps.length; i++) {
		const px = x + (i / (ps.length - 1)) * w;
		const py = y + ((ps[i] - min) / span) * h;
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.stroke();
}

/**
 * Renders a shareable race-card summary (sport, stats, pace sparkline) to a canvas.
 */
export function renderRaceCard(
	canvas: HTMLCanvasElement,
	detail: WorkoutDetail,
	theme: 'light' | 'dark',
	labels: RaceCardLabels
): void {
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2d context unavailable');

	const scale = 2;
	canvas.width = W * scale;
	canvas.height = H * scale;
	canvas.style.width = `${W}px`;
	canvas.style.height = `${H}px`;
	ctx.setTransform(scale, 0, 0, scale, 0, 0);

	const dark = theme === 'dark';
	const bg = dark ? '#18140d' : '#fbf7ee';
	const ink = dark ? '#e7dfce' : '#18140d';
	const ink2 = dark ? '#b5aa96' : '#6a6052';
	const accent = themeFor(detail.sport).color;
	const live = '#dc4327';

	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, W, H);

	// Top rule + brand
	ctx.fillStyle = live;
	ctx.fillRect(0, 0, W, 8);
	ctx.font = '900 42px "Source Sans 3", system-ui, sans-serif';
	ctx.fillStyle = ink;
	ctx.fillText(labels.brand, 56, 88);
	ctx.font = '600 28px "Source Sans 3", system-ui, sans-serif';
	ctx.fillStyle = ink2;
	ctx.fillText('RACE BOARD', 56, 128);

	// Sport + type
	ctx.font = '900 72px "Source Sans 3", system-ui, sans-serif';
	ctx.fillStyle = accent;
	const sportLine = detail.workoutType || SPORT_LABEL[detail.sport];
	ctx.fillText(sportLine, 56, 240);

	ctx.font = '500 32px "Source Code Pro", monospace';
	ctx.fillStyle = ink2;
	ctx.fillText(fmtLogbookDateTime(detail.date), 56, 290);

	// Hero stats
	const avgWatts =
		detail.wattMinutes && detail.time > 0
			? Math.round(detail.wattMinutes / (detail.time / 60))
			: detail.pace > 0
				? Math.round(paceToWatts(detail.pace))
				: 0;
	const hr =
		detail.heartRateAvg != null ? `${Math.round(detail.heartRateAvg)} bpm` : '—';

	ctx.font = '700 120px "Source Code Pro", monospace';
	ctx.fillStyle = ink;
	ctx.fillText(fmtDistance(detail.distance), 56, 440);

	ctx.font = '700 96px "Source Code Pro", monospace';
	ctx.fillText(fmtTime(detail.time, true), 56, 560);

	ctx.font = '700 72px "Source Code Pro", monospace';
	ctx.fillStyle = live;
	ctx.fillText(fmtPace(detail.pace), 56, 660);

	// Secondary stats row
	ctx.font = '600 26px "Source Sans 3", system-ui, sans-serif';
	ctx.fillStyle = ink2;
	const rowY = 740;
	ctx.fillText(`${labels.avgPower}: ${avgWatts} W`, 56, rowY);
	ctx.fillText(`${labels.avgHr}: ${hr}`, 56, rowY + 40);

	// Course strip preview (simplified lane)
	const stripY = 820;
	const stripH = 120;
	ctx.fillStyle = dark ? '#2a251e' : '#efe8da';
	ctx.fillRect(56, stripY, W - 112, stripH);
	ctx.strokeStyle = dark ? '#3d3629' : '#c9bfa9';
	ctx.lineWidth = 2;
	for (let i = 0; i <= 10; i++) {
		const tx = 56 + (i / 10) * (W - 112);
		ctx.beginPath();
		ctx.moveTo(tx, stripY);
		ctx.lineTo(tx, stripY + stripH);
		ctx.stroke();
	}
	// Decorative finish marker at a fixed 72% — this is a summary card, not a
	// live progress readout, so the position is intentionally constant.
	const frac = 0.72;
	const ax = 56 + frac * (W - 112) - 18;
	const ay = stripY + stripH / 2;
	ctx.fillStyle = live;
	ctx.beginPath();
	ctx.arc(ax, ay, 16, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#fbf7ee';
	ctx.font = '700 14px "Source Sans 3", sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText('YOU', ax, ay + 5);
	ctx.textAlign = 'left';

	// Pace sparkline
	ctx.font = '600 24px "Source Sans 3", system-ui, sans-serif';
	ctx.fillStyle = ink2;
	ctx.fillText('PACE', 56, 1000);
	drawSparkline(ctx, detail.strokes, 56, 1020, W - 112, 180, accent);

	ctx.font = '500 22px "Source Code Pro", monospace';
	ctx.fillStyle = ink2;
	ctx.fillText('rowplay · concept2 replay', 56, H - 48);
}

/**
 * Trigger a PNG download of the race card in the browser. Rejects if the
 * canvas cannot be encoded so callers can surface an error instead of
 * silently doing nothing.
 */
export async function downloadRaceCardPng(
	detail: WorkoutDetail,
	theme: 'light' | 'dark',
	labels: RaceCardLabels
): Promise<void> {
	// Wait for the brand/mono webfonts so the PNG matches the UI — canvas falls
	// back to system fonts for any face not yet used in the DOM.
	if (document.fonts?.ready) await document.fonts.ready;

	const canvas = document.createElement('canvas');
	renderRaceCard(canvas, detail, theme, labels);
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('Could not encode race card to PNG.');

	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `rowplay-${detail.id}-race-card.png`;
	a.click();
	URL.revokeObjectURL(url);
}
