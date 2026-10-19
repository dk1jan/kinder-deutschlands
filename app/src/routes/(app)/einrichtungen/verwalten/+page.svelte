<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	let { data } = $props();
	const ST: Record<string, string> = { verifiziert: 'verifiziert', pausiert: 'pausiert – vorübergehend nicht öffentlich', beantragt: 'Antrag wird geprüft', abgelehnt: 'Antrag nicht bestätigt' };
</script>

<svelte:head><title>Meine Einrichtungen – Kinder Deutschlands</title></svelte:head>

<div class="container page narrow">
	<a class="back" href="/einrichtungen"><Icon name="zurueck" size={18} />Einrichtungen</a>
	<h1>Meine Einrichtungen</h1>
	{#if data.orgs.length}
		<ul class="list">
			{#each data.orgs as o}<li><a href="/einrichtungen/verwalten/{o.slug}"><strong>{o.name}</strong><small>{ST[o.status] ?? o.status} · {o.role === 'admin' ? 'Verwaltung' : 'Redaktion'}</small></a></li>{/each}
		</ul>
	{/if}
	{#each data.pending as p}
		<p class="pend"><strong>{p.name}</strong> – {ST[p.status]}{p.note ? `: ${p.note}` : ''}</p>
	{/each}
	{#if !data.orgs.length && !data.pending.length}<p class="muted">Du pflegst noch keine Einrichtung.</p>{/if}
	<p><a class="btn small" href="/einrichtungen/antrag">Einrichtung anmelden</a></p>
	<p class="muted small">Du sollst eine bestehende Einrichtung mitpflegen? Gib der Verwaltung dort deine Familien-ID (steht in deinem <a href="/profil">Profil</a>).</p>
</div>

<style>
	.narrow {
		max-width: 44rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.list {
		list-style: none;
		margin: 0 0 var(--sp-4);
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.list a {
		display: grid;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		text-decoration: none;
		color: var(--ink);
	}
	.list small {
		color: var(--ink-2);
	}
	.pend {
		padding: var(--sp-3);
		border-left: 4px solid var(--yellow);
		background: var(--surface);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
