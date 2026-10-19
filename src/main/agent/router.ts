/**
 * router.ts — decides small model (chat) vs big model (tools) for a message.
 *
 * A keyword check is fast, free and predictable. If a message looks like a
 * request to DO something, the big model gets the tools; otherwise the small
 * model just chats. Easy to extend: add words to the pattern.
 */
const ACTION_WORDS =
  /\b(run|execute|command|terminal|shell|script|install|git|npm|pip|python|node|brew|create|make|write|save|new file|mkdir|folder|folders?|downloads|desktop|documents|directory|rename|move|organi[sz]e|tidy|clean up|delete|trash|summari[sz]e|read|open|launch|remind|reminders?|alarm|schedule|timer|search|look up|google|web|news|latest|remember|forget|recall|what do you know|plan my day)\b/i
const LOOKS_LIKE_PATH = /(^|\s)(~\/|\/[\w.-]+\/|[a-z]:\\)/i

export function needsTools(text: string): boolean {
  return ACTION_WORDS.test(text) || LOOKS_LIKE_PATH.test(text)
}

/** Greetings, thanks, "how are you", "who are you"… : just chat, even when tools are on offer. */
const SMALL_TALK =
  /^\s*(hi|hey|hello|yo|hiya|good (morning|afternoon|evening|night)|thanks?( you)?|thank u|ty|cheers|ok(ay)?|cool|nice|great|lol|haha|bye|goodbye|see you|how are (you|u)( doing)?|how's it going|what'?s up|sup|who are you|what are you|what'?s your name|what can you do|tell me a joke|i'?m (fine|good|great|ok(ay)?|tired|bored|sad|happy))\b[\s\w',!?.]*$/i

export function isSmallTalk(text: string): boolean {
  const t = text.trim()
  return t.length <= 60 && SMALL_TALK.test(t) && !needsTools(t)
}

/** A model (often Llama with tools on offer) refusing because no tool fits, instead of just answering. */
export function isNoToolRefusal(text: string): boolean {
  return /\b(i (do not|don't|do n't) have (a|any|the) [\w\s-]{0,30}(function|tool)s?|(with|using) the (provided|available|given) (functions|tools)|no (suitable|relevant|available) (function|tool))\b/i.test(text)
}
