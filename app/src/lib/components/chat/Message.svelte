<script lang="ts">
	// Eine Chatnachricht: Text (Links klickbar), Bild, Datei, Sprachnachricht, Treffpunkt. Anhänge werden erst hier entschlüsselt.
	import type { MatrixEvent, Room } from 'matrix-js-sdk';
	import Icon from '$lib/components/Icon.svelte';
	import NavChooser from '$lib/components/NavChooser.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import { clock, duration, fileSize, linkify, parseGeo } from '$lib/chat/format';
	import { deleteMessage, mediaUrl } from '$lib/chat/actions';
	import type { EncryptedFile } from '$lib/chat/attachments';

	let { ev, room, mine, showName, tiles, read = false, onReport }: { ev: MatrixEvent; room: Room; mine: boolean; showName: boolean; tiles: boolean; read?: boolean; onReport: (ev: MatrixEvent) => void } = $props();

	const c = $derived(ev.getContent() as Record<string, unknown>);
	const type = $derived(ev.isRedacted() ? 'geloescht' : ev.isDecryptionFailure() || ev.getType() === 'm.room.encrypted' ? 'verschluesselt' : String(c.msgtype ?? 'm.text'));
	const name = $derived(room.getMember(ev.getSender() ?? '')?.name ?? 'Mitglied');
	const file = $derived(c.file as EncryptedFile | undefined);
	const info = $derived((c.info ?? {}) as { mimetype?: string; size?: number; w?: number; h?: number; duration?: number });
	const geo = $derived(type === 'm.location' ? parseGeo(String(c.geo_uri ?? '')) : null);
	const label = $derived(String((c['org.matrix.msc3488.location'] as { description?: string } | undefined)?.description ?? String(c.body ?? '').replace(/^Treffpunkt:\s*/, '')));

	let src = $state<string | null>(null);
	let loadError = $state('');
	let showMap = $state(false);
	let menu = $state(false);

	async function load() {
		if (!file || src) return;
		try {
			src = await mediaUrl(file, info.mimetype ?? 'application/octet-stream');
		} catch (e) {
			loadError = (e as Error).message;
		}
	}
	$effect(() => {
		if (type === 'm.image') void load();
	});
	async function saveFile() {
		await load();
		if (!src) return;
		const a = document.createElement('a');
		a.href = src;
		a.download = String(c.filename ?? c.body ?? 'datei');
		a.click();
	}
	async function remove() {
		menu = false;
		if (confirm('Nachricht für alle löschen?')) await deleteMessage(room.roomId, ev.getId()!).catch(() => {});
	}
</script>

<div class="msg" class:mine id="m-{ev.getId()}">
	<div class="bubble" class:media={type === 'm.image'}>
		{#if showName && !mine}<span class="who">{name}</span>{/if}
		{#if type === 'geloescht'}
			<p class="muted gone">Nachricht gelöscht</p>
		{:else if type === 'verschluesselt'}
			<p class="muted gone"><Icon name="schloss" size={16} /> Diese Nachricht ist auf diesem Gerät nicht lesbar. <a href="/nachrichten/sicherheit">Gerät freischalten</a></p>
		{:else if type === 'm.image'}
			{#if src}
				<a href={src} target="_blank" rel="noopener"><img {src} alt="Bild von {name}" width={info.w} height={info.h} /></a>
			{:else}
				<div class="ph" style:aspect-ratio="{info.w ?? 4} / {info.h ?? 3}" style:background-image={c['de.kinder.thumb'] ? `url(${c['de.kinder.thumb']})` : undefined}>
					<span>{loadError || 'Bild wird entschlüsselt …'}</span>
				</div>
			{/if}
		{:else if type === 'm.file'}
			<button class="file" type="button" onclick={saveFile}><Icon name="anhang" size={20} /> <span>{String(c.filename ?? c.body ?? 'Datei')}</span> <small class="muted">{info.size ? fileSize(info.size) : ''}</small></button>
			{#if loadError}<p class="err">{loadError}</p>{/if}
		{:else if type === 'm.audio'}
			{#if src}
				<!-- svelte-ignore a11y_media_has_caption -->
				<audio controls {src} preload="auto"></audio>
			{:else}
				<button class="file" type="button" onclick={load}><Icon name="abspielen" size={20} /> Sprachnachricht {info.duration ? duration(info.duration) : ''}</button>
				{#if loadError}<p class="err">{loadError}</p>{/if}
			{/if}
		{:else if type === 'm.location' && geo}
			<div class="loc">
				<p><Icon name="pin" size={18} /> <strong>Treffpunkt</strong> {label}</p>
				<div class="acts">
					<NavChooser lat={geo.lat} lon={geo.lon} name={label || 'Treffpunkt'} variant="button" up />
					<button class="btn small secondary" type="button" onclick={() => (showMap = !showMap)}>{showMap ? 'Karte ausblenden' : 'Auf Karte'}</button>
				</div>
				{#if showMap}
					<div class="map"><FamilyMap mode="mini" {tiles} center={[geo.lon, geo.lat]} zoom={16} points={[{ lon: geo.lon, lat: geo.lat, kind: 'treffpunkt' }]} label="Treffpunkt {label}" /></div>
				{/if}
			</div>
		{:else}
			<p class="text">{@html linkify(String(c.body ?? ''))}</p>
		{/if}
		<span class="meta muted">
			{clock(ev.getTs())}
			{#if mine && read}<span title="Gelesen">· gelesen</span>{/if}
			{#if ev.status === 'sending' || ev.status === 'queued' || ev.status === 'encrypting'}· wird gesendet{/if}
			{#if ev.status === 'not_sent'}<span class="err">· nicht gesendet</span>{/if}
		</span>
	</div>
	{#if type !== 'geloescht'}
		<div class="more">
			<button class="dots" type="button" aria-label="Optionen zur Nachricht" aria-expanded={menu} onclick={() => (menu = !menu)}><Icon name="mehr" size={20} /></button>
			{#if menu}
				<div class="menu" role="menu">
					{#if mine}
						<button role="menuitem" type="button" onclick={remove}>Löschen</button>
					{:else if type !== 'verschluesselt'}
						<button role="menuitem" type="button" onclick={() => { menu = false; onReport(ev); }}>Melden</button>
					{/if}
					{#if type === 'm.text'}<button role="menuitem" type="button" onclick={() => { menu = false; navigator.clipboard?.writeText(String(c.body ?? '')); }}>Kopieren</button>{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.msg {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-1);
		max-width: 100%;
	}
	.msg.mine {
		flex-direction: row-reverse;
	}
	.bubble {
		max-width: min(80%, 34rem);
		padding: var(--sp-2) var(--sp-3);
		border-radius: 18px 18px 18px 6px;
		background: var(--surface);
		box-shadow: 0 1px 1px rgb(15 34 56 / 0.08);
		display: grid;
		gap: 2px;
		overflow-wrap: anywhere;
	}
	.mine .bubble {
		border-radius: 18px 18px 6px 18px;
		background: #fff3d1;
		color: var(--navy);
	}
	:global([data-theme='dark']) .mine .bubble {
		background: #3a3214;
		color: var(--ink);
	}
	@media (prefers-color-scheme: dark) {
		:global(html:not([data-theme='light'])) .mine .bubble {
			background: #3a3214;
			color: var(--ink);
		}
	}
	.bubble.media {
		padding: 4px;
	}
	.who {
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--sea);
		padding: 0 var(--sp-1);
	}
	.text {
		margin: 0;
		white-space: pre-wrap;
		line-height: 1.45;
	}
	.text :global(a) {
		color: var(--link);
	}
	.gone {
		margin: 0;
		font-style: italic;
		display: flex;
		gap: var(--sp-1);
		align-items: center;
		flex-wrap: wrap;
	}
	img {
		display: block;
		max-width: min(100%, 22rem);
		height: auto;
		max-height: min(60vh, 26rem);
		width: auto;
		object-fit: contain;
		border-radius: 14px;
	}
	.ph {
		width: min(18rem, 70vw);
		max-height: 50vh;
		border-radius: 14px;
		background: var(--surface-2) center / cover;
		display: grid;
		place-items: center;
		filter: saturate(0.8);
	}
	.ph span {
		background: rgb(0 0 0 / 0.45);
		color: #fff;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: var(--fs-xs);
	}
	.file {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		background: none;
		border: 0;
		padding: var(--sp-1) 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
		text-align: left;
		min-height: 44px;
	}
	audio {
		max-width: 16rem;
		height: 40px;
	}
	.loc {
		display: grid;
		gap: var(--sp-2);
	}
	.loc p {
		margin: 0;
		display: flex;
		gap: var(--sp-1);
		align-items: center;
		flex-wrap: wrap;
	}
	.loc .acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.map {
		width: min(22rem, 72vw);
		height: 12rem;
		border-radius: 12px;
		overflow: hidden;
	}
	.meta {
		font-size: 0.72rem;
		justify-self: end;
		padding: 0 var(--sp-1);
	}
	.err {
		color: var(--danger);
	}
	.more {
		position: relative;
		align-self: center;
	}
	.dots {
		width: 36px;
		height: 36px;
		border: 0;
		background: none;
		color: var(--ink-2);
		border-radius: 50%;
		cursor: pointer;
		opacity: 0.55;
	}
	.dots:hover,
	.dots:focus-visible,
	.dots[aria-expanded='true'] {
		opacity: 1;
		background: var(--surface-2);
	}
	.menu {
		position: absolute;
		z-index: 5;
		top: 100%;
		right: 0;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-s);
		box-shadow: var(--shadow);
		display: grid;
		min-width: 9rem;
	}
	.mine .menu {
		right: auto;
		left: 0;
	}
	.menu button {
		background: none;
		border: 0;
		text-align: left;
		padding: var(--sp-3) var(--sp-4);
		font: inherit;
		color: var(--ink);
		cursor: pointer;
		min-height: 44px;
	}
	.menu button:hover {
		background: var(--surface-2);
	}
</style>
