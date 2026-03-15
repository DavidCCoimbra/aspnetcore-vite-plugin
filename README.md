# aspnetcore-vite-plugin

Vite plugin for ASP.NET Core applications. Adapted from [laravel-vite-plugin](https://github.com/laravel/vite-plugin) for .NET conventions.

Pairs with [InertiaCore.Vite](https://github.com/DavidCCoimbra/InertiaCore.Vite) on the server side.

## Prerequisites

- .NET 8+ (or .NET 10 for latest features)
- Node.js 20.19+ or 22.12+
- npm

## Installation

### 1. Install the NuGet package

```bash
dotnet add package InertiaCore.Vite
```

### 2. Install the npm package

```bash
npm install aspnetcore-vite-plugin --save-dev
npm install vite --save-dev
```

## Setup

### 3. Configure `vite.config.ts`

**React**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dotnetVite from 'aspnetcore-vite-plugin'

export default defineConfig({
    plugins: [
        react(),
        dotnetVite({
            input: 'resources/js/app.tsx',
            refresh: true,
        }),
    ],
})
```

**Vue**

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dotnetVite from 'aspnetcore-vite-plugin'

export default defineConfig({
    plugins: [
        vue(),
        dotnetVite({
            input: 'resources/js/app.ts',
            refresh: true,
        }),
    ],
})
```

### 4. Register Vite services in `Program.cs`

```csharp
using InertiaCore.Vite.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddVite();
// For React projects:
// builder.Services.AddVite(opts => opts.ReactRefresh = true);
```

### 5. Add `<vite-scripts />` to `_Layout.cshtml`

```html
@addTagHelper *, InertiaCore.Vite

<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <vite-scripts />
</head>
<body>
    @RenderBody()
</body>
</html>
```

You can also specify entry points directly:

```html
<vite-scripts entryPoints="resources/js/app.tsx" />
```

### 6. Configure `appsettings.json` (optional)

The defaults work out of the box. Override only if needed:

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

### 7. Add npm scripts to `package.json`

```json
{
    "scripts": {
        "dev": "vite",
        "build": "vite build"
    }
}
```

## Development

Run both servers in separate terminals:

```bash
# Terminal 1 — .NET server
dotnet run
# or: dotnet watch

# Terminal 2 — Vite dev server
npm run dev
```

The plugin writes a `wwwroot/hot` file when Vite starts. The .NET server detects this file and serves assets from the Vite dev server with full HMR.

## Production Build

```bash
npm run build
dotnet publish -c Release
```

Vite compiles assets to `wwwroot/build/` with a manifest at `wwwroot/build/.vite/manifest.json`. The .NET server reads the manifest and emits hashed asset URLs.

## Configuration

All paths are configurable via `dotnetVite()`:

```ts
dotnetVite({
    input: ['resources/js/app.tsx', 'resources/css/app.css'],
    publicDirectory: 'wwwroot',      // default
    buildDirectory: 'build',         // default
    hotFile: 'wwwroot/hot',          // default
    ssr: 'resources/js/ssr.tsx',     // SSR entry point
    ssrOutputDirectory: 'dist/ssr',  // default
    refresh: true,                   // watch .cshtml/.razor for full reload
})
```

| Option | Default | Description |
|---|---|---|
| `input` | *required* | Entry point(s) to compile |
| `publicDirectory` | `'wwwroot'` | Static files directory |
| `buildDirectory` | `'build'` | Output subdirectory within public |
| `hotFile` | `'{publicDirectory}/hot'` | Hot file path for dev server discovery |
| `ssr` | same as `input` | SSR entry point |
| `ssrOutputDirectory` | `'dist/ssr'` | SSR bundle output directory |
| `refresh` | `false` | Watch Razor/cshtml files for full-page reload |

When `refresh: true`, these patterns are watched:

- `Pages/**/*.cshtml`
- `Views/**/*.cshtml`
- `Components/**/*.razor`

## Inertia.js Page Resolution

The package re-exports `resolvePageComponent()` for resolving Inertia pages from `import.meta.glob()`:

```ts
import { resolvePageComponent } from 'aspnetcore-vite-plugin/inertia-helpers'

// React
createInertiaApp({
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.tsx`,
            import.meta.glob('./Pages/**/*.tsx'),
        ),
    // ...
})

// Vue
createInertiaApp({
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.vue`,
            import.meta.glob('./Pages/**/*.vue'),
        ),
    // ...
})
```

## SSR Build

For server-side rendering, add a separate build step:

```json
{
    "scripts": {
        "dev": "vite",
        "build": "vite build && vite build --ssr"
    }
}
```

```ts
dotnetVite({
    input: 'resources/js/app.tsx',
    ssr: 'resources/js/ssr.tsx',
})
```

## Orphaned Asset Cleanup

Remove old hashed assets not referenced in the current manifest:

```bash
npx clean-orphaned-assets
npx clean-orphaned-assets --dry-run    # preview without deleting
npx clean-orphaned-assets --ssr        # clean SSR build
```

## License

MIT
