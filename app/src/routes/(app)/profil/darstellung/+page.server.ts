import type { Actions } from './$types';
import { isHttps } from '$lib/server/config';

const THEMES = ['system', 'light', 'dark'];

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const theme = String((await request.formData()).get('theme') ?? 'system');
		const value = THEMES.includes(theme) ? theme : 'system';
		cookies.set('kd_theme', value, {
			path: '/',
			httpOnly: false,
			secure: isHttps(),
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 400
		});
		return { saved: value };
	}
};
