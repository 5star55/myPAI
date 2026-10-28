/**
 * QuizCard — a ```quiz block from the assistant, as a quiz you click through:
 * one question at a time, instant feedback with the explanation, then your score.
 * "Review my mistakes" sends the results back to the chat so the assistant can teach them.
 */
import { createContext, useContext, useState } from 'react'
import type { Quiz } from '@shared/quiz'

/** Lets a quiz send a message to the chat (not available outside it, e.g. in task cards). */
export const ChatSendContext = createContext<((text: string) => void) | null>(null)

interface Progress {
  picked: (number | null)[]
  at: number
  done: boolean
  sent: boolean
}
/**
 * Answers so far, per quiz. The card is drawn again when the reply finishes streaming
 * (and when you switch tabs), so its state lives here, not only in the component.
 */
const progressByQuiz = new Map<string, Progress>()
const quizKey = (quiz: Quiz) => `${quiz.title}\n${quiz.questions[0].question}`

const LETTERS = 'ABCDEF'

/** `writing`: more questions are still coming (the reply is streaming). */
export function QuizCard({ quiz, writing = false }: { quiz: Quiz; writing?: boolean }) {
  const send = useContext(ChatSendContext)
  const key = quizKey(quiz)
  const [progress, setProgressState] = useState<Progress>(() => progressByQuiz.get(key) ?? { picked: [], at: 0, done: false, sent: false })
  const setProgress = (patch: Partial<Progress>) =>
    setProgressState((p) => {
      const next = { ...p, ...patch }
      progressByQuiz.set(key, next)
      return next
    })
  const { at, done, sent } = progress
  const picked = quiz.questions.map((_, i) => progress.picked[i] ?? null)

  const total = quiz.questions.length
  const score = picked.filter((p, i) => p === quiz.questions[i].answer).length
  const q = quiz.questions[at]
  const choice = picked[at]
  const answered = choice !== null

  function pick(i: number) {
    if (answered) return
    setProgress({ picked: picked.map((v, j) => (j === at ? i : v)) })
  }

  function restart() {
    setProgress({ picked: [], at: 0, done: false, sent: false })
  }

  function review() {
    const missed = quiz.questions
      .map((x, i) => ({ x, i, p: picked[i] }))
      .filter(({ x, p }) => p !== x.answer)
      .map(({ x, i, p }) => `Q${i + 1}: "${x.question}" — I answered "${p === null ? '(nothing)' : x.options[p]}", the answer is "${x.options[x.answer]}"`)
    send?.(
      `My quiz results for "${quiz.title}": ${score}/${total}.\n` +
        (missed.length ? `I got these wrong:\n${missed.join('\n')}\nExplain the ideas behind them simply, then give me a short quiz on just those.` : 'I got everything right. Give me a harder quiz on the same topic.')
    )
    setProgress({ sent: true })
  }

  if (done) {
    const pct = Math.round((score / total) * 100)
    const verdict = pct === 100 ? 'Perfect score!' : pct >= 80 ? 'Great job!' : pct >= 50 ? 'Good effort, keep going.' : 'Worth another look.'
    return (
      <div className="quiz">
        <div className="quiz-head">
          <span className="quiz-title">{quiz.title}</span>
          <span className="quiz-progress">Results</span>
        </div>
        <div className="quiz-score">
          <div className="quiz-score-num">
            {score}
            <span>/{total}</span>
          </div>
          <div className="quiz-score-bar" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="quiz-verdict">
            {verdict} · {pct}%
          </div>
        </div>
        <ol className="quiz-summary">
          {quiz.questions.map((x, i) => {
            const right = picked[i] === x.answer
            return (
              <li key={i} className={right ? 'is-right' : 'is-wrong'}>
                <span className="quiz-mark" aria-label={right ? 'Right' : 'Wrong'}>
                  {right ? '✓' : '✗'}
                </span>
                <span>
                  {x.question}
                  {!right && <span className="quiz-correct"> Answer: {x.options[x.answer]}</span>}
                </span>
              </li>
            )
          })}
        </ol>
        <div className="quiz-actions">
          <button type="button" className="btn-ghost btn-sm" onClick={restart}>
            Try again
          </button>
          {send && (
            <button type="button" className="btn-primary btn-inline btn-sm" onClick={review} disabled={sent}>
              {sent ? 'Sent' : score === total ? 'Give me a harder one' : 'Review my mistakes'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="quiz">
      <div className="quiz-head">
        <span className="quiz-title">{quiz.title}</span>
        <span className="quiz-progress">
          Question {at + 1} of {writing ? `${total}…` : total} · Score {score}
        </span>
      </div>
      <div className="quiz-dots" aria-hidden>
        {quiz.questions.map((x, i) => (
          <i key={i} className={picked[i] === null ? (i === at ? 'is-current' : '') : picked[i] === x.answer ? 'is-right' : 'is-wrong'} />
        ))}
      </div>
      <p className="quiz-question">{q.question}</p>
      <div className="quiz-options" role="group" aria-label="Answers">
        {q.options.map((o, i) => {
          const state = !answered ? '' : i === q.answer ? 'is-right' : i === choice ? 'is-wrong' : 'is-dim'
          return (
            <button key={i} type="button" className={`quiz-option ${state}`} onClick={() => pick(i)} disabled={answered}>
              <span className="quiz-letter">{LETTERS[i]}</span>
              <span>{o}</span>
              {answered && i === q.answer && <span className="quiz-tick">✓</span>}
              {answered && i === choice && i !== q.answer && <span className="quiz-tick">✗</span>}
            </button>
          )
        })}
      </div>
      {answered && (
        <div className={`quiz-feedback ${choice === q.answer ? 'is-right' : 'is-wrong'}`} role="status">
          <strong>{choice === q.answer ? 'Correct!' : `Not quite. The answer is ${LETTERS[q.answer]}.`}</strong>
          {q.explanation && <span> {q.explanation}</span>}
        </div>
      )}
      <div className="quiz-actions">
        {at > 0 && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setProgress({ at: at - 1 })}>
            Back
          </button>
        )}
        <button
          type="button"
          className="btn-primary btn-inline btn-sm"
          onClick={() => setProgress(at + 1 < total ? { at: at + 1 } : { done: true })}
          disabled={!answered || (writing && at + 1 >= total)}
        >
          {at + 1 < total ? 'Next question' : writing ? 'Writing the next question…' : 'See my score'}
        </button>
      </div>
    </div>
  )
}
