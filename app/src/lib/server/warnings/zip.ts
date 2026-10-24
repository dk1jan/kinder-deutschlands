// Kleiner ZIP-Leser (nur „stored“ und „deflate“) für die Warnpakete des DWD – ohne Zusatzbibliothek.
// Schutz gegen übergroße Archive: höchstens 5 000 Einträge und 64 MB entpackt.
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
	name: string;
	data: Buffer;
}

const MAX_ENTRIES = 5000;
const MAX_TOTAL = 64 * 1024 * 1024;

export function unzip(buf: Buffer): ZipEntry[] {
	// Ende des zentralen Verzeichnisses suchen (steht am Schluss, höchstens 64 KB Kommentar dahinter)
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error('Kein gültiges ZIP-Archiv.');
	const count = buf.readUInt16LE(eocd + 10);
	let p = buf.readUInt32LE(eocd + 16);
	if (count > MAX_ENTRIES) throw new Error('ZIP-Archiv hat zu viele Einträge.');
	const out: ZipEntry[] = [];
	let total = 0;
	for (let n = 0; n < count; n++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt.');
		const method = buf.readUInt16LE(p + 10);
		const csize = buf.readUInt32LE(p + 20);
		const usize = buf.readUInt32LE(p + 24);
		const nlen = buf.readUInt16LE(p + 28);
		const elen = buf.readUInt16LE(p + 30);
		const clen = buf.readUInt16LE(p + 32);
		const local = buf.readUInt32LE(p + 42);
		const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
		p += 46 + nlen + elen + clen;
		if (name.endsWith('/')) continue;
		if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('ZIP-Eintrag beschädigt.');
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
		const raw = buf.subarray(start, start + csize);
		total += usize;
		if (total > MAX_TOTAL) throw new Error('ZIP-Archiv ist entpackt zu groß.');
		let data: Buffer;
		if (method === 0) data = Buffer.from(raw);
		else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: Math.max(usize, 1) + 1024 });
		else throw new Error(`ZIP-Verfahren ${method} wird nicht unterstützt.`);
		out.push({ name, data });
	}
	return out;
}
