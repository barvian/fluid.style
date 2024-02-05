import plugin from 'tailwindcss/plugin'
type Plugin = ReturnType<typeof plugin>
// @ts-expect-error untyped source file
import { corePlugins } from 'tailwindcss/lib/corePlugins'
import { CSSRuleObject, PluginAPI, PluginCreator } from 'tailwindcss/types/config'
import { noop, log, LogLevel, mapObject, CSSLength, type RawValue, generateExpr, addVariantWithModifier, parseExpr, unique, coalesce } from './util'
import defaultTheme from 'tailwindcss/defaultTheme'
import { Container } from 'postcss'
import { mapObjectSkip } from 'map-obj'

export type ThemeConfigFluid = Partial<{
    defaultScreens: [string] | [undefined, string] | [string, string],
    defaultContainers: [string] | [undefined, string] | [string, string]
}>

export const fluidCorePlugins = plugin((api: PluginAPI) => {
    const { theme, corePlugins: corePluginEnabled, addVariant, matchVariant, matchUtilities } = api
    const context = getContext(theme)
    const { screens, containers } = context

    // Add fluid versions for enabled core plugins
    const interceptedAPI = interceptUtilities(api, {
        addOriginal: false,
        transform: {
            text() { return null } // skips the entire plugin, essentially
        }
    }, context)
    Object.entries(corePlugins).forEach(([name, _p]) => {
        if (!corePluginEnabled(name)) return
        const p = _p as PluginCreator
        p(interceptedAPI)
    })

    // Add new fluid text utility to handle potentially complex theme values
    // ---

    // The only thing we can really filter out is if the font size itself
    // is in a different unit than the breakpoints
    const fontSizeValues = mapObject(theme('fontSize') ?? {}, (k, v) => {
        const [fontSize] = Array.isArray(v) ? v : [v]
        return parseValue(fontSize, context) ? [k as string, v] : mapObjectSkip
    })
        
    // See note about default modifiers in `interceptUtilities`
    const { DEFAULT, ...fontSizeModifiers } = fontSizeValues
    matchUtilities({
        '~text'(from, { modifier: to }) {
            if (to === null && DEFAULT) to = DEFAULT

            // Normalize inputs
            if (!Array.isArray(from)) from = [from]
            else if (/^(string|number)$/.test(typeof from[1])) from[1] = { lineHeight: from[1]+'' }
            if (!Array.isArray(to)) to = [to]
            else if (/^(string|number)$/.test(typeof to[1])) to[1] = { lineHeight: to[1]+'' }

            const rules: CSSRuleObject = {}

            // Font size
            const parsedFontSizes = parseValues(from[0], to[0], context, LogLevel.WARN)
            if (!parsedFontSizes) return null
            rules['font-size'] = generateExpr(parsedFontSizes[0], context.defaultFromScreen, parsedFontSizes[1], context.defaultToScreen, { checkSC144: true })

            // Line height. Make sure to use double equals to catch nulls and strings <-> numbers
            if (from[1]?.lineHeight == to[1]?.lineHeight) {
                rules['line-height'] = from[1]?.lineHeight
            } else {
                let parsedFromLineHeight = parseValue(from[1]?.lineHeight, context)
                let parsedToLineHeight = parseValue(to[1]?.lineHeight, context)

                // If we get one length and one number, it's probably safe to
                // coerce the number to a length (which handles the higher fontSizes in the default theme)
                if (!parsedFromLineHeight && !isNaN(parseFloat(from[1]?.lineHeight)) && parsedToLineHeight) {
                    parsedFromLineHeight = new CSSLength(parsedFontSizes[0].number*parseFloat(from[1].lineHeight), parsedFontSizes[0].unit)
                } else if (parsedFromLineHeight && !parsedToLineHeight && !isNaN(parseFloat(to[1]?.lineHeight))) {
                    parsedToLineHeight = new CSSLength(parsedFontSizes[1].number*parseFloat(to[1].lineHeight), parsedFontSizes[1].unit)
                }
                if (!parsedFromLineHeight || !parsedToLineHeight) {
                    log.warn('missing-values', [
                        'Attempted to set fluid text with incompatible line heights'
                    ])
                    return null
                }

                rules['line-height'] = generateExpr(parsedFromLineHeight, context.defaultFromScreen, parsedToLineHeight, context.defaultToScreen)
            }

            // Letter spacing. Make sure to use double equals to catch nulls and strings <-> numbers
            if (from[1]?.letterSpacing == to[1]?.letterSpacing) {
                rules['letter-spacing'] = from[1]?.letterSpacing
            } else {
                const parsedLetterSpacing = parseValues(from[1]?.letterSpacing, to[1]?.letterSpacing, context, LogLevel.WARN)
                if (!parsedLetterSpacing) return null
                rules['letter-spacing'] = generateExpr(parsedLetterSpacing[0], context.defaultFromScreen, parsedLetterSpacing[1], context.defaultToScreen)
            }

            // Font weight. Make sure to use double equals to catch nulls and strings <-> numbers
            // Also, conveniently: NaN !== NaN
            if (from[1]?.fontWeight == to[1]?.fontWeight || parseFloat(from[1]?.fontWeight) === parseFloat(to[1]?.fontWeight)) {
                rules['font-weight'] = from[1]?.fontWeight
            } else {
                return null
            }

            return rules
        }
    }, {
        values: fontSizeValues,
        modifiers: fontSizeModifiers,
        supportsNegativeValues: false,
        type: ['absolute-size', 'relative-size', 'length', 'percentage']
    })

    // Screen variants
    // ---

    if (screens?.DEFAULT) {
        log.warn('inaccessible-breakpoint', [
            `Your DEFAULT screen breakpoint must be renamed to be used in fluid variants`
        ])
    }

    Object.entries(screens).forEach(([s1Key, s1]) => {
        // Add `~screen/screen` variants
        Object.entries(screens).forEach(([s2Key, s2]) => {
            if (s2Key === s1Key) return
            // @ts-expect-error undocumented API
            addVariant(`~${s1Key}/${s2Key}`, ({ container }: { container: Container }) =>
                rewriteExprs(container, context, [s1, s2])
            )
        })

        // Add `~screen/[arbitrary]?` variants
        addVariantWithModifier(api, `~${s1Key}`, ({ container, modifier }) =>
            rewriteExprs(container, context, [s1, modifier])
        )

        // Add `~/screen` variants
        // @ts-expect-error undocumented API
        addVariant(`~/${s1Key}`, ({ container }) => 
            rewriteExprs(container, context, [, s1])
        )
    })

    // Add `~/[arbitrary]` variant
    addVariantWithModifier(api, '~', ({ modifier, container }) =>
        rewriteExprs(container, context, [, modifier])
    )

    // Add `~min-[arbitrary]/screen|[arbitrary]` variant
    // @ts-expect-error undocumented API
    matchVariant('~min', (value, { modifier, container }: { modifier: string | null, container: Container }) => 
        rewriteExprs(container, context, [value, modifier])
    )

    // Container variants
    // ---
    if (!containers) return // ensure official container query plugin exists

    if (containers?.DEFAULT) {
        log.warn('inaccessible-breakpoint', [
            `Your DEFAULT container breakpoint must be renamed to be used in fluid variants`
        ])
    }

    Object.entries(containers).forEach(([c1Key, c1]) => {
        // Add `~@container/container` variants
        Object.entries(containers).forEach(([c2Key, c2]) => {
            if (c2Key === c1Key) return
            // @ts-expect-error undocumented API
            addVariant(`~@${c1Key}/${c2Key}`, ({ container }: { container: Container }) =>
                rewriteExprs(container, context, [c1, c2], true)
            )
        })

        // Add `~@container/[arbitrary]?` variants
        addVariantWithModifier(api, `~@${c1Key}`, ({ container, modifier }) =>
            rewriteExprs(container, context, [c1, modifier], true)
        )

        // Add `~@/container` variants
        // @ts-expect-error undocumented API
        addVariant(`~@/${c1Key}`, ({ container }) => 
            rewriteExprs(container, context, [, c1], true)
        )
    })

    // Add ~@[arbitrary]|container/[arbitrary]|container variant
    // @ts-expect-error undocumented API
    matchVariant('~@', (value, { modifier, container }: { modifier: string | null, container: Container }) => (
        rewriteExprs(container, context, [value, modifier], true)
    ), {
        values: {
            ...containers,
            DEFAULT: null // so they can omit it and use fluid.defaultContainers; see log.warn above
        }
    })
})


export type TransformValueFn = (val: any) => RawValue
type InterceptOptions = Partial<{
    addOriginal: boolean
    transform: Record<string, TransformValueFn>
}>

/**
 * Return a modified PluginAPI that intercepts calls to matchUtilities and matchComponents
 * to add fluidized versions of each
 */
function interceptUtilities(api: PluginAPI, {
    addOriginal = true,
    transform
}: InterceptOptions = {}, context: Context): PluginAPI {
    // Make any add* or match* function (i.e. addComponents) a noop if we're not including the original
    const rest = addOriginal ? api : mapObject(api, (a, fn) =>
        [a, a.startsWith('add') || a.startsWith('match') ? noop : fn]
    )

    const matchUtilities: PluginAPI['matchUtilities'] = (utilities, options) => {
        // Add original
        if (addOriginal) api.matchUtilities(utilities, options)
        // Skip ones with types that don't include length or any
        if (options?.type && !options.type.includes('length') && !options.type.includes('any')) return
        
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
                ? transforms.every(t => parseValue(coalesce(t!(v), v), context))
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
                    coalesce((transform?.[util] ?? transform?.DEFAULT)?.(_from), _from),
                    coalesce((transform?.[util] ?? transform?.DEFAULT)?.(_to), _to),
                    context,
                    LogLevel.WARN
                )
                if (!parsed) return null
                const [from, to] = parsed
                
                return origFn(
                    generateExpr(from, context.defaultFromScreen, to, context.defaultToScreen),
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

function parseValue(_val: any, { unit, theme }: Context, level?: LogLevel) {
    if (!_val) return null
    if (typeof _val === 'string') {
        // Test if it's a theme() function
        const [, sign, lookup] = _val.match(/^([+-]?)theme\((.*?)\)$/) ?? []
        if (lookup) {
            _val = sign+theme(lookup)
        }
    }
    const val = CSSLength.parse(_val)
    if (!val) {
        if (level) log.warn('non-lengths', [
            'Fluid utilities can only work with length values'
        ])
        if (level === LogLevel.RISK) throw new Error()
        return null
    }
    if (val.unit !== unit) {
        if (level) log.warn('mismatching-units', [
            `Fluid units must all match`
        ])
        if (level === LogLevel.RISK) throw new Error()
        return null
    }
    return val
}

function parseValues(
    _from: any, _to: any,
    context: Context,
    level?: LogLevel
) {
    if (!_from || !_to) {
        if (level) log.warn('missing-values', [
            'Fluid utilities require two values'
        ])
        if (level === LogLevel.RISK) throw new Error()
        return null
    }
    const from = parseValue(_from, context, level)
    const to = parseValue(_to, context, level)
    if (!from || !to) return null

    if (from.number === to.number) {
        if (level) log.warn('no-change', [
            'Fluid utilities require two distinct values'
        ])
        if (level === LogLevel.RISK) throw new Error()
        return null
    }
    return [from, to] as const
}

class NoChangeBPError extends Error {}
function rewriteExprs(container: Container, context: Context, [_fromBP, _toBP]: [CSSLength | RawValue, CSSLength | RawValue], atContainer?: string | true) {
    try {
        const fromBP = (typeof _fromBP === 'string')
            // It's arbitrary, so parse it
            ? parseValue(_fromBP, context, LogLevel.RISK)
            : _fromBP
        
        let toBP = _toBP
        if (typeof toBP === 'string') {
            // Check if it's [arbitrary] (i.e. from a modifier)
            if (/^\[(.*?)\]$/.test(toBP)) {
                toBP = parseValue(toBP.match(/^\[(.*?)\]$/)?.[1], context, LogLevel.RISK)
            } else {
                toBP = context[atContainer ? 'containers' : 'screens']?.[toBP]
                if (!toBP) return [] // fail if we couldn't find in theme
            }
        }
        
        const defaultFromBP = atContainer ? context.defaultFromContainer! : context.defaultFromScreen
        const defaultToBP = atContainer ? context.defaultToContainer! : context.defaultToScreen
            
        // Walk through each `property: value` and rewrite any fluid expressions
        container.walkDecls((decl) => {
            const parsed = parseExpr(decl.value)
            if (!parsed) return
            const resolvedFromBP = fromBP ?? defaultFromBP
            const resolvedToBP = toBP ?? defaultToBP
            if (resolvedFromBP.number === resolvedToBP.number) {
                throw new NoChangeBPError()
            }

            decl.value = generateExpr(parsed.from, resolvedFromBP, parsed.to, resolvedToBP, { atContainer, checkSC144: parsed.checkSC144 })
        })
    } catch (e) {
        if (e instanceof NoChangeBPError) {
            log.warn('no-change', [
                'Fluid utilities require two distinct values'
            ])
        }
        return [] as const
    }
    return '&'
}

function getContext(theme: PluginAPI['theme']) {
    const fluid: ThemeConfigFluid = theme('fluid') ?? {}

    function getBreakpoints(bpsType: 'container' | 'screen') {
        const bpsKey = bpsType === 'container' ? 'containers' : 'screens'
        const rawBps = theme(bpsKey)
        if (bpsType === 'container' && !rawBps) return [] as const

        // Get all "simple" breakpoints (i.e. just a length, not an object)
        const bps = mapObject(rawBps!, (k, v) => CSSLength.test(v) ? [k as string, CSSLength.parse(v)] : mapObjectSkip) as Record<string, CSSLength>
        const defaultsKey = bpsType === 'container' ? 'defaultContainers' : 'defaultScreens'
        
        let sortedBreakpoints: CSSLength[]
        function resolveDefaultBreakpoint(bpType: 'from' | 'to', rawBp: string | undefined) {    
            if (typeof rawBp === 'string') {
                const parsed = CSSLength.parse(rawBps![rawBp] ?? rawBp)
                if (!parsed) throw new Error(`Invalid value for \`theme.fluid.${defaultsKey}[${bpType === 'from' ? 0 : 1}]\``)
                return parsed
            } else if (rawBp != null) {
                throw new Error(`Invalid value for \`theme.fluid.${defaultsKey}[${bpType === 'from' ? 0 : 1}]\``)
            }
            
            sortedBreakpoints ??= (() => {
                const bpsVals = Object.values(bps)
                if (!bpsVals.length) {
                    throw new Error(`Cannot resolve \`theme.fluid.${defaultsKey}[${bpType === 'from' ? 0 : 1}]\` because there's no simple values in \`theme.${bpsKey}\``)
                }
                // Error if they have different units (can't sort that way)
                if (unique(bpsVals.map(l => l.unit!)) > 1) {
                    throw new Error(`Cannot resolve \`theme.fluid.${defaultsKey}[${bpType === 'from' ? 0 : 1}]\` because \`theme.${bpsKey}\` contains values of different units`)
                }

                return bpsVals.sort((a, b) => a.number - b.number)
            })()
            return sortedBreakpoints[bpType === 'from' ? 0 : sortedBreakpoints.length-1]
        }

        const [defaultFrom, defaultTo] = fluid[defaultsKey] ?? []
        return [bps, resolveDefaultBreakpoint('from', defaultFrom), resolveDefaultBreakpoint('to', defaultTo)] as const
    }

    const [screens, defaultFromScreen, defaultToScreen] = getBreakpoints('screen')
    const [containers, defaultFromContainer, defaultToContainer] = getBreakpoints('container')
    if (unique([defaultFromScreen!.unit, defaultToScreen!.unit]) !== 1 || defaultFromScreen!.unit == null) {
        throw new Error(`All default fluid breakpoints must have the same units`)
    }
    return {
        theme,
        screens: screens!, defaultFromScreen: defaultFromScreen!, defaultToScreen: defaultToScreen!,
        containers, defaultFromContainer, defaultToContainer,
        unit: defaultFromScreen!.unit
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
