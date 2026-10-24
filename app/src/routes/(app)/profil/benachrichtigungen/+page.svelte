<script lang="ts">
	// Benachrichtigungen: Push je Gerät, Ruhezeiten, Lesebestätigungen und Tippanzeige (standardmäßig aus).
	import { onMount } from 'svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { api, disablePush, enablePush, pushState } from '$lib/chat/client.svelte';
	let { data, form } = $props();
	let pstate = $state<'an' | 'aus' | 'blockiert' | 'nicht_moeglich' | 'laedt'>('laedt');
	let msg = $state('');
	let busy = $state(false);
	// svelte-ignore state_referenced_locally
	let quiet = $state(data.s.quiet_from !== null);
	let ios = $state(false);
	let standalone = $state(false);
	let installEvent = $state<(Event & { prompt: () => Promise<void> }) | null>(null);

	onMount(() => {
		ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
		const onPrompt = (e: Event) => {
			e.preventDefault();
			installEvent = e as never;
		};
		addEventListener('beforeinstallprompt', onPrompt);
		void pushState().then((s) => (pstate = s));
		return () => removeEventListener('beforeinstallprompt', onPrompt);
	});

	async function on() {
		busy = true;
		msg = '';
		const err = await enablePush();
		msg = err ?? 'Push ist auf diesem Gerät eingeschaltet.';
		pstate = await pushState();
		busy = false;
	}
	async function off() {
		busy = true;
		await disablePush();
		pstate = await pushState();
		msg = 'Push auf diesem Gerät ausgeschaltet.';
		busy = false;
	}
	async function test() {
		const r = await api<{ sent: number }>('/api/push/test', { json: {} });
		msg = r.error ?? (r.sent ? 'Test gesendet – gleich sollte ein Hinweis erscheinen.' : 'Kein Gerät für Push angemeldet.');
	}
</script>

<svelte:head><title>Benachrichtigungen – Kinder Deutschlands</title></svelte:head>
<div class="container page narrow">
	<p><a href="/profil">← Profil</a></p>
	<h1>Benachrichtigungen</h1>

	<section class="card">
		<h2>Push auf diesem Gerät</h2>
		{#if pstate === 'laedt'}
			<p class="muted">Prüfe …</p>
		{:else if pstate === 'nicht_moeglich'}
			{#if ios && !standalone}
				<p>Auf dem iPhone/iPad gibt es Push nur, wenn Kinder Deutschlands als App auf dem Home-Bildschirm liegt (ab iOS 16.4):</p>
				<ol>
					<li>In Safari unten auf <strong>Teilen</strong> tippen (Quadrat mit Pfeil).</li>
					<li><strong>Zum Home-Bildschirm</strong> wählen, dann <strong>Hinzufügen</strong>.</li>
					<li>Die App vom Home-Bildschirm öffnen und hier Push einschalten.</li>
				</ol>
			{:else}
				<p>Dieser Browser unterstützt keine Push-Benachrichtigungen. Neue Nachrichten siehst du, wenn du die Seite öffnest.</p>
			{/if}
		{:else if pstate === 'blockiert'}
			<p>Benachrichtigungen sind im Browser für diese Seite blockiert. Erlaube sie in den Website-Einstellungen des Browsers und lade die Seite neu.</p>
		{:else if pstate === 'an'}
			<p>Eingeschaltet. Hinweise zeigen nur „Neue Nachricht“ bzw. „Neue Mitteilung“ – nie Inhalt oder Absender.</p>
			<div class="acts">
				<button class="btn small secondary" type="button" onclick={test}>Test senden</button>
				<button class="btn small secondary" type="button" disabled={busy} onclick={off}>Auf diesem Gerät ausschalten</button>
			</div>
		{:else}
			<p>Hinweise zu neuen Chatnachrichten – auch wenn die Seite geschlossen ist. Der Inhalt bleibt verschlüsselt und erscheint nie auf dem Sperrbildschirm.</p>
			<button class="btn" type="button" disabled={busy} onclick={on}>Push einschalten</button>
		{/if}
		{#if msg}<p class="msg" role="status">{msg}</p>{/if}
		{#if installEvent && !standalone}
			<p><button class="btn small secondary" type="button" onclick={() => installEvent?.prompt()}>Als App installieren</button></p>
		{/if}
		{#if data.devices.length}
			<p class="muted small">Push angemeldet auf: {data.devices.map((d) => d.label).join(', ')}</p>
		{/if}
	</section>

	<form method="POST" class="card form">
		<h2>Was und wann</h2>
		{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
		{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
		<label class="check"><input type="checkbox" name="push_chat" checked={data.s.push_chat} /> Neue Chatnachrichten</label>
		<label class="check"><input type="checkbox" name="push_community" checked={data.s.push_community} /> Community-Mitteilungen (Antworten, Moderation)</label>
		<label class="check"><input type="checkbox" name="push_reminders" checked={data.s.push_reminders} /> Erinnerungen, die ich an Terminen oder Fristen selbst eingestellt habe</label>
		<label class="check"><input type="checkbox" name="push_urgent" checked={data.s.push_urgent} /> Wichtiges sofort: Rundnachrichten des Teams mit Push und dringende Hinweise der Redaktion für meine Radar-Regionen</label>
		<label class="check"><input type="checkbox" name="push_market" checked={data.s.push_market} /> Neue Anzeigen zu meinen Marktplatz-Suchaufträgen</label>
		<p class="muted small">Amtliche Unwetterwarnungen für deine Regionen (mit eigener Stufe und Push) stellst du unter <a href="/warnungen">Unwetterwarnungen</a> ein.</p>
		<label class="check"><input type="checkbox" name="quiet" bind:checked={quiet} /> Ruhezeit (keine Push-Hinweise)</label>
		{#if quiet}
			<div class="times">
				<label>von <input type="time" name="quiet_from" value={data.s.quietFrom || '20:00'} required /></label>
				<label>bis <input type="time" name="quiet_to" value={data.s.quietTo || '07:00'} required /></label>
			</div>
		{/if}
		<h2>Im Chat</h2>
		<label class="check"><input type="checkbox" name="read_receipts" checked={data.s.read_receipts} /> Lesebestätigungen senden (andere sehen „gelesen“)</label>
		<label class="check"><input type="checkbox" name="typing" checked={data.s.typing} /> Anzeigen, wenn ich gerade schreibe</label>
		<p class="muted small">Ein Online-Status wird nicht angezeigt. Einzelne Unterhaltungen stummschalten: im Chat über „⋯“. Änderungen im Chat gelten nach dem nächsten Öffnen.</p>
		<button class="btn" type="submit">Speichern</button>
	</form>
</div>

<style>
	.card {
		margin-bottom: var(--sp-5);
		display: grid;
		gap: var(--sp-3);
	}
	h2 {
		font-size: var(--fs-l);
		margin: 0;
	}
	p,
	ol {
		margin: 0;
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		min-height: 44px;
	}
	.times {
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}
	.times input {
		width: auto;
		margin-left: var(--sp-2);
	}
	.acts {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.msg {
		font-weight: 600;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
