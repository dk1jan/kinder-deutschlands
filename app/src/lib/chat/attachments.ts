// Verschlüsselte Anhänge nach Matrix-Spezifikation (AES-256-CTR, SHA-256, JWK; „v2“).
// Bilder werden vorher im Browser verkleinert und neu kodiert – dabei fallen Metadaten wie GPS-Position weg.

export interface EncryptedFile {
	url: string;
	key: JsonWebKey;
	iv: string;
	hashes: { sha256: string };
	v: 'v2';
}

const b64 = (buf: ArrayBuffer | Uint8Array) => {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let s = '';
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return btoa(s).replace(/=+$/, '');
};
const unb64 = (s: string) => {
	const t = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
};

export async function encryptAttachment(data: ArrayBuffer): Promise<{ data: ArrayBuffer; info: Omit<EncryptedFile, 'url'> }> {
	const iv = new Uint8Array(16);
	crypto.getRandomValues(iv.subarray(0, 8)); // untere 64 Bit = Zähler, beginnt bei 0
	const key = await crypto.subtle.generateKey({ name: 'AES-CTR', length: 256 }, true, ['encrypt', 'decrypt']);
	const cipher = await crypto.subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, data);
	const jwk = await crypto.subtle.exportKey('jwk', key);
	const hash = await crypto.subtle.digest('SHA-256', cipher);
	return {
		data: cipher,
		info: { key: { kty: 'oct', key_ops: ['encrypt', 'decrypt'], alg: 'A256CTR', k: jwk.k, ext: true }, iv: b64(iv), hashes: { sha256: b64(hash) }, v: 'v2' }
	};
}

export async function decryptAttachment(cipher: ArrayBuffer, file: Omit<EncryptedFile, 'url'>): Promise<ArrayBuffer> {
	if (!file?.key?.k || !file.iv || !file.hashes?.sha256) throw new Error('Unvollständige Schlüsseldaten');
	const hash = b64(await crypto.subtle.digest('SHA-256', cipher));
	if (hash !== file.hashes.sha256.replace(/=+$/, '')) throw new Error('Datei beschädigt');
	const key = await crypto.subtle.importKey('jwk', { kty: 'oct', k: file.key.k, alg: 'A256CTR', ext: true, key_ops: ['encrypt', 'decrypt'] }, { name: 'AES-CTR' }, false, ['decrypt']);
	return crypto.subtle.decrypt({ name: 'AES-CTR', counter: unb64(file.iv), length: 64 }, key, cipher);
}

/** Bild verkleinern (max. 2000 px) und als JPEG neu kodieren – entfernt EXIF/GPS. */
export async function prepareImage(file: File): Promise<{ blob: Blob; w: number; h: number; thumb: string }> {
	const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
	const max = 2000;
	const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
	const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
	const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', 0.85));
	// kleine, unscharfe Vorschau als Platzhalter (bleibt im verschlüsselten Ereignis)
	const t = document.createElement('canvas');
	const ts = 24 / Math.max(w, h);
	t.width = Math.max(1, Math.round(w * ts));
	t.height = Math.max(1, Math.round(h * ts));
	t.getContext('2d')!.drawImage(bmp, 0, 0, t.width, t.height);
	bmp.close();
	return { blob, w, h, thumb: t.toDataURL('image/jpeg', 0.5) };
}
