<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import NavChooser from '$lib/components/NavChooser.svelte';
	import ReportBox from '$lib/components/community/ReportBox.svelte';
	import { ACCESSIBILITY, EVENT_KINDS, RADAR_TOPICS, SETTINGS, ageLabel } from '$lib/angebote';
	import { ORIGIN_LABEL, dateShort, when } from '$lib/termin';

	let { data, form } = $props();
	const e = $derived(data.event);
	const sel = $derived(data.selected);
	const serie = $derived(e.rrule ? '1' : '0');
	const age = $derived(ageLabel(e.ageMin, e.ageMax));
	const fmt = (d: string | Date) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	const mine = $derived(sel ? data.mine[sel.date] : undefined);
	const count = $derived(sel ? data.counts[sel.date] : undefined);
	const saved = $derived(form && 'saved' in form ? (form.saved ? { remindAt: null } : null) : data.saved);
	const upcoming = $derived(data.occurrences.filter((o) => new Date(o.end ?? o.start).getTime() >= Date.now() - 3600_000));
	const icsHref = $derived(`/veranstaltungen/${e.id}/ics${sel && e.rrule ? `?am=${sel.date}` : ''}${data.token ? `${sel && e.rrule ? '&' : '?'}t=${data.token}` : ''}`);
	const deadlinePassed = $derived(!!e.registrationDeadline && new Date(e.registrationDeadline).getTime() < Date.now());

	let shareMsg = $state('');
	let chatBusy = $state(false);
	let chatErr = $state('');
	async function createChat() {
		if (!sel) return;
		chatBusy = true;
		chatErr = '';
		try {
			const { createTimedChat } = await import('$lib/chat/actions');
			const roomId = await createTimedChat(`${e.title} · ${dateShort(sel.start)}`, '/api/veranstaltungen/chat', { eventId: e.id, occurrence: sel.date });
			await goto(`/nachrichten/chat/${encodeURIComponent(roomId)}`);
		} catch (x) {
			chatErr = (x as Error).message || 'Chat konnte nicht angelegt werden.';
		}
		chatBusy = false;
	}
	async function share() {
		const url = location.origin + `/veranstaltungen/${e.id}${sel ? `?am=${sel.date}` : ''}${e.visibility === 'privat' && e.shareToken ? `${sel ? '&' : '?'}t=${e.shareToken}` : ''}`;
		try {
			if (navigator.share) await navigator.share({ title: e.title, url });
			else {
				await navigator.clipboard.writeText(url);
				shareMsg = 'Link kopiert.';
			}
		} catch {
			/* abgebrochen */
		}
	}
</script>

<svelte:head>
	<title>{e.title} – Kinder Deutschlands</title>
	{#if e.visibility !== 'oeffentlich'}<meta name="robots" content="noindex" />{/if}
</svelte:head>

<article class="ev">
	<header>
		<a class="back" href="/veranstaltungen"><Icon name="zurueck" size={18} />Veranstaltungen</a>
		<p class="kind">{EVENT_KINDS[e.kind as keyof typeof EVENT_KINDS] ?? e.kind}{#if e.recurring}{' · ' + e.recurring}{/if}</p>
		<h1>{e.title}</h1>
		<p class="origin" class:org={e.origin === 'anbieter'}>
			{#if e.org}<Icon name="ok" size={18} /> <a href="/einrichtungen/{e.org.slug}">{e.org.name}</a> · verifizierte Einrichtung
			{:else if e.origin === 'mitglied'}{e.createdByMe ? 'Von dir eingetragen' : 'Von einem Mitglied eingetragen – nicht von der Redaktion geprüft'}
			{:else}{ORIGIN_LABEL[e.origin]}{/if}
		</p>

		{#if e.status === 'abgesagt'}
			<Notice kind="warn" title="Abgesagt">{e.cancelNote ?? 'Diese Veranstaltung findet nicht statt.'}</Notice>
		{:else if sel?.cancelled}
			<Notice kind="warn" title="An diesem Tag abgesagt">Der Termin am {dateShort(sel.start)} fällt aus.</Notice>
		{:else if e.status === 'pruefung'}
			<Notice kind="info" title="Wartet auf Prüfung">Nur für dich sichtbar, bis die Moderation ihn freigibt.</Notice>
		{:else if e.status === 'archiviert'}
			<Notice kind="info" title="Archiviert">Dieser Termin ist nicht mehr in der Quelle enthalten.</Notice>
		{/if}

		{#if data.wetter?.status}
			<Notice kind={data.wetter.status.status === 'drinnen' ? 'info' : 'ok'} title={data.wetter.status.label}>{data.wetter.status.note ? ` – ${data.wetter.status.note}` : ''}</Notice>
		{/if}
		{#if data.wetter?.warnings.length}
			{@const w0 = data.wetter.warnings[0]}
			<Notice kind="warn" title="Wetterwarnung zur Terminzeit">
				{' '}{w0.label}: <a href="/warnungen/{encodeURIComponent(w0.id)}">{w0.headline}</a>{data.wetter.warnings.length > 1 ? ` (und ${data.wetter.warnings.length - 1} weitere)` : ''}.
				Der Veranstalter entscheidet, ob der Termin stattfindet. Bei Gefahr gelten die Durchsagen der Behörden.
			</Notice>
			<p class="muted small wx-src">{data.wetter.attribution}</p>
		{/if}
		{#if data.wetter?.regen?.text}
			<Notice kind="info" title="Regen erwartet">{' '}{data.wetter.regen.text} Der Veranstalter entscheidet, ob der Termin stattfindet.</Notice>
			<p class="muted small wx-src">{data.wetter.regenAttribution}</p>
		{/if}

		{#if sel}
			<p class="when"><Icon name="uhr" size={22} /> <strong>{when(sel.start, sel.end, e.allDay, true)}</strong></p>
		{/if}
		{#if e.place || e.address || e.regionName}
			<p class="where"><Icon name="pin" size={22} />
				<span>{#if e.place}<a href="/orte/{e.place.id}">{e.place.name}</a>{#if e.address} · {/if}{/if}{e.address ?? ''}{#if e.regionName}{e.place || e.address ? ', ' : ''}{e.regionName}{/if}</span>
			</p>
		{/if}

		{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
		{#if form && 'reported' in form}<Notice kind="ok">Danke, die Moderation schaut es sich an.</Notice>{/if}
		{#if form && 'weather' in form}<Notice kind="ok">{form.weather === 'gesetzt' ? 'Gespeichert. Wer den Termin gemerkt oder zugesagt hat, wird benachrichtigt.' : 'Entscheidung zurückgenommen.'}</Notice>{/if}
		{#if form && 'cancelled' in form}<Notice kind="ok">Abgesagt. Wer den Termin gemerkt oder zugesagt hat, wird benachrichtigt.</Notice>{/if}

		<div class="actions">
			{#if data.member}
				<form method="POST" action="?/merken" use:enhance>
					<input type="hidden" name="am" value={sel?.date ?? ''} /><input type="hidden" name="serie" value={serie} />
					<button class="act" type="submit" aria-pressed={!!saved}><Icon name="stern" size={20} /><span>{saved ? 'Gemerkt' : 'Merken'}</span></button>
				</form>
			{:else}
				<a class="act" href="/anmelden?weiter=/veranstaltungen/{e.id}"><Icon name="stern" size={20} /><span>Merken</span></a>
			{/if}
			<a class="act" href={icsHref} download><Icon name="uhr" size={20} /><span>In Kalender</span></a>
			{#if e.lat !== null && e.lon !== null}<NavChooser lat={e.lat} lon={e.lon} name={e.title} variant="tile" />{/if}
			<button class="act" type="button" onclick={share}><Icon name="extern" size={20} /><span>Teilen</span></button>
		</div>
		{#if shareMsg}<p class="muted small" role="status">{shareMsg}</p>{/if}
	</header>

	{#if upcoming.length > 1}
		<nav class="dates" aria-label="Weitere Termine">
			{#each upcoming.slice(0, 12) as o}
				<a href="?am={o.date}{data.token ? `&t=${data.token}` : ''}" aria-current={sel?.date === o.date ? 'date' : undefined} class:x={o.cancelled} data-sveltekit-noscroll>{dateShort(o.start)}{o.cancelled ? ' · fällt aus' : ''}</a>
			{/each}
		</nav>
	{/if}

	<div class="cols">
		<section class="card">
			<h2>Worum geht's?</h2>
			{#if e.description}<p class="desc">{e.description}</p>{:else}<p class="muted">Keine Beschreibung angegeben.</p>{/if}
			<dl class="facts">
				{#if age}<div><dt>Alter</dt><dd>{age}</dd></div>{/if}
				<div><dt>Kosten</dt><dd>{e.costFree ? 'kostenlos' : (e.costText ?? (e.costFree === false ? 'kostenpflichtig' : 'keine Angabe'))}</dd></div>
				{#if e.discounts}<div><dt>Ermäßigung</dt><dd>{e.discounts}</dd></div>{/if}
				{#if e.freikarte}<div><dt>FreiKarte</dt><dd>vom Anbieter als FreiKarte-Angebot bestätigt</dd></div>{/if}
				{#if e.setting}<div><dt>Ort</dt><dd>{SETTINGS[e.setting as keyof typeof SETTINGS]}</dd></div>{/if}
				{#if e.accessibility.length}<div><dt>Zugang</dt><dd>{e.accessibility.map((a) => ACCESSIBILITY[a as keyof typeof ACCESSIBILITY] ?? a).join(', ')}</dd></div>{/if}
				{#if e.capacity}<div><dt>Plätze</dt><dd>höchstens {e.capacity}{e.waitlist ? ', Warteliste möglich' : ''}</dd></div>{/if}
				{#if e.registrationDeadline}<div><dt>Anmeldung bis</dt><dd>{when(e.registrationDeadline, null, false)}{deadlinePassed ? ' (abgelaufen)' : ''}</dd></div>{/if}
				{#if e.registrationUrl}<div><dt>Anmeldung</dt><dd><a href={e.registrationUrl} rel="noopener nofollow" target="_blank">beim Anbieter <Icon name="extern" size={14} /></a></dd></div>{/if}
				{#if e.topics.length}<div><dt>Themen</dt><dd>{e.topics.map((t) => RADAR_TOPICS[t as keyof typeof RADAR_TOPICS] ?? t).join(', ')}</dd></div>{/if}
			</dl>
			{#if e.registrationUrl}<p class="muted small">Anmeldung und Bezahlung laufen direkt beim Anbieter, nicht über Kinder Deutschlands.</p>{/if}
		</section>

		{#if data.member && sel && !sel.cancelled}
			<section class="card" id="teilnahme">
				<h2>Wer kommt mit?</h2>
				<p class="muted small">Unverbindlich und keine Anmeldung beim Anbieter. Sichtbar ist nur, wer das ausdrücklich erlaubt.</p>
				{#if count}<p>{count.kommeMit ? `${count.kommeMit} ${count.kommeMit === 1 ? 'Familie kommt' : 'Familien kommen'}` : ''}{count.kommeMit && count.interessiert ? ' · ' : ''}{count.interessiert ? `${count.interessiert} interessiert` : ''}</p>{/if}
				<form method="POST" action="?/teilnahme" use:enhance class="att">
					<input type="hidden" name="am" value={sel.date} />
					<label class="check"><input type="checkbox" name="show_me" checked={mine?.showMe ?? false} /> <span>Mich in „Wer kommt mit?“ zeigen</span></label>
					<div class="btns">
						<button class="btn small" class:secondary={mine?.status !== 'komme_mit'} name="status" value="komme_mit">Ich komme</button>
						<button class="btn small" class:secondary={mine?.status !== 'interessiert'} name="status" value="interessiert">Interessiert</button>
						{#if mine}<button class="btn small secondary" name="status" value="">Zurückziehen</button>{/if}
					</div>
				</form>
				{#if data.who.length}
					<ul class="who">{#each data.who as w}<li>{w.name}{w.me ? ' (du)' : ''}</li>{/each}</ul>
				{/if}
				{#if data.chat && (mine || data.editor)}
					<div class="evchat">
						<h3>Chat für diesen Tag</h3>
						{#if chatErr}<p class="err" role="alert">{chatErr}</p>{/if}
						{#if data.chat.roomId}
							<form method="POST" action="?/chat" use:enhance={() => {
								chatBusy = true;
								chatErr = '';
								return async ({ result, update }) => {
									if (result.type === 'success' && result.data?.chatRoom) {
										try {
											const { joinTreffen } = await import('$lib/chat/actions');
											await joinTreffen(String(result.data.chatRoom));
											await goto(`/nachrichten/chat/${encodeURIComponent(String(result.data.chatRoom))}`);
										} catch (x) {
											chatErr = (x as Error).message || 'Beitritt fehlgeschlagen.';
										}
									} else await update();
									chatBusy = false;
								};
							}}>
								<input type="hidden" name="am" value={sel.date} />
								<button class="btn small secondary" disabled={chatBusy}>{chatBusy ? 'Trete bei …' : 'Zum Chat'}</button>
							</form>
						{:else}
							<button type="button" class="btn small secondary" onclick={createChat} disabled={chatBusy}>{chatBusy ? 'Lege an …' : 'Chat für diesen Tag anlegen'}</button>
						{/if}
						<p class="muted small">Verschlüsselt, nur für Personen mit „Ich komme“/„Interessiert“ an diesem Tag. Wird einen Tag nach dem Termin gelöscht.</p>
					</div>
				{/if}
			</section>
		{/if}

		{#if data.member}
			<section class="card">
				<h2>Erinnern</h2>
				{#if form && 'reminded' in form}<Notice kind="ok">{form.reminded ? `Erinnerung am ${when(form.reminded, null, false)}.` : 'Erinnerung entfernt.'}</Notice>{/if}
				{#if saved?.remindAt && !(form && 'reminded' in form)}<p>Erinnerung eingestellt: {when(saved.remindAt, null, false)}</p>{/if}
				<form method="POST" action="?/erinnern" use:enhance class="rem">
					<input type="hidden" name="am" value={sel?.date ?? ''} /><input type="hidden" name="serie" value={serie} />
					<select name="offset" aria-label="Wann erinnern?">
						{#each Object.entries(data.reminders) as [k, l]}<option value={k}>{l}</option>{/each}
					</select>
					{#if e.registrationDeadline && !deadlinePassed}
						<select name="base" aria-label="Bezug"><option value="beginn">vor Beginn</option><option value="frist">vor Anmeldeschluss</option></select>
					{/if}
					<button class="btn small secondary">Speichern</button>
				</form>
				<p class="muted small">Als Mitteilung im Portal{data.member ? ' und – falls eingeschaltet – als Push' : ''}. <a href="/profil/merkliste">Zur Merkliste</a></p>
			</section>
		{/if}

		{#if e.lat !== null && e.lon !== null}
			<div class="mini"><FamilyMap mode="mini" tiles={data.tiles} center={[e.lon, e.lat]} zoom={15} points={[{ lon: e.lon, lat: e.lat, kind: 'termin' }]} label="Lage: {e.title}" /></div>
		{/if}

		<section class="card src">
			<h2>Quelle und Aktualität</h2>
			{#if e.source}
				<p><strong>{e.source.name}</strong>{#if e.source.attribution} · {e.source.attribution}{/if}</p>
				{#if e.source.url}<p><a href={e.source.url} rel="noopener nofollow" target="_blank">Eintrag in der Quelle <Icon name="extern" size={14} /></a></p>{/if}
			{/if}
			<p class="muted small">Zuletzt geändert {fmt(e.updatedAt)} · abgeglichen {fmt(e.checkedAt)}. Alle Angaben ohne Gewähr – maßgeblich ist der Veranstalter.</p>
			{#if data.member && !data.editor}<ReportBox action="?/melden" type="event" id={e.id} label="Termin melden" />{/if}
		</section>

		{#if data.editor}
			<section class="card edit">
				<h2>Verwalten</h2>
				<p><a class="btn small" href="/veranstaltungen/{e.id}/bearbeiten">Bearbeiten</a></p>
				{#if e.visibility === 'privat' && e.shareToken}<p class="muted small">Privater Termin: nur mit dem Link über „Teilen“ sichtbar.</p>{/if}
				{#if e.status !== 'abgesagt' && sel && !sel.cancelled}
					<details id="wetter-entscheidung" open={!!data.wetter?.warnings.length}>
						<summary>Wetter-Entscheidung für {dateShort(sel.start)}</summary>
						<form method="POST" action="?/wetter" class="stack">
							<input type="hidden" name="am" value={sel.date} />
							<label class="check"><input type="radio" name="status" value="drinnen" checked={data.wetter?.status?.status === 'drinnen'} /> <span>Findet drinnen statt</span></label>
							<label class="check"><input type="radio" name="status" value="findet_statt" checked={data.wetter?.status?.status === 'findet_statt'} /> <span>Findet trotz Wetter statt</span></label>
							<label class="check"><input type="radio" name="status" value="" checked={!data.wetter?.status} /> <span>Keine Entscheidung (zurücknehmen)</span></label>
							<input name="note" maxlength="200" placeholder="Hinweis (optional, z. B. „Treffpunkt: Halle 2“)" aria-label="Hinweis" value={data.wetter?.status?.note ?? ''} />
							<button class="btn small secondary">Speichern und Mitkommende informieren</button>
						</form>
						<p class="muted small">Absagen geht darunter.</p>
					</details>
				{/if}
				{#if e.status !== 'abgesagt'}
					<details>
						<summary>Absagen</summary>
						<form method="POST" action="?/absagen" class="stack">
							<input type="hidden" name="am" value={sel?.date ?? ''} />
							{#if e.rrule && sel}
								<label class="check"><input type="radio" name="scope" value="tag" checked /> <span>Nur am {dateShort(sel.start)}</span></label>
								<label class="check"><input type="radio" name="scope" value="serie" /> <span>Die ganze Reihe</span></label>
							{/if}
							<input name="note" maxlength="300" placeholder="Grund (optional, z. B. „wegen Unwetter“)" aria-label="Grund" />
							<button class="btn small danger">Absagen</button>
						</form>
					</details>
				{/if}
				{#if sel && e.exdates.includes(sel.date)}
					<form method="POST" action="?/wiederherstellen"><input type="hidden" name="am" value={sel.date} /><button class="btn small secondary">Absage für diesen Tag zurücknehmen</button></form>
				{/if}
				<details>
					<summary>Entfernen</summary>
					<form method="POST" action="?/entfernen" class="stack">
						<label class="check"><input type="checkbox" name="sicher" required /> <span>Termin endgültig entfernen (eine Absage ist meist besser – sie bleibt sichtbar).</span></label>
						<button class="btn small danger">Entfernen</button>
					</form>
				</details>
			</section>
		{/if}
	</div>
</article>

<style>
	.ev {
		max-width: var(--wide);
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
		display: grid;
		gap: var(--sp-4);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
		margin-bottom: var(--sp-3);
	}
	.kind {
		margin: 0;
		color: var(--ink-2);
		font-weight: 650;
	}
	h1 {
		margin: var(--sp-2) 0 var(--sp-2);
		font-size: clamp(1.9rem, 1.2rem + 3vw, 3rem);
		line-height: 1.05;
		font-stretch: 85%;
	}
	.origin {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 var(--sp-3);
		color: var(--ink-2);
	}
	.origin.org {
		color: var(--navy);
		font-weight: 650;
	}
	.when,
	.where {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		margin: var(--sp-2) 0;
		font-size: var(--fs-m);
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--sp-2);
		margin-top: var(--sp-4);
		max-width: 34rem;
	}
	.actions form {
		display: contents;
	}
	.act {
		display: grid;
		justify-items: center;
		gap: 4px;
		padding: var(--sp-3) var(--sp-1);
		border-radius: var(--radius-m);
		background: var(--surface);
		border: 1.5px solid var(--line);
		color: var(--ink);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		min-height: 64px;
	}
	.act[aria-pressed='true'] {
		background: var(--yellow);
		border-color: var(--yellow);
		color: var(--navy);
	}
	.dates {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.dates a {
		padding: 6px 12px;
		border-radius: 999px;
		border: 1.5px solid var(--line);
		background: var(--surface);
		text-decoration: none;
		color: var(--ink);
		font-size: var(--fs-s);
		min-height: 36px;
		display: inline-flex;
		align-items: center;
	}
	.dates a[aria-current] {
		border-color: var(--navy);
		background: var(--yellow);
		color: var(--navy);
		font-weight: 700;
	}
	.dates a.x {
		text-decoration: line-through;
	}
	.cols {
		display: grid;
		gap: var(--sp-4);
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-5);
	}
	.card h2 {
		margin: 0 0 var(--sp-3);
		font-size: var(--fs-l);
	}
	.desc {
		white-space: pre-line;
	}
	.facts {
		display: grid;
		gap: var(--sp-2);
		margin: var(--sp-3) 0;
	}
	.facts div {
		display: grid;
		grid-template-columns: 8.5rem 1fr;
		gap: var(--sp-2);
	}
	.facts dt {
		color: var(--ink-2);
	}
	.facts dd {
		margin: 0;
	}
	.att,
	.rem,
	.stack {
		display: grid;
		gap: var(--sp-2);
		margin: var(--sp-2) 0;
	}
	.rem {
		display: flex;
		flex-wrap: wrap;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}
	.who {
		margin: var(--sp-3) 0 0;
		padding-left: 1.2rem;
	}
	.mini {
		height: 240px;
		border-radius: var(--radius-l);
		overflow: hidden;
		box-shadow: var(--shadow);
	}
	.edit details {
		margin-top: var(--sp-3);
	}
	.edit summary {
		cursor: pointer;
		font-weight: 700;
		min-height: 36px;
	}
	.small {
		font-size: var(--fs-s);
	}
	@media (min-width: 900px) {
		.cols {
			grid-template-columns: 1fr 1fr;
		}
		.cols > :first-child {
			grid-row: span 2;
		}
	}
	.evchat {
		margin-top: var(--sp-4);
		padding-top: var(--sp-3);
		border-top: 1px solid var(--line);
	}
	.evchat h3 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-m);
	}
	.err {
		color: var(--danger);
	}
	.wx-src {
		margin: 0 0 var(--sp-2);
	}
</style>
