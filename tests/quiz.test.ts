import { describe, expect, it } from 'vitest'
import { findStrayToolCalls } from '../src/main/agent/textToolCalls'
import { parseBlocks } from '@shared/markdown'
import { parsePartialQuiz, parseQuiz } from '@shared/quiz'

const reply = `Here's your AZ-900 quiz:

\`\`\`quiz
{"title": "AZ-900", "questions": [
  {"question": "What does PaaS stand for?", "options": ["Platform as a Service", "Private as a Solution"], "answer": 0, "explanation": "PaaS = Platform as a Service."},
  {"question": "Who manages datacenter hardware?", "options": ["The customer", "Microsoft"], "answer": "B"},
  {"question": "Broken", "options": ["only one"], "answer": 0}
]}
\`\`\`
Good luck!`

describe('quiz blocks', () => {
  it('parse into questions (index or letter answers), skipping invalid ones', () => {
    const block = parseBlocks(reply).find((b) => b.type === 'code')
    expect(block).toMatchObject({ type: 'code', lang: 'quiz' })
    const quiz = parseQuiz(block!.type === 'code' ? block!.text : '')
    expect(quiz?.title).toBe('AZ-900')
    expect(quiz?.questions).toHaveLength(2)
    expect(quiz?.questions[1].answer).toBe(1)
  })

  it('are marked open while still streaming', () => {
    const partial = reply.slice(0, reply.indexOf('"Who manages'))
    expect(parseBlocks(partial).at(-1)).toMatchObject({ type: 'code', lang: 'quiz', open: true })
  })

  it('can be answered while still streaming (complete questions only)', () => {
    const src = '{"title": "AZ \\"900\\"", "questions": [{"question": "Q1 {tricky}", "options": ["a", "b"], "answer": 0}, {"question": "Q2", "opt'
    const quiz = parsePartialQuiz(src)
    expect(quiz?.title).toBe('AZ "900"')
    expect(quiz?.questions.map((q) => q.question)).toEqual(['Q1 {tricky}'])
    expect(parsePartialQuiz('{"title": "x", "questions": [{"question": "Q1"')).toBeNull()
  })

  it('reject bad JSON and out-of-range answers', () => {
    expect(parseQuiz('{nope')).toBeNull()
    expect(parseQuiz('{"questions":[{"question":"x","options":["a","b"],"answer":5}]}')).toBeNull()
  })

  it('are not mistaken for stray tool calls', () => {
    expect(findStrayToolCalls(reply).names).toEqual([])
  })

  it('renders --- as a divider', () => {
    expect(parseBlocks('a\n\n---\n\nb').map((b) => b.type)).toEqual(['paragraph', 'divider', 'paragraph'])
  })
})
