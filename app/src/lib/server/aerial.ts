// Luftbild für die Karte, ausgeliefert über unseren Server (Besucher-IP geht nicht an Dritte).
// - Niedersachsen: LGLN DOP20, offen (CC BY 4.0), wird zwischengespeichert.
// - Optional überall inkl. Bremen: Esri World Imagery mit eigenem Schlüssel (ArcGIS Location Platform),
//   eingetragen in Verwaltung → Einstellungen, verschlüsselt gespeichert. Esri-Kacheln werden nicht dauerhaft gespeichert.
import { mkdir, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Sql } from './db';
import { decrypt, deriveKey, encrypt } from './crypto';
import { tilesDir } from './import/tiles';

export const LGLN_WMS = process.env.LGLN_WMS_URL || 'https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms';
export const ESRI_TILES = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile';
// F-011 (Entscheidung Jan 20.10.): ganz Deutschland, passend zur Grundkarte (D-068). Abrufgrenze je Adresse bleibt.
export const AREA = { w: 5.8, s: 47.2, e: 15.1, n: 55.1 };

let esriKey: string | null = null;
let loaded = false;
let keyCache: Buffer | null = null;
const k = () => (keyCache ??= deriveKey(process.env.APP_SECRET || '', 'settings'));

export async function loadAerial(sql: Sql) {
	const [row] = await sql`select value from settings where key = 'aerial'`;
	esriKey = null;
	if (row?.value?.esri_key_enc) {
		try {
			esriKey = decrypt(row.value.esri_key_enc, k());
		} catch {
			esriKey = null;
		}
	}
	loaded = true;
}
export const aerialLoaded = () => loaded;

export function aerialInfo() {
	const y = new Date().getFullYear();
	return esriKey
		? { provider: 'esri' as const, attribution: 'Luftbild: Esri, Maxar, Earthstar Geographics', bremen: true }
		: { provider: 'lgln' as const, attribution: `Luftbild: LGLN (${y}) CC BY 4.0`, bremen: false };
}

export async function saveEsriKey(sql: Sql, key: string | null) {
	const value = key ? { esri_key_enc: encrypt(key, k()), updated_at: new Date().toISOString() } : {};
	await sql`insert into settings (key, value) values ('aerial', ${sql.json(value as never)})
		on conflict (key) do update set value = excluded.value, updated_at = now()`;
	await loadAerial(sql);
}

/** Kachelgrenzen in Web-Mercator (EPSG:3857). */
export function tileBbox3857(z: number, x: number, y: number) {
	const R = 20037508.342789244;
	const size = (2 * R) / 2 ** z;
	return [-R + x * size, R - (y + 1) * size, -R + (x + 1) * size, R - y * size];
}
export function tileLonLat(z: number, x: number, y: number) {
	const n = 2 ** z;
	const lon = (v: number) => (v / n) * 360 - 180;
	const lat = (v: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * v) / n))) * 180) / Math.PI;
	return { w: lon(x), e: lon(x + 1), n: lat(y), s: lat(y + 1) };
}
export function tileInArea(z: number, x: number, y: number): boolean {
	if (!Number.isInteger(z) || z < 10 || z > 19) return false;
	if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return false;
	const t = tileLonLat(z, x, y);
	return t.e > AREA.w && t.w < AREA.e && t.n > AREA.s && t.s < AREA.n;
}

let active = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
	if (active >= 6) await new Promise<void>((r) => queue.push(r));
	active++;
	try {
		return await fn();
	} finally {
		active--;
		queue.shift()?.();
	}
}

export type TileResult = { body: Uint8Array; type: string; cache: 'speicher' | 'neu' | 'kurz' } | null;

/** Liefert eine Luftbildkachel oder null (außerhalb/leer). Leere LGLN-Kacheln (außerhalb Niedersachsens) gelten als „keine“. */
export async function aerialTile(z: number, x: number, y: number, fetchImpl: typeof fetch = fetch): Promise<TileResult> {
	if (!tileInArea(z, x, y)) return null;
	if (esriKey) {
		const res = await slot(() => fetchImpl(`${ESRI_TILES}/${z}/${y}/${x}?token=${encodeURIComponent(esriKey!)}`, { signal: AbortSignal.timeout(15000) }));
		if (!res.ok) return null;
		return { body: new Uint8Array(await res.arrayBuffer()), type: res.headers.get('content-type') ?? 'image/jpeg', cache: 'kurz' };
	}
	const dir = join(tilesDir(), 'luftbild', String(z), String(x));
	const file = join(dir, `${y}.jpg`);
	try {
		const b = await readFile(file);
		return b.length ? { body: b, type: 'image/jpeg', cache: 'speicher' } : null;
	} catch {
		/* noch nicht im Speicher */
	}
	const bb = tileBbox3857(z, x, y);
	const u = new URL(LGLN_WMS);
	u.search = new URLSearchParams({
		SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: 'ni_dop20', STYLES: '', FORMAT: 'image/jpeg',
		CRS: 'EPSG:3857', WIDTH: '256', HEIGHT: '256', BBOX: bb.map((v) => v.toFixed(2)).join(',')
	}).toString();
	const res = await slot(() => fetchImpl(u, { signal: AbortSignal.timeout(20000) }));
	if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
	const body = new Uint8Array(await res.arrayBuffer());
	await mkdir(dir, { recursive: true });
	// Einfarbige Kachel (außerhalb der Abdeckung, z. B. Bremen) ist winzig – als leer merken
	const empty = body.length < 1500;
	await writeFile(file, empty ? new Uint8Array() : body).catch(() => {});
	return empty ? null : { body, type: 'image/jpeg', cache: 'neu' };
}

/** Zwischenspeicher begrenzen (älteste zuerst löschen). */
export async function pruneAerialCache(maxBytes = 6 * 1024 ** 3) {
	const root = join(tilesDir(), 'luftbild');
	const files: { p: string; t: number; s: number }[] = [];
	async function walk(d: string) {
		let entries;
		try {
			entries = await readdir(d, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			const p = join(d, e.name);
			if (e.isDirectory()) await walk(p);
			else {
				const st = await stat(p).catch(() => null);
				if (st) files.push({ p, t: st.mtimeMs, s: st.size });
			}
		}
	}
	await walk(root);
	let total = files.reduce((a, f) => a + f.s, 0);
	if (total <= maxBytes) return 0;
	files.sort((a, b) => a.t - b.t);
	let n = 0;
	for (const f of files) {
		if (total <= maxBytes * 0.9) break;
		await rm(f.p, { force: true });
		total -= f.s;
		n++;
	}
	return n;
}
