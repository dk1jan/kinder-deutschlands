<script lang="ts">
	// Chatliste: Einladungen, Unterhaltungen (neueste oben), ungelesene Nachrichten, Treffen mit Restzeit.
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KeyCard from './KeyCard.svelte';
	import { chat, getClient, lastEvent, previewText, roomTitle, startChat } from '$lib/chat/client.svelte';
	import { leaveRoom } from '$lib/chat/actions';
	import { remaining, timeShort } from '$lib/chat/format';

	let joining = $state<string | null>(null);
	let error = $state('');

	onMount(() => {
		void startChat();
	});

	const rooms = $derived.by(() => {
		void chat.version;
		void chat.meta;
		void chat.contacts;
		const c = getClient();
		if (!c || chat.status !== 'bereit') return { invites: [], list: [] };
		const all = c.getRooms().filter((r) => r.getMyMembership() === 'join' || r.getMyMembership() === 'invite');
		const invites = all.filter((r) => r.getMyMembership() === 'invite');
		const list = all
			.filter((r) => r.getMyMembership() === 'join' && chat.meta[r.roomId]?.status !== 'abgelaufen' && chat.meta[r.roomId]?.status !== 'geloescht')
			.map((r) => {
				const ev = lastEvent(r);
				return {
					id: r.roomId,
					title: roomTitle(r),
					preview: previewText(ev),
					ts: ev?.getTs() ?? r.getLastActiveTimestamp() ?? 0,
					unread: r.getUnreadNotificationCount('total' as never) ?? 0,
					kind: chat.meta[r.roomId]?.kind ?? (r.getJoinedMemberCount() > 2 ? 'gruppe' : 'direkt'),
					expires: chat.meta[r.roomId]?.expiresAt ?? null
				};
			})
			.sort((a, b) => b.ts - a.ts);
		return {
			invites: invites.map((r) => {
				const inviter = r.getMember(c.getUserId()!)?.events.member?.getSender() ?? '';
				const contact = chat.contacts.find((x) => x.mxid === inviter);
				// Nur ein ausdrücklich gesetzter Raumname macht eine Gruppe; Direktchats haben keinen
				const explicit = (r.currentState.getStateEvents('m.room.name', '')?.getContent()?.name as string | undefined) ?? null;
				const kind = chat.meta[r.roomId]?.kind ?? (r.getDMInviter() ? 'direkt' : explicit ? 'gruppe' : 'direkt');
				return { id: r.roomId, title: explicit, from: contact?.name ?? r.getMember(inviter)?.name ?? 'Ein Kontakt', group: kind !== 'direkt' };
			}),
			list
		};
	});

	async function accept(id: string) {
		joining = id;
		error = '';
		try {
			await getClient()?.joinRoom(id);
			location.href = `/nachrichten/chat/${encodeURIComponent(id)}`;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			joining = null;
		}
	}
	async function decline(id: string) {
		await leaveRoom(id).catch(() => {});
	}
</script>

<div class="chats">
	{#if chat.status === 'laedt' || chat.status === 'aus'}
		<p class="state" role="status">Chats werden geladen und entschlüsselt …</p>
	{:else if chat.status === 'nicht_eingerichtet'}
		<p class="state">Der Chat ist auf diesem Server noch nicht eingerichtet.</p>
	{:else if chat.status === 'fehler'}
		<p class="state err" role="alert">{chat.error} <button class="btn small secondary" type="button" onclick={() => startChat()}>Erneut versuchen</button></p>
	{:else}
		<KeyCard />
		<div class="new">
			<a class="btn small" href="/nachrichten/gruppe/neu"><Icon name="gruppe" size={20} /> Neue Gruppe</a>
			<a class="btn small secondary" href="/nachrichten/treffen/neu"><Icon name="qr" size={20} /> Treffen per QR</a>
		</div>
		{#if error}<p class="err" role="alert">{error}</p>{/if}
		{#if rooms.invites.length}
			<h2 class="sub">Einladungen</h2>
			<ul class="list">
				{#each rooms.invites as i (i.id)}
					<li class="row invite">
						<div>
							<strong>{i.group ? (i.title ?? 'Gruppe') : i.from}</strong>
							<p class="muted">{i.group ? `${i.from} lädt dich in eine Gruppe ein` : 'möchte mit dir chatten'}</p>
						</div>
						<div class="acts">
							<button class="btn small signal" type="button" disabled={joining === i.id} onclick={() => accept(i.id)}>Annehmen</button>
							<button class="btn small secondary" type="button" onclick={() => decline(i.id)}>Ablehnen</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
		{#if rooms.list.length === 0}
			<p class="empty">Noch keine Unterhaltungen. Schreib einem Kontakt über „Kontakte“ → „Nachricht“, gründe eine Gruppe oder starte ein Treffen per QR-Code.</p>
		{:else}
			<ul class="list" aria-label="Unterhaltungen">
				{#each rooms.list as r (r.id)}
					<li>
						<a class="row" href="/nachrichten/chat/{encodeURIComponent(r.id)}">
							<span class="avatar" aria-hidden="true">{#if r.kind === 'treffen'}<Icon name="qr" size={22} />{:else if r.kind === 'gruppe'}<Icon name="gruppe" size={22} />{:else}{r.title.slice(0, 1).toUpperCase()}{/if}</span>
							<span class="body">
								<span class="top">
									<strong class="title">{r.title}</strong>
									<span class="time muted">{r.ts ? timeShort(r.ts) : ''}</span>
								</span>
								<span class="bottom">
									<span class="preview muted">
										{#if r.kind === 'treffen' && r.expires}<span class="ttag">Treffen · {remaining(r.expires)}</span>{/if}
										{r.preview}
									</span>
									{#if r.unread > 0}<span class="badge" aria-label="{r.unread} ungelesen">{r.unread > 99 ? '99+' : r.unread}</span>{/if}
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="muted note"><Icon name="schloss" size={16} /> Ende-zu-Ende-verschlüsselt. <a href="/nachrichten/sicherheit">Geräte und Schlüssel</a></p>
	{/if}
</div>

<style>
	.chats {
		max-width: 52rem;
	}
	.state {
		padding: var(--sp-5);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
	}
	.err {
		color: var(--danger);
		font-weight: 600;
	}
	.new {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-bottom: var(--sp-4);
	}
	.new .btn {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.sub {
		font-size: var(--fs-l);
		margin: var(--sp-4) 0 var(--sp-2);
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--sp-4);
		display: grid;
		gap: 2px;
		background: var(--line);
		border-radius: var(--radius-m);
		overflow: hidden;
		box-shadow: var(--shadow);
	}
	.row {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		color: var(--ink);
		text-decoration: none;
		min-height: 64px;
	}
	a.row:hover {
		background: var(--surface-2);
	}
	.invite {
		justify-content: space-between;
		flex-wrap: wrap;
	}
	.invite p {
		margin: 0;
		font-size: var(--fs-s);
	}
	.acts {
		display: flex;
		gap: var(--sp-2);
	}
	.avatar {
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--solid);
		color: var(--solid-mark);
		font-family: var(--font-display);
		font-weight: 800;
		font-size: var(--fs-l);
	}
	.body {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.top,
	.bottom {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-2);
		align-items: center;
	}
	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.time {
		font-size: var(--fs-xs);
		flex: none;
	}
	.preview {
		font-size: var(--fs-s);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ttag {
		font-weight: 700;
		color: var(--sea);
		margin-right: var(--sp-1);
	}
	.badge {
		flex: none;
		min-width: 1.5rem;
		height: 1.5rem;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--red);
		color: #fff;
		font-size: var(--fs-xs);
		font-weight: 700;
		display: grid;
		place-items: center;
	}
	.empty {
		padding: var(--sp-5);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
	}
	.note {
		display: flex;
		gap: var(--sp-1);
		align-items: center;
		font-size: var(--fs-s);
	}
</style>
