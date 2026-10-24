// F-037 / D-088: Live-Ebene gegen echte Datenbank – Stufen, Ablauf, Stoppen, Blockade, Rastern, Löschen.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BACKUP_DIR = mkdtempSync(join(tmpdir(), 'kd-live-'));
import { ensureProfile } from '../src/lib/server/profiles';
import { block, respond, sendRequest } from '../src/lib/server/contacts';
import { contactTarget, LiveError, ownShare, purgeLive, snap, startShare, stopShare, updatePosition, visibleShares } from '../src/lib/server/live';
import { layerData } from '../src/lib/server/layers';
import { deleteAccount } from '../src/lib/server/account';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const BB = { w: 8, s: 52, e: 9, n: 54 };
const POS = { lon: 8.80123, lat: 53.07456 };

d('Live unterwegs (Datenbank)', () => {
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	async function member(name: string) {
		const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${name + '@example.org'}, 'x', now()) returning id`;
		await ensureProfile(sql, x.id);
		await sql`update user_profiles set display_name = ${name} where user_id = ${x.id}`;
		return x.id as string;
	}
	const names = async (viewer: string) => (await visibleShares(sql, viewer, BB)).map((p) => p.name).sort();

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		for (const n of ['anna', 'ben', 'cem', 'dora']) u[n] = await member(n);
		// anna und ben sind Kontakte
		await sendRequest(sql, u.anna, u.ben, null, 'id');
		const [r] = await sql`select id from contact_requests where from_user = ${u.anna} and to_user = ${u.ben}`;
		await respond(sql, u.ben, r.id, true);
	});
	afterAll(async () => {
		await sql.end();
	});

	it('rundet auf die Rasterzelle: gespeichert wird nie der genaue Punkt', async () => {
		const c = snap(POS.lon, POS.lat);
		expect(c).not.toEqual(POS);
		expect(Math.abs(c.lon - POS.lon)).toBeLessThanOrEqual(0.0015);
		expect(Math.abs(c.lat - POS.lat)).toBeLessThanOrEqual(0.001);
		await startShare(sql, u.anna, { audience: 'kontakte', minutes: 30, ...POS });
		const [row] = await sql`select lon, lat from live_shares where user_id = ${u.anna}`;
		expect(row).toEqual(c);
		expect(await ownShare(sql, u.anna)).toMatchObject({ audience: 'kontakte' });
	});

	it('Stufe „Kontakte“: nur Kontakt sieht sie, Fremde und die eigene Person nicht', async () => {
		expect(await names(u.ben)).toEqual(['anna']);
		expect(await names(u.cem)).toEqual([]);
		expect(await names(u.anna)).toEqual([]);
		expect(await contactTarget(sql, u.cem, (await visibleShares(sql, u.ben, BB))[0].id)).toBeNull();
	});

	it('Stufe „Mitglieder“: jedes Mitglied sieht sie, Name nur nach Sichtbarkeit', async () => {
		await startShare(sql, u.anna, { audience: 'mitglieder', minutes: 60, ...POS });
		expect(await names(u.cem)).toEqual(['anna']);
		// Fremde dürfen den Namen nicht sehen → „Eine Familie“
		await sql`update user_profiles set visibility = jsonb_set(visibility, '{display_name}', '"kontakte"') where user_id = ${u.anna}`;
		expect(await names(u.cem)).toEqual(['Eine Familie']);
		expect(await names(u.ben)).toEqual(['anna']);
		await sql`update user_profiles set visibility = jsonb_set(visibility, '{display_name}', '"mitglieder"') where user_id = ${u.anna}`;
	});

	it('Ebene live: nur angemeldet, keine Fremdangaben im Ergebnis', async () => {
		const anon = await layerData(sql, null, BB, ['live']);
		expect(anon.points).toEqual([]);
		const dat = await layerData(sql, u.cem, BB, ['live']);
		expect(dat.points).toHaveLength(1);
		expect(Object.keys(dat.points[0]).sort()).toEqual(['contact', 'href', 'id', 'lat', 'layer', 'lon', 'sub', 'title']);
		expect(dat.points[0]).toMatchObject({ contact: false });
		expect(dat.points[0].sub).toMatch(/^Mitglied · /);
		const fromBen = await layerData(sql, u.ben, BB, ['live']);
		expect(fromBen.points[0]).toMatchObject({ contact: true });
		expect(fromBen.points[0].sub).toMatch(/^Kontakt · /);
		expect(dat.points[0].href).toMatch(/^\/live\/[0-9a-f-]{36}$/);
		expect(JSON.stringify(dat)).not.toContain(u.anna);
	});

	it('Blockade: weder in der einen noch in der anderen Richtung sichtbar, kein Kontaktweg', async () => {
		const id = (await visibleShares(sql, u.cem, BB))[0].id;
		await block(sql, u.cem, u.anna);
		expect(await names(u.cem)).toEqual([]);
		expect(await contactTarget(sql, u.cem, id)).toBeNull();
		await block(sql, u.dora, u.anna);
		await sql`delete from blocks where blocker = ${u.cem}`;
		await sql`delete from blocks where blocker = ${u.dora}`;
		await block(sql, u.anna, u.dora); // Anna blockiert Dora → Dora sieht Anna ebenfalls nicht
		expect(await names(u.dora)).toEqual([]);
		await sql`delete from blocks`;
		expect(await names(u.cem)).toEqual(['anna']);
	});

	it('Kontaktweg liefert die Familien-ID nur, solange die Freigabe sichtbar ist', async () => {
		const id = (await visibleShares(sql, u.cem, BB))[0].id;
		expect(await contactTarget(sql, u.cem, id)).toMatch(/\S/);
		expect(await contactTarget(sql, u.cem, 'kein-uuid')).toBeNull();
		expect(await contactTarget(sql, u.anna, id)).toBeNull(); // eigene Freigabe
	});

	it('Ablauf und Stoppen wirken sofort, ohne auf das Aufräumen zu warten', async () => {
		await sql`update live_shares set expires_at = now() - interval '1 second' where user_id = ${u.anna}`;
		expect(await names(u.cem)).toEqual([]);
		expect(await ownShare(sql, u.anna)).toBeNull();
		expect(await updatePosition(sql, u.anna, POS.lon, POS.lat)).toBeNull();
		expect(await purgeLive(sql)).toBe(1);
		await startShare(sql, u.anna, { audience: 'mitglieder', minutes: 30, ...POS });
		expect(await names(u.cem)).toEqual(['anna']);
		await stopShare(sql, u.anna);
		expect(await names(u.cem)).toEqual([]);
		expect(await layerData(sql, u.cem, BB, ['live'])).toMatchObject({ points: [] });
	});

	it('Positionsupdate verschiebt nur die Zelle, die Ablaufzeit bleibt', async () => {
		const a = await startShare(sql, u.anna, { audience: 'mitglieder', minutes: 30, ...POS });
		const b = await updatePosition(sql, u.anna, POS.lon + 0.01, POS.lat + 0.01);
		expect(b!.expiresAt.getTime()).toBe(a!.expiresAt.getTime());
		expect(b!.lon).not.toBe(a!.lon);
	});

	it('lehnt falsche Eingaben und stumm geschaltete Mitglieder ab', async () => {
		await expect(startShare(sql, u.ben, { audience: 'alle', minutes: 30, ...POS })).rejects.toBeInstanceOf(LiveError);
		await expect(startShare(sql, u.ben, { audience: 'kontakte', minutes: 120, ...POS })).rejects.toBeInstanceOf(LiveError);
		await expect(startShare(sql, u.ben, { audience: 'kontakte', minutes: 30, lon: 0, lat: 0 })).rejects.toBeInstanceOf(LiveError);
		await sql`insert into user_restrictions (user_id, kind, reason) values (${u.ben}, 'stumm', 'Test')`;
		await expect(startShare(sql, u.ben, { audience: 'kontakte', minutes: 30, ...POS })).rejects.toBeInstanceOf(LiveError);
		await sql`delete from user_restrictions where user_id = ${u.ben}`;
	});

	it('Konto löschen entfernt die Freigabe', async () => {
		await startShare(sql, u.dora, { audience: 'mitglieder', minutes: 30, ...POS });
		await deleteAccount(sql, u.dora);
		const [r] = await sql`select count(*)::int as n from live_shares where user_id = ${u.dora}`;
		expect(r.n).toBe(0);
	});
});
