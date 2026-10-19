<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { joinTreffen } from '$lib/chat/actions';
	import { remaining } from '$lib/chat/format';
	let { data, form } = $props();
	let busy = $state(false);
	let error = $state('');
</script>

<svelte:head><title>Treffen beitreten – Kinder Deutschlands</title></svelte:head>
<div class="container page narrow">
	{#if !data.treffen}
		<h1>Treffen nicht gefunden</h1>
		<p>Dieser QR-Code ist abgelaufen, wurde ersetzt oder das Treffen ist beendet.</p>
		<a class="btn secondary" href="/nachrichten">Zu den Nachrichten</a>
	{:else}
		<section class="card box">
			<p class="kicker"><Icon name="qr" size={18} /> Treffen</p>
			<h1>{data.treffen.name}</h1>
			<p class="muted">{data.treffen.members} {data.treffen.members === 1 ? 'Person' : 'Personen'} dabei · {remaining(data.treffen.expiresAt)}</p>
			<ul class="facts">
				<li>Ende-zu-Ende-verschlüsselter Gruppenchat, du siehst Nachrichten ab deinem Beitritt.</li>
				<li>Andere sehen deinen Anzeigenamen im Chat – keine Telefonnummer, keine E-Mail.</li>
				<li>Nach Ablauf wird der Raum mit allen Nachrichten vom Server gelöscht.</li>
			</ul>
			<form
				method="POST"
				use:enhance={() => {
					busy = true;
					error = '';
					return async ({ result, update }) => {
						if (result.type === 'success' && result.data?.roomId) {
							try {
								await joinTreffen(String(result.data.roomId));
								await goto(`/nachrichten/chat/${encodeURIComponent(String(result.data.roomId))}`);
							} catch (e) {
								error = (e as Error).message || 'Beitritt fehlgeschlagen.';
							}
						} else await update();
						busy = false;
					};
				}}
			>
				{#if form?.error || error}<p class="err" role="alert">{form?.error ?? error}</p>{/if}
				<button class="btn signal" type="submit" disabled={busy}>{busy ? 'Trete bei …' : 'Beitreten'}</button>
			</form>
		</section>
	{/if}
</div>

<style>
	.box {
		display: grid;
		gap: var(--sp-3);
		border-top: 8px solid var(--yellow);
	}
	.kicker {
		margin: 0;
		display: flex;
		gap: var(--sp-1);
		align-items: center;
		font-weight: 700;
		color: var(--sea);
	}
	h1 {
		margin: 0;
	}
	.facts {
		margin: 0;
		padding-left: var(--sp-5);
		display: grid;
		gap: var(--sp-1);
	}
	.err {
		color: var(--danger);
		font-weight: 600;
	}
</style>
