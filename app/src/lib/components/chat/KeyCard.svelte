<script lang="ts">
	// Chat-Schlüssel aus dem Passwort (D-066): Normalerweise unsichtbar – das Gerät entsperrt sich beim Anmelden selbst.
	// Sichtbar nur, wenn einmal das Passwort nötig ist (z. B. nach Passkey-Anmeldung) oder es sich geändert hat.
	import Icon from '$lib/components/Icon.svelte';
	import { chat, enterPassword, startFresh, unlockKeys, useOldPassword } from '$lib/chat/client.svelte';

	let { full = false }: { full?: boolean } = $props();
	let busy = $state(false);
	let error = $state('');
	let pw = $state('');
	let oldPw = $state('');
	let legacy = $state('');
	let confirmFresh = $state(false);

	// Wechselt die Karte, gehört eine alte Fehlermeldung nicht mehr dazu (F-017)
	$effect(() => {
		void chat.keys;
		error = '';
	});

	async function run(fn: () => Promise<boolean | void>, wrong: string) {
		busy = true;
		error = '';
		try {
			const r = await fn();
			if (r === false) error = wrong;
		} catch (e) {
			error = (e as Error).message || 'Das hat nicht geklappt.';
		} finally {
			busy = false;
		}
	}
</script>

{#if chat.keys === 'arbeitet'}
	<p class="working" role="status"><Icon name="schloss" size={18} /> Verschlüsselung wird eingerichtet …</p>
{:else if chat.keys === 'passwort'}
	<section class="keycard card" aria-labelledby="kc-t">
		<h2 id="kc-t"><Icon name="schloss" /> Chat entsperren</h2>
		<p>Gib einmal dein Passwort für Kinder Deutschlands ein. Damit entschlüsselt dieses Gerät deine Chats – auch ältere Nachrichten. Danach musst du es hier nicht mehr eingeben.</p>
		<form onsubmit={(e) => { e.preventDefault(); run(() => enterPassword(pw), 'Das Passwort passt nicht. Hast du es kürzlich geändert? Dann das neue nehmen.'); }}>
			<label for="kc-pw">Passwort</label>
			<input id="kc-pw" type="password" bind:value={pw} autocomplete="current-password" required />
			{#if error}<p class="err" role="alert">{error}</p>{/if}
			<button class="btn" type="submit" disabled={busy || !pw}>{busy ? 'Einen Moment …' : 'Entsperren'}</button>
		</form>
		<p class="muted small">Dein Passwort verlässt dabei das Gerät nicht – daraus wird hier nur der Schlüssel berechnet.</p>
	</section>
{:else if chat.keys === 'abweichend'}
	<section class="keycard card" aria-labelledby="kc-t">
		<h2 id="kc-t"><Icon name="schloss" /> Passwort geändert – ältere Nachrichten behalten?</h2>
		<p>Deine Chat-Sicherung ist noch mit deinem <strong>vorherigen</strong> Passwort geschützt (kein anderes Gerät war seitdem online). Gib es einmal ein, dann ist alles wieder da.</p>
		<form onsubmit={(e) => { e.preventDefault(); run(() => useOldPassword(oldPw), 'Das passt nicht zu deiner Chat-Sicherung.'); }}>
			<label for="kc-old">Vorheriges Passwort</label>
			<input id="kc-old" type="password" bind:value={oldPw} autocomplete="off" required />
			{#if error}<p class="err" role="alert">{error}</p>{/if}
			<button class="btn" type="submit" disabled={busy || !oldPw}>{busy ? 'Prüfe …' : 'Entsperren'}</button>
		</form>
		{#if !confirmFresh}
			<button class="link" type="button" onclick={() => (confirmFresh = true)}>Ich weiß es nicht mehr</button>
		{:else}
			<div class="warn">
				<p><strong>Neu beginnen?</strong> Ältere Nachrichten bleiben auf neuen Geräten unlesbar. Neue Nachrichten funktionieren sofort. Deine Kontakte sehen, dass sich deine Sicherheitsschlüssel geändert haben.</p>
				<div class="acts">
					<button class="btn small danger" type="button" disabled={busy} onclick={() => run(startFresh, '')}>Neu beginnen</button>
					<button class="btn small secondary" type="button" onclick={() => (confirmFresh = false)}>Abbrechen</button>
				</div>
			</div>
		{/if}
	</section>
{:else if chat.keys === 'frueher'}
	<section class="keycard card" aria-labelledby="kc-t">
		<h2 id="kc-t"><Icon name="schloss" /> Chat-Sicherung aus einer früheren Version</h2>
		<p>Deine Chat-Sicherung stammt aus einer früheren Version von Kinder Deutschlands und ist mit einem <strong>Wiederherstellungsschlüssel</strong> geschützt. Gib ihn einmal ein, dann ist alles wieder da – ab dann schützt dich dein Passwort, und du brauchst keinen Schlüssel mehr.</p>
		<form onsubmit={(e) => { e.preventDefault(); run(() => unlockKeys(legacy), 'Der Schlüssel passt nicht.'); }}>
			<label for="kc-in">Wiederherstellungsschlüssel</label>
			<input id="kc-in" class="mono" bind:value={legacy} autocomplete="off" spellcheck="false" placeholder="EsTc 1234 …" required />
			{#if error}<p class="err" role="alert">{error}</p>{/if}
			<button class="btn" type="submit" disabled={busy || legacy.trim().length < 20}>{busy ? 'Prüfe …' : 'Freischalten'}</button>
		</form>
		{#if !confirmFresh}
			<button class="link" type="button" onclick={() => (confirmFresh = true)}>Ich habe den Schlüssel nicht mehr</button>
		{:else}
			<div class="warn">
				<p><strong>Neu beginnen?</strong> Ältere Nachrichten bleiben auf neuen Geräten unlesbar. Neue Nachrichten funktionieren sofort. Deine Kontakte sehen, dass sich deine Sicherheitsschlüssel geändert haben.</p>
				<div class="acts">
					<button class="btn small danger" type="button" disabled={busy} onclick={() => run(startFresh, '')}>Neu beginnen</button>
					<button class="btn small secondary" type="button" onclick={() => (confirmFresh = false)}>Abbrechen</button>
				</div>
			</div>
		{/if}
	</section>
{:else if full && chat.keys === 'ok'}
	<section class="keycard card ok" aria-labelledby="kc-t">
		<h2 id="kc-t"><Icon name="ok" /> Verschlüsselung eingerichtet</h2>
		<p>Geschützt mit deinem Passwort. Neue Geräte entsperren sich beim Anmelden selbst – ohne Code. Ändere dein Passwort am besten unter „Mein Konto → Sicherheit“, dann bleibt alles lesbar.</p>
	</section>
{/if}

<style>
	.keycard {
		border-top: 6px solid var(--yellow);
		display: grid;
		gap: var(--sp-3);
		margin-bottom: var(--sp-5);
	}
	.keycard.ok {
		border-top-color: var(--sea);
	}
	h2 {
		font-size: var(--fs-l);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: 0;
	}
	p {
		margin: 0;
	}
	.working {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		color: var(--ink-2);
		margin-bottom: var(--sp-4);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	form {
		display: grid;
		gap: var(--sp-2);
	}
	label {
		font-weight: 650;
	}
	.mono {
		font-family: ui-monospace, Menlo, monospace;
	}
	.err {
		color: var(--danger);
		font-weight: 600;
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--link);
		text-decoration: underline;
		font: inherit;
		cursor: pointer;
		justify-self: start;
		min-height: 44px;
	}
	.warn {
		border-left: 4px solid var(--red);
		padding-left: var(--sp-3);
		display: grid;
		gap: var(--sp-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
