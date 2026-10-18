import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['tests/**/*.test.ts'],
		// DB-Tests teilen sich eine Datenbank: nacheinander ausführen
		fileParallelism: false,
		testTimeout: 30000
	}
});
