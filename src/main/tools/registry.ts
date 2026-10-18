/**
 * registry.ts — all tools in one list, filtered by what the profile allows.
 * Add a new tool: write it in its own file, then add it to ALL_TOOLS.
 */
import type { Profile } from '@shared/ipc'
import type { ToolSpec } from '../model'
import { openApp } from './apps'
import { summarizeDocument } from './documents'
import { createFile, createFolder, deleteFile, listFiles, moveFile, organizeFolder, readFile, renameFile } from './files'
import { recallMemory, saveMemory } from './memory'
import { listRemindersTool, setReminder } from './reminders'
import type { Tool } from './types'
import { runCommand } from './shell'
import { webSearch } from './web'

export const ALL_TOOLS: Tool[] = [
  listFiles,
  readFile,
  createFile,
  createFolder,
  moveFile,
  renameFile,
  deleteFile,
  organizeFolder,
  summarizeDocument,
  openApp,
  setReminder,
  listRemindersTool,
  webSearch,
  saveMemory,
  recallMemory,
  runCommand
]

/** Tools whose permission group is switched on. Disabled tools are never even offered to the model. */
export function availableTools(profile: Profile): Tool[] {
  return ALL_TOOLS.filter((t) => profile.permissions[t.permission])
}

export function findTool(name: string): Tool | undefined {
  return ALL_TOOLS.find((t) => t.name === name)
}

export function toSpec(tool: Tool): ToolSpec {
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters: { ...tool.parameters } } }
}
