import { length } from 'tailwindcss/src/util/dataTypes'

export type CSSLength = {
    number: number
    unit?: string // only undefined if number is 0,
    raw: string
}

/**
 * Split a CSS length into a number string and a unit string
 */
export function parseLength(len?: string | null): CSSLength | null {
    if (!len) return null
    if (!length(len)) return null

    const match = len.match(/^(.*?)([a-z]+)$/)
    return {
        number: parseFloat(match?.[1]!),
        unit: match?.[2]!,
        raw: len
    }
}