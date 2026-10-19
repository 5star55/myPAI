import { describe, expect, it } from 'vitest'
import { joinCompletion, parseCompletions, sanitizeCompose, tailOf } from '@shared/compose'

describe('complete my text: model output', () => {
  it('reads a JSON array and cleans each option to one line', () => {
    const raw = 'Sure!\n["will send it by Friday.", "can call you\\ntomorrow", "1. am on it"]'
    expect(parseCompletions(raw, 'Thanks, I')).toEqual(['will send it by Friday.', 'can call you tomorrow', 'am on it'])
  })

  it('falls back to lines, drops quotes, list markers and repeats', () => {
    const raw = '- "see you then!"\n- see you then!\n2) Let me know.'
    expect(parseCompletions(raw, 'Great,')).toEqual(['see you then!', 'Let me know.'])
  })

  it('removes text the model repeated from before the cursor', () => {
    expect(parseCompletions('["thanks for the update, I will check it today"]', 'Hi Sam, thanks for the update,')).toEqual(['I will check it today'])
  })

  it('keeps at most 3', () => {
    expect(parseCompletions('["a b", "c d", "e f", "g h"]', 'x')).toHaveLength(3)
  })
})

describe('complete my text: inserting', () => {
  it('adds a space between words only when needed', () => {
    expect(joinCompletion('Thanks, I', 'will do it')).toBe(' will do it')
    expect(joinCompletion('Thanks, I ', 'will do it')).toBe('will do it')
    expect(joinCompletion('See you', ', Sam!')).toBe(', Sam!')
    expect(joinCompletion('', 'Hello')).toBe('Hello')
    expect(joinCompletion('(see', 'below)')).toBe(' below)')
  })

  it('shows the last few words as context', () => {
    expect(tailOf('short')).toBe('short')
    expect(tailOf('Hi Sam, thanks for the update on the project. I will')).toBe('…for the update on the project. I will')
  })
})

describe('complete my text: settings', () => {
  it('is off by default with the default apps', () => {
    const s = sanitizeCompose(undefined)
    expect(s.enabled).toBe(false)
    expect(s.allowCloud).toBe(false)
    expect(s.apps.map((a) => a.name)).toContain('Mail')
  })

  it('never allows terminals or password managers, and drops duplicates', () => {
    const s = sanitizeCompose({ enabled: true, apps: [{ id: 'com.apple.Terminal', name: 'Terminal' }, { id: 'com.apple.mail', name: 'Mail' }, { id: 'com.apple.mail', name: 'Mail' }] })
    expect(s.apps).toEqual([{ id: 'com.apple.mail', name: 'Mail' }])
  })
})
