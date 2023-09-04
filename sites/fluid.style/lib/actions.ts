import type { Action } from 'svelte/action'
import { get, type Writable } from 'svelte/store'

type ResizeOptions = {
	direction: 'left' | 'right',
	value: Writable<number>,
	double?: boolean,
	resizing?: Writable<boolean>,
	onStop?: () => void
}
export const resize: Action<HTMLButtonElement, ResizeOptions> = (node, { direction, value, resizing, double = false, onStop }) => {
	let start: number, initial: number
	function startResize(e: PointerEvent) {
		start = e.pageX
		initial = get(value)
		resizing?.set(true)
		window.addEventListener('pointermove', handleResize)
		window.addEventListener('pointerup', stopResize, { once: true })
	}
	function handleResize(e: PointerEvent) {
		const delta = (direction === 'right') ? start - e.pageX : e.pageX - start
		value.set(initial + delta * (double ? 2 : 1))
	}
	function stopResize() {
		resizing?.set(false)
		onStop?.()
		window.removeEventListener('pointermove', handleResize)
	}
	
	node.addEventListener('pointerdown', startResize)

	return {
		destroy() {
			node.removeEventListener('pointerdown', startResize)
		}
	}
}
