<script lang="ts">
	import { fmtDistance, fmtPace, fmtTime, SPORT_LABEL } from '$lib/format';
	import { getI18nContext } from '$lib/i18n.svelte';
	import {
		asLoggedStroke,
		distancePerStroke,
		type LoggedStroke
	} from '$lib/replay/inspector';
	import { themeFor } from '$lib/replay/sports';
	import type { Sport, Stroke, WorkoutDetail } from '$lib/types';

	let {
		detail,
		rawStroke = null,
		progress = 0,
		splitIndex = null,
		isPublic = false
	}: {
		detail: WorkoutDetail;
		rawStroke?: Stroke | null;
		progress?: number;
		splitIndex?: number | null;
		isPublic?: boolean;
	} = $props();

	const i18n = getI18nContext();
	const t = $derived(i18n.translate);

	const logged = $derived(rawStroke ? asLoggedStroke(rawStroke, detail.sport) : null);
	const dps = $derived(rawStroke ? distancePerStroke(rawStroke) : undefined);
	const sportTheme = $derived(themeFor(detail.sport));

	type RowKind = 'stroke' | 'derived';
	interface Row {
		key: string;
		token: string;
		desc: string;
		asLogged?: string;
		normalized: string;
		derivedOnly?: boolean;
		kind: RowKind;
		testId?: string;
	}

	function fmtLogged(log: LoggedStroke, field: keyof LoggedStroke): string {
		const v = log[field];
		return v == null ? '—' : String(v);
	}

	const strokeRows = $derived.by((): Row[] => {
		if (!rawStroke || !logged) return [];
		const s = rawStroke;
		const l = logged;
		const rows: Row[] = [
			{
				key: 't',
				token: 't',
				desc: t('inspector.fieldT'),
				asLogged: fmtLogged(l, 't'),
				normalized: fmtTime(s.t, true),
				kind: 'stroke',
				testId: 'inspector-raw-t'
			},
			{
				key: 'd',
				token: 'd',
				desc: t('inspector.fieldD'),
				asLogged: fmtLogged(l, 'd'),
				normalized: fmtDistance(s.d),
				kind: 'stroke'
			},
			{
				key: 'p',
				token: 'p',
				desc: t('inspector.fieldP'),
				asLogged: fmtLogged(l, 'p'),
				normalized: fmtPace(s.pace),
				kind: 'stroke',
				testId: 'inspector-raw-p'
			},
			{
				key: 'spm',
				token: 'spm',
				desc: t('inspector.fieldSpm'),
				asLogged: `${fmtLogged(l, 'spm')} ${sportTheme.cadenceUnit}`,
				normalized: `${Math.round(s.spm)} ${sportTheme.cadenceUnit}`,
				kind: 'stroke'
			}
		];
		if (s.hr != null) {
			rows.push({
				key: 'hr',
				token: 'hr',
				desc: t('inspector.fieldHr'),
				asLogged: fmtLogged(l, 'hr'),
				normalized: `${Math.round(s.hr)} bpm`,
				kind: 'stroke'
			});
		}
		rows.push({
			key: 'watts',
			token: 'watts',
			desc: t('inspector.fieldWatts'),
			normalized: `${Math.round(s.watts)} W`,
			derivedOnly: true,
			kind: 'stroke'
		});
		return rows;
	});

	const derivedRows = $derived.by((): Row[] => {
		const rows: Row[] = [
			{
				key: 'progress',
				token: 'progress',
				desc: t('inspector.fieldProgress'),
				normalized: `${(progress * 100).toFixed(1)}%`,
				kind: 'derived'
			}
		];
		if (splitIndex != null) {
			rows.push({
				key: 'split',
				token: 'split',
				desc: detail.isInterval ? t('inspector.fieldInterval') : t('inspector.fieldSplit'),
				normalized: String(splitIndex + 1),
				kind: 'derived'
			});
		}
		if (dps != null) {
			rows.push({
				key: 'dps',
				token: 'dps',
				desc: t('inspector.fieldDps'),
				normalized: `${dps.toFixed(2)} m`,
				kind: 'derived'
			});
		}
		return rows;
	});

	const meta = $derived(detail.metadata);
	const provenanceRows = $derived.by(() => {
		const rows: { key: string; label: string; value: string }[] = [];
		if (meta) {
			if (meta.pmVersion != null) rows.push({ key: 'pm', label: t('inspector.metaPm'), value: String(meta.pmVersion) });
			if (meta.firmwareVersion) rows.push({ key: 'fw', label: t('inspector.metaFirmware'), value: meta.firmwareVersion });
			if (meta.ergModelType != null) rows.push({ key: 'erg', label: t('inspector.metaErg'), value: String(meta.ergModelType) });
			if (meta.hrType) rows.push({ key: 'hr', label: t('inspector.metaHrSensor'), value: meta.hrType });
			if (!isPublic) {
				if (meta.serialNumber) rows.push({ key: 'sn', label: t('inspector.metaSerial'), value: meta.serialNumber });
				if (meta.device) rows.push({ key: 'dev', label: t('inspector.metaDevice'), value: meta.device });
			}
		}
		if (detail.source) rows.push({ key: 'src', label: t('inspector.metaSource'), value: detail.source });
		return rows;
	});
</script>

<section class="inspector" aria-label={t('inspector.panelLabel')}>
	<div class="section">
		<h3 class="stitle muted">{t('inspector.sectionWorkout')}</h3>
		<dl class="static-grid">
			<div><dt>{t('inspector.staticSport')}</dt><dd>{SPORT_LABEL[detail.sport]}</dd></div>
			<div><dt>{t('inspector.staticDistance')}</dt><dd class="mono">{fmtDistance(detail.distance)}</dd></div>
			<div><dt>{t('inspector.staticTime')}</dt><dd class="mono">{fmtTime(detail.time, true)}</dd></div>
			<div><dt>{t('inspector.staticDrag')}</dt><dd class="mono">{detail.dragFactor ?? '—'}</dd></div>
			<div><dt>{t('inspector.staticType')}</dt><dd>{detail.workoutType || '—'}</dd></div>
			<div>
				<dt>{t('inspector.staticResolution')}</dt>
				<dd class="mono">
					{detail.strokes.length} {t('replay.samples')} · {detail.hasStrokeData
						? t('replay.perStroke')
						: t('replay.fromSplits')}
				</dd>
			</div>
		</dl>
	</div>

	{#if provenanceRows.length}
		<div class="section">
			<h3 class="stitle muted">{t('inspector.sectionProvenance')}</h3>
			<dl class="static-grid">
				{#each provenanceRows as row (row.key)}
					<div><dt>{row.label}</dt><dd class="mono">{row.value}</dd></div>
				{/each}
			</dl>
		</div>
	{/if}

	<div class="section">
		<h3 class="stitle muted">{t('inspector.sectionPerStroke')}</h3>
		{#if !rawStroke}
			<p class="note muted">{t('inspector.noStrokeData')}</p>
		{:else}
			<div class="table-wrap" role="region" aria-label={t('inspector.tableLabel')}>
				<table class="readout">
					<thead>
						<tr>
							<th scope="col">{t('inspector.colField')}</th>
							<th scope="col">{t('inspector.colAsLogged')}</th>
							<th scope="col">{t('inspector.colNormalized')}</th>
						</tr>
					</thead>
					<tbody>
						{#each strokeRows as row (row.key)}
							<tr>
								<th scope="row">
									<span class="token mono">{row.token}</span>
									<span class="desc muted">{row.desc}</span>
								</th>
								<td class="mono as-logged" data-testid={row.testId}>
									{#if row.derivedOnly}
										<span class="tag muted">{t('inspector.derived')}</span>
									{:else}
										{row.asLogged}
									{/if}
								</td>
								<td class="mono">{row.normalized}</td>
							</tr>
						{/each}
						{#each derivedRows as row (row.key)}
							<tr class="derived">
								<th scope="row">
									<span class="token mono">{row.token}</span>
									<span class="desc muted">{row.desc}</span>
								</th>
								<td class="mono muted">—</td>
								<td class="mono">{row.normalized}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</section>

<style>
	.inspector {
		font-size: 0.82rem;
	}
	.section + .section {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
	}
	.stitle {
		font-family: var(--display);
		font-size: var(--text-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 0.5rem;
	}
	.static-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: var(--space-xs) var(--space-lg);
		margin: 0;
	}
	.static-grid dt {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-3);
	}
	.static-grid dd {
		margin: 0;
	}
	.note {
		margin: 0;
		font-size: 0.8rem;
	}
	.table-wrap {
		overflow-x: auto;
	}
	.readout {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
	}
	.readout th,
	.readout td {
		padding: 0.3rem 0.5rem;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid var(--line);
	}
	.readout thead th {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-3);
		font-weight: var(--fw-semibold);
	}
	.readout th[scope='row'] {
		width: 8rem;
		font-weight: var(--fw-medium);
	}
	.readout .as-logged {
		width: 5.5rem;
	}
	.readout td:last-child {
		width: 7rem;
	}
	.token {
		display: block;
		font-weight: var(--fw-semibold);
	}
	.desc {
		display: block;
		font-size: 0.68rem;
		font-family: var(--sans);
	}
	.derived th[scope='row'] .token {
		font-style: italic;
	}
	.tag {
		font-size: 0.68rem;
		font-family: var(--sans);
	}
</style>
