# AI SSH Development Plan

## 1. Document Purpose

This document defines the execution plan, milestone breakdown, deliverables, engineering rules, and update process for AI SSH.

It must stay synchronized with actual project progress. Any meaningful scope, architecture, or sequence adjustment must be reflected here before or together with the corresponding implementation change.

## 2. Working Agreement

Project execution rules:

1. Every milestone or scope adjustment updates this file.
2. If the adjustment also affects product direction or architecture, update `docs/product-design.md` in the same change.
3. After each completed adjustment or implementation batch, create a git commit with a clear message.
4. Do not allow the implementation to drift far ahead of the documented plan.

Current repository note:

- The current workspace is not yet initialized as a git repository.
- Before implementation begins, run `git init` and create the initial baseline commit for these documents.

## 3. Delivery Strategy

Build in phases:

1. Prove the desktop shell and SSH core architecture
2. Deliver a genuinely usable SSH + file transfer MVP
3. Add AI assistance on top of a solid operational product
4. Polish, harden, and prepare for broader release

## 4. Milestones

## Milestone 0: Project Bootstrap

Goal:

- Establish the repo, app skeleton, coding standards, and architecture baseline

Deliverables:

- Git repository initialized
- Monorepo or structured workspace layout created
- Tauri desktop shell initialized
- React + TypeScript frontend initialized
- Go core service initialized
- Basic IPC contract defined
- CI baseline
- Lint, format, and test scripts
- This development plan and product design document committed

Suggested structure:

- `apps/desktop`
- `apps/core-go`
- `packages/shared-contracts`
- `docs/`

Exit criteria:

- App can open desktop shell
- Frontend can call a simple core health-check
- Initial docs and repo structure are committed

## Milestone 1: SSH Core Connectivity

Goal:

- Deliver reliable SSH connections and terminal streaming

Deliverables:

- Host model and local persistence
- Password/private key/agent auth support
- Known hosts verification flow
- Terminal tab management
- xterm.js integration
- SSH session open/close/reconnect flow
- Basic command history

Exit criteria:

- User can save a host and open an interactive shell
- Terminal is stable for daily command execution
- Disconnect/reconnect states are handled clearly

## Milestone 2: File Management and Transfer

Goal:

- Make remote file operations practical and fast

Deliverables:

- Remote file browser
- Upload/download
- Drag-and-drop transfer
- Progress reporting
- Retry and failure handling
- Basic file operations

Exit criteria:

- User can browse remote files and transfer files reliably
- Common transfer failures are visible and recoverable

## Milestone 3: AI Copilot Foundation

Goal:

- Add AI features that are useful, safe, and controllable

Deliverables:

- AI provider abstraction
- Settings for provider/model/API key
- Explain error/output action
- Natural language to command draft
- Risk classification for suggested commands
- AI audit entries

Exit criteria:

- User can ask AI to explain output or draft a command
- AI suggestions are reviewable and never auto-run by default

## Milestone 4: UX Polish and Productivity

Goal:

- Make the tool feel fast, refined, and habit-forming

Deliverables:

- Split panes
- Quick commands/snippets
- Better keyboard shortcuts
- Theme polish
- Empty/error state polish
- Transfer manager UI improvements
- Search and filtering in hosts and sessions

Exit criteria:

- Product is comfortable for daily power-user workflows

## Milestone 5: Hardening and Release Preparation

Goal:

- Improve reliability, packaging, observability, and release readiness

Deliverables:

- Crash recovery behaviors
- Better structured logging
- Telemetry hooks if enabled by settings
- Packaging and signing pipeline
- Update strategy
- Performance tuning
- Security review checklist

Exit criteria:

- Cross-platform release candidates can be generated reliably

## 5. Initial Technical Tasks

Recommended immediate next implementation tasks:

1. Initialize git repository
2. Create base folder structure
3. Scaffold Tauri 2 + React + TypeScript app
4. Scaffold Go core sidecar
5. Define IPC contract for:
   - app health
   - host CRUD
   - session open/close
   - terminal stream events
6. Set up lint, formatting, and test commands
7. Create baseline CI workflow

## 6. Engineering Standards

### Architecture rules

- Keep SSH and SFTP logic in Go core, not in frontend code.
- Keep UI and core communication contract explicit and versionable.
- Avoid coupling AI provider code directly into terminal UI components.

### Product rules

- AI suggestions require user review before execution.
- Host key verification cannot be skipped silently.
- Sensitive secrets should use OS-backed secure storage whenever possible.

### Documentation rules

- Update milestone status in this document when scope or progress changes.
- Record any milestone split/merge/resequence here immediately.

## 7. Plan Tracking

Current status:

- Milestone 0: In progress
- Milestone 1: Not started
- Milestone 2: Not started
- Milestone 3: Not started
- Milestone 4: Not started
- Milestone 5: Not started

Near-term checklist:

- [x] Define product direction
- [x] Define development milestones
- [ ] Initialize git repository
- [ ] Create scaffolded workspace
- [ ] Implement core-to-frontend health-check

## 8. Git Commit Convention

Recommended commit style:

- `docs: add initial product design and development plan`
- `chore: initialize tauri desktop workspace`
- `feat(core): add ssh session manager`
- `feat(files): add sftp upload and download`
- `feat(ai): add command explanation flow`
- `docs(plan): update milestone sequencing`

Rule:

- If a change alters planned scope or sequence, the related commit must include the plan update in the same commit or in an immediately adjacent commit.

## 9. Risks and Mitigations

### Risk: architecture spread too early

Mitigation:

- Keep browser version as a future reuse target, not a day-one delivery target.

### Risk: AI features distract from SSH basics

Mitigation:

- Do not start Milestone 3 until Milestones 1 and 2 are usable.

### Risk: security debt

Mitigation:

- Treat secret storage, host verification, and command safety as MVP concerns.

### Risk: UI polish slows core delivery

Mitigation:

- Use a staged approach: strong shell first, deep polish after main workflows work.

## 10. Change Management Rule

Whenever implementation direction changes:

1. Update this file first or in the same change set
2. Update `docs/product-design.md` if architectural assumptions changed
3. Commit the documentation update with the related code change
4. Keep milestone status accurate
