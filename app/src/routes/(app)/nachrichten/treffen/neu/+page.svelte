<script lang="ts">
	// Treffen per QR (M06): temporärer, verschlüsselter Raum. Andere treten per QR-Code bei (nur mit Konto).
	import { onMount } from 'svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { chat, startChat } from '$lib/chat/client.svelte';
	import { createTreffen } from '$lib/chat/actions';
	let { data } = $props();
	let name = $state('');
	let hours = $state(6);
	let withPoint = $state(false);
	let point = $state<{ lat: number; lon: number } | null>(null);
	let pointLabel = $state('');
	let busy = $state(false);
	let error = $state('');
	let done = $state<{ roomId: string; url: string } | null>(null);
	const label = (h: number) => (h < 24 ? `${h} Stunden` : h === 24 ? '1 Tag' : `${h / 24} Tage`);
	onMount(() => void startChat());
	function myPos() {
		navigator.geolocation?.getCurrentPosition((p) => (point = { lat: p.coords.latitude, lon: p.coords.longitude }), () => (error = 'Standort nicht verfügbar oder nicht erlaubt.'), { enableHighAccuracy: true, timeout: 15000 });
	}
	async function submit(e: Event) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			done = await createTreffen(name, hours, withPoint && point ? { ...point, label: pointLabel } : null);
		} catch (err) {
			error = (err as Error).message || 'Treffen konnte nicht angelegt werden.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Treffen per QR – Nachrichten</title></svelte:head>
<div class="container page narrow">
	<p><a href="/nachrichten">← Nachrichten</a></p>
	<h1>Treffen per QR</h1>
	{#if done}
		<section class="card qr">
			<h2>Zum Beitreten scannen</h2>
			<img src="/api/qr?d={encodeURIComponent(done.url)}" alt="QR-Code zum Treffen „{name}“" width="260" height="260" />
			<p class="muted small">{done.url}</p>
			<p>Wer scannt, braucht ein Konto bei Kinder Deutschlands. Nach {label(hours)} wird der Raum mit allen Nachrichten vom Server gelöscht – außer du behältst ihn vorher als Gruppe.</p>
			<div class="acts">
				<button class="btn small secondary" type="button" onclick={() => navigator.clipboard?.writeText(done!.url)}>Link kopieren</button>
				{#if 'share' in navigator}<button class="btn small secondary" type="button" onclick={() => navigator.share({ title: name, url: done!.url }).catch(() => {})}>Teilen</button>{/if}
				<a class="btn small" href="/nachrichten/chat/{encodeURIComponent(done.roomId)}">Zum Treffen-Chat</a>
			</div>
		</section>
	{:else if chat.status !== 'bereit'}
		<p role="status">{chat.status === 'fehler' ? chat.error : 'Chat wird geladen …'}</p>
	{:else}
		<form class="card form" onsubmit={submit}>
			<p>Für spontane Runden – Spielplatz, Kinderwagen-Spaziergang, Kurs. Ihr müsst keine Kontakte sein; Telefonnummern braucht niemand.</p>
			<label for="t-name">Name</label>
			<input id="t-name" bind:value={name} required maxlength="80" placeholder="z. B. Spielplatz Bürgerpark 15 Uhr" />
			<label for="t-h">Dauer</label>
			<select id="t-h" bind:value={hours}>{#each data.hours as h}<option value={h}>{label(h)}</option>{/each}</select>
			<label class="check"><input type="checkbox" bind:checked={withPoint} /> Treffpunkt mitschicken</label>
			{#if withPoint}
				<div class="row">
					<button class="btn small secondary" type="button" onclick={myPos}><Icon name="standort" size={18} /> Mein Standort</button>
					<button class="btn small secondary" type="button" onclick={() => (point ??= { lat: data.center[1], lon: data.center[0] })}><Icon name="karte" size={18} /> Auf Karte wählen</button>
				</div>
				{#if point}
					<div class="map"><FamilyMap mode="pick" tiles={data.tiles} center={[point.lon, point.lat]} zoom={16} label="Treffpunkt wählen" onPick={(lon, lat) => (point = { lat, lon })} /></div>
					<label for="t-pl">Beschreibung (optional)</label>
					<input id="t-pl" bind:value={pointLabel} maxlength="120" placeholder="z. B. Eingang am Teich" />
				{/if}
			{/if}
			{#if error}<p class="err" role="alert">{error}</p>{/if}
			<button class="btn" type="submit" disabled={busy || !name.trim() || (withPoint && !point)}>{busy ? 'Wird angelegt …' : 'Treffen starten'}</button>
			<p class="muted small">Ende-zu-Ende-verschlüsselt. Wer später beitritt, sieht nur Nachrichten ab dem Beitritt. Raumname und Ablaufzeit kennt der Server, den Inhalt nicht.</p>
		</form>
	{/if}
</div>

<style>
	.form,
	.qr {
		display: grid;
		gap: var(--sp-3);
	}
	.qr {
		justify-items: start;
	}
	.qr img {
		background: #fff;
		padding: 10px;
		border-radius: var(--radius-s);
	}
	.qr h2 {
		margin: 0;
	}
	.check {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 44px;
	}
	.row,
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.row .btn {
		display: inline-flex;
		gap: var(--sp-1);
		align-items: center;
	}
	.map {
		height: 16rem;
		border-radius: var(--radius-s);
		overflow: hidden;
	}
	.err {
		color: var(--danger);
		font-weight: 600;
	}
	.small {
		font-size: var(--fs-s);
		margin: 0;
	}
	p {
		margin: 0;
	}
</style>
