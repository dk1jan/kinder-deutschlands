// Rechte = Rolle × Geltungsbereich × Aktion. Reine Logik ohne DB, damit sie vollständig testbar ist.
// Grundregeln:
//  - Der Server prüft jede Aktion. Ein verborgenes Menü ist keine Sicherung.
//  - 'global' gilt überall; 'region' gilt für die Region und alle darunterliegenden Regionen (nie nach oben).
//  - 'topic'/'org' gelten nur für exakt dieses Thema bzw. diese Organisation.
//  - Geschützte Gruppen (Aktionen 'protected_group.*') werden NIE über global/region/topic vererbt,
//    sondern nur über eine ausdrückliche 'group'-Zuweisung oder die Betreiberrolle '*'.
//  - Abgelaufene oder widerrufene Zuweisungen zählen nicht.

export type ScopeType = 'global' | 'region' | 'topic' | 'org' | 'group';

export interface Assignment {
	role_key: string;
	scope_type: ScopeType;
	scope_id: string | null;
	expires_at: Date | null;
	revoked_at: Date | null;
}

export interface Target {
	/** Regionspfad von oben nach unten, z. B. ['de', '04', '04011'] */
	regionPath?: string[];
	topic?: string;
	org?: string;
	group?: string;
}

export type RolePermissions = Map<string, Set<string>>;

const EXPLICIT_ONLY_PREFIX = 'protected_group.';

export function roleAllows(perms: RolePermissions, role: string, action: string): boolean {
	const set = perms.get(role);
	if (!set) return false;
	return set.has('*') || set.has(action);
}

function isActive(a: Assignment, now: Date): boolean {
	if (a.revoked_at && a.revoked_at <= now) return false;
	if (a.expires_at && a.expires_at <= now) return false;
	return true;
}

function scopeMatches(a: Assignment, action: string, target: Target | undefined, isWildcard: boolean): boolean {
	const explicitOnly = action.startsWith(EXPLICIT_ONLY_PREFIX);
	if (explicitOnly && !isWildcard) {
		return a.scope_type === 'group' && !!target?.group && a.scope_id === target.group;
	}
	switch (a.scope_type) {
		case 'global':
			return true;
		case 'region':
			return !!a.scope_id && !!target?.regionPath && target.regionPath.includes(a.scope_id);
		case 'topic':
			return !!a.scope_id && target?.topic === a.scope_id;
		case 'org':
			return !!a.scope_id && target?.org === a.scope_id;
		case 'group':
			return !!a.scope_id && target?.group === a.scope_id;
	}
}

/**
 * Darf der Nutzer die Aktion ausführen?
 * Ohne Ziel (target) zählen nur globale Zuweisungen – außer für 'admin.access',
 * das jede aktive Zuweisung mit dieser Aktion öffnet (die Inhalte darin werden einzeln geprüft).
 */
export function can(
	assignments: Assignment[],
	perms: RolePermissions,
	action: string,
	target?: Target,
	now: Date = new Date()
): boolean {
	for (const a of assignments) {
		if (!isActive(a, now)) continue;
		if (!roleAllows(perms, a.role_key, action)) continue;
		const isWildcard = perms.get(a.role_key)?.has('*') ?? false;
		if (isWildcard && a.scope_type === 'global') return true;
		if (action === 'admin.access') return true;
		if (scopeMatches(a, action, target, isWildcard)) return true;
	}
	return false;
}

/** Für die Vorschau „effektive Rechte“: welche Aktionen in welchem Geltungsbereich. */
export function effectivePermissions(assignments: Assignment[], perms: RolePermissions, now: Date = new Date()) {
	return assignments
		.filter((a) => isActive(a, now))
		.map((a) => ({
			role: a.role_key,
			scope: a.scope_type === 'global' ? 'überall' : `${a.scope_type}: ${a.scope_id}`,
			expires_at: a.expires_at,
			actions: [...(perms.get(a.role_key) ?? [])].sort()
		}));
}
