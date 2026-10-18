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
