import postgres from 'postgres';
import { env } from '$env/dynamic/private';

let client: ReturnType<typeof postgres> | null = null;

export function db() {
	if (!client) {
		if (!env.DATABASE_URL) throw new Error('DATABASE_URL fehlt.');
		client = postgres(env.DATABASE_URL, { max: 10, idle_timeout: 30, onnotice: () => {} });
	}
	return client;
}

export type Sql = ReturnType<typeof postgres>;
