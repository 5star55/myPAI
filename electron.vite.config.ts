import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// The Tavily key built into the app, so web search works with no setup. It comes from
// PAI_BUILTIN_TAVILY_KEY (the GitHub build sets it from a repo secret) or TAVILY_API_KEY in .env.
// Anyone with the installer can pull it out of the app, so use a key you can revoke.
const envFile = existsSync('.env') ? parse(readFileSync('.env')) : {}
const builtinTavilyKey = (process.env.PAI_BUILTIN_TAVILY_KEY || envFile.TAVILY_API_KEY || '').trim()
console.log(builtinTavilyKey ? `[build] Tavily key built in (ending in ${builtinTavilyKey.slice(-4)})` : '[build] No Tavily key built in: web search needs TAVILY_API_KEY')

// electron-vite builds three separate bundles: main (Node), preload (bridge), renderer (React).
export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    define: { __BUILTIN_TAVILY_KEY__: JSON.stringify(builtinTavilyKey) }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [react()]
  }
})
