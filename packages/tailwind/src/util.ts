export * from 'filter-obj'
export { default as mapObject } from 'map-obj'
import { Container } from 'postcss'
// @ts-expect-error untyped source file
import { length as isLength } from 'tailwindcss/src/util/dataTypes'
import { PluginAPI } from 'tailwindcss/types/config'
export { isLength }
// @ts-expect-error untyped source file
export { default as log } from 'tailwindcss/lib/util/log'
export enum LogLevel {
    WARN = 'warn',
    RISK = 'risk'
}

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

let formatters: Record<number, Intl.NumberFormat> = {}
export const toPrecision = (num: number, precision: number) =>
    (formatters[precision] ??= new Intl.NumberFormat('en-US', {
        maximumFractionDigits: precision,
        useGrouping: false
    })).format(num)

// Count decimal places in number
export const precision = (num: number) => {
    if (Math.floor(num.valueOf()) === num.valueOf()) return 0
    return num.toString().split(".")[1].length || 0
}

export const unique = (iter: Iterable<any>) => new Set(iter).size

export function generateExpr(
    from: CSSLength, fromBP: CSSLength, to: CSSLength, toBP: CSSLength,
    { atContainer, checkSC144 = false }: { atContainer?: string | true, checkSC144?: boolean } = {}
) {
    const unit = from.unit // you can technically get it from any of the values
    const p = Math.max(precision(from.number), precision(fromBP.number), precision(to.number), precision(toBP.number), 2)

    const min = `${Math.min(from.number, to.number)}${unit}` // CSS requires the min < max in a clamp
    const max = `${Math.max(from.number, to.number)}${unit}` // CSS requires the min < max in a clamp
    const slope = (to.number - from.number) / (toBP.number - fromBP.number)
    const intercept = from.number - (fromBP.number * slope)
    const comment = `/* fluid from ${from.cssText} at ${fromBP.cssText} to ${to.cssText} at ${toBP.cssText}${atContainer ? ' (container)' : ''} */`

    // Write it as slope - intercept if intercept is negative (to save a character)
    if (intercept < 0 && slope > 0)
        return `clamp(${min},${toPrecision(slope * 100, p)}${atContainer ? 'cqw' : 'vw'} - ${toPrecision(intercept*-1, p)}${unit},${max})${comment}`

    return `clamp(${min},${toPrecision(intercept, p)}${unit} + ${toPrecision(slope * 100, p)}${atContainer ? 'cqw' : 'vw'},${max})${comment}`
}

export const parseExpr = (val: string) => {
    const [match, rawFrom, rawFromBP, rawTo, rawToBP, container, containerName] = val.match(/\/\* fluid from (.*?) at (.*?) to (.*?) at (.*?) (?:\((container)(?:: )?(.*?)\) )?\*\/$/) ?? []
    if (!match) return

    return {
        from: CSSLength.parse(rawFrom)!,
        fromBP: CSSLength.parse(rawFromBP)!,
        to: CSSLength.parse(rawTo)!,
        toBP: CSSLength.parse(rawToBP)!,
        container: (containerName as string | undefined) ?? Boolean(container),
    }
}

export const addVariantWithModifier = (
    api: PluginAPI, variant: string,
    fn: (extra: { container: Container, modifier: string | null }) => void
) => api.matchVariant(variant, 
    // @ts-expect-error undocumented API
    (_, { modifier, container }) => (
        fn({ modifier, container })
    ), {
        values: { DEFAULT: null }
    }
)