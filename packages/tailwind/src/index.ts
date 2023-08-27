import plugin from 'tailwindcss/plugin'
type Plugin = ReturnType<typeof plugin>
import { corePlugins } from 'tailwindcss/lib/corePlugins'
import { PluginAPI, PluginCreator, ThemeConfig } from 'tailwindcss/types/config'
import { parseLength, type CSSLength } from './util'
import { length } from 'tailwindcss/src/util/dataTypes'
import log from 'tailwindcss/lib/util/log'
import defaultTheme from 'tailwindcss/defaultTheme'

export type ThemeConfigFluid = Partial<{
    defaultMinScreen: string,
    defaultMaxScreen: string,
    defaultMinContainer: string,
    defaultMaxContainer: string,
    preferContainer: boolean
}>

export default plugin((api: PluginAPI) => {
    const { corePlugins: corePluginEnabled } = api

    // By default, add fluid versions for enabled core plugins
    Object.entries(corePlugins).forEach(([name, _p]) => {
        if (!corePluginEnabled(name)) return
        const p = _p as PluginCreator
        p(interceptUtilities(api, { addOriginal: false }))
    })
})

function interceptUtilities(api: PluginAPI, { addOriginal = true } = {}): PluginAPI {
    const { min: minBP, max: maxBP, container } = getDefaultBreakpoints(api)
    const matchUtilities: PluginAPI['matchUtilities'] = (utilities, options) => {
        // Add original
        if (addOriginal) api.matchUtilities(utilities, options)
        // Skip ones with types that don't include length or any
        if (options?.type && !options.type.includes('length') && !options.type.includes('any')) return
        
        // Add fluid version
        api.matchUtilities(Object.fromEntries(Object.entries(utilities).map(([util, _fn]) =>
            [`~${util}`, function(_from, { modifier: _to }) {
                console.log(util, _from, _to)
                if (util === 'text' && Array.isArray(_from)) _from = _from[0]
                if (util === 'text' && Array.isArray(_to)) _to = _to[0]

                console.log(util, _from, _to)
                if (!_from || !_to) {
                    log.warn('missing-values', [
                        'Fluid utilities require two values'
                    ])
                    return null
                }
                const from = typeof _from === 'string' ? parseLength(_from) : null
                const to = typeof _to === 'string' ? parseLength(_to) : null
                if (!from || !to) {
                    log.warn('non-lengths', [
                        'Fluid utilities can only work with length values'
                    ])
                    return null
                }
                if (new Set([minBP.unit, maxBP.unit, from.unit, to.unit]).size > 1) {
                    log.warn('mismatching-units', [
                        `Fluid utilities' value units must match breakpoint units`
                    ])
                    return null
                }

                const minBPNumber = `var(--fluid-${util}-min-bp,var(--fluid-min-bp,${minBP.number}))`
                const minBPLength = `${minBPNumber}*1${minBP.unit}`
                const maxBPNumber = `var(--fluid-${util}-max-bp,var(--fluid-max-bp,${maxBP.number}))`
                const scrubber = `var(--fluid-${util}-scrubber,var(--fluid-scrubber,${container ? '100cq' : '100vw'}))`
                const min = `${Math.min(from.number, to.number)}${from.unit}` // CSS requires the min < max in a clamp
                const max = `${Math.max(from.number, to.number)}${to.unit}` // CSS requires the min < max in a clamp
                const delta = to.number - from.number
                return _fn(
                    `clamp(${min},${from.number}${from.unit} + (${scrubber} - ${minBPLength})/(${maxBPNumber} - ${minBPNumber})${delta === 1 ? '' : `*${delta}`/* save a multiplication by 1 */},${max})`,
                    { modifier: null } // don't pass along the modifier
                )
            } satisfies typeof _fn]
        )), {
            ...options,
            // @ts-expect-error
            modifiers: options?.values ?? {} // must be at least {} or else Tailwind won't allow any modifiers
        })
    }

    return { ...api, matchUtilities, matchComponents: matchUtilities }
}

function getDefaultBreakpoints({ theme }: PluginAPI) {
    const fluid: ThemeConfigFluid = theme('fluid') ?? {}
    const container = fluid.preferContainer === true
    const breakpointsKey = container ? 'containers' : 'screens'
    const breakpoints = theme(breakpointsKey) ?? {}

    let sortedBreakpoints: CSSLength[] | undefined
    function getDefaultBreakpoint(type: 'min' | 'max') {
        const key = container
            // These have to be literal strings (not a template string) for TS:
            ? (type === 'min' ? 'defaultMinContainer' : 'defaultMaxContainer')
            : (type === 'min' ? 'defaultMinScreen' : 'defaultMaxScreen')
        const raw = fluid[key]

        if (typeof raw === 'string') {
            const parsed = parseLength(breakpoints[raw] ?? raw)
            if (!parsed) throw new Error(`Invalid value for \`theme.fluid.${key}\``)
            return parsed
        } else if (raw != null) {
            throw new Error(`Invalid value for \`theme.fluid.${key}\``)
        }

        sortedBreakpoints ??= (() => {
            // Get all "simple" vals
            const vals = Object.values(breakpoints)
                .filter(v => typeof v === 'string' && length(v))
                .map(v => parseLength(v)!)
            if (!vals.length) {
                throw new Error(`Cannot resolve \`theme.fluid.${key}\` because there's no simple values in \`theme.${breakpointsKey}\``)
            }
            
            // Error if they have different units (can't sort that way)
            if (new Set(vals.map(l => l.unit!)).size > 1) {
                throw new Error(`Cannot resolve \`theme.fluid.${key}\` because \`theme.${breakpointsKey}\` contains values of different units`)
            }

            return vals.sort((a, b) => a.number - b.number)
        })()
        return sortedBreakpoints[type === 'min' ? 0 : sortedBreakpoints.length-1]
    }

    return {
        min: getDefaultBreakpoint('min'),
        max: getDefaultBreakpoint('max'),
        container
    }
}    

export { default as buildFluidExtract } from './extractor'

/**
 * Re-exports all the default simple screens in rems, for better
 * compatibility with default utilities
 */
export const defaultScreensInRems = Object.fromEntries(Object.entries(defaultTheme.screens ?? {}).map(([name, v]) => {
    if (typeof v !== 'string' || !length(v)) return [name, v]
    const len = parseLength(v)!
    if (len.unit !== 'px') return [name, v]
    return [name, `${len.number / 16}rem`]
})) as typeof defaultTheme.screens

/**
 * Creates fluid versions for a plugin's utilities.
 */
export const fluidize = ({ handler: _handler, config }: Plugin): Plugin => ({
    handler: (api) => _handler(interceptUtilities(api)),
    config
})
