import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import dotnetVite from '../src'
import { resolvePageComponent } from '../src/inertia-helpers';
import path from 'path';

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs')

    return {
        default: {
            ...actual,
            existsSync: (path: string) => [
                'Pages',
                'Views',
                'Components',
            ].includes(path) || actual.existsSync(path)
        }
    }
})

describe('aspnetcore-vite-plugin', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('handles missing configuration', () => {
        /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
        /* @ts-ignore */
        expect(() => dotnetVite())
            .toThrowError('aspnetcore-vite-plugin: missing configuration.');

        /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
        /* @ts-ignore */
        expect(() => dotnetVite({}))
            .toThrowError('aspnetcore-vite-plugin: missing configuration for "input".');
    })

    it('accepts a single input', () => {
        const plugin = dotnetVite('resources/js/app.ts')[0]

        const config = plugin.config({}, { command: 'build', mode: 'production' })
        expect(config.build.rollupOptions.input).toBe('resources/js/app.ts')

        const ssrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        expect(ssrConfig.build.rollupOptions.input).toBe('resources/js/app.ts')
    })

    it('accepts an array of inputs', () => {
        const plugin = dotnetVite([
            'resources/js/app.ts',
            'resources/js/other.js',
        ])[0]

        const config = plugin.config({}, { command: 'build', mode: 'production' })
        expect(config.build.rollupOptions.input).toEqual(['resources/js/app.ts', 'resources/js/other.js'])

        const ssrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        expect(ssrConfig.build.rollupOptions.input).toEqual(['resources/js/app.ts', 'resources/js/other.js'])
    })

    it('accepts a full configuration', () => {
        const plugin = dotnetVite({
            input: 'resources/js/app.ts',
            publicDirectory: 'other-public',
            buildDirectory: 'other-build',
            ssr: 'resources/js/ssr.ts',
            ssrOutputDirectory: 'other-ssr-output',
        })[0]

        const config = plugin.config({}, { command: 'build', mode: 'production' })
        expect(config.base).toBe('/other-build/')
        expect(config.build.manifest).toBe(true)
        expect(config.build.outDir).toBe('other-public/other-build')
        expect(config.build.rollupOptions.input).toBe('resources/js/app.ts')

        const ssrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        expect(ssrConfig.base).toBe('/other-build/')
        expect(ssrConfig.build.manifest).toBe(false)
        expect(ssrConfig.build.outDir).toBe('other-ssr-output')
        expect(ssrConfig.build.rollupOptions.input).toBe('resources/js/ssr.ts')
    })

    it('accepts a single input within a full configuration', () => {
        const plugin = dotnetVite({
            input: 'resources/js/app.ts',
            ssr: 'resources/js/ssr.ts',
        })[0]

        const config = plugin.config({}, { command: 'build', mode: 'production' })
        expect(config.build.rollupOptions.input).toBe('resources/js/app.ts')

        const ssrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        expect(ssrConfig.build.rollupOptions.input).toBe('resources/js/ssr.ts')
    })

    it('accepts an array of inputs within a full configuration', () => {
        const plugin = dotnetVite({
            input: ['resources/js/app.ts', 'resources/js/other.js'],
            ssr: ['resources/js/ssr.ts', 'resources/js/other.js'],
        })[0]

        const config = plugin.config({}, { command: 'build', mode: 'production' })
        expect(config.build.rollupOptions.input).toEqual(['resources/js/app.ts', 'resources/js/other.js'])

        const ssrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        expect(ssrConfig.build.rollupOptions.input).toEqual(['resources/js/ssr.ts', 'resources/js/other.js'])
    })

    it('accepts an input object within a full configuration', () => {
        const plugin = dotnetVite({
            input: { app: 'resources/js/entrypoint-browser.js' },
            ssr: { ssr: 'resources/js/entrypoint-ssr.js' },
        })[0]

        const config = plugin.config({}, { command: 'build', mode: 'production' })
        expect(config.build.rollupOptions.input).toEqual({ app: 'resources/js/entrypoint-browser.js' })

        const ssrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        expect(ssrConfig.build.rollupOptions.input).toEqual({ ssr: 'resources/js/entrypoint-ssr.js' })
    })

    it('respects the users build.manifest config option', () => {
        const plugin = dotnetVite({
            input: 'resources/js/app.js',
        })[0]

        const userConfig = { build: { manifest: 'my-custom-manifest.json' }}

        const config = plugin.config(userConfig, { command: 'build', mode: 'production' })

        expect(config.build.manifest).toBe('my-custom-manifest.json')
    })

    it('has a default manifest setting', () => {
        const plugin = dotnetVite({
            input: 'resources/js/app.js',
        })[0]

        const userConfig = {}

        const config = plugin.config(userConfig, { command: 'build', mode: 'production' })

        expect(config.build.manifest).toBe(true)
    })

    it('respects users base config option', () => {
        const plugin = dotnetVite({
            input: 'resources/js/app.ts',
        })[0]

        const userConfig = { base: '/foo/' }

        const config = plugin.config(userConfig, { command: 'build', mode: 'production' })

        expect(config.base).toBe('/foo/')
    })

    it('accepts a partial configuration', () => {
        const plugin = dotnetVite({
            input: 'resources/js/app.js',
            ssr: 'resources/js/ssr.js',
        })[0]

        const config = plugin.config({}, { command: 'build', mode: 'production' })
        expect(config.base).toBe('/build/')
        expect(config.build.manifest).toBe(true)
        expect(config.build.outDir).toBe('wwwroot/build')
        expect(config.build.rollupOptions.input).toBe('resources/js/app.js')

        const ssrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        expect(ssrConfig.base).toBe('/build/')
        expect(ssrConfig.build.manifest).toBe(false)
        expect(ssrConfig.build.outDir).toBe('dist/ssr')
        expect(ssrConfig.build.rollupOptions.input).toBe('resources/js/ssr.js')
    })

    it('configures SSR build with correct defaults', () => {
        const plugin = dotnetVite({
            input: 'resources/js/app.js',
            ssr: 'resources/js/ssr.js',
        })[0]

        const config = plugin.config({}, { command: 'build', mode: 'production' })
        expect(config.build.manifest).toBe(true)
        expect(config.build.ssrManifest).toBe(false)

        const ssrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        expect(ssrConfig.build.outDir).toBe('dist/ssr')
        expect(ssrConfig.build.manifest).toBe(false)
        expect(ssrConfig.build.ssrManifest).toBe(true)
        expect(ssrConfig.build.rollupOptions.input).toBe('resources/js/ssr.js')
    })

    it('uses the default entry point when ssr entry point is not provided', () => {
        // This is support users who may want a dedicated Vite config for SSR.
        const plugin = dotnetVite('resources/js/ssr.js')[0]

        const ssrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        expect(ssrConfig.build.rollupOptions.input).toBe('resources/js/ssr.js')
    })

    it('prefixes the base with ASSET_URL in production mode', () => {
        process.env.ASSET_URL = 'http://example.com'
        const plugin = dotnetVite('resources/js/app.js')[0]

        const devConfig = plugin.config({}, { command: 'serve', mode: 'development' })
        expect(devConfig.base).toBe('')

        const prodConfig = plugin.config({}, { command: 'build', mode: 'production' })
        expect(prodConfig.base).toBe('http://example.com/build/')

        delete process.env.ASSET_URL
    })

    it('prevents setting an empty publicDirectory', () => {
        expect(() => dotnetVite({ input: 'resources/js/app.js', publicDirectory: '' })[0])
            .toThrowError('publicDirectory must be a subdirectory');
    })

    it('prevents setting an empty buildDirectory', () => {
        expect(() => dotnetVite({ input: 'resources/js/app.js', buildDirectory: '' })[0])
            .toThrowError('buildDirectory must be a subdirectory');
    })

    it('handles surrounding slashes on directories', () => {
        const plugin = dotnetVite({
            input: 'resources/js/app.js',
            publicDirectory: '/wwwroot/test/',
            buildDirectory: '/build/test/',
            ssrOutputDirectory: '/ssr-output/test/',
        })[0]

        const config = plugin.config({}, { command: 'build', mode: 'production' })
        expect(config.base).toBe('/build/test/')
        expect(config.build.outDir).toBe('wwwroot/test/build/test')

        const ssrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        expect(ssrConfig.build.outDir).toBe('ssr-output/test')
    })

    it('provides an @ alias by default', () => {
        const plugin = dotnetVite('resources/js/app.js')[0]

        const config = plugin.config({}, { command: 'build', mode: 'development' })

        expect(config.resolve.alias['@']).toBe('/resources/js')
    })

    it('respects a users existing @ alias', () => {
        const plugin = dotnetVite('resources/js/app.js')[0]

        const config = plugin.config({
            resolve: {
                alias: {
                    '@': '/somewhere/else'
                }
            }
        }, { command: 'build', mode: 'development' })

        expect(config.resolve.alias['@']).toBe('/somewhere/else')
    })

    it('appends an Alias object when using an alias array', () => {
        const plugin = dotnetVite('resources/js/app.js')[0]

        const config = plugin.config({
            resolve: {
                alias: [
                    { find: '@', replacement: '/something/else' }
                ],
            }
        }, { command: 'build', mode: 'development' })

        expect(config.resolve.alias).toEqual([
            { find: '@', replacement: '/something/else' },
            { find: '@', replacement: '/resources/js' },
        ])
    })

    it('prevents the Inertia helpers from being externalized', () => {
        /* eslint-disable @typescript-eslint/ban-ts-comment */
        const plugin = dotnetVite('resources/js/app.js')[0]

        const noSsrConfig = plugin.config({ build: { ssr: true } }, { command: 'build', mode: 'production' })
        /* @ts-ignore */
        expect(noSsrConfig.ssr.noExternal).toEqual(['aspnetcore-vite-plugin'])

        /* @ts-ignore */
        const nothingExternalConfig = plugin.config({ ssr: { noExternal: true }, build: { ssr: true } }, { command: 'build', mode: 'production' })
        /* @ts-ignore */
        expect(nothingExternalConfig.ssr.noExternal).toBe(true)

        /* @ts-ignore */
        const arrayNoExternalConfig = plugin.config({ ssr: { noExternal: ['foo'] }, build: { ssr: true } }, { command: 'build', mode: 'production' })
        /* @ts-ignore */
        expect(arrayNoExternalConfig.ssr.noExternal).toEqual(['foo', 'aspnetcore-vite-plugin'])

        /* @ts-ignore */
        const stringNoExternalConfig = plugin.config({ ssr: { noExternal: 'foo' }, build: { ssr: true } }, { command: 'build', mode: 'production' })
        /* @ts-ignore */
        expect(stringNoExternalConfig.ssr.noExternal).toEqual(['foo', 'aspnetcore-vite-plugin'])
    })

    it('does not configure full reload when configuration is not an object', () => {
        const plugins = dotnetVite('resources/js/app.js')

        expect(plugins.length).toBe(1)
    })

    it('does not configure full reload when refresh is not present', () => {
        const plugins = dotnetVite({
            input: 'resources/js/app.js',
        })

        expect(plugins.length).toBe(1)
    })

    it('does not configure full reload when refresh is set to undefined', () => {
        const plugins = dotnetVite({
            input: 'resources/js/app.js',
            refresh: undefined,
        })
        expect(plugins.length).toBe(1)
    })

    it('does not configure full reload when refresh is false', () => {
        const plugins = dotnetVite({
            input: 'resources/js/app.js',
            refresh: false,
        })

        expect(plugins.length).toBe(1)
    })

    it('configures full reload with Razor views when refresh is true', () => {
        const plugins = dotnetVite({
            input: 'resources/js/app.js',
            refresh: true,
        })

        expect(plugins.length).toBe(2)
        /** @ts-ignore */
        expect(plugins[1].__dotnet_plugin_config).toEqual({
            paths: [
                'Pages/**/*.cshtml',
                'Views/**/*.cshtml',
                'Components/**/*.razor',
            ],
        })
    })

    it('configures full reload when refresh is a single path', () => {
        const plugins = dotnetVite({
            input: 'resources/js/app.js',
            refresh: 'path/to/watch/**',
        })

        expect(plugins.length).toBe(2)
        /** @ts-ignore */
        expect(plugins[1].__dotnet_plugin_config).toEqual({
            paths: ['path/to/watch/**'],
        })
    })

    it('configures full reload when refresh is an array of paths', () => {
        const plugins = dotnetVite({
            input: 'resources/js/app.js',
            refresh: ['path/to/watch/**', 'another/to/watch/**'],
        })

        expect(plugins.length).toBe(2)
        /** @ts-ignore */
        expect(plugins[1].__dotnet_plugin_config).toEqual({
            paths: ['path/to/watch/**', 'another/to/watch/**'],
        })
    })

    it('configures full reload when refresh is a complete configuration to proxy', () => {
        const plugins = dotnetVite({
            input: 'resources/js/app.js',
            refresh: {
                paths: ['path/to/watch/**', 'another/to/watch/**'],
                config: { delay: 987 }
            },
        })

        expect(plugins.length).toBe(2)
        /** @ts-ignore */
        expect(plugins[1].__dotnet_plugin_config).toEqual({
            paths: ['path/to/watch/**', 'another/to/watch/**'],
            config: { delay: 987 }
        })
    })

    it('configures full reload when refresh is an array of complete configurations to proxy', () => {
        const plugins = dotnetVite({
            input: 'resources/js/app.js',
            refresh: [
                {
                    paths: ['path/to/watch/**'],
                    config: { delay: 987 }
                },
                {
                    paths: ['another/to/watch/**'],
                    config: { delay: 123 }
                },
            ],
        })

        expect(plugins.length).toBe(3)
        /** @ts-ignore */
        expect(plugins[1].__dotnet_plugin_config).toEqual({
            paths: ['path/to/watch/**'],
            config: { delay: 987 }
        })
        /** @ts-ignore */
        expect(plugins[2].__dotnet_plugin_config).toEqual({
            paths: ['another/to/watch/**'],
            config: { delay: 123 }
        })
    })

    it('configures CORS for localhost origins', () => {
        const test = (pattern: RegExp|string, value: string) => pattern instanceof RegExp ? pattern.test(value) : pattern === value

        const plugins = dotnetVite({
            input: 'resources/js/app.js',
        })
        const resolvedConfig = plugins[0].config({ envDir: __dirname }, {
            mode: '',
            command: 'serve'
        })

        // Allowed origins...
        expect([
            'http://localhost',
            'https://localhost',
            'http://localhost:5000',
            'https://localhost:5001',
            'http://localhost:8080',
            'http://127.0.0.1',
            'https://127.0.0.1',
            'http://127.0.0.1:5000',
            'https://127.0.0.1:5001',
        ].every((url) => resolvedConfig.server.cors.origin.some((regex: RegExp|string) => test(regex, url)))).toBe(true)
    })

    it("respects the user's server.cors config", () => {
        const plugins = dotnetVite({
            input: 'resources/js/app.js',
        })
        const resolvedConfig = plugins[0].config({
            envDir: __dirname,
            server: {
                cors: true,
            }
        }, {
            mode: '',
            command: 'serve'
        })

        expect(resolvedConfig.server.cors).toBe(true)
    })
})

describe('inertia-helpers', () => {
    const path = './__data__/dummy.ts'
    it('pass glob value to resolvePageComponent', async () => {
        const file = await resolvePageComponent<{ default: string }>(path, import.meta.glob('./__data__/*.ts'))
        expect(file.default).toBe('Dummy File')
    })

    it('pass eagerly globed value to resolvePageComponent', async () => {
        const file = await resolvePageComponent<{ default: string }>(path, import.meta.glob('./__data__/*.ts', { eager: true }))
        expect(file.default).toBe('Dummy File')
    })

    it('accepts array of paths', async () => {
        const file = await resolvePageComponent<{ default: string }>(['missing-page', path], import.meta.glob('./__data__/*.ts', { eager: true }), path)
        expect(file.default).toBe('Dummy File')
    })

    it('throws an error when a page is not found', async () => {
        const callback = () => resolvePageComponent<{ default: string }>('missing-page', import.meta.glob('./__data__/*.ts'))
        await expect(callback).rejects.toThrowError(new Error('Page not found: missing-page'))
    })

    it('throws an error when a page is not found', async () => {
        const callback = () => resolvePageComponent<{ default: string }>(['missing-page-1', 'missing-page-2'], import.meta.glob('./__data__/*.ts'))
        await expect(callback).rejects.toThrowError(new Error('Page not found: missing-page-1,missing-page-2'))
    })
})
