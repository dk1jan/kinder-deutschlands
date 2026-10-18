<script lang="ts">
	// Texteditor mit einfacher Formatierung und Vorschau (gleiche Darstellung wie später im Beitrag).
	import { renderMarkup } from '$lib/markup';
	let { name, value = '', label = 'Text', rows = 8, max = 20000, placeholder = '', required = false }: { name: string; value?: string; label?: string; rows?: number; max?: number; placeholder?: string; required?: boolean } = $props();
	// svelte-ignore state_referenced_locally
	let text = $state(value);
	let tab = $state<'schreiben' | 'vorschau'>('schreiben');
	let ta: HTMLTextAreaElement | undefined = $state();
	// svelte-ignore state_referenced_locally
	const id = `ed-${name}`;

	function wrap(before: string, after = before) {
		if (!ta) return;
		const s = ta.selectionStart, e = ta.selectionEnd;
		const sel = text.slice(s, e) || 'Text';
		text = text.slice(0, s) + before + sel + after + text.slice(e);
		queueMicrotask(() => {
			ta!.focus();
			ta!.setSelectionRange(s + before.length, s + before.length + sel.length);
		});
	}
	function prefix(p: string) {
		if (!ta) return;
		const s = ta.selectionStart;
		const lineStart = text.lastIndexOf('\n', s - 1) + 1;
		text = text.slice(0, lineStart) + p + text.slice(lineStart);
		queueMicrotask(() => ta!.focus());
	}
	function link() {
		const url = prompt('Link (https://…)');
		if (!url || !/^https?:\/\//.test(url)) return;
		wrap('[', `](${url})`);
	}
</script>

<div class="editor">
	<div class="head">
		<label for={id}>{label}</label>
		<div class="tabs" role="tablist" aria-label="Ansicht">
			<button type="button" role="tab" aria-selected={tab === 'schreiben'} onclick={() => (tab = 'schreiben')}>Schreiben</button>
			<button type="button" role="tab" aria-selected={tab === 'vorschau'} onclick={() => (tab = 'vorschau')}>Vorschau</button>
		</div>
	</div>
	{#if tab === 'schreiben'}
		<div class="tools" role="toolbar" aria-label="Formatierung">
			<button type="button" onclick={() => wrap('**')} aria-label="Fett"><b>F</b></button>
			<button type="button" onclick={() => wrap('*')} aria-label="Kursiv"><i>K</i></button>
			<button type="button" onclick={() => prefix('- ')} aria-label="Liste">• Liste</button>
			<button type="button" onclick={() => prefix('> ')} aria-label="Zitat">„ Zitat</button>
			<button type="button" onclick={link} aria-label="Link">Link</button>
		</div>
	{/if}
	<textarea {id} {name} bind:this={ta} bind:value={text} {rows} maxlength={max} {placeholder} {required} hidden={tab !== 'schreiben'}></textarea>
	{#if tab === 'vorschau'}
		<div class="preview prose" aria-live="polite">{#if text.trim()}{@html renderMarkup(text)}{:else}<p class="muted">Noch nichts geschrieben.</p>{/if}</div>
	{/if}
	<p class="count muted">{text.length.toLocaleString('de-DE')} / {max.toLocaleString('de-DE')} · **fett**, *kursiv*, „- “ für Listen, „> “ für Zitate</p>
</div>

<style>
	.editor {
		display: grid;
		gap: var(--sp-2);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	label {
		font-weight: 700;
	}
	.tabs {
		display: flex;
		gap: 2px;
		background: var(--surface-2);
		border-radius: 999px;
		padding: 3px;
	}
	.tabs button {
		border: 0;
		background: none;
		font: inherit;
		font-size: var(--fs-s);
		font-weight: 650;
		padding: 6px 14px;
		border-radius: 999px;
		color: var(--ink-2);
		cursor: pointer;
	}
	.tabs [aria-selected='true'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.1);
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.tools button {
		min-height: 40px;
		min-width: 40px;
		padding: 0 var(--sp-3);
		border: 1.5px solid var(--line);
		background: var(--surface);
		border-radius: var(--radius-s);
		font: inherit;
		font-size: var(--fs-s);
		color: var(--ink);
		cursor: pointer;
	}
	textarea {
		padding: var(--sp-3) var(--sp-4);
		line-height: 1.5;
		resize: vertical;
	}
	.preview {
		min-height: 8rem;
		padding: var(--sp-3) var(--sp-4);
		border: 1.5px dashed var(--line);
		border-radius: var(--radius-s);
		background: var(--surface);
	}
	.count {
		margin: 0;
		font-size: var(--fs-xs);
	}
</style>
