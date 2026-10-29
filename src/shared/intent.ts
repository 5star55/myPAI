/**
 * intent.ts — quick keyword checks on what a message is asking for.
 *
 * Shared so main (which model and tools to use) and the Ecospace (is this a
 * task, or really a chat question?) judge a message the same way.
 * Easy to extend: add words to the patterns.
 */
const ACTION_WORDS =
  /\b(run|execute|command|terminal|shell|script|install|git|npm|npx|yarn|pnpm|pip|python|node|brew|build|scaffold|fix|debug|refactor|deploy|preview|localhost|dev server|website|web app|landing page|codebase|repo|component|create|make|write|save|new file|mkdir|folder|folders?|downloads|desktop|documents|directory|rename|move|organi[sz]e|tidy|clean up|delete|trash|summari[sz]e|read|open|launch|remind|reminders?|alarm|schedule|timer|search|look up|google|web|news|latest|remember|forget|recall|memory|memori[sz]e|store this|keep in mind|what do you know|plan my day)\b/i
const LOOKS_LIKE_PATH = /(^|\s)(~\/|\/[\w.-]+\/|[a-z]:\\)/i

/** Learning or writing something to read in the chat ("teach me python", "write a python code to…"). */
const CHAT_FIRST =
  /^\s*(teach me|explain|help me (understand|learn)|i want to learn|how (do|does|can|to)\b|write (me )?(a |an |some )?([\w+#.-]+ )?(code|program|script|function|class|example|poem|story|email|essay|letter|message|caption|bio))/i
/** Still a job even when phrased like that: files, folders, running, reminders, the web. */
const STRONG_ACTION =
  /\b(run|execute|terminal|shell|install|save|new file|mkdir|folders?|downloads|desktop|documents|directory|rename|move|organi[sz]e|tidy|delete|trash|open|launch|remind|reminders?|alarm|timer|search|look up|google|news|latest)\b/i

/** Looks like a request to DO something (on the computer, the web, reminders, memory). */
export function needsTools(text: string): boolean {
  if (LOOKS_LIKE_PATH.test(text)) return true
  if (CHAT_FIRST.test(text) && !STRONG_ACTION.test(text)) return false
  return ACTION_WORDS.test(text)
}

/** Greetings, thanks, "how are you", "who are you"… : just chat, even when tools are on offer. */
const SMALL_TALK =
  /^\s*(hi|hey|hello|yo|hiya|good (morning|afternoon|evening|night)|thanks?( you)?|thank u|ty|cheers|ok(ay)?|cool|nice|great|lol|haha|bye|goodbye|see you|how are (you|u)( doing)?|how's it going|what'?s up|sup|who are you|what are you|what'?s your name|what can you do|tell me a joke|i'?m (fine|good|great|ok(ay)?|tired|bored|sad|happy))\b[\s\w',!?.]*$/i

export function isSmallTalk(text: string): boolean {
  const t = text.trim()
  return t.length <= 60 && SMALL_TALK.test(t) && !needsTools(t)
}

/** Questions and "tell me about…": things you ask, not jobs to run. */
const QUESTION =
  /^\s*(what|what's|whats|why|how|who|whom|whose|when|where|which|is|are|was|were|am i|do you|does|did|should|would|could|can you explain|explain|tell me|define|describe|compare|difference between)\b/i

/** Typed into the Ecospace, but reads like chat (small talk or a question, not a job to do). */
export function looksLikeChat(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (isSmallTalk(t)) return true
  if (needsTools(t)) return false
  return t.endsWith('?') || QUESTION.test(t) || CHAT_FIRST.test(t)
}
