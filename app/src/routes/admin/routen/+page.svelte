<script lang="ts">
	let { data } = $props();
	const km = (m: number) => (m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 });
</script>

<svelte:head><title>Routen – Verwaltung</title></svelte:head>

<h1>Kinderwagenrouten</h1>
<p class="muted">Von Mitgliedern eingezeichnete Routen erscheinen erst nach Prüfung: Start und Ziel öffentlich (keine Wohnadresse), Weg plausibel, keine privaten Angaben. Entscheiden auf der jeweiligen Routenseite.</p>
<h2>Warten auf Prüfung ({data.pending.length})</h2>
<ul>{#each data.pending as r}<li><a href="/routen/{r.id}">{r.title}</a> · {km(r.distanceM)} km{r.regionName ? ` · ${r.regionName}` : ''}</li>{:else}<li class="muted">Keine.</li>{/each}</ul>
<h2>Offene Hinweise auf Hindernisse</h2>
<ul>{#each data.warn as w}<li><a href="/routen/{w.id}">{w.title}</a> · {w.n} Hinweis(e)</li>{:else}<li class="muted">Keine.</li>{/each}</ul>
