<script lang="ts">
	// Anruf-Fenster (eingehend, wählend, verbunden). Liegt über jeder Seite, solange ein Anruf läuft.
	import Icon from '$lib/components/Icon.svelte';
	import { answer, call, hangup, reject, toggleCamera, toggleMute } from '$lib/chat/calls.svelte';

	let remoteEl: HTMLVideoElement | undefined = $state();
	let localEl: HTMLVideoElement | undefined = $state();
	let audioEl: HTMLAudioElement | undefined = $state();
	let now = $state(Date.now());
	let busy = $state(false);
	let err = $state('');

	$effect(() => {
		if (remoteEl) remoteEl.srcObject = call.remote;
		if (audioEl) audioEl.srcObject = call.remote;
	});
	$effect(() => {
		if (localEl) localEl.srcObject = call.local;
	});
	$effect(() => {
		if (call.view !== 'verbunden') return;
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});
	const dur = $derived.by(() => {
		if (!call.startedAt) return '';
		const s = Math.max(0, Math.floor((now - call.startedAt) / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	});
	const label = $derived(
		call.view === 'klingelt' ? `${call.video ? 'Videoanruf' : 'Anruf'} von ${call.peer}` : call.view === 'waehlt' ? `Rufe ${call.peer} an …` : call.view === 'verbindet' ? 'Verbinde …' : call.view === 'verbunden' ? `${call.peer} · ${dur}` : call.reason || 'Anruf beendet.'
	);
	async function take() {
		busy = true;
		err = '';
		try {
			await answer();
		} catch {
			err = 'Kein Zugriff auf Mikrofon/Kamera – bitte im Browser erlauben.';
		}
		busy = false;
	}
</script>

{#if call.view !== 'aus'}
	<div class="call" class:video={call.video && call.view === 'verbunden'} role="dialog" aria-modal="false" aria-label="Anruf" aria-live="polite">
		{#if call.video}
			<video class="remote" bind:this={remoteEl} autoplay playsinline></video>
			<video class="local" bind:this={localEl} autoplay playsinline muted></video>
		{:else}
			<audio bind:this={audioEl} autoplay></audio>
		{/if}
		<div class="bar">
			<p class="label"><Icon name={call.video ? 'bild' : 'mikro'} size={18} /> <span>{label}</span></p>
			{#if err}<p class="err" role="alert">{err}</p>{/if}
			{#if call.view === 'klingelt'}
				<div class="btns">
					<button class="round ok" type="button" onclick={take} disabled={busy} aria-label="Annehmen">Annehmen</button>
					<button class="round no" type="button" onclick={reject} aria-label="Ablehnen">Ablehnen</button>
				</div>
			{:else if call.view !== 'beendet'}
				<div class="btns">
					<button class="round" type="button" onclick={toggleMute} aria-pressed={call.muted}>{call.muted ? 'Ton an' : 'Stumm'}</button>
					{#if call.video}<button class="round" type="button" onclick={toggleCamera} aria-pressed={call.camOff}>{call.camOff ? 'Kamera an' : 'Kamera aus'}</button>{/if}
					<button class="round no" type="button" onclick={hangup}>Auflegen</button>
				</div>
				<p class="hint">Ende-zu-Ende-verschlüsselt · kein Mitschnitt</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.call {
		position: fixed;
		z-index: 1000;
		right: var(--sp-3);
		bottom: calc(var(--sp-3) + 72px);
		width: min(22rem, calc(100vw - 2 * var(--sp-3)));
		background: var(--navy);
		color: #fff;
		border-radius: var(--radius-l);
		box-shadow: 0 10px 40px rgb(0 0 0 / 0.35);
		overflow: hidden;
	}
	.call.video {
		inset: 0;
		width: auto;
		border-radius: 0;
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		background: #000;
	}
	.remote {
		width: 100%;
		height: 100%;
		min-height: 0;
		object-fit: cover;
		background: #000;
	}
	.call:not(.video) .remote,
	.call:not(.video) .local {
		display: none;
	}
	.local {
		position: absolute;
		top: var(--sp-3);
		right: var(--sp-3);
		width: 28%;
		max-width: 10rem;
		border-radius: var(--radius-m);
		border: 2px solid #fff;
		background: #222;
	}
	.bar {
		padding: var(--sp-4);
		display: grid;
		gap: var(--sp-3);
		background: var(--navy);
	}
	.label {
		margin: 0;
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		font-weight: 700;
	}
	.btns {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.round {
		flex: 1;
		min-height: 48px;
		border-radius: 999px;
		border: 0;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		background: rgb(255 255 255 / 0.15);
		color: #fff;
	}
	.round[aria-pressed='true'] {
		background: var(--yellow);
		color: var(--navy);
	}
	.round.ok {
		background: #1f7468;
	}
	.round.no {
		background: #d63d31;
	}
	.hint {
		margin: 0;
		font-size: var(--fs-xs);
		opacity: 0.8;
	}
	.err {
		margin: 0;
		color: var(--yellow);
	}
	@media (min-width: 900px) {
		.call {
			bottom: var(--sp-4);
		}
	}
</style>
