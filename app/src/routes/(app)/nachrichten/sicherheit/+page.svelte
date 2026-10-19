<script lang="ts">
	// Verschlüsselung und Geräte: Wiederherstellungsschlüssel, angemeldete Chat-Geräte abmelden.
	import { onMount } from 'svelte';
	import KeyCard from '$lib/components/chat/KeyCard.svelte';
	import { api, chat, getClient, startChat } from '$lib/chat/client.svelte';
	import { timeShort } from '$lib/chat/format';

	interface Device {
		id: string;
		name: string | null;
		lastSeen: number | null;
	}
	let devices = $state<Device[]>([]);
	let error = $state('');
	const current = $derived(getClient()?.getDeviceId() ?? '');

	async function load() {
		const r = await api<{ devices: Device[] }>('/api/chat/geraete');
		if (r.error) error = r.error;
		else devices = r.devices.filter((d) => d.id !== 'KDSYSTEM').sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
	}
	onMount(async () => {
		await startChat();
		await load();
	});
	async function remove(id: string) {
		if (!confirm('Dieses Gerät vom Chat abmelden? Dort gespeicherte Nachrichten sind danach nicht mehr lesbar, bis es wieder freigeschaltet wird.')) return;
		const r = await api('/api/chat/geraete', { json: { deviceId: id } });
		if (r.error) error = r.error;
		await load();
	}
</script>

<svelte:head><title>Geräte und Schlüssel – Nachrichten</title></svelte:head>
<div class="container page narrow">
	<p><a href="/nachrichten">← Nachrichten</a></p>
	<h1>Geräte und Schlüssel</h1>
	<p class="lead">Deine Chats sind Ende-zu-Ende-verschlüsselt: Nur die Geräte der Beteiligten können sie lesen – nicht der Betreiber, nicht die Moderation. Darum gibt es den Wiederherstellungsschlüssel.</p>
	{#if chat.status === 'bereit'}
		<KeyCard full />
	{:else}
		<p role="status">{chat.status === 'fehler' ? chat.error : 'Chat wird geladen …'}</p>
	{/if}

	<section class="card">
		<h2>Angemeldete Geräte</h2>
		{#if error}<p class="err" role="alert">{error}</p>{/if}
		<ul class="devs">
			{#each devices as d (d.id)}
				<li>
					<div>
						<strong>{d.name ?? 'Unbekanntes Gerät'}</strong>{#if d.id === current} <span class="mini">dieses Gerät</span>{/if}
						<p class="muted">{d.lastSeen ? `zuletzt aktiv ${timeShort(d.lastSeen)}` : 'noch nicht aktiv'}</p>
					</div>
					{#if d.id !== current}<button class="btn small secondary" type="button" onclick={() => remove(d.id)}>Abmelden</button>{/if}
				</li>
			{:else}
				<li class="muted">Keine Geräte gefunden.</li>
			{/each}
		</ul>
	</section>

	<section class="card info">
		<h2>Was du wissen solltest</h2>
		<ul>
			<li>Neues Handy: Anmelden, Wiederherstellungsschlüssel eingeben – dann sind frühere Nachrichten wieder lesbar.</li>
			<li>Ohne Schlüssel funktionieren neue Nachrichten, frühere bleiben auf dem neuen Gerät unlesbar. Wiederherstellen kann sie niemand, auch wir nicht.</li>
			<li>Suche in Chats ist nur auf deinem Gerät möglich, nicht auf dem Server.</li>
			<li>Melden: Du gibst dabei selbst frei, welche Nachrichten die Moderation sehen darf.</li>
			<li>Benachrichtigungen zeigen nur „Neue Nachricht“, nie den Inhalt. <a href="/profil/benachrichtigungen">Einstellungen</a></li>
		</ul>
	</section>
</div>

<style>
	.lead {
		max-width: var(--measure);
	}
	.card {
		margin-bottom: var(--sp-5);
	}
	h2 {
		font-size: var(--fs-l);
		margin-top: 0;
	}
	.devs {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--sp-3);
	}
	.devs li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	.devs p {
		margin: 0;
		font-size: var(--fs-s);
	}
	.mini {
		font-size: var(--fs-xs);
		font-weight: 700;
		background: var(--surface-2);
		padding: 2px 8px;
		border-radius: 999px;
	}
	.info ul {
		margin: 0;
		padding-left: var(--sp-5);
		display: grid;
		gap: var(--sp-2);
	}
	.err {
		color: var(--danger);
	}
</style>
