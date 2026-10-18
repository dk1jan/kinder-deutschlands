<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	const fmt = (d: string | Date) => new Date(d).toLocaleDateString('de-DE');
</script>

<svelte:head><title>Gruppe verwalten – {data.g.name}</title></svelte:head>

<div class="page">
	<a class="back" href="/community/g/{data.g.slug}"><Icon name="zurueck" size={18} />{data.g.name}</a>
	<h1>Gruppe verwalten</h1>
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	<section>
		<h2>Anfragen ({data.requests.length})</h2>
		{#each data.requests as r}
			<article class="req">
				<p><strong>{r.pseudonym ?? 'Anfrage'}</strong> <span class="muted">· {fmt(r.at)}{r.contactId ? ` · Familien-ID ${r.contactId}` : ''}</span></p>
				{#each r.application as qa}<p class="qa"><span>{qa.q}</span>{qa.a}</p>{/each}
				<p class="muted small">Antworten werden nach deiner Entscheidung gelöscht. Keine Nachweise oder Ausweise verlangen. In geschützten Gruppen siehst auch du nur den Gruppennamen.</p>
				<div class="row">
					<form method="POST" action="?/entscheiden"><input type="hidden" name="user" value={r.userId} /><input type="hidden" name="accept" value="1" /><button class="btn small">Aufnehmen</button></form>
					<form method="POST" action="?/entscheiden"><input type="hidden" name="user" value={r.userId} /><input type="hidden" name="accept" value="0" /><button class="btn small secondary">Ablehnen</button></form>
				</div>
			</article>
		{:else}<p class="muted">Keine offenen Anfragen.</p>{/each}
	</section>
	<section>
		<h2>Mitglieder ({data.members.length})</h2>
		<ul class="list">
			{#each data.members as m}
				<li><span>{m.pseudonym ?? m.name ?? 'Mitglied'} <small class="muted">seit {fmt(m.since)}</small></span>
					<form method="POST" action="?/entfernen" onsubmit={(e) => { if (!confirm('Mitglied entfernen?')) e.preventDefault(); }}><input type="hidden" name="user" value={m.userId} /><button class="btn small danger">Entfernen</button></form></li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.page {
		max-width: 44rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	section {
		margin-top: var(--sp-5);
	}
	.req {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		margin-bottom: var(--sp-2);
	}
	.qa {
		display: grid;
		gap: 2px;
		margin: var(--sp-2) 0;
	}
	.qa span {
		font-size: var(--fs-xs);
		color: var(--ink-2);
		font-weight: 700;
	}
	.row {
		display: flex;
		gap: var(--sp-2);
	}
	.list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	.list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-s);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
