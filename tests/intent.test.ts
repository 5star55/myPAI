import { describe, expect, it } from 'vitest'
import { looksLikeChat } from '../src/shared/intent'

describe('Ecospace: chat or task?', () => {
  it('spots questions and small talk', () => {
    for (const t of ['tell me all azure resources', 'what is kubernetes', 'hi', 'how are you', 'why is the sky blue', 'difference between tcp and udp', 'Lagos weather tomorrow?']) {
      expect(looksLikeChat(t), t).toBe(true)
    }
  })

  it('leaves real tasks alone', () => {
    for (const t of ['Tidy my Downloads and tell me what you moved', 'remind me to call mum at 6', 'search the latest iPhone news', 'summarize ~/Documents/report.pdf', 'create a file called notes.txt', '']) {
      expect(looksLikeChat(t), t).toBe(false)
    }
  })
})
