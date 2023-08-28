import plugin from 'tailwindcss/plugin'
type Plugin = ReturnType<typeof plugin>
import { corePlugins } from 'tailwindcss/lib/corePlugins'
import { PluginAPI, PluginCreator, ThemeConfig } from 'tailwindcss/types/config'
import { parseLength, type CSSLength } from './util'
import { length } from 'tailwindcss/src/util/dataTypes'
import log from 'tailwindcss/lib/util/log'
import defaultTheme from 'tailwindcss/defaultTheme'

export type ThemeConfigFluid = Partial<{
    defaultFromScreen: string,
    defaultToScreen: string,
    defaultFromContainer: string,
    defaultToContainer: string,
    preferContainer: boolean
}>

/**
 * Base plugin, which adds fluid versions of compatible core plugins.
 */
export default plugin((api: PluginAPI) => {
    const { theme, corePlugins: corePluginEnabled } = api
    const context = getContext(theme)

    // By default, add fluid versions for enabled core plugins
    Object.entries(corePlugins).forEach(([name, _p]) => {
        if (!corePluginEnabled(name)) return
        const p = _p as PluginCreator
        p(interceptUtilities(api, {
            addOriginal: false,
            processValue(val, util) {
                if (util === 'text' && Array.isArray(val)) return val[0]
            }
        }, context))
    })
})

/**
 * Return a modified PluginAPI that intercepts calls to matchUtilities and matchComponents
 * to add fluidized versions of each
 */
export type ProcessValueFn = (val: any, util: string) => string
type InterceptOptions = Partial<{
    addOriginal: boolean
    processValue: ProcessValueFn
}>
function interceptUtilities(api: PluginAPI, {
    addOriginal = true,
    processValue
}: InterceptOptions = {}, {
    defaultFromBP, defaultToBP, preferContainer
}: Context): PluginAPI {
    const matchUtilities: PluginAPI['matchUtilities'] = (utilities, options) => {
        // Add original
        if (addOriginal) api.matchUtilities(utilities, options)
        // Skip ones with types that don't include length or any
        if (options?.type && !options.type.includes('length') && !options.type.includes('any')) return
        
        // Add fluid version
        api.matchUtilities(Object.fromEntries(Object.entries(utilities).map(([util, _fn]) =>
            [`~${util}`, function(_from, { modifier: _to }) {
                if (!_from || !_to) {
                    log.warn('missing-values', [
                        'Fluid utilities require two values'
                    ])
                    return null
                }
                const from = parseLength(typeof _from === 'string' ? _from : processValue?.(_from, util))
                const to = parseLength(typeof _to === 'string' ? _to : processValue?.(_to, util))
                if (!from || !to) {
                    log.warn('non-lengths', [
                        'Fluid utilities can only work with length values'
                    ])
                    return null
                }
                if (new Set([defaultFromBP.unit, defaultToBP.unit, from.unit, to.unit]).size > 1) {
                    log.warn('mismatching-units', [
                        `Fluid utilities' value units must match breakpoint units`
                    ])
                    return null
                }
                const unit = from.unit // you can technically get it from any of the values

                const fromBPNumber = `var(--fluid-${util}-from-bp,var(--fluid-from-bp,${defaultFromBP.number}))`
                const fromBPLength = `${fromBPNumber}*1${unit}`
                const toBPNumber = `var(--fluid-${util}-to-bp,var(--fluid-to-bp,${defaultToBP.number}))`
                const scrubber = `var(--fluid-${util}-scrubber,var(--fluid-scrubber,${preferContainer ? '100cq' : '100vw'}))`
                const min = `${Math.min(from.number, to.number)}${unit}` // CSS requires the min < max in a clamp
                const max = `${Math.max(from.number, to.number)}${unit}` // CSS requires the min < max in a clamp
                const delta = to.number - from.number
                return _fn(
                    `clamp(${min},${from.number}${from.unit} + (${scrubber} - ${fromBPLength})/(${toBPNumber} - ${fromBPNumber})${delta === 1 ? '' : `*${delta}`/* save a multiplication by 1 */},${max})`,
                    { modifier: null } // don't pass along the modifier
                )
            } satisfies typeof _fn]
        )), {
            ...options,
            supportsNegativeValues: false, // b/c -~ is super ugly and b/c they don't affect the modifier values which is confusing
            // @ts-expect-error TS can't infer that this is actually all string values even though we checked
            modifiers: options?.values ?? {} // must be at least {} or else Tailwind won't allow any modifiers
        })
    }

    return { ...api, matchUtilities, matchComponents: matchUtilities }
}

function getContext(theme: PluginAPI['theme']) {
    const fluid: ThemeConfigFluid = theme('fluid') ?? {}
    const preferContainer = fluid.preferContainer === true
    const breakpointsKey = preferContainer ? 'containers' : 'screens'
    const breakpoints = theme(breakpointsKey) ?? {}

    let sortedBreakpoints: CSSLength[] | undefined
    function getDefaultBreakpoint(type: 'from' | 'to') {
        const key = preferContainer
            // These have to be literal strings (not a template string) for TS:
            ? (type === 'from' ? 'defaultFromContainer' : 'defaultToContainer')
            : (type === 'from' ? 'defaultFromScreen' : 'defaultToScreen')
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
        return sortedBreakpoints[type === 'from' ? 0 : sortedBreakpoints.length-1]
    }

    return {
        defaultFromBP: getDefaultBreakpoint('from'),
        defaultToBP: getDefaultBreakpoint('to'),
        preferContainer
    }
}
type Context = ReturnType<typeof getContext>

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
 * Create fluid versions for a plugin's utilities.
 */
export const fluidize = (
    { handler: _handler, config }: Plugin,
    options?: InterceptOptions
): Plugin => ({
    handler: (api) => _handler(interceptUtilities(api, options, getContext(api.theme))),
    config
})
