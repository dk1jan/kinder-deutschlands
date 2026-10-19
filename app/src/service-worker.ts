/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Service Worker: nur Push-Hinweise (ohne Inhalt) und Öffnen der passenden Seite. Bewusst kein Offline-Zwischenspeicher,
// damit nach jedem Update sofort die neue Version läuft und keine persönlichen Seiten im Gerätespeicher liegen.
const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => void sw.skipWaiting());
sw.addEventListener('activate', (e) => e.waitUntil(sw.clients.claim()));

interface Payload {
	t?: string;
	title?: string;
	body?: string;
	url?: string;
	tag?: string;
}

sw.addEventListener('push', (e) => {
	let p: Payload = {};
	try {
		p = e.data?.json() ?? {};
	} catch {
		/* leer */
	}
	const url = typeof p.url === 'string' && p.url.startsWith('/') ? p.url : '/nachrichten';
	e.waitUntil(
		(async () => {
			// Ist die Unterhaltung gerade sichtbar geöffnet, keinen zusätzlichen Hinweis zeigen
			const wins = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			if (p.t === 'chat' && wins.some((w) => w.visibilityState === 'visible' && new URL(w.url).pathname === url)) return;
			await sw.registration.showNotification(p.title || 'Kinder Deutschlands', {
				body: p.body || 'Neue Nachricht',
				tag: p.tag || 'kd',
				icon: '/icon-192.png',
				data: { url }
			});
		})()
	);
});

sw.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const url = (e.notification.data?.url as string) || '/nachrichten';
	e.waitUntil(
		(async () => {
			const wins = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const w of wins) {
				if (new URL(w.url).origin === sw.location.origin) {
					await w.focus();
					if ('navigate' in w) await (w as WindowClient).navigate(url).catch(() => {});
					return;
				}
			}
			await sw.clients.openWindow(url);
		})()
	);
});
