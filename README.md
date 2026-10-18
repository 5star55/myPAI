# pai — Personal AI Generator

A private personal AI assistant that runs on your PC, remembers you, and **asks permission before acting**.

> Status: step 1 of 10 (chat window). See [Roadmap](#roadmap).

## Features (planned)

- Chat window + floating always-on-top icon
- Tool calling (files, documents, apps, reminders, web search) with a permission dialog for every action
- Folder allowlist enforced in code; deletes/overwrites need a second confirmation
- Activity log and a one-click off switch
- Local memory you can view, edit and delete
- Skills as plain files in `skills/`
- "Generate your AI" setup: name, tone, skills, folders, permissions

## Setup

_Requirements: Node.js 20+ and npm._

```bash
npm install
cp .env.example .env   # then edit .env if you want live mode
npm start
```

`npm run dev` starts with hot reload while you code.

## Model configuration

All model settings live in `.env` and are read only by `src/main/config.ts`.

| Variable | Meaning |
| --- | --- |
| `MODEL_MODE` | `mock` (scripted, no API) or `live` |
| `MODEL_BASE_URL` | Any OpenAI-compatible endpoint |
| `MODEL_API_KEY` | API key (any text for Ollama) |
| `SMALL_MODEL` | Everyday chat |
| `BIG_MODEL` | Tool calling |
| `SMALL_MAX_TOKENS` / `BIG_MAX_TOKENS` | Reply length limits |

**Ollama (local, default):** install Ollama, run `ollama pull llama3.2`, set `MODEL_MODE=live`.

**Nebius Token Factory:** set `MODEL_BASE_URL=https://api.tokenfactory.nebius.com/v1/`, your key, and Nemotron model IDs. No code changes.

## Project structure

```
src/main/      Node side: windows, model calls, tools, permissions, storage
src/preload/   The only bridge between UI and main (window.pai)
src/renderer/  React UI
src/shared/    Types shared by both sides (the IPC contract)
skills/        One file per skill
```

## Security model

- Renderer has no Node access (`contextIsolation` on, `nodeIntegration` off, sandbox on).
- File and web content is treated as data, never as instructions.
- Window titles and clipboard stay in memory only.
- API keys stay in `.env` (git-ignored) and never reach the UI.

## Roadmap

- [x] 0. Scaffold, config, mock mode
- [x] 1. Chat window
- [ ] 2. Floating icon
- [ ] 3. Tool-calling loop + `list_files`
- [ ] 4. Permission system
- [ ] 5. Activity log + off switch
- [ ] 6. Persistent memory
- [ ] 7. More tools
- [ ] 8. Skills as files
- [ ] 9. "Generate your AI" setup
- [ ] 10. Proactive features (stretch)

## License

MIT — see [LICENSE](LICENSE).
