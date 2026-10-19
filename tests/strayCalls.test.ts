import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runChat } from '../src/main/agent/loop'
import { stateStore } from '../src/main/store/state'
import { useProfile } from './helpers'

// A model that "calls" the Daily Planner skill as JSON (the bug report), then behaves when told.
const replies: string[] = []
const seen: string[][] = []
vi.mock('../src/main/model', () => ({
  complete: async (req: { messages: { role: string; content: unknown }[] }) => {
    seen.push(req.messages.map((m) => String(m.content ?? '')))
    return { ok: true, value: { text: replies.shift() ?? '', toolCalls: [], model: 'fake' } }
  }
}))

const SKILL_CALL = '{"name": "Daily Planner", "parameters": {"function": "plan_day", "name": "Tomisin"}}'

beforeEach(() => {
  stateStore.set({ enabled: true, quietMode: false })
  useProfile([])
  replies.length = 0
  seen.length = 0
})

describe('model writes a call to a skill as JSON', () => {
  it('is told once, and the real answer is shown instead of JSON', async () => {
    replies.push(SKILL_CALL, "Here's a plan for your day: 9:00 deep work…")
    const r = await runChat([{ role: 'user', content: 'Help me plan my day' }])
    expect(r.ok && r.value.text).toBe("Here's a plan for your day: 9:00 deep work…")
    expect(seen[1].at(-1)).toContain('"Daily Planner" is not a tool')
  })

  it('never shows the JSON, even if the model does it again', async () => {
    replies.push(SKILL_CALL, SKILL_CALL)
    const r = await runChat([{ role: 'user', content: 'Help me plan my day' }])
    expect(r.ok && r.value.text).not.toContain('{')
  })

  it('leaves JSON alone when the user asked for JSON', async () => {
    replies.push(SKILL_CALL)
    const r = await runChat([{ role: 'user', content: 'show me an example tool call json' }])
    expect(r.ok && r.value.text).toBe(SKILL_CALL)
  })
})

describe('"I don\'t have a function for that"', () => {
  it('small talk in a task is answered as chat, without tools', async () => {
    const { isSmallTalk } = await import('../src/main/agent/router')
    expect(isSmallTalk('how are you?')).toBe(true)
    expect(isSmallTalk('thanks!')).toBe(true)
    expect(isSmallTalk('hi, tidy my downloads')).toBe(false)
    expect(isSmallTalk('plan my day')).toBe(false)
  })

  it('a no-tool refusal is asked again as plain chat', async () => {
    const { runAgent } = await import('../src/main/agent/loop')
    replies.push('I do not have a function for personal status, so I am unable to answer this question with the provided functions.', "I'm doing well, thanks for asking!")
    const r = await runAgent([{ role: 'user', content: 'how is your day going so far?' }], new AbortController().signal, { emit: () => {}, forceTools: true })
    expect(r.ok && r.value.text).toBe("I'm doing well, thanks for asking!")
    expect(seen[1][0]).not.toContain('TOOLS:') // second ask had no tools
  })
})
