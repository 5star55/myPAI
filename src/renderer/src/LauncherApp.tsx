import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

/** The quick launcher: type a question or task, Enter sends it to chat, Esc closes. */
export function LauncherApp() {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    // The main process sends this each time the launcher opens, so the box is ready to type in.
    return window.pai.on('launcher:focus', () => {
      setText('')
      input.current?.focus()
    })
  }, [])

  const close = () => void window.pai.launcherHide()

  async function send() {
    const message = text.trim()
        console.log('[launcher] sending', message)
    if (!message) return
    setText('')
    await window.pai.askInChat(message)
    close()
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void send()
    if (e.key === 'Escape') close()
  }

  return (
    <div className="launcher">
      <input
        ref={input}
        className="launcher-input"
        value={text}
        placeholder="Ask pai, or give it a task…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        aria-label="Ask pai"
      />
    </div>
  )
}