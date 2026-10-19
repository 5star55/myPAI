import { describe, expect, it } from 'vitest'
import { extractTextToolCalls, findStrayToolCalls } from '../src/main/agent/textToolCalls'
import { needsTools } from '../src/main/agent/router'
import { buildSystemPrompt } from '../src/main/prompt'
import { defaultProfile } from '../src/main/store/profile'

describe('tool calls written as text', () => {
  it('finds the exact case from the bug report', () => {
    const reply = `Since I am not aware of any specific function for getting today's date, I will use the web_search function.\n\n{"name": "web_search", "parameters": {"query": "current date October 18, 2026"}}`
    const { calls, rest } = extractTextToolCalls(reply, ['web_search'])
    expect(calls).toEqual([{ name: 'web_search', arguments: '{"query":"current date October 18, 2026"}' }])
    expect(rest).not.toContain('{')
  })

  it('handles code fences and the "function" shape, and ignores unknown tools and normal JSON', () => {
    expect(extractTextToolCalls('```json\n{"function": {"name": "list_files", "arguments": "{\\"folder\\": \\"~/x\\"}"}}\n```', ['list_files']).calls).toHaveLength(1)
    expect(extractTextToolCalls('{"name": "rm_everything", "parameters": {}}', ['list_files']).calls).toHaveLength(0)
    expect(extractTextToolCalls('Your config: {"theme": "dark"}', ['list_files']).calls).toHaveLength(0)
  })
})

describe('date questions', () => {
  it('are answered by chat, not tools', () => {
    expect(needsTools("what's today's date?")).toBe(false)
    expect(needsTools('what day is it')).toBe(false)
  })

  it('the prompt starts with today\'s date', () => {
    const first = buildSystemPrompt(defaultProfile(), true).split('\n')[0]
    expect(first).toMatch(/^Today is .*\d{4}.*never search/)
  })
})

describe('stray "calls" to things that are not tools', () => {
  it('finds the skill-call JSON from the bug report', () => {
    const { names, rest } = findStrayToolCalls('{"name": "Daily Planner", "parameters": {"function": "plan_day", "name": "Tomisin"}}')
    expect(names).toEqual(['Daily Planner'])
    expect(rest).toBe('')
  })

  it('ignores ordinary JSON', () => {
    expect(findStrayToolCalls('Your settings: {"name": "Tomisin", "theme": "dark"}').names).toEqual([])
  })
})
