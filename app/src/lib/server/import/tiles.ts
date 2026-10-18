// Eigene Kartenkacheln: Ausschnitt aus dem täglichen Protomaps-Weltbuild (OpenStreetMap, ODbL) als eine PMTiles-Datei.
// Der Server lädt nur die Kacheln des eingestellten Gebiets (HTTP-Range), danach kommen Karten ohne Fremdanbieter aus.
import { spawn } from 'node:child_process';
import { mkdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { Sql } from '../db';
import { fetchRetry } from './net';

// Überschreibbar nur für Tests (lokaler Nachbau der Dienste)
export const BUILDS_URL = process.env.PROTOMAPS_BUILDS_URL || 'https://build-metadata.protomaps.dev/builds.json';
export const BUILD_BASE = process.env.PROTOMAPS_BUILD_BASE || 'https://build.protomaps.com/';
export const TILE_FILE = 'basis.pmtiles';

export function tilesDir(): string {
	return process.env.TILES_DIR || join(process.cwd(), '.data', 'tiles');
}

export interface TileState {
	build: string;
	bbox: string;
	maxzoom: number;
	bytes: number;
	updated_at: string;
}

export async function tileState(sql: Sql): Promise<(TileState & { present: boolean }) | null> {
	const [row] = await sql`select value from settings where key = 'tiles'`;
	const v = row?.value as TileState | undefined;
	let present = false;
	try {
		present = (await stat(join(tilesDir(), TILE_FILE))).isFile();
	} catch {
		present = false;
	}
	return v ? { ...v, present } : present ? { build: 'unbekannt', bbox: '', maxzoom: 0, bytes: 0, updated_at: '', present } : null;
}

const BBOX_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?$/;
export function validBbox(b: string): boolean {
	if (!BBOX_RE.test(b)) return false;
	const [w, s, e, n] = b.split(',').map(Number);
	return w < e && s < n && w >= -180 && e <= 180 && s >= -85 && n <= 85;
}

/** Neuester verfügbarer Build-Name, z. B. „20261017.pmtiles“. */
export async function latestBuild(fetchImpl: typeof fetch = fetch): Promise<string> {
	const res = await fetchRetry(BUILDS_URL, { timeoutMs: 30000 }, 3, 10000, fetchImpl).catch((e) => {
		throw new Error(`Build-Liste nicht abrufbar (${(e as Error).message})`);
	});
	const list = (await res.json()) as { key?: string }[];
	const keys = list.map((b) => b.key).filter((k): k is string => !!k && /^\d{8}\.pmtiles$/.test(k)).sort();
	if (!keys.length) throw new Error('Build-Liste ist leer.');
	return keys[keys.length - 1];
}

function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let out = '';
		p.stdout.on('data', (d) => (out = (out + d).slice(-4000)));
		p.stderr.on('data', (d) => (out = (out + d).slice(-4000)));
		const t = setTimeout(() => p.kill('SIGTERM'), timeoutMs);
		p.on('error', (e) => {
			clearTimeout(t);
			reject(new Error(`${bin} konnte nicht gestartet werden: ${e.message}`));
		});
		p.on('close', (code) => {
			clearTimeout(t);
			if (code === 0) resolve(out);
			else reject(new Error(`${bin} beendet mit Code ${code}: ${out.trim().split('\n').slice(-3).join(' ')}`));
		});
	});
}

/** Lädt den Kartenausschnitt neu, wenn es einen neueren Build gibt (oder erzwungen). Gibt Kennzahlen für das Lauf-Protokoll zurück. */
export async function refreshTiles(sql: Sql, cfg: { bbox: string; maxzoom: number }, force: boolean): Promise<{ counts: Record<string, number>; message: string }> {
	if (!validBbox(cfg.bbox)) throw new Error(`Ungültiges Kartengebiet: ${cfg.bbox}`);
	const maxzoom = Math.min(15, Math.max(8, Math.round(cfg.maxzoom || 15)));
	const build = await latestBuild();
	const cur = await tileState(sql);
	if (!force && cur?.present && cur.build === build && cur.bbox === cfg.bbox && cur.maxzoom === maxzoom) {
		return { counts: { bytes: cur.bytes }, message: `Kartendaten aktuell (${build}).` };
	}
	const dir = tilesDir();
	await mkdir(dir, { recursive: true });
	const fs = await statfs(dir);
	const free = fs.bavail * fs.bsize;
	if (free < 3 * 1024 ** 3) throw new Error(`Zu wenig freier Speicher für Kartendaten (${(free / 1024 ** 3).toFixed(1)} GB frei, 3 GB nötig).`);
	const tmp = join(dir, `neu-${Date.now()}.pmtiles`);
	try {
		await run(process.env.PMTILES_BIN || 'pmtiles', ['extract', BUILD_BASE + build, tmp, `--bbox=${cfg.bbox}`, `--maxzoom=${maxzoom}`, '--download-threads=4'], 2 * 60 * 60 * 1000);
		const size = (await stat(tmp)).size;
		if (size < 100 * 1024) throw new Error('Ausschnitt ist unerwartet klein – nicht übernommen.');
		await rename(tmp, join(dir, TILE_FILE));
		const state: TileState = { build, bbox: cfg.bbox, maxzoom, bytes: size, updated_at: new Date().toISOString() };
		await sql`insert into settings (key, value) values ('tiles', ${sql.json(state as never)})
			on conflict (key) do update set value = excluded.value, updated_at = now()`;
		return { counts: { bytes: size }, message: `Kartendaten ${build} geladen (${(size / 1024 ** 2).toFixed(0)} MB).` };
	} finally {
		await rm(tmp, { force: true });
	}
}
