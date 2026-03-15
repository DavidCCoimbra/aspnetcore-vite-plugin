# Troubleshooting

Common issues and solutions for the ASP.NET Core + Vite integration.

---

## Hot file not found — assets served from manifest instead of dev server

**Symptom:** Changes don't trigger HMR. The app serves production-built assets even though you're running `npm run dev`.

**Cause:** The .NET server can't find the hot file, so `ViteDevServerDetector.IsRunning()` returns `false` and falls back to manifest resolution.

**Fix:**

1. **Is the Vite dev server actually running?** Run `npm run dev` in a separate terminal and confirm it starts without errors.

2. **Check the hot file exists:**
   ```bash
   cat wwwroot/hot
   # Should output something like: http://localhost:5173
   ```

3. **HotFilePath mismatch.** The npm plugin writes to `{publicDirectory}/hot` (default: `wwwroot/hot`). The .NET package reads from `{wwwroot}/{HotFilePath}` (default: `wwwroot/hot`). If you customized either side, make sure they match:
   ```ts
   // vite.config.ts
   dotnetVite({
       input: 'resources/js/app.tsx',
       hotFile: 'wwwroot/custom-hot',  // ← must match C# side
   })
   ```
   ```json
   // appsettings.json
   {
       "Vite": {
           "HotFilePath": "custom-hot"
       }
   }
   ```

4. **Not in Development environment.** `ViteDevServerDetector` only checks the hot file when `ASPNETCORE_ENVIRONMENT=Development`. Verify your launch profile or environment variable:
   ```bash
   ASPNETCORE_ENVIRONMENT=Development dotnet run
   ```

5. **wwwroot doesn't exist.** The plugin creates the hot file's parent directory, but if `wwwroot` is missing entirely, check your project structure.

---

## Manifest not found

**Symptom:**

```
FileNotFoundException: Vite manifest not found at '/path/to/wwwroot/build/.vite/manifest.json'.
Run 'npm run build' to generate it.
```

**Cause:** The .NET server is in production mode (no hot file) and can't find the compiled manifest.

**Fix:**

1. **Run the build:**
   ```bash
   npm run build
   ```

2. **ManifestPath mismatch.** Vite 5+ writes the manifest to `build/.vite/manifest.json` by default. If you changed `buildDirectory` in the plugin, update the C# side:
   ```json
   {
       "Vite": {
           "ManifestPath": "custom-build/.vite/manifest.json",
           "BuildDirectory": "custom-build"
       }
   }
   ```

3. **publicDirectory mismatch.** If the plugin outputs to a directory other than `wwwroot`, assets won't be in the expected location:
   ```ts
   // This is wrong — output goes to custom-public/build/, but .NET looks in wwwroot/
   dotnetVite({
       input: 'resources/js/app.tsx',
       publicDirectory: 'custom-public',
   })
   ```

---

## Entry point not found in manifest

**Symptom:**

```
FileNotFoundException: Entrypoint 'resources/js/app.tsx' not found in Vite manifest.
Did you run 'npm run build'?
```

**Cause:** The entry point name in `ViteOptions.EntryPoints` (C#) doesn't match what's in the Vite manifest.

**Fix:**

The `input` in `vite.config.ts` and `EntryPoints` in `appsettings.json` must be identical strings:

```ts
// vite.config.ts
dotnetVite({
    input: 'resources/js/app.tsx',  // ← this string
})
```

```json
// appsettings.json
{
    "Vite": {
        "EntryPoints": ["resources/js/app.tsx"]  // ← must match exactly
    }
}
```

---

## CORS errors in browser console

**Symptom:** Browser console shows `Access to fetch at 'http://localhost:5173/...' from origin 'https://localhost:5001' has been blocked by CORS policy`.

**Cause:** The Vite dev server's CORS config doesn't allow your .NET server's origin.

**Fix:**

The plugin allows `localhost` and `127.0.0.1` on any port by default. If you're using a different hostname, add it to the Vite server config:

```ts
// vite.config.ts
export default defineConfig({
    plugins: [dotnetVite({ input: 'resources/js/app.tsx' })],
    server: {
        cors: {
            origin: [
                /^https?:\/\/localhost(:\d+)?$/,
                'https://myapp.local:5001',  // ← your .NET URL
            ],
        },
    },
})
```

---

## Assets return 404 in production

**Symptom:** The page loads but all CSS/JS assets return 404. The HTML contains paths like `/build/assets/app-abc123.js` but the files aren't served.

**Cause:** Static file middleware isn't configured, or the build directory doesn't match.

**Fix:**

1. **Enable static files in `Program.cs`:**
   ```csharp
   var app = builder.Build();
   app.UseStaticFiles();  // ← required
   ```

2. **BuildDirectory mismatch.** The plugin writes to `wwwroot/{buildDirectory}/` and the C# side prepends `BuildDirectory` to manifest paths. If they don't match, asset URLs will be wrong:
   ```ts
   // vite.config.ts
   dotnetVite({
       input: 'resources/js/app.tsx',
       buildDirectory: 'dist',  // ← outputs to wwwroot/dist/
   })
   ```
   ```json
   // appsettings.json
   {
       "Vite": {
           "BuildDirectory": "dist",
           "ManifestPath": "dist/.vite/manifest.json"
       }
   }
   ```

3. **Missing build output.** Verify the files exist:
   ```bash
   ls wwwroot/build/assets/
   ls wwwroot/build/.vite/manifest.json
   ```

---

## React refresh not working

**Symptom:** Component state resets on every edit instead of preserving it (full page reload instead of HMR).

**Cause:** The React refresh preamble script isn't being injected, or it's in the wrong order.

**Fix:**

1. **Enable ReactRefresh on the C# side:**
   ```csharp
   builder.Services.AddVite(opts => opts.ReactRefresh = true);
   ```
   Or in `appsettings.json`:
   ```json
   {
       "Vite": {
           "ReactRefresh": true
       }
   }
   ```

2. **Install the React plugin:**
   ```bash
   npm install @vitejs/plugin-react --save-dev
   ```
   ```ts
   // vite.config.ts
   import react from '@vitejs/plugin-react'

   export default defineConfig({
       plugins: [
           react(),  // ← must be included
           dotnetVite({ input: 'resources/js/app.tsx' }),
       ],
   })
   ```

3. **Check the HTML output.** In dev mode, view source should show three scripts in this order:
   - `/@vite/client` (HMR client)
   - React refresh preamble (contains `__vite_plugin_react_preamble_installed__`)
   - Your entry point (`resources/js/app.tsx`)

   If the preamble is missing, `ReactRefresh` isn't enabled on the C# side.

---

## SSR bundle not found

**Symptom:** SSR rendering fails because it can't locate the server-side bundle.

**Cause:** The SSR build output directory doesn't match where the .NET server looks for it.

**Fix:**

1. **Run the SSR build:**
   ```bash
   npx vite build --ssr
   ```

2. **Check the output directory.** The plugin defaults to `dist/ssr/`. Verify:
   ```bash
   ls dist/ssr/
   ```

3. **Custom ssrOutputDirectory.** If you changed it, make sure the .NET SSR gateway points to the same path:
   ```ts
   dotnetVite({
       input: 'resources/js/app.tsx',
       ssr: 'resources/js/ssr.tsx',
       ssrOutputDirectory: 'custom-ssr',  // ← outputs here
   })
   ```

---

## Dev server is not running (InvalidOperationException)

**Symptom:**

```
InvalidOperationException: Dev server is not running.
```

**Cause:** Code called `ViteDevServerDetector.GetUrl()` without first checking `IsRunning()`. This shouldn't happen if you're using `ViteScriptsTagHelper` — it checks automatically.

**Fix:**

If you're calling the service directly, always check first:

```csharp
if (resolver.IsDevServerRunning())
{
    var url = resolver.GetDevServerUrl();
    // ...
}
```

---

## Stale hot file after crash

**Symptom:** The app tries to connect to the Vite dev server but it's not running. Assets fail to load.

**Cause:** The Vite dev server crashed or was killed without running its exit handler, leaving a stale `wwwroot/hot` file.

**Fix:**

Delete the hot file manually:

```bash
rm wwwroot/hot
```

The plugin registers cleanup handlers for `exit`, `SIGINT`, `SIGTERM`, and `SIGHUP`. A hard kill (`kill -9`) bypasses these handlers, which can leave the file behind.

---

## Failed to parse Vite manifest

**Symptom:**

```
InvalidOperationException: Failed to parse Vite manifest.
```

or a `JsonException` during startup.

**Cause:** The manifest file exists but contains invalid JSON or an unexpected format.

**Fix:**

1. **Rebuild:**
   ```bash
   rm -rf wwwroot/build
   npm run build
   ```

2. **Check the manifest is valid JSON:**
   ```bash
   cat wwwroot/build/.vite/manifest.json | python3 -m json.tool
   ```

3. **Vite version.** The manifest format changed in Vite 5 (moved to `.vite/manifest.json`). Make sure your Vite version matches the plugin's peer dependency (`vite ^7.0.0`).
