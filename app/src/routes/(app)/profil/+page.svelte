<script lang="ts">
	import IdTag from '$lib/components/IdTag.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import Pram from '$lib/components/art/Pram.svelte';
	let { data } = $props();
	const presetName: Record<string, string> = { zurueckhaltend: 'Zurückhaltend', offen: 'Offen', individuell: 'Individuell' };
</script>

<svelte:head><title>Profil – Kinder Deutschlands</title></svelte:head>

{#if !data.member}
	<section class="guest container">
		<div class="guest-art"><Pram /></div>
		<div>
			<h1>Dein Platz im Netzwerk</h1>
			<p class="lead">Mit einem Konto bekommst du deine Familien-ID mit QR-Code und entscheidest selbst, wer was von dir sieht.</p>
			<div class="cta">
				{#if data.mailOpen}<a class="btn signal" href="/registrieren">Konto anlegen</a>{/if}
				<a class="btn secondary" href="/anmelden">Anmelden</a>
			</div>
			<p class="muted small"><a href="/profil/darstellung">Darstellung: hell, dunkel oder wie das Gerät</a></p>
		</div>
	</section>
{:else}
	{@const m = data.member}
	<div class="container page">
		{#if data.welcome}
			<Notice kind="ok" title="Willkommen bei Kinder Deutschlands">Dein Konto ist freigeschaltet. Das hier ist deine Familien-ID.</Notice>
		{/if}

		<section class="head">
			<div class="who">
				<h1>{m.displayName ?? 'Mein Profil'}</h1>
				<p class="lead">
					Teile deine ID oder den QR-Code. Wer ihn scannt, sieht nur, was du freigegeben hast. Freigaben: <strong>{presetName[m.preset]}</strong>.
				</p>
				<div class="cta">
					<a class="btn signal" href="/profil/bearbeiten">{m.complete ? 'Profil bearbeiten' : 'Profil ausfüllen'}</a>
					<a class="btn secondary" href="/profil/vorschau">So sehen andere mich</a>
				</div>
			</div>
			<div class="tagwrap"><IdTag id={m.contactId} qr={m.qr} /></div>
		</section>

		<nav class="tiles" aria-label="Mein Konto">
			<a href="/nachrichten" class="tile">
				<strong>Kontakte</strong>
				<span>{m.counts.contacts} {m.counts.contacts === 1 ? 'Kontakt' : 'Kontakte'}{#if m.counts.requests}, <em>{m.counts.requests} neue {m.counts.requests === 1 ? 'Anfrage' : 'Anfragen'}</em>{/if}</span>
			</a>
			<a href="/profil/orte" class="tile">
				<strong>Meine Orte</strong>
				<span>Gemerkte Orte und eigene Vorschläge</span>
			</a>
			<a href="/profil/qr" class="tile">
				<strong>QR-Codes und Wimpel</strong>
				<span>Drucken, befristete Codes, alte Codes sperren</span>
			</a>
			<a href="/profil/sicherheit" class="tile">
				<strong>Sicherheit</strong>
				<span>{m.counts.passkeys ? `${m.counts.passkeys} Passkey${m.counts.passkeys > 1 ? 's' : ''}` : 'Passkey einrichten'}{m.counts.totp ? ', Zwei-Faktor an' : ''}, Geräte</span>
			</a>
			<a href="/profil/benachrichtigungen" class="tile">
				<strong>Benachrichtigungen</strong>
				<span>Push auf diesem Gerät, Ruhezeiten, Lesebestätigungen</span>
			</a>
			<a href="/nachrichten/sicherheit" class="tile">
				<strong>Chat-Verschlüsselung</strong>
				<span>Wiederherstellungsschlüssel, Chat-Geräte</span>
			</a>
			<a href="/profil/darstellung" class="tile">
				<strong>Darstellung</strong>
				<span>Hell, dunkel oder wie das Gerät</span>
			</a>
			<a href="/profil/konto" class="tile">
				<strong>Konto und Daten</strong>
				<span>Alle Daten herunterladen, Konto löschen</span>
			</a>
			{#if data.canAdmin}
				<a href="/admin" class="tile admin">
					<strong>Verwaltung</strong>
					<span>Systemzustand, Nutzer, Rechte</span>
				</a>
			{/if}
		</nav>

		<form method="POST" action="?/abmelden">
			<button class="btn secondary" type="submit">Abmelden</button>
		</form>
	</div>
{/if}

<style>
	.guest {
		display: grid;
		gap: var(--sp-6);
		padding-top: var(--sp-7);
		padding-bottom: var(--sp-8);
		align-items: center;
	}
	.guest-art {
		max-width: 300px;
	}
	.guest h1,
	.who h1 {
		font-size: clamp(2.4rem, 1.7rem + 3vw, 3.6rem);
		font-stretch: 78%;
		font-weight: 800;
	}
	.cta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		margin: var(--sp-5) 0;
	}
	.small {
		font-size: var(--fs-s);
	}
	.head {
		display: grid;
		gap: var(--sp-6);
		align-items: center;
		margin-bottom: var(--sp-7);
	}
	.tagwrap {
		justify-self: center;
	}
	.tiles {
		display: grid;
		gap: var(--sp-3);
		margin-bottom: var(--sp-6);
	}
	.tile {
		display: grid;
		gap: var(--sp-1);
		padding: var(--sp-4) var(--sp-5);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		color: var(--ink);
		text-decoration: none;
		border-left: 6px solid var(--sky);
		transition: transform 0.12s ease;
	}
	.tile:hover {
		transform: translateY(-2px);
	}
	.tile:nth-child(2) {
		border-left-color: var(--yellow);
	}
	.tile:nth-child(3) {
		border-left-color: var(--sea);
	}
	.tile:nth-child(5) {
		border-left-color: var(--red);
	}
	.tile.admin {
		border-left-color: var(--navy);
	}
	.tile strong {
		font-family: var(--font-display);
		font-size: var(--fs-l);
	}
	.tile span {
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.tile em {
		font-style: normal;
		font-weight: 700;
		color: var(--ink);
	}
	@media (min-width: 900px) {
		.guest {
			grid-template-columns: 0.8fr 1.2fr;
		}
		.head {
			grid-template-columns: 1.2fr 0.8fr;
		}
		.tiles {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
