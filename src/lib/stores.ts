import { get, writable, type Writable } from "svelte/store";
import { page } from "$app/stores"
import { browser } from "$app/environment";
import { onMount } from "svelte";

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
    function onVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            sessionStorage.setItem(id, get(store))
        }
    }
    onMount(() => {
        if (!browser) return
        const saved = sessionStorage.getItem(id)
        if (saved) store.set(saved)
        document.addEventListener('visibilitychange', onVisibilityChange)

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            sessionStorage.setItem(id, get(store))
        }
    })

    return {
        subscribe: store.subscribe,
        set: store.set,
        update: store.update
    }
}