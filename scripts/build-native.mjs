// Builds pai's small native helper (macOS only): native/axhelper -> native/bin/pai-axhelper.
// It powers "Complete my text" in other apps. Skipped quietly elsewhere or without Xcode tools;
// pai still runs, only that feature is unavailable.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'native/axhelper/main.swift')
const out = join(root, 'native/bin/pai-axhelper')

if (process.platform !== 'darwin') process.exit(0)
if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) process.exit(0)

try {
  mkdirSync(dirname(out), { recursive: true })
  execFileSync('swiftc', ['-O', src, '-o', out], { stdio: 'inherit' })
  console.log('[native] built native/bin/pai-axhelper')
} catch {
  console.warn('[native] could not build the text helper (install Xcode command line tools: xcode-select --install). "Complete my text" will be unavailable.')
}
