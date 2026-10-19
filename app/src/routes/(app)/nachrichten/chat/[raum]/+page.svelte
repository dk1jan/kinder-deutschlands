<script lang="ts">
	// Eine Unterhaltung (Direktchat, Gruppe oder Treffen). Ende-zu-Ende-verschlüsselt; alles wird im Browser entschlüsselt.
	import { onMount, tick } from 'svelte';
	import type { MatrixEvent } from 'matrix-js-sdk';
	import Icon from '$lib/components/Icon.svelte';
	import Message from '$lib/components/chat/Message.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import { api, chat, getClient, loadMeta, roomTitle, sendReceipt, startChat } from '$lib/chat/client.svelte';
	import { invite, isMuted, leaveRoom, reportMessage, setMuted } from '$lib/chat/actions';
	import { livePoints, LIVE_TYPE } from '$lib/chat/live.svelte';
	import { dayLabel, remaining } from '$lib/chat/format';

	let { data } = $props();
	const roomId = $derived(data.roomId);

	let scroller: HTMLDivElement | undefined = $state();
	let atBottom = true;
	let loadingOlder = $state(false);
	let noMore = $state(false);
	let menu = $state(false);
	let showMembers = $state(false);
	let showLive = $state(false);
	let qr = $state<{ url: string } | null>(null);
	let notice = $state('');
	let report = $state<MatrixEvent | null>(null);
	let reportReason = $state('');
	let reportText = $state('');
	let reportContext = $state(true);
	let reportConsent = $state(false);
	let reportState = $state<'' | 'senden' | 'ok' | string>('');
	let now = $state(Date.now());

	onMount(() => {
		void startChat();
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	const room = $derived.by(() => {
		void chat.version;
		return chat.status === 'bereit' ? (getClient()?.getRoom(roomId) ?? null) : null;
	});
	const meta = $derived(chat.meta[roomId]);
	const me = $derived(getClient()?.getUserId() ?? '');
	const membership = $derived.by(() => {
		void chat.version;
		return room?.getMyMembership() ?? null;
	});
	const title = $derived.by(() => {
		void chat.version;
		void chat.contacts;
		return room ? roomTitle(room) : 'Unterhaltung';
	});
	const kind = $derived(meta?.kind ?? (room && room.getJoinedMemberCount() > 2 ? 'gruppe' : 'direkt'));
	const ended = $derived(!!meta && (meta.status !== 'aktiv' || (meta.expiresAt !== null && new Date(meta.expiresAt).getTime() < now)));

	const items = $derived.by(() => {
		void chat.version;
		if (!room) return [];
		const evs = room.getLiveTimeline().getEvents().filter((e) => e.getType() === 'm.room.message' || (e.getType() === 'm.room.encrypted' && !e.isState()) || (e.isRedacted() && e.getType() !== LIVE_TYPE && !e.isState()));
		const out: { ev: MatrixEvent; day: string | null; showName: boolean }[] = [];
		let lastDay = '';
		let lastSender = '';
		for (const ev of evs) {
			if (ev.getType() === LIVE_TYPE) continue;
			const day = dayLabel(ev.getTs(), now);
			const newDay = day !== lastDay;
			out.push({ ev, day: newDay ? day : null, showName: kind !== 'direkt' && (newDay || ev.getSender() !== lastSender) });
			lastDay = day;
			lastSender = ev.getSender() ?? '';
		}
		return out;
	});

	const members = $derived.by(() => {
		void chat.version;
		return room ? room.getJoinedMembers().map((m) => ({ id: m.userId, name: m.userId === me ? 'Du' : m.name })) : [];
	});
	const typing = $derived.by(() => {
		void chat.version;
		return room ? room.getMembers().filter((m) => m.typing && m.userId !== me).map((m) => m.name) : [];
	});
	const lives = $derived.by(() => {
		void chat.version;
		return room ? livePoints(room, now) : [];
	});
	const lastMine = $derived(items.findLast((i) => i.ev.getSender() === me)?.ev ?? null);
	const readByOther = $derived.by(() => {
		void chat.version;
		if (!room || !lastMine || kind !== 'direkt') return false;
		return room.getUsersReadUpTo(lastMine).some((u) => u !== me);
	});
	const muted = $derived.by(() => {
		void chat.version;
		const c = getClient();
		return c ? isMuted(c, roomId) : false;
	});
	const invitable = $derived(chat.contacts.filter((c) => !members.some((m) => m.id === c.mxid)));

	// Wer den Chat noch auf keinem Gerät geöffnet hat, hat keine Schlüssel – Nachrichten an ihn wären unlesbar.
	let missing = $state<{ id: string; name: string }[]>([]);
	let nudged = $state('');
	let lastCheck = 0;
	async function checkDevices() {
		const c = getClient();
		const crypto = c?.getCrypto();
		if (!c || !crypto || !room) return;
		lastCheck = Date.now();
		const others = room.getMembers().filter((m) => (m.membership === 'join' || m.membership === 'invite') && m.userId !== me);
		if (!others.length) return void (missing = []);
		const info = await crypto.getUserDeviceInfo(others.map((m) => m.userId), true).catch(() => null);
		if (!info) return;
		missing = others.filter((m) => (info.get(m.userId)?.size ?? 0) === 0).map((m) => ({ id: m.userId, name: m.name }));
	}
	$effect(() => {
		void chat.version;
		if (!room || membership !== 'join' || Date.now() - lastCheck < 4000) return;
		void checkDevices();
	});
	$effect(() => {
		if (!missing.length) return;
		const t = setInterval(() => void checkDevices(), 8000);
		return () => clearInterval(t);
	});
	async function sendNudge() {
		if (!meta?.peerContactId) return;
		const r = await api<{ sent: boolean }>('/api/chat/raeume', { json: { action: 'hinweis', peer: meta.peerContactId } });
		nudged = r.error ?? (r.sent ? 'Hinweis geschickt.' : 'Hinweis wurde schon geschickt.');
	}
	const dmWaiting = $derived(kind === 'direkt' && missing.length > 0);

	// Beim Öffnen und bei neuen Nachrichten: nach unten scrollen (wenn man unten war) und als gelesen markieren
	$effect(() => {
		void items.length;
		if (!room || membership !== 'join') return;
		void tick().then(() => {
			if (scroller && atBottom) scroller.scrollTop = scroller.scrollHeight;
		});
		if (document.visibilityState === 'visible') sendReceipt(room);
	});

	function onScroll() {
		if (!scroller) return;
		atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
		if (scroller.scrollTop < 120 && !loadingOlder && !noMore) void older();
	}

	async function older() {
		const c = getClient();
		if (!c || !room) return;
		loadingOlder = true;
		const before = scroller?.scrollHeight ?? 0;
		const n = room.getLiveTimeline().getEvents().length;
		try {
			await c.scrollback(room, 30);
		} catch {
			/* egal */
		}
		await tick();
		if (room.getLiveTimeline().getEvents().length === n) noMore = true;
		if (scroller) scroller.scrollTop += scroller.scrollHeight - before;
		loadingOlder = false;
	}

	async function accept() {
		await getClient()?.joinRoom(roomId);
		await loadMeta([roomId]);
	}
	async function leave() {
		menu = false;
		if (!confirm(kind === 'direkt' ? 'Unterhaltung verlassen? Der Verlauf ist dann auf deinen Geräten weg.' : 'Gruppe verlassen?')) return;
		await leaveRoom(roomId);
		location.href = '/nachrichten';
	}
	async function toggleMute() {
		menu = false;
		await setMuted(roomId, !muted).catch(() => {});
		notice = muted ? 'Benachrichtigungen für diese Unterhaltung wieder an.' : 'Stummgeschaltet: keine Push-Hinweise mehr für diese Unterhaltung.';
	}
	async function treffen(action: 'qr-neu' | 'behalten' | 'beenden') {
		menu = false;
		if (action === 'beenden' && !confirm('Treffen jetzt beenden? Der Raum wird mit allen Nachrichten vom Server gelöscht.')) return;
		const r = await api<{ url?: string }>('/api/chat/raeume', { json: { action, roomId } });
		if (r.error) {
			notice = r.error;
			return;
		}
		if (action === 'qr-neu' && r.url) qr = { url: r.url };
		if (action === 'behalten') {
			await getClient()?.sendStateEvent(roomId, 'm.room.join_rules' as never, { join_rule: 'invite' } as never, '').catch(() => {});
			notice = 'Treffen wird als dauerhafte Gruppe behalten. Beitritt per QR ist beendet.';
		}
		if (action === 'beenden') location.href = '/nachrichten';
		await loadMeta([roomId]);
	}
	async function doInvite(mxid: string) {
		try {
			await invite(roomId, mxid);
			notice = 'Eingeladen.';
		} catch {
			notice = 'Einladen nicht möglich.';
		}
	}

	async function sendReport() {
		if (!report || !room) return;
		reportState = 'senden';
		try {
			await reportMessage(room, report, reportReason, reportText, reportContext);
			reportState = 'ok';
		} catch (e) {
			reportState = (e as Error).message;
		}
	}
	function openReport(ev: MatrixEvent) {
		report = ev;
		reportReason = '';
		reportText = '';
		reportContext = true;
		reportConsent = false;
		reportState = '';
	}
</script>

<svelte:head><title>{title} – Nachrichten</title></svelte:head>

<div class="chatpage">
	<header class="head">
		<a class="back" href="/nachrichten" aria-label="Zurück zu den Nachrichten"><Icon name="zurueck" /></a>
		<div class="ti">
			<h1>{title}</h1>
			<p class="muted">
				{#if kind === 'treffen' && meta?.expiresAt}Treffen · {remaining(meta.expiresAt, now)}
				{:else if kind === 'gruppe'}{members.length} Mitglieder
				{:else}<Icon name="schloss" size={14} /> Ende-zu-Ende-verschlüsselt{/if}
				{#if muted} · stumm{/if}
			</p>
		</div>
		{#if lives.length}
			<button class="btn small secondary livebtn" type="button" onclick={() => (showLive = !showLive)} aria-expanded={showLive}><span class="ldot" aria-hidden="true"></span> {lives.length} live</button>
		{/if}
		<div class="more">
			<button class="iconbtn" type="button" aria-label="Optionen" aria-expanded={menu} onclick={() => (menu = !menu)}><Icon name="mehr" /></button>
			{#if menu}
				<div class="menu" role="menu">
					<button role="menuitem" type="button" onclick={toggleMute}>{muted ? 'Stummschaltung aufheben' : 'Stummschalten'}</button>
					{#if kind !== 'direkt'}<button role="menuitem" type="button" onclick={() => { showMembers = !showMembers; menu = false; }}>Mitglieder</button>{/if}
					{#if kind === 'treffen' && meta?.mine && !ended}
						<button role="menuitem" type="button" onclick={() => treffen('qr-neu')}>QR-Code zeigen (neu)</button>
						<button role="menuitem" type="button" onclick={() => treffen('behalten')}>Dauerhaft als Gruppe behalten</button>
						<button role="menuitem" type="button" onclick={() => treffen('beenden')}>Treffen beenden</button>
					{/if}
					<button role="menuitem" type="button" onclick={leave}>Verlassen</button>
					{#if kind === 'direkt' && meta?.peerContactId}<a role="menuitem" href="/nachrichten?ansicht=kontakte">Kontakt blockieren …</a>{/if}
				</div>
			{/if}
		</div>
	</header>

	{#if notice}<p class="notice" role="status">{notice} <button type="button" class="x" aria-label="Hinweis schließen" onclick={() => (notice = '')}><Icon name="schliessen" size={16} /></button></p>{/if}

	{#if qr}
		<section class="qrbox" aria-label="QR-Code zum Beitreten">
			<p><strong>Zum Beitreten scannen</strong> – nur für angemeldete Mitglieder, gilt bis zum Ende des Treffens. Alter QR-Code ist jetzt ungültig.</p>
			<img src="/api/qr?d={encodeURIComponent(qr.url)}" alt="QR-Code zum Treffen" width="220" height="220" />
			<p class="muted small">{qr.url}</p>
			<button class="btn small secondary" type="button" onclick={() => (qr = null)}>Schließen</button>
		</section>
	{/if}

	{#if showMembers && room}
		<section class="panel">
			<h2>Mitglieder</h2>
			<ul>{#each members as m}<li>{m.name}</li>{/each}</ul>
			{#if kind === 'gruppe' && invitable.length}
				<h3>Kontakte einladen</h3>
				<ul>{#each invitable as c}<li>{c.name ?? c.contactId} <button class="btn small secondary" type="button" onclick={() => doInvite(c.mxid)}>Einladen</button></li>{/each}</ul>
			{/if}
		</section>
	{/if}

	{#if showLive && lives.length}
		<section class="livemap">
			<div class="map">
				<FamilyMap mode="mini" tiles={data.tiles} center={[lives[0].lon, lives[0].lat]} zoom={15} points={lives.map((l) => ({ lon: l.lon, lat: l.lat, kind: 'person' }))} label="Live-Standorte" />
			</div>
			<ul class="livelist">
				{#each lives as l}<li><strong>{l.mine ? 'Du' : l.name}</strong> · {remaining(l.until, now)}</li>{/each}
			</ul>
		</section>
	{/if}

	<div class="scroller" bind:this={scroller} onscroll={onScroll}>
		{#if chat.status === 'laedt' || chat.status === 'aus'}
			<p class="center muted">Unterhaltung wird entschlüsselt …</p>
		{:else if chat.status !== 'bereit'}
			<p class="center err">{chat.error || 'Chat nicht verfügbar.'}</p>
		{:else if !room || membership === 'leave'}
			<p class="center">Diese Unterhaltung gibt es nicht (mehr). <a href="/nachrichten">Zur Übersicht</a></p>
		{:else if membership === 'invite'}
			<div class="center">
				<p>Du bist eingeladen.</p>
				<button class="btn signal" type="button" onclick={accept}>Annehmen</button>
			</div>
		{:else}
			{#if loadingOlder}<p class="center muted small">Ältere Nachrichten …</p>{/if}
			{#if noMore}<p class="center muted small">Anfang der Unterhaltung{kind === 'treffen' ? ' (du siehst Nachrichten ab deinem Beitritt)' : ''}</p>{/if}
			{#if !items.length && !loadingOlder}
				<p class="center muted empty"><Icon name="schloss" size={18} /> Noch keine Nachrichten. Alles hier ist Ende-zu-Ende-verschlüsselt – nur ihr könnt es lesen.</p>
			{/if}
			{#each items as it (it.ev.getId() ?? it.ev.getTxnId())}
				{#if it.day}<p class="day"><span>{it.day}</span></p>{/if}
				<Message ev={it.ev} {room} mine={it.ev.getSender() === me} showName={it.showName} tiles={data.tiles} read={readByOther && it.ev === lastMine} onReport={openReport} />
			{/each}
			{#if typing.length}<p class="typing muted">{typing.join(', ')} schreibt …</p>{/if}
		{/if}
	</div>

	{#if room && membership === 'join'}
		{#if ended}
			<p class="ended">Dieses Treffen ist beendet. Senden ist nicht mehr möglich.</p>
		{:else if dmWaiting}
			<div class="ended waiting" role="status">
				<p><strong>{title} hat den Chat noch auf keinem Gerät geöffnet.</strong> Wegen der Ende-zu-Ende-Verschlüsselung kann eine Nachricht erst ankommen, wenn {title} „Nachrichten“ einmal geöffnet hat. Das Feld wird dann automatisch frei.</p>
				{#if meta?.peerContactId}<button class="btn small secondary" type="button" onclick={sendNudge}>{title} Bescheid geben</button>{/if}
				{#if nudged}<p class="small">{nudged}</p>{/if}
			</div>
		{:else}
			{#if missing.length}<p class="hint small">{missing.map((m) => m.name).join(', ')} {missing.length === 1 ? 'hat' : 'haben'} den Chat noch nicht geöffnet und kann neue Nachrichten erst danach lesen.</p>{/if}
			<Composer {roomId} tiles={data.tiles} center={data.center} />
		{/if}
	{/if}
</div>

{#if report}
	<div class="dialog-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && (report = null)}>
		<div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="rep-t">
			<h2 id="rep-t">Nachricht melden</h2>
			{#if reportState === 'ok'}
				<p>Danke. Die Moderation prüft die Meldung. Du kannst die Person zusätzlich unter „Kontakte“ blockieren.</p>
				<button class="btn" type="button" onclick={() => (report = null)}>Schließen</button>
			{:else}
				<p class="small">Chats sind verschlüsselt – die Moderation sieht nur, was du hier freigibst. Absender und Zeitpunkt bestätigt der Server.</p>
				<label for="rep-r">Grund</label>
				<select id="rep-r" bind:value={reportReason} required>
					<option value="" disabled>Bitte wählen</option>
					{#each data.reasons as r}<option value={r.key}>{r.label}</option>{/each}
				</select>
				<label for="rep-m">Was ist passiert? (optional)</label>
				<textarea id="rep-m" bind:value={reportText} rows="3" maxlength="500"></textarea>
				<label class="check"><input type="checkbox" bind:checked={reportContext} /> Bis zu 5 vorherige Nachrichten als Zusammenhang mitschicken</label>
				<label class="check"><input type="checkbox" bind:checked={reportConsent} /> Ich gebe diese Nachricht{reportContext ? 'en' : ''} zur Prüfung durch die Moderation frei.</label>
				{#if reportState && reportState !== 'senden'}<p class="err" role="alert">{reportState}</p>{/if}
				<div class="acts">
					<button class="btn danger" type="button" disabled={!reportReason || !reportConsent || reportState === 'senden'} onclick={sendReport}>Melden</button>
					<button class="btn secondary" type="button" onclick={() => (report = null)}>Abbrechen</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.chatpage {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - var(--header-h) - var(--nav-h) - env(safe-area-inset-bottom));
		max-width: 56rem;
		margin: 0 auto;
		background: var(--paper);
	}
	@media (min-width: 960px) {
		.chatpage {
			height: calc(100dvh - var(--header-h));
			border-left: 1px solid var(--line);
			border-right: 1px solid var(--line);
		}
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface);
		border-bottom: 1px solid var(--line);
	}
	.back,
	.iconbtn {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: var(--ink);
		background: none;
		border: 0;
		cursor: pointer;
		flex: none;
	}
	.back:hover,
	.iconbtn:hover {
		background: var(--surface-2);
	}
	.ti {
		flex: 1;
		min-width: 0;
	}
	h1 {
		font-size: var(--fs-l);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ti p {
		margin: 0;
		font-size: var(--fs-xs);
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.livebtn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.ldot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--red);
	}
	.more {
		position: relative;
	}
	.menu {
		position: absolute;
		right: 0;
		top: 100%;
		z-index: 20;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-s);
		box-shadow: var(--shadow);
		display: grid;
		min-width: 15rem;
	}
	.menu button,
	.menu a {
		text-align: left;
		background: none;
		border: 0;
		padding: var(--sp-3) var(--sp-4);
		font: inherit;
		color: var(--ink);
		cursor: pointer;
		text-decoration: none;
		min-height: 44px;
	}
	.menu button:hover,
	.menu a:hover {
		background: var(--surface-2);
	}
	.notice {
		margin: 0;
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface-2);
		font-size: var(--fs-s);
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-2);
	}
	.x {
		background: none;
		border: 0;
		color: var(--ink);
		cursor: pointer;
		width: 36px;
		height: 36px;
	}
	.qrbox,
	.panel,
	.livemap {
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-bottom: 1px solid var(--line);
		display: grid;
		gap: var(--sp-2);
		justify-items: start;
	}
	.qrbox img {
		background: #fff;
		padding: 8px;
		border-radius: var(--radius-s);
	}
	.panel h2,
	.panel h3 {
		font-size: var(--fs-m);
		margin: 0;
	}
	.panel ul {
		margin: 0;
		padding-left: var(--sp-4);
	}
	.panel li {
		min-height: 36px;
	}
	.livemap .map {
		width: 100%;
		height: 14rem;
		border-radius: var(--radius-s);
		overflow: hidden;
	}
	.livelist {
		margin: 0;
		padding-left: var(--sp-4);
		font-size: var(--fs-s);
	}
	.scroller {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--sp-3);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.center {
		text-align: center;
		margin: auto;
	}
	.small {
		font-size: var(--fs-s);
	}
	.empty {
		max-width: 22rem;
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
	}
	.day {
		text-align: center;
		margin: var(--sp-3) 0 var(--sp-1);
	}
	.day span {
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: var(--fs-xs);
		font-weight: 700;
		padding: 3px 10px;
		border-radius: 999px;
	}
	.typing {
		font-size: var(--fs-s);
		font-style: italic;
		margin: 0;
	}
	.ended {
		margin: 0;
		padding: var(--sp-4);
		text-align: center;
		background: var(--surface);
		border-top: 1px solid var(--line);
	}
	.err {
		color: var(--danger);
	}
	.waiting {
		display: grid;
		gap: var(--sp-2);
		justify-items: center;
		text-align: left;
	}
	.waiting p {
		margin: 0;
	}
	.hint {
		margin: 0;
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface-2);
	}
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgb(8 19 32 / 0.55);
		display: grid;
		place-items: center;
		padding: var(--sp-4);
	}
	.dialog {
		width: min(32rem, 100%);
		max-height: 90dvh;
		overflow: auto;
		display: grid;
		gap: var(--sp-2);
	}
	.dialog h2 {
		font-size: var(--fs-l);
		margin: 0;
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
		font-size: var(--fs-s);
	}
	.check input {
		margin-top: 4px;
	}
	.acts {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
</style>
