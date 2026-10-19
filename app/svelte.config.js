import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ out: 'build', precompress: true }),
		// CSRF: SvelteKit lässt Formular-Aktionen standardmäßig nur vom eigenen Origin zu (ORIGIN = APP_URL).
		// Content-Security-Policy mit Nonces; keine fremden Skripte, Styles oder Frames
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				// WebAssembly für die Chat-Verschlüsselung (Matrix Rust-Krypto) – kein eval von Skripttext
				'script-src': ['self', 'wasm-unsafe-eval'],
				'worker-src': ['self', 'blob:'],
				// Entschlüsselte Bilder und Sprachnachrichten liegen nur als Blob im Browser
				'media-src': ['self', 'blob:'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'font-src': ['self'],
				'connect-src': ['self'],
				// Videos nur nach Klick und nur über datenschutzfreundliche Player-Adressen (M07)
				'frame-src': ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
				'frame-ancestors': ['none'],
				'form-action': ['self'],
				'base-uri': ['self'],
				'object-src': ['none']
			}
		}
	}
};

export default config;
