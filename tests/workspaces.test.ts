import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { editFile } from '../src/main/tools/code'
import { createFile, createFolder, deleteFile, readFile } from '../src/main/tools/files'
import { commandTimeout, runCommand } from '../src/main/tools/shell'
import type { PrepareResult } from '../src/main/tools/types'
import { inWorkspace } from '../src/main/store/workspaces'
import { TMP, makeFiles, useProfile } from './helpers'

const ready = (r: PrepareResult) => {
  if ('error' in r) throw new Error(r.error)
  return r
}
const signal = new AbortController().signal

beforeEach(() => {
  makeFiles({ 'desk/brand images/IMG.png': 'x', 'desk/mine.txt': 'mine' })
  useProfile(['desk'])
})

describe('long commands', () => {
  it('installs and scaffolds get the full time limit by themselves', () => {
    expect(commandTimeout('npx create-next-app@latest site --yes', undefined)).toBe(300)
    expect(commandTimeout('cd site && npm install', 60)).toBe(300)
    expect(commandTimeout('pip install requests', undefined)).toBe(300)
    expect(commandTimeout('ls -la', undefined)).toBe(60)
    expect(commandTimeout('npm run build', 120)).toBe(120)
  })
})

describe('folders pai created itself', () => {
  it('editing inside them does not ask; the user\'s own files still do', async () => {
    const site = join(TMP, 'desk/site')
    expect(ready(await createFolder.prepare({ path: site })).autoApprove).toBeFalsy() // making it asks once
    await ready(await createFolder.prepare({ path: site })).run(signal)
    expect(inWorkspace(join(site, 'src/page.tsx'))).toBe(true)

    const page = join(site, 'page.tsx')
    await ready(await createFile.prepare({ path: page, content: 'a' })).run(signal)
    const replace = ready(await createFile.prepare({ path: page, content: 'b', overwrite: true }))
    expect(replace.autoApprove).toBe(true)
    expect(replace.alsoNeeds).toBeUndefined()
    expect(ready(await editFile.prepare({ path: page, old_text: 'a', new_text: 'c' })).autoApprove).toBe(true)

    expect(ready(await editFile.prepare({ path: join(TMP, 'desk/mine.txt'), old_text: 'mine', new_text: 'x' })).autoApprove).toBeFalsy()
    expect(ready(await deleteFile.prepare({ path: page })).autoApprove).toBeFalsy() // deletes always ask
    expect(ready(await readFile.prepare({ path: page })).autoApprove).toBe(true) // reading its own project
    expect(ready(await readFile.prepare({ path: join(TMP, 'desk/mine.txt') })).autoApprove).toBeFalsy() // the user's files still ask
  })

  it('a new folder made for a file becomes pai\'s own', async () => {
    await ready(await createFile.prepare({ path: join(TMP, 'desk/newsite/index.html'), content: '<h1>hi</h1>' })).run(signal)
    expect(inWorkspace(join(TMP, 'desk/newsite/style.css'))).toBe(true)
    expect(inWorkspace(join(TMP, 'desk/mine.txt'))).toBe(false)
  })

  it.skipIf(process.platform === 'win32')('folders a command creates (a scaffold) become pai\'s own', async () => {
    await ready(await runCommand.prepare({ command: 'mkdir -p scaffolded/app', cwd: join(TMP, 'desk') })).run(signal)
    expect(inWorkspace(join(TMP, 'desk/scaffolded/app/page.tsx'))).toBe(true)
    expect(inWorkspace(join(TMP, 'desk/brand images/IMG.png'))).toBe(false)
    expect(ready(await runCommand.prepare({ command: 'ls', cwd: join(TMP, 'desk/scaffolded') })).autoApprove).toBe(true)
  })
})
