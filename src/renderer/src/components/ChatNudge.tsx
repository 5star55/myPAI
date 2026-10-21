/**
 * ChatNudge — shown when something typed into the Ecospace reads like chat
 * ("what is…", "hi", "tell me about…"). The Ecospace is for jobs pai does in
 * the background; questions get a better answer in the chat.
 */
interface Props {
  onChat(): void
  onTask(): void
  compact?: boolean
}

export function ChatNudge({ onChat, onTask, compact }: Props) {
  return (
    <div className={`chat-nudge ${compact ? 'chat-nudge-compact' : ''}`} role="status">
      <p>This looks like a question. The Ecospace is for tasks pai does for you, so ask it in Chat?</p>
      <div className="chat-nudge-actions">
        <button type="button" className="btn-primary btn-inline btn-sm" onClick={onChat} autoFocus>
          Ask in Chat
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onTask}>
          Run as a task
        </button>
      </div>
    </div>
  )
}
