// Vor jedem Start: Datenbank sichern (falls Migrationen anstehen), Migrationen einspielen,
// bei unvollständigem Setup ein neues Einmal-Token erzeugen und ins Log schreiben.
// Bricht bei jedem Fehler mit Exit-Code 1 ab – der Server startet dann NICHT.
import postgres from 'postgres';
import { readdir, readFile, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || join(here, '..', 'migrations');
const BACKUP_DIR = process.env.BACKUP_DIR || '';
const KEEP_BACKUPS = 10;

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('[migrate] DATABASE_URL fehlt.');
	process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function waitForDb() {
	for (let i = 1; i <= 30; i++) {
		try {
			await sql`select 1`;
			return;
		} catch (e) {
			console.log(`[migrate] Warte auf Datenbank (${i}/30) …`);
			await new Promise((r) => setTimeout(r, 2000));
		}
	}
	throw new Error('Datenbank nicht erreichbar.');
}

function runPgDump(file) {
	return new Promise((resolve, reject) => {
		const p = spawn('pg_dump', ['--format=custom', '--no-owner', '--file', file, url], {
			stdio: ['ignore', 'inherit', 'inherit']
		});
		p.on('error', reject);
		p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump Exit-Code ${code}`))));
	});
}

async function pruneBackups() {
	const files = (await readdir(BACKUP_DIR)).filter((f) => f.startsWith('pre-migrate-')).sort();
	for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
		await rm(join(BACKUP_DIR, f));
	}
}

async function main() {
	await waitForDb();
	await sql`select pg_advisory_lock(424242)`;
	try {
		await sql`create table if not exists schema_migrations (
			version text primary key,
			applied_at timestamptz not null default now()
		)`;
		const applied = new Set((await sql`select version from schema_migrations`).map((r) => r.version));
		const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
		const pending = files.filter((f) => !applied.has(f));

		if (pending.length === 0) {
			console.log(`[migrate] Datenbank aktuell (${applied.size} Migrationen).`);
		} else {
			const [{ n: tables }] = await sql`select count(*)::int as n from pg_tables
				where schemaname = 'public' and tablename <> 'schema_migrations' and tablename <> 'spatial_ref_sys'`;
			if (tables > 0) {
				if (!BACKUP_DIR) throw new Error('Migrationen anstehend, aber BACKUP_DIR nicht gesetzt – Abbruch ohne Sicherung.');
				await mkdir(BACKUP_DIR, { recursive: true });
				const stamp = new Date().toISOString().replace(/[:.]/g, '-');
				const file = join(BACKUP_DIR, `pre-migrate-${stamp}.dump`);
				console.log(`[migrate] Sicherung vor Migration: ${file}`);
				await runPgDump(file);
				await pruneBackups();
			}
			for (const f of pending) {
				const body = await readFile(join(MIGRATIONS_DIR, f), 'utf8');
				console.log(`[migrate] Spiele ein: ${f}`);
				await sql.begin(async (tx) => {
					await tx.unsafe(body);
					await tx`insert into schema_migrations (version) values (${f})`;
				});
			}
			console.log(`[migrate] ${pending.length} Migration(en) eingespielt.`);
		}

		// Setup-Token: nur solange das Setup nicht abgeschlossen ist. Bei jedem Start neu (altes wird ungültig).
		const [setup] = await sql`select value from settings where key = 'setup'`;
		if (!setup?.value?.completed_at) {
			const token = randomBytes(18).toString('base64url');
			const hash = createHash('sha256').update(token).digest('hex');
			await sql`insert into settings (key, value) values ('setup_token', ${sql.json({ hash, created_at: new Date().toISOString() })})
				on conflict (key) do update set value = excluded.value, updated_at = now()`;
			const line = '='.repeat(64);
			console.log(`\n${line}\n  EINRICHTUNG NOCH NICHT ABGESCHLOSSEN\n  Setup-Adresse: ${(process.env.APP_URL || '').replace(/\/$/, '')}/setup\n  Einmal-Token:  ${token}\n  (gilt bis zum nächsten Neustart oder bis zum Abschluss)\n${line}\n`);
		} else {
			await sql`delete from settings where key = 'setup_token'`;
		}
	} finally {
		await sql`select pg_advisory_unlock(424242)`.catch(() => {});
		await sql.end();
	}
}

main().catch((e) => {
	console.error('[migrate] FEHLER:', e.message);
	console.error('[migrate] Server wird nicht gestartet. Daten sind unverändert (Transaktion zurückgerollt).');
	process.exit(1);
});
