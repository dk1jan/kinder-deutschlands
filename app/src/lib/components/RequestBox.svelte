<script lang="ts">
	import Notice from './Notice.svelte';
	// Kontakt anfragen – gemeinsam für QR-Seite, ID-Suche und Entdecken.
	let {
		relation,
		pending,
		done,
		error,
		action,
		loginHref,
		hidden = {},
		chatWith = null
	}: {
		relation: string;
		pending: boolean;
		done?: string | null;
		error?: string | null;
		action: string;
		loginHref: string;
		hidden?: Record<string, string>;
		/** Familien-ID für „Nachricht schreiben“ (F-030) */
		chatWith?: string | null;
	} = $props();
</script>

{#if error}<Notice kind="error">{error}</Notice>{/if}
{#if done === 'verbunden' || relation === 'kontakt'}
	<p class="state ok">Ihr seid verbunden.</p>
	{#if chatWith}<a class="btn signal" href={`/nachrichten/chat/neu?mit=${encodeURIComponent(chatWith)}`}>Nachricht schreiben</a>{/if}
{:else if done === 'angefragt' || pending}
	<p class="state">Anfrage gesendet. Du bekommst Bescheid, sobald sie angenommen wird.</p>
{:else if relation === 'selbst'}
	<p class="state">Das ist deine eigene Karte.</p>
{:else if relation === 'extern'}
	<p>Um Kontakt anzufragen, melde dich an. Deine E-Mail-Adresse sieht die andere Familie nicht.</p>
	<a class="btn signal" href={loginHref}>Anmelden und anfragen</a>
{:else}
	<form method="POST" action={action}>
		{#each Object.entries(hidden) as [k, v]}<input type="hidden" name={k} value={v} />{/each}
		<div class="field">
			<label for="message">Kurze Nachricht <span class="muted">(optional)</span></label>
			<textarea id="message" name="message" rows="2" maxlength="300" placeholder="z. B. Wir haben uns heute am Spielplatz gesehen"></textarea>
		</div>
		<button class="btn signal" type="submit">Kontakt anfragen</button>
	</form>
{/if}

<style>
	.state {
		font-weight: 700;
		margin: 0;
	}
	.state::before {
		content: '';
		display: inline-block;
		width: 12px;
		height: 10px;
		margin-right: var(--sp-2);
		background: var(--yellow);
		clip-path: polygon(0 0, 100% 50%, 0 100%);
	}
	.ok::before {
		background: var(--sea);
	}
	textarea {
		min-height: 0;
		padding: var(--sp-3) var(--sp-4);
	}
</style>
