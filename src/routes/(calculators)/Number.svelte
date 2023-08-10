<script context="module" lang="ts">
	let changedUnits = 0
</script>
<script lang="ts">
	import { UNITS, type Unit } from "$lib/math"
    import { fly } from "svelte/transition"

    let cls = ''
    export { cls as class }
    export let value: number
    export let label: string
    export let id: string
    export let unit: Unit
    export let unitTabbable = false

    let showTooltip = false
    function onUnitChange() {
        if (++changedUnits > 1) {
            showTooltip = true
            setTimeout(() => showTooltip = false, 5000)
        }
	}
</script>

<div class={cls}>
    <label for={id} class="text-sm">{label}</label>
    <div class="flex items-stretch mt-1 relative border border-neutral-200 focus-within:border-black">
        <input type="number" {id} class="flex-1 w-full py-[0.5em] pl-[0.75em] pr-0 text-[clamp(1rem,0.826rem_+_0.87vw,1.5rem)] outline-none" bind:value min="0" />
        <div class="relative flex items-stretch">
            <select class="absolute inset-0 appearance-none" id={id+'-unit'} aria-describedby={id+'-tooltip'} on:change|once={changedUnits > 1 ? undefined : onUnitChange} bind:value={unit} tabindex={unitTabbable ? undefined : -1}>
                {#each UNITS as u}
                    <option selected={unit === u}>{u}</option>
                {/each}
            </select>
            <span class="relative flex items-center bg-white pointer-events-none text-[clamp(0.875rem,0.745rem_+_0.652vw,1.25rem)] gap-[0.333em] pr-[0.5em] text-neutral-600">
                {unit}
                <svg class="w-2.5" viewBox="0 0 10 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 10L5 14L1 10" stroke="black" vector-effect="non-scaling-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9 5L5 1L1 5" stroke="black" vector-effect="non-scaling-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>                    
            </span>
        </div>
        {#if showTooltip}
            <div role="tooltip" id={id+'-tooltip'} transition:fly={{ y: -15 }} class="absolute bg-neutral-600 rounded-md px-3 py-2 text-white text-sm bottom-full mb-3 right-0 after:absolute after:top-full after:right-4 after:border-x-transparent after:border-x-8 after:border-t-neutral-600 after:border-t-8 after:rounded-[1px]">
                Units must all match due to CSS constraints
            </div>
        {/if}
    </div>
</div>