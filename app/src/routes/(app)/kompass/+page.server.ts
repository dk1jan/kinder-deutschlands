import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { situations } from '$lib/server/alltag/compass';

export const load: PageServerLoad = async () => ({ situations: await situations(db()) });
