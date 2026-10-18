import { describe, expect, it } from 'vitest'
import { deleteConversation, getConversation, listConversations, renameConversation, saveConversation } from '../src/main/store/conversations'

const msgs = (n = 1) =>
  Array.from({ length: n }, (_, i) => [
    { role: 'user', content: `question ${i} about tea`, at: new Date().toISOString() },
    {
      role: 'assistant',
      content: `answer ${i}`,
      at: new Date().toISOString(),
      steps: [
        { tool: 'run_command', target: 'ls', status: 'ok', summary: 'exit 0', output: 'a.txt\nb.txt', auto: true },
        { tool: 'web_search', target: 'tea', status: 'ok', summary: 'ok', data: { kind: 'web', query: 'tea', results: [{ title: 'Tea', url: 'https://tea.example', site: 'tea.example', snippet: 'hot' }] } }
      ]
    }
  ]).flat()

describe('saved conversations', () => {
  it('saves every detail and reads it back', () => {
    const meta = saveConversation(null, msgs())
    const c = getConversation(meta.id)
    expect(c.title).toBe('question 0 about tea')
    expect(c.messages).toHaveLength(2)
    expect(c.messages[1].steps?.[0]).toMatchObject({ tool: 'run_command', output: 'a.txt\nb.txt', auto: true })
    expect(c.messages[1].steps?.[1].data).toMatchObject({ kind: 'web', results: [{ title: 'Tea' }] })
  })

  it('updates the same chat, lists newest first, and searches inside messages', async () => {
    const a = saveConversation(null, msgs())
    await new Promise((r) => setTimeout(r, 5))
    const b = saveConversation(null, [{ role: 'user', content: 'coffee plans', at: new Date().toISOString() }])
    saveConversation(a.id, msgs(2)) // update a, now newest
    const list = listConversations()
    expect(list[0].id).toBe(a.id)
    expect(list.find((x) => x.id === a.id)?.messageCount).toBe(4)
    expect(listConversations('coffee').map((x) => x.id)).toEqual([b.id])
    expect(listConversations('answer 1')[0].match).toContain('answer 1')
  })

  it('keeps a custom name after more messages', () => {
    const c = saveConversation(null, msgs())
    renameConversation(c.id, 'Tea research')
    saveConversation(c.id, msgs(3))
    expect(getConversation(c.id).title).toBe('Tea research')
  })

  it('deletes', () => {
    const c = saveConversation(null, msgs())
    deleteConversation(c.id)
    expect(() => getConversation(c.id)).toThrow()
  })

  it('validates junk and path tricks', () => {
    const c = saveConversation(null, [{ role: 'system', content: 'x' }, { role: 'user', content: 'ok', steps: [{ tool: 'web_search', data: { kind: 'web', results: [{ url: 'javascript:alert(1)' }] } }] }, 42])
    const saved = getConversation(c.id)
    expect(saved.messages).toHaveLength(1)
    expect(saved.messages[0].steps?.[0].data).toMatchObject({ results: [] })
    expect(() => getConversation('../../profile')).toThrow()
    expect(() => saveConversation(null, [])).toThrow()
  })
})
