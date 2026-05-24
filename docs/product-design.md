# AI SSH Product Design

## 1. Document Purpose

This document defines the product goals, target users, capability scope, architecture direction, technology choices, and non-functional requirements for AI SSH.

It is the baseline design document for follow-up implementation. If major product, architecture, or milestone scope changes happen later, this document must be updated together with `docs/development-plan.md`.

## 2. Product Vision

Build a modern SSH tool that feels as smooth as a native desktop client, while adding practical AI capabilities that improve daily operations instead of becoming a gimmick.

Core experience goals:

- Fast connection and terminal interaction
- Good-looking and easy-to-use interface
- Efficient server and session management
- Convenient file upload, download, and remote file browsing
- AI-assisted commands, diagnostics, and operational guidance
- Safe, auditable, controllable AI behavior
- Cross-platform delivery for Windows, macOS, and Linux

## 3. Target Users

### 3.1 Primary users

- Developers
- DevOps / SRE engineers
- Backend engineers
- Small teams maintaining cloud hosts
- AI application developers who often manage remote GPU servers

### 3.2 Typical scenarios

- Connect to multiple hosts quickly
- Keep multiple tabs and sessions organized
- Browse remote directories and transfer files
- View logs and run common commands efficiently
- Let AI explain error messages and suggest commands
- Turn natural language into reviewed shell commands
- Summarize server state and recent operational context

## 4. Product Principles

- Desktop-first: terminal, clipboard, drag-and-drop, and file transfer should feel local and responsive.
- AI as copilot, not autopilot: AI suggestions must be reviewable and controllable.
- Security by default: host verification, secrets protection, audit logging, and permission boundaries are first-class.
- Progressive capability: deliver a strong SSH core first, then layer AI and collaboration.
- Reusable architecture: even if desktop is the first product form, backend/core modules should be reusable by a future browser version.

## 5. Form Factor Decision

## 5.1 Options considered

### Option A: Browser-based frontend + backend service

Pros:

- Easy remote access from any browser
- Centralized deployment and updates
- Good for team collaboration and managed enterprise scenarios

Cons:

- Terminal and local integration feel weaker than desktop
- Local key management, agent integration, drag-and-drop, and filesystem access are more complex
- More security complexity around browser-to-backend transport
- Offline and local-only usage experience is worse

### Option B: Electron desktop app

Pros:

- Mature ecosystem
- Excellent support for terminal UI, local filesystem, tray, notifications, and auto-update
- Good compatibility with frontend stacks

Cons:

- Larger package size and higher memory footprint
- Security hardening requires discipline
- JavaScript/Node backend is workable, but not ideal for high-confidence SSH core code

### Option C: Go cross-platform app with native or webview UI

Pros:

- Strong fit for SSH, SFTP, connection management, concurrency, and packaging
- Good binary portability and low resource usage
- Easier to build a reusable core engine

Cons:

- Pure native UI stacks slow down product iteration
- UI polish cost is higher unless a webview-based shell is used
- Some ecosystem choices are less mature than frontend web tooling

### Option D: Hybrid desktop architecture

Recommended structure:

- UI: web frontend
- Desktop shell: Tauri 2
- Core engine: Go service/library

Pros:

- Better UX than pure browser delivery
- Lower memory footprint than Electron
- Strong fit for SSH/SFTP implemented in Go
- Clean separation between UI and connection engine
- Future backend/API reuse remains possible

Cons:

- Slightly more moving parts
- Need to define IPC and process lifecycle carefully

## 5.2 Recommended decision

Recommend **desktop-first hybrid architecture**:

- **Frontend**: React + TypeScript + a desktop-oriented component system
- **Desktop shell**: Tauri 2
- **Core engine**: Go

This gives the best balance for this product in the current phase.

Reasoning:

1. SSH, SFTP, key handling, concurrent sessions, and file streaming fit Go very well.
2. A browser UI alone cannot match desktop ergonomics for terminal, local file integration, drag-and-drop upload/download, and agent-related workflows.
3. Electron is still viable, but Tauri + Go is a better long-term fit for lower overhead and a cleaner separation between UI and core.
4. The frontend remains web-tech based, so UI development speed and visual quality stay high.

## 6. High-Level Product Scope

## 6.1 MVP scope

- Host management
  - Save hosts, tags, and groups
  - Support password, private key, and agent-based authentication
  - Host key verification and known_hosts handling
- Terminal
  - Multi-tab and split sessions
  - Reconnect and session history
  - Search within terminal output
  - Preset snippets / quick commands
- File management
  - Remote file tree browsing
  - Upload/download
  - Drag-and-drop transfers
  - Basic file operations: rename, mkdir, delete, move
- AI assistance
  - Explain command output and errors
  - Suggest shell commands from natural language
  - Suggest next steps for common ops tasks
  - Summarize server status and recent terminal context
- Usability
  - Dark/light theme
  - Keyboard shortcuts
  - Connection health indicators
  - Transfer progress and retry feedback

## 6.2 Post-MVP scope

- Port forwarding management
- SSH tunnel templates
- Cluster/server fleet view
- Multi-host execution with review
- Remote editor integration
- Team sharing / encrypted sync
- RBAC / enterprise policy controls
- Session recording and enhanced audit trails
- Browser companion version

## 7. AI Capability Design

## 7.1 AI use cases

- Error explanation: explain stderr/stdout in plain language
- Command generation: natural language to shell command draft
- Command completion: recommend likely next commands based on context
- Safety review: warn on risky commands
- Log summarization: summarize selected log output
- Ops assistant: answer "how do I do X on this server" using session context

## 7.2 AI interaction rules

- AI-generated commands must never auto-run by default.
- The user must explicitly review and execute suggested commands.
- Risky commands must display warnings and require confirmation.
- Sensitive data sent to AI must be masked where possible.
- Users must be able to disable AI completely.
- AI features should support configurable providers and model settings.

## 7.3 AI context sources

- Current terminal buffer
- Selected text
- Recent commands and outputs
- Current path and OS info
- Optional host metadata

## 7.4 AI provider abstraction

Define a provider-neutral AI service layer:

- OpenAI-compatible providers first
- Local model endpoint optional later
- Per-feature prompt templates
- Structured response schema for commands, summaries, warnings, and explanations

## 8. UX Design Direction

The UI should feel like a serious productivity tool, not a demo.

### Layout

- Left sidebar: hosts, groups, saved connections
- Main area: terminal tabs, split panes, file manager, AI panel
- Right side panel or bottom drawer: AI assistant, command explanation, transfer tasks

### Key UX requirements

- Fast connect flow
- Clear active host/session state
- Dense but readable information layout
- Minimal friction for upload/download
- Keyboard-first operation for power users
- Good empty states and error states

### Visual direction

- Clean dark theme first, with light theme support
- Restrained color usage with clear status colors
- Small-radius panels and dense layouts
- Strong typography and icon consistency

## 9. Technical Architecture

## 9.1 Architecture overview

Use a three-layer desktop architecture:

1. Presentation layer
   - React + TypeScript
   - xterm.js for terminal rendering
   - File manager, AI panel, settings, connection views
2. Desktop integration layer
   - Tauri commands/events
   - Window lifecycle, filesystem dialogs, tray, notifications, secure local storage integration
3. Core engine
   - Go-based SSH/SFTP/session service
   - Connection pool
   - Transfer engine
   - AI orchestration adapter

## 9.2 Why Go for the core

- Strong SSH ecosystem and standard concurrency primitives
- Easier to build resilient long-lived sessions
- Efficient streaming for terminal and file transfer
- Reusable core for later CLI or server-side reuse

Suggested packages to evaluate during implementation:

- `golang.org/x/crypto/ssh`
- `golang.org/x/crypto/ssh/agent`
- `golang.org/x/crypto/ssh/knownhosts`
- `github.com/pkg/sftp`

## 9.3 Process model

Recommended approach:

- Tauri app launches the Go core as a managed sidecar process.
- Frontend communicates with the Tauri layer.
- Tauri and Go communicate through structured IPC.
- Session streams use event-based transport, with chunked terminal and transfer updates.

Why this model:

- Keeps SSH logic outside the frontend runtime
- Easier crash isolation and restart behavior
- Cleaner security boundary than exposing raw local capabilities to the UI

## 9.4 Data model overview

Core domain entities:

- Host
- CredentialRef
- Session
- TransferTask
- AISuggestion
- CommandTemplate
- Setting

## 10. Security Design

Security is a product requirement, not a later enhancement.

### Minimum requirements

- Encrypted local secret storage via OS credential vault where possible
- Strict host key verification with manageable trust-on-first-use flow
- Clear distinction between saved credentials and session-only credentials
- Audit trail for AI-generated command suggestions and user execution
- No default silent command execution from AI
- Configurable redaction before sending context to AI provider

### Security boundaries

- Frontend should not directly manage raw SSH secrets when avoidable.
- Core engine owns connection establishment and secret use.
- Tauri capabilities must be minimal and explicit.

## 11. Local Data Storage

Recommended local persistence:

- SQLite for app metadata
- OS keychain / credential manager for sensitive secrets
- Structured logs on disk with retention settings

Data categories:

- Hosts and groups
- UI preferences
- Command history / snippets
- Transfer history
- AI settings and audit entries

## 12. Sync and Future Collaboration Model

Initial release should be local-first.

Future optional capabilities:

- Encrypted cloud sync
- Team workspace sharing
- Shared host catalogs
- Team policies and approvals

These should not block MVP architecture, but data structures should avoid making later sync impossible.

## 13. Recommended Tech Stack

### Frontend

- React
- TypeScript
- Vite
- TanStack Router
- TanStack Query
- Zustand or Jotai
- Tailwind CSS
- a11y-friendly headless component primitives
- xterm.js

### Desktop

- Tauri 2

### Core

- Go 1.24+
- SSH/SFTP libraries listed above

### Storage

- SQLite
- OS keychain integration

### Testing

- Frontend: Vitest + Testing Library
- E2E: Playwright
- Go: standard `go test`

## 14. Decision Summary

Final recommendation:

- Build **desktop-first**
- Use **Tauri 2 + React + TypeScript** for product UI
- Use **Go** for SSH/SFTP/AI orchestration core
- Design the core and data model so a future browser/server mode can reuse major parts

This is the best tradeoff between:

- UX quality
- cross-platform delivery
- SSH reliability
- performance
- security
- future extensibility

## 15. Open Questions

These can be resolved during milestone 0 and milestone 1:

- Which AI providers ship in v1
- Whether shell snippets are local only or sync-ready
- Whether terminal session replay is in MVP or post-MVP
- Whether port forwarding enters MVP
- Which enterprise features are intentionally deferred

## 16. Change Management Rule

Whenever architecture direction, milestone scope, or delivery sequence changes:

1. Update this document
2. Update `docs/development-plan.md`
3. Commit both changes in git together with the related implementation change when applicable
