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
  run_command: { doing: 'Running', done: 'Ran' },
  find_files: { doing: 'Looking through the project', done: 'Listed project files' },
  search_code: { doing: 'Searching the code', done: 'Searched the code' },
  edit_file: { doing: 'Editing', done: 'Edited' },
  start_server: { doing: 'Starting the server', done: 'Started' },
  server_output: { doing: 'Reading server output', done: 'Read server output' },
  stop_server: { doing: 'Stopping the server', done: 'Stopped' },
  open_preview: { doing: 'Opening the preview', done: 'Previewed' },
  view_image: { doing: 'Looking at the picture', done: 'Looked at' }
}

/** "searched the web", "ran 3 commands": one phrase per kind of step, for the folded summary. */
const PHRASES: Record<string, [one: string, many: string]> = {
  web_search: ['searched the web', 'searched the web {n} times'],
  run_command: ['ran a command', 'ran {n} commands'],
  read_file: ['read a file', 'read {n} files'],
  summarize_document: ['read a document', 'read {n} documents'],
  create_file: ['created a file', 'created {n} files'],
  edit_file: ['edited a file', 'made {n} edits'],
  list_files: ['listed a folder', 'listed {n} folders'],
  find_files: ['looked through the project', 'looked through the project {n} times'],
  search_code: ['searched the code', 'searched the code {n} times'],
  start_server: ['started a server', 'started {n} servers'],
  server_output: ['checked the server', 'checked the server {n} times'],
  open_preview: ['checked the preview', 'checked the preview {n} times'],
  view_image: ['looked at a picture', 'looked at pictures'],
  save_memory: ['saved to memory', 'saved {n} things to memory'],
  recall_memory: ['checked memory', 'checked memory {n} times']
}

/** "Searched the web, read 2 files" for a finished run (narration notes are left out). */
export function summarizeSteps(steps: { tool: string }[]): string {
  const counts = new Map<string, number>()
  for (const s of steps) if (s.tool !== 'note' && s.tool !== 'user_message') counts.set(s.tool, (counts.get(s.tool) ?? 0) + 1)
  const parts = [...counts].map(([tool, n]) => {
    const [one, many] = PHRASES[tool] ?? [toolLabel(tool, 'done').toLowerCase(), `${toolLabel(tool, 'done').toLowerCase()} ×{n}`]
    return n === 1 ? one : many.replace('{n}', String(n))
  })
  const text = parts.join(', ')
  return text ? text[0].toUpperCase() + text.slice(1) : ''
}

export function toolLabel(tool: string, tense: 'doing' | 'done'): string {
  return LABELS[tool]?.[tense] ?? tool.replace(/_/g, ' ')
}

/** Short version of a target for the row (full text stays in the tooltip). */
export function toolDetail(tool: string, target: string): string {
  if (tool === 'run_command' || tool === 'start_server') return target.replace(/\s+\(in .*\)$/, '')
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
