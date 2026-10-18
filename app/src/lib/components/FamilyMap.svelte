<script lang="ts" module>
	export interface MapFeature {
		id: string;
		k: string;
		n: string;
		f: string;
		lon: number;
		lat: number;
	}
	export interface MapView {
		center: [number, number];
		zoom: number;
		bounds: [number, number, number, number];
	}
</script>

<script lang="ts">
	// Gemeinsame Familienkarte (M10). Modi: „browse“ (Karte mit Orten), „mini“ (ein Ort), „pick“ (Ort setzen).
	import { onMount } from 'svelte';
	import type { Map as MlMap, GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { buildStyle, currentTheme, ATTRIBUTION_PLACES, type MapTheme } from '$lib/map/style';
	import { addMarkerImages } from '$lib/map/markers';

	interface Props {
		mode?: 'browse' | 'mini' | 'pick';
		tiles: boolean;
		center: [number, number];
		zoom: number;
		filters?: string[];
		features?: string[];
		selected?: string | null;
		points?: { lon: number; lat: number; kind: string }[];
		label?: string;
		onSelect?: (f: MapFeature | null) => void;
		onData?: (f: MapFeature[], state: 'ok' | 'zoom' | 'error' | 'truncated') => void;
		onView?: (v: MapView) => void;
		onPick?: (lon: number, lat: number) => void;
	}
	let {
		mode = 'browse',
		tiles,
		center,
		zoom,
		filters = [],
		features = [],
		selected = null,
		points = [],
		label = 'Karte',
		onSelect,
		onData,
		onView,
		onPick
	}: Props = $props();

	let el: HTMLDivElement;
	let map: MlMap | null = null;
	let ready = $state(false);
	let failed = $state(false);
	let theme: MapTheme = 'light';
	let data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
	let me: [number, number] | null = null;
	let loadedKey = '';
	let ctrl: AbortController | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	const MIN_ZOOM_DATA = 8;

	function overlay() {
		if (!map) return;
		addMarkerImages(map, theme);
		map.addSource('orte', {
			type: 'geojson',
			data: mode === 'browse' ? data : {
				type: 'FeatureCollection',
				features: points.map((p, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { id: String(i), k: p.kind } }))
			},
			cluster: mode === 'browse',
			clusterRadius: 46,
			clusterMaxZoom: 14,
			attribution: ATTRIBUTION_PLACES
		});
		const dark = theme === 'dark';
		if (mode === 'browse') {
			map.addLayer({
				id: 'cluster',
				type: 'circle',
				source: 'orte',
				filter: ['has', 'point_count'],
				paint: {
					'circle-color': dark ? '#ffc53d' : '#0f2238',
					'circle-radius': ['step', ['get', 'point_count'], 17, 25, 21, 100, 26, 500, 31],
					'circle-stroke-width': 3,
					'circle-stroke-color': dark ? '#0a1626' : '#ffc53d'
				}
			});
			map.addLayer({
				id: 'cluster-n',
				type: 'symbol',
				source: 'orte',
				filter: ['has', 'point_count'],
				layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Medium'], 'text-size': 13, 'text-allow-overlap': true },
				paint: { 'text-color': dark ? '#0f2238' : '#ffffff' }
			});
		}
		map.addLayer({
			id: 'orte',
			type: 'symbol',
			source: 'orte',
			filter: ['!', ['has', 'point_count']],
			layout: {
				'icon-image': ['case', ['==', ['get', 'id'], selected ?? ''], ['concat', 'm-', ['get', 'k'], '-sel'], ['concat', 'm-', ['get', 'k']]],
				'icon-anchor': 'bottom',
				'icon-allow-overlap': true,
				'symbol-sort-key': ['case', ['==', ['get', 'id'], selected ?? ''], 1, 0]
			}
		});
		map.addSource('me', { type: 'geojson', data: meData() });
		map.addLayer({ id: 'me', type: 'symbol', source: 'me', layout: { 'icon-image': 'm-me', 'icon-allow-overlap': true } });
	}

	function meData(): GeoJSON.FeatureCollection {
		return { type: 'FeatureCollection', features: me ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: me }, properties: {} }] : [] };
	}

	function view(): MapView {
		const b = map!.getBounds();
		const c = map!.getCenter();
		return { center: [c.lng, c.lat], zoom: map!.getZoom(), bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] };
	}

	function emitData(state: 'ok' | 'zoom' | 'error' | 'truncated') {
		onData?.(
			data.features.map((f) => {
				const p = f.properties as Record<string, string>;
				const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
				return { id: p.id, k: p.k, n: p.n, f: p.f ?? '', lon, lat };
			}),
			state
		);
	}

	async function load(force = false) {
		if (!map || mode !== 'browse') return;
		const z = map.getZoom();
		if (z < MIN_ZOOM_DATA) {
			data = { type: 'FeatureCollection', features: [] };
			(map.getSource('orte') as GeoJSONSource | undefined)?.setData(data);
			loadedKey = '';
			emitData('zoom');
			return;
		}
		const b = map.getBounds();
		// Großzügig nachladen, damit kleines Verschieben keine neue Anfrage braucht
		const padX = (b.getEast() - b.getWest()) * 0.35;
		const padY = (b.getNorth() - b.getSouth()) * 0.35;
		const want = [b.getWest() - padX, b.getSouth() - padY, b.getEast() + padX, b.getNorth() + padY].map((n) => Math.round(n * 1000) / 1000);
		const fkey = `${filters.join(',')}|${features.join(',')}`;
		if (!force && loadedKey) {
			const [lk, lb] = loadedKey.split('#');
			const [w, s, e, n] = lb.split(',').map(Number);
			if (lk === fkey && b.getWest() >= w && b.getSouth() >= s && b.getEast() <= e && b.getNorth() <= n) return;
		}
		ctrl?.abort();
		ctrl = new AbortController();
		const q = new URLSearchParams({ bbox: want.join(','), k: filters.join(','), m: features.join(',') });
		try {
			const res = await fetch(`/api/orte?${q}`, { signal: ctrl.signal });
			if (!res.ok) throw new Error(String(res.status));
			const fc = await res.json();
			data = fc;
			(map.getSource('orte') as GeoJSONSource | undefined)?.setData(data);
			loadedKey = `${fkey}#${want.join(',')}`;
			emitData(fc.truncated ? 'truncated' : 'ok');
		} catch (e) {
			if ((e as Error).name !== 'AbortError') emitData('error');
		}
	}

	function schedule(force = false) {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => load(force), 220);
	}

	export function flyTo(lon: number, lat: number, z?: number) {
		map?.flyTo({ center: [lon, lat], zoom: z ?? Math.max(map.getZoom(), 15), essential: true, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900 });
	}
	export function fitBounds(b: [number, number, number, number]) {
		map?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, maxZoom: 15, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900 });
	}
	export function showMe(lon: number, lat: number) {
		me = [lon, lat];
		(map?.getSource('me') as GeoJSONSource | undefined)?.setData(meData());
	}
	export function getView(): MapView | null {
		return map ? view() : null;
	}

	// Filter geändert → neu laden
	$effect(() => {
		void filters.join(',');
		void features.join(',');
		if (ready) schedule(true);
	});
	// Auswahl geändert → Markierung hervorheben
	$effect(() => {
		const s = selected ?? '';
		if (!ready || !map?.getLayer('orte')) return;
		map.setLayoutProperty('orte', 'icon-image', ['case', ['==', ['get', 'id'], s], ['concat', 'm-', ['get', 'k'], '-sel'], ['concat', 'm-', ['get', 'k']]]);
		map.setLayoutProperty('orte', 'symbol-sort-key', ['case', ['==', ['get', 'id'], s], 1, 0]);
	});

	onMount(() => {
		let disposed = false;
		let mq: MediaQueryList | null = null;
		let mo: MutationObserver | null = null;
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
				theme = currentTheme();
				const m = new maplibregl.Map({
					container: el,
					style: buildStyle(theme, location.origin, tiles),
					center,
					zoom,
					minZoom: 5,
					maxZoom: 19,
					attributionControl: { compact: true },
					cooperativeGestures: mode === 'mini',
					interactive: true,
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
				m.touchZoomRotate.disableRotation();
				if (mode !== 'mini') m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
				// Quellenangabe zugeklappt starten (ein Tipp auf „i“ zeigt sie) – sonst verdeckt sie auf dem Handy die Karte
				m.once('load', () => {
					const a = el.querySelector('.maplibregl-ctrl-attrib');
					a?.classList.remove('maplibregl-compact-show');
					a?.removeAttribute('open');
				});
				m.on('style.load', () => {
					overlay();
					ready = true;
					if (mode === 'browse') load(true);
					if (mode === 'pick') {
						const c = m.getCenter();
						onPick?.(Math.round(c.lng * 1e6) / 1e6, Math.round(c.lat * 1e6) / 1e6);
					}
				});
				m.on('error', (e) => {
					// Fehlende Kacheln/Schriften dürfen die Karte nicht leer machen – Orte bleiben sichtbar
					if (String(e.error?.message ?? '').includes('basis.pmtiles')) console.warn('Kartenhintergrund nicht verfügbar');
				});
				m.on('moveend', () => {
					onView?.(view());
					if (mode === 'browse') schedule();
					if (mode === 'pick') {
						const c = m.getCenter();
						onPick?.(Math.round(c.lng * 1e6) / 1e6, Math.round(c.lat * 1e6) / 1e6);
					}
				});
				if (mode === 'browse') {
					m.on('click', 'cluster', async (e) => {
						const f = e.features?.[0] as MapGeoJSONFeature | undefined;
						if (!f) return;
						const z = await (m.getSource('orte') as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id as number);
						m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.3 });
					});
					m.on('click', 'orte', (e) => {
						const f = e.features?.[0] as MapGeoJSONFeature | undefined;
						if (!f) return;
						const p = f.properties as Record<string, string>;
						const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
						onSelect?.({ id: p.id, k: p.k, n: p.n, f: p.f ?? '', lon, lat });
					});
					m.on('click', (e) => {
						const hits = m.queryRenderedFeatures(e.point, { layers: ['orte', 'cluster'] });
						if (!hits.length) onSelect?.(null);
					});
					for (const l of ['orte', 'cluster']) {
						m.on('mouseenter', l, () => (m.getCanvas().style.cursor = 'pointer'));
						m.on('mouseleave', l, () => (m.getCanvas().style.cursor = ''));
					}
				}
				map = m;

				// Modus folgt der Einstellung (System oder Auswahl im Profil)
				const restyle = () => {
					const t = currentTheme();
					if (t === theme || !map) return;
					theme = t;
					ready = false;
					map.setStyle(buildStyle(theme, location.origin, tiles), { diff: false });
				};
				mq = matchMedia('(prefers-color-scheme: dark)');
				mq.addEventListener('change', restyle);
				mo = new MutationObserver(restyle);
				mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
			} catch (e) {
				console.error(e);
				failed = true;
			}
		})();
		return () => {
			disposed = true;
			mq?.removeEventListener('change', () => {});
			mo?.disconnect();
			ctrl?.abort();
			map?.remove();
			map = null;
		};
	});
</script>

<div class="wrap" class:pick={mode === 'pick'}>
	<div class="map" bind:this={el} role="region" aria-label={label}></div>
	{#if mode === 'pick'}
		<div class="cross" aria-hidden="true">
			<svg width="40" height="50" viewBox="0 0 40 50"><path d="M20 47 C20 47 5 31 5 19.5 A15 15 0 1 1 35 19.5 C35 31 20 47 20 47 Z" fill="#d63d31" stroke="#fff" stroke-width="2.5" /><circle cx="20" cy="19.5" r="5" fill="#fff" /></svg>
		</div>
	{/if}
	{#if failed}
		<p class="fail">Die Karte konnte in diesem Browser nicht geladen werden (WebGL nötig). Die Liste funktioniert weiterhin.</p>
	{:else if !ready}
		<p class="loading" aria-live="polite">Karte wird geladen …</p>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		width: 100%;
		height: 100%;
		background: var(--surface-2);
	}
	.map {
		position: absolute;
		inset: 0;
	}
	.loading,
	.fail {
		position: absolute;
		inset: auto 0 50% 0;
		margin: 0 auto;
		width: fit-content;
		max-width: 80%;
		padding: var(--sp-2) var(--sp-4);
		border-radius: 999px;
		background: var(--surface);
		box-shadow: var(--shadow);
		font-size: var(--fs-s);
		text-align: center;
	}
	.fail {
		border-radius: var(--radius-m);
	}
	.cross {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -100%);
		pointer-events: none;
		filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.35));
	}
	.wrap :global(.maplibregl-ctrl-attrib) {
		font-size: 11px;
	}
	/* Mobil zoomt man mit zwei Fingern – die Knöpfe würden unter Suche und Filtern liegen */
	@media (max-width: 959px) {
		.wrap :global(.maplibregl-ctrl-top-right) {
			display: none;
		}
	}
	.wrap :global(.maplibregl-ctrl-group) {
		border-radius: 12px;
		overflow: hidden;
		box-shadow: var(--shadow);
	}
	.wrap :global(.maplibregl-ctrl-group button) {
		width: 40px;
		height: 40px;
	}
	:global([data-theme='dark']) .wrap :global(.maplibregl-ctrl-group),
	:global([data-theme='dark']) .wrap :global(.maplibregl-ctrl-attrib) {
		filter: invert(0.92) hue-rotate(180deg);
	}
</style>
