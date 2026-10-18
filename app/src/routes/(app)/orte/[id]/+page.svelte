<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import { KINDS, CONFIRMATION, REPORT_KINDS, FEATURE_GROUPS, featuresFor, ageText, distanceText, type FeatureGroup } from '$lib/places';

	let { data, form } = $props();
	const p = $derived(data.place);
	const k = $derived(KINDS[p.kind]);
	const fav = $derived(form && 'favorite' in form ? !!form.favorite : p.favorite);
	const fmt = (d: string | Date) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

	const groups = $derived.by(() => {
		const out: { key: FeatureGroup; label: string; yes: string[]; no: string[]; unknown: string[] }[] = [];
		for (const [g, label] of Object.entries(FEATURE_GROUPS) as [FeatureGroup, string][]) {
			const defs = featuresFor(p.kind).filter(([, d]) => d.group === g);
			if (!defs.length) continue;
			const row = { key: g, label, yes: [] as string[], no: [] as string[], unknown: [] as string[] };
			for (const [key, d] of defs) {
				const v = p.features[key];
				if (v === true) row.yes.push(d.label);
				else if (v === false) row.no.push(d.label);
				else row.unknown.push(d.label);
			}
			out.push(row);
		}
		return out;
	});
	const unknownAll = $derived(groups.flatMap((g) => g.unknown));
	const age = $derived(ageText(p.features));
	const addr = $derived([[p.address.street, p.address.housenumber].filter(Boolean).join(' '), [p.address.postcode, p.address.city].filter(Boolean).join(' ')].filter(Boolean).join(', '));
	const origin = { nutzer: 'Hinweis eines Mitglieds – unbestätigt', redaktion: 'Von der Redaktion bestätigt', amtlich: 'Amtliche Meldung' } as Record<string, string>;
	const noticeWord = { defekt: 'Etwas ist defekt', gesperrt: 'Gesperrt' } as Record<string, string>;

	let shareMsg = $state('');
	async function share() {
		const url = location.origin + `/orte/${p.id}`;
		try {
			if (navigator.share) await navigator.share({ title: p.name, url });
			else {
				await navigator.clipboard.writeText(url);
				shareMsg = 'Link kopiert.';
			}
		} catch {
			/* abgebrochen */
		}
	}
</script>

<svelte:head><title>{p.name} – Kinder Deutschlands</title></svelte:head>

<article class="ort">
	<header class="head">
		<a class="back" href="/karte?ort={p.id}"><Icon name="zurueck" size={18} />Karte</a>
		<p class="kind">
			<span class="badge" style:background={k.color} style:color={k.ink}><Icon name={k.icon} size={20} /></span>
			<span>{k.label}{p.region ? ` · ${p.region}` : ''}{p.parentRegion && p.parentRegion !== p.region ? `, ${p.parentRegion}` : ''}</span>
		</p>
		<h1>{p.name}</h1>
		{#if addr}<p class="addr">{addr}</p>{/if}
		{#if p.status === 'pruefung'}
			<Notice kind="info" title="Wartet auf Prüfung">Dein Vorschlag ist eingegangen. Sobald die Redaktion ihn freigibt, sehen ihn alle.</Notice>
		{:else if p.status !== 'aktiv'}
			<Notice kind="warn" title="Nicht öffentlich">Status: {p.status}. Nur für die Redaktion sichtbar.</Notice>
		{/if}

		<div class="actions">
			{#if data.member}
				<form method="POST" action="?/merken" use:enhance>
					<button class="act" type="submit" aria-pressed={fav}>
						<Icon name="stern" size={20} /><span>{fav ? 'Gemerkt' : 'Merken'}</span>
					</button>
				</form>
			{:else}
				<a class="act" href="/anmelden?weiter=/orte/{p.id}"><Icon name="stern" size={20} /><span>Merken</span></a>
			{/if}
			<a class="act" href="geo:{p.lat},{p.lon}?q={p.lat},{p.lon}"><Icon name="route" size={20} /><span>Hinweg</span></a>
			<button class="act" type="button" onclick={share}><Icon name="extern" size={20} /><span>Teilen</span></button>
			<a class="act" href="#melden"><Icon name="flagge" size={20} /><span>Melden</span></a>
		</div>
		{#if shareMsg}<p class="muted small" role="status">{shareMsg}</p>{/if}
	</header>

	{#each p.notices as n}
		<div class="notice-box" class:amtlich={n.origin === 'amtlich'} role="note">
			<Icon name="fehler" size={22} />
			<div>
				<strong>{noticeWord[n.kind] ?? n.kind}</strong>
				<span class="origin">{origin[n.origin] ?? n.origin} · {fmt(n.at)}{n.until ? ` · bis ${fmt(n.until)}` : ''}</span>
				{#if n.text && n.origin !== 'nutzer'}<p>{n.text}</p>{/if}
				{#if n.sourceUrl}<a href={n.sourceUrl} rel="noopener nofollow" target="_blank">Quelle der Meldung</a>{/if}
			</div>
		</div>
	{/each}

	<div class="mini">
		<FamilyMap mode="mini" tiles={data.tiles} center={[p.lon, p.lat]} zoom={16} points={[{ lon: p.lon, lat: p.lat, kind: p.kind }]} label="Lage von {p.name}" />
	</div>

	<div class="cols">
		<section class="card" aria-labelledby="ausstattung">
			<h2 id="ausstattung">Ausstattung</h2>
			{#if age || p.features.untergrund || p.features.zugang || p.features.einrichtung || p.features.wickeltisch_ort || p.features.gebuehr}
				<dl class="facts">
					{#if p.features.einrichtung}<div><dt>Einrichtung</dt><dd>{p.features.einrichtung}</dd></div>{/if}
					{#if age}<div><dt>Alter</dt><dd>{age}</dd></div>{/if}
					{#if p.features.untergrund}<div><dt>Untergrund</dt><dd>{p.features.untergrund}</dd></div>{/if}
					{#if p.features.wickeltisch_ort}<div><dt>Wickeltisch</dt><dd>{p.features.wickeltisch_ort}</dd></div>{/if}
					{#if p.features.gebuehr}<div><dt>Gebühr</dt><dd>{p.features.gebuehr}</dd></div>{/if}
					{#if p.features.zugang === 'kundschaft'}<div><dt>Zugang</dt><dd>nur für Kundschaft</dd></div>{/if}
				</dl>
			{/if}
			{#each groups as g}
				{#if g.yes.length || g.no.length}
					<h3>{g.label}</h3>
					<ul class="feat">
						{#each g.yes as l}<li class="yes"><span aria-hidden="true">✓</span>{l}</li>{/each}
						{#each g.no as l}<li class="no"><span aria-hidden="true">✕</span>{l} <span class="sr">(nein)</span><em>nein</em></li>{/each}
					</ul>
				{/if}
			{/each}
			{#if unknownAll.length}
				<p class="unknown"><strong>Noch nicht erfasst:</strong> {unknownAll.join(', ')}. Weißt du mehr? <a href="#melden">Sag uns Bescheid.</a></p>
			{/if}
			{#if p.nearToilets.length}
				<h3>Toilette in der Nähe</h3>
				<ul class="near">
					{#each p.nearToilets as t}
						<li><a href="/orte/{t.id}">{t.name}</a> · {distanceText(t.m)}{t.wickeln ? ' · mit Wickeltisch' : ''}</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="card" aria-labelledby="infos">
			<h2 id="infos">Gut zu wissen</h2>
			{#if p.description}<p>{p.description}</p>{/if}
			<dl class="facts">
				{#if p.openingHours}<div><dt>Öffnungszeiten</dt><dd><code>{p.openingHours}</code><small>Angabe aus der Quelle, ohne Gewähr</small></dd></div>{/if}
				{#if p.website}<div><dt>Webseite</dt><dd><a href={p.website} rel="noopener nofollow" target="_blank">{new URL(p.website).host}</a></dd></div>{/if}
				<div><dt>Gemerkt</dt><dd>{p.favoriteCount === 0 ? 'noch von niemandem' : p.favoriteCount < 5 ? 'von wenigen Mitgliedern' : `von ${p.favoriteCount} Mitgliedern`}</dd></div>
			</dl>
			<h3>Erfahrungen</h3>
			<p class="muted">Noch keine Erfahrungen. Bewertungen und Fotos von Eltern kommen mit der Community (Bauabschnitt 3) – mit Moderation.</p>
		</section>

		<section class="card src" aria-labelledby="quelle">
			<h2 id="quelle">Quelle und Aktualität</h2>
			<p><span class="conf">{CONFIRMATION[p.confirmation]?.label ?? p.confirmation}</span> {CONFIRMATION[p.confirmation]?.text ?? ''}</p>
			{#each p.sources as s}
				<div class="source">
					<p><strong>{s.name}</strong> · {s.operator}</p>
					<p class="muted small">
						Lizenz: {#if s.licenseUrl}<a href={s.licenseUrl} rel="noopener" target="_blank">{s.license}</a>{:else}{s.license}{/if} · {s.attribution}<br />
						Zuerst übernommen {fmt(s.firstSeen)} · zuletzt abgeglichen {fmt(s.lastSeen)} · Datensatz geändert {fmt(s.changed)}
						{#if s.gone}<br /><strong>In der Quelle nicht mehr vorhanden seit {fmt(s.gone)}.</strong>{/if}
					</p>
					{#if s.url}<a class="small" href={s.url} rel="noopener" target="_blank">Eintrag in der Quelle ansehen <Icon name="extern" size={14} /></a>{/if}
				</div>
			{:else}
				<p class="muted small">Von einem Mitglied eingetragen{p.checkedAt ? `, zuletzt geprüft ${fmt(p.checkedAt)}` : ''}.</p>
			{/each}
			<p class="muted small">Alle Angaben ohne Gewähr. Wir prüfen keine Sicherheit von Spielgeräten – Bewertungen und Hinweise sind keine Sicherheitszertifikate.</p>
			{#if data.editor}<p><a class="btn small secondary" href="/admin/daten/ort/{p.id}">In der Datenzentrale bearbeiten</a></p>{/if}
		</section>
	</div>

	<section class="card report" id="melden" aria-labelledby="melden-h">
		<h2 id="melden-h">Etwas stimmt nicht?</h2>
		{#if form && 'reported' in form && form.reported}
			<Notice kind="ok" title="Danke!">Deine Meldung ist bei der Redaktion. Defekte und Sperrungen zeigen wir sofort als unbestätigten Hinweis an.</Notice>
		{:else if data.member}
			{#if form && 'reportError' in form && form.reportError}<Notice kind="error">{form.reportError}</Notice>{/if}
			<form method="POST" action="?/melden" use:enhance>
				<fieldset>
					<legend>Was ist los?</legend>
					<div class="radios">
						{#each Object.entries(REPORT_KINDS) as [key, label]}
							<label class="radio"><input type="radio" name="kind" value={key} required /><span>{label}</span></label>
						{/each}
					</div>
				</fieldset>
				<div class="field">
					<label for="message">Was genau? <span class="muted">(optional, nur für die Redaktion sichtbar)</span></label>
					<textarea id="message" name="message" rows="3" maxlength="1000" placeholder="z. B. „Die große Rutsche ist seit Montag abgesperrt.“"></textarea>
				</div>
				<p class="muted small">Bitte keine Namen oder Fotos von Personen und Kindern.</p>
				<button class="btn" type="submit">Meldung senden</button>
			</form>
		{:else}
			<p>Zum Melden bitte <a href="/anmelden?weiter=/orte/{p.id}%23melden">anmelden</a>. So können wir Missbrauch vermeiden.</p>
		{/if}
	</section>
</article>

<style>
	.ort {
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
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: 0;
		color: var(--ink-2);
		font-weight: 650;
	}
	.badge {
		display: inline-grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		flex: none;
	}
	h1 {
		margin: var(--sp-2) 0 var(--sp-1);
		font-size: clamp(1.9rem, 1.2rem + 3vw, 3rem);
		line-height: 1.02;
		font-stretch: 85%;
	}
	.addr {
		margin: 0;
		color: var(--ink-2);
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
	.notice-box {
		display: flex;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border-radius: var(--radius-m);
		background: var(--surface);
		border-left: 6px solid var(--warn);
	}
	.notice-box.amtlich {
		border-left-color: var(--danger);
	}
	.notice-box strong {
		display: block;
	}
	.origin {
		font-size: var(--fs-s);
		color: var(--ink-2);
	}
	.notice-box p {
		margin: var(--sp-1) 0 0;
	}
	.mini {
		height: 240px;
		border-radius: var(--radius-l);
		overflow: hidden;
		box-shadow: var(--shadow);
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
	.card h3 {
		margin: var(--sp-4) 0 var(--sp-2);
		font-size: var(--fs-m);
	}
	.facts {
		display: grid;
		gap: var(--sp-2);
		margin: 0 0 var(--sp-2);
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
		display: grid;
	}
	.facts small {
		color: var(--ink-2);
		font-size: var(--fs-xs);
	}
	.feat {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.feat li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 999px;
		font-weight: 650;
		font-size: var(--fs-s);
	}
	.feat .yes {
		background: color-mix(in srgb, var(--sea) 16%, var(--surface));
	}
	.feat .yes span {
		color: var(--ok);
		font-weight: 900;
	}
	.feat .no {
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.feat .no em {
		font-style: normal;
		font-weight: 500;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.unknown {
		margin: var(--sp-4) 0 0;
		font-size: var(--fs-s);
		color: var(--ink-2);
	}
	.near {
		margin: 0;
		padding-left: 1.1rem;
	}
	.conf {
		display: inline-block;
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--surface-2);
		font-weight: 700;
		font-size: var(--fs-s);
		margin-right: var(--sp-1);
	}
	.source {
		border-top: 1px solid var(--line);
		padding-top: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.source p {
		margin: 0 0 var(--sp-1);
	}
	.small {
		font-size: var(--fs-s);
	}
	.report fieldset {
		border: 0;
		padding: 0;
		margin: 0 0 var(--sp-3);
	}
	.report legend {
		font-weight: 700;
		margin-bottom: var(--sp-2);
	}
	.radios {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: var(--sp-2);
	}
	.radio {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 48px;
		padding: 0 var(--sp-3);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-s);
		cursor: pointer;
	}
	.radio:has(input:checked) {
		border-color: var(--ink);
		background: var(--surface-2);
	}
	@media (min-width: 900px) {
		.cols {
			grid-template-columns: 1.15fr 1fr;
		}
		.src {
			grid-column: 1 / -1;
		}
		.mini {
			height: 300px;
		}
	}
</style>
