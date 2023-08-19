import { get, writable, type Writable } from "svelte/store";
import { page } from "$app/stores"
import { browser } from "$app/environment";
import { onDestroy, onMount } from "svelte";
import { get_current_component } from 'svelte/internal'

// Persist value as a search param
export function paramable<T>(val: T, param: string): Writable<T> {
    const initParams = get(page).url.searchParams
    let initVal: T 
    try {
        initVal = JSON.parse(initParams.get(param)!) as T
    } catch {} finally {
        initVal ??= val
    }
    const store = writable(initVal)
    const subscribe: Writable<T>['subscribe'] = (run, invalidate) => store.subscribe((val) => {
        run(val)
        if (browser && val != null) {
            // Save new value in URL
            const searchParams = new URLSearchParams(window.location.search)
            searchParams.set(param, JSON.stringify(val))
            history.replaceState(null, '', window.location.pathname + '?' + searchParams.toString())
        }
    }, invalidate)

    return {
        subscribe,
        set: store.set,
        update: store.update
    }
}

// Persist value in session storage
export function sessionable(initVal: string, id: string): Writable<string> {
    const store = writable(initVal)
    onDestroy(() => {
        if (!browser) return
        sessionStorage.setItem(id, get(store))
    })
    onMount(() => {
        if (!browser) return
        const saved = sessionStorage.getItem(id)
        if (saved) store.set(saved)
    })

    return {
        subscribe: store.subscribe,
        set: store.set,
        update: store.update
    }
}