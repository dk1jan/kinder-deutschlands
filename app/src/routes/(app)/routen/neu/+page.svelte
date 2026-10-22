<script lang="ts">
	// Route einreichen: Einzeichnen auf der Karte oder per GPS aufzeichnen (F-027, D-059 angepasst).
	// Aufzeichnung bleibt im Browser, bis man absendet; Start/Ende werden gekürzt (Standard 50 m, 0–200 m einstellbar).
	import { onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import { acceptFix, lengthM, prepare, type Pt } from '$lib/routes/record';
	let { data, form } = $props();
	const fv = $derived((form && 'values' in form && form.values ? form.values : {}) as Record<string, string[]>);
	const v = (k: string) => fv[k]?.[0] ?? '';

	type Mode = 'zeichnen' | 'aufnahme' | 'pruefen';
	let mode = $state<Mode>('zeichnen');
	let drawPts = $state<Pt[]>([]);
	$effect(() => {
		const raw = v('coords');
		if (raw && !drawPts.length) {
			try {
				drawPts = JSON.parse(raw);
			} catch {
				/* leer */
			}
		}
	});

	// ---- GPS-Aufzeichnung ----
	let rec = $state<Pt[]>([]);
	let recState = $state<'aus' | 'laeuft' | 'pause'>('aus');
	let recError = $state('');
	let gap = $state(false);
	let accuracy = $state<number | null>(null);
	let startedAt = 0;
	let pausedMs = 0;
	let pauseAt = 0;
	let elapsed = $state(0);
	let watch = 0;
	let tick: ReturnType<typeof setInterval> | null = null;
	let wake: { release: () => Promise<void> } | null = null;
	let hiddenAt = 0;
	let trimStart = $state(50);
	let trimEnd = $state(50);

	async function keepAwake() {
		try {
			wake = (await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen')) ?? null;
		} catch {
			wake = null;
		}
	}
	function onVisibility() {
		if (recState !== 'laeuft') return;
		if (document.visibilityState === 'hidden') hiddenAt = Date.now();
		else {
			// Im Hintergrund zeichnet der Browser nicht auf – Lücke anzeigen, Bildschirm wieder wachhalten
			if (hiddenAt && Date.now() - hiddenAt > 30_000) gap = true;
			hiddenAt = 0;
			void keepAwake();
		}
	}
	function startRec() {
		recError = '';
		if (!('geolocation' in navigator)) {
			recError = 'Dieser Browser kann keinen Standort bestimmen.';
			return;
		}
		rec = [];
		gap = false;
		startedAt = Date.now();
		pausedMs = 0;
		elapsed = 0;
		recState = 'laeuft';
		watch = navigator.geolocation.watchPosition(
			(pos) => {
				if (recState !== 'laeuft') return;
				accuracy = Math.round(pos.coords.accuracy);
				recError = '';
				const p: Pt = [pos.coords.longitude, pos.coords.latitude];
				if (acceptFix(rec[rec.length - 1] ?? null, p, pos.coords.accuracy) && rec.length < 20000) rec = [...rec, p];
			},
			(err) => {
				// Kurz kein Signal (z. B. stehen geblieben, Tunnel) ist normal – nur echte Probleme melden
				if (err.code === err.PERMISSION_DENIED) recError = 'Standort im Browser nicht erlaubt – bitte in den Einstellungen freigeben.';
				else if (!rec.length) recError = 'Noch kein GPS-Signal – am besten draußen und mit freiem Himmel.';
			},
			{ enableHighAccuracy: true, maximumAge: 0 }
		);
		tick = setInterval(() => (elapsed = Date.now() - startedAt - pausedMs - (recState === 'pause' ? Date.now() - pauseAt : 0)), 1000);
		void keepAwake();
		document.addEventListener('visibilitychange', onVisibility);
	}
	function pauseRec() {
		if (recState === 'laeuft') {
			recState = 'pause';
			pauseAt = Date.now();
		} else if (recState === 'pause') {
			pausedMs += Date.now() - pauseAt;
			recState = 'laeuft';
		}
	}
	function stopWatch() {
		// läuft auch beim Rendern auf dem Server (onDestroy) – dort gibt es kein document/navigator
		if (typeof document === 'undefined') return;
		if (watch) navigator.geolocation.clearWatch(watch);
		watch = 0;
		if (tick) clearInterval(tick);
		tick = null;
		void wake?.release().catch(() => {});
		wake = null;
		document.removeEventListener('visibilitychange', onVisibility);
	}
	function finishRec() {
		stopWatch();
		recState = 'aus';
		mode = rec.length >= 2 ? 'pruefen' : 'aufnahme';
		if (rec.length < 2) recError = 'Zu wenige Punkte aufgezeichnet – bitte etwas länger gehen.';
	}
	function discardRec() {
		stopWatch();
		recState = 'aus';
		rec = [];
		mode = 'aufnahme';
	}
	onDestroy(stopWatch);

	const prepared = $derived(mode === 'pruefen' ? prepare(rec, trimStart, trimEnd) : []);
	const pts = $derived(mode === 'pruefen' ? prepared : drawPts);
	const dist = $derived(lengthM(mode === 'aufnahme' ? rec : pts));
	const km = (m: number) => (m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 });
	const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
	function editInDraw() {
		drawPts = prepared;
		mode = 'zeichnen';
	}
</script>

<svelte:head><title>Route einreichen – Kinder Deutschlands</title></svelte:head>

<div class="container page wrap">
	<a class="back" href="/routen"><Icon name="zurueck" size={18} />Kinderwagenrouten</a>
	<h1>Route einreichen</h1>
	<p class="lead">Zeichne den Weg auf der Karte nach – oder zeichne ihn unterwegs per GPS auf. Die Aufzeichnung bleibt auf deinem Handy, bis du sie absendest.</p>
	<div class="seg" role="tablist" aria-label="Wie möchtest du die Route erfassen?">
		<button type="button" role="tab" aria-selected={mode === 'zeichnen'} disabled={recState !== 'aus'} onclick={() => (mode = 'zeichnen')}><Icon name="route" size={18} /> Einzeichnen</button>
		<button type="button" role="tab" aria-selected={mode !== 'zeichnen'} onclick={() => (mode = rec.length >= 2 && recState === 'aus' ? 'pruefen' : 'aufnahme')}><Icon name="standort" size={18} /> Per GPS aufzeichnen</button>
	</div>
	{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}

	<form method="POST" class="f">
		{#if mode === 'zeichnen'}
			<p class="muted small">Tippe den Weg Punkt für Punkt auf der Karte nach – so, wie du ihn mit dem Kinderwagen gegangen bist.</p>
			<div class="mapbox"><FamilyMap mode="draw" tiles={data.tiles} center={drawPts[0] ?? data.center} zoom={15} draft={drawPts} label="Karte zum Einzeichnen" onDrawClick={(lon, lat) => (drawPts = [...drawPts, [lon, lat]])} /></div>
			<div class="tools">
				<span><strong>{km(dist)} km</strong> · {drawPts.length} Punkte</span>
				<button type="button" class="btn small secondary" onclick={() => (drawPts = drawPts.slice(0, -1))} disabled={!drawPts.length}>Letzten Punkt zurück</button>
				<button type="button" class="btn small secondary" onclick={() => drawPts.length > 2 && (drawPts = [...drawPts, drawPts[0]])} disabled={drawPts.length < 3}>Zum Start schließen (Rundweg)</button>
				<button type="button" class="btn small secondary" onclick={() => (drawPts = [])} disabled={!drawPts.length}>Neu anfangen</button>
			</div>
		{:else if mode === 'aufnahme'}
			<section class="rec" aria-labelledby="rec-t">
				<h2 id="rec-t" class="sr">GPS-Aufzeichnung</h2>
				{#if recState === 'aus'}
					<ul class="facts">
						<li>Bildschirm bleibt während der Aufzeichnung an – <strong>Seite offen lassen</strong>. Im Hintergrund oder bei gesperrtem Handy zeichnet der Browser nicht auf.</li>
						<li>Gespeichert wird nur die Linie, keine Uhrzeiten und kein Tempo. Anfang und Ende werden danach gekürzt (einstellbar), damit deine Haustür nicht in der Route steht.</li>
					</ul>
					<button type="button" class="btn signal big" onclick={startRec}><span class="rdot" aria-hidden="true"></span> Aufzeichnung starten</button>
				{:else}
					<div class="mapbox"><FamilyMap mode="mini" controls tiles={data.tiles} center={rec[rec.length - 1] ?? data.center} zoom={16} lines={rec.length > 1 ? [{ coords: rec }] : []} points={rec.length ? [{ lon: rec[rec.length - 1][0], lat: rec[rec.length - 1][1], kind: 'person', label: 'Du' }] : []} label="Aufzeichnung" /></div>
					<p class="stats" aria-live="polite">
						<span class="rdot" class:paused={recState === 'pause'} aria-hidden="true"></span>
						<strong>{recState === 'pause' ? 'Pause' : 'Läuft'}</strong> · {mmss(elapsed)} · {km(dist)} km
						{#if accuracy !== null}<span class="muted"> · GPS ± {accuracy} m</span>{/if}
					</p>
					{#if !rec.length}<p class="muted small">Warte auf GPS … draußen geht es meist in wenigen Sekunden.</p>{/if}
					{#if gap}<Notice kind="warn">Die Seite war zwischendurch im Hintergrund – dort fehlt ein Stück. Im Prüfschritt siehst du es als gerade Linie.</Notice>{/if}
					<div class="tools">
						<button type="button" class="btn secondary" onclick={pauseRec}>{recState === 'pause' ? 'Weiter' : 'Pause'}</button>
						<button type="button" class="btn" onclick={finishRec}>Beenden</button>
						<button type="button" class="btn small danger" onclick={discardRec}>Verwerfen</button>
					</div>
				{/if}
				{#if recError}<Notice kind="error">{recError}</Notice>{/if}
			</section>
		{:else}
			<section class="rec" aria-labelledby="pr-t">
				<h2 id="pr-t" class="h-small">Aufzeichnung prüfen</h2>
				<div class="mapbox"><FamilyMap mode="mini" controls tiles={data.tiles} center={prepared[0] ?? data.center} zoom={15} lines={prepared.length > 1 ? [{ coords: prepared }] : []} points={prepared.length > 1 ? [{ lon: prepared[0][0], lat: prepared[0][1], kind: 'treffpunkt', label: 'Start' }, { lon: prepared[prepared.length - 1][0], lat: prepared[prepared.length - 1][1], kind: 'treffpunkt', label: 'Ziel' }] : []} label="Aufgezeichnete Route" /></div>
				<p><strong>{km(dist)} km</strong> · {prepared.length} Punkte {#if !prepared.length}<span class="err">– zu kurz nach dem Kürzen, Regler zurücknehmen.</span>{/if}</p>
				<div class="trim">
					<label for="trim-s">Anfang kürzen: <strong>{trimStart} m</strong></label>
					<input id="trim-s" type="range" min="0" max="200" step="10" bind:value={trimStart} />
					<label for="trim-e">Ende kürzen: <strong>{trimEnd} m</strong></label>
					<input id="trim-e" type="range" min="0" max="200" step="10" bind:value={trimEnd} />
				</div>
				<p class="muted small">Start und Ziel sollen an öffentlichen Orten liegen (Ecke, Spielplatz, Haltestelle). Beginnt die Route an deiner Haustür, schieb den Regler weiter, bis der Start an einer Ecke liegt.</p>
				{#if gap}<Notice kind="warn">Hier fehlt ein Stück (Seite war im Hintergrund) – es erscheint als gerade Linie. Bitte prüfen.</Notice>{/if}
				<div class="tools">
					<button type="button" class="btn small secondary" onclick={editInDraw} disabled={prepared.length < 2}>Im Einzeichnen weiter bearbeiten</button>
					<button type="button" class="btn small danger" onclick={discardRec}>Verwerfen und neu aufzeichnen</button>
				</div>
			</section>
		{/if}
		<input type="hidden" name="coords" value={JSON.stringify(pts)} />
		<label class="check warn"><input type="checkbox" name="public_ends" required /> <span>Start und Ziel sind öffentliche Orte (z. B. Spielplatz, Haltestelle, Parkeingang) – <strong>nicht</strong> meine oder eine andere Wohnadresse.</span></label>

		<div class="field"><label for="title">Name der Route</label><input id="title" name="title" required minlength="3" maxlength="120" value={v('title')} placeholder="z. B. Runde um den Werdersee" /></div>
		<div class="field"><label for="description">Beschreibung</label><textarea id="description" name="description" rows="4" maxlength="3000" placeholder="Was ist gut, worauf achten? (z. B. Bordsteine, Brücke, Café)">{v('description')}</textarea></div>
		<div class="two">
			<label>Untergrund<select name="surface"><option value="">keine Angabe</option><option value="asphalt">Asphalt</option><option value="pflaster">Pflaster</option><option value="wassergebunden">Wassergebunden (Kies/Splitt)</option><option value="waldweg">Wald-/Feldweg</option><option value="gemischt">Gemischt</option></select></label>
			<label>Steigung<select name="incline"><option value="">keine Angabe</option><option value="eben">eben</option><option value="leicht">leichte Steigungen</option><option value="steil">steile Stellen</option></select></label>
			<label>Treppen auf dem Weg?<select name="stairs"><option value="">weiß nicht</option><option value="nein">keine</option><option value="ja">ja</option></select></label>
			<label>Enge Stellen?<select name="narrow"><option value="">weiß nicht</option><option value="nein">nein</option><option value="ja">ja</option></select></label>
			<label>Schatten?<select name="shade"><option value="">weiß nicht</option><option value="ja">überwiegend</option><option value="nein">wenig</option></select></label>
			<label>Dauer (Minuten, ungefähr)<input name="duration" type="number" min="5" max="600" value={v('duration')} /></label>
		</div>
		<div class="field"><label for="rest">Rastplätze, Bänke, Einkehr <span class="muted">(optional)</span></label><input id="rest" name="rest" maxlength="300" value={v('rest')} /></div>
		{#if data.redaktion}<label class="check"><input type="checkbox" name="redaktion" /> <span>Als Redaktion veröffentlichen (ohne Prüfung)</span></label>{/if}
		<p class="muted small">Spielplätze, Toiletten und Wickelmöglichkeiten am Weg zeigen wir automatisch aus der Familienkarte. Deine Route prüft die Redaktion, bevor sie öffentlich wird. Angaben sind Erfahrungen, keine Garantie für Sicherheit oder Barrierefreiheit.</p>
		<div><button class="btn" disabled={pts.length < 2 || mode === 'aufnahme'}>Route einreichen</button></div>
	</form>
</div>

<style>
	.wrap {
		max-width: 52rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.lead {
		color: var(--ink-2);
	}
	.f {
		display: grid;
		gap: var(--sp-4);
	}
	.mapbox {
		height: min(65vh, 30rem);
		border-radius: var(--radius-m);
		overflow: hidden;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.two {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
	}
	.two label {
		display: grid;
		gap: 4px;
		font-weight: 650;
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
	}
	.check.warn {
		padding: var(--sp-3);
		border-left: 4px solid var(--yellow);
		background: var(--surface);
	}
	.small {
		font-size: var(--fs-s);
	}
	.seg {
		display: inline-flex;
		gap: var(--sp-1);
		padding: 4px;
		border-radius: 999px;
		background: var(--surface-2);
		margin-bottom: var(--sp-4);
		flex-wrap: wrap;
	}
	.seg button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 var(--sp-4);
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--ink-2);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.seg button[aria-selected='true'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow);
	}
	.rec {
		display: grid;
		gap: var(--sp-3);
	}
	.facts {
		margin: 0;
		padding-left: var(--sp-4);
		display: grid;
		gap: var(--sp-2);
	}
	.big {
		justify-self: start;
		min-height: 56px;
		font-size: var(--fs-m, 1.05rem);
		display: inline-flex;
		gap: var(--sp-2);
		align-items: center;
	}
	.rdot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--red);
		display: inline-block;
		animation: blink 1.2s infinite;
	}
	.rdot.paused {
		animation: none;
		background: var(--ink-2);
	}
	@keyframes blink {
		50% {
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rdot {
			animation: none;
		}
	}
	.stats {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
		font-variant-numeric: tabular-nums;
	}
	.trim {
		display: grid;
		gap: var(--sp-1);
		max-width: 28rem;
	}
	.trim input {
		width: 100%;
		min-height: 44px;
	}
	.h-small {
		margin: 0;
		font-size: var(--fs-l);
	}
	.err {
		color: var(--danger);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
