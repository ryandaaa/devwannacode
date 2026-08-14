# DevWannaCode

A lightweight, distraction-free desktop code editor and workspace built for speed, native performance, and offline workflows.

Powered by **Wails v2** (Go backend) and **React 19 / TypeScript / Vite** (Frontend) with embedded **Monaco Editor** and **Windows ConPTY**.

---

## Overview

DevWannaCode is designed with an editorial, edge-to-edge aesthetic that eliminates visual clutter while delivering instant responsiveness. Every interaction—from split editing and real-time LSP diagnostics to integrated terminal sessions—is executed with minimal memory overhead and zero network dependencies.

```
+-------------------------------------------------------------------------+
| [DevWannaCode]  main.go  App.tsx  service.go           [ - ] [ # ] [ X ]|
+--------------+------------------------------------+---------------------+
| EXPLORER     | func main() {                      | TERMINAL: powershell|
| > backend    |     app := NewApp()                | PS D:\project>      |
| > frontend   |     wails.Run(&options.App{        |                     |
|   App.tsx    |         Title: "DevWannaCode",     |                     |
|   main.go    |     })                             |                     |
|   service.go | }                                  |                     |
+--------------+------------------------------------+---------------------+
| ln 24, col 8 | utf-8 | go | git: main (clean)     | devwannacode v1.0   |
+-------------------------------------------------------------------------+
```

---

## Architecture & Design Principles

- **Native Desktop Performance**: Go backend communicates directly with the OS filesystem and Windows ConPTY API through high-speed binary IPC.
- **Minimalist Editorial Surface**: 1px structural hairline borders, flat matte surfaces, and curated themes (Dark, Nord, Monochrome, Light, Warm).
- **100% Offline & Bundled**: Local font definitions (Geist, Inter, JetBrains Mono) and isolated local LSP/AST services.
- **Memory & Resource Safety**:
  - Sandboxed workspace traversal with canonical symlink validation.
  - Non-blocking asynchronous directory crawlers ignoring heavy artifacts (`node_modules`, `.git`, `.next`, `dist`).
  - Strict payload caps for memory-safe binary previews.
  - Safe exit protection detecting dirty/unsaved editor buffers.

---

## Core Capabilities

### 1. Code Editor (Monaco)
- Multi-buffer tab management with dirty state tracking and disk conflict detection.
- Split-pane editor (`Ctrl+\`) with independent scrolling and buffer synchronization.
- Real-time Language Server Protocol (LSP) integration with debounce optimizations.
- Native code actions: duplicate line (`Shift+Alt+Up/Down`), move line (`Alt+Up/Down`), toggle comments (`Ctrl+/`), and word wrap toggle (`Alt+Z`).
- Embedded preview engines for Markdown (rendered via DOMPurify) and images (PNG, JPG, SVG, WebP).

### 2. Integrated Terminal (ConPTY / PTY)
- Native Windows Pseudo Console (ConPTY) backend with fallback shell detection (PowerShell, CMD, Bash).
- Multi-tab terminal manager with independent session states, rename support, and auto-fit resize hooks (`xterm.js`).
- Low-latency bi-directional streaming over local channels.

### 3. Navigation & Workspace Search
- **Quick Open** (`Ctrl+P`): Sub-millisecond workspace file lookup with stale request suppression.
- **Command Palette** (`Ctrl+K`): Fast access to workspace actions, layout toggles, and formatting tools.
- **Global Text Search** (`Ctrl+Shift+F`): Multi-threaded text scanner with binary bypass and file size safety cutoffs.
- **Fuzzy File Tree**: Recursive explorer with keyboard inline rename (`F2`), drag-and-drop file movement, and native OS reveal.

---

## Keyboard Shortcuts

| Action | Shortcut | Scope |
| :--- | :--- | :--- |
| **Quick Open (File Search)** | `Ctrl + P` | Global |
| **Command Palette** | `Ctrl + K` | Global |
| **Global Search in Files** | `Ctrl + Shift + F` | Global |
| **Toggle Left Explorer** | `Ctrl + B` | Global |
| **Toggle Terminal Panel** | `Ctrl + \`` | Global |
| **Split Editor Right** | `Ctrl + \` | Editor |
| **Toggle Word Wrap** | `Alt + Z` | Editor |
| **Duplicate Line Up / Down** | `Shift + Alt + Up / Down` | Editor |
| **Move Line Up / Down** | `Alt + Up / Down` | Editor |
| **Toggle Line Comment** | `Ctrl + /` | Editor |
| **Inline Rename in Explorer** | `F2` | Explorer |
| **Next / Previous Tab** | `Ctrl + Tab` / `Ctrl + Shift + Tab` | Editor |
| **Save / Save All** | `Ctrl + S` / `Ctrl + Shift + S` | Editor |
| **Zen Mode Toggle** | `F11` | Global |

---

## Getting Started

### Prerequisites
- **Go**: `1.21` or higher
- **Node.js**: `18.x` or higher (`npm` included)
- **Wails CLI v2**: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- **C/C++ Compiler** (Windows: MinGW-w64 or Visual Studio C++ Build Tools)

### Development Workflow

```powershell
# Clone the repository
git clone https://github.com/your-username/devwannacode.git
cd devwannacode

# Run live development mode with hot-reload
wails dev
```

### Production Build

```powershell
# 1. Compile frontend assets
cd frontend
npm run build
cd ..

# 2. Compile native desktop binary with stripped debug symbols
wails build -clean -ldflags "-s -w"
```

The optimized binary will be generated inside `build/bin/DevWannaCode.exe`.

---

## CLI Integration (`dwc`)

To launch DevWannaCode directly from PowerShell or Terminal, register the helper command:

```powershell
.\scripts\install-dwc.ps1 -InstallDirectory "C:\Program Files\DevWannaCode"
```

### Usage Examples

```powershell
dwc                 # Launch DevWannaCode
dwc .               # Open current directory as workspace
dwc D:\projects\app # Open specific project directory
```

---

## Project Structure

```
devwannacode/
├── app.go                  # Core application lifecycle & window controller
├── main.go                 # Application entrypoint & Wails configuration
├── wails.json              # Wails project manifest
├── backend/
│   ├── filesystem/         # Filesystem scanner, watcher, search & security
│   ├── terminal/           # ConPTY / PTY process session manager
│   ├── git/                # Git status parser & branch watcher
│   ├── lsp/                # Language Server Protocol WebSocket bridge
│   └── settings/           # Workspace state & preference persistence
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Main UI shell, layout state & shortcut engine
│   │   ├── components/     # Editor, Explorer, Terminal, Search, TopBar, Modals
│   │   ├── services/       # LSP client & custom event emitters
│   │   └── types/          # Shared TypeScript interfaces
│   └── vite.config.ts      # Vite bundling & code-splitting configuration
└── build/
    ├── appicon.png         # Master application icon
    ├── windows/            # Windows manifest, version info, installer scripts
    └── linux/              # Linux desktop assets and icons
```

---

## License

MIT License. Developed by ryandaaa.
