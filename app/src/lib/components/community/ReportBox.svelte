<script lang="ts">
	// Melden: Grund auswählen, optional Text. Wird an die zuständige Moderation geleitet.
	let { action, type, id, label = 'Melden' }: { action: string; type: string; id: string; label?: string } = $props();
	const REASONS: [string, string][] = [
		['unangemessen', 'Unangemessen'],
		['beleidigung', 'Beleidigung'],
		['drohung', 'Drohung'],
		['spam', 'Spam / Werbung'],
		['betrugsverdacht', 'Betrugsverdacht'],
		['private_daten', 'Private Daten'],
		['kinderfoto', 'Erkennbares Kind'],
		['falsch', 'Falschinformation'],
		['sonstiges', 'Sonstiges']
	];
</script>

<details class="rb">
	<summary>{label}</summary>
	<form method="POST" action={action}>
		<input type="hidden" name="type" value={type} />
		<input type="hidden" name="id" value={id} />
		<label class="sel"><span>Grund</span>
			<select name="reason" required>
				<option value="">Bitte wählen</option>
				{#each REASONS as [k, l]}<option value={k}>{l}</option>{/each}
			</select>
		</label>
		<input name="message" maxlength="500" placeholder="Was genau? (optional, nur für die Moderation)" aria-label="Was genau?" />
		<button class="btn small" type="submit">Meldung senden</button>
	</form>
</details>

<style>
	.rb summary {
		cursor: pointer;
		font-size: var(--fs-s);
		color: var(--ink-2);
		list-style: none;
	}
	.rb summary::-webkit-details-marker {
		display: none;
	}
	.rb summary:hover {
		color: var(--ink);
		text-decoration: underline;
	}
	form {
		display: grid;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
		padding: var(--sp-3);
		background: var(--surface-2);
		border-radius: var(--radius-s);
		max-width: 28rem;
	}
	.sel {
		display: grid;
		gap: 4px;
		font-size: var(--fs-s);
		font-weight: 650;
	}
</style>
