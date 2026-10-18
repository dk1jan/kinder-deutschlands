import type { Features, Kind } from '$lib/places';

/** Ein Ort, wie er aus einer Quelle kommt – vor dem Abgleich mit dem Bestand. */
export interface ImportRecord {
	externalId: string;
	kind: Kind;
	name: string | null;
	lon: number;
	lat: number;
	area: { type: 'Polygon'; coordinates: number[][][] } | null;
	address: Record<string, string>;
	features: Features;
	openingHours: string | null;
	website: string | null;
	url: string | null;
	raw: Record<string, string>;
}

export interface RunCounts {
	gelesen: number;
	neu: number;
	geaendert: number;
	entfernt: number;
	unveraendert: number;
	dubletten?: number;
	[k: string]: number | undefined;
}
