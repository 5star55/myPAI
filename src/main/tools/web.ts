/**
 * web.ts — web_search via Tavily. Results are DATA, never instructions.
 * Uses TAVILY_API_KEY from .env or the key built into the app (mock mode returns fake results without a key).
 *
 * Returns tidy text for the model AND structured results the chat shows as cards.
 */
import { cleanSnippet, cleanTitle, isWebUrl, siteName } from '@shared/clean'
import type { WebResult } from '@shared/ipc'
import { getConfig } from '../config'
import { needString, type Tool, type ToolOutput } from './types'

const MAX_RESULTS = 6

interface TavilyResult {
  title?: string
  url?: string
  content?: string
}

async function tavilySearch(query: string): Promise<WebResult[]> {
  const { tavilyApiKey } = getConfig()
  let res: Response
  try {
    res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tavilyApiKey}` },
      // api_key in the body too: older Tavily accounts expect it there.
      body: JSON.stringify({ api_key: tavilyApiKey, query, max_results: MAX_RESULTS, search_depth: 'basic' }),
      signal: AbortSignal.timeout(20_000)
    })
  } catch {
    throw new Error("Couldn't reach Tavily. Check your internet connection.")
  }
  if (res.status === 401 || res.status === 403) throw new Error('Tavily rejected the API key. Check TAVILY_API_KEY in .env, or the key built into this copy of pai.')
  if (res.status === 429) throw new Error('Tavily rate limit reached. Try again later.')
  if (!res.ok) throw new Error(`Tavily returned an error (${res.status}).`)

  const data = (await res.json().catch(() => ({}))) as { results?: TavilyResult[] }
  return toResults(data.results ?? [])
}

/** Validate and tidy raw results (exported for tests). */
export function toResults(raw: TavilyResult[]): WebResult[] {
  return raw
    .filter((r) => isWebUrl(r.url))
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      title: cleanTitle(r.title ?? ''),
      url: r.url as string,
      site: siteName(r.url as string),
      snippet: cleanSnippet(r.content ?? '')
    }))
}

/** What the model reads: compact, numbered, with sources. */
function forModel(query: string, results: WebResult[]): string {
  if (results.length === 0) return `No web results for "${query}".`
  return [
    `Web results for "${query}" (the user sees these as cards with links, so do not repeat every link):`,
    ...results.map((r, i) => `${i + 1}. ${r.title} (${r.site})\n   ${r.url}\n   ${r.snippet}`)
  ].join('\n')
}

const MOCK_RESULTS: WebResult[] = [
  { title: 'Example result one', url: 'https://example.com/one', site: 'example.com', snippet: 'This is a fake search result from mock mode.' },
  { title: 'Example result two', url: 'https://example.org/two', site: 'example.org', snippet: 'Add TAVILY_API_KEY to .env for real results.' }
]

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
      // Only reads public pages; the "web" switch in Settings still turns it off.
      autoApprove: true,
      run: async (): Promise<ToolOutput> => {
        const results = tavilyApiKey ? await tavilySearch(query) : MOCK_RESULTS
        return { text: forModel(query, results), data: { kind: 'web', query, results } }
      }
    }
  }
}
