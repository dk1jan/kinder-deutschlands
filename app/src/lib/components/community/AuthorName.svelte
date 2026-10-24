<script lang="ts">
	// Name einer Autorin/eines Autors; öffnet das Profil (wie nach dem QR-Scan), außer bei
	// Gruppenpseudonymen, gelöschten oder nicht auffindbaren Konten (contactId = null) – F-051.
	let { author }: { author: { name: string; pseudonym: boolean; contactId?: string | null } } = $props();
</script>

{#if !author.pseudonym && author.contactId}<a class="an" href="/m/{author.contactId}" title="Profil ansehen">{author.name}</a>{:else}{author.name}{/if}

<style>
	.an {
		position: relative;
		z-index: 1;
		color: inherit;
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
		text-underline-offset: 2px;
	}
	.an:hover {
		text-decoration-color: currentColor;
	}
	.an:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
</style>
