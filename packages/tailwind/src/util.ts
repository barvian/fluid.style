export { default as mapObject } from 'map-obj'
export { includeKeys as filterObject } from 'filter-obj'
import { length as isLength } from 'tailwindcss/src/util/dataTypes'
export { isLength }
export { default as log } from 'tailwindcss/lib/util/log'

export type RawValue = string | null | undefined

export class CSSLength {
    constructor(public number: number, public unit?: string) {}
    get cssText() {
        return `${this.number}${this.unit ?? ''}`
    }
    static parse(raw: any) {
        if (!this.test(raw)) return null

        const match = (raw as string).match(/^(.*?)([a-z]+)$/)
        return new this(
            parseFloat(match?.[1]!),
            match?.[2]!
        )
    }
    static test(raw: any) {
        return typeof raw === 'string' ? isLength(raw) as boolean : false
    }
}