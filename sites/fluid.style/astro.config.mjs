import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";
import svelte from "@astrojs/svelte";
import mdx from "@astrojs/mdx";
import expressiveCode, { ExpressiveCodeTheme } from "astro-expressive-code";
import { readFileSync } from 'node:fs'
import sectionize from 'remark-sectionize'
import { rehypeHeadingIds } from '@astrojs/markdown-remark';
import { visit } from "unist-util-visit"
import flatMap from 'unist-util-flatmap'

/** @type {import('astro-expressive-code').AstroExpressiveCodeOptions} */
const codeOptions = {
  theme: ExpressiveCodeTheme.fromJSONString(readFileSync('./vstheme.json', 'utf8')),
  styleOverrides: {
    uiFontSize: '0.75rem',
    uiFontFamily: 'Inter var',
    codeFontFamily: 'Fira Code VF',
    codeFontSize: '0.875rem',
    codePaddingBlock: '1.25rem',
    borderRadius: '0.75rem'
  },
  useThemedScrollbars: false,
  frames: {
    extractFileNameFromCode: false,
    styleOverrides: {
      terminalBackground: '#1e293b',
      terminalTitlebarDotsForeground: '#475569',
      terminalTitlebarBorderBottom: '#64748b4d',
      terminalTitlebarBackground: '#1e293b',
      inlineButtonBorder: '#494f66',
      inlineButtonForeground: '#94a3b8',
      tooltipSuccessBackground: '#0ea5e9',
      tooltipSuccessForeground: '#fff',
      inlineButtonHoverOrFocusBackground: '#33415580',
      editorBackground: '#1e293b',
      editorActiveTabForeground: '#7dd3fc',
      editorActiveTabBackground: '#1e293b',
      editorActiveTabBorder: '#64748b4d',
      editorTabBarBorderBottom: '#64748b4d',
      editorActiveTabBorderBottom: '#7dd3fc',
      editorTabBarBackground: '#33415580',
      editorTabBorderRadius: '0',
      frameBoxShadowCssValue: "0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a"
    }
  },
  textMarkers: {
    styleOverrides: {
      // lineMarkerAccentWidth: '0.25rem',
      markBackground: '#7dd3fc26',
      markBorderColor: '#38bdf8',
      insBackground: '#2dd4bf26',
      insDiffIndicatorColor: '#2dd4bf',
      insBorderColor: '#2dd4bf',
      delBackground: '#f43f5e26',
      delBorderColor: '#fb7185',
      delDiffIndicatorColor: '#fb7185'
    }
  }
};

/**
 * @template T
 * @template U
 * @param {Array<T>} arr
 * @param {U} x
 */
const interleave = (arr, x) => arr.flatMap(e => [e, x]).slice(0, -1)

// https://astro.build/config
export default defineConfig({
  srcDir: '.',
  outDir: '.astro/dist',
  markdown: {
    remarkPlugins: [sectionize],
    rehypePlugins: [
      rehypeHeadingIds, // include first so we can access them: https://docs.astro.build/en/guides/markdown-content/#heading-ids
      () => (tree, file) => {
        // Add span with ID inside headings, so it can be positioned separately (for scrolling reasons)
        visit(tree, 'element', node => {
          if (/^h[2-6]$/.test(node.tagName) && node.properties?.id) {
            const id = node.properties.id
            delete node.properties.id
            node.children.unshift({
              type: 'element',
              tagName: 'span',
              properties: {
                'data-anchor': '',
                id
              },
              children: []
            })
          }
        })
      }
    ]
  },
  integrations: [
    tailwind({
      applyBaseStyles: false
    }),
    svelte(),
    expressiveCode(codeOptions),
    mdx()
  ]
});