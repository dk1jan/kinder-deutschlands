<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	let { children } = $props();
	// Nach dem Abmelden: Chat-Zugang und Schlüssel dieses Browsers entfernen (gemeinsam genutzte Geräte)
	onMount(() => {
		if (!page.data.user) {
			try {
				if (localStorage.getItem('kd_chat')) void import('$lib/chat/client.svelte').then((m) => m.clearChatIfLoggedOut());
			} catch {
				/* kein Speicher */
			}
		}
	});
</script>

{@render children()}
