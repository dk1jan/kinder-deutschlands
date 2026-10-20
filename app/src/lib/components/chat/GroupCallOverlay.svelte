<script lang="ts">
	// Gruppenanruf-Fenster (D-072): Kacheln aller Teilnehmenden, Bildschirm teilen, Stumm, Kamera, Auflegen.
	// Lässt sich verkleinern, damit man nebenbei im Chat schreiben kann – der Ton läuft weiter.
	import Icon from '$lib/components/Icon.svelte';
	import type { Track } from 'livekit-client';
	import {
		currentTiles,
		enableAudio,
		group,
		leaveGroupCall,
		screenShareSupported,
		switchGroupCamera,
		toggleGroupCamera,
		toggleGroupMute,
		toggleScreenShare
	} from '$lib/chat/groupcall.svelte';

	let now = $state(Date.now());
	let canShare = $state(false);
	let multiCam = $state(false);

	$effect(() => {
		if (group.view !== 'verbunden') return;
		canShare = screenShareSupported();
		void navigator.mediaDevices
			?.enumerateDevices()
			.then((d) => (multiCam = d.filter((x) => x.kind === 'videoinput').length > 1))
			.catch(() => {});
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});

	const t = $derived(currentTiles());
	const spotlight = $derived(t.list.find((x) => x.screen) ?? null);
	const dur = $derived.by(() => {
		if (!group.startedAt) return '';
		const s = Math.max(0, Math.floor((now - group.startedAt) / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	});
	const status = $derived(
		group.view === 'verbindet' ? 'Verbinde …' : group.view === 'schluessel' ? 'Schlüssel wird sicher übergeben …' : group.view === 'verbunden' ? `${group.count} dabei · ${dur}` : group.reason || 'Anruf beendet.'
	);
	const initials = (n: string) =>
		n
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase())
			.join('') || '?';

	/** Spur an ein Video-/Audio-Element hängen und beim Entfernen wieder lösen. */
	function attach(el: HTMLMediaElement, track: Track) {
		let cur = track;
		cur.attach(el);
		return {
			update(next: Track) {
				if (next === cur) return;
				cur.detach(el);
				cur = next;
				cur.attach(el);
			},
			destroy() {
				cur.detach(el);
			}
		};
	}
</script>

{#if group.view !== 'aus'}
	<!-- Ton aller anderen – bleibt auch im kleinen Fenster hörbar -->
	<div class="audio" aria-hidden="true">
		{#each t.audio as a (a.id)}<audio use:attach={a.track} autoplay></audio>{/each}
	</div>

	{#if group.small && group.view === 'verbunden'}
		<div class="mini" role="region" aria-label="Gruppenanruf">
			<p class="label"><Icon name="gruppe" size={18} /> <span>{group.title} · {status}</span></p>
			<div class="btns">
				<button class="round" type="button" onclick={toggleGroupMute} aria-pressed={group.muted}>{group.muted ? 'Ton an' : 'Stumm'}</button>
				<button class="round" type="button" onclick={() => (group.small = false)} aria-label="Groß anzeigen"><Icon name="gross" size={18} /></button>
				<button class="round no" type="button" onclick={leaveGroupCall}>Auflegen</button>
			</div>
		</div>
	{:else}
		<div class="gc" role="dialog" aria-modal="true" aria-labelledby="gc-t">
			<header>
				<div>
					<h2 id="gc-t">{group.title}</h2>
					<p class="sub" aria-live="polite"><Icon name="schloss" size={14} /> {status}</p>
				</div>
				{#if group.view === 'verbunden'}
					<button class="iconbtn" type="button" onclick={() => (group.small = true)} aria-label="Verkleinern (Chat nutzen)" title="Verkleinern"><Icon name="klein" /></button>
				{/if}
			</header>

			{#if group.view === 'verbunden'}
				{#if spotlight?.screen}
					<div class="spot">
						<video use:attach={spotlight.screen} autoplay playsinline muted></video>
						<p class="name">{spotlight.local ? 'Du teilst deinen Bildschirm' : `Bildschirm von ${spotlight.name}`}</p>
					</div>
				{/if}
				<ul class="grid" class:strip={!!spotlight} data-n={Math.min(t.list.length, 9)}>
					{#each t.list as p (p.id)}
						<li class="tile" class:speaking={p.speaking}>
							{#if p.camera}
								<video use:attach={p.camera} autoplay playsinline muted class:mirror={p.local}></video>
							{:else}
								<span class="avatar" aria-hidden="true">{initials(p.name)}</span>
							{/if}
							<p class="name">
								{#if p.micOff}<Icon name="stumm" size={14} />{/if}
								<span>{p.name}</span>
								{#if p.micOff}<span class="sr">(stumm)</span>{/if}
							</p>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="wait"><p>{status}</p></div>
			{/if}

			<div class="bar">
				{#if group.reason && group.view === 'verbunden'}<p class="note" role="status">{group.reason}</p>{/if}
				{#if group.needsAudio}<button class="btn signal" type="button" onclick={enableAudio}>Ton einschalten</button>{/if}
				{#if group.view === 'verbunden'}
					<div class="btns">
						<button class="round" type="button" onclick={toggleGroupMute} aria-pressed={group.muted}><Icon name={group.muted ? 'stumm' : 'mikro'} size={20} /> {group.muted ? 'Ton an' : 'Stumm'}</button>
						<button class="round" type="button" onclick={toggleGroupCamera} aria-pressed={group.camOff}><Icon name="video" size={20} /> {group.camOff ? 'Kamera an' : 'Kamera aus'}</button>
						{#if multiCam && !group.camOff}<button class="round" type="button" onclick={switchGroupCamera} aria-label="Kamera wechseln"><Icon name="drehen" size={20} /></button>{/if}
						{#if canShare}<button class="round" type="button" onclick={toggleScreenShare} aria-pressed={group.sharing}><Icon name="bildschirm" size={20} /> {group.sharing ? 'Teilen beenden' : 'Bildschirm'}</button>{/if}
						<button class="round no" type="button" onclick={leaveGroupCall}><Icon name="telefon" size={20} /> Auflegen</button>
					</div>
					<p class="hint">Ende-zu-Ende-verschlüsselt · kein Mitschnitt</p>
				{:else if group.view !== 'beendet'}
					<div class="btns"><button class="round no" type="button" onclick={leaveGroupCall}>Abbrechen</button></div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style>
	.audio {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}
	.gc {
		position: fixed;
		inset: 0;
		z-index: 1001;
		background: #0b1526;
		color: #fff;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
	}
	.gc:has(.spot) {
		grid-template-rows: auto minmax(0, 1fr) auto auto;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		background: var(--navy);
	}
	h2 {
		margin: 0;
		font-size: var(--fs-l);
		color: #fff;
	}
	.sub {
		margin: 0;
		font-size: var(--fs-s);
		display: flex;
		gap: var(--sp-1);
		align-items: center;
		opacity: 0.9;
	}
	.iconbtn {
		color: #fff;
		background: rgb(255 255 255 / 0.12);
		border: 0;
		border-radius: 999px;
		min-width: 44px;
		min-height: 44px;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.wait {
		display: grid;
		place-items: center;
		padding: var(--sp-5);
		text-align: center;
	}
	.spot {
		position: relative;
		min-height: 0;
		background: #000;
	}
	.spot video {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: var(--sp-2);
		display: grid;
		gap: var(--sp-2);
		min-height: 0;
		overflow: auto;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		grid-auto-rows: minmax(9rem, 1fr);
	}
	.grid[data-n='1'] {
		grid-template-columns: 1fr;
	}
	.grid[data-n='2'] {
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
	}
	.grid.strip {
		grid-auto-flow: column;
		grid-auto-columns: 9rem;
		grid-template-columns: none;
		grid-auto-rows: 6.5rem;
		overflow-x: auto;
	}
	.tile {
		position: relative;
		border-radius: var(--radius-m);
		overflow: hidden;
		background: #1c2a40;
		display: grid;
		place-items: center;
		outline: 3px solid transparent;
		transition: outline-color 0.15s;
	}
	.tile.speaking {
		outline-color: var(--yellow);
	}
	.tile video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.tile video.mirror {
		transform: scaleX(-1);
	}
	.avatar {
		width: 4.5rem;
		height: 4.5rem;
		border-radius: 50%;
		background: var(--sea);
		display: grid;
		place-items: center;
		font-size: 1.6rem;
		font-weight: 700;
	}
	.name {
		position: absolute;
		left: var(--sp-2);
		bottom: var(--sp-2);
		margin: 0;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgb(0 0 0 / 0.6);
		font-size: var(--fs-s);
		display: flex;
		gap: 4px;
		align-items: center;
		max-width: calc(100% - 1rem);
	}
	.name span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.bar,
	.mini {
		padding: var(--sp-3) var(--sp-4) calc(var(--sp-3) + env(safe-area-inset-bottom));
		display: grid;
		gap: var(--sp-2);
		background: var(--navy);
	}
	.mini {
		position: fixed;
		z-index: 1001;
		right: var(--sp-3);
		bottom: calc(var(--sp-3) + 72px);
		width: min(24rem, calc(100vw - 2 * var(--sp-3)));
		color: #fff;
		border-radius: var(--radius-l);
		box-shadow: 0 10px 40px rgb(0 0 0 / 0.35);
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
		justify-content: center;
	}
	.round {
		flex: 1 1 auto;
		min-height: 48px;
		padding: 0 var(--sp-3);
		border-radius: 999px;
		border: 0;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		background: rgb(255 255 255 / 0.15);
		color: #fff;
		display: inline-flex;
		gap: 6px;
		align-items: center;
		justify-content: center;
		max-width: 12rem;
	}
	.round[aria-pressed='true'] {
		background: var(--yellow);
		color: var(--navy);
	}
	.round.no {
		background: #c8352a;
	}
	.hint,
	.note {
		margin: 0;
		font-size: var(--fs-xs);
		text-align: center;
	}
	.note {
		color: var(--yellow);
	}
	@media (min-width: 900px) {
		.mini {
			bottom: var(--sp-4);
		}
	}
</style>
