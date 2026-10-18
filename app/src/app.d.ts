import type { SessionInfo, SessionUser } from '$lib/server/session';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			session: SessionInfo | null;
			theme: 'system' | 'light' | 'dark';
		}
		interface Error {
			message: string;
		}
	}
}

export {};
