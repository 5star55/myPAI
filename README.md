# pai — Personal AI Generator

A private personal AI assistant that runs on your PC, remembers you, and **asks permission before acting**.

Electron + React + TypeScript. Works fully offline in mock mode, with a local model through Ollama, or in the cloud through Nebius Token Factory (NVIDIA Nemotron). You switch between them by editing `.env` only.

## Features

| | |
| --- | --- |
| **Chat** | Chat window plus a floating always-on-top orb (click: open/close, drag: move, right-click: menu) |
| **Tools** | List, move, rename, organize and delete files (delete goes to the Trash), summarize documents, open apps, reminders (one-time and repeating), web search (Tavily), memory |
| **Permissions** | A dialog before **every** action, showing the exact path. Approvals last for the session, or "always for this folder". Deletes and overwrites need a second confirmation |
| **Folder allowlist** | Enforced in code. Paths outside your approved folders get a special warning and are never remembered automatically. System folders, key folders and pai's own files are always refused |
| **Off switch** | One click (top bar, or right-click the orb). Stops the reply in progress and denies everything pending |
| **Activity log** | Time, tool, target and result for everything the assistant tried |
| **Memory** | Facts in a local JSON file, which you can view, edit and delete |
| **Skills** | Markdown or JSON files in `skills/`, toggled on or off |
| **Generate your AI** | First-run setup: name, tone, folders, permissions, skills |
| **Proactive offers** | Based on the active app and the Downloads folder. Accept, dismiss or snooze, plus a quiet mode. They never act on their own |

## Setup and run from source

_Requirements: Node.js 20+ and npm._

```bash
npm install
cp .env.example .env     # macOS/Linux  (Windows: copy .env.example .env)
npm start
```

`npm install` also downloads the Electron binary, through a `postinstall` script.

| Command | What it does |
| --- | --- |
| `npm start` | Build and run the app |
| `npm run dev` | Run with hot reload while you code |
| `npm test` | Run the test suite (allowlist, permissions, tools, agent loop, proactive) |
| `npm run typecheck` | TypeScript checks for all code |

On first launch, the **Generate your AI** setup runs. You can re-run it later from Settings → Start over.

## Model configuration

All model settings live in `.env` and are read only by [`src/main/config.ts`](src/main/config.ts). Restart after editing.

| Variable | Meaning |
| --- | --- |
| `MODEL_MODE` | `mock` (scripted replies and fake tool calls, no API) or `live` |
| `MODEL_BASE_URL` | Any OpenAI-compatible endpoint |
| `MODEL_API_KEY` | API key (any text for Ollama) |
| `SMALL_MODEL` | Everyday chat |
| `BIG_MODEL` | Tool calling |
| `SMALL_MAX_TOKENS` / `BIG_MAX_TOKENS` | Reply length limits (set on every request) |
| `TAVILY_API_KEY` | Optional: web search |
| `PAI_DATA_DIR` | Optional: store pai's data in another folder (e.g. for testing) |

**Ollama (local):** install Ollama, run `ollama pull llama3.1:8b`, then set `MODEL_MODE=live`.

**Nebius Token Factory:** set `MODEL_BASE_URL=https://api.tokenfactory.nebius.com/v1/`, your key, and the Nemotron model IDs. To list the IDs your key can use, run the `curl` command in `.env.example`.

### Mock mode commands

In mock mode, these phrases trigger real tools (with real permission dialogs), so you can test without a model:

```
list files in ~/Downloads            organize ~/Downloads
rename ~/Downloads/a.txt to b.txt    move ~/Downloads/a.txt to ~/Downloads/Old
delete ~/Downloads/a.txt             summarize ~/Downloads/notes.txt
open Calculator                      remind me to stretch in 2 minutes
search the web for electron          remember that I like green tea
what do you remember about tea       list my reminders
```

## How it works

```
Renderer (React)  ──window.pai──▶  Preload (bridge)  ──IPC──▶  Main (Node)
  chat, dialogs,                    typed, allow-listed           agent loop ─▶ model (openai pkg)
  settings, orb                     events only                   tools ─▶ allowlist ─▶ permission dialog
                                                                  stores (JSON files in the user data folder)
```

One tool call goes through these steps in [`src/main/agent/loop.ts`](src/main/agent/loop.ts):

1. Off switch on? → stop.
2. Tool exists and its permission group is enabled? (Disabled tools are never even offered to the model.)
3. `prepare()` validates the arguments and the path. It touches nothing and returns exactly what it will do.
4. **Permission dialog** (a second one for destructive actions). Outside folders get a warning.
5. `run()`. The result goes back to the model wrapped as **data**, and is written to the activity log.

The small model handles everyday chat. A keyword router ([`src/main/agent/router.ts`](src/main/agent/router.ts)) sends action requests to the big model, together with the tools.

## Project structure

```
src/main/            Node side: all privileged work
  config.ts          the ONLY place for model settings
  model.ts, mock.ts  model calls (live + mock)
  agent/             tool-calling loop and router
  tools/             one file per tool group + registry
  security/          folder allowlist + permission broker
  store/             profile, state, memory, reminders, activity log, approvals
  skills/            skill file loader
  reminders/         notification scheduler
  proactive/         active window, Downloads watcher, offer rules
  windows/           chat window, floating orb
src/preload/         the only bridge to the UI (window.pai)
src/renderer/src/    React UI: views/, components/, styles.css (design tokens)
src/shared/ipc.ts    the typed contract between main and UI
skills/              one .md or .json file per skill
tests/               Vitest tests (Electron is faked)
```

### Writing a skill

Create `skills/my-skill.md`, then click **Reload files** on the Skills screen:

```markdown
---
name: Study Buddy
description: Quizzes you on your notes.
permissions: documents, memory
---
When the user asks to study, summarize their notes file and ask 3 quiz questions...
```

`permissions` must be names from: `files_read, files_write, files_delete, documents, apps, reminders, web, memory`. A skill stays inactive until all of them are on.

## Security and privacy

- The renderer has no Node access (`contextIsolation` on, `nodeIntegration` off, sandbox on), plus a strict content security policy. Every IPC call checks which window sent it.
- File contents, web results and tool output are treated as **data, never as instructions** (both in the system prompt and in how results are wrapped).
- The folder allowlist resolves `~`, `..` and symlinks before checking. pai's own data folder, its code and `.env`, system folders and credential folders can never be touched.
- Nothing is permanently deleted: deletes and overwrites go to the Trash.
- Window titles stay in memory only, never on disk or in the log. pai never reads the clipboard.
- API keys stay in `.env` (git-ignored) and never reach the UI.
- Your data (profile, memory, log, reminders) lives in your OS user-data folder, e.g. `~/Library/Application Support/pai` on macOS.
- Reminders you set keep firing while the assistant is switched off, since they're your own notifications. Everything else stops.

## Known limitations

- `summarize_document` reads text formats (`.txt .md .csv .json .html …`), but not PDF or Word yet.
- On macOS, window titles need the Screen Recording permission. Without it, proactive rules only see the app name.
- Notifications from an unsigned dev build may need to be allowed for "Electron" in System Settings → Notifications.
- Replies arrive all at once (no streaming yet).

## Roadmap

- [x] 0. Scaffold, config, mock mode
- [x] 1. Chat window
- [x] 2. Floating icon
- [x] 3. Tool-calling loop + `list_files`
- [x] 4. Permission system
- [x] 5. Activity log + off switch
- [x] 6. Persistent memory
- [x] 7. More tools
- [x] 8. Skills as files
- [x] 9. "Generate your AI" setup
- [x] 10. Proactive features

## License

MIT — see [LICENSE](LICENSE).
