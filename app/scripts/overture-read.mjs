// Liest Overture-Places-Dateien in einem eigenen Prozess (F-030): Das Entpacken und Zerlegen der Parquet-Daten ist
// reine Rechenarbeit und würde sonst die Web-App minutenlang ausbremsen. Aufgerufen von src/lib/server/import/overture.ts.
//
//   node scripts/overture-read.mjs auftrag.json
//
// auftrag.json: { files: [{ url, size }], out: "/pfad/ergebnis.jsonl", bbox: { xmin, xmax, ymin, ymax }, pre: "<RegExp-Quelle>", cats: [..] }
// Ausgabe: je Zeile ein grob vorgefilterter Ort (Deutschland-Rechteck, passende Kategorie oder Kinderwort im Namen);
// die genauen Regeln (classify) wendet die App danach an. Letzte Zeile auf stdout: Statistik als JSON.
import { readFileSync, createWriteStream } from 'node:fs';
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const box = job.bbox;
const pre = new RegExp(job.pre, 'i');
const cats = new Set(job.cats);
const COLUMNS = ['id', 'bbox', 'names', 'taxonomy', 'basic_category', 'confidence', 'websites', 'addresses', 'operating_status'];
const stats = { dateien: 0, gruppen: 0, gruppen_gelesen: 0, zeilen_gelesen: 0, kandidaten: 0 };

async function getRange(url, start, last) {
	let err;
	for (let i = 0; i < 5; i++) {
		try {
			const res = await fetch(url, { headers: { range: `bytes=${start}-${last}` }, signal: AbortSignal.timeout(300000) });
			if (res.status === 206 || res.ok) return await res.arrayBuffer();
			err = new Error(`HTTP ${res.status}`);
			if (res.status < 500 && res.status !== 429) break;
		} catch (e) {
			err = e;
		}
		await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
	}
	throw new Error(`${new URL(url).host}: ${err?.cause?.code ?? err?.message ?? 'Fehler'}`);
}

const num = (v) => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : NaN);
function outside(md, g) {
	const st = (p) => md.row_groups[g].columns.find((c) => c.meta_data?.path_in_schema.join('.') === p)?.meta_data?.statistics;
	const lo = (s) => num(s?.min_value ?? s?.min), hi = (s) => num(s?.max_value ?? s?.max);
	if (hi(st('bbox.xmin')) < box.xmin || lo(st('bbox.xmax')) > box.xmax) return true;
	if (hi(st('bbox.ymin')) < box.ymin || lo(st('bbox.ymax')) > box.ymax) return true;
	return false;
}

const out = createWriteStream(job.out);
const json = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? Number(x) : x));
for (const f of job.files) {
	const file = { byteLength: f.size, slice: (s, e) => getRange(f.url, s, (e ?? f.size) - 1) };
	const md = await parquetMetadataAsync(file);
	const have = new Set(md.schema.map((s) => s.name));
	const columns = COLUMNS.filter((c) => have.has(c));
	stats.dateien++;
	let start = 0;
	for (let g = 0; g < md.row_groups.length; g++) {
		const n = Number(md.row_groups[g].num_rows);
		const from = start;
		start += n;
		stats.gruppen++;
		if (outside(md, g)) continue;
		stats.gruppen_gelesen++;
		stats.zeilen_gelesen += n;
		const rows = await parquetReadObjects({ file, metadata: md, columns, rowStart: from, rowEnd: from + n, compressors });
		for (const r of rows) {
			const b = r.bbox;
			if (!b || b.xmin > box.xmax || b.xmax < box.xmin || b.ymin > box.ymax || b.ymax < box.ymin) continue;
			const cat = r.taxonomy?.primary ?? r.basic_category ?? '';
			if (!cats.has(cat) && !pre.test(r.names?.primary ?? '')) continue;
			stats.kandidaten++;
			out.write(json(r) + '\n');
		}
	}
}
await new Promise((r) => out.end(r));
process.stdout.write(json(stats) + '\n');
