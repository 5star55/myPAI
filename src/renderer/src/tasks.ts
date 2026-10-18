/**
 * tasks.ts — the Ecospace task list in the UI, kept live by main's updates.
 */
import { useEffect, useState } from 'react'
import type { Task, TaskSource } from '@shared/ipc'
import { usePaiEvent } from './hooks'

export const isActiveTask = (t: Task) => t.status === 'queued' || t.status === 'running' || t.status === 'needs-you'

/** All tasks, newest first, updated live. */
export function useTasks(): Task[] {
  const [tasks, setTasks] = useState<Task[]>([])
  useEffect(() => {
    window.pai.listTasks().then((r) => r.ok && setTasks(r.value))
  }, [])
  usePaiEvent('task:update', (t) =>
    setTasks((list) => {
      const i = list.findIndex((x) => x.id === t.id)
      if (i === -1) return [t, ...list]
      const next = [...list]
      next[i] = t
      return next
    })
  )
  usePaiEvent('task:removed', ({ id }) => setTasks((list) => list.filter((t) => t.id !== id)))
  return tasks
}

/**
 * Start a task and wait for it to finish (used by hands-free voice).
 * Resolves with the answer to speak, or null if it was stopped.
 */
export function runTaskAndWait(prompt: string, source: TaskSource): Promise<string | null> {
  return new Promise((resolve) => {
    let id: string | null = null
    let early: Task | null = null
    const finish = (t: Task) => {
      off()
      if (t.status === 'done') resolve(t.result ?? 'Done.')
      else if (t.status === 'failed') resolve(`Sorry, that didn't work. ${t.error ?? ''}`.trim())
      else resolve(null)
    }
    const off = window.pai.on('task:update', (t) => {
      if (id === null) {
        early = t // an update can arrive before startTask() returns
        return
      }
      if (t.id === id && !isActiveTask(t)) finish(t)
    })
    void window.pai.startTask(prompt, source).then((r) => {
      if (!r.ok) {
        off()
        resolve(`Sorry, I couldn't start that. ${r.error}`)
        return
      }
      id = r.value.id
      const e = early as Task | null
      if (e && e.id === id && !isActiveTask(e)) finish(e)
    })
  })
}

/** "12s", "1:05" */
export function elapsed(fromIso?: string, toIso?: string): string {
  if (!fromIso) return ''
  const s = Math.max(0, Math.floor(((toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso)) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
