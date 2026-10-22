<script lang="ts">
	// Eingabe: Text, Bild, Datei, Sprachnachricht, Treffpunkt, Live-Standort.
	import Icon from '$lib/components/Icon.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import { chat, getClient } from '$lib/chat/client.svelte';
	import { sendFile, sendImage, sendLocation, sendText, sendVoice } from '$lib/chat/actions';
	import { live, LIVE_MINUTES, startLive, stopLive } from '$lib/chat/live.svelte';
	import { duration, remaining } from '$lib/chat/format';

	let { roomId, tiles, center, disabled = false }: { roomId: string; tiles: boolean; center: [number, number]; disabled?: boolean } = $props();

	let text = $state('');
	let busy = $state(false);
	let error = $state('');
	let panel = $state<'none' | 'anhang' | 'ort'>('none');
	let ta: HTMLTextAreaElement | undefined = $state();
	let imageInput: HTMLInputElement | undefined = $state();
	let fileInput: HTMLInputElement | undefined = $state();

	// Sprachnachricht
	let rec: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	let recStart = 0;
	let recording = $state(false);
	let recMs = $state(0);
	let recTimer: ReturnType<typeof setInterval> | null = null;
	let cancelRec = false;

	// Treffpunkt
	let pick = $state<{ lat: number; lon: number } | null>(null);
	let pickLabel = $state('');
	let pickMap = $state(false);

	const sharing = $derived(live.rooms[roomId]);
	let now = $state(Date.now());
	$effect(() => {
		if (!sharing) return;
		const t = setInterval(() => (now = Date.now()), 15_000);
		return () => clearInterval(t);
	});

	let typingSent = 0;
	function onInput() {
		if (ta) {
			ta.style.height = 'auto';
			ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
		}
		if (chat.settings.typing && Date.now() - typingSent > 4000 && text.trim()) {
			typingSent = Date.now();
			void getClient()?.sendTyping(roomId, true, 6000).catch(() => {});
		}
	}

	async function guard(fn: () => Promise<void>) {
		busy = true;
		error = '';
		try {
			await fn();
		} catch (e) {
			const m = (e as { errcode?: string; message?: string }).errcode === 'M_FORBIDDEN' ? 'Senden nicht möglich (blockiert, eingeschränkt oder Treffen beendet).' : (e as Error).message;
			error = m || 'Senden fehlgeschlagen.';
		} finally {
			busy = false;
		}
	}

	function submit(e?: Event) {
		e?.preventDefault();
		const t = text;
		if (!t.trim()) return;
		text = '';
		if (ta) ta.style.height = 'auto';
		if (chat.settings.typing) void getClient()?.sendTyping(roomId, false, 0).catch(() => {});
		void guard(() => sendText(roomId, t)).then(() => {
			if (error) text = t;
		});
	}

	function keydown(e: KeyboardEvent) {
		// Desktop: Enter sendet, Umschalt+Enter neue Zeile. Auf Touch-Geräten bleibt Enter ein Zeilenumbruch.
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) submit(e);
	}

	async function onImage(e: Event) {
		const files = Array.from((e.target as HTMLInputElement).files ?? []).slice(0, 6);
		(e.target as HTMLInputElement).value = '';
		panel = 'none';
		for (const f of files) await guard(() => sendImage(roomId, f));
	}
	async function onFile(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		(e.target as HTMLInputElement).value = '';
		panel = 'none';
		if (f) await guard(() => sendFile(roomId, f));
	}

	async function startRec() {
		error = '';
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
			rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
			chunks = [];
			cancelRec = false;
			rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
			rec.onstop = () => {
				stream.getTracks().forEach((t) => t.stop());
				const ms = Date.now() - recStart;
				if (recTimer) clearInterval(recTimer);
				recording = false;
				if (cancelRec || ms < 700) return;
				const blob = new Blob(chunks, { type: rec?.mimeType || 'audio/webm' });
				void guard(() => sendVoice(roomId, blob, ms));
			};
			recStart = Date.now();
			recMs = 0;
			rec.start(250);
			recording = true;
			recTimer = setInterval(() => {
				recMs = Date.now() - recStart;
				if (recMs > 5 * 60_000) rec?.stop();
			}, 200);
		} catch {
			error = 'Mikrofon nicht verfügbar oder nicht erlaubt.';
		}
	}
	function stopRec(cancel = false) {
		cancelRec = cancel;
		rec?.stop();
	}

	function useMyPosition() {
		error = '';
		navigator.geolocation?.getCurrentPosition(
			(p) => {
				pick = { lat: p.coords.latitude, lon: p.coords.longitude };
				pickMap = true;
			},
			() => (error = 'Standort nicht verfügbar oder nicht erlaubt.'),
			{ enableHighAccuracy: true, timeout: 15_000 }
		);
	}
	async function sendPick() {
		if (!pick) return;
		await guard(() => sendLocation(roomId, pick!.lat, pick!.lon, pickLabel));
		if (!error) {
			pick = null;
			pickLabel = '';
			pickMap = false;
			panel = 'none';
		}
	}
	async function share(min: number) {
		await guard(() => startLive(roomId, min));
		if (!error) panel = 'none';
	}
</script>

<div class="composer">
	{#if sharing}
		<div class="live" role="status">
			<span class="dot" aria-hidden="true"></span>
			<!-- kompakt in einer Zeile (F-025); Hinweis „nur solange die Seite offen ist“ im Titel und für Screenreader -->
			<span class="ltext" title="Nur solange diese Seite geöffnet ist."><b>Du teilst live</b> · {remaining(sharing.until, now)}{sharing.error ? ` · ${sharing.error}` : ''}<span class="sr">. Nur solange diese Seite geöffnet ist.</span></span>
			<button class="btn small danger lstop" type="button" onclick={() => stopLive(roomId)}>Stoppen</button>
		</div>
	{/if}
	{#if error}<p class="err" role="alert">{error}</p>{/if}

	{#if panel === 'anhang'}
		<div class="panel">
			<button class="opt" type="button" onclick={() => imageInput?.click()}><Icon name="bild" /> Bild</button>
			<button class="opt" type="button" onclick={() => fileInput?.click()}><Icon name="anhang" /> Datei (bis 20 MB)</button>
			<p class="muted small">Bilder werden verkleinert und ohne Standortdaten verschickt.</p>
		</div>
	{:else if panel === 'ort'}
		<div class="panel ort">
			<h3>Treffpunkt senden</h3>
			<div class="row">
				<button class="btn small secondary" type="button" onclick={useMyPosition}><Icon name="standort" size={18} /> Mein Standort</button>
				<button class="btn small secondary" type="button" onclick={() => { pickMap = true; pick ??= { lat: center[1], lon: center[0] }; }}><Icon name="karte" size={18} /> Auf Karte wählen</button>
			</div>
			{#if pickMap && pick}
				<div class="map">
					<FamilyMap mode="pick" {tiles} center={[pick.lon, pick.lat]} zoom={16} label="Treffpunkt wählen" onPick={(lon, lat) => (pick = { lat, lon })} />
				</div>
				<label for="pick-l">Beschreibung (optional)</label>
				<input id="pick-l" bind:value={pickLabel} maxlength="120" placeholder="z. B. am großen Klettergerüst" />
				<button class="btn small" type="button" disabled={busy} onclick={sendPick}>Treffpunkt senden</button>
			{/if}
			<h3>Live-Standort teilen</h3>
			<p class="muted small">Alle in dieser Unterhaltung sehen deinen Standort, bis die Zeit abläuft oder du stoppst. Ende-zu-Ende-verschlüsselt – der Server kann deinen Standort nicht lesen.</p>
			<div class="row">
				{#each LIVE_MINUTES as m}
					<button class="btn small" type="button" disabled={busy} onclick={() => share(m)}>{m} Min.</button>
				{/each}
			</div>
		</div>
	{/if}

	<input bind:this={imageInput} type="file" accept="image/*" multiple hidden onchange={onImage} />
	<input bind:this={fileInput} type="file" hidden onchange={onFile} />

	{#if recording}
		<div class="bar recbar" role="status">
			<span class="dot" aria-hidden="true"></span>
			<span class="rectime">Aufnahme {duration(recMs)}</span>
			<button class="btn small secondary" type="button" onclick={() => stopRec(true)}>Verwerfen</button>
			<button class="btn small signal" type="button" onclick={() => stopRec(false)}><Icon name="senden" size={18} /> Senden</button>
		</div>
	{:else}
		<form class="bar" onsubmit={submit}>
			<button class="icon" type="button" aria-label="Anhang" aria-expanded={panel === 'anhang'} onclick={() => (panel = panel === 'anhang' ? 'none' : 'anhang')} {disabled}><Icon name="anhang" /></button>
			<button class="icon" type="button" aria-label="Treffpunkt oder Live-Standort" aria-expanded={panel === 'ort'} onclick={() => (panel = panel === 'ort' ? 'none' : 'ort')} {disabled}><Icon name="pin" /></button>
			<label for="cmp-t" class="visually-hidden">Nachricht</label>
			<textarea id="cmp-t" bind:this={ta} bind:value={text} rows="1" maxlength="8000" placeholder={disabled ? 'Senden nicht möglich' : 'Nachricht'} oninput={onInput} onkeydown={keydown} {disabled}></textarea>
			{#if text.trim()}
				<button class="icon send" type="submit" aria-label="Senden" disabled={busy || disabled}><Icon name="senden" /></button>
			{:else}
				<button class="icon send" type="button" aria-label="Sprachnachricht aufnehmen" onclick={startRec} disabled={busy || disabled}><Icon name="mikro" /></button>
			{/if}
		</form>
	{/if}
</div>

<style>
	.composer {
		display: grid;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3) calc(var(--sp-2) + env(safe-area-inset-bottom));
		background: var(--surface);
		border-top: 1px solid var(--line);
	}
	.bar {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-1);
	}
	textarea {
		flex: 1;
		min-width: 0;
		resize: none;
		min-height: 44px;
		max-height: 180px;
		padding: 10px var(--sp-3);
		border-radius: 22px;
		line-height: 1.4;
		margin: 0;
	}
	.icon {
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 0;
		background: none;
		color: var(--ink-2);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.icon:hover,
	.icon[aria-expanded='true'] {
		background: var(--surface-2);
		color: var(--ink);
	}
	.icon.send {
		background: var(--yellow);
		color: var(--navy);
	}
	.icon[disabled] {
		opacity: 0.4;
		cursor: default;
	}
	.panel {
		display: grid;
		gap: var(--sp-2);
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		background: var(--surface-2);
	}
	.panel h3 {
		font-size: var(--fs-m);
		margin: var(--sp-2) 0 0;
	}
	.opt {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-s);
		padding: var(--sp-3);
		font: inherit;
		color: var(--ink);
		cursor: pointer;
		min-height: 48px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.row .btn {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
	}
	.map {
		height: 14rem;
		border-radius: var(--radius-s);
		overflow: hidden;
	}
	.small {
		font-size: var(--fs-s);
		margin: 0;
	}
	.err {
		color: var(--danger);
		font-weight: 600;
		margin: 0;
	}
	.live,
	.recbar {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
		font-size: var(--fs-s);
	}
	.live .ltext {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.live .lstop {
		min-height: 36px;
		padding: 0 var(--sp-3);
	}
	.live .sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.live {
		flex-wrap: nowrap !important;
		padding: var(--sp-1) var(--sp-2) var(--sp-1) var(--sp-3);
		border-radius: var(--radius-s);
		background: #fff3d1;
		color: var(--navy);
	}
	.recbar {
		min-height: 48px;
	}
	.rectime {
		flex: 1;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--red);
		animation: blink 1.2s infinite;
	}
	@keyframes blink {
		50% {
			opacity: 0.3;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dot {
			animation: none;
		}
	}
</style>
