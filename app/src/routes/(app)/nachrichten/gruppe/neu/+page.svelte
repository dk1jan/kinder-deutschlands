<script lang="ts">
	// Gruppenchat mit ausgewählten Kontakten (Einladung nur an bestätigte Kontakte).
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { chat, formatCid, startChat } from '$lib/chat/client.svelte';
	import { createGroup } from '$lib/chat/actions';
	let name = $state('');
	let picked = $state<string[]>([]);
	let busy = $state(false);
	let error = $state('');
	onMount(() => {
		void startChat();
	});
	// „Gemeinsam schreiben“ (F-008): Kontakte aus ?mit= vorauswählen
	let prefilled = false;
	$effect(() => {
		if (prefilled || chat.status !== 'bereit' || !chat.contacts.length) return;
		prefilled = true;
		const want = (new URL(location.href).searchParams.get('mit') ?? '').split(',').filter(Boolean);
		if (want.length) picked = chat.contacts.filter((c) => want.includes(c.contactId)).map((c) => c.mxid);
	});
	async function submit(e: Event) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			const id = await createGroup(name, picked);
			await goto(`/nachrichten/chat/${encodeURIComponent(id)}`);
		} catch (err) {
			error = (err as Error).message || 'Gruppe konnte nicht angelegt werden.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Neue Gruppe – Nachrichten</title></svelte:head>
<div class="container page narrow">
	<p><a href="/nachrichten">← Nachrichten</a></p>
	<h1>Neue Gruppe</h1>
	{#if chat.status !== 'bereit'}
		<p role="status">{chat.status === 'fehler' ? chat.error : 'Chat wird geladen …'}</p>
	{:else if !chat.contacts.length}
		<p>Gruppen gibt es mit bestätigten Kontakten. Du hast noch keine. <a href="/nachrichten?ansicht=kontakte">Kontakte finden</a></p>
	{:else}
		<form class="card form" onsubmit={submit}>
			<label for="g-name">Name der Gruppe</label>
			<input id="g-name" bind:value={name} required maxlength="80" placeholder="z. B. Krabbelgruppe am Stadtpark" />
			<fieldset>
				<legend>Kontakte einladen</legend>
				{#each chat.contacts as c}
					<label class="check"><input type="checkbox" value={c.mxid} bind:group={picked} /> {c.name ?? 'Familie'} <span class="muted">{formatCid(c.contactId)}</span></label>
				{/each}
			</fieldset>
			{#if error}<p class="err" role="alert">{error}</p>{/if}
			<button class="btn" type="submit" disabled={busy || !name.trim() || !picked.length}>{busy ? 'Wird angelegt …' : 'Gruppe anlegen'}</button>
			<p class="muted small">Ende-zu-Ende-verschlüsselt. Neue Mitglieder sehen Nachrichten ab ihrer Einladung.</p>
		</form>
	{/if}
</div>

<style>
	.form {
		display: grid;
		gap: var(--sp-3);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--sp-1);
	}
	legend {
		font-weight: 700;
		margin-bottom: var(--sp-2);
	}
	.check {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 44px;
	}
	.err {
		color: var(--danger);
		font-weight: 600;
	}
	.small {
		font-size: var(--fs-s);
		margin: 0;
	}
</style>
