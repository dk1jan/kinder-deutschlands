<script lang="ts">
	// Warnkarte (F-053): aktive Warnungen als Flächen – Wetter (DWD, ab Stufe 2) und Bevölkerungsschutz (NINA).
	// Antippen einer Fläche zeigt alle Warnungen an dieser Stelle mit Link zur Meldung. Farbe nie allein: Liste mit Wort.
	import { onMount } from 'svelte';
	import type { Map as MlMap, MapMouseEvent } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { buildStyle, currentTheme } from '$lib/map/style';
	import Icon from '$lib/components/Icon.svelte';

	let { tiles }: { tiles: boolean } = $props();
	interface Hit {
		id: string;
		p: string;
		l: number;
		t: string;
		k: string;
		q: string;
		a: string;
		b: string | null;
	}
	let el: HTMLDivElement;
	let hits = $state<Hit[]>([]);
	let loadState = $state<'laden' | 'ok' | 'fehler'>('laden');
	let count = $state({ dwd: 0, nina: 0 });

	// Wetter: Stufenfarben wie in der Liste; Bevölkerungsschutz: violett, damit es sich klar vom Wetter abhebt
	const COLOR = ['match', ['get', 'p'], 'nina', '#7b3fa0', ['match', ['get', 'l'], 4, '#7a1f6f', 3, '#d63d31', 2, '#f07f1d', '#f5c400']] as const;
	const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }) : null);

	onMount(() => {
		let map: MlMap | null = null;
		let disposed = false;
		(async () => {
			try {
				const [maplibregl, { Protocol }, { default: workerUrl }] = await Promise.all([
					import('maplibre-gl'),
					import('pmtiles'),
					import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')
				]);
				if (disposed) return;
				maplibregl.setWorkerUrl(workerUrl);
				const w = window as unknown as { __kdPmtiles?: boolean };
				if (!w.__kdPmtiles) {
					maplibregl.addProtocol('pmtiles', new Protocol({ metadata: false }).tile);
					w.__kdPmtiles = true;
				}
				const m = new maplibregl.Map({
					container: el,
					style: buildStyle(currentTheme(), location.origin, tiles),
					center: [10.4, 51.2],
					zoom: 4.8,
					minZoom: 4,
					maxZoom: 14,
					attributionControl: { compact: true },
					cooperativeGestures: true,
					dragRotate: false,
					pitchWithRotate: false,
					touchPitch: false,
					locale: {
						'NavigationControl.ZoomIn': 'Hineinzoomen',
						'NavigationControl.ZoomOut': 'Herauszoomen',
						'AttributionControl.ToggleAttribution': 'Quellenangaben',
						'CooperativeGesturesHandler.WindowsHelpText': 'Strg + Scrollen zum Zoomen',
						'CooperativeGesturesHandler.MacHelpText': '⌘ + Scrollen zum Zoomen',
						'CooperativeGesturesHandler.MobileHelpText': 'Mit zwei Fingern bewegen'
					}
				});
				map = m;
				(el as unknown as { __kdMap?: MlMap }).__kdMap = m; // für Browsertests (Koordinaten → Bildpunkte)
				m.touchZoomRotate.disableRotation();
				m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
				// Quellenangabe zugeklappt starten (ein Tipp auf „i“ zeigt sie) – wie in der Familienkarte
				m.once('load', () => {
					const at = el.querySelector('.maplibregl-ctrl-attrib');
					at?.classList.remove('maplibregl-compact-show');
					at?.removeAttribute('open');
				});
				const res = await fetch('/api/warnungen/karte');
				if (!res.ok) throw new Error(String(res.status));
				const data = (await res.json()) as { features: { properties: Hit }[] };
				count = { dwd: data.features.filter((f) => f.properties.p === 'dwd').length, nina: data.features.filter((f) => f.properties.p === 'nina').length };
				const add = () => {
					if (m.getSource('warn')) return;
					m.addSource('warn', { type: 'geojson', data: data as never, attribution: 'Warnungen: DWD (CC BY 4.0), BBK/NINA' });
					m.addLayer({ id: 'warn-fill', type: 'fill', source: 'warn', paint: { 'fill-color': COLOR as never, 'fill-opacity': ['case', ['==', ['get', 'p'], 'nina'], 0.45, 0.35] } });
					m.addLayer({ id: 'warn-line', type: 'line', source: 'warn', paint: { 'line-color': COLOR as never, 'line-width': ['case', ['==', ['get', 'p'], 'nina'], 2.5, 1] } });
					m.on('click', 'warn-fill', (e: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] }) => {
						const seen = new Set<string>();
						hits = (e.features ?? [])
							.map((f) => f.properties as unknown as Hit)
							.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)))
							.sort((a, b) => (a.p === b.p ? b.l - a.l : a.p === 'nina' ? -1 : 1));
					});
					m.on('click', (e) => {
						if (!m.queryRenderedFeatures(e.point, { layers: ['warn-fill'] }).length) hits = [];
					});
					m.on('mouseenter', 'warn-fill', () => (m.getCanvas().style.cursor = 'pointer'));
					m.on('mouseleave', 'warn-fill', () => (m.getCanvas().style.cursor = ''));
				};
				if (m.isStyleLoaded()) add();
				else m.on('load', add);
				loadState = 'ok';
			} catch {
				loadState = 'fehler';
			}
		})();
		return () => {
			disposed = true;
			map?.remove();
		};
	});
</script>

<div class="wm">
	<div class="map" bind:this={el} role="region" aria-label="Karte der aktuellen Warnungen"></div>
	{#if hits.length}
		<div class="card" aria-live="polite">
			<button type="button" class="x" onclick={() => (hits = [])} aria-label="Schließen"><Icon name="schliessen" size={18} /></button>
			<ul>
				{#each hits.slice(0, 6) as h (h.id)}
					<li class:nina={h.p === 'nina'} style:--c={h.p === 'nina' ? '#7b3fa0' : (['#f5c400', '#f5c400', '#f07f1d', '#d63d31', '#7a1f6f'][h.l] ?? '#f5c400')}>
						<small>{h.q} · {h.p === 'nina' ? h.k : `Stufe ${h.l} · ${h.k}`}</small>
						<a href="/warnungen/{encodeURIComponent(h.id)}"><strong>{h.t}</strong></a>
						{#if h.a || h.b}<small class="muted">{[h.a, h.b ? `bis ${fmt(h.b)}` : null].filter(Boolean).join(' · ')}</small>{/if}
					</li>
				{/each}
			</ul>
			{#if hits.length > 6}<p class="muted more">und {hits.length - 6} weitere an dieser Stelle – näher heranzoomen</p>{/if}
		</div>
	{/if}
	<p class="key">
		{#if loadState === 'fehler'}Die Karte konnte nicht geladen werden – die Liste unten gilt weiter.
		{:else}
			<span class="sw" style:background="#7b3fa0"></span>Bevölkerungsschutz ({count.nina})
			<span class="sw" style:background="#f07f1d"></span>Wetter Stufe 2
			<span class="sw" style:background="#d63d31"></span>Stufe 3
			<span class="sw" style:background="#7a1f6f"></span>Stufe 4
			<span class="muted">· Fläche antippen für Details</span>
		{/if}
	</p>
</div>

<style>
	.wm {
		position: relative;
		margin-bottom: var(--sp-5);
	}
	.map {
		height: min(68vh, 520px);
		border-radius: var(--radius-m);
		overflow: hidden;
		background: var(--surface);
		box-shadow: var(--shadow);
	}
	.card {
		position: absolute;
		z-index: 5;
		top: var(--sp-3);
		left: var(--sp-3);
		/* Platz für die Zoom-Knöpfe rechts oben */
		right: calc(44px + var(--sp-4));
		max-width: 26rem;
		max-height: calc(100% - 2 * var(--sp-3) - 2.4rem);
		overflow: auto;
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		padding: var(--sp-3) var(--sp-3) var(--sp-2);
	}
	.card ul {
		list-style: none;
		margin: 0;
		padding: 0 2rem 0 0;
		display: grid;
		gap: var(--sp-2);
	}
	.card li {
		display: grid;
		gap: 2px;
		padding-left: var(--sp-2);
		border-left: 5px solid var(--c);
	}
	.card a {
		color: var(--ink);
	}
	.x {
		position: absolute;
		top: var(--sp-2);
		right: var(--sp-2);
		border: 0;
		background: var(--paper, transparent);
		border-radius: 50%;
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		cursor: pointer;
		color: var(--ink);
	}
	.more {
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-s);
	}
	.key {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-1) var(--sp-2);
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-s);
	}
	.map :global(.maplibregl-ctrl-attrib a) {
		text-decoration: underline;
	}
	.sw {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 3px;
		margin-left: var(--sp-1);
	}
</style>
