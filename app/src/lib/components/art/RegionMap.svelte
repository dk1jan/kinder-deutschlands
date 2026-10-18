<script lang="ts">
	// Schematische Karte der Startregion (keine exakte Geografie). Orte aus dem Quellenkatalog des Masterprompts.
	let { compact = false }: { compact?: boolean } = $props();
	const P = (lon: number, lat: number) => ({ x: (lon - 7.4) * 118 + 20, y: (54.05 - lat) * 196 + 20 });
	type Place = { name: string; lon: number; lat: number; side?: 'l' | 'r'; dim?: boolean };
	const places: Place[] = [
		{ name: 'Bremerhaven', lon: 8.581, lat: 53.54, side: 'r' },
		{ name: 'Cuxhaven', lon: 8.694, lat: 53.861, side: 'r' },
		{ name: 'Oldenburg', lon: 8.214, lat: 53.144, side: 'l' },
		{ name: 'Osnabrück', lon: 8.047, lat: 52.279, side: 'r' },
		{ name: 'Hannover', lon: 9.732, lat: 52.375, side: 'l' },
		{ name: 'Braunschweig', lon: 10.521, lat: 52.269, side: 'l' },
		{ name: 'Lüneburg', lon: 10.408, lat: 53.248, side: 'l' },
		{ name: 'Hamburg', lon: 9.993, lat: 53.551, side: 'r', dim: true }
	];
	const line = (pts: [number, number][]) =>
		pts
			.map(([lon, lat], i) => {
				const p = P(lon, lat);
				return `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
			})
			.join(' ');
	const weser = line([[8.58, 53.56], [8.48, 53.33], [8.62, 53.17], [8.8, 53.079], [9.0, 52.9], [9.21, 52.64], [9.1, 52.45], [8.92, 52.29], [9.2, 52.1]]);
	const elbe = line([[8.7, 53.87], [9.1, 53.75], [9.48, 53.6], [9.99, 53.53], [10.3, 53.43], [10.57, 53.37], [11.0, 53.2]]);
	const bremen = P(8.802, 53.079);
</script>

<svg viewBox="0 0 460 430" class="map" class:compact role="img" aria-label="Schematische Karte: Startregion Bremen und Niedersachsen mit Bremen, Bremerhaven, Oldenburg, Osnabrück, Hannover, Braunschweig und Lüneburg">
	<!-- Nordsee -->
	<path d="M0 0 H232 C214 22 196 34 184 52 C176 66 170 86 158 102 C146 108 132 112 110 122 C80 124 50 104 0 112 Z" fill="var(--sky)" opacity="0.85" />
	<path d="M0 112 C50 104 80 124 110 122 C132 112 146 108 158 102 C170 86 176 66 184 52 C196 34 214 22 232 0" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round" opacity="0.5" />
	<text x="34" y="62" class="sea">Nordsee</text>
	<!-- Flüsse -->
	<path d={weser} fill="none" stroke="var(--sea)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />
	<path d={elbe} fill="none" stroke="var(--sea)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.55" />
	<!-- Orte -->
	{#each places as p}
		{@const c = P(p.lon, p.lat)}
		<g class:dim={p.dim}>
			<circle cx={c.x} cy={c.y} r="6" fill="var(--white)" stroke="currentColor" stroke-width="3" />
			<text x={p.side === 'l' ? c.x - 12 : c.x + 12} y={c.y + 5} text-anchor={p.side === 'l' ? 'end' : 'start'} class="place">{p.name}</text>
		</g>
	{/each}
	<!-- Bremen: Start-Wimpel -->
	<g transform="translate({bremen.x} {bremen.y})">
		<circle r="20" fill="var(--yellow)" opacity="0.35" />
		<circle r="8" fill="var(--yellow)" stroke="currentColor" stroke-width="3" />
		<line x1="0" y1="-8" x2="0" y2="-52" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" />
		<path d="M0 -52 L34 -41 L0 -30 Z" fill="var(--red)" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />
		<text x="-14" y="26" text-anchor="end" class="place strong">Bremen</text>
	</g>
</svg>

<style>
	.map {
		display: block;
		width: 100%;
		height: auto;
	}
	.place {
		font-family: var(--font-body);
		font-size: 16px;
		fill: currentColor;
	}
	.strong {
		font-family: var(--font-display);
		font-weight: 760;
		font-size: 21px;
	}
	.sea {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 17px;
		fill: currentColor;
		opacity: 0.7;
	}
	.dim {
		opacity: 0.45;
	}
</style>
