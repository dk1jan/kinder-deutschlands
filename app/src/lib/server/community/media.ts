// Bilder: werden neu kodiert (WebP), gedreht nach EXIF und ohne Metadaten gespeichert – keine GPS-Daten, keine Kamera-Infos.
import sharp from 'sharp';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Sql } from '../db';

export function mediaDir(): string {
	return process.env.MEDIA_DIR || join(process.cwd(), '.data', 'media');
}

const path = (id: string) => join(mediaDir(), id.slice(0, 2), `${id}.webp`);

export class MediaError extends Error {}

export const MAX_UPLOAD = 12 * 1024 * 1024;
const ALLOWED = ['jpeg', 'png', 'webp', 'avif', 'gif', 'heif'];

/** Bild prüfen und neu kodieren. Gibt WebP-Daten und Maße zurück. */
export async function processImage(input: Buffer, maxSide = 2000): Promise<{ data: Buffer; width: number; height: number }> {
	if (input.length > MAX_UPLOAD) throw new MediaError('Bild ist größer als 12 MB.');
	let meta;
	try {
		meta = await sharp(input, { limitInputPixels: 60_000_000, failOn: 'error' }).metadata();
	} catch {
		throw new MediaError('Das ist kein lesbares Bild.');
	}
	if (!meta.format || !ALLOWED.includes(meta.format)) throw new MediaError('Bitte JPEG, PNG, WebP oder AVIF hochladen.');
	const out = await sharp(input, { limitInputPixels: 60_000_000, animated: false })
		.rotate()
		.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
		.webp({ quality: 80 })
		.toBuffer({ resolveWithObject: true });
	return { data: out.data, width: out.info.width, height: out.info.height };
}

export async function storeImage(
	sql: Sql,
	input: Buffer,
	o: { ownerId: string | null; purpose: 'beitrag' | 'ort' | 'linkvorschau'; postId?: string | null; placeId?: string | null; alt?: string | null; status?: 'sichtbar' | 'pruefung'; maxSide?: number }
): Promise<string> {
	const img = await processImage(input, o.maxSide);
	const [m] = await sql`insert into media (owner_id, post_id, place_id, purpose, mime, width, height, bytes, alt, status)
		values (${o.ownerId}, ${o.postId ?? null}, ${o.placeId ?? null}, ${o.purpose}, 'image/webp', ${img.width}, ${img.height}, ${img.data.length},
			${o.alt ?? null}, ${o.status ?? 'sichtbar'}) returning id`;
	const p = path(m.id);
	await mkdir(join(mediaDir(), String(m.id).slice(0, 2)), { recursive: true });
	await writeFile(p, img.data);
	return m.id as string;
}

export async function readImage(id: string): Promise<Buffer | null> {
	try {
		return await readFile(path(id));
	} catch {
		return null;
	}
}

export async function deleteImageFile(id: string) {
	await rm(path(id), { force: true });
}
