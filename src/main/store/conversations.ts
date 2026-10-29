/**
 * conversations.ts — every chat, saved in full on this computer.
 *
 * One JSON file per conversation in <data>/conversations/, holding each
 * message with its time, the steps the assistant took (with their output and
 * web results), and stopped/failed requests. Nothing leaves the computer;
 * chats can be deleted from the history panel.
 *
 * Everything coming from the renderer is validated and size-capped.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHAT_LIMITS, isImageDataUrl, type Conversation, type ConversationMeta, type StoredMessage, type ToolStep, type WebResult } from '@shared/ipc'
import { dataDir } from '../paths'
import { isObj, newId, str } from './jsonStore'

const MAX_MESSAGES = 2000
const MAX_CONTENT = 40_000
const MAX_STEP_OUTPUT = 8_000
const STATUSES = ['ok', 'denied', 'error', 'blocked'] as const

const dir = () => join(dataDir(), 'conversations')
const fileFor = (id: string) => join(dir(), `${id}.json`)
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9-]{6,40}$/.test(id)

// ---------------------------------------------------------------------------
// Validation (never trust what the renderer sends, or what is on disk)
// ---------------------------------------------------------------------------

function cleanWeb(raw: unknown): WebResult[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isObj)
    .slice(0, 10)
    .map((r) => ({ title: str(r.title).slice(0, 200), url: str(r.url).slice(0, 2000), site: str(r.site).slice(0, 200), snippet: str(r.snippet).slice(0, 600) }))
    .filter((r) => /^https?:\/\//.test(r.url))
}

function cleanStep(raw: unknown): ToolStep | null {
  if (!isObj(raw)) return null
  const status = STATUSES.includes(raw.status as never) ? (raw.status as ToolStep['status']) : 'ok'
  const step: ToolStep = {
    tool: str(raw.tool).slice(0, 60),
    target: str(raw.target).slice(0, 2000),
    status,
    summary: str(raw.summary).slice(0, 2000)
  }
  if (typeof raw.output === 'string') step.output = raw.output.slice(0, MAX_STEP_OUTPUT)
  if (raw.auto === true) step.auto = true
  if (isObj(raw.data) && raw.data.kind === 'web') step.data = { kind: 'web', query: str(raw.data.query).slice(0, 300), results: cleanWeb(raw.data.results) }
  if (isObj(raw.data) && raw.data.kind === 'preview' && typeof raw.data.url === 'string') step.data = { kind: 'preview', url: raw.data.url.slice(0, 2000) }
  return step.tool ? step : null
}

export function cleanMessages(raw: unknown): StoredMessage[] {
  if (!Array.isArray(raw)) return []
  const out: StoredMessage[] = []
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!isObj(m) || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue
    const msg: StoredMessage = {
      role: m.role,
      content: m.content.slice(0, MAX_CONTENT),
      at: Number.isNaN(Date.parse(str(m.at))) ? new Date().toISOString() : str(m.at)
    }
    if (Array.isArray(m.steps)) {
      const steps = m.steps.map(cleanStep).filter((s): s is ToolStep => !!s).slice(0, 150)
      if (steps.length) msg.steps = steps
    }
    if (Array.isArray(m.images)) {
      const images = m.images.filter(isImageDataUrl).slice(0, CHAT_LIMITS.maxImages)
      if (images.length) msg.images = images
    }
    if (m.failed === 'stopped' || m.failed === 'error') msg.failed = m.failed
    out.push(msg)
  }
  return out
}

function titleFrom(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content.replace(/\s+/g, ' ').trim() ?? 'New chat'
  return first.length > 60 ? `${first.slice(0, 59)}…` : first || 'New chat'
}

// ---------------------------------------------------------------------------
// Reading / writing
// ---------------------------------------------------------------------------

interface StoredFile extends Conversation {
  /** True once the user renamed it (then the title no longer follows the first message). */
  customTitle?: boolean
}

function read(id: string): StoredFile | null {
  if (!validId(id) || !existsSync(fileFor(id))) return null
  try {
    const raw = JSON.parse(readFileSync(fileFor(id), 'utf8'))
    if (!isObj(raw)) return null
    return {
      id,
      title: str(raw.title, 'New chat').slice(0, 120),
      createdAt: str(raw.createdAt, new Date().toISOString()),
      updatedAt: str(raw.updatedAt, new Date().toISOString()),
      messages: cleanMessages(raw.messages),
      customTitle: raw.customTitle === true
    }
  } catch {
    return null
  }
}

function write(c: StoredFile): void {
  mkdirSync(dir(), { recursive: true })
  const tmp = `${fileFor(c.id)}.tmp`
  writeFileSync(tmp, JSON.stringify(c, null, 2), 'utf8')
  renameSync(tmp, fileFor(c.id)) // atomic: never a half-written chat
}

const meta = (c: StoredFile, match?: string): ConversationMeta => ({
  id: c.id,
  title: c.title,
  updatedAt: c.updatedAt,
  messageCount: c.messages.length,
  ...(match ? { match } : {})
})

export function listConversations(query?: unknown): ConversationMeta[] {
  if (!existsSync(dir())) return []
  const q = typeof query === 'string' ? query.trim().toLowerCase().slice(0, 200) : ''
  const out: ConversationMeta[] = []
  for (const f of readdirSync(dir())) {
    if (!f.endsWith('.json')) continue
    const c = read(f.slice(0, -5))
    if (!c) continue
    if (!q) {
      out.push(meta(c))
      continue
    }
    if (c.title.toLowerCase().includes(q)) {
      out.push(meta(c))
      continue
    }
    const hit = c.messages.find((m) => m.content.toLowerCase().includes(q))
    if (hit) {
      const at = hit.content.toLowerCase().indexOf(q)
      out.push(meta(c, `…${hit.content.slice(Math.max(0, at - 30), at + q.length + 50).replace(/\s+/g, ' ')}…`))
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getConversation(id: unknown): Conversation {
  const c = validId(id) ? read(id) : null
  if (!c) throw new Error('That chat no longer exists.')
  const { customTitle: _c, ...rest } = c
  return rest
}

export function saveConversation(id: unknown, rawMessages: unknown): ConversationMeta {
  const messages = cleanMessages(rawMessages)
  if (messages.length === 0) throw new Error('Nothing to save.')
  const now = new Date().toISOString()
  const existing = validId(id) ? read(id) : null
  const c: StoredFile = existing
    ? { ...existing, messages, updatedAt: now, title: existing.customTitle ? existing.title : titleFrom(messages) }
    : { id: newId(), title: titleFrom(messages), createdAt: now, updatedAt: now, messages }
  write(c)
  return meta(c)
}

export function renameConversation(id: unknown, title: unknown): ConversationMeta {
  const c = validId(id) ? read(id) : null
  if (!c) throw new Error('That chat no longer exists.')
  const t = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
  if (!t) throw new Error('Give the chat a name.')
  const next = { ...c, title: t, customTitle: true }
  write(next)
  return meta(next)
}

export function deleteConversation(id: unknown): void {
  if (validId(id) && existsSync(fileFor(id))) rmSync(fileFor(id))
}
