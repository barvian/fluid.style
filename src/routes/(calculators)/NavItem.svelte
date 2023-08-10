<script lang="ts">
	import { goto } from "$app/navigation"
    export let href: string
    export let shortcut: string
    import { page } from "$app/stores"

    function go(e: Event) {
        e.preventDefault()
        goto(href+window.location.search, {
            replaceState: true,
            keepFocus: true,
            noScroll: true,
            invalidateAll: false
        })
    }
</script>

<svelte:document on:keydown={(e) => {
    if (e.key.toLowerCase() === shortcut.toLowerCase()) go(e)
}} />
<a {href} on:click={go} aria-current={$page.url.pathname === href ? 'page' : undefined} class="rounded-full inline-flex gap-2 items-center px-5 py-2 current:bg-black/10 group transition-colors">
    <span class="text-neutral-500 group-hover:text-black group-current:text-black transition-colors"><slot /></span>
    <span class="uppercase text-neutral-500 rounded-[0.25rem] opacity-50 text-xs font-medium aspect-square flex items-center justify-center text-center border w-5">
        {shortcut}
    </span>
</a>