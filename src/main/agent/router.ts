/**
 * router.ts — decides small model (chat) vs big model (tools) for a message.
 *
 * A keyword check is fast, free and predictable. If a message looks like a
 * request to DO something, the big model gets the tools; otherwise the small
 * model just chats. The patterns live in @shared/intent (the Ecospace uses them too).
 */
export { isSmallTalk, needsTools } from '@shared/intent'

/** A model (often Llama with tools on offer) refusing because no tool fits, instead of just answering. */
export function isNoToolRefusal(text: string): boolean {
  return /\b(i (do not|don't|do n't) have (a|any|the) [\w\s-]{0,30}(function|tool)s?|(with|using) the (provided|available|given) (functions|tools)|no (suitable|relevant|available) (function|tool))\b/i.test(text)
}

/** A model claiming it can't act on the computer ("I cannot execute commands—only suggest them"). It can. */
export function isCapabilityRefusal(text: string): boolean {
  return /\bi(?: can ?not| can[’']?t|[’']?m not able to| am not able to|[’']?m unable to| am unable to| (?:do not|don[’']?t) have (?:the ability|access) to)\s+(?:directly |actually |personally )?(?:run|execute|access|create|write|edit|modify|install|start|launch|set up|scaffold|interact)\b|\bonly (?:suggest|provide|give you) (?:them|the commands?)\b/i.test(text)
}
