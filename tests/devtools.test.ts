import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { validateHistory } from '../src/main/agent/loop'
import { isCapabilityRefusal } from '../src/main/agent/router'
import { pickTools } from '../src/main/agent/context'
import { sanitizeProfile } from '../src/main/store/profile'
import { editFile, findFiles, pathMatcher, searchCode } from '../src/main/tools/code'
import { ALL_TOOLS } from '../src/main/tools/registry'
import { serverOutput, startServer, stopServer } from '../src/main/tools/servers'
import type { PrepareResult } from '../src/main/tools/types'
import { TMP, makeFiles, useProfile } from './helpers'

const ready = (r: PrepareResult) => {
  if ('error' in r) throw new Error(r.error)
  return r
}
const run = async (r: PrepareResult) => {
  const out = await ready(r).run(new AbortController().signal)
  return typeof out === 'string' ? out : out.text
}
const project = join(TMP, 'app')

beforeEach(() => {
  makeFiles({
    'app/package.json': '{ "name": "app" }',
    'app/src/page.tsx': 'export default function Page() {\n  return <h1>Hello</h1>\n}\n',
    'app/src/styles.css': 'h1 { color: red; }\n',
    'app/node_modules/lib/index.js': 'Hello from a dependency',
    'app/.env': 'SECRET=Hello'
  })
  useProfile(['app'])
})

describe('pathMatcher', () => {
  it('matches globs and plain words', () => {
    expect(pathMatcher('*.tsx')('src/page.tsx')).toBe(true)
    expect(pathMatcher('*.tsx')('src/styles.css')).toBe(false)
    expect(pathMatcher('src/**/*.css')('src/a/b/x.css')).toBe(true)
    expect(pathMatcher('src/**/*.css')('src/x.css')).toBe(true)
    expect(pathMatcher('page')('src/Page.tsx')).toBe(true)
  })
})

describe('code tools', () => {
  it('find_files skips dependencies and secrets', async () => {
    const out = await run(await findFiles.prepare({ folder: project }))
    expect(out).toContain('src/page.tsx')
    expect(out).not.toContain('node_modules')
    expect(out).not.toContain('.env')
  })

  it('search_code reports file:line and skips node_modules and .env', async () => {
    const out = await run(await searchCode.prepare({ folder: project, query: 'hello' }))
    expect(out).toContain('src/page.tsx:2:')
    expect(out).not.toContain('dependency')
    expect(out).not.toContain('SECRET')
  })

  it('edit_file replaces exact text once, and refuses missing or ambiguous text', async () => {
    const file = join(project, 'src/page.tsx')
    expect('error' in (await editFile.prepare({ path: file, old_text: 'Goodbye', new_text: 'x' }))).toBe(true)
    expect('error' in (await editFile.prepare({ path: file, old_text: 'e', new_text: 'x' }))).toBe(true)
    await run(await editFile.prepare({ path: file, old_text: '<h1>Hello</h1>', new_text: '<h1>Hi $& there</h1>' }))
    expect(readFileSync(file, 'utf8')).toContain('<h1>Hi $& there</h1>')
  })

  it('coding requests are offered the developer tools', () => {
    const names = pickTools(ALL_TOOLS, 'build me a nextjs website').map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['edit_file', 'start_server', 'open_preview', 'run_command']))
  })
})

describe('dev servers', () => {
  it('starts in the background, finds the local address, and stops', async () => {
    const script = "require('http').createServer((q,s)=>s.end('ok')).listen(0,function(){console.log('  Local: http://localhost:'+this.address().port+'/')})"
    const prepared = ready(await startServer.prepare({ command: `node -e "${script}"`, cwd: project, wait_seconds: 20 }))
    const out = await prepared.run(new AbortController().signal)
    const text = typeof out === 'string' ? out : out.text
    expect(text).toMatch(/running at http:\/\/localhost:\d+/)
    expect(typeof out !== 'string' && out.data?.kind).toBe('preview')
    expect(await run(await serverOutput.prepare({}))).toContain('Local:')
    expect(await run(await stopServer.prepare({}))).toContain('Stopped server')
  }, 30_000)

  it('finds the address of a Python server (buffered output, [::] address)', async () => {
    const prepared = ready(await startServer.prepare({ command: 'python3 -m http.server 0', cwd: project, wait_seconds: 20 }))
    const out = await prepared.run(new AbortController().signal)
    expect(typeof out === 'string' ? out : out.text).toMatch(/running at http:\/\/localhost:\d+/)
    await run(await stopServer.prepare({}))
  }, 30_000)

  it('reports a server that exits right away', async () => {
    const prepared = ready(await startServer.prepare({ command: 'node -e "process.exit(3)"', cwd: project }))
    await expect(prepared.run(new AbortController().signal)).rejects.toThrow(/exit code 3/)
  })
})

describe('pictures and refusals', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo='
  it('accepts pictures on user messages only', () => {
    expect(validateHistory([{ role: 'user', content: '', images: [png] }]).ok).toBe(true)
    expect(validateHistory([{ role: 'user', content: 'hi', images: ['data:text/html;base64,PGI+'] }]).ok).toBe(false)
    expect(validateHistory([{ role: 'user', content: 'hi', images: [png, png, png, png, png] }]).ok).toBe(false)
  })

  it('spots "I can\'t run commands" replies', () => {
    expect(isCapabilityRefusal('I cannot execute commands—only suggest them.')).toBe(true)
    expect(isCapabilityRefusal("but I can't run the development server for you")).toBe(true)
    expect(isCapabilityRefusal('I can run that for you.')).toBe(false)
  })
})

describe('default skills', () => {
  it('turns the quiz skill on once, and keeps it off once switched off', () => {
    const fresh = sanitizeProfile({ enabledSkills: ['daily-planner'] })
    expect(fresh.enabledSkills).toContain('quiz-master')
    const off = sanitizeProfile({ ...fresh, enabledSkills: ['daily-planner'] })
    expect(off.enabledSkills).not.toContain('quiz-master')
  })
})
