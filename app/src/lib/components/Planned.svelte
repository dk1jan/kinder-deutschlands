<script lang="ts">
	// Ehrlicher Leerzustand für Bereiche, die noch gebaut werden. Keine Attrappen, keine erfundenen Inhalte.
	let { title, module, stage, text }: { title: string; module: string; stage: string; text: string } = $props();
</script>

<section class="planned" aria-labelledby="planned-title">
	<h1 id="planned-title">{title}</h1>
	<p>{text}</p>
	<dl>
		<dt>Stand</dt>
		<dd>In Planung – noch nicht nutzbar</dd>
		<dt>Modul</dt>
		<dd>{module}</dd>
		<dt>Bauabschnitt</dt>
		<dd>{stage}</dd>
	</dl>
</section>

<style>
	.planned {
		max-width: var(--measure);
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--sp-2) var(--sp-4);
		margin: var(--sp-5) 0 0;
		padding: var(--sp-4);
		border-left: 4px solid var(--signal);
		background: var(--surface);
		border-radius: 0 var(--radius-m) var(--radius-m) 0;
	}
	dt {
		font-weight: 700;
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	dd {
		margin: 0;
	}
</style>
