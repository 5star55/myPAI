/**
 * manager.ts — Ecospace tasks.
 *
 * A task is one job for the assistant ("Organize my Downloads"). Up to
 * MAX_PARALLEL_TASKS run at the same time; the rest wait in a queue. Each
 * task has its own Stop, its own live steps, and is saved in full
 * (<data>/tasks.json) so finished tasks are still there after a restart.
 *
 * Tasks use the same agent loop as the chat, so every safety rule applies:
 * permission dialogs (labelled with the task's name), the folder allowlist,
 * the off switch, and the activity log.
 */
import { MAX_PARALLEL_TASKS, type AgentEvent, type Task, type TaskSource, type TaskStatus } from '@shared/ipc'
import { runAgent } from '../agent/loop'
import { dataFile } from '../paths'
import { JsonStore, isObj, newId } from '../store/jsonStore'
import { isEnabled } from '../store/state'
import { broadcast } from '../windows/common'

const MAX_PROMPT = 4000
const MAX_SAVED = 300
const PUBLISH_EVERY_MS = 120

const ACTIVE: TaskStatus[] = ['queued', 'running', 'needs-you']
const isActive = (t: Task) => ACTIVE.includes(t.status)

function titleFor(prompt: string): string {
  const t = prompt.replace(/\s+/g, ' ').trim()
  return t.length > 70 ? `${t.slice(0, 69)}…` : t
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const store = new JsonStore<Task[]>(
  () => dataFile('tasks.json'),
  () => [],
  (raw) =>
    Array.isArray(raw)
      ? raw.filter(isObj).map((t) => {
          const task = t as unknown as Task
          // A task that was running when the app closed can't continue.
          if (ACTIVE.includes(task.status)) return { ...task, status: 'stopped' as const, error: 'The app was closed while this was running.', live: undefined, partial: undefined }
          return { ...task, steps: Array.isArray(task.steps) ? task.steps : [] }
        })
      : []
)

let tasks: Task[] | null = null
const all = (): Task[] => (tasks ??= store.get())

let saveTimer: NodeJS.Timeout | null = null
function persist(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    // Live-only fields are not worth saving; keep the newest MAX_SAVED.
    store.set(all().slice(0, MAX_SAVED).map(({ partial: _p, live: _l, ...t }) => t))
  }, 400)
}

// ---------------------------------------------------------------------------
// Live updates (throttled, so streaming text doesn't flood the windows)
// ---------------------------------------------------------------------------

const lastSent = new Map<string, number>()
const pendingSend = new Map<string, NodeJS.Timeout>()

function publish(task: Task, urgent = false): void {
  const send = () => {
    pendingSend.delete(task.id)
    lastSent.set(task.id, Date.now())
    broadcast('task:update', { ...task, steps: [...task.steps] })
  }
  const since = Date.now() - (lastSent.get(task.id) ?? 0)
  if (urgent || since >= PUBLISH_EVERY_MS) {
    clearTimeout(pendingSend.get(task.id))
    send()
  } else if (!pendingSend.has(task.id)) {
    pendingSend.set(task.id, setTimeout(send, PUBLISH_EVERY_MS - since))
  }
}

function setStatus(task: Task, status: TaskStatus, extra: Partial<Task> = {}): void {
  Object.assign(task, { status }, extra)
  publish(task, true)
  persist()
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

const controllers = new Map<string, AbortController>()

function pump(): void {
  if (!isEnabled()) return
  const running = all().filter((t) => t.status === 'running' || t.status === 'needs-you').length
  const queued = all().filter((t) => t.status === 'queued').reverse() // oldest first
  for (const task of queued.slice(0, Math.max(0, MAX_PARALLEL_TASKS - running))) void run(task)
}

async function run(task: Task): Promise<void> {
  const controller = new AbortController()
  controllers.set(task.id, controller)
  setStatus(task, 'running', { startedAt: new Date().toISOString(), steps: [], partial: '', error: undefined, result: undefined })

  const emit = (e: AgentEvent) => {
    if (e.kind === 'text') task.partial = (task.partial ?? '') + e.delta
    else if (e.kind === 'text-reset') task.partial = ''
    else if (e.kind === 'tool-start') {
      task.live = { tool: e.tool, target: e.target }
      task.partial = ''
    } else {
      task.live = undefined
      task.steps.push(e.step)
    }
    publish(task, e.kind !== 'text')
  }

  const res = await runAgent([{ role: 'user', content: task.prompt }], controller.signal, {
    emit,
    context: task.title,
    forceTools: true,
    onWaiting: (waiting) => {
      if (task.status === 'running' || task.status === 'needs-you') setStatus(task, waiting ? 'needs-you' : 'running')
    }
  })
  controllers.delete(task.id)

  const finishedAt = new Date().toISOString()
  if (controller.signal.aborted) setStatus(task, 'stopped', { finishedAt, live: undefined, partial: undefined, error: isEnabled() ? 'Stopped.' : 'The assistant was switched off.' })
  else if (res.ok) setStatus(task, 'done', { finishedAt, live: undefined, partial: undefined, result: res.value.text })
  else setStatus(task, 'failed', { finishedAt, live: undefined, partial: undefined, error: res.error })
  pump()
}

// ---------------------------------------------------------------------------
// Public API (called from IPC)
// ---------------------------------------------------------------------------

export function listTasks(): Task[] {
  return all().map((t) => ({ ...t, steps: [...t.steps] }))
}

export function startTask(prompt: unknown, source: unknown): Task {
  if (!isEnabled()) throw new Error('The assistant is switched off. Turn it on with the power button.')
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Describe the task first.')
  const text = prompt.trim().slice(0, MAX_PROMPT)
  const src: TaskSource = source === 'orb' || source === 'voice' ? source : 'ecospace'
  const task: Task = { id: newId(), title: titleFor(text), prompt: text, source: src, status: 'queued', createdAt: new Date().toISOString(), steps: [] }
  all().unshift(task)
  publish(task, true)
  persist()
  pump()
  return { ...task }
}

export function stopTask(id: unknown): void {
  const task = all().find((t) => t.id === id)
  if (!task || !isActive(task)) return
  if (task.status === 'queued') setStatus(task, 'stopped', { finishedAt: new Date().toISOString(), error: 'Cancelled before it started.' })
  else controllers.get(task.id)?.abort()
}

/** Off switch: stop everything that is running or waiting. */
export function stopAllTasks(): void {
  for (const t of all()) if (isActive(t)) stopTask(t.id)
}

export function retryTask(id: unknown): Task {
  const task = all().find((t) => t.id === id)
  if (!task) throw new Error('That task no longer exists.')
  return startTask(task.prompt, task.source)
}

export function deleteTask(id: unknown): void {
  const task = all().find((t) => t.id === id)
  if (!task) return
  if (isActive(task)) throw new Error('Stop the task before deleting it.')
  tasks = all().filter((t) => t.id !== id)
  broadcast('task:removed', { id: task.id })
  persist()
}

export function clearFinishedTasks(): void {
  const gone = all().filter((t) => !isActive(t))
  tasks = all().filter(isActive)
  for (const t of gone) broadcast('task:removed', { id: t.id })
  persist()
}

/** Called when the assistant is switched back on: start anything still queued. */
export function resumeTasks(): void {
  pump()
}
