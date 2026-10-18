// Kartenstil in den Farben der Wimpelkette (D-013). Basis: Protomaps-Ebenen, eigene Farben je Modus.
// Alles kommt vom eigenen Server: Kacheln (/kacheln), Schriften und Symbole (/karte-assets).
import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

export type MapTheme = 'light' | 'dark';

const LIGHT: Partial<Flavor> = {
	background: '#e8eef1',
	earth: '#f3f5f1',
	water: '#a9d4ec',
	park_a: '#d3e8d6',
	park_b: '#c6e0cb',
	wood_a: '#cfe3cf',
	wood_b: '#c3dbc4',
	scrub_a: '#d8e7d4',
	scrub_b: '#cfe0cb',
	zoo: '#e6e2c4',
	school: '#efe9d9',
	hospital: '#f1e1df',
	pedestrian: '#eef0ec',
	sand: '#f3ead0',
	beach: '#f5ecd2',
	buildings: '#dfe4e7',
	major: '#ffffff',
	highway: '#fff3cf',
	highway_casing_early: '#e7cf8c',
	highway_casing_late: '#e7cf8c',
	minor_a: '#ffffff',
	minor_b: '#ffffff',
	boundaries: '#8aa0b4',
	railway: '#b7c3cf',
	roads_label_minor: '#4a5d71',
	roads_label_minor_halo: '#ffffff',
	roads_label_major: '#2c3e52',
	roads_label_major_halo: '#ffffff',
	ocean_label: '#1a5c9a',
	subplace_label: '#4a5d71',
	subplace_label_halo: '#ffffff',
	city_label: '#0f2238',
	city_label_halo: '#ffffff',
	state_label: '#6a7d91',
	state_label_halo: '#ffffff',
	country_label: '#4a5d71',
	address_label: '#6a7d91',
	address_label_halo: '#ffffff'
};

const DARK: Partial<Flavor> = {
	background: '#081320',
	earth: '#0f1f33',
	water: '#16355a',
	park_a: '#13312f',
	park_b: '#153833',
	wood_a: '#132f2c',
	wood_b: '#15352f',
	scrub_a: '#14302d',
	scrub_b: '#163430',
	zoo: '#2a2c22',
	school: '#1b2537',
	hospital: '#2a1f2a',
	pedestrian: '#13243a',
	sand: '#2a2a24',
	beach: '#2c2b24',
	buildings: '#1a2c44',
	major: '#2a4466',
	highway: '#5a4a1f',
	highway_casing_early: '#3a3418',
	highway_casing_late: '#3a3418',
	minor_a: '#1f3553',
	minor_b: '#1f3553',
	boundaries: '#4f6b8a',
	railway: '#2c405a',
	roads_label_minor: '#a4b5c8',
	roads_label_minor_halo: '#0f1f33',
	roads_label_major: '#cfdae6',
	roads_label_major_halo: '#0f1f33',
	ocean_label: '#93c8f2',
	subplace_label: '#a4b5c8',
	subplace_label_halo: '#0f1f33',
	city_label: '#ecf2f8',
	city_label_halo: '#0a1626',
	state_label: '#8296ab',
	state_label_halo: '#0a1626',
	country_label: '#a4b5c8',
	address_label: '#8296ab',
	address_label_halo: '#0f1f33'
};

export const ATTRIBUTION_TILES = '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a>';
export const ATTRIBUTION_PLACES = 'Orte: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a> (ODbL), Mitglieder · <a href="/karte/quellen">Quellen</a>';

export function flavor(theme: MapTheme): Flavor {
	const base = namedFlavor(theme === 'dark' ? 'dark' : 'light');
	return { ...base, ...(theme === 'dark' ? DARK : LIGHT) } as Flavor;
}

export type Basemap = 'karte' | 'luftbild';

/** Luftbild: Vektorkarte darunter (für kleine Zoomstufen und Lücken), Luftbild ab Zoom 10 darüber, Beschriftung obenauf. */
export function buildStyle(theme: MapTheme, origin: string, tiles: boolean, basemap: Basemap = 'karte', aerialAttribution = ''): StyleSpecification {
	const f = flavor(theme);
	if (basemap === 'luftbild') {
		const base = buildStyle(theme, origin, tiles, 'karte');
		const labels = tiles ? layers('protomaps', flavor('dark'), { labelsOnly: true, lang: 'de' }).map((l) => ({ ...l, id: `lb-${l.id}` })) : [];
		return {
			...base,
			sources: {
				...base.sources,
				luftbild: { type: 'raster', tiles: [`${origin}/luftbild/{z}/{x}/{y}.jpg`], tileSize: 256, minzoom: 10, maxzoom: 19, attribution: aerialAttribution }
			},
			layers: [...base.layers, { id: 'luftbild', type: 'raster', source: 'luftbild', minzoom: 10, paint: { 'raster-fade-duration': 150 } }, ...labels]
		} as StyleSpecification;
	}
	if (!tiles) {
		return {
			version: 8,
			glyphs: `${origin}/karte-assets/fonts/{fontstack}/{range}.pbf`,
			sources: {},
			layers: [{ id: 'background', type: 'background', paint: { 'background-color': f.earth } }]
		};
	}
	return {
		version: 8,
		glyphs: `${origin}/karte-assets/fonts/{fontstack}/{range}.pbf`,
		sprite: `${origin}/karte-assets/sprites/v4/${theme === 'dark' ? 'dark' : 'light'}`,
		sources: {
			protomaps: {
				type: 'vector',
				url: `pmtiles://${origin}/kacheln/basis.pmtiles`,
				attribution: ATTRIBUTION_TILES
			}
		},
		layers: layers('protomaps', f, { lang: 'de' })
	};
}

/** Wirksamer Modus: Auswahl der Person, sonst System. */
export function currentTheme(): MapTheme {
	const t = document.documentElement.dataset.theme;
	if (t === 'dark' || t === 'light') return t;
	return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
