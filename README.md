# pai — Personal AI Generator

A private personal AI assistant that runs on your PC, remembers you, and **asks permission before acting**.

Electron + React + TypeScript. Works fully offline in mock mode, with a local model through Ollama, or in the cloud through Nebius Token Factory (NVIDIA Nemotron). You switch between them by editing `.env` only.

## Features

| | |
| --- | --- |
| **Ecospace** (home screen) | Give tasks by typing or talking. Each runs in the background as a live card (steps, timer, *Needs you* when waiting for permission), up to 3 at once, and the rest queue. Finished tasks are saved with all their details. The floating orb opens a **mini Ecospace** |
| **Chat** | Replies stream in live. Chat window plus a floating always-on-top orb (click: open/close, drag: move, right-click: menu) |
| **Complete my text** | Writing an email or message in another app? Press **⌃⌥Space** (Ctrl+Alt+Space on Windows) and pick one of 3 ways to finish your sentence; it's typed in for you. Only in apps you allow, never in password fields (macOS) |
| **Live suggestions** | Chips appear while you type or speak: matching files in your approved folders, installed apps, reminder times, searches. Tab or click to use. Worked out locally in milliseconds, with no model call |
| **Voice** | Mic button: your words appear **live in the message box** as you speak (transcribed on your computer by Whisper), and you can fix any word while the mic is on. Speaker button: replies are read aloud with your OS voices |
| **Hands-free** | Press **⌘⇧Space** (Ctrl+Shift+Space) in any app, or say **“Hey [assistant name]”** (optional). You see your words live on the orb, get 2.5 s to *Send now* / *Edit*, then hear the answer. Safe actions can be approved by saying “yes” |
| **Tools** | Create, read, list, move, rename, organize and delete files (delete goes to the Trash), summarize documents, **run terminal commands**, open apps, reminders (one-time and repeating), web search (Tavily, shown as result cards), memory |
| **Shows its work** | A live "✻ Thinking… (8s · esc to stop)" line and one row per action (`⏺ Ran ls -la`, `⎿ output`), expandable |
| **Chat history** | Every conversation is saved in full on your computer: messages, times, each step with its output, and web results. Search, reopen, rename or delete chats |
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

**Ollama (local, free):**

```bash
brew install ollama            # or download from ollama.com (Windows/Linux too)
brew services start ollama     # runs in the background (or: ollama serve)
ollama pull llama3.1:8b        # ~4.9 GB, once
```

Then set `MODEL_MODE=live` in `.env`. `llama3.1:8b` handles tool calling much better than 3B models. It needs about 8 GB of free RAM.

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

### Adding skills

On the **Skills** screen: **Upload skills…** (or drag `.md` / `.json` files onto the page), review each file's name, permissions and full instructions, then **Install**. New skills start switched off. You can also write one with **+ New skill**, and edit or delete your own skills (built-in ones are read-only; "Make my own copy" to customise). Your skills live in `<data folder>/skills/`, a folder the assistant itself can never write to.

A skill's instructions are followed like your own words, so only install skills you trust. Skills never grant permissions; every action still asks.

The file format:

```markdown
---
name: Study Buddy
description: Quizzes you on your notes.
permissions: documents, memory
---
When the user asks to study, summarize their notes file and ask 3 quiz questions...
```

`permissions` must be names from: `files_read, files_write, files_delete, documents, apps, reminders, web, memory`. A skill stays inactive until all of them are on.

## Terminal commands

Settings → Commands → choose **Ask every time** (default: each command shows the exact text and folder first) or **Run and report** (commands run straight away and are shown in the chat and Activity log). In both modes:

- risky commands (`sudo`, `rm -r`, `curl … | sh`, disk tools, `git push`, shutdown…) need a red double confirmation;
- commands start in an approved folder; other folders ask with a warning;
- pai's own data/code, `.env`, `~/.ssh`/`~/.aws` and the keychain are refused;
- API keys are removed from the command environment; 60 s time limit; Stop/off switch kills the command and anything it started.

## Complete my text (other apps)

Settings → **Writing** → turn on **Complete my text**, then grant the **Accessibility** permission when asked (macOS lists it as pai, or "Electron"/your terminal when running from source).

In a text box in an allowed app (Mail, Messages, Slack, WhatsApp, Discord and the main browsers by default), type a few words and press **⌃⌥Space** (Ctrl+Alt+Space on Windows). A popup by the cursor offers 3 continuations written by your model: press **1–3** (or ↑↓ and Enter) to insert one, **R** for new ones, **Esc** to close. In any other app it asks "Allow in <app>?" first.

- It reads the text box only when you press the hotkey, and nothing is inserted until you pick.
- Password fields, terminals and password managers are always refused.
- Text is never saved; the Activity log notes only the app and how many characters were inserted.
- With a cloud model in `.env`, it refuses until you switch on "Allow a cloud model".
- It needs a small native helper (`native/axhelper`, Swift), built automatically by `npm start` / `npm run dev` when Xcode's command line tools are installed (`xcode-select --install`).

## Saved chats

Chats are stored as JSON files in `<data folder>/conversations/` (e.g. `~/Library/Application Support/pai/conversations`). Use the ☰ panel in the chat to search, reopen, rename or delete them. They never leave your computer.

## Voice

- **Hands-free:** press **⌘⇧Space** (Windows/Linux: **Ctrl+Shift+Space**) anywhere. Talk, and stop when you're done; pai notices the pause. Your words show live on the floating orb, then for 2.5 s with **Send now / Edit / Cancel** so you can catch a misheard word. **Edit** opens the chat with the text in the box. The answer is spoken, then pai listens a few more seconds for a follow-up. Say "thanks" or press the hotkey again to end.
- **Wake word (optional, Settings → Hands-free voice):** say **“Hey [assistant name]”**. It's whatever name you gave it, so renaming the assistant changes the wake word. The mic stays on while this is enabled (you'll see the OS mic indicator), and only phrases starting with the wake word are acted on.
- **Approving by voice:** during a spoken conversation, safe actions are read out ("Set a reminder… Should I go ahead?"), and you can answer "yes" or "no". **Deletes, overwrites and anything outside your approved folders always need a click.**
- **Mic button in the chat:** click it and talk. Your words appear live in the box, and you can edit them while it listens; new speech is added after your edit. Click the mic to stop (the text stays for you to check), or press Enter to stop and send.
- **Listen:** the speaker button reads replies aloud using the voices built into your OS (macOS: System Settings → Accessibility → Spoken Content adds better voices).
- **Privacy:** the first use downloads the Whisper speech model (~80 MB) from Hugging Face into pai's data folder. After that, all transcription happens on your computer and audio is never saved or sent anywhere. Recordings are capped at 60 s, and near-silent ones are ignored.
- macOS asks for microphone access the first time. Only the chat window may use the mic, and never the camera or screen.

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
- Complete my text is macOS-only. Some text boxes don't share their text (Google Docs, some web editors), so it can't help there.
- Voice input is English-first; the Whisper `base` model is a balance of speed and accuracy.

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
