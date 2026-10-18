import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { openApp } from '../src/main/tools/apps'
import { deleteFile, listFiles, moveFile, organizeFolder, renameFile } from '../src/main/tools/files'
import type { PrepareResult } from '../src/main/tools/types'
import { TMP, makeFiles, useProfile } from './helpers'

let n = 0
let dir = ''
beforeEach(() => {
  dir = `box${++n}`
  makeFiles({ [`${dir}/a.txt`]: 'a', [`${dir}/b.txt`]: 'b', [`${dir}/photo.jpg`]: 'x', [`${dir}/notes.pdf`]: 'p' })
  useProfile([dir])
})

const p = (rel: string) => join(TMP, dir, rel)
const ready = (r: PrepareResult) => {
  if ('error' in r) throw new Error(r.error)
  return r
}

describe('file tools', () => {
  it('list_files lists the folder', async () => {
    const out = await ready(await listFiles.prepare({ folder: join(TMP, dir) })).run()
    expect(out).toContain('a.txt')
    expect(out).toContain('photo.jpg')
  })

  it('prepare() has no side effects', async () => {
    await renameFile.prepare({ path: p('a.txt'), new_name: 'c.txt' })
    expect(existsSync(p('a.txt'))).toBe(true)
  })

  it('rename refuses to overwrite unless asked, and then is destructive', async () => {
    expect('error' in (await renameFile.prepare({ path: p('a.txt'), new_name: 'b.txt' }))).toBe(true)
    const r = ready(await renameFile.prepare({ path: p('a.txt'), new_name: 'b.txt', overwrite: true }))
    expect(r.destructive).toBe(true)
    expect(r.alsoNeeds).toContain('files_delete')
  })

  it('rename rejects names that try to leave the folder', () => {
    expect(() => renameFile.prepare({ path: p('a.txt'), new_name: '../escape.txt' })).toThrow()
  })

  it('move refuses to move a folder into itself', async () => {
    makeFiles({ [`${dir}/inner/x.txt`]: 'x' })
    const r = await moveFile.prepare({ source: p('inner'), destination_folder: p('inner/deeper') })
    expect('error' in r).toBe(true)
  })

  it('delete is destructive, goes to Trash, and never deletes the approved folder itself', async () => {
    expect('error' in (await deleteFile.prepare({ path: join(TMP, dir) }))).toBe(true)
    const r = ready(await deleteFile.prepare({ path: p('a.txt') }))
    expect(r.destructive).toBe(true)
    await r.run()
    expect(existsSync(p('a.txt'))).toBe(false)
    expect(readdirSync(join(TMP, '.trash')).some((f) => f.endsWith('a.txt'))).toBe(true)
  })

  it('organize sorts by type and never overwrites', async () => {
    makeFiles({ [`${dir}/Images/photo.jpg`]: 'already here' })
    const out = await ready(await organizeFolder.prepare({ folder: join(TMP, dir) })).run()
    expect(existsSync(p('Documents/a.txt'))).toBe(true)
    expect(existsSync(p('Documents/notes.pdf'))).toBe(true)
    expect(existsSync(p('photo.jpg'))).toBe(true) // skipped: name taken
    expect(out).toContain('Skipped')
  })

  it('open_app rejects names that look like commands', () => {
    expect('error' in openApp.prepare({ name: 'Calculator; rm -rf ~' })).toBe(true)
    expect('error' in openApp.prepare({ name: '$(whoami)' })).toBe(true)
    expect('error' in openApp.prepare({ name: 'Calculator' })).toBe(false)
  })
})
