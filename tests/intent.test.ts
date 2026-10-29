import { describe, expect, it } from 'vitest'
import { looksLikeChat, needsTools } from '../src/shared/intent'

describe('learning and writing stay in the chat', () => {
  it('gets no tools', () => {
    for (const t of ['teach me python', 'write a python code to list an arrays element', 'explain git rebase', 'how do I make a list in python', 'write me an email to my landlord']) {
      expect(needsTools(t), t).toBe(false)
    }
  })

  it('still gets tools when there is a real job in it', () => {
    for (const t of ['write a script that tidies my Downloads', 'how do I install node, then run it', 'write notes to ~/Documents/n.txt', 'run python3 hello.py']) {
      expect(needsTools(t), t).toBe(true)
    }
  })
})

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
