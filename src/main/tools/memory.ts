/**
 * memory.ts — save_memory / recall_memory.
 */
import { addMemory, searchMemory } from '../store/memory'
import { broadcast } from '../windows/common'
import { needString, type Tool } from './types'

export const saveMemory: Tool = {
  name: 'save_memory',
  description: 'Save a short, lasting fact about the user (preferences, names, important details) so you remember it in future chats.',
  permission: 'memory',
  parameters: {
    type: 'object',
    properties: { fact: { type: 'string', description: 'The fact, written as a short sentence, e.g. "User prefers tea over coffee."' } },
    required: ['fact']
  },
  prepare(args) {
    const fact = needString(args, 'fact', 500)
    return {
      action: 'Save a memory',
      target: fact,
      run: async () => {
        addMemory(fact)
        broadcast('data:changed', { what: 'memory' })
        return `Saved to memory: ${fact}`
      }
    }
  }
}

export const recallMemory: Tool = {
  name: 'recall_memory',
  description: 'Search saved facts about the user.',
  permission: 'memory',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Keywords to look for' } },
    required: ['query']
  },
  prepare(args) {
    const query = needString(args, 'query', 200)
    return {
      action: 'Search your saved memories',
      target: query,
      run: async () => {
        const found = searchMemory(query)
        return found.length ? found.map((m) => `- ${m.text}`).join('\n') : 'No matching memories.'
      }
    }
  }
}
