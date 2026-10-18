import { describe, expect, it } from 'vitest'
import { isGoodbye, matchWake, parseYesNo } from '../src/shared/voiceText'

describe('wake word: "Hey <name>"', () => {
  it('matches "hey <name>" and returns the command after it', () => {
    expect(matchWake('Hey Nova, remind me to stretch', 'Nova')).toBe('remind me to stretch')
    expect(matchWake('Hey Nova.', 'Nova')).toBe('')
    expect(matchWake('Oh hey Nova what time is it', 'Nova')).toBe('what time is it')
    expect(matchWake('Hey Nova Star open notes', 'Nova Star')).toBe('open notes') // two-word names
  })

  it('follows the name given in setup', () => {
    expect(matchWake('Hey Jarvis, open Safari', 'Jarvis')).toBe('open safari')
    expect(matchWake('Hey Nova, open Safari', 'Jarvis')).toBeNull()
  })

  it('forgives common mishearings', () => {
    expect(matchWake('Hey Pie, list my files', 'pai')).toBe('list my files')
    expect(matchWake('Hay pi what is the weather', 'pai')).toBe('what is the weather')
    expect(matchWake('Hey Novah open notes', 'Nova')).toBe('open notes')
  })

  it('does not wake on normal speech', () => {
    expect(matchWake('I love pie recipes', 'pai')).toBeNull()
    expect(matchWake('pie is great', 'pai')).toBeNull()
    expect(matchWake('Nova what time is it', 'Nova')).toBeNull() // must start with "Hey"
    expect(matchWake('Hey Siri', 'Nova')).toBeNull()
    expect(matchWake('Hey, can you pass the salt', 'Nova')).toBeNull()
    expect(matchWake('the supernova exploded', 'Nova')).toBeNull()
    expect(matchWake('', 'Nova')).toBeNull()
  })
})

describe('yes / no', () => {
  it('understands answers', () => {
    expect(parseYesNo('Yes please.')).toBe('yes')
    expect(parseYesNo('Yeah go ahead')).toBe('yes')
    expect(parseYesNo("No, don't")).toBe('no')
    expect(parseYesNo('Cancel that')).toBe('no')
    expect(parseYesNo('hmm maybe')).toBeNull()
  })

  it('detects goodbyes', () => {
    expect(isGoodbye('Thank you!')).toBe(true)
    expect(isGoodbye("that's all")).toBe(true)
    expect(isGoodbye('what about tomorrow')).toBe(false)
  })
})
