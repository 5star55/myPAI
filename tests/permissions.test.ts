import { beforeEach, describe, expect, it } from 'vitest'
import { denyAllPending, requestPermission } from '../src/main/security/permissions'
import { hasAlways } from '../src/main/store/approvals'
import { stateStore } from '../src/main/store/state'
import { permissionLog, resetPermissionsLog } from './helpers'

const ask = (over: Partial<Parameters<typeof requestPermission>[0]> = {}) => ({
  tool: 'list_files',
  action: 'List',
  target: '/x/folder',
  destructive: false,
  folder: '/x',
  ...over
})

beforeEach(() => {
  denyAllPending() // also clears session approvals
  stateStore.set({ enabled: true, quietMode: false })
  resetPermissionsLog()
})

describe('permission broker', () => {
  it('asks once, then remembers for the session', async () => {
    expect(await requestPermission(ask())).toBe(true)
    expect(await requestPermission(ask())).toBe(true)
    expect(permissionLog).toHaveLength(1)
  })

  it('does not remember a denial as an approval', async () => {
    resetPermissionsLog(() => ({ allow: false }))
    expect(await requestPermission(ask())).toBe(false)
    expect(await requestPermission(ask())).toBe(false)
    expect(permissionLog).toHaveLength(2)
  })

  it('needs two separate confirmations for destructive actions, never remembered', async () => {
    expect(await requestPermission(ask({ tool: 'delete_file', destructive: true }))).toBe(true)
    expect(permissionLog.map((l) => l.stage)).toEqual(['ask', 'confirm'])
    await requestPermission(ask({ tool: 'delete_file', destructive: true }))
    expect(permissionLog).toHaveLength(4)
  })

  it('denies a destructive action if the second confirmation is refused', async () => {
    resetPermissionsLog((req) => ({ allow: req.stage === 'ask' }))
    expect(await requestPermission(ask({ tool: 'delete_file', destructive: true }))).toBe(false)
  })

  it('"always for this folder" is saved', async () => {
    resetPermissionsLog(() => ({ allow: true, always: true }))
    await requestPermission(ask({ tool: 'rename_file', folder: '/always' }))
    expect(hasAlways('rename_file|/always')).toBe(true)
  })

  it('refuses everything without asking when switched off', async () => {
    stateStore.set({ enabled: false, quietMode: false })
    expect(await requestPermission(ask({ tool: 'open_app' }))).toBe(false)
    expect(permissionLog).toHaveLength(0)
  })

  it('an aborted request counts as denied', async () => {
    const c = new AbortController()
    c.abort()
    expect(await requestPermission(ask({ tool: 'web_search' }), c.signal)).toBe(false)
  })
})
