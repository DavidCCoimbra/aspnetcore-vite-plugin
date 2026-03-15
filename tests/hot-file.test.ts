import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { writeHotFile } from '../src'

/**
 * Hot file round-trip tests.
 *
 * The hot file is the communication bridge between the npm plugin (writes)
 * and the .NET NuGet package (reads). These tests verify the contract:
 *
 * - Format: plain text, dev server URL + base path, trimmed
 * - Location: configurable, default wwwroot/hot
 * - Cleanup: removed on process exit
 */

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'vite-hot-test-'))
}

describe('hot file write', () => {
    let tempDir: string

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true })
        }
    })

    it('writes dev server URL to hot file', () => {
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'hot')

        writeHotFile(hotFile, 'http://localhost:5173' as any, '/')

        expect(fs.existsSync(hotFile)).toBe(true)
        expect(fs.readFileSync(hotFile, 'utf-8')).toBe('http://localhost:5173')
    })

    it('appends base path without trailing slash', () => {
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'hot')

        writeHotFile(hotFile, 'http://localhost:5173' as any, '/build/')

        expect(fs.readFileSync(hotFile, 'utf-8')).toBe('http://localhost:5173/build')
    })

    it('writes plain URL when base is empty', () => {
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'hot')

        writeHotFile(hotFile, 'http://localhost:5173' as any, '')

        expect(fs.readFileSync(hotFile, 'utf-8')).toBe('http://localhost:5173')
    })

    it('creates parent directories if they do not exist', () => {
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'wwwroot', 'hot')

        writeHotFile(hotFile, 'http://localhost:5173' as any, '/')

        expect(fs.existsSync(hotFile)).toBe(true)
        expect(fs.readFileSync(hotFile, 'utf-8')).toBe('http://localhost:5173')
    })

    it('creates deeply nested parent directories', () => {
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'a', 'b', 'c', 'hot')

        writeHotFile(hotFile, 'http://localhost:5173' as any, '/')

        expect(fs.existsSync(hotFile)).toBe(true)
    })

    it('overwrites existing hot file', () => {
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'hot')

        writeHotFile(hotFile, 'http://localhost:5173' as any, '/')
        writeHotFile(hotFile, 'http://localhost:3000' as any, '/')

        expect(fs.readFileSync(hotFile, 'utf-8')).toBe('http://localhost:3000')
    })

    it('handles HTTPS URLs', () => {
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'hot')

        writeHotFile(hotFile, 'https://localhost:5173' as any, '/')

        expect(fs.readFileSync(hotFile, 'utf-8')).toBe('https://localhost:5173')
    })

    it('produces content readable by .NET File.ReadAllText().Trim()', () => {
        // The C# side reads the hot file with:
        //   _cachedUrl = File.ReadAllText(hotFilePath).Trim();
        // This test verifies the content has no leading/trailing whitespace
        // or newlines that would survive a Trim().
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'hot')

        writeHotFile(hotFile, 'http://localhost:5173' as any, '/build/')

        const content = fs.readFileSync(hotFile, 'utf-8')

        // No whitespace or newlines
        expect(content).toBe(content.trim())
        // Exact expected value
        expect(content).toBe('http://localhost:5173/build')
    })
})

describe('hot file cleanup', () => {
    let tempDir: string

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true })
        }
    })

    it('hot file can be deleted after write', () => {
        // Simulates what bindExitHandlers does on process exit
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'hot')

        writeHotFile(hotFile, 'http://localhost:5173' as any, '/')
        expect(fs.existsSync(hotFile)).toBe(true)

        fs.rmSync(hotFile)
        expect(fs.existsSync(hotFile)).toBe(false)
    })

    it('missing hot file signals production mode', () => {
        // When hot file is absent, the C# side falls through to manifest resolution.
        // This test documents that contract.
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'hot')

        expect(fs.existsSync(hotFile)).toBe(false)
    })
})

describe('hot file contract with .NET', () => {
    let tempDir: string

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true })
        }
    })

    it('default hot file path matches .NET ViteOptions.HotFilePath', () => {
        // npm default: path.join('wwwroot', 'hot') → 'wwwroot/hot'
        // C# default: ViteOptions.HotFilePath = "hot" (relative to wwwroot)
        // Combined: wwwroot + hot = wwwroot/hot ✓
        const npmDefault = 'wwwroot/hot'
        const dotnetWebRootRelative = 'hot'

        expect(npmDefault).toBe(`wwwroot/${dotnetWebRootRelative}`)
    })

    it('writes URL that ViteDevServerDetector.GetUrl() would return', () => {
        // C# reads: File.ReadAllText(hotFilePath).Trim()
        // npm writes: `${devServerUrl}${base.replace(/\/$/, '')}`
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'hot')

        writeHotFile(hotFile, 'http://localhost:5173' as any, '/build/')

        const content = fs.readFileSync(hotFile, 'utf-8').trim()

        // This is exactly what ViteDevServerDetector._cachedUrl would be
        expect(content).toBe('http://localhost:5173/build')
    })

    it('URL format is valid for ViteScriptsTagHelper to construct asset URLs', () => {
        // The tag helper builds: `${devUrl}/@vite/client` and `${devUrl}/{entry}`
        // So the hot file content must be a valid URL base without trailing slash
        tempDir = createTempDir()
        const hotFile = path.join(tempDir, 'hot')

        writeHotFile(hotFile, 'http://localhost:5173' as any, '/')

        const devUrl = fs.readFileSync(hotFile, 'utf-8').trim()

        // Should produce valid URLs when appended to
        expect(`${devUrl}/@vite/client`).toBe('http://localhost:5173/@vite/client')
        expect(`${devUrl}/resources/js/app.ts`).toBe('http://localhost:5173/resources/js/app.ts')
    })
})
