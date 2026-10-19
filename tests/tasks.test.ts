import { beforeEach, describe, expect, it } from 'vitest'
import type { Task } from '@shared/ipc'
import { denyAllPending } from '../src/main/security/permissions'
import { profileStore } from '../src/main/store/profile'
import { stateStore } from '../src/main/store/state'
import { clearFinishedTasks, listTasks, startTask, stopAllTasks, stopTask } from '../src/main/tasks/manager'
import { makeFiles, permissionLog, resetPermissionsLog, useProfile } from './helpers'

const byId = (id: string): Task => listTasks().find((t) => t.id === id)!
const waitUntil = async (fn: () => boolean, ms = 8000) => {
  const end = Date.now() + ms
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

beforeEach(() => {
  denyAllPending()
  stopAllTasks()
  clearFinishedTasks()
  stateStore.set({ enabled: true, quietMode: false })
  makeFiles({ 'work/a.txt': 'a' })
  useProfile(['work'])
  profileStore.update((p) => ({ ...p, commandMode: 'auto' }))
  resetPermissionsLog()
})

describe('Ecospace tasks', () => {
  it('runs a task to completion with its steps and result', async () => {
    const t = startTask('run ls', 'ecospace')
    expect(['queued', 'running']).toContain(t.status) // starts at once when a slot is free
    await waitUntil(() => byId(t.id).status === 'done')
    const done = byId(t.id)
    expect(done.steps[0]).toMatchObject({ tool: 'run_command', status: 'ok' })
    expect(done.result).toBeTruthy()
    expect(done.finishedAt).toBeTruthy()
  })

  it('runs up to 3 at once and queues the rest', async () => {
    const ids = [1, 2, 3, 4].map((i) => startTask(`run sleep 1; echo ${i}`, 'ecospace').id)
    await waitUntil(() => ids.slice(0, 3).every((id) => byId(id).status === 'running'))
    expect(byId(ids[3]).status).toBe('queued')
    await waitUntil(() => ids.every((id) => byId(id).status === 'done'), 15000)
  })

  it('shows "needs you" while a permission dialog is open', async () => {
    profileStore.update((p) => ({ ...p, commandMode: 'ask' }))
    let seen: string | undefined
    const t = startTask('run ls', 'orb')
    resetPermissionsLog(() => {
      seen = byId(t.id).status
      return { allow: true }
    })
    await waitUntil(() => byId(t.id).status === 'done')
    expect(seen).toBe('needs-you')
    expect(permissionLog).toHaveLength(1)
  })

  it('Stop ends one task; the off switch stops all of them', async () => {
    const a = startTask('run sleep 20', 'ecospace')
    const b = startTask('run sleep 20', 'ecospace')
    await waitUntil(() => byId(a.id).status === 'running' && byId(b.id).status === 'running')
    stopTask(a.id)
    await waitUntil(() => byId(a.id).status === 'stopped')
    expect(byId(b.id).status).toBe('running')
    stateStore.set({ enabled: false, quietMode: false })
    stopAllTasks()
    await waitUntil(() => byId(b.id).status === 'stopped')
    expect(() => startTask('anything', 'ecospace')).toThrow(/switched off/)
  })

  it('a queued task can be cancelled before it starts', async () => {
    const ids = [1, 2, 3, 4].map(() => startTask('run sleep 3', 'ecospace').id)
    await waitUntil(() => byId(ids[3]).status === 'queued')
    stopTask(ids[3])
    expect(byId(ids[3])).toMatchObject({ status: 'stopped', error: expect.stringMatching(/before it started/) })
    stopAllTasks()
  })

  it('rejects empty tasks', () => {
    expect(() => startTask('   ', 'ecospace')).toThrow()
  })
})

describe('replying to a finished task', () => {
  it('continues the task with the whole conversation, keeping earlier steps', async () => {
    const { startTask, replyToTask, listTasks } = await import('../src/main/tasks/manager')
    const first = startTask('remember that I like green tea', 'ecospace')
    await waitUntil(() => listTasks().find((t) => t.id === first.id)?.status === 'done')
    const stepsBefore = listTasks().find((t) => t.id === first.id)!.steps.length

    replyToTask(first.id, 'what do you remember about tea')
    await waitUntil(() => listTasks().find((t) => t.id === first.id)?.status === 'done')
    const after = listTasks().find((t) => t.id === first.id)!
    expect(after.turns?.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(after.turns?.[2].content).toBe('what do you remember about tea')
    expect(after.steps.length).toBeGreaterThan(stepsBefore)
  })

  it('refuses a reply while the task is still running, or an empty one', async () => {
    const { startTask, replyToTask } = await import('../src/main/tasks/manager')
    const t = startTask('list my reminders', 'ecospace')
    expect(() => replyToTask(t.id, 'hi')).toThrow(/finish/)
    expect(() => replyToTask('nope', 'hi')).toThrow()
  })
})
