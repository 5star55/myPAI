// Builds pai's small native text helper, which powers "Complete my text" in other apps:
//   macOS    native/axhelper  -> native/bin/pai-axhelper        (needs Xcode command line tools)
//   Windows  native/winhelper -> native/bin/pai-winhelper.exe   (needs the .NET SDK)
// Skipped quietly elsewhere or without the tools; pai still runs, only that feature is unavailable.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** True when out exists and is newer than every source file. */
const upToDate = (out, sources) => existsSync(out) && sources.every((s) => statSync(out).mtimeMs >= statSync(s).mtimeMs)

if (process.platform === 'darwin') {
  const src = join(root, 'native/axhelper/main.swift')
  const out = join(root, 'native/bin/pai-axhelper')
  if (upToDate(out, [src])) process.exit(0)
  try {
    mkdirSync(dirname(out), { recursive: true })
    execFileSync('swiftc', ['-O', src, '-o', out], { stdio: 'inherit' })
    console.log('[native] built native/bin/pai-axhelper')
  } catch {
    console.warn('[native] could not build the text helper (install Xcode command line tools: xcode-select --install). "Complete my text" will be unavailable.')
  }
} else if (process.platform === 'win32') {
  const dir = join(root, 'native/winhelper')
  const out = join(root, 'native/bin/pai-winhelper.exe')
  if (upToDate(out, [join(dir, 'program.cs'), join(dir, 'winhelper.csproj')])) process.exit(0)
  const rid = process.arch === 'arm64' ? 'win-arm64' : 'win-x64'
  try {
    execFileSync('dotnet', ['publish', dir, '-c', 'Release', '-r', rid, '--self-contained', 'false', '-o', join(root, 'native/bin')], { stdio: 'inherit' })
    console.log('[native] built native/bin/pai-winhelper.exe')
  } catch {
    console.warn('[native] could not build the text helper (install the .NET 10 SDK: https://dotnet.microsoft.com/download). "Complete my text" will be unavailable.')
  }
}
