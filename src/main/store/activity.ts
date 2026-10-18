/**
 * activity.ts — the activity log: every tool request, with its outcome.
 *
 * Stored as JSON Lines (one entry per line) so appending is cheap and a
 * damaged line only loses that one entry. Never logs window titles or
 * clipboard contents.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ActivityEntry, StepStatus } from '@shared/ipc'
import { dataFile } from '../paths'
import { newId } from './jsonStore'

const FILE = () => dataFile('activity.jsonl')
const MAX_RETURNED = 500

export function logActivity(tool: string, target: string, result: StepStatus, detail: string): ActivityEntry {
  const entry: ActivityEntry = {
    id: newId(),
    time: new Date().toISOString(),
    tool,
    target,
    result,
    detail: detail.slice(0, 300)
  }
  try {
    mkdirSync(dirname(FILE()), { recursive: true })
    appendFileSync(FILE(), JSON.stringify(entry) + '\n', 'utf8')
  } catch (err) {
    console.error('[activity] could not write log:', err)
  }
  return entry
}

/** Newest first. */
export function listActivity(): ActivityEntry[] {
  if (!existsSync(FILE())) return []
  const entries: ActivityEntry[] = []
  for (const line of readFileSync(FILE(), 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line) as ActivityEntry)
    } catch {
      /* skip damaged line */
    }
  }
  return entries.slice(-MAX_RETURNED).reverse()
}

export function clearActivity(): void {
  writeFileSync(FILE(), '', 'utf8')
}
