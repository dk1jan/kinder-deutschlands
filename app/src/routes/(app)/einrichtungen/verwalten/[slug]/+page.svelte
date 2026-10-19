<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import OrgFields from '$lib/components/angebote/OrgFields.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { AVAILABILITY, NOTICE_KINDS, OFFER_KINDS, RADAR_TOPICS } from '$lib/angebote';
	import { dateShort, time } from '$lib/termin';

	let { data, form } = $props();
	const fv = $derived((form && 'values' in form && form.values ? form.values : null) as Record<string, string[]> | null);
	const ov = $derived(fv && data.tab === 'angebote' ? fv : (data.editOffer ?? {}));
	const v = (m: Record<string, string[]>, k: string) => m[k]?.[0] ?? '';
	const fmt = (d: string | Date) => new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
	const TABS = [['angebote', 'Freie Plätze & Kurse'], ['termine', 'Termine'], ['hinweise', 'Hinweise'], ['team', 'Team'], ['profil', 'Profil']];
</script>

<svelte:head><title>{data.org.name} verwalten – Kinder Deutschlands</title></svelte:head>

<div class="container page wrap">
	<a class="back" href="/einrichtungen/{data.org.slug}"><Icon name="zurueck" size={18} />Öffentliche Seite</a>
	<h1>{data.org.name}</h1>
	<p class="muted">Du bist {data.role === 'admin' ? 'Verwaltung' : 'Redaktion'} · Folgende: {data.followers}</p>

	<nav class="tabs" aria-label="Bereiche">
		{#each TABS as [k, l]}<a href="?tab={k}" aria-current={data.tab === k ? 'page' : undefined}>{l}</a>{/each}
	</nav>

	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form && 'ok' in form && form.ok}<Notice kind="ok">{form.ok}</Notice>{/if}

	{#if data.tab === 'angebote'}
		<p class="muted small">Freie Plätze gelten nur so lange, wie du sie bestätigst. Ohne gültige Bestätigung zeigen wir „Verfügbarkeit unbekannt“ – nie „frei“. Wir erinnern dich, wenn die Angabe abläuft.</p>
		{#each data.offers as of (of.id)}
			<section class="card" class:ended={of.status !== 'aktiv'}>
				<h2><a href="/angebote/{of.id}">{of.title}</a> <small>{OFFER_KINDS[of.kind as keyof typeof OFFER_KINDS] ?? of.kind}{of.status !== 'aktiv' ? ' · beendet' : ''}</small></h2>
				{#if of.status === 'aktiv'}
					<p>Angezeigt: <strong>{AVAILABILITY[of.availability]}</strong>{of.availability !== 'unbekannt' && of.placesCount !== null ? ` (${of.placesCount})` : ''}
						{#if of.confirmedAt}<span class="muted small"> · bestätigt {fmt(of.confirmedAt)}{of.validUntil ? `, gültig bis ${fmt(of.validUntil)}` : ''}</span>{/if}</p>
					<form method="POST" action="?/verfuegbarkeit" class="inline">
						<input type="hidden" name="id" value={of.id} />
						<select name="availability" aria-label="Verfügbarkeit">{#each Object.entries(AVAILABILITY).filter(([k]) => k !== 'unbekannt') as [k, l]}<option value={k} selected={of.stored === k}>{l}</option>{/each}</select>
						<input name="places" type="number" min="0" max="9999" placeholder="Anzahl (optional)" aria-label="Anzahl freie Plätze" value={of.placesCount ?? ''} />
						<select name="days" aria-label="Gültig für">{#each data.validDays as d}<option value={d} selected={d === 7}>gilt {d} Tage</option>{/each}</select>
						<button class="btn small">Bestätigen</button>
					</form>
					<div class="row"><a class="btn small secondary" href="?tab=angebote&angebot={of.id}#angebot-form">Bearbeiten</a>
						<form method="POST" action="?/beenden"><input type="hidden" name="id" value={of.id} /><button class="btn small secondary">Beenden</button></form></div>
				{/if}
			</section>
		{:else}
			<p class="muted">Noch keine Angebote.</p>
		{/each}

		<section class="card" id="angebot-form">
			<h2>{v(ov, 'id') ? 'Angebot bearbeiten' : 'Neues Angebot'}</h2>
			{#key ov}
				<form method="POST" action="?/angebot" class="f">
					{#if v(ov, 'id')}<input type="hidden" name="id" value={v(ov, 'id')} />{/if}
					<div class="field"><label for="o-title">Titel</label><input id="o-title" name="title" required minlength="3" maxlength="160" value={v(ov, 'title')} placeholder="z. B. Babyschwimmen dienstags" /></div>
					<div class="two">
						<div class="field"><label for="o-kind">Art</label><select id="o-kind" name="kind" required><option value="">Bitte wählen</option>{#each Object.entries(OFFER_KINDS) as [k, l]}<option value={k} selected={v(ov, 'kind') === k}>{l}</option>{/each}</select></div>
						<div class="field"><label for="o-sched">Wann? (Text)</label><input id="o-sched" name="schedule_text" maxlength="300" value={v(ov, 'schedule_text')} placeholder="z. B. dienstags 10–11 Uhr, 8 Termine" /></div>
						<div class="field"><label for="o-start">Beginn am</label><input id="o-start" type="date" name="starts_on" value={v(ov, 'starts_on')} /></div>
						<div class="field"><label for="o-amin">Alter von</label><input id="o-amin" type="number" name="age_min" min="0" max="18" value={v(ov, 'age_min')} /></div>
						<div class="field"><label for="o-amax">bis</label><input id="o-amax" type="number" name="age_max" min="0" max="18" value={v(ov, 'age_max')} /></div>
						<div class="field"><label for="o-cost">Kosten (Text)</label><input id="o-cost" name="cost_text" maxlength="200" value={v(ov, 'cost_text')} /></div>
					</div>
					<div class="field"><label for="o-desc">Beschreibung</label><textarea id="o-desc" name="description" rows="3" maxlength="5000">{v(ov, 'description')}</textarea></div>
					<div class="two">
						<div class="field"><label for="o-reg">Link zur Anmeldung</label><input id="o-reg" type="url" name="registration_url" maxlength="500" value={v(ov, 'registration_url')} /></div>
						<div class="field"><label for="o-contact">Kontakt</label><input id="o-contact" name="contact" maxlength="300" value={v(ov, 'contact')} placeholder="Telefon oder E-Mail für Anfragen" /></div>
						<div class="field"><label for="o-addr">Ort (falls nicht bei euch)</label><input id="o-addr" name="address" maxlength="300" value={v(ov, 'address')} /></div>
					</div>
					<fieldset class="pills"><legend>Themen</legend>{#each Object.entries(RADAR_TOPICS) as [k, l]}<label class="pill"><input type="checkbox" name="topics" value={k} checked={(ov.topics ?? []).includes(k)} /> {l}</label>{/each}</fieldset>
					<label class="check"><input type="checkbox" name="freikarte" checked={(ov.freikarte ?? []).includes('on')} /> <span>Mit FreiKarte nutzbar</span></label>
					<div class="row"><button class="btn small">{v(ov, 'id') ? 'Speichern' : 'Anlegen'}</button>{#if v(ov, 'id')}<a class="btn small secondary" href="?tab=angebote">Abbrechen</a>{/if}</div>
				</form>
			{/key}
		</section>
	{:else if data.tab === 'termine'}
		<p><a class="btn small" href="/veranstaltungen/neu?einrichtung={data.org.slug}">Termin eintragen</a></p>
		<section class="card">
			<h2>Kalender automatisch übernehmen</h2>
			<p class="small">Habt ihr schon einen Online-Kalender (ICS-Adresse, z. B. aus Google Kalender, Outlook oder eurer Webseite)? Dann tragt die Adresse unter <a href="?tab=profil">Profil</a> ein – Termine werden täglich übernommen und erscheinen als eure Termine.</p>
			{#if data.source}
				<p class="small">Letzter Abruf: {data.source.lastRun ? fmt(data.source.lastRun) : 'noch nicht'}{data.source.lastOk ? ` · zuletzt erfolgreich ${fmt(data.source.lastOk)}` : ''}{data.source.paused ? ' · abgeschaltet' : ''}</p>
				{#if data.source.error}<p class="small" role="alert">Fehler beim letzten Abruf: {data.source.error}</p>{/if}
			{/if}
		</section>
		<ul class="evs">
			{#each data.events as e}<li><a href="/veranstaltungen/{e.id}">{e.title}</a> <span class="muted small">· {dateShort(e.start)} {time(e.start)}{e.recurring ? ' · Reihe' : ''}{e.status !== 'aktiv' ? ` · ${e.status}` : ''}</span></li>{:else}<li class="muted">Keine kommenden Termine.</li>{/each}
		</ul>
	{:else if data.tab === 'hinweise'}
		<ul class="evs">
			{#each data.notices as n}
				<li><strong>{NOTICE_KINDS[n.kind as keyof typeof NOTICE_KINDS] ?? n.kind}:</strong> {n.title}{n.deadline ? ` · Frist ${new Date(n.deadline).toLocaleDateString('de-DE')}` : ''}
					<form method="POST" action="?/archivieren" class="inl"><input type="hidden" name="id" value={n.id} /><button class="linkbtn">beenden</button></form></li>
			{:else}<li class="muted">Keine aktiven Hinweise.</li>{/each}
		</ul>
		<section class="card">
			<h2>Neuer Hinweis</h2>
			{#key form}
				<form method="POST" action="?/hinweis" class="f">
					<div class="two">
						<div class="field"><label for="n-kind">Art</label><select id="n-kind" name="kind" required>{#each Object.entries(NOTICE_KINDS) as [k, l]}<option value={k} selected={v(fv ?? {}, 'kind') === k}>{l}</option>{/each}</select></div>
						<div class="field"><label for="n-dl">Frist (optional)</label><input id="n-dl" type="date" name="deadline" value={v(fv ?? {}, 'deadline')} /></div>
						<div class="field"><label for="n-until">Anzeigen bis</label><input id="n-until" type="date" name="valid_until" value={v(fv ?? {}, 'valid_until')} /></div>
					</div>
					<div class="field"><label for="n-title">Titel</label><input id="n-title" name="title" required minlength="3" maxlength="200" value={v(fv ?? {}, 'title')} placeholder="z. B. Anmeldung Ferienprogramm ab 1. März" /></div>
					<div class="field"><label for="n-body">Text</label><textarea id="n-body" name="body" rows="3" maxlength="1200">{v(fv ?? {}, 'body')}</textarea></div>
					<div class="field"><label for="n-region">Gilt für (leer = euer Ort)</label><RegionPicker id="n-region" name="region_code" /></div>
					<div class="field"><label for="n-url">Link für Details</label><input id="n-url" type="url" name="source_url" maxlength="500" value={v(fv ?? {}, 'source_url')} /></div>
					<fieldset class="pills"><legend>Themen</legend>{#each Object.entries(RADAR_TOPICS) as [k, l]}<label class="pill"><input type="checkbox" name="topics" value={k} checked={(fv?.topics ?? []).includes(k)} /> {l}</label>{/each}</fieldset>
					<p class="muted small">Erscheint als „Anbieterinformation“ mit eurem Namen und im Familienradar der Region.</p>
					<div><button class="btn small">Veröffentlichen</button></div>
				</form>
			{/key}
		</section>
	{:else if data.tab === 'team'}
		<ul class="evs">
			{#each data.members as m}
				<li>{m.name} <span class="muted small">· {m.contactId} · {m.role === 'admin' ? 'Verwaltung' : 'Redaktion'}{m.me ? ' · du' : ''}</span>
					{#if data.role === 'admin' || m.me}<form method="POST" action="?/austragen" class="inl"><input type="hidden" name="user_id" value={m.userId} /><button class="linkbtn">{m.me ? 'mich austragen' : 'austragen'}</button></form>{/if}</li>
			{/each}
		</ul>
		{#if data.role === 'admin'}
			<section class="card">
				<h2>Person hinzufügen</h2>
				<form method="POST" action="?/mitglied" class="inline">
					<input name="contact_id" required placeholder="Familien-ID (z. B. K7M-4QX-2HD)" aria-label="Familien-ID" />
					<select name="role" aria-label="Rolle"><option value="redaktion">Redaktion (pflegt Inhalte)</option><option value="admin">Verwaltung (auch Team und Profil)</option></select>
					<button class="btn small">Hinzufügen</button>
				</form>
				<p class="muted small">Die Person braucht ein Konto bei Kinder Deutschlands. Ihre Familien-ID steht in ihrem Profil.</p>
			</section>
		{/if}
	{:else}
		{#if data.role === 'admin'}
			{#key form}
				<form method="POST" action="?/profil" class="f card">
					<OrgFields values={fv ?? data.orgValues} region={fv ? null : data.region} tiles={data.tiles} />
					<div class="field"><label for="ics_url">Kalender-Adresse (ICS, optional)</label><input id="ics_url" type="url" name="ics_url" maxlength="500" value={fv ? v(fv, 'ics_url') : (data.org.icsUrl ?? '')} placeholder="https://…/kalender.ics" />
						<small class="muted">Nur euren eigenen, öffentlichen Kalender eintragen. Termine daraus erscheinen als eure Termine.</small></div>
					<div><button class="btn small">Speichern</button></div>
				</form>
			{/key}
		{:else}
			<p class="muted">Das Profil kann nur die Verwaltung der Einrichtung ändern.</p>
		{/if}
	{/if}
</div>

<style>
	.wrap {
		max-width: 56rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	h1 {
		margin: var(--sp-3) 0 0;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		margin: var(--sp-4) 0;
		border-bottom: 2px solid var(--line);
	}
	.tabs a {
		padding: var(--sp-2) var(--sp-3);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 700;
		border-bottom: 4px solid transparent;
		margin-bottom: -2px;
	}
	.tabs a[aria-current='page'] {
		color: var(--ink);
		border-bottom-color: var(--yellow);
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-4) var(--sp-5);
		margin-bottom: var(--sp-4);
	}
	.card h2 {
		font-size: var(--fs-m);
		margin: 0 0 var(--sp-2);
	}
	.card h2 small {
		font-weight: 400;
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.ended {
		opacity: 0.6;
	}
	.f {
		display: grid;
		gap: var(--sp-3);
	}
	.two {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.inline input,
	.inline select {
		flex: 1 1 10rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.inl {
		display: inline;
	}
	.linkbtn {
		background: none;
		border: 0;
		padding: 0 0 0 var(--sp-2);
		color: var(--link);
		text-decoration: underline;
		font: inherit;
		font-size: var(--fs-s);
		cursor: pointer;
	}
	.evs {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--sp-4);
		display: grid;
		gap: var(--sp-2);
	}
	.evs li {
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface);
		border-radius: var(--radius-s);
	}
	.pills {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.pills legend {
		font-weight: 700;
		width: 100%;
		margin-bottom: var(--sp-1);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		font-size: var(--fs-s);
		min-height: 40px;
	}
	.pill:has(input:checked) {
		border-color: var(--navy);
		background: #fff3d1;
		color: var(--navy);
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
