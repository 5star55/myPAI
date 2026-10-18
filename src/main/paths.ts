/**
 * paths.ts — where pai keeps its files.
 *
 * User data (profile, memory, log, reminders) lives in Electron's per-user
 * folder, e.g. ~/Library/Application Support/pai on macOS. Never in the repo.
 */
import { join } from 'node:path'
import { app } from 'electron'

export const dataDir = (): string => app.getPath('userData')
export const dataFile = (name: string): string => join(dataDir(), name)

/** Built-in skills ship in the project's skills/ folder. */
export const skillsDir = (): string => join(app.getAppPath(), 'skills')
