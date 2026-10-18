import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { tilesDir, TILE_FILE } from '$lib/server/import/tiles';

// Eigene Vektorkacheln (PMTiles) mit HTTP-Range – der Browser lädt nur die sichtbaren Kacheln.
export const GET: RequestHandler = async ({ params, request }) => {
	if (params.file !== TILE_FILE) error(404, 'Nicht gefunden.');
	const path = join(tilesDir(), TILE_FILE);
	let size: number;
	let mtime: number;
	try {
		const s = await stat(path);
		size = s.size;
		mtime = s.mtimeMs;
	} catch {
		error(404, 'Kartendaten werden noch eingerichtet.');
	}
	const etag = `"${size.toString(36)}-${Math.floor(mtime).toString(36)}"`;
	const base = {
		'accept-ranges': 'bytes',
		etag,
		'content-type': 'application/octet-stream',
		'cache-control': 'public, max-age=3600'
	};
	const range = request.headers.get('range');
	const ifRange = request.headers.get('if-range');
	if (range && (!ifRange || ifRange === etag)) {
		const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
		if (!m || (m[1] === '' && m[2] === '')) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } });
		let start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
		let end = m[1] === '' ? size - 1 : m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
		if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } });
		// Einzelne Anfragen begrenzen (PMTiles fragt kleine Blöcke ab)
		if (end - start > 64 * 1024 * 1024) end = start + 64 * 1024 * 1024 - 1;
		const body = Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream;
		return new Response(body, { status: 206, headers: { ...base, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
	}
	if (request.method === 'HEAD') return new Response(null, { headers: { ...base, 'content-length': String(size) } });
	error(416, 'Bitte mit Range-Anfrage abrufen.');
};
