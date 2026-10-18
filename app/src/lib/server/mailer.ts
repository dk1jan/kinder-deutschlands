import nodemailer, { type Transporter } from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import { appUrl } from './config';

// E-Mail-Versand. In Produktion ausschließlich SMTP (Plesk-Mailserver).
// Für automatische Tests (nie in Produktion): MAIL_OUTBOX_DIR schreibt Mails als JSON-Dateien.

let transporter: Transporter | null = null;

function outboxDir(): string | null {
	return env.NODE_ENV !== 'production' && env.MAIL_OUTBOX_DIR ? env.MAIL_OUTBOX_DIR : null;
}

export function mailConfigured(): boolean {
	return !!outboxDir() || !!(env.SMTP_HOST && env.SMTP_FROM);
}

function transport(): Transporter {
	if (!transporter) {
		const port = Number(env.SMTP_PORT || 587);
		transporter = nodemailer.createTransport({
			host: env.SMTP_HOST,
			port,
			secure: port === 465,
			auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
			tls: env.SMTP_INSECURE_TLS === 'true' ? { rejectUnauthorized: false } : undefined
		});
	}
	return transporter;
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
	if (!env.SMTP_HOST || !env.SMTP_FROM) throw new Error('E-Mail-Versand ist nicht eingerichtet.');
	await transport().sendMail({
		from: `Kinder Deutschlands <${env.SMTP_FROM}>`,
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
