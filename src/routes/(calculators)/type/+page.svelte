<script lang="ts">
	import { sessionable } from "$lib/stores"
	import { onMount } from "svelte"

	let content = sessionable(`
		An
		<a href="https://www.smashingmagazine.com/2023/11/addressing-accessibility-concerns-fluid-type/" contenteditable="false" class="text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-cyan-500">accessible</a>
		fluid type generator
	`, 'calculator-text')

	let mounted = false
	onMount(() => mounted = true)
</script>

<svelte:head>
	<title>Accessible fluid CSS type generator | Fluid Style</title>
	<meta name="description" content="Generate fluid, responsive CSS font sizes that meet accessibility requirements." />
</svelte:head>

<h1 aria-label="An accessible fluid type generator" contenteditable bind:innerHTML={$content}
	on:keydown={(e) => {
		if (!e.metaKey && !e.ctrlKey) e.stopPropagation()
	}}
	class="invisible no-js:visible {mounted ? '!visible' : ''} outline-none text-[length:--computed-size] leading-[1.1] font-bold text-center"
/>