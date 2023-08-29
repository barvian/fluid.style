import plugin from 'tailwindcss/plugin'
type Plugin = ReturnType<typeof plugin>
import { corePlugins } from 'tailwindcss/lib/corePlugins'
import { PluginAPI, PluginCreator } from 'tailwindcss/types/config'
import mapObject from 'map-obj'
import { includeKeys, excludeKeys } from 'filter-obj'
import { log, CSSLength, type RawValue } from './util'
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
        transform: {
            text(val) {
                if (Array.isArray(val)) return val[0]
            }
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
                _toBP ?? defaultToScreen.cssText, // Tailwind doesn't use default for modifiers, it just passes it as null
                context,
                { warn: true }
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
        values: { ...screens, DEFAULT: defaultFromScreen.cssText },
        modifiers: screens
    })
    if (screens.DEFAULT) {
        log.warn('inaccessible-breakpoint', [
            `Your DEFAULT screen breakpoint must be renamed to be used in fluid utilities`
        ])
    }

    // And ~@ utility to configure container breakpoints
    matchUtilities({
        '~@'(_fromBP, { modifier: _toBP }) {
            const parsed = parseValues(
                _fromBP,
                _toBP ?? defaultToContainer.cssText, // Tailwind doesn't use default for modifiers, it just passes it as null
                context,
                { warn: true }
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
        values: { ...containers, DEFAULT: defaultFromContainer.cssText },
        modifiers: containers,
    })
    if (containers.DEFAULT) {
        log.warn('inaccessible-breakpoint', [
            `Your DEFAULT container breakpoint must be renamed to be used in fluid utilities`
        ])
    }
    
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
export type TransformValueFn = (val: any) => RawValue
type InterceptOptions = Partial<{
    addOriginal: boolean
    transform: Record<string, TransformValueFn>
}>
function interceptUtilities(api: PluginAPI, {
    addOriginal = true,
    transform
}: InterceptOptions = {}, context: Context): PluginAPI {
    // Make any add* or match* function (i.e. addComponents) a noop if we're not including the original
    const rest = addOriginal ? api : mapObject(api, (a, fn) =>
        a.startsWith('add') || a.startsWith('match') ? [a, ()=>{}] : [a, fn]
    )

    const matchUtilities: PluginAPI['matchUtilities'] = (utilities, options) => {
        // Add original
        if (addOriginal) api.matchUtilities(utilities, options)
        // Skip ones with types that don't include length
        if (options?.type && !options.type.includes('length')/* && !options.type.includes('any')*/) return
        
        // Add fluid version
        // Start by filtering the values as much as possible
        const values = Object.entries(options?.values ?? {}).reduce((values, [k, v]) => {
            // Get a list of unique matching transforms
            const transforms = Object.keys(utilities)
                .map(util => transform?.[util])
                .filter(t => t)
            if (transform?.DEFAULT) transforms.push(transform.DEFAULT)
            
            // These pre-transformed values could probably get saved under certain
            // conditions, but that's an optimization for another day
            const valid = transforms.length
                // If we have transforms, make sure its a valid value after every one
                ? transforms.every(t => parseValue(t!(v) ?? v, context))
                // otherwise just make sure it's valid
                : Boolean(parseValue(v, context))
            
            // If it passes, add it to our filtered set of values
            if (valid) values[k] = v
            return values
        }, {} as Record<string, any>)

        // TW doesn't use the DEFAULT convention for modifiers so we'll extract it:
        const { DEFAULT, ...modifiers } = values
        
        api.matchUtilities<any, any>(mapObject(utilities, (util, origFn) =>
            [`~${util}`, function(_from, { modifier: _to }) {
                // See note about default modifiers above
                if (_to === null && DEFAULT) _to = DEFAULT

                const parsed = parseValues(
                    transform?.[util]?.(_from) ?? transform?.DEFAULT?.(_from) ?? _from,
                    transform?.[util]?.(_to) ?? transform?.DEFAULT?.(_to) ?? _to,
                    context,
                    { warn: true }
                )
                if (!parsed) return null
                const [from, to] = parsed
                
                return origFn(
                    generateClamp(from, to, context),
                    { modifier: null } // don't pass along the modifier
                )
            } satisfies typeof origFn]
        ), {
            ...options,
            values,
            supportsNegativeValues: false, // b/c TW only negates the value, not the modifier
            modifiers
        })
    }
    
    // @ts-expect-error the `rest` thing is too dynamic for TS
    return { ...rest, matchUtilities, matchComponents: matchUtilities }
}

function parseValue(_val: any, { unit }: Context, { warn = false } = {}) {
    if (!_val) return null
    const val = CSSLength.parse(_val)
    if (!val) {
        if (warn) log.warn('non-lengths', [
            'Fluid utilities can only work with length values'
        ])
        return null
    }
    if (val.unit !== unit) {
        if (warn) log.warn('mismatching-units', [
            `Fluid utilities' value units must match breakpoint units`
        ])
        return null
    }
    return val
}

function parseValues(
    _from: any, _to: any,
    context: Context,
    { warn = false } = {}
) {
    if (!_from || !_to) {
        if (warn) log.warn('missing-values', [
            'Fluid utilities require two values'
        ])
        return null
    }
    const from = parseValue(_from, context)
    const to = parseValue(_to, context)
    if (!from || !to) return null

    if (from.number === to.number) {
        if (warn) log.warn('no-change', [
            'Fluid utilities require two distinct values'
        ])
        return null
    }
    return [from, to] as const
}

function generateClamp(
    from: CSSLength, to: CSSLength, 
    { defaultFromBP, defaultToBP, defaultScrubber }: Context,
) {
    const unit = from.unit // you can technically get it from any of the values

    const fromBPNumber = `var(--fluid-from-bp,${defaultFromBP.number})`
    const fromBPLength = `${fromBPNumber}*1${unit}`
    const toBPNumber = `var(--fluid-to-bp,${defaultToBP.number})`
    const scrubber = `var(--fluid-scrubber,${defaultScrubber})`
    const min = `${Math.min(from.number, to.number)}${unit}` // CSS requires the min < max in a clamp
    const max = `${Math.max(from.number, to.number)}${unit}` // CSS requires the min < max in a clamp
    const delta = to.number - from.number

    return `clamp(${min},${from.number}${unit} + (${scrubber} - ${fromBPLength})/(${toBPNumber} - ${fromBPNumber})${delta === 1 ? '' : `*${delta}`/* save a multiplication by 1 */},${max})`
}

function getContext(theme: PluginAPI['theme']) {
    const fluid: ThemeConfigFluid = theme('fluid') ?? {}

    function getBreakpoints(bpsType: 'container' | 'screen') {
        const bpsKey = bpsType === 'container' ? 'containers' : 'screens'
        const rawBps = theme(bpsKey) ?? {}
        // Get all "simple" breakpoints (i.e. just a length, not an object)
        const bps = includeKeys(rawBps, (_, v) => typeof v === 'string' && CSSLength.test(v)) as Record<string, string> // TS can't infer based on the filter
        
        let sortedBreakpoints: CSSLength[]
        function getDefaultBreakpoint(bpType: 'from' | 'to') {
            const bpKey = bpsType === 'container'
                // These have to be literal strings (not a template string) for TS:
                ? (bpType === 'from' ? 'defaultFromContainer' : 'defaultToContainer')
                : (bpType === 'from' ? 'defaultFromScreen' : 'defaultToScreen')
            const rawBp = fluid[bpKey]
    
            if (typeof rawBp === 'string') {
                const parsed = CSSLength.parse(rawBps[rawBp] ?? rawBp)
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
                const parsedBpsVals = bpsVals.map(v => CSSLength.parse(v)!)
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
    const units = [...new Set([defaultFromScreen.unit, defaultToScreen.unit])]
    if (units.length !== 1 || units[0] == null) {
        throw new Error(`All default fluid breakpoints must have the same units`)
    }
    return {
        screens, defaultFromScreen, defaultToScreen,
        containers, defaultFromContainer, defaultToContainer,
        preferContainer,
        defaultScrubber: preferContainer ? CONTAINER_SCRUBBER : SCREEN_SCRUBBER,
        defaultFromBP: preferContainer ? defaultFromContainer : defaultFromScreen,
        defaultToBP: preferContainer ? defaultToContainer : defaultToScreen,
        unit: units[0] as string
    }
}
type Context = ReturnType<typeof getContext>

export { default as buildFluidExtract } from './extractor'

/**
 * Re-exports all the default simple screens in rems, for better
 * compatibility with default utilities
 */
export const defaultScreensInRems = mapObject(defaultTheme.screens ?? {}, (name, v) => {
    if (typeof v !== 'string') return [name, v]
    const len = CSSLength.parse(v)
    if (!len || len.unit !== 'px') return [name, v]
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
