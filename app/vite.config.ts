import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	// Karten-Worker (MapLibre) als ES-Modul bündeln, eigener Ursprung – keine blob:-Ausnahme in der CSP nötig
	worker: { format: 'es' },
	test: {
		include: ['tests/**/*.test.ts'],
		// DB-Tests teilen sich eine Datenbank: nacheinander ausführen
		fileParallelism: false,
		testTimeout: 30000,
		// Vorbereitung der DB-Tests (Schema leeren + alle Migrationen) kann auf kaltem Rechner > 10 s dauern
		hookTimeout: 60000
	}
});
