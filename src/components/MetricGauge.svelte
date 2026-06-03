<script lang="ts">
	interface Props {
		label: string;
		/** Pre-formatted display value. */
		display: string;
		/** Current numeric value for the arc. */
		value: number;
		min: number;
		max: number;
		color: string;
		unit?: string;
		/** Overrides `unit` in the field label when set. */
		axisLabel?: string;
	}

	let { label, display, value, min, max, color, unit = '', axisLabel }: Props = $props();

	// Semicircle arc geometry.
	const R = 46;
	const CX = 60;
	const CY = 60;
	const START = Math.PI; // 180deg
	const SWEEP = Math.PI; // half circle

	const frac = $derived(Math.max(0, Math.min(1, (value - min) / (max - min || 1))));

	function pt(angle: number) {
		return [CX + R * Math.cos(angle), CY + R * Math.sin(angle)];
	}

	const arcPath = $derived.by(() => {
		const a0 = START;
		const a1 = START + SWEEP * frac;
		const [x0, y0] = pt(a0);
		const [x1, y1] = pt(a1);
		const large = SWEEP * frac > Math.PI ? 1 : 0;
		return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
	});

	const bgPath = (() => {
		const [x0, y0] = pt(START);
		const [x1, y1] = pt(START + SWEEP);
		return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`;
	})();
</script>

<div class="gauge">
	<svg viewBox="0 0 120 72" aria-hidden="true">
		<path d={bgPath} fill="none" stroke="var(--paper-deep)" stroke-width="6" stroke-linecap="round" />
		<path d={arcPath} fill="none" stroke={color} stroke-width="6" stroke-linecap="round" />
	</svg>
	<div class="readout">
		<div class="value mono" style:color>{display}</div>
		<div class="field-label muted">{label}{axisLabel ?? (unit ? ` · ${unit}` : '')}</div>
	</div>
</div>

<style>
	.gauge {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.5rem 0.25rem;
	}
	svg {
		width: 100%;
		max-width: 130px;
	}
	.readout {
		text-align: center;
		margin-top: -0.5rem;
	}
	.value {
		font-family: var(--display);
		font-size: 1.7rem;
		font-weight: 800;
		line-height: 1;
	}
	.field-label {
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
</style>
