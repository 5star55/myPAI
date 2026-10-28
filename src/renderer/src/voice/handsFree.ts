/**
 * handsFree.ts — talk to pai without opening the window.
 *
 *   Hotkey (⌘⇧Space) or "Hey <name>"  ->  chime, listen (live words on the orb)
 *   ->  review: the heard text waits on the orb, editable, until you press
 *       Send / Edit (open in chat) / Cancel  ->  send as a chat message
 *   ->  speak the reply  ->  listen for a follow-up
 *
 * The conversation ends after a few quiet seconds, on "thanks"/"bye", or when
 * the hotkey is pressed again. Everything also appears in the chat history.
 *
 * Voice approval: during a hands-free conversation, safe permission requests
 * can be answered with "yes"/"no". Deletes, overwrites and anything outside
 * approved folders always need a click (see PermissionDialog).
 */
import type { ReviewAction, VoiceStatus } from '@shared/ipc'
import { isGoodbye, matchWake, parseYesNo, shortCaption } from '@shared/voiceText'
import { chime, speakAsync, stopSpeaking } from '../audio'
import { VoiceListener } from './listener'

const FIRST_TURN_WAIT_MS = 8000
const FOLLOW_UP_WAIT_MS = 6000
const LIVE_CAPTION_MS = 1500

type Sender = (text: string) => Promise<string | null>
type Review = { action: ReviewAction; text?: string } | 'cancel'

class HandsFree {
  private listener = new VoiceListener()
  private status: VoiceStatus = { state: 'idle' }
  private sender: Sender | null = null
  private name = 'pai'
  private wakeWord = false
  private enabled = true
  private inConversation = false
  private cancelled = false
  private listeners = new Set<(s: VoiceStatus) => void>()
  private reviewResolve: ((r: Review) => void) | null = null
  private editor: ((text: string) => void) | null = null

  /** The chat screen provides this: put text in the message box for editing. */
  setEditor(fn: ((text: string) => void) | null): void {
    this.editor = fn
  }

  /** Orb buttons during review; `text` is the heard text after any edits. */
  resolveReview(action: ReviewAction, text?: string): void {
    this.reviewResolve?.({ action, text })
  }

  /** Is a spoken conversation happening right now? */
  get active(): boolean {
    return this.inConversation
  }

  subscribe(fn: (s: VoiceStatus) => void): () => void {
    this.listeners.add(fn)
    fn(this.status)
    return () => this.listeners.delete(fn)
  }

  /** The chat screen provides this: send a message, resolve with the reply text. */
  setSender(fn: Sender | null): void {
    this.sender = fn
  }

  /** Apply settings. Turning the wake word on opens the mic; off closes it. */
  async configure(opts: { name: string; wakeWord: boolean; enabled: boolean }): Promise<void> {
    this.name = opts.name
    this.enabled = opts.enabled
    this.wakeWord = opts.wakeWord && opts.enabled
    if (!opts.enabled) this.stop()
    if (this.wakeWord) {
      if (await this.openMic()) this.listener.setUtteranceHandler((a) => void this.onBackgroundUtterance(a))
    } else {
      this.listener.setUtteranceHandler(null)
      if (!this.inConversation) this.listener.close()
    }
  }

  /** Hotkey pressed. */
  async toggle(): Promise<void> {
    if (!this.enabled) return
    if (this.status.state === 'speaking') {
      stopSpeaking() // interrupt and let the conversation listen again
      return
    }
    if (this.inConversation) {
      this.stop()
      return
    }
    await this.converse()
  }

  /** End the conversation now. */
  stop(): void {
    this.cancelled = true
    this.reviewResolve?.('cancel')
    stopSpeaking()
    this.listener.cancelWaiting()
    if (!this.wakeWord) this.listener.close()
    this.inConversation = false
    this.set({ state: 'idle' })
  }

  /** Ask a yes/no question out loud (used for permission requests). */
  async askYesNo(question: string): Promise<'yes' | 'no' | null> {
    if (!this.inConversation) return null
    this.set({ state: 'speaking', caption: shortCaption(question) })
    await this.say(question)
    if (this.cancelled) return null
    this.set({ state: 'listening', caption: 'Say yes or no' })
    const audio = await this.listener.listenOnce(FOLLOW_UP_WAIT_MS)
    if (!audio) return null
    const heard = await window.pai.transcribe(audio)
    const answer = heard.ok ? parseYesNo(heard.value) : null
    this.set({ state: 'thinking', caption: answer ? `"${heard.ok ? heard.value : ''}"` : 'Did not catch that' })
    return answer
  }

  // -------------------------------------------------------------------------

  private set(s: VoiceStatus): void {
    this.status = s
    for (const fn of this.listeners) fn(s)
    void window.pai.setVoiceStatus(s)
  }

  private async openMic(): Promise<boolean> {
    if (this.listener.isOpen) return true
    const mic = await window.pai.requestMic()
    if (!mic.ok || !mic.value) {
      this.set({ state: 'idle', caption: 'Microphone access is off (System Settings → Privacy → Microphone)' })
      return false
    }
    try {
      await this.listener.open()
      void window.pai.warmUpSpeech()
      return true
    } catch {
      this.set({ state: 'idle', caption: "Couldn't open the microphone" })
      return false
    }
  }

  /** Wait for an utterance, showing the words live on the orb while they are spoken. */
  private async listenLive(label: string, timeoutMs: number): Promise<Float32Array | null> {
    this.set({ state: 'listening', caption: label })
    let done = false
    let pending = false
    const timer = setInterval(async () => {
      if (done || pending || !this.listener.isSpeaking) return
      pending = true
      const partial = await this.listener.peek()
      const res = partial && partial.length > 8000 ? await window.pai.transcribe(partial) : null
      if (!done && res?.ok) this.set({ state: 'listening', caption: `${res.value.replace(/[.…\s]+$/, '')}…` })
      pending = false
    }, LIVE_CAPTION_MS)
    try {
      return await this.listener.listenOnce(timeoutMs)
    } finally {
      done = true
      clearInterval(timer)
    }
  }

  /** Show the heard text on the orb and wait: nothing is sent until you confirm. */
  private review(text: string): Promise<Review> {
    this.set({ state: 'review', caption: text })
    return new Promise((resolve) => {
      this.reviewResolve = (r) => {
        this.reviewResolve = null
        resolve(r)
      }
    })
  }

  /** Speak without hearing ourselves. */
  private async say(text: string): Promise<void> {
    this.listener.setPaused(true)
    await speakAsync(text)
    this.listener.setPaused(false)
  }

  /** Wake-word mode: every utterance is checked for "hey <name>". */
  private async onBackgroundUtterance(audio: Float32Array): Promise<void> {
    if (this.inConversation || !this.enabled) return
    const heard = await window.pai.transcribe(audio)
    if (!heard.ok) return
    const command = matchWake(heard.value, this.name)
    if (command === null) return // not for us; the audio is simply dropped
    await this.converse(command || undefined)
  }

  /** One spoken conversation: listen, answer, repeat until quiet. */
  private async converse(firstCommand?: string): Promise<void> {
    if (!this.sender || !(await this.openMic())) return
    this.inConversation = true
    this.cancelled = false
    chime('start')
    let pending = firstCommand
    let firstTurn = true
    try {
      while (!this.cancelled) {
        let text = pending
        pending = undefined
        if (!text) {
          const audio = await this.listenLive(firstTurn ? 'Listening…' : 'Anything else?', firstTurn ? FIRST_TURN_WAIT_MS : FOLLOW_UP_WAIT_MS)
          if (!audio || this.cancelled) break
          this.set({ state: 'thinking', caption: 'Transcribing…' })
          const heard = await window.pai.transcribe(audio)
          if (!heard.ok) {
            if (firstTurn) await this.say("Sorry, I didn't catch that.")
            break
          }
          text = heard.value
          // "Hey <name>, ..." said after the hotkey: drop the wake phrase.
          const command = matchWake(text, this.name)
          if (command !== null) {
            if (!command) {
              pending = undefined
              firstTurn = true
              continue // just the name: listen again
            }
            text = command
          }
          // Show what was heard, so a misheard word can be caught before sending.
          const choice = await this.review(text)
          if (choice === 'cancel' || this.cancelled) break
          text = choice.text?.trim() || text
          if (choice.action === 'edit') {
            this.editor?.(text)
            this.cancelled = true // quietly end; the text is waiting in the chat box
            break
          }
        }
        if (isGoodbye(text)) {
          await this.say('Okay!')
          break
        }
        this.set({ state: 'thinking', caption: `"${shortCaption(text, 70)}"` })
        const reply = await this.sender(text)
        if (this.cancelled || reply === null) break
        this.set({ state: 'speaking', caption: shortCaption(reply) })
        await this.say(reply)
        firstTurn = false
      }
    } finally {
      const wasCancelled = this.cancelled
      this.inConversation = false
      if (!wasCancelled) chime('end')
      if (!this.wakeWord) this.listener.close()
      this.set({ state: 'idle' })
    }
  }
}

/** One instance for the whole chat window. */
export const handsFree = new HandsFree()
