/**
 * toolLabels.ts — human words for what a tool is doing / did, and a short
 * detail line (e.g. the command, or just the file name).
 */
const LABELS: Record<string, { doing: string; done: string }> = {
  list_files: { doing: 'Listing files', done: 'Listed files' },
  read_file: { doing: 'Reading', done: 'Read' },
  create_file: { doing: 'Writing', done: 'Created' },
  create_folder: { doing: 'Creating folder', done: 'Created folder' },
  move_file: { doing: 'Moving', done: 'Moved' },
  rename_file: { doing: 'Renaming', done: 'Renamed' },
  delete_file: { doing: 'Moving to Trash', done: 'Moved to Trash' },
  organize_folder: { doing: 'Organizing', done: 'Organized' },
  summarize_document: { doing: 'Reading', done: 'Read & summarized' },
  open_app: { doing: 'Opening', done: 'Opened' },
  set_reminder: { doing: 'Setting a reminder', done: 'Set a reminder' },
  list_reminders: { doing: 'Checking reminders', done: 'Checked reminders' },
  web_search: { doing: 'Searching the web', done: 'Searched the web' },
  save_memory: { doing: 'Remembering', done: 'Saved to memory' },
  recall_memory: { doing: 'Recalling', done: 'Recalled' },
  run_command: { doing: 'Running', done: 'Ran' }
}

export function toolLabel(tool: string, tense: 'doing' | 'done'): string {
  return LABELS[tool]?.[tense] ?? tool.replace(/_/g, ' ')
}

/** Short version of a target for the row (full text stays in the tooltip). */
export function toolDetail(tool: string, target: string): string {
  if (tool === 'run_command') return target.replace(/\s+\(in .*\)$/, '')
  if (tool === 'web_search' || tool === 'save_memory' || tool === 'recall_memory') return `“${target}”`
  // Paths: show ~ instead of the long home folder.
  return target.replace(/^\/Users\/[^/]+|^\/home\/[^/]+|^C:\\Users\\[^\\]+/, '~')
}

/** Whimsical "working" words for the status line while the model thinks. */
export const THINKING_WORDS = [
  'Thinking',
  'Pondering',
  'Working',
  'Reasoning',
  'Mulling it over',
  'Figuring it out',
  'Crafting',
  'Untangling',
  'Considering',
  'Connecting the dots'
]
