<svelte:head>
	<title>Accessible fluid CSS type generator | Fluid Style</title>
	<meta name="description" content="Generate fluid, responsive CSS font sizes that meet accessibility requirements." />
</svelte:head>

<h1 contenteditable on:keydown={(e) => {
	if (!e.metaKey && !e.ctrlKey) e.stopPropagation()
}} class="outline-none text-[length:--computed-size] leading-[1.1] font-bold text-center">
	An
	<span contenteditable="false" class="text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-cyan-500">accessible</span>
	fluid type generator
</h1>