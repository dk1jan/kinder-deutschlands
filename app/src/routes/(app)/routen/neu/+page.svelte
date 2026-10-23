<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	let { data, form } = $props();
	const fv = $derived((form && 'values' in form && form.values ? form.values : {}) as Record<string, string[]>);
	const v = (k: string) => fv[k]?.[0] ?? '';
	let pts = $state<[number, number][]>([]);
	$effect(() => {
		const raw = v('coords');
		if (raw && !pts.length) {
			try {
				pts = JSON.parse(raw);
			} catch {
				/* leer */
			}
		}
	});
	const r = Math.PI / 180;
	const dist = $derived(
		pts.reduce((m, c, i) => {
			if (!i) return 0;
			const [lo1, la1] = pts[i - 1], [lo2, la2] = c;
			const a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
			return m + 2 * 6371000 * Math.asin(Math.sqrt(a));
		}, 0)
	);
</script>

<svelte:head><title>Route einzeichnen – Kinder Deutschlands</title></svelte:head>

<div class="container page wrap">
	<a class="back" href="/routen"><Icon name="zurueck" size={18} />Kinderwagenrouten</a>
	<h1>Route einzeichnen</h1>
	<p class="lead">Tippe den Weg Punkt für Punkt auf der Karte nach – so, wie du ihn mit dem Kinderwagen gegangen bist. Es wird nichts aufgezeichnet und kein Standort verwendet.</p>
	{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}

	<form method="POST" class="f">
		<div class="mapbox"><FamilyMap mode="draw" tiles={data.tiles} center={pts[0] ?? data.center} zoom={15} draft={pts} label="Karte zum Einzeichnen" onDrawClick={(lon, lat) => (pts = [...pts, [lon, lat]])} /></div>
		<div class="tools">
			<span><strong>{(dist / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} km</strong> · {pts.length} Punkte</span>
			<button type="button" class="btn small secondary" onclick={() => (pts = pts.slice(0, -1))} disabled={!pts.length}>Letzten Punkt zurück</button>
			<button type="button" class="btn small secondary" onclick={() => pts.length > 2 && (pts = [...pts, pts[0]])} disabled={pts.length < 3}>Zum Start schließen (Rundweg)</button>
			<button type="button" class="btn small secondary" onclick={() => (pts = [])} disabled={!pts.length}>Neu anfangen</button>
		</div>
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
		<div><button class="btn" disabled={pts.length < 2}>Route einreichen</button></div>
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
</style>
