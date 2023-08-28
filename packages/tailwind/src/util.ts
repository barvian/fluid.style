export { default as mapObject } from 'map-obj'
export { includeKeys as filterObject } from 'filter-obj'
import { length as isLength } from 'tailwindcss/src/util/dataTypes'
export { isLength }
export { default as log } from 'tailwindcss/lib/util/log'

export type RawValue = string | null | undefined
export type CSSLength = {
    number: number
    unit?: string // only undefined if number is 0,
    raw: string
}

/**
 * Split a CSS length into a number string and a unit string
 */
export function parseLength(len: RawValue): CSSLength | null {
    if (!len) return null
    if (!isLength(len)) return null

    const match = len.match(/^(.*?)([a-z]+)$/)
    return {
        number: parseFloat(match?.[1]!),
        unit: match?.[2]!,
        raw: len
    }
}