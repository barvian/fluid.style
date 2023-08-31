export * from 'filter-obj'
export { default as mapObject } from 'map-obj'
// @ts-expect-error untyped source file
import { length as isLength } from 'tailwindcss/src/util/dataTypes'
export { isLength }
// @ts-expect-error untyped source file
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
        const number = parseFloat(match?.[1] ?? '')
        return isNaN(number) ? null : new this(number, match?.[2])
    }
    static test(raw: any) {
        return typeof raw === 'string' ? isLength(raw) as boolean : false
    }
}