export function agentExitMarker(stepId: string) {
  return `__AI_SSH_AGENT_DONE_${stepId.replace(/[^A-Za-z0-9_]/g, '_')}__`
}

export function wrapAgentCommand(command: string, marker: string) {
  const normalized = command.replace(/\s+$/g, '')
  return `{\n${normalized}\n}\n__ai_ssh_agent_exit_code=$?\ncommand printf '\\n${marker}%s\\n' "$__ai_ssh_agent_exit_code"\nunset __ai_ssh_agent_exit_code`
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractAgentExitCode(output: string, marker: string) {
  const match = output.match(new RegExp(`${escapeRegExp(marker)}\\s*(-?\\d+)`))
  if (!match) return undefined
  const code = Number(match[1])
  return Number.isFinite(code) ? code : undefined
}

export function isAgentInternalLine(line: string, marker?: string) {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (marker && trimmed.includes(marker)) return true
  if (trimmed.includes('__AI_SSH_AGENT_DONE_')) return true
  return (
    trimmed === '__ai_ssh_agent_exit_code=$?' ||
    trimmed === 'unset __ai_ssh_agent_exit_code' ||
    /^command\s+printf\s+['"]?\\n__AI_SSH_AGENT_DONE_/.test(trimmed) ||
    /^printf\s+['"]?__AI_SSH_AGENT_DONE_/.test(trimmed)
  )
}

export function stripAgentMarker(output: string, marker: string) {
  return output
    .split(/\r?\n/)
    .filter((line) => !isAgentInternalLine(line, marker))
    .join('\n')
}

export function stripVisibleAgentMarkers(output: string) {
  return output
    .split(/\r?\n/)
    .filter((line) => !isAgentInternalLine(line))
    .join('\r\n')
}
