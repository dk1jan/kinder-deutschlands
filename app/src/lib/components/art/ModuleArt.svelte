<script lang="ts">
	// Kleine geometrische Szenen für die Bereiche. Strich = currentColor (passt sich der Postkarte an).
	let { name }: { name: 'karte' | 'treffen' | 'community' | 'radar' | 'markt' | 'nachrichten' | 'warnung' } = $props();
</script>

<svg viewBox="0 0 200 140" class="art" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
	{#if name === 'karte'}
		<path d="M20 34 L70 18 L130 34 L180 18 V106 L130 122 L70 106 L20 122 Z" fill="var(--white)" fill-opacity="0.14" />
		<path d="M70 18 V106 M130 34 V122" opacity="0.6" />
		<path d="M38 96 Q60 70 92 84 T150 70" stroke-dasharray="1 11" />
		<path d="M150 26 C134 26 126 38 126 48 C126 64 150 84 150 84 C150 84 174 64 174 48 C174 38 166 26 150 26 Z" fill="var(--yellow)" stroke="var(--navy)" />
		<circle cx="150" cy="48" r="7" fill="var(--navy)" stroke="none" />
		<path d="M36 74 L36 58 L58 58 L74 82" />
	{:else if name === 'warnung'}
		<path d="M44 74 C30 74 22 64 24 54 C26 44 36 40 44 42 C48 28 62 22 76 26 C88 18 108 22 112 38 C126 36 136 46 134 58 C134 68 126 74 116 74 Z" fill="var(--white)" fill-opacity="0.85" />
		<path d="M78 74 L66 98 H82 L72 124 L102 90 H86 L96 74" fill="var(--yellow)" stroke="var(--navy)" />
		<path d="M30 92 L26 104 M48 96 L44 108 M120 92 L116 104 M108 104 L104 116" opacity="0.7" />
		<rect x="140" y="40" width="40" height="72" rx="8" fill="var(--white)" fill-opacity="0.25" />
		<path d="M152 74 V68 A8 8 0 0 1 168 68 V74 L171 78 H149 Z" fill="var(--yellow)" stroke="var(--navy)" stroke-width="3.5" />
		<path d="M156 82 A4 4 0 0 0 164 82" stroke-width="3.5" />
	{:else if name === 'treffen'}
		<circle cx="100" cy="72" r="46" fill="var(--white)" fill-opacity="0.5" />
		<path d="M100 72 L100 42 M100 72 L124 84" />
		<path d="M100 26 V20 M146 72 H152 M100 118 V124 M54 72 H48" />
		<path d="M28 116 C40 98 56 104 64 92" stroke-dasharray="1 10" />
		<path d="M150 38 L178 30 L150 22 Z" fill="var(--red)" />
		<path d="M150 22 V58" />
	{:else if name === 'community'}
		<path d="M24 26 H112 Q124 26 124 38 V74 Q124 86 112 86 H58 L36 104 V86 H24 Q12 86 12 74 V38 Q12 26 24 26 Z" fill="var(--white)" fill-opacity="0.6" />
		<path d="M88 58 H176 Q188 58 188 70 V100 Q188 112 176 112 H170 V128 L150 112 H88 Q76 112 76 100 V70 Q76 58 88 58 Z" fill="var(--yellow)" />
		<path d="M34 48 H90 M34 64 H72" />
		<path d="M98 80 H164 M98 94 H140" />
	{:else if name === 'radar'}
		<rect x="30" y="30" width="140" height="96" rx="12" fill="var(--white)" fill-opacity="0.16" />
		<path d="M30 56 H170 M66 18 V40 M134 18 V40" />
		<g stroke-width="0" fill="currentColor">
			<circle cx="58" cy="78" r="6" /><circle cx="86" cy="78" r="6" /><circle cx="114" cy="78" r="6" />
			<circle cx="58" cy="104" r="6" /><circle cx="86" cy="104" r="6" />
		</g>
		<path d="M128 112 L128 70 L162 82 L128 94" fill="var(--yellow)" stroke="var(--navy)" />
	{:else if name === 'markt'}
		<path d="M30 66 L82 18 H150 V86 L98 134 Z" fill="var(--yellow)" stroke="var(--yellow)" />
		<path d="M30 66 L82 18 H150 V86 L98 134 Z" stroke="currentColor" />
		<circle cx="124" cy="44" r="9" />
		<path d="M150 44 C176 44 186 60 176 76" />
		<rect x="66" y="66" width="34" height="34" rx="6" fill="var(--red)" stroke="var(--navy)" transform="rotate(-45 83 83)" />
	{:else}
		<rect x="62" y="12" width="76" height="120" rx="14" fill="var(--white)" fill-opacity="0.12" />
		<path d="M90 24 H110" />
		<path d="M74 46 H114 Q122 46 122 54 V66 Q122 74 114 74 H86 L76 82 V74 Q74 74 74 66 Z" fill="var(--sky)" stroke="var(--navy)" />
		<path d="M126 86 H86 Q78 86 78 94 V104 Q78 112 86 112 H112 L124 120 V112 Q126 112 126 104 Z" fill="var(--yellow)" stroke="var(--navy)" />
		<path d="M18 60 Q30 72 18 84 M34 52 Q52 72 34 92 M182 60 Q170 72 182 84 M166 52 Q148 72 166 92" stroke-width="4" opacity="0.7" />
	{/if}
</svg>

<style>
	.art {
		display: block;
		width: 100%;
		height: auto;
		max-height: 150px;
	}
</style>
