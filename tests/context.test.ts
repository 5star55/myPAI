import { describe, expect, it } from 'vitest'
import type { ChatTurn } from '../src/shared/ipc'
import { fitHistory, pickTools, shrinkToolOutputs, totalTokens } from '../src/main/agent/context'
import type { ChatMessage } from '../src/main/model'
import { isOllama, paiModelName } from '../src/main/ollama'
import { ALL_TOOLS } from '../src/main/tools/registry'

const names = (text: string) => pickTools(ALL_TOOLS, text).map((t) => t.name)

describe('fitting the context window', () => {
  const turn = (role: ChatTurn['role'], n: number): ChatTurn => ({ role, content: 'x'.repeat(n) })

  it('drops the oldest turns first and always keeps the newest message', () => {
    const history = [turn('user', 3200), turn('assistant', 3200), turn('user', 3200), turn('assistant', 3200), turn('user', 100)]
    const kept = fitHistory(history, 2100)
    expect(kept[kept.length - 1]).toBe(history[4])
    expect(kept.length).toBeLessThan(history.length)
    expect(kept[0].role).toBe('user')
  })

  it('keeps everything when it fits', () => {
    const history = [turn('user', 10), turn('assistant', 10), turn('user', 10)]
    expect(fitHistory(history, 1000)).toEqual(history)
  })

  it('keeps a huge last message rather than sending nothing', () => {
    expect(fitHistory([turn('user', 50_000)], 100)).toHaveLength(1)
  })

  it('shortens older tool output, never the newest two', () => {
    const big = 'y'.repeat(8000)
    const messages: ChatMessage[] = [
      { role: 'system', content: 'rules' },
      { role: 'tool', tool_call_id: 'a', content: big },
      { role: 'tool', tool_call_id: 'b', content: big },
      { role: 'tool', tool_call_id: 'c', content: big }
    ]
    shrinkToolOutputs(messages, 6000)
    expect((messages[1].content as string).length).toBeLessThan(1300)
    expect(messages[2].content).toBe(big)
    expect(messages[3].content).toBe(big)
    expect(totalTokens(messages)).toBeLessThan(6000)
  })
})

describe('offering only the relevant tools', () => {
  it('a reminder request gets reminder tools, not file or shell tools', () => {
    const t = names('remind me to call mum at 6')
    expect(t).toContain('set_reminder')
    expect(t).not.toContain('delete_file')
    expect(t).not.toContain('run_command')
  })

  it('file work gets the file tools and run_command', () => {
    const t = names('tidy my Downloads folder')
    expect(t).toEqual(expect.arrayContaining(['list_files', 'organize_folder', 'run_command']))
    expect(t).not.toContain('web_search')
  })

  it('memory tools are always there', () => {
    expect(names('what is the latest news on AI')).toEqual(expect.arrayContaining(['web_search', 'recall_memory', 'save_memory']))
  })

  it('offers everything when nothing matches (unusual wording)', () => {
    expect(names('handle the thing we discussed')).toHaveLength(ALL_TOOLS.length)
  })
})

describe('Ollama context fix', () => {
  it('only applies to a local Ollama server', () => {
    expect(isOllama('http://localhost:11434/v1')).toBe(true)
    expect(isOllama('http://127.0.0.1:11434/v1/')).toBe(true)
    expect(isOllama('https://api.tokenfactory.nebius.com/v1/')).toBe(false)
  })

  it('names the variant after the model', () => {
    expect(paiModelName('llama3.1:8b')).toBe('llama3.1:8b-pai')
    expect(paiModelName('mistral')).toBe('mistral:latest-pai')
  })
})
