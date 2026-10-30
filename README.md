# pai — Personal AI Generator

A private personal AI assistant that runs on your PC, remembers you, builds and runs apps for you, quizzes you, understands pictures, and **asks permission before acting**.

Electron + React + TypeScript, for macOS and Windows. It runs on **NVIDIA Nemotron through Nebius Token Factory**, or fully on your own computer with a local model through Ollama (or offline in mock mode). You switch between them by editing `.env` only.

**Highlights**

- **NVIDIA Nemotron on Nebius Token Factory**: one `.env` switch moves the whole agent (chat, tool calling, tasks, *Complete my text*) to Nemotron. See [NVIDIA Nemotron and Nebius](#nvidia-nemotron-and-nebius).
- **Private by default**: speech-to-text (Whisper) and text-to-speech run on your computer; with Ollama, so does the model.
- **A coding assistant that does the work**: it scaffolds, edits, installs, runs a dev server and checks the result in its own preview window. See [Coding assistant](#coding-assistant).
- **Asks before acting**: every file change, command and app launch goes through a permission dialog, and protected places are refused in code. Projects pai created itself don't ask at every step.
- **Open source** under the OSI-approved **MIT License**.

## Features

| | |
| --- | --- |
| **Ecospace** (home screen) | Give tasks by typing or talking. Each runs in the background as a live card (steps, timer, *Needs you* when waiting for permission), up to 3 at once, and the rest queue. Finished tasks are saved with all their details. The floating orb opens a **mini Ecospace** |
| **Chat** | A reading-column layout: replies stream in as plain text, with code blocks (Copy button), and Copy / Read aloud / Regenerate icons and the time under each reply. **Edit** your own messages (the conversation is answered again from there). Chat window plus a floating always-on-top orb (click: mini Ecospace, drag: move, right-click: menu) |
| **Send while it works** | Type while a reply is running and press Enter: the message is read at the next step and changes what pai does (“make it dark”). If the reply finishes first, it is sent next |
| **Coding assistant** | Ask it to build or fix an app: it explores the project, edits files, installs, starts a dev server and checks the page (text and console errors) in a **preview window**, then fixes what fails. See [Coding assistant](#coding-assistant) |
| **Pictures** | Attach, paste or drop up to 4 pictures per message. `VISION_MODEL` (Nemotron VL) describes each one for the main model, copying any text exactly, so pai can still use its tools on the same turn |
| **Interactive quizzes** | The **Quiz Master** skill (on by default, used only when you ask for a quiz) shows clickable quiz cards: pick an answer, see right or wrong with an explanation, then your score, **Try again** and **Review my mistakes**. Questions appear as they are written |
| **Chat or task?** | Type a question into the Ecospace and pai offers to ask it in Chat instead (a fast keyword check, no model call) |
| **Complete my text** | Writing an email or message in another app? Press **⌃⌥Space** (Ctrl+Alt+Space on Windows) and pick one of 3 ways to finish your sentence; it's typed in for you. Only in apps you allow, never in password fields (macOS and Windows) |
| **Live suggestions** | Chips appear while you type or speak: matching files in your approved folders, installed apps, reminder times, searches. Tab or click to use. Worked out locally in milliseconds, with no model call |
| **Voice** | Mic button: your words appear **live in the message box** as you speak (transcribed on your computer by Whisper), and you can fix any word while the mic is on. Speaker button: replies are read aloud with your OS voices |
| **Hands-free** | Press **⌘⇧Space** (Ctrl+Shift+Space) in any app, or say **“Hey [assistant name]”** (optional). You see your words live on the orb; nothing is sent until you press *Send* (fix any misheard word first), then you hear the answer. Safe actions can be approved by saying “yes” |
| **Tools** (23) | Files: create, read (also line ranges), list, move, rename, organize, delete (to the Trash), summarize documents. Code: find files, search code, exact-text edits. **Terminal commands**, dev servers (start, read output, stop) and the preview. Open apps and settings pages, reminders (one-time and repeating), web search (Tavily, shown as result cards), memory |
| **Shows its work** | A live "Thinking… (8s · esc to stop)" line and one row per action (`⏺ Ran ls -la`, `⎿ output`). When the reply is done, the steps fold into one line such as “Created 2 files, started a server ▸”, and what pai said between steps stays visible |
| **Chat history** | Every conversation is saved in full on your computer: messages, times, each step with its output, and web results. Search, reopen, rename or delete chats |
| **Permissions** | A dialog before **every** action, showing the exact path or command. Approvals last for the session, or "always for this folder". Deletes and overwrites need a second confirmation. **Made by pai:** inside folders pai created itself (a scaffolded project), reading, editing and normal commands don't ask each time; deletes and risky commands still do (Settings → Folders lists them) |
| **Folder access** | **Allow all folders** (the default): pai can work with files anywhere, and every change still asks first; “always allow” covers one top folder such as `~/Projects`, never your whole home or drive. Switch it off in Settings → Folders to allow only approved folders (others get a special warning and are never remembered). Either way, system folders, key folders and pai's own files are always refused, in code |
| **Off switch** | One click (top bar, or right-click the orb). Stops the reply in progress and denies everything pending |
| **Activity log** | Time, tool, target and result for everything the assistant tried |
| **Memory** | Lasting facts you mention (“I'm 19”, “my sister is Ada”) are saved automatically, and out-of-date ones replaced. Stored in a local JSON file you can view, edit and delete. pai never guesses facts about you |
| **Skills** | Markdown or JSON files in `skills/`, toggled on or off. Built in: Quiz Master, Daily Planner, File Organizer, Research Assistant. A skill with `triggers` is only used when your message asks for it |
| **Generate your AI** | First-run setup: your Nebius API key (installed app), name, tone, folders, permissions, skills |
| **Reliable** | Every request streams. A stalled, dropped or failed request is retried automatically (before anything was shown). Idle CPU stays around 2%: animations stop when nothing is happening |
| **Proactive offers** | Based on the active app and the Downloads folder. Accept, dismiss or snooze, plus a quiet mode. They never act on their own |

## Installed app: add your Nebius API key

The installed app (from `npm run dist`) runs NVIDIA Nemotron on Nebius Token Factory and needs **your own Nebius API key**. No key is built into the app.

1. Get a key at [Nebius Token Factory](https://tokenfactory.nebius.com/) (API keys).
2. Open pai. During first-run setup, paste it under **Your Nebius API key**, or later in **Settings → AI model → Nebius API key**, and press **Save**.
3. pai checks the key with Nebius before saving it. A rejected key is not saved.

Until a key is saved, pai shows a banner (“Add your Nebius API key to start using pai”) and every chat or task answers with the same message instead of failing.

**Where the key is kept:** in pai's user-data folder (`~/Library/Application Support/pai/api-key.bin` on macOS, `%APPDATA%\pai\api-key.bin` on Windows), encrypted with the system keychain (Electron `safeStorage`). It is never written to the repo or the installer, never shown again in the app (only its last 4 characters), never passed to terminal commands, and pai's own tools can't read that folder. **Remove** in Settings deletes it.

## Setup and run from source

_Requirements: Node.js 20+ and npm. Optional, for *Complete my text*: Xcode command line tools on macOS (`xcode-select --install`), or the .NET 10 SDK on Windows. Without them the rest of the app works normally._

```bash
npm install
cp .env.example .env     # macOS/Linux  (Windows: copy .env.example .env)
npm start
```

`npm install` also downloads the Electron binary, through a `postinstall` script.

| Command | What it does |
| --- | --- |
| `npm start` | Build and run the app (also builds the native text helper for your system) |
| `npm run dev` | Run with hot reload while you code |
| `npm test` | Run the test suite (allowlist, permissions, tools, agent loop, proactive) |
| `npm run typecheck` | TypeScript checks for all code |
| `npm run dist` | Build the installer into `dist/` (`.dmg` on macOS, `.exe` on Windows). See [Building installers](#building-installers) |

On first launch, the **Generate your AI** setup runs. You can re-run it later from Settings → Start over.

## Model configuration

When running from source, model settings live in `.env` and are read only by [`src/main/config.ts`](src/main/config.ts). Restart after editing. The installed app never reads a `.env`: it uses Nemotron on Nebius with the key from Settings. A key saved in **Settings → AI model** always wins over `MODEL_API_KEY` in `.env`.

| Variable | Meaning |
| --- | --- |
| `MODEL_MODE` | `mock` (scripted replies and fake tool calls, no API) or `live` |
| `MODEL_BASE_URL` | Any OpenAI-compatible endpoint |
| `MODEL_API_KEY` | API key when running from source (any text for Ollama). The installed app uses the key pasted in Settings → AI model instead |
| `VISION_MODEL` | Model that describes attached pictures (e.g. `nvidia/Nemotron-3.5-Super-VL`) |
| `SMALL_MODEL` | Everyday chat (and quizzes, memory) |
| `BIG_MODEL` | Tool calling and coding |
| `SMALL_MAX_TOKENS` / `BIG_MAX_TOKENS` | Reply length limits (hosted default 4096 / 8192; Ollama 1024 / 1536). Replies cut off at the limit are continued automatically |
| `MODEL_CONTEXT_TOKENS` | How much the model reads at once (hosted default 65536; Ollama 8192). Long chats are trimmed to fit, oldest messages first; the instructions always stay |
| `TAVILY_API_KEY` | Optional: web search. Also built into installers made with `npm run dist` (see [Building installers](#building-installers)) |
| `PAI_DATA_DIR` | Optional: store pai's data in another folder (e.g. for testing) |

**Ollama (local, free):**

```bash
brew install ollama            # or download from ollama.com (Windows/Linux too)
brew services start ollama     # runs in the background (or: ollama serve)
ollama pull llama3.1:8b        # ~4.9 GB, once
```

Then set `MODEL_MODE=live` in `.env`. `llama3.1:8b` handles tool calling much better than 3B models. It needs about 8 GB of free RAM.

Ollama's OpenAI-compatible API keeps only about 2k tokens of each prompt and silently drops the start (the system prompt). pai fixes this for you: on first use it creates `llama3.1:8b-pai`, the same model files with a `MODEL_CONTEXT_TOKENS` context window, and uses that.

**Nebius Token Factory (NVIDIA Nemotron):** see the next section.

## NVIDIA Nemotron and Nebius

pai was built and tested with **NVIDIA Nemotron** models served by **Nebius Token Factory**. Token Factory exposes an OpenAI-compatible API, so the same agent code runs on Nemotron in the cloud or on a local model, with no code changes.

**Setup**

```bash
# .env
MODEL_MODE=live
MODEL_BASE_URL=https://api.tokenfactory.nebius.com/v1/
MODEL_API_KEY=<your Token Factory key>
SMALL_MODEL=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B
BIG_MODEL=nvidia/nemotron-3-super-120b-a12b
VISION_MODEL=nvidia/Nemotron-3.5-Super-VL
```

The installed app uses these three models by default, with the key pasted in Settings.

To list the model IDs your key can use, run the `curl` command in `.env.example`.

**How pai uses Nemotron**

| Role | Nemotron variant | Used for |
| --- | --- | --- |
| `SMALL_MODEL` | A smaller, faster Nemotron | Everyday chat, *Complete my text* suggestions, document summaries |
| `BIG_MODEL` | A larger Nemotron | Tool calling: Ecospace tasks, the coding assistant, files, commands, reminders, web search, memory |
| `VISION_MODEL` | Nemotron VL | Describes attached pictures for the other models |

A keyword router ([`src/shared/intent.ts`](src/shared/intent.ts)) sends each message to the right model: questions and writing go to the small model with no tools, requests to *do* something go to the big model with the tools that request needs ([`src/main/agent/context.ts`](src/main/agent/context.ts)).

**Where Token Factory accelerated the work**

- **Larger models without local hardware:** Token Factory let us run Nemotron's tool calling at sizes that won't fit on a laptop.
- **One code path for cloud and local:** the API is OpenAI-compatible, so moving between Nemotron and a local model is a `.env` change. Every feature was built once and works on both.
- **No infrastructure to run:** no GPU servers to set up or manage, so the time went into the agent, the tools and the safety checks.

**Nebius tools and services used:** Nebius Token Factory (model inference for NVIDIA Nemotron). No other Nebius services.

**Privacy note:** with a cloud model, chat messages are sent to the provider. *Complete my text* refuses to send what you type in other apps until you switch on Settings → Writing → "Allow a cloud model". Voice transcription always stays on your computer.

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
4. **Permission dialog** (a second one for destructive actions). Skipped only for reads and normal edits inside a folder pai created, and for commands in “run and report” mode. With *Allow all folders* off, other folders get a warning.
5. `run()`. The result goes back to the model wrapped as **data**, and is written to the activity log. A call that already failed in the same reply is not run again; the model is told to try something different.

Messages you send while it works are added between steps. Lasting facts in your message are saved to memory alongside the reply ([`src/main/agent/autoMemory.ts`](src/main/agent/autoMemory.ts)). Pictures are described by the vision model first.

The small model handles everyday chat. A keyword router ([`src/shared/intent.ts`](src/shared/intent.ts)) sends action requests to the big model, together with only the tools that request needs. Each request is trimmed to fit the context window first ([`src/main/agent/context.ts`](src/main/agent/context.ts)).

## Project structure

```
src/main/            Node side: all privileged work
  config.ts          the ONLY place for model settings
  model.ts, mock.ts  model calls (live + mock), streaming and retries
  agent/             tool-calling loop, router, automatic memory
  tools/             one file per tool group + registry (files, code, shell, servers…)
  security/          folder allowlist + permission broker
  store/             profile, state, memory, reminders, activity log, approvals,
                     API key (encrypted), folders pai created
  skills/            skill file loader
  reminders/         notification scheduler
  proactive/         active window, Downloads watcher, offer rules
  windows/           chat window, floating orb, preview browser, tray
src/preload/         the only bridge to the UI (window.pai)
src/renderer/src/    React UI: views/, components/, styles.css (design tokens)
src/shared/ipc.ts    the typed contract between main and UI (quiz.ts: the quiz format)
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
triggers: study, revise, my notes
---
When the user asks to study, summarize their notes file and ask 3 quiz questions...
```

`permissions` must be names from: `files_read, files_write, files_delete, documents, apps, reminders, web, memory, shell`. A skill stays inactive until all of them are on. `triggers` is optional: with it, the skill is only added to the prompt when your message uses one of those words (so a quiz skill doesn't turn every question into a quiz).

## Terminal commands

Settings → Commands → choose **Ask every time** (default: each command shows the exact text and folder first) or **Run and report** (commands run straight away and are shown in the chat and Activity log). In both modes:

- risky commands (`sudo`, `rm -r`, `curl … | sh`, disk tools, `git push`, shutdown…) need a red double confirmation;
- in a folder pai created itself (e.g. a project it scaffolded), normal commands run without asking;
- with *Allow all folders* off, folders outside your approved ones ask with a warning;
- pai's own data/code, `.env`, `~/.ssh`/`~/.aws` and the keychain are refused;
- API keys are removed from the command environment; 60 s time limit (installs and scaffolding such as `npm install` or `create-next-app` get 5 minutes); Stop/off switch kills the command and anything it started.

Commands that keep running (dev servers, watchers) go through `start_server` instead, which runs them in the background. See below.

## Coding assistant

Ask in the chat, for example: “Build a landing page for a coffee shop in ~/Projects/bean-there and show it to me.” pai then:

1. looks at the project (`find_files`, `search_code`, `read_file`), or scaffolds a new one into an empty folder (`create-next-app … --yes`, Vite…) and copies your images into `public/`;
2. writes the real pages, changing files with exact-text edits (`edit_file`), shown as a diff;
3. installs dependencies and starts the dev server with `start_server`: it finds the local address and opens it in the **preview window**, a small browser beside the chat (local addresses only, in its own sandboxed session, with back, reload, an error count and devtools);
4. checks its work with `open_preview` (page text and console errors) and `server_output` (build errors), and fixes what fails;
5. ends with a summary: the files it changed, how it checked them, and the preview address.

The project folder it creates becomes pai's own, so its later reads, edits and commands there don't ask each time. You can type while it works (“use the other picture”), and Stop ends it at any point. Dev servers stop when pai quits or is switched off.

## Complete my text (other apps)

Settings → **Writing** → turn on **Complete my text**, then grant the **Accessibility** permission when asked (macOS lists it as pai, or "Electron"/your terminal when running from source).

In a text box in an allowed app (Mail, Messages, Slack, WhatsApp, Discord and the main browsers by default), type a few words and press **⌃⌥Space** (Ctrl+Alt+Space on Windows). A popup by the cursor offers 3 continuations written by your model: press **1–3** (or ↑↓ and Enter) to insert one, **R** for new ones, **Esc** to close. In any other app it asks "Allow in <app>?" first.

- It reads the text box only when you press the hotkey, and nothing is inserted until you pick.
- Password fields, terminals and password managers are always refused.
- Text is never saved; the Activity log notes only the app and how many characters were inserted.
- With a cloud model in `.env`, it refuses until you switch on "Allow a cloud model".
- It needs a small native helper, built automatically by `npm start` / `npm run dev`:
  - macOS: `native/axhelper` (Swift, Accessibility API). Needs Xcode's command line tools (`xcode-select --install`).
  - Windows: `native/winhelper` (C#, UI Automation). Needs the .NET 10 SDK. Works in Notepad and other native text boxes; Chrome and Edge are not supported yet.

## Send to pai (Windows)

Right-click a document in Explorer → **Send to** → **pai**, and pai opens the chat and summarizes it (the usual permission dialog applies; the file must be in an approved folder). Supported types are the ones `summarize_document` reads (`.txt`, `.md`, `.csv`, `.json`, `.html`…); up to 5 files at a time.

To add the menu entry, press Win+R, run `shell:sendto`, and create a shortcut there named **pai**:

- Installed pai: target `pai.exe`.
- From source: target `"<project>\node_modules\electron\dist\electron.exe" "<project>"`, replacing `<project>` with the full project path. Run `npm run build` first.

If pai is already running, the file goes to the open window; otherwise pai starts and then asks.

## Saved chats

Chats are stored as JSON files in `<data folder>/conversations/` (e.g. `~/Library/Application Support/pai/conversations`). Use the ☰ panel in the chat to search, reopen, rename or delete them. They never leave your computer.

## Voice

- **Hands-free:** press **⌘⇧Space** (Windows/Linux: **Ctrl+Shift+Space**) anywhere. Talk, and stop when you're done; pai notices the pause. Your words show live on the floating orb, then wait in an editable box with **Send / Open in chat / Cancel**: nothing is sent until you confirm. Click the box to fix a misheard word, then press **Enter** (or **Esc** to cancel). **Open in chat** moves the text to the chat box. The answer is spoken, then pai listens a few more seconds for a follow-up. Say "thanks" or press the hotkey again to end.
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
- API keys never reach the UI or terminal commands. From source they stay in `.env` (git-ignored); in the installed app the key pasted in Settings is stored encrypted in the user-data folder. `.env` is never packaged; only the Tavily key is built in on purpose (see [Building installers](#building-installers)).
- Your data (profile, memory, log, reminders) lives in your OS user-data folder, e.g. `~/Library/Application Support/pai` on macOS.
- Reminders you set keep firing while the assistant is switched off, since they're your own notifications. Everything else stops.

## Building installers

```bash
npm run dist        # → dist/pai-<version>.dmg (macOS) or dist/pai Setup <version>.exe (Windows)
```

[`electron-builder.yml`](electron-builder.yml) ships **only** `out/`, `skills/`, `resources/`, `native/bin/` and `package.json` (plus production dependencies), and excludes every `.env` / `.env.*` file anywhere. Nothing else from your `.env` (Nebius key, models, settings) ends up in the installer, so each user pastes their own Nebius key.

**The one exception is web search.** So that it works with no setup, the build puts a Tavily key into the app's code: `PAI_BUILTIN_TAVILY_KEY` if set (the GitHub Windows build sets it from the `TAVILY_API_KEY` repo secret), otherwise `TAVILY_API_KEY` from `.env`. The build prints which key ending it used. Anyone with the installer can extract this key, so use a free-tier key and revoke it when you no longer need it. To build without one, empty `TAVILY_API_KEY` in `.env` first.

To check a build: `npx @electron/asar list dist/mac-arm64/pai.app/Contents/Resources/app.asar | grep .env` prints nothing.

The text helper for *Complete my text* is unpacked next to the app archive (`app.asar.unpacked`) so it can run. macOS builds are signed ad-hoc only (no Apple Developer ID yet), so macOS blocks the first launch of a downloaded copy.

### Opening pai on macOS

If macOS says **"pai" Not Opened – Apple could not verify "pai" is free of malware**, click **Done** (not Move to Trash), then either:

- open **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to *"pai" was blocked*, or
- run `xattr -dr com.apple.quarantine /Applications/pai.app` in Terminal.

You only have to do this once. Right-click → Open no longer skips the check on macOS 15 and later.

## Known limitations

- `summarize_document` reads text formats (`.txt .md .csv .json .html …`), but not PDF or Word yet.
- On macOS, window titles need the Screen Recording permission. Without it, proactive rules only see the app name.
- Notifications from an unsigned dev build may need to be allowed for "Electron" in System Settings → Notifications.
- Complete my text works on macOS and Windows (not Linux yet). Some text boxes don't share their text (Google Docs, some web editors, Chrome/Edge on Windows), so it can't help there.
- Voice input is English-first; the Whisper `base` model is a balance of speed and accuracy.
- The preview window only opens local addresses (`localhost`).
- Quiz answers aren't saved: reopening a chat starts its quiz over.
- The installer isn't signed with an Apple Developer ID or notarized yet, so macOS blocks the first launch (see [Opening pai on macOS](#opening-pai-on-macos)).

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
- [x] 11. Coding assistant, dev servers and the preview window
- [x] 12. Pictures, interactive quizzes, automatic memory
- [x] 13. Paste your API key in the app; installers

## License

Licensed under the **MIT License**, an OSI-approved open source license (see [LICENSE](LICENSE)). Third-party libraries and models (NVIDIA Nemotron, Llama 3.1, Whisper, Kokoro) keep their own licenses.
