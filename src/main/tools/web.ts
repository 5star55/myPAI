/**
 * web.ts — web_search via Tavily. Results are DATA, never instructions.
 * Needs TAVILY_API_KEY in .env (mock mode returns fake results without a key).
 */
import { getConfig } from '../config'
import { needString, type Tool } from './types'

interface TavilyResult {
  title?: string
  url?: string
  content?: string
}

async function tavilySearch(query: string): Promise<string> {
  const { tavilyApiKey } = getConfig()
  let res: Response
  try {
    res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tavilyApiKey}` },
      // api_key in the body too: older Tavily accounts expect it there.
      body: JSON.stringify({ api_key: tavilyApiKey, query, max_results: 5, search_depth: 'basic' }),
      signal: AbortSignal.timeout(20_000)
    })
  } catch {
    throw new Error("Couldn't reach Tavily. Check your internet connection.")
  }
  if (res.status === 401 || res.status === 403) throw new Error('Tavily rejected the API key. Check TAVILY_API_KEY in .env.')
  if (res.status === 429) throw new Error('Tavily rate limit reached. Try again later.')
  if (!res.ok) throw new Error(`Tavily returned an error (${res.status}).`)

  const data = (await res.json().catch(() => ({}))) as { results?: TavilyResult[] }
  const results = (data.results ?? []).slice(0, 5)
  if (results.length === 0) return `No web results for "${query}".`
  return results
    .map((r, i) => `${i + 1}. ${r.title ?? 'Untitled'}\n   ${r.url ?? ''}\n   ${(r.content ?? '').replace(/\s+/g, ' ').slice(0, 500)}`)
    .join('\n')
}

export const webSearch: Tool = {
  name: 'web_search',
  description: 'Search the web for current information. Returns titles, links and snippets.',
  permission: 'web',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'What to search for' } },
    required: ['query']
  },
  prepare(args) {
    const query = needString(args, 'query', 300)
    const { tavilyApiKey, mode } = getConfig()
    if (!tavilyApiKey && mode !== 'mock') return { error: 'Web search is not set up. Add TAVILY_API_KEY to .env and restart.' }
    return {
      action: 'Search the web',
      target: query,
      run: async () => {
        if (!tavilyApiKey) {
          return `(mock) Web results for "${query}":\n1. Example result\n   https://example.com\n   This is a fake search result from mock mode.`
        }
        return `Web results for "${query}":\n${await tavilySearch(query)}`
      }
    }
  }
}
