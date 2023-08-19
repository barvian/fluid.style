<script lang="ts">
	import { page } from '$app/stores'
	import NavItem from './NavItem.svelte'
	import Number from './Number.svelte'
	import { persistable } from '$lib/stores'
	import { compute, to10th, to100th, to1000th, clamp, type Unit, inRange } from '$lib/math'
	import { scale } from 'svelte/transition'
	import copy from 'copy-to-clipboard'
	import { writable, type Writable } from 'svelte/store'
	import { resize } from '$lib/actions'
	import { browser } from '$app/environment'
	
	$: type = $page.url.pathname === '/type'
	let min = persistable(2, 'min'), max = persistable(5, 'max'),
	minBP = persistable(20, 'min-bp'), maxBP = persistable(77.5, 'max-bp')
	let unit = persistable<Unit>('rem', 'unit')

	let zoom = 1, prefWidth: Writable<number> = writable(), actualWidth: number, resizing = writable(false)
	$: if (actualWidth) $prefWidth = actualWidth
	const mac = browser && /(Mac OS)|(Macintosh)/i.test(navigator.userAgent)
	function handleKeydown(e: KeyboardEvent) {
		if ((mac ? e.metaKey : e.ctrlKey) && e.key === '=') {
			e.preventDefault()
			zoom = 5
		} else if ((mac ? e.metaKey : e.ctrlKey) && (e.key === '-' || e.key === '0')) {
			e.preventDefault()
			zoom = 1
		}
	}

	$: ({ slope, intercept, failRange } = compute({ min: $min, max: $max, minBP: $minBP, maxBP: $maxBP, checkSC144: type }))
	$: cssText = `clamp(${to1000th(Math.min($min, $max))}${$unit}, ${to1000th(intercept)}${$unit} + ${to1000th(slope*100)}vw, ${to1000th(Math.max($min, $max))}${$unit})`
	let copied = false, copyTimeout: number
	const handleCssTextChange = () => {
		copied = false
		clearTimeout(copyTimeout)
	}
	$: if (cssText) handleCssTextChange()
	function copyCode() {
		copy(cssText)
		copied = true
		if (copyTimeout) clearTimeout(copyTimeout)
		copyTimeout = setTimeout(() => copied = false, 3000)
	}
</script>

<svelte:document on:keydown={handleKeydown} />

<svelte:head>
	<title>Fluid Style | Accessible, responsive CSS generator</title>
	<meta name="description" content="Generate responsive type or spacing CSS that meets accessibility requirements." />
</svelte:head>

<div class="flex flex-col min-h-screen">
	<nav class="flex items-center justify-center gap-2 mb-[max(6vh,theme(spacing.8))] mt-[max(3vh,theme(spacing.5))]">
		<NavItem href="/type" shortcut="T">Type</NavItem>
		<NavItem href="/spacing" shortcut="S">Spacing</NavItem>
	</nav>
	<header class="flex items-stretch border-y flex-1 min-h-[10rem] border-neutral-150 [&:has(button:hover)_button]:bg-neutral-250 [&:has(button:hover)]:border-neutral-250 mx-auto max-w-[92%] min-w-[15rem] {actualWidth ? 'w-min' : 'w-full'}" class:border-neutral-250={$resizing}>
		<button use:resize={{ direction: 'right', value: prefWidth, double: true, onStop: () => $prefWidth = actualWidth, resizing }} tabindex="-1" class="cursor-ew-resize bg-neutral-150 outline-none hover:bg-neutral-250 touch-manipulation w-4.5 flex items-center justify-center gap-0.5" class:bg-neutral-250={$resizing}><div class="bg-neutral-450 w-0.5 h-6 rounded-full" /><div class="bg-neutral-450 w-0.5 h-6 rounded-full" /></button>
		<div class="@container flex-1 relative overflow-hidden" bind:clientWidth={actualWidth} style:width={$prefWidth == null ? '100%' : $prefWidth+'px'} style:--computed-size="clamp({to1000th(Math.min($min, $max))}{$unit}*{zoom}, {to1000th(intercept)}{$unit}*{zoom} + {to1000th(slope*100)}cqw, {to1000th(Math.max($min, $max))}{$unit}*{zoom})">
			<div class="absolute inset-0 overflow-y-auto">
				<div class="p-9 flex items-center justify-center h-full">
					<slot />
				</div>
			</div>
			{#if actualWidth}
				{@const w = $unit === 'px' ? actualWidth : actualWidth / 16}
				{@const inViewportRange = inRange(w, failRange)}
				<div class="absolute top-0 right-0 text-sm flex whitespace-nowrap gap-5 select-none">
					{#if zoom > 1 || inViewportRange}
						<div class="bg-white py-2 px-3 flex items-center">
							{zoom*100}%
							<span class="ml-2 aspect-square border rounded-[0.25rem] flex items-center justify-center w-[1.15rem] leading-none text-[0.625rem] font-medium opacity-50">
								⌘									
							</span>
							<span class="ml-1 aspect-square border rounded-[0.25rem] flex items-center justify-center w-[1.15rem] leading-none text-[0.9rem] font-medium opacity-50">
								{zoom > 1 ? '-' : '+'}				
							</span>
						</div>
					{/if}
					<div class="bg-neutral-125/60 backdrop-blur-[4px] py-2 px-3">
						<span class={inViewportRange && zoom >= 5 ? 'text-red-500 font-medium' : ''}>
							{to100th(clamp(Math.min($min,$max)*zoom, intercept*zoom + slope*w, Math.max($max,$min)*zoom))}{$unit}
							@
						</span>
						<span class={inViewportRange ? 'text-red-500 font-medium' : ''}>{to10th(w)}{$unit}</span>
					</div>
				</div>
			{/if}
		</div>
		<button use:resize={{ direction: 'left', value: prefWidth, double: true, onStop: () => $prefWidth = actualWidth, resizing }}  tabindex="-1" class="cursor-ew-resize bg-neutral-150 outline-none hover:bg-neutral-250 touch-manipulation w-4.5 flex items-center justify-center gap-0.5" class:bg-neutral-250={$resizing}><div class="bg-neutral-450 w-0.5 h-6 rounded-full" /><div class="bg-neutral-450 w-0.5 h-6 rounded-full" /></button>
	</header>
	<main class="@container mt-[max(8vh,theme(spacing.12))] mb-[max(6vh,theme(spacing.8))]">
		<form class="grid grid-cols-2 relative [--rounded:clamp(1rem,0.739rem_+_1.304vw,1.75rem)] max-w-4xl mx-auto before:absolute before:-inset-x-[10%] before:-inset-y-[80%] before:bg-gradients before:-z-[2] before:blur-[100px] before:pointer-events-none before:saturate-150 after:bg-white after:absolute after:inset-0 after:-z-[1] after:rounded-[--rounded] after:shadow-2xl">
			<fieldset class="md:flex items-center gap-[3%] p-[clamp(1rem,0.652rem_+_1.739vw,2rem)]">
				<Number class="max-md:mb-2" label="Min size" id="min-size" bind:value={$min} bind:unit={$unit} />
				<span class="inline md:inline-block md:mt-5 md:text-neutral-450 md:text-2xl">@</span>
				<Number class="max-md:contents" label="Breakpoint" id="min-breakpoint" bind:value={$minBP} bind:unit={$unit} />
			</fieldset>
			<fieldset class="md:flex items-center gap-[3%] p-[clamp(1rem,0.652rem_+_1.739vw,2rem)] border-l border-neutral-200">
				<Number class="max-md:mb-2" label="Max size" id="max-size" bind:value={$max} bind:unit={$unit} />
				<span class="inline md:inline-block md:mt-5 md:text-neutral-450 md:text-2xl">@</span>
				<Number class="max-md:contents" label="Breakpoint" id="max-breakpoint" bind:value={$maxBP} bind:unit={$unit} unitTabbable />
			</fieldset>
			<output class="col-span-2 rounded-b-[--rounded] overflow-hidden overlap text-[clamp(1rem,0.957rem_+_0.217vw,1.125rem)]" for="min-size min-breakpoint max-size max-breakpoint">
				<code class="block bg-[#393939] overflow-x-auto whitespace-nowrap text-white font-bold text-center p-[clamp(1.25rem,0.989rem_+_1.304vw,2rem)]">
					<span class="text-neutral-400">{type ? 'font-size' : '[property]'}:</span>
					<button type="button" title="Copy CSS code" class="cursor-copy border-neutral-200 group transition-colors hover:bg-white/10 active:bg-white/0 active:transition-none rounded-md border px-[0.889em] py-[0.55em] border-dashed" on:click={copyCode}>
						{cssText}
						<div class="aspect-square w-6 relative inline-block -top-[0.0625em] items-center justify-center bg-white/10 group-hover:bg-white/0 transition-colors rounded-sm align-middle">
							{#if copied}
								<svg transition:scale class="w-4 absolute -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2" fill="none" shape-rendering="geometricPrecision" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
									<path d="M20 6L9 17l-5-5" vector-effect="non-scaling-stroke"/>
								</svg>
							{:else}
								<svg transition:scale class="w-3 absolute -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M10.9333 11.3333H4.4C4.17909 11.3333 4 11.1543 4 10.9333V4.4C4 4.17909 4.17909 4 4.4 4H10.9333C11.1543 4 11.3333 4.17909 11.3333 4.4V10.9333C11.3333 11.1543 11.1543 11.3333 10.9333 11.3333Z" stroke="white" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
									<path d="M7.99996 4.00008V1.06675C7.99996 0.845835 7.82089 0.666748 7.59996 0.666748H1.06663C0.845713 0.666748 0.666626 0.845835 0.666626 1.06675V7.60008C0.666626 7.82101 0.845713 8.00008 1.06663 8.00008H3.99996" stroke="white" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							{/if}
						</div>
					</button>
				</code>
				{#if failRange?.length}
					<div class="bg-red-500 relative text-white text-center font-bold p-[clamp(1.25rem,0.989rem_+_1.304vw,2rem)] flex items-center justify-center">
						<p>
							Fails <a class="underline underline-offset-[0.25em] hover:opacity-90" href="https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html">WCAG SC 1.4.4</a> in Chrome/Edge/Firefox at viewport widths {to10th(failRange[0])}–{to10th(failRange[1])}{$unit}
						</p>
					</div>
				{/if}
			</output>
		</form>
	</main>
</div>
<footer class="text-center mt-mt-[max(3vh,theme(spacing.5))] mb-[max(8vh,theme(spacing.12))] relative">
	<p class="text-black/40 leading-loose">
		Created by <a href="https://barvian.me" class="whitespace-nowrap underline underline-offset-[0.25em] text-black  hover:opacity-80">Maxwell Barvian</a>, with some math help by <a class="text-black  hover:opacity-80 whitespace-nowrap underline underline-offset-[0.25em]" href="https://www.linkedin.com/in/zach-barvian-5aa406113">Zach Barvian</a>.<br/>
		Initial accessibility observations made by <a class="whitespace-nowrap underline underline-offset-[0.25em] text-black  hover:opacity-80" href="https://adrianroselli.com/2019/12/responsive-type-and-zoom.html">Adrian Roselli</a>.
	</p>
</footer>