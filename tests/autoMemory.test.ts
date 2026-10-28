import { describe, expect, it } from 'vitest'
import { applyMemory, mightHoldFact } from '../src/main/agent/autoMemory'
import { isCapabilityRefusal } from '../src/main/agent/router'
import { addMemory, listMemory } from '../src/main/store/memory'
import { needsTools } from '@shared/intent'

describe('automatic memory', () => {
  it('only looks at statements that could hold a lasting fact', () => {
    expect(mightHoldFact('i am 19 by the way')).toBe(true)
    expect(mightHoldFact('my sister is called Ada')).toBe(true)
    expect(mightHoldFact('i want you to store it in your memory i am 19')).toBe(true)
    expect(mightHoldFact('how old am i')).toBe(false)
    expect(mightHoldFact('what is my birthday')).toBe(false)
    expect(mightHoldFact("i'm fine")).toBe(false)
    expect(mightHoldFact('explain photosynthesis')).toBe(false)
    expect(mightHoldFact('Help me plan my day')).toBe(false)
    expect(mightHoldFact('remember that my mum likes roses')).toBe(true)
  })

  it('adds new facts, drops out-of-date ones, and never reports repeats as new', () => {
    const old = addMemory('User is 30 years old.')
    addMemory('User likes tea.')
    const changes = applyMemory({ add: ['User is 19 years old.', 'User likes tea.'], removeIds: [old.id] })
    expect(changes).toEqual({ added: ['User is 19 years old.'], removed: ['User is 30 years old.'] })
    expect(listMemory().map((m) => m.text)).toEqual(['User likes tea.', 'User is 19 years old.'])
  })

  it('treats "store it in your memory" as a job and "I can\'t retain" as a refusal', () => {
    expect(needsTools('i want you to store it in your memory i am 19')).toBe(true)
    expect(isCapabilityRefusal("I'm not able to retain personal information between conversations.")).toBe(true)
  })
})
