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
