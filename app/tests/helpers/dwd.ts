// Testhilfen für Unwetterwarnungen: ZIP-Schreiber und CAP-Meldungen im Format des DWD (erfundene Testdaten).
import { deflateRawSync } from 'node:zlib';

/** Minimaler ZIP-Schreiber für Testdaten (deflate). */
export function makeZip(files: { name: string; text: string; store?: boolean }[]): Buffer {
	const locals: Buffer[] = [];
	const central: Buffer[] = [];
	let off = 0;
	for (const f of files) {
		const raw = Buffer.from(f.text, 'utf8');
		const data = f.store ? raw : deflateRawSync(raw);
		const name = Buffer.from(f.name, 'utf8');
		const lh = Buffer.alloc(30);
		lh.writeUInt32LE(0x04034b50, 0);
		lh.writeUInt16LE(20, 4);
		lh.writeUInt16LE(f.store ? 0 : 8, 8);
		lh.writeUInt32LE(data.length, 18);
		lh.writeUInt32LE(raw.length, 22);
		lh.writeUInt16LE(name.length, 26);
		locals.push(lh, name, data);
		const ch = Buffer.alloc(46);
		ch.writeUInt32LE(0x02014b50, 0);
		ch.writeUInt16LE(20, 4);
		ch.writeUInt16LE(20, 6);
		ch.writeUInt16LE(f.store ? 0 : 8, 10);
		ch.writeUInt32LE(data.length, 20);
		ch.writeUInt32LE(raw.length, 24);
		ch.writeUInt16LE(name.length, 28);
		ch.writeUInt32LE(off, 42);
		central.push(ch, name);
		off += 30 + name.length + data.length;
	}
	const cd = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(cd.length, 12);
	end.writeUInt32LE(off, 16);
	return Buffer.concat([...locals, cd, end]);
}

/** CAP-Meldung wie beim DWD (Bezirksprodukt, Namensraum ohne Präfix). */
export function cap(o: { id: string; severity?: string; headline?: string; msgType?: string; status?: string; cells?: string[]; refs?: string[]; expires?: string; polygon?: string; event?: string }) {
	const refs = o.refs?.length ? `<references>${o.refs.map((r) => `opendata@dwd.de,${r},2026-10-24T10:00:00+02:00`).join(' ')}</references>` : '';
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
	<identifier>${o.id}</identifier><sender>opendata@dwd.de</sender><sent>2026-10-24T10:00:00+02:00</sent>
	<status>${o.status ?? 'Actual'}</status><msgType>${o.msgType ?? 'Alert'}</msgType><source>PVW</source><scope>Public</scope>${refs}
	<info>
		<language>de-DE</language><category>Met</category><event>${o.event ?? 'ORKANBÖEN'}</event><responseType>Prepare</responseType>
		<urgency>Immediate</urgency><severity>${o.severity ?? 'Severe'}</severity><certainty>Likely</certainty>
		<eventCode><valueName>PROFILE_VERSION</valueName><value>2.1.11</value></eventCode>
		<eventCode><valueName>GROUP</valueName><value>WIND</value></eventCode>
		<effective>2026-10-24T10:00:00+02:00</effective><onset>2026-10-24T12:00:00+02:00</onset>
		<expires>${o.expires ?? '2099-10-24T22:00:00+02:00'}</expires>
		<senderName>Deutscher Wetterdienst</senderName>
		<headline>${o.headline ?? 'Amtliche UNWETTERWARNUNG vor ORKANBÖEN'}</headline>
		<description>Es treten Orkanböen mit Geschwindigkeiten um 120 km/h &amp; mehr auf.</description>
		<instruction>Bleiben Sie in Gebäuden &lt;nicht im Wald&gt;.</instruction>
		<web>https://www.wettergefahren.de</web>
		${(o.cells ?? ['101055000'])
			.map(
				(c) => `<area><areaDesc>Gebiet ${c}</areaDesc>${o.polygon ? `<polygon>${o.polygon}</polygon>` : ''}<geocode><valueName>WARNCELLID</valueName><value>${c}</value></geocode></area>`
			)
			.join('')}
	</info>
</alert>`;
}
