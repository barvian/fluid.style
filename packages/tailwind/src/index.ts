import plugin from 'tailwindcss/plugin'
type Plugin = ReturnType<typeof plugin>
import { corePlugins } from 'tailwindcss/lib/corePlugins'
import { PluginAPI, PluginCreator } from 'tailwindcss/types/config'
import { isLength, log, parseLength, mapObject, filterObject, type CSSLength, type RawValue } from './util'
import defaultTheme from 'tailwindcss/defaultTheme'

const SCREEN_SCRUBBER = '100vw'
const CONTAINER_SCRUBBER = '100cqw'

export type ThemeConfigFluid = Partial<{
    defaultFromScreen: string,
    defaultToScreen: string,
    defaultFromContainer: string,
    defaultToContainer: string,
    preferContainer: boolean
}>

export default plugin((api: PluginAPI) => {
    const { theme, corePlugins: corePluginEnabled, addBase, matchUtilities } = api
    const context = getContext(theme)
    const {
        screens, defaultFromScreen, defaultToScreen,
        containers, defaultFromContainer, defaultToContainer,
        preferContainer, defaultFromBP, defaultToBP
    } = context

    // Add fluid versions for enabled core plugins
    const interceptedAPI = interceptUtilities(api, {
        addOriginal: false,
        transformValue(val, util) {
            if (util === 'text' && Array.isArray(val)) return val[0]
        }
    }, context)
    Object.entries(corePlugins).forEach(([name, _p]) => {
        if (!corePluginEnabled(name)) return
        const p = _p as PluginCreator
        p(interceptedAPI)
    })

    // And ~ utility to configure screen breakpoints
    matchUtilities({
        '~'(_fromBP, { modifier: _toBP }) {
            const parsed = parseValues(
                _fromBP,
                _toBP ?? defaultToScreen.raw, // Tailwind doesn't use default for modifiers, it just passes it as null
                context
            )
            if (!parsed) return null
            const [fromBP, toBP] = parsed

            return {
                // Only need to change the scrubber if they prefer container:
                [`--fluid-scrubber`]: preferContainer ? SCREEN_SCRUBBER : null,                
                // You always have to set these next two, because it could be in a media query i.e.
                // ~p-4/8 ~/md md:~p-8/12 md:~-md
                //         ^ (1)              ^ if this doesn't overwrite the toBP, it'll still be md from (1)
                [`--fluid-from-bp`]: fromBP.number+'',
                [`--fluid-to-bp`]: toBP.number+'',
            }
        }
    }, {
        values: { ...screens, DEFAULT: defaultFromScreen.raw },
        modifiers: screens
    })

    // And ~@ utility to configure container breakpoints
    matchUtilities({
        '~@'(_fromBP, { modifier: _toBP }) {
            const parsed = parseValues(
                _fromBP,
                _toBP ?? defaultToContainer.raw, // Tailwind doesn't use default for modifiers, it just passes it as null
                context
            )
            if (!parsed) return null
            const [fromBP, toBP] = parsed

            return {
                // Only need to change the scrubber if they prefer screens:
                '--fluid-scrubber': preferContainer ? null : CONTAINER_SCRUBBER,                
                // See note above for why you always set these two:
                '--fluid-from-bp': fromBP.number+'',
                '--fluid-to-bp': toBP.number+'',
            }
        }
    }, {
        values: { ...containers, DEFAULT: defaultFromContainer.raw },
        modifiers: containers
    })
    
    // Prevent cascading variables
    // TODO: maybe use @property for this when it's better supported?
    addBase({
        '[class^="~-"], [class^="~/"], [class*=" ~-"], [class*=" ~/"]': {
            ':where(& > *)': {
                // Screen reset
                '--fluid-scrubber': preferContainer ? CONTAINER_SCRUBBER : null,
                '--fluid-from-bp': defaultFromBP.number+'',
                '--fluid-to-bp': defaultToBP.number+''
            }
        },
        '[class^="~@"], [class*=" ~@"]': {
            ':where(& > *)': {
                // Container reset
                '--fluid-scrubber': preferContainer ? null : SCREEN_SCRUBBER,
                '--fluid-from-bp': defaultFromBP.number+'',
                '--fluid-to-bp': defaultToBP.number+''
            }
        }
    })
})

/**
 * Return a modified PluginAPI that intercepts calls to matchUtilities and matchComponents
 * to add fluidized versions of each
 */
export type ConvertValueFn = (val: any, util: string) => RawValue
type InterceptOptions = Partial<{
    addOriginal: boolean
    transformValue: ConvertValueFn
}>
function interceptUtilities(api: PluginAPI, {
    addOriginal = true,
    transformValue
}: InterceptOptions = {}, context: Context): PluginAPI {
    const { defaultFromBP, defaultToBP, defaultScrubber } = context

    const matchUtilities: PluginAPI['matchUtilities'] = (utilities, options) => {
        // Add original
        if (addOriginal) api.matchUtilities(utilities, options)
        // Skip ones with types that don't include length
        if (options?.type && !options.type.includes('length')/* && !options.type.includes('any')*/) return
        
        // Add fluid version
        api.matchUtilities<any, any>(mapObject(utilities, (util, origFn) =>
            [`~${util}`, function(_from, { modifier: _to }) {
                const parsed = parseValues(
                    typeof _from === 'string' ? _from : transformValue?.(_from, util),
                    typeof _to === 'string' ? _to : transformValue?.(_to, util),
                    context
                )
                if (!parsed) return null
                const [from, to] = parsed
                const unit = from.unit // you can technically get it from any of the values

                const fromBPNumber = `var(--fluid-from-bp,${defaultFromBP.number})`
                const fromBPLength = `${fromBPNumber}*1${unit}`
                const toBPNumber = `var(--fluid-to-bp,${defaultToBP.number})`
                const scrubber = `var(--fluid-scrubber,${defaultScrubber})`
                const min = `${Math.min(from.number, to.number)}${unit}` // CSS requires the min < max in a clamp
                const max = `${Math.max(from.number, to.number)}${unit}` // CSS requires the min < max in a clamp
                const delta = to.number - from.number
                return origFn(
                    `clamp(${min},${from.number}${unit} + (${scrubber} - ${fromBPLength})/(${toBPNumber} - ${fromBPNumber})${delta === 1 ? '' : `*${delta}`/* save a multiplication by 1 */},${max})`,
                    { modifier: null } // don't pass along the modifier
                )
            } satisfies typeof origFn]
        ), {
            ...options,
            supportsNegativeValues: false, // b/c they don't affect the modifier values which is confusing
            modifiers: options?.values ?? {} // must be at least {} or else Tailwind won't allow any modifiers
        })
    }

    // Make any add* or match* function (i.e. addComponents) a noop if we're not including the original
    const rest = addOriginal ? api : mapObject(api, (a, fn) =>
        a.startsWith('add') || a.startsWith('match') ? [a, ()=>{}] : [a, fn]
    )
    // @ts-expect-error the stint above is too dynamic for TS
    return { ...rest, matchUtilities, matchComponents: matchUtilities }
}

function parseValues(
    _from: RawValue, _to: RawValue,
    { defaultFromBP, defaultToBP }: Context
) {
    if (!_from || !_to) {
        log.warn('missing-values', [
            'Fluid utilities require two values'
        ])
        return null
    }
    const from = parseLength(_from)
    const to = parseLength(_to)
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
    if (from.number === to.number) {
        log.warn('no-change', [
            'Fluid utilities require two distinct values'
        ])
        return null
    }
    return [from, to] as const
}

function getContext(theme: PluginAPI['theme']) {
    const fluid: ThemeConfigFluid = theme('fluid') ?? {}

    function getBreakpoints(bpsType: 'container' | 'screen') {
        const bpsKey = bpsType === 'container' ? 'containers' : 'screens'
        const rawBps = theme(bpsKey) ?? {}
        // Get all "simple" breakpoints (i.e. just a length, not an object)
        const bps = filterObject(rawBps, (_, v) => typeof v === 'string' && isLength(v)) as Record<string, string> // TS can't infer based on the filter
        
        let sortedBreakpoints: CSSLength[]
        function getDefaultBreakpoint(bpType: 'from' | 'to') {
            const bpKey = bpsType === 'container'
                // These have to be literal strings (not a template string) for TS:
                ? (bpType === 'from' ? 'defaultFromContainer' : 'defaultToContainer')
                : (bpType === 'from' ? 'defaultFromScreen' : 'defaultToScreen')
            const rawBp = fluid[bpKey]
    
            if (typeof rawBp === 'string') {
                const parsed = parseLength(rawBps[rawBp] ?? rawBp)
                if (!parsed) throw new Error(`Invalid value for \`theme.fluid.${bpKey}\``)
                return parsed
            } else if (rawBp != null) {
                throw new Error(`Invalid value for \`theme.fluid.${bpKey}\``)
            }
            
            sortedBreakpoints ??= (() => {
                const bpsVals = Object.values(bps)
                if (!bpsVals.length) {
                    throw new Error(`Cannot resolve \`theme.fluid.${bpKey}\` because there's no simple values in \`theme.${bpsKey}\``)
                }
                const parsedBpsVals = bpsVals.map(v => parseLength(v)!)
                // Error if they have different units (can't sort that way)
                if (new Set(parsedBpsVals.map(l => l.unit!)).size > 1) {
                    throw new Error(`Cannot resolve \`theme.fluid.${bpKey}\` because \`theme.${bpsKey}\` contains values of different units`)
                }

                return parsedBpsVals.sort((a, b) => a.number - b.number)
            })()
            return sortedBreakpoints[bpType === 'from' ? 0 : sortedBreakpoints.length-1]
        }

        return [bps, getDefaultBreakpoint('from'), getDefaultBreakpoint('to')] as const
    }

    const [screens, defaultFromScreen, defaultToScreen] = getBreakpoints('screen')
    const [containers, defaultFromContainer, defaultToContainer] = getBreakpoints('container')
    const preferContainer = fluid.preferContainer === true
    return {
        screens, defaultFromScreen, defaultToScreen,
        containers, defaultFromContainer, defaultToContainer,
        preferContainer,
        defaultScrubber: preferContainer ? CONTAINER_SCRUBBER : SCREEN_SCRUBBER,
        defaultFromBP: preferContainer ? defaultFromContainer : defaultFromScreen,
        defaultToBP: preferContainer ? defaultToContainer : defaultToScreen
    }
}
type Context = ReturnType<typeof getContext>

export { default as buildFluidExtract } from './extractor'

/**
 * Re-exports all the default simple screens in rems, for better
 * compatibility with default utilities
 */
export const defaultScreensInRems = mapObject(defaultTheme.screens ?? {}, (name, v) => {
    if (typeof v !== 'string' || !isLength(v)) return [name, v]
    const len = parseLength(v)!
    if (len.unit !== 'px') return [name, v]
    return [name, `${len.number / 16}rem`]
})

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
