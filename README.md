# kelden-web

Interactive terminal-style web experience for Kelden Lin. The app wraps a locally hosted large language model (LLM) using [@wllama/wllama](https://github.com/wllama/wllama) and presents it through a playful `zsh`-inspired interface.

## Features
- Local-first chat with Kelden’s AI clone powered by @wllama/wllama.
- Download, load, and unload GGUF models directly in the browser (SharedArrayBuffer ready).
- Rich terminal UI with command history, live progress feedback, and streaming responses.
- Slash-command router for operational tasks (`/download`, `/load`, `/chat`, and more).
- React 19 + Vite 7 + Tailwind CSS 4 with the experimental React Compiler enabled.

## Prerequisites
- Node.js 18.17+ or 20+ (required by Vite 7 and React 19).
- npm 9+ (ships with current Node LTS releases).

Run `node -v` and `npm -v` if you need to confirm your local tooling.

## Getting Started
```bash
npm install        # install dependencies
npm run dev        # start Vite dev server
```

The dev server enables the Cross-Origin-Opener/Embedder headers needed for WASM multithreading. Open the printed URL in a desktop browser that supports SharedArrayBuffer (Chrome, Edge, Firefox with proper flags, Safari 17+).

### Additional npm scripts
- `npm run build` – type-check and produce a production build.
- `npm run preview` – serve the built assets locally.
- `npm run lint` – run ESLint across the project.

## Using the Terminal
When the page loads you’ll see a login banner and usage hints. All interactions happen through slash commands or by typing a prompt directly after loading a model.

### Model lifecycle
1. `/download` – fetches the default 639 MB Qwen 0.6B GGUF model (with live progress bar).
2. `/load` – loads the most recently downloaded model into memory.
3. `/chat <message>` – sends a prompt to the loaded model. Responses stream token-by-token.
4. `/unload` – frees the model from memory.

If you attempt to chat before loading a model you’ll receive guidance to download/load first.

### Command reference
| Command | Aliases | Description |
| --- | --- | --- |
| `/help [command]` | `/h`, `/?` | List commands or show detailed help. |
| `/status [--json] [--quiet\|-q]` | – | Inspect download state, load status, and session stats. |
| `/download` | – | Download the primary model bundle with progress feedback. |
| `/load` | – | Load the downloaded model into the wllama runtime. |
| `/unload` | – | Unload the currently active model. |
| `/clear` | `/cls` | Clear the terminal output. |
| `/exit` | – | End the session and lock input. |
| `/chat <message>` | – | Chat with the model (only works when a model is loaded). |

Tip: `Ctrl+C` inside the textarea commits the current input as a user message, mirroring a shell interrupt.

## Configuration Notes
- Model metadata, default download list, and inference parameters live in `src/utils/wllama/config.ts`. Update `LIST_MODELS` to offer new GGUF URLs or tweak defaults such as `nPredict`.
- The terminal UI, including window controls and sizing logic, is defined in `src/components/Terminal.tsx`.
- Slash command definitions are centralized in `src/slash/commands.ts`, and the router is created in `src/slash/index.ts`.

## Assets & Styling
- Tailwind CSS 4 is imported globally from `src/index.css`.
- The background image served from `public/26-Tahoe-Dark-6K-thumb.jpg` fills the page behind the terminal.

## Troubleshooting
- If you see `zsh: no llm loaded`, run `/download` followed by `/load`.
- Browser must fully support SharedArrayBuffer; otherwise WASM multithreading will fail. Check the console for COOP/COEP warnings.
- On slow networks, keep the tab active during `/download` to avoid throttled progress events.

Happy hacking! Feel free to adapt the prompts, system message, or command set to match other personas or workflows.
