import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import type { Sql } from './db';
import { appUrl, isHttps, key, gitSha } from './config';
import { mailConfigured } from './mailer';

export type CheckState = 'ok' | 'warn' | 'error';
export interface Check {
	label: string;
	state: CheckState;
	detail: string;
}

export async function systemChecks(sql: Sql): Promise<Check[]> {
	const checks: Check[] = [];
	try {
		const [v] = await sql`select current_setting('server_version') as v`;
		checks.push({ label: 'Datenbank', state: 'ok', detail: `PostgreSQL ${v.v}` });
	} catch (e) {
		checks.push({ label: 'Datenbank', state: 'error', detail: 'Nicht erreichbar' });
		return checks;
	}
	try {
		const [p] = await sql`select postgis_lib_version() as v`;
		checks.push({ label: 'Geodaten (PostGIS)', state: 'ok', detail: `PostGIS ${p.v}` });
	} catch {
		checks.push({ label: 'Geodaten (PostGIS)', state: 'error', detail: 'Erweiterung fehlt' });
	}
	const migs = await sql`select version from schema_migrations order by version`;
	checks.push({ label: 'Migrationen', state: 'ok', detail: `${migs.length} eingespielt, zuletzt ${migs.at(-1)?.version ?? '–'}` });
	checks.push({
		label: 'Plattformadresse',
		state: isHttps() ? 'ok' : 'warn',
		detail: isHttps() ? appUrl() : `${appUrl()} – ohne HTTPS nur für Tests geeignet`
	});
	try {
		key('check');
		checks.push({ label: 'Geheimschlüssel (APP_SECRET)', state: 'ok', detail: 'Gesetzt' });
	} catch {
		checks.push({ label: 'Geheimschlüssel (APP_SECRET)', state: 'error', detail: 'Fehlt oder zu kurz (mind. 32 Zeichen)' });
	}
	checks.push({
		label: 'E-Mail-Versand',
		state: mailConfigured() ? 'ok' : 'warn',
		detail: mailConfigured() ? 'Konfiguriert' : 'Nicht eingerichtet – Registrierung und Passwort-Zurücksetzen sind deaktiviert'
	});
	// Chat-Server: nur technische Kennzahlen, keine Inhalte (Nachrichten sind Ende-zu-Ende-verschlüsselt)
	const { chatEnabled, health } = await import('./chat/synapse');
	if (chatEnabled()) {
		const h = await health();
		const [c] = await sql`select (select count(*)::int from chat_accounts) as konten,
			(select count(*)::int from chat_rooms where status = 'aktiv' and kind = 'direkt') as direkt,
			(select count(*)::int from chat_rooms where status = 'aktiv' and kind = 'gruppe') as gruppen,
			(select count(*)::int from chat_rooms where status = 'aktiv' and kind = 'treffen') as treffen,
			(select count(*)::int from push_subscriptions) as push`;
		checks.push({
			label: 'Chat-Server',
			state: h.ok ? 'ok' : 'error',
			detail: h.ok
				? `Synapse ${h.version ?? ''} · ${c.konten} Chat-Konten · ${c.direkt} Direktchats, ${c.gruppen} Gruppen, ${c.treffen} laufende Treffen · ${c.push} Geräte mit Push`
				: `Nicht erreichbar (${h.error}). Container „synapse“ prüfen.`
		});
	} else {
		checks.push({ label: 'Chat-Server', state: 'warn', detail: 'Nicht eingerichtet (SYNAPSE_URL fehlt)' });
	}
	checks.push({ label: 'Version', state: 'ok', detail: gitSha() });
	return checks;
}

export interface BackupStatus {
	state: CheckState;
	detail: string;
}

/** Liest die Statusdatei, die der Backup-Dienst nach jeder Sicherung schreibt. */
export async function backupStatus(): Promise<BackupStatus> {
	const dir = env.BACKUP_DIR;
	if (!dir) return { state: 'warn', detail: 'Kein Backup-Verzeichnis konfiguriert' };
	try {
		const raw = await readFile(join(dir, 'last-backup.json'), 'utf8');
		const s = JSON.parse(raw) as { at: string; file: string; ok: boolean; size?: number };
		const ageH = (Date.now() - new Date(s.at).getTime()) / 3_600_000;
		if (!s.ok) return { state: 'error', detail: `Letzte Sicherung fehlgeschlagen (${new Date(s.at).toLocaleString('de-DE')})` };
		return {
			state: ageH > 30 ? 'warn' : 'ok',
			detail: `Letzte Sicherung ${new Date(s.at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}${ageH > 30 ? ' – älter als 30 Stunden' : ''}`
		};
	} catch {
		return { state: 'warn', detail: 'Noch keine tägliche Sicherung gelaufen' };
	}
}
