<script lang="ts">
	// Wiederherstellungsschlüssel: einrichten (erstes Gerät), Gerät freischalten, oder bei Verlust neu einrichten.
	import Icon from '$lib/components/Icon.svelte';
	import { chat, newRecoveryKey, resetKeys, setupKeys, unlockKeys } from '$lib/chat/client.svelte';

	let { full = false }: { full?: boolean } = $props();
	let busy = $state(false);
	let error = $state('');
	let shown = $state<string | null>(null);
	let saved = $state(false);
	let input = $state('');
	let confirmReset = $state(false);
	let copied = $state(false);

	async function run(fn: () => Promise<string | boolean>) {
		busy = true;
		error = '';
		try {
			const r = await fn();
			if (typeof r === 'string') {
				shown = r;
				saved = false;
			} else if (!r) error = 'Der Schlüssel passt nicht. Bitte genau so eingeben, wie er notiert ist (Leerzeichen sind egal).';
		} catch (e) {
			error = (e as Error).message || 'Das hat nicht geklappt.';
		} finally {
			busy = false;
		}
	}

	async function copy() {
		if (!shown) return;
		await navigator.clipboard?.writeText(shown);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
	function download() {
		if (!shown) return;
		const text = `Kinder Deutschlands – Wiederherstellungsschlüssel für deine Chats\nErstellt am ${new Date().toLocaleString('de-DE')}\n\n${shown}\n\nGut aufbewahren (z. B. ausgedruckt oder im Passwort-Manager). Nicht weitergeben.\n`;
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
		a.download = 'kinder-deutschlands-chat-schluessel.txt';
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 2000);
	}
</script>

{#if shown}
	<section class="keycard card" aria-labelledby="kc-t">
		<h2 id="kc-t"><Icon name="schloss" /> Dein Wiederherstellungsschlüssel</h2>
		<p>Damit liest du deine Chats auf einem neuen Gerät. Er wird <strong>nur jetzt</strong> angezeigt. Wir können ihn nicht wiederherstellen.</p>
		<p class="key" aria-label="Wiederherstellungsschlüssel">{shown}</p>
		<div class="acts">
			<button class="btn small" type="button" onclick={copy}>{copied ? 'Kopiert' : 'Kopieren'}</button>
			<button class="btn small secondary" type="button" onclick={download}>Als Datei speichern</button>
			<button class="btn small secondary" type="button" onclick={() => print()}>Drucken</button>
		</div>
		<label class="check"><input type="checkbox" bind:checked={saved} /> Ich habe den Schlüssel sicher aufbewahrt.</label>
		<button class="btn signal" type="button" disabled={!saved} onclick={() => (shown = null)}>Fertig</button>
	</section>
{:else if chat.keys === 'neu'}
	<section class="keycard card" aria-labelledby="kc-t">
		<h2 id="kc-t"><Icon name="schloss" /> Chats auf allen Geräten lesen</h2>
		<p>Deine Nachrichten sind Ende-zu-Ende-verschlüsselt. Erstelle einmal einen Wiederherstellungsschlüssel – damit kannst du sie auch auf einem neuen Handy lesen.</p>
		{#if error}<p class="err" role="alert">{error}</p>{/if}
		<button class="btn" type="button" disabled={busy} onclick={() => run(setupKeys)}>{busy ? 'Einen Moment …' : 'Schlüssel erstellen'}</button>
	</section>
{:else if chat.keys === 'gesperrt'}
	<section class="keycard card" aria-labelledby="kc-t">
		<h2 id="kc-t"><Icon name="schloss" /> Dieses Gerät freischalten</h2>
		<p>Gib deinen Wiederherstellungsschlüssel ein, um frühere Nachrichten hier zu lesen. Neue Nachrichten funktionieren auch ohne.</p>
		<form onsubmit={(e) => { e.preventDefault(); run(() => unlockKeys(input)); }}>
			<label for="kc-in" class="visually-hidden">Wiederherstellungsschlüssel</label>
			<input id="kc-in" bind:value={input} autocomplete="off" spellcheck="false" placeholder="EsTc 1234 …" required />
			{#if error}<p class="err" role="alert">{error}</p>{/if}
			<button class="btn" type="submit" disabled={busy || input.trim().length < 20}>{busy ? 'Prüfe …' : 'Freischalten'}</button>
		</form>
		{#if !confirmReset}
			<button class="link" type="button" onclick={() => (confirmReset = true)}>Schlüssel verloren?</button>
		{:else}
			<div class="warn">
				<p><strong>Neu einrichten?</strong> Frühere Nachrichten bleiben auf diesem und neuen Geräten unlesbar. Auf Geräten, die schon freigeschaltet sind, bleiben sie lesbar. Deine Kontakte sehen, dass sich deine Sicherheitsschlüssel geändert haben.</p>
				<div class="acts">
					<button class="btn small danger" type="button" disabled={busy} onclick={() => run(resetKeys)}>Neu einrichten</button>
					<button class="btn small secondary" type="button" onclick={() => (confirmReset = false)}>Abbrechen</button>
				</div>
			</div>
		{/if}
	</section>
{:else if full && chat.keys === 'ok'}
	<section class="keycard card ok" aria-labelledby="kc-t">
		<h2 id="kc-t"><Icon name="ok" /> Verschlüsselung eingerichtet</h2>
		<p>Dieses Gerät ist freigeschaltet. Mit deinem Wiederherstellungsschlüssel kannst du weitere Geräte freischalten.</p>
		{#if error}<p class="err" role="alert">{error}</p>{/if}
		<button class="btn small secondary" type="button" disabled={busy} onclick={() => run(newRecoveryKey)}>Neuen Schlüssel erstellen (alter wird ungültig)</button>
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
	.key {
		font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
		font-size: var(--fs-l);
		letter-spacing: 0.04em;
		word-spacing: 0.3em;
		padding: var(--sp-4);
		border-radius: var(--radius-s);
		background: var(--surface-2);
		user-select: all;
		line-height: 1.6;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		min-height: 44px;
	}
	form {
		display: grid;
		gap: var(--sp-3);
	}
	input {
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
</style>
