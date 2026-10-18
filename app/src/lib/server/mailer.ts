import nodemailer, { type Transporter } from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import { appUrl } from './config';
import { mailConfig, mailSettingsVersion, type MailConfig } from './mailsettings';

// E-Mail-Versand. In Produktion ausschließlich SMTP (Plesk-Mailserver).
// Für automatische Tests (nie in Produktion): MAIL_OUTBOX_DIR schreibt Mails als JSON-Dateien.

let transporter: Transporter | null = null;
let transporterVersion = -1;

function outboxDir(): string | null {
	return env.NODE_ENV !== 'production' && env.MAIL_OUTBOX_DIR ? env.MAIL_OUTBOX_DIR : null;
}

export function mailConfigured(): boolean {
	return !!outboxDir() || !!mailConfig();
}

function createTransport(c: MailConfig): Transporter {
	return nodemailer.createTransport({
		host: c.host,
		port: c.port,
		secure: c.port === 465,
		auth: c.user ? { user: c.user, pass: c.password } : undefined,
		tls: c.insecureTls ? { rejectUnauthorized: false } : undefined,
		connectionTimeout: 15000,
		greetingTimeout: 15000,
		socketTimeout: 30000
	});
}

function transport(c: MailConfig): Transporter {
	if (!transporter || transporterVersion !== mailSettingsVersion()) {
		transporter?.close();
		transporter = createTransport(c);
		transporterVersion = mailSettingsVersion();
	}
	return transporter;
}

/** Verbindung und Anmeldung am Mailserver prüfen, ohne eine Mail zu senden. Gibt die Fehlermeldung zurück oder null. */
export async function verifyMailServer(): Promise<string | null> {
	const c = mailConfig();
	if (!c) return 'Kein Mailserver eingetragen.';
	const t = createTransport(c);
	try {
		await t.verify();
		return null;
	} catch (e) {
		return describeMailError(e);
	} finally {
		t.close();
	}
}

/** Verständliche Fehlermeldung, ohne Zugangsdaten. */
export function describeMailError(e: unknown): string {
	const err = e as { code?: string; responseCode?: number; message?: string };
	if (err.code === 'EAUTH' || err.responseCode === 535) return 'Anmeldung am Mailserver abgelehnt – Benutzername oder Passwort prüfen.';
	if (err.code === 'ECONNREFUSED') return 'Mailserver nicht erreichbar (Verbindung abgelehnt) – Servername und Port prüfen.';
	if (err.code === 'ENOTFOUND' || err.code === 'EDNS') return 'Servername nicht gefunden – Schreibweise prüfen.';
	if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET' && /timeout/i.test(err.message ?? '')) return 'Zeitüberschreitung – Port prüfen (587 oder 465) oder Firewall.';
	if (/certificate|self.signed|CERT_/i.test(err.message ?? '')) return 'Zertifikat des Mailservers wird nicht akzeptiert – Zertifikat in Plesk prüfen oder „Zertifikat nicht prüfen“ aktivieren.';
	if (/wrong version number/i.test(err.message ?? '')) return 'Verschlüsselung passt nicht zum Port – bei 587 STARTTLS, bei 465 SSL.';
	return (err.message ?? 'unbekannter Fehler').slice(0, 300);
}

export interface Mail {
	to: string;
	subject: string;
	text: string;
}

/** Schlichtes, gut lesbares HTML aus dem Text. Links werden klickbar. */
function toHtml(text: string): string {
	const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const linked = esc.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#1a5c9a">$1</a>');
	return `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f2f6f9;font-family:Arial,Helvetica,sans-serif;color:#0f2238">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border-top:8px solid #ffc53d">
<p style="font-size:20px;font-weight:bold;margin:0 0 16px">Kinder Deutschlands</p>
${linked
	.split(/\n{2,}/)
	.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
	.join('\n')}
</div></body></html>`;
}

export async function sendMail(m: Mail): Promise<void> {
	const dir = outboxDir();
	if (dir) {
		await mkdir(dir, { recursive: true });
		const file = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
		await writeFile(file, JSON.stringify(m));
		return;
	}
	const c = mailConfig();
	if (!c) throw new Error('E-Mail-Versand ist nicht eingerichtet.');
	await transport(c).sendMail({
		from: `Kinder Deutschlands <${c.from}>`,
		to: m.to,
		subject: m.subject,
		text: m.text,
		html: toHtml(m.text)
	});
}

const SIGN = '\n\nViele Grüße\nKinder Deutschlands';

export const mails = {
	verify: (to: string, link: string): Mail => ({
		to,
		subject: 'Bitte bestätige deine E-Mail-Adresse',
		text: `Hallo,\n\nbitte bestätige deine E-Mail-Adresse, damit wir dein Konto bei Kinder Deutschlands freischalten können:\n\n${link}\n\nDer Link gilt 24 Stunden. Wenn du dich nicht registriert hast, kannst du diese E-Mail einfach ignorieren.${SIGN}`
	}),
	alreadyRegistered: (to: string): Mail => ({
		to,
		subject: 'Du hast schon ein Konto',
		text: `Hallo,\n\njemand wollte sich mit dieser E-Mail-Adresse registrieren. Es gibt aber schon ein Konto dafür.\n\nAnmelden: ${appUrl()}/anmelden\nPasswort vergessen: ${appUrl()}/passwort-vergessen\n\nWarst du das nicht, musst du nichts tun.${SIGN}`
	}),
	reset: (to: string, link: string): Mail => ({
		to,
		subject: 'Neues Passwort festlegen',
		text: `Hallo,\n\nüber diesen Link legst du ein neues Passwort fest:\n\n${link}\n\nDer Link gilt 1 Stunde und funktioniert nur einmal. Danach werden alle angemeldeten Geräte abgemeldet.\n\nHast du das nicht angefordert, ignoriere diese E-Mail. Dein Passwort bleibt dann unverändert.${SIGN}`
	}),
	test: (to: string): Mail => ({
		to,
		subject: 'Test: E-Mail-Versand funktioniert',
		text: `Diese Test-E-Mail wurde aus der Verwaltung von Kinder Deutschlands verschickt (${appUrl()}).${SIGN}`
	})
};
