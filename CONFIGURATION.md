# Configuration Reference

Complete reference for both the npm plugin (`aspnetcore-vite-plugin`) and the NuGet package (`InertiaCore.Vite`).

## npm Plugin — `DotnetVitePluginConfig`

Configured in `vite.config.ts`:

```ts
import dotnetVite from 'aspnetcore-vite-plugin'

export default defineConfig({
    plugins: [
        dotnetVite({
            input: 'resources/js/app.tsx',
            // ... options below
        }),
    ],
})
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `input` | `string \| string[] \| { [name]: string }` | *required* | Entry point(s) to compile. Passed to Rollup's `input`. |
| `publicDirectory` | `string` | `'wwwroot'` | The application's static files directory. Maps to Vite's `build.outDir` prefix. |
| `buildDirectory` | `string` | `'build'` | Subdirectory within `publicDirectory` for compiled assets. |
| `hotFile` | `string` | `'{publicDirectory}/hot'` | Path to the hot file written by the dev server. Read by the .NET server. |
| `ssr` | `string \| string[] \| { [name]: string }` | same as `input` | SSR entry point(s). Used when `build.ssr = true`. |
| `ssrOutputDirectory` | `string` | `'dist/ssr'` | Output directory for SSR bundles. |
| `refresh` | `boolean \| string \| string[] \| RefreshConfig \| RefreshConfig[]` | `false` | File patterns for full-page reload on change. |

### `refresh` Option

When set to `true`, watches these ASP.NET Core patterns:

```
Pages/**/*.cshtml
Views/**/*.cshtml
Components/**/*.razor
```

Custom patterns:

```ts
dotnetVite({
    input: 'resources/js/app.tsx',
    refresh: ['Pages/**/*.cshtml', 'Shared/**/*.razor'],
})
```

Advanced configuration with `RefreshConfig`:

```ts
dotnetVite({
    input: 'resources/js/app.tsx',
    refresh: {
        paths: ['Pages/**/*.cshtml'],
        config: { delay: 500 },
    },
})
```

### What the Plugin Sets in Vite

These Vite options are set automatically (user config takes precedence where noted):

| Vite Option | Value | Overridable |
|---|---|---|
| `base` | `'/{buildDirectory}/'` (build) / `''` (serve) | Yes, via `base` in user config |
| `publicDir` | `false` | Yes |
| `build.outDir` | `'{publicDirectory}/{buildDirectory}'` | Yes |
| `build.manifest` | `'manifest.json'` (client) / `false` (SSR) | Yes |
| `build.ssrManifest` | `false` (client) / `'ssr-manifest.json'` (SSR) | Yes |
| `build.assetsInlineLimit` | `0` | Yes |
| `resolve.alias['@']` | `'/resources/js'` | Yes |
| `server.origin` | Placeholder (replaced at runtime) | Yes |
| `server.cors.origin` | `localhost` + `127.0.0.1` (any port) | Yes |
| `ssr.noExternal` | `['aspnetcore-vite-plugin']` | Merged with user config |

---

## NuGet Package — `ViteOptions`

Configured via `appsettings.json` and/or `Program.cs`:

### `appsettings.json`

```json
{
    "Vite": {
        "ManifestPath": "build/.vite/manifest.json",
        "HotFilePath": "hot",
        "EntryPoints": ["resources/js/app.tsx"],
        "BuildDirectory": "build",
        "ReactRefresh": true
    }
}
```

### `Program.cs`

```csharp
// Uses appsettings.json defaults
builder.Services.AddVite();

// Override programmatically
builder.Services.AddVite(opts =>
{
    opts.ReactRefresh = true;
    opts.EntryPoints = ["resources/js/app.tsx"];
});
```

Programmatic configuration in `AddVite()` takes precedence over `appsettings.json`.

### Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `ManifestPath` | `string` | `"build/.vite/manifest.json"` | Path to the Vite manifest file, relative to `wwwroot`. |
| `HotFilePath` | `string` | `"hot"` | Path to the hot file, relative to `wwwroot`. |
| `EntryPoints` | `string[]` | `["resources/js/app.ts"]` | Default entry points for `<vite-scripts />`. |
| `BuildDirectory` | `string` | `"build"` | Build output subdirectory within `wwwroot`. Prepended to all asset paths. |
| `ReactRefresh` | `bool` | `false` | Inject the React refresh preamble script in dev mode. |

---

## Tag Helper — `<vite-scripts />`

```html
@addTagHelper *, InertiaCore.Vite

<!-- Uses default entry points from ViteOptions.EntryPoints -->
<vite-scripts />

<!-- Override entry points -->
<vite-scripts entryPoints="resources/js/app.tsx,resources/css/app.css" />
```

| Attribute | Type | Default | Description |
|---|---|---|---|
| `entryPoints` | `string[]` | `ViteOptions.EntryPoints` | Entry points to emit. Comma-separated in Razor. |

### Dev Mode Output

```html
<script type="module" src="http://localhost:5173/@vite/client"></script>
<!-- React refresh preamble (if ReactRefresh = true) -->
<script type="module">
import RefreshRuntime from 'http://localhost:5173/@react-refresh'
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>
<script type="module" src="http://localhost:5173/resources/js/app.tsx"></script>
```

### Production Mode Output

```html
<link rel="stylesheet" href="/build/assets/app-def456.css" />
<script type="module" src="/build/assets/app-abc123.js"></script>
```

---

## Cross-Reference: npm Plugin ↔ NuGet Package

The two packages communicate through files on disk. This table shows how options align:

| Concern | npm Plugin (`vite.config.ts`) | NuGet Package (`appsettings.json`) | File on Disk |
|---|---|---|---|
| Build output | `publicDirectory` + `buildDirectory` → `wwwroot/build/` | `BuildDirectory` = `"build"` | `wwwroot/build/assets/*` |
| Manifest | `build.manifest` = `'manifest.json'` | `ManifestPath` = `"build/.vite/manifest.json"` | `wwwroot/build/.vite/manifest.json` |
| Hot file | `hotFile` = `'wwwroot/hot'` | `HotFilePath` = `"hot"` | `wwwroot/hot` |
| Entry points | `input` = `'resources/js/app.tsx'` | `EntryPoints` = `["resources/js/app.tsx"]` | — (must match) |
| SSR output | `ssrOutputDirectory` = `'dist/ssr'` | — (not read by NuGet package) | `dist/ssr/` |

### Important

The `input` in `vite.config.ts` and `EntryPoints` in `appsettings.json` **must match**. The npm plugin tells Vite which files to compile; the NuGet package tells the Tag Helper which entry points to look up in the manifest.

---

## Environment Variables

| Variable | Read By | Description |
|---|---|---|
| `ASSET_URL` | npm plugin | Prefixed to `base` in production builds. Use for CDN URLs. |
| `VITE_*` | Vite | Exposed to client-side code via `import.meta.env`. |
| `ASPNETCORE_ENVIRONMENT` | .NET | When `Development`, the .NET server checks for the hot file. Otherwise, uses the manifest. |
| `ASPNETCORE_URLS` | .NET | Kestrel listen URLs. Not read by the plugin — configure CORS in `vite.config.ts` if needed. |

---

## Service Lifetimes

| Service | Lifetime | Why |
|---|---|---|
| `IViteManifestReader` | Singleton | Manifest is immutable per deployment. Parsed once, cached forever. |
| `IViteDevServerDetector` | Singleton | Hot file is checked with a 2-second TTL cache. |
| `IViteAssetResolver` | Scoped | Per-request facade over the above two services. |
