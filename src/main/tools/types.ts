/**
 * types.ts — what a tool looks like.
 *
 * A tool is split into two phases so permission checks cannot be skipped:
 *   prepare(args) -> validates args and the folder allowlist, touches nothing,
 *                    and describes exactly what it WILL do (shown in the dialog).
 *   run()         -> does the work. Only called after the user approved.
 */
import type { PermissionKey } from '@shared/ipc'

/** JSON Schema for the tool's arguments (sent to the model). */
export interface ToolParameters {
  type: 'object'
  properties: Record<string, { type: string; description: string; enum?: string[] }>
  required: string[]
}

export interface PreparedCall {
  /** Human sentence for the dialog, e.g. "Rename a file". */
  action: string
  /** Exact path, app name or query. */
  target: string
  /** Deletes or overwrites: needs a second confirmation. */
  destructive?: boolean
  /** Approved folder that contains the target (path tools). */
  folder?: string
  /** Folders outside the allowlist this call touches (the user gets a special warning). */
  outsideFolders?: string[]
  /** For non-path tools: what a session approval covers (e.g. the app name). */
  rememberScope?: string
  /** Extra permission groups this specific call needs (e.g. overwrite needs files_delete). */
  alsoNeeds?: PermissionKey[]
  run: () => Promise<string>
}

export type PrepareResult = PreparedCall | { error: string }

export interface Tool {
  name: string
  description: string
  parameters: ToolParameters
  permission: PermissionKey
  prepare(args: Record<string, unknown>): Promise<PrepareResult> | PrepareResult
}

/** Thrown inside prepare() for bad arguments; turned into { error }. */
export class ToolInputError extends Error {}

export function needString(args: Record<string, unknown>, key: string, max = 1000): string {
  const v = args[key]
  if (typeof v !== 'string' || !v.trim()) throw new ToolInputError(`Missing "${key}".`)
  if (v.length > max) throw new ToolInputError(`"${key}" is too long.`)
  return v.trim()
}

export function optString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Collect the outside folders from several path checks (no duplicates). */
export function outsideOf(...checks: { outsideFolder: string | null }[]): string[] | undefined {
  const list = [...new Set(checks.map((c) => c.outsideFolder).filter((f): f is string => !!f))]
  return list.length ? list : undefined
}

export function optBool(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true || args[key] === 'true'
}
