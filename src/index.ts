import fs from 'fs'
import { AddressInfo } from 'net'
import { fileURLToPath } from 'url'
import path from 'path'
import colors from 'picocolors'
import { Plugin, loadEnv, UserConfig, ConfigEnv, ResolvedConfig, SSROptions, PluginOption, Rollup, createLogger, defaultAllowedOrigins } from 'vite'
import fullReload, { Config as FullReloadConfig } from 'vite-plugin-full-reload'

export interface DotnetVitePluginConfig {
    /**
     * The path or paths of the entry points to compile.
     */
    input: Rollup.InputOption

    /**
     * The application's public directory.
     *
     * @default 'wwwroot'
     */
    publicDirectory?: string

    /**
     * The public subdirectory where compiled assets should be written.
     *
     * @default 'build'
     */
    buildDirectory?: string

    /**
     * The path to the "hot" file.
     *
     * @default `${publicDirectory}/hot`
     */
    hotFile?: string

    /**
     * The path of the SSR entry point.
     */
    ssr?: Rollup.InputOption

    /**
     * The directory where the SSR bundle should be written.
     *
     * @default 'dist/ssr'
     */
    ssrOutputDirectory?: string

    /**
     * Configuration for performing full page refresh on Razor/cshtml file changes.
     *
     * {@link https://github.com/ElMassimo/vite-plugin-full-reload}
     * @default false
     */
    refresh?: boolean|string|string[]|RefreshConfig|RefreshConfig[]
}

export interface RefreshConfig {
    paths: string[],
    config?: FullReloadConfig,
}

interface DotnetPlugin extends Plugin {
    config: (config: UserConfig, env: ConfigEnv) => UserConfig
}

type DevServerUrl = `${'http'|'https'}://${string}:${number}`

let exitHandlersBound = false

export const refreshPaths = [
    'Pages/**/*.cshtml',
    'Views/**/*.cshtml',
    'Components/**/*.razor',
].filter(p => fs.existsSync(p.split('/')[0]))

const logger = createLogger('info', {
    prefix: '[aspnetcore-vite-plugin]'
})

/**
 * ASP.NET Core plugin for Vite.
 *
 * @param config - A config object or relative path(s) of the scripts to be compiled.
 */
export default function dotnetVite(config: string|string[]|DotnetVitePluginConfig): [DotnetPlugin, ...Plugin[]]  {
    const pluginConfig = resolveDotnetVitePluginConfig(config)

    return [
        resolveDotnetPlugin(pluginConfig),
        ...resolveFullReloadConfig(pluginConfig) as Plugin[],
    ];
}

/**
 * Resolve the ASP.NET Core Vite plugin configuration.
 */
function resolveDotnetPlugin(pluginConfig: Required<DotnetVitePluginConfig>): DotnetPlugin {
    let viteDevServerUrl: DevServerUrl
    let resolvedConfig: ResolvedConfig
    let userConfig: UserConfig

    return {
        name: 'aspnetcore-vite-plugin',
        enforce: 'post',
        config: (config, { command, mode }) => {
            userConfig = config
            const ssr = !! userConfig.build?.ssr
            const env = loadEnv(mode, userConfig.envDir || process.cwd(), '')
            const assetUrl = env.ASSET_URL ?? ''

            return {
                base: userConfig.base ?? (command === 'build' ? resolveBase(pluginConfig, assetUrl) : ''),
                publicDir: userConfig.publicDir ?? false,
                build: resolveBuildConfig(pluginConfig, userConfig, ssr),
                server: resolveServerConfig(userConfig),
                resolve: { alias: resolveAliases(userConfig) },
                ssr: { noExternal: noExternalInertiaHelpers(userConfig) },
            }
        },
        configResolved(config) {
            resolvedConfig = config
        },
        transform(code) {
            if (resolvedConfig.command === 'serve') {
                return code.replace(/__aspnetcore_vite_placeholder__/g, viteDevServerUrl)
            }
        },
        configureServer(server) {
            server.httpServer?.once('listening', () => {
                viteDevServerUrl = resolveListeningServerUrl(server, userConfig)
                writeHotFile(pluginConfig.hotFile, viteDevServerUrl, server.config.base)
                logServerStart(server)
            })

            bindExitHandlers(pluginConfig.hotFile)

            return () => server.middlewares.use((req, res, next) => {
                if (req.url === '/index.html') {
                    res.statusCode = 404
                    res.end(
                        fs.readFileSync(path.join(dirname(), 'dev-server-index.html')).toString()
                    )
                }
                next()
            })
        }
    }
}

/**
 * Resolve the Vite build configuration.
 */
function resolveBuildConfig(pluginConfig: Required<DotnetVitePluginConfig>, userConfig: UserConfig, ssr: boolean) {
    return {
        manifest: userConfig.build?.manifest ?? (ssr ? false : 'manifest.json'),
        ssrManifest: userConfig.build?.ssrManifest ?? (ssr ? 'ssr-manifest.json' : false),
        outDir: userConfig.build?.outDir ?? resolveOutDir(pluginConfig, ssr),
        rollupOptions: {
            input: userConfig.build?.rollupOptions?.input ?? resolveInput(pluginConfig, ssr)
        },
        assetsInlineLimit: userConfig.build?.assetsInlineLimit ?? 0,
    }
}

/**
 * Resolve the Vite server configuration with CORS for localhost.
 */
function resolveServerConfig(userConfig: UserConfig) {
    return {
        origin: userConfig.server?.origin ?? '__aspnetcore_vite_placeholder__',
        cors: userConfig.server?.cors ?? {
            origin: userConfig.server?.origin ?? [
                defaultAllowedOrigins,
                /^https?:\/\/localhost(:\d+)?$/,
                /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
            ],
        },
    }
}

const defaultAliases: Record<string, string> = {
    '@': '/resources/js',
}

/**
 * Resolve the path aliases, merging with user-defined aliases.
 */
function resolveAliases(userConfig: UserConfig) {
    if (Array.isArray(userConfig.resolve?.alias)) {
        return [
            ...userConfig.resolve?.alias ?? [],
            ...Object.keys(defaultAliases).map(alias => ({
                find: alias,
                replacement: defaultAliases[alias]
            }))
        ]
    }

    return {
        ...defaultAliases,
        ...userConfig.resolve?.alias,
    }
}

/**
 * Resolve the dev server URL once the server is listening.
 */
function resolveListeningServerUrl(server: import('vite').ViteDevServer, userConfig: UserConfig): DevServerUrl {
    const address = server.httpServer?.address()

    const isAddressInfo = (x: string|AddressInfo|null|undefined): x is AddressInfo => typeof x === 'object'
    if (isAddressInfo(address)) {
        return userConfig.server?.origin
            ? userConfig.server.origin as DevServerUrl
            : resolveDevServerUrl(address, server.config, userConfig)
    }

    return 'http://localhost:5173' as DevServerUrl
}

/**
 * Write the hot file so the .NET server can discover the Vite dev server.
 */
function writeHotFile(hotFile: string, devServerUrl: DevServerUrl, base: string): void {
    const hotFileParentDirectory = path.dirname(hotFile)

    if (! fs.existsSync(hotFileParentDirectory)) {
        fs.mkdirSync(hotFileParentDirectory, { recursive: true })

        setTimeout(() => {
            logger.info(`Hot file directory created ${colors.dim(fs.realpathSync(hotFileParentDirectory))}`, { clear: true, timestamp: true })
        }, 200)
    }

    fs.writeFileSync(hotFile, `${devServerUrl}${base.replace(/\/$/, '')}`)
}

/**
 * Log the plugin banner on server start.
 */
function logServerStart(server: import('vite').ViteDevServer): void {
    setTimeout(() => {
        server.config.logger.info(`\n  ${colors.blue(`${colors.bold('ASP.NET Core')}`)}  ${colors.dim('plugin')} ${colors.bold(`v${pluginVersion()}`)}`)
        server.config.logger.info('')
    }, 100)
}

/**
 * Bind process exit handlers to clean up the hot file.
 */
function bindExitHandlers(hotFile: string): void {
    if (exitHandlersBound) {
        return
    }

    const clean = () => {
        if (fs.existsSync(hotFile)) {
            fs.rmSync(hotFile)
        }
    }

    process.on('exit', clean)
    process.on('SIGINT', () => process.exit())
    process.on('SIGTERM', () => process.exit())
    process.on('SIGHUP', () => process.exit())

    exitHandlersBound = true
}

/**
 * The version of the ASP.NET Core Vite plugin being run.
 */
function pluginVersion(): string {
    try {
        return JSON.parse(fs.readFileSync(path.join(dirname(), '../package.json')).toString())?.version
    } catch {
        return ''
    }
}

/**
 * Convert the users configuration into a standard structure with defaults.
 */
function resolveDotnetVitePluginConfig(config: string|string[]|DotnetVitePluginConfig): Required<DotnetVitePluginConfig> {
    if (typeof config === 'undefined') {
        throw new Error('aspnetcore-vite-plugin: missing configuration.')
    }

    if (typeof config === 'string' || Array.isArray(config)) {
        config = { input: config, ssr: config }
    }

    if (typeof config.input === 'undefined') {
        throw new Error('aspnetcore-vite-plugin: missing configuration for "input".')
    }

    if (typeof config.publicDirectory === 'string') {
        config.publicDirectory = config.publicDirectory.trim().replace(/^\/+/, '')

        if (config.publicDirectory === '') {
            throw new Error('aspnetcore-vite-plugin: publicDirectory must be a subdirectory. E.g. \'wwwroot\'.')
        }
    }

    if (typeof config.buildDirectory === 'string') {
        config.buildDirectory = config.buildDirectory.trim().replace(/^\/+/, '').replace(/\/+$/, '')

        if (config.buildDirectory === '') {
            throw new Error('aspnetcore-vite-plugin: buildDirectory must be a subdirectory. E.g. \'build\'.')
        }
    }

    if (typeof config.ssrOutputDirectory === 'string') {
        config.ssrOutputDirectory = config.ssrOutputDirectory.trim().replace(/^\/+/, '').replace(/\/+$/, '')
    }

    if (config.refresh === true) {
        config.refresh = [{ paths: refreshPaths }]
    }

    return {
        input: config.input,
        publicDirectory: config.publicDirectory ?? 'wwwroot',
        buildDirectory: config.buildDirectory ?? 'build',
        ssr: config.ssr ?? config.input,
        ssrOutputDirectory: config.ssrOutputDirectory ?? 'dist/ssr',
        refresh: config.refresh ?? false,
        hotFile: config.hotFile ?? path.join((config.publicDirectory ?? 'wwwroot'), 'hot'),
    }
}

/**
 * Resolve the Vite base option from the configuration.
 */
function resolveBase(config: Required<DotnetVitePluginConfig>, assetUrl: string): string {
    return assetUrl + (! assetUrl.endsWith('/') ? '/' : '') + config.buildDirectory + '/'
}

/**
 * Resolve the Vite input path from the configuration.
 */
function resolveInput(config: Required<DotnetVitePluginConfig>, ssr: boolean): Rollup.InputOption|undefined {
    if (ssr) {
        return config.ssr
    }

    return config.input
}

/**
 * Resolve the Vite outDir path from the configuration.
 */
function resolveOutDir(config: Required<DotnetVitePluginConfig>, ssr: boolean): string|undefined {
    if (ssr) {
        return config.ssrOutputDirectory
    }

    return path.join(config.publicDirectory, config.buildDirectory)
}

function resolveFullReloadConfig({ refresh: config }: Required<DotnetVitePluginConfig>): PluginOption[]{
    if (typeof config === 'boolean') {
        return [];
    }

    if (typeof config === 'string') {
        config = [{ paths: [config]}]
    }

    if (! Array.isArray(config)) {
        config = [config]
    }

    if (config.some(c => typeof c === 'string')) {
        config = [{ paths: config }] as RefreshConfig[]
    }

    return (config as RefreshConfig[]).flatMap(c => {
        const plugin = fullReload(c.paths, c.config)

        /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
        /** @ts-ignore */
        plugin.__dotnet_plugin_config = c

        return plugin
    })
}

/**
 * Resolve the dev server URL from the server address and configuration.
 */
function resolveDevServerUrl(address: AddressInfo, config: ResolvedConfig, userConfig: UserConfig): DevServerUrl {
    const configHmrProtocol = typeof config.server.hmr === 'object' ? config.server.hmr.protocol : null
    const clientProtocol = configHmrProtocol ? (configHmrProtocol === 'wss' ? 'https' : 'http') : null
    const serverProtocol = config.server.https ? 'https' : 'http'
    const protocol = clientProtocol ?? serverProtocol

    const configHmrHost = typeof config.server.hmr === 'object' ? config.server.hmr.host : null
    const configHost = typeof config.server.host === 'string' ? config.server.host : null
    const serverAddress = isIpv6(address) ? `[${address.address}]` : address.address
    const host = configHmrHost ?? configHost ?? serverAddress

    const configHmrClientPort = typeof config.server.hmr === 'object' ? config.server.hmr.clientPort : null
    const port = configHmrClientPort ?? address.port

    return `${protocol}://${host}:${port}`
}

function isIpv6(address: AddressInfo): boolean {
    return address.family === 'IPv6'
        // In node >=18.0 <18.4 this was an integer value. This was changed in a minor version.
        // See: https://github.com/nodejs/node/issues/43014
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-next-line
        || address.family === 6;
}

/**
 * Add the Inertia helpers to the list of SSR dependencies that aren't externalized.
 *
 * @see https://vitejs.dev/guide/ssr.html#ssr-externals
 */
function noExternalInertiaHelpers(config: UserConfig): true|Array<string|RegExp> {
    /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
    /* @ts-ignore */
    const userNoExternal = (config.ssr as SSROptions|undefined)?.noExternal
    const pluginNoExternal = ['aspnetcore-vite-plugin']

    if (userNoExternal === true) {
        return true
    }

    if (typeof userNoExternal === 'undefined') {
        return pluginNoExternal
    }

    return [
        ...(Array.isArray(userNoExternal) ? userNoExternal : [userNoExternal]),
        ...pluginNoExternal,
    ]
}

/**
 * The directory of the current file.
 */
function dirname(): string {
    return fileURLToPath(new URL('.', import.meta.url))
}
