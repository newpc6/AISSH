# AI SSH Development Plan Document

## 1. Document Purpose

This document defines the development execution plan, milestone breakdown, deliverables, engineering rules, and update process for AI SSH.

It must always stay synchronized with actual project progress. Any significant changes to scope, architecture, priorities, or delivery sequence must be reflected in this document.

## 2. Work Agreements

Project Execution Rules:

1. Every milestone adjustment or scope change must update this document.
2. If changes also affect product design or architecture direction, synchronize updates to `docs/product-design.md`.
3. Each batch of clear changes must have a clean git commit.
4. Implementation must not run ahead of documentation for long periods; plans and actual work should stay synchronized.

Current Repository Status:

- Repository initialized with git
- Currently completed Milestone 0, advancing Milestone 1 / Milestone 2 usability, and building Milestone 3 AI configuration entry ahead of schedule
- Rust / Cargo environment available
- Tauri desktop shell integrated with existing frontend project, completed `cargo check` and `tauri info` validation
- React + TypeScript frontend skeleton, Go core health server, shared contract package, and local integration configuration completed
- Currently in SSH / SFTP MVP usability polishing phase, advancing Milestone 3 basic capabilities
- Implemented: host list, independent group configuration, empty group saving, server card menu, server edit/delete, session interface, SSE output stream, input write interface, input sequential queue, PTY resize sync, session tab close, tab status dot, reconnect after disconnect, per-session terminal output cache, auto-switch or return to empty state after close, hide pseudo tab/connection status when no session, history based on remote shell echo final command, terminal control sequence filtering, alternate screen full-screen program history isolation, passive prompt path tracking, session current path fallback read, `local-demo` terminal demo link, temporary password authentication SSH connection, workbench main layout, fixed viewport layout, left draggable width, top dropdown menu, file menu typed import/export, server list migration with encrypted credentials, settings popup split panes with save prompt, left new SSH connection popup, SSH Key file selection, save failure popup feedback, save success auto-select new server, server basic config local JSON persistence, password / SSH Key system secure storage, Go core request logs, frontend runtime log panel, log level setting with frontend filtering, AI provider failure diagnosis logs, SSE connection failure status feedback, SFTP file list/path input/parent directory/upload/download first version, remote text file CodeMirror preview/edit/save with toolbar, first startup login password setting, initialization not dependent on desktop token, login/initialization password display toggle, desktop startup login switch, post-authentication terminal delayed initialization, server CPU current usage, memory used/total, CPU/memory coordinate trend chart, hover point tooltip with zoom view, metric dot default values and configuration, current server card collapse, disk list, network real-time bandwidth first version, icon button hover tooltip, OpenAI compatible AI command prediction, unified AI input entry, AI prediction and assistant SSE stream return, configurable Chinese system prompt, terminal selected text add to AI, Go core HTTP and remote SSH/SFTP module separation, and API 405 auto-fallback diagnosis

## 3. Delivery Strategy

Advance in stages:

1. First prove desktop shell and SSH core architecture direction is feasible
2. Then deliver truly usable SSH + file transfer MVP
3. After SSH core experience stabilizes, add AI capabilities
4. Finally do stability, polishing, and release preparation

## 4. Milestones

### Milestone 0: Project Startup and Skeleton Building

Objectives:

- Establish repository structure, engineering scaffolding, coding standards, and architecture baseline

Deliverables:

- Basic directory structure
- Frontend project initialization
- Go core service initialization
- Desktop shell solution design implementation
- Basic IPC / API contracts

### Milestone 1: SSH Core MVP

Objectives:

- Achieve usable SSH connection and terminal experience
- Complete basic SFTP file operations
- Implement session management and state persistence

Deliverables:

- Password and SSH key authentication
- Terminal rendering and interaction
- Session tab management
- Basic SFTP browsing and transfer
- Connection status monitoring
- Error handling and reconnection

### Milestone 2: File Management and Monitoring

Objectives:

- Complete file management features
- Add server monitoring capabilities
- Improve user experience

Deliverables:

- File upload and download
- Remote file editing
- Directory navigation
- Server metrics collection
- Real-time monitoring charts
- Performance optimization

### Milestone 3: AI Integration

Objectives:

- Integrate AI capabilities
- Implement command prediction
- Add intelligent assistance

Deliverables:

- AI provider configuration
- Command prediction
- Natural language command generation
- Context-aware suggestions
- Error diagnosis
- Customizable prompts

### Milestone 4: Polish and Release

Objectives:

- Improve stability and performance
- Complete documentation
- Prepare for release

Deliverables:

- Bug fixes and optimizations
- User documentation
- Installation packages
- Release notes
- Marketing materials

## 5. Current Focus

Currently working on:

- SSH connection stability
- Terminal experience optimization
- File management enhancement
- AI capability expansion
- Multi-language support

## 6. Risk Management

### 6.1 Technical Risks

- SSH protocol compatibility issues
- Terminal rendering performance
- Cross-platform differences
- AI API reliability

### 6.2 Mitigation Strategies

- Comprehensive testing on different systems
- Performance monitoring and optimization
- Fallback mechanisms for AI failures
- Regular security audits

## 7. Quality Assurance

### 7.1 Testing Strategy

- Unit tests for core logic
- Integration tests for API endpoints
- End-to-end tests for user workflows
- Performance testing for critical paths

### 7.2 Code Quality

- TypeScript strict mode
- Go linting and formatting
- Code review requirements
- Documentation standards

## 8. Release Process

### 8.1 Version Numbering

- Major version: Significant feature changes
- Minor version: New features, backward compatible
- Patch version: Bug fixes, minor improvements

### 8.2 Release Checklist

- All tests passing
- Documentation updated
- Changelog prepared
- Installation packages built
- Release notes written

## 9. Future Roadmap

### 9.1 Planned Features

- Stronger host key management UI and diagnostics
- Desktop native drag-out download experience
- Team collaboration
- Plugin system
- Cloud synchronization

### 9.2 Long-term Vision

- Web version
- Mobile companion
- Enterprise features
- Community ecosystem

## 10. Success Criteria

- Stable SSH connections across different environments
- Smooth terminal experience
- Reliable file operations
- Useful AI assistance
- Positive user feedback
- Growing user base
