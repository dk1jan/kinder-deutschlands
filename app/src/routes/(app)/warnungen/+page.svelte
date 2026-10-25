<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import WarningCard from '$lib/components/warnungen/WarningCard.svelte';
	import WarnMap from '$lib/components/warnungen/WarnMap.svelte';
	let { data, form } = $props();
	const LEVELS = [
		{ n: 1, label: 'Wetterwarnung', text: 'z. B. Frost, Glätte, Windböen – häufig' },
		{ n: 2, label: 'Markante Wetterwarnung', text: 'z. B. Sturmböen, Dauerregen, starke Gewitter' },
		{ n: 3, label: 'Unwetterwarnung', text: 'z. B. Orkanböen, Starkregen, Hagel – Gefahr' },
		{ n: 4, label: 'Extremes Unwetter', text: 'sehr gefährlich, selten – Push auch in der Ruhezeit' }
	];
	const lv = (n: number) => data.overview.byLevel[n]?.n ?? 0;
	const severe = $derived(lv(3) + lv(4));
	const kreiseSevere = $derived((data.overview.byLevel[3]?.kreise ?? 0) + (data.overview.byLevel[4]?.kreise ?? 0));
	const inK = (n: number) => (n === 1 ? 'in 1 Kreis' : `in ${n.toLocaleString('de-DE')} Kreisen`);
	const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }) : '–');
</script>

<svelte:head>
	<title>Warnungen – Kinder Deutschlands</title>
	<meta name="description" content="Unwetterwarnungen des Deutschen Wetterdienstes für jeden Kreis in Deutschland – mit Karte, als Mitteilung und Push aufs Handy." />
</svelte:head>

<section class="head">
	<div class="container narrowed">
		<p class="eyebrow"><Icon name="warnung" size={18} /> Deutscher Wetterdienst</p>
		<h1>Warnungen für deine Region.</h1>
		<p class="lead">
			Wir holen alle paar Minuten die Unwetterwarnungen des Deutschen Wetterdienstes ab – für jeden Kreis in Deutschland. Abonniere deine Gegend, dann
			bekommst du neue Warnungen als Mitteilung und auf Wunsch als Push aufs Handy. Auch für Kita, Schule oder Oma.
		</p>
		<ul class="live" aria-label="Gerade aktiv in Deutschland">
			<li class="l34"><strong>{severe.toLocaleString('de-DE')}</strong><span>{severe === 1 ? 'Unwetterwarnung' : 'Unwetterwarnungen'}{severe ? ` ${inK(kreiseSevere)}` : ''}</span></li>
			<li class="l2"><strong>{lv(2).toLocaleString('de-DE')}</strong><span>{lv(2) === 1 ? 'markante Warnung' : 'markante Warnungen'}</span></li>
			<li class="l1"><strong>{lv(1).toLocaleString('de-DE')}</strong><span>{lv(1) === 1 ? 'Wetterwarnung' : 'Wetterwarnungen'}</span></li>
		</ul>
		<p class="stand">Gerade aktiv in ganz Deutschland · Stand {fmt(data.stand)}</p>
	</div>
</section>

<div class="container page">
	{#if data.stale}
		<Notice kind="warn" title="Abruf verzögert">Der letzte Abgleich mit dem Deutschen Wetterdienst ist älter als 45 Minuten. Aktuelle Warnungen findest du auch auf <a href="https://www.wettergefahren.de" rel="noopener" target="_blank">wettergefahren.de</a>.</Notice>
	{/if}
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}

	<section class="explain" aria-labelledby="erklaert">
		<h2 id="erklaert">Kurz erklärt</h2>
		<dl>
			<dt>Was ist der Deutsche Wetterdienst?</dt>
			<dd>Der amtliche Wetterdienst des Bundes. Er gibt die offiziellen Warnungen vor Unwetter heraus, zum Beispiel vor Sturm, Gewitter, Starkregen, Glatteis oder Hitze.</dd>
			<dt>Muss ich dafür etwas installieren?</dt>
			<dd>
				Nein. Die Warnungen erscheinen hier bei Kinder Deutschlands – du brauchst keine Wetter-App und keine Warn-App. Du wählst nur deine Gegend. Aufs Handy kommen sie, wenn du
				<a href="/profil/benachrichtigungen">Benachrichtigungen einschaltest</a>. Auf dem iPhone legst du dafür Kinder Deutschlands auf den Home-Bildschirm.
			</dd>
		</dl>
	</section>

	<section aria-labelledby="karte-t">
		<h2 id="karte-t">Karte</h2>
		<WarnMap tiles={data.tiles} />
	</section>

	{#if data.member}
		<section aria-labelledby="mine">
			<h2 id="mine">Meine Regionen</h2>
			{#if data.mine.length && !data.pushDevices}
				<Notice kind="info" title="Push noch aus">Auf diesem Gerät ist Push noch nicht eingeschaltet. <a href="/profil/benachrichtigungen">Benachrichtigungen einschalten</a> – dann kommen Warnungen auch aufs Handy.</Notice>
			{/if}
			{#each data.mine as s (s.kreis)}
				<div class="sub">
					<div class="sub-head">
						<h3>{s.label ? `${s.label} · ${s.name}` : s.name}</h3>
						<form method="POST" action="?/aendern" class="inline">
							<input type="hidden" name="kreis" value={s.kreis} />
							<label>ab <select name="min_level" aria-label="Mindeststufe für {s.name}">{#each LEVELS as l}<option value={l.n} selected={s.minLevel === l.n}>Stufe {l.n}</option>{/each}</select></label>
							<label class="check"><input type="checkbox" name="push" checked={s.push} /> Push</label>
							<button class="btn small secondary">Speichern</button>
						</form>
						<form method="POST" action="?/abbestellen" class="inline"><input type="hidden" name="kreis" value={s.kreis} /><button class="btn small danger">Abbestellen</button></form>
					</div>
					{#if s.warnings.length}
						<div class="list">{#each s.warnings as w (w.id)}<WarningCard {w} />{/each}</div>
					{:else}
						<p class="calm"><Icon name="ok" size={18} /> Gerade keine Warnung für {s.name}.</p>
					{/if}
				</div>
			{/each}

			{#if data.mine.length < data.max}
				{#if data.home}
					<form method="POST" action="?/abonnieren" class="quick">
						<input type="hidden" name="region" value={data.home.code} /><input type="hidden" name="min_level" value="2" /><input type="hidden" name="push" value="on" />
						<button class="btn signal"><Icon name="glocke" size={18} />Warnungen für {data.home.name} abonnieren</button>
						<span class="muted">Deine Wohnregion · ab Stufe 2 · mit Push</span>
					</form>
				{/if}
				<details class="add" open={!data.mine.length && !data.home}>
					<summary>{data.mine.length ? 'Weitere Region abonnieren' : 'Region abonnieren'}</summary>
					<form method="POST" action="?/abonnieren" class="f">
						<div class="field"><label for="wr">Stadt, Gemeinde oder Kreis</label><RegionPicker id="wr" name="region" /></div>
						<div class="two">
							<label>Name (optional)<input name="label" maxlength="40" placeholder="z. B. Kita, Oma" /></label>
							<label>Ab Stufe<select name="min_level">{#each LEVELS as l}<option value={l.n} selected={l.n === 2}>{l.n} – {l.label}</option>{/each}</select></label>
						</div>
						<label class="check"><input type="checkbox" name="push" checked /> Auch als Push aufs Handy</label>
						<div><button class="btn">Abonnieren</button></div>
					</form>
				</details>
			{/if}
		</section>
	{:else}
		<section class="guest">
			<h2>Für deine Gegend ansehen</h2>
			<form method="GET" class="look">
				<div class="field"><label for="gr">Stadt, Gemeinde oder Kreis</label><RegionPicker id="gr" name="region" /></div>
				<button class="btn secondary">Anzeigen</button>
			</form>
			<p>Als Push aufs Handy? <a href="/anmelden?weiter=%2Fwarnungen">Anmelden</a> oder <a href="/registrieren">Konto anlegen</a> und deine Region abonnieren.</p>
		</section>
	{/if}

	{#if data.shown}
		<section aria-labelledby="shown">
			<h2 id="shown">{data.shown.name}</h2>
			{#if data.shownWarnings.length}
				<div class="list">{#each data.shownWarnings as w (w.id)}<WarningCard {w} />{/each}</div>
			{:else}
				<p class="calm"><Icon name="ok" size={18} /> Gerade keine Warnung für {data.shown.name}.</p>
			{/if}
		</section>
	{/if}

	<section aria-labelledby="stufen" class="legend">
		<h2 id="stufen">Die vier Stufen</h2>
		<ul>
			{#each LEVELS as l}<li class="lg{l.n}"><span class="dot" aria-hidden="true"></span><b>Stufe {l.n} · {l.label}</b><span class="muted">{l.text}</span></li>{/each}
		</ul>
	</section>

	<aside class="hinweis">
		<h2>Hinweis</h2>
		<p>
			Quelle der Wetterwarnungen: Deutscher Wetterdienst (DWD), opendata.dwd.de, Lizenz CC BY 4.0. Warntexte unverändert übernommen, ohne Gewähr. Push-Hinweise können sich verzögern –
			maßgeblich ist <a href="https://www.wettergefahren.de" rel="noopener" target="_blank">wettergefahren.de</a>. Bei Gefahr gilt immer die Durchsage der Behörden – Cell Broadcast, Radio und Sirenen bitte eingeschaltet lassen.
		</p>
	</aside>
</div>

<style>
	.explain {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		margin-bottom: var(--sp-5);
	}
	.explain h2 {
		margin-top: 0;
	}
	.explain dt {
		font-weight: 700;
		margin-top: var(--sp-3);
	}
	.explain dd {
		margin: var(--sp-1) 0 0;
		max-width: 60ch;
	}
	.head {
		background: var(--band);
		color: var(--on-band);
		padding: var(--sp-6) 0 var(--sp-6);
	}
	.head h1 {
		color: var(--white);
		margin: var(--sp-2) 0 var(--sp-3);
		font-size: clamp(2.2rem, 1.5rem + 3vw, 3.6rem);
		font-stretch: 80%;
		line-height: 1;
		max-width: 16ch;
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		margin: 0;
		color: var(--yellow);
		font-weight: 700;
	}
	.narrowed {
		max-width: 52rem;
	}
	.head .lead {
		max-width: 44rem;
		color: var(--on-band);
		opacity: 0.92;
	}
	.live {
		list-style: none;
		padding: 0;
		margin: var(--sp-5) 0 var(--sp-2);
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: var(--sp-3);
		max-width: 44rem;
	}
	.live li {
		display: grid;
		gap: 2px;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-m);
		background: color-mix(in srgb, var(--white) 8%, transparent);
		border-left: 6px solid var(--c);
	}
	.live strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		color: var(--white);
		line-height: 1.05;
	}
	.l34 {
		--c: #d63d31;
	}
	.l2 {
		--c: #f08a00;
	}
	.l1 {
		--c: #f2c500;
	}
	.stand {
		margin: 0;
		font-size: var(--fs-s);
		opacity: 0.8;
	}
	.page {
		padding-top: var(--sp-5);
		padding-bottom: var(--sp-8);
		display: grid;
		gap: var(--sp-6);
		max-width: 52rem;
	}
	section h2,
	.hinweis h2 {
		margin: 0 0 var(--sp-3);
	}
	.sub {
		border-top: 1px solid var(--line);
		padding: var(--sp-4) 0;
		display: grid;
		gap: var(--sp-3);
	}
	.sub-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-3);
	}
	.sub-head h3 {
		margin: 0;
		flex: 1 1 12rem;
		font-size: var(--fs-l);
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
	}
	.inline select {
		min-height: 40px;
	}
	.inline label {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.list {
		display: grid;
		gap: var(--sp-3);
	}
	.calm {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: 0;
		color: var(--ok);
		font-weight: 650;
	}
	.quick {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-3);
		margin: var(--sp-3) 0;
	}
	.add {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
	}
	.add summary {
		cursor: pointer;
		font-weight: 700;
	}
	.f {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.f label {
		font-weight: 650;
	}
	.two {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
	}
	.two label {
		display: grid;
		gap: 4px;
	}
	.look {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--sp-3);
	}
	.look .field {
		flex: 1 1 16rem;
		margin: 0;
	}
	.legend ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.legend li {
		display: grid;
		grid-template-columns: 1.1rem auto 1fr;
		gap: var(--sp-2);
		align-items: baseline;
	}
	.dot {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--c);
		align-self: center;
	}
	.lg1 {
		--c: #f2c500;
	}
	.lg2 {
		--c: #f08a00;
	}
	.lg3 {
		--c: #d63d31;
	}
	.lg4 {
		--c: #8e1f7a;
	}
	@media (max-width: 640px) {
		.legend li {
			grid-template-columns: 1.1rem 1fr;
		}
		.legend li .muted {
			grid-column: 2;
		}
	}
	.hinweis {
		background: var(--surface-2);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
	}
	.hinweis p {
		margin: 0 0 var(--sp-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
