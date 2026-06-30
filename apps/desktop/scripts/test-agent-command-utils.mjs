import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const desktopRoot = new URL('..', import.meta.url)
const desktopPath = dirname(new URL('../package.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const repoPath = dirname(new URL('../../../package.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const workspace = await mkdtemp(join(tmpdir(), 'ai-ssh-agent-utils-'))

try {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: true,
      outDir: 'dist',
      rootDir: join(desktopPath, 'src'),
    },
    files: [join(desktopPath, 'src', 'agentCommand.ts')],
  }
  const tsconfigPath = join(workspace, 'tsconfig.json')
  await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2))
  const tscBin = join(repoPath, 'node_modules', 'typescript', 'bin', 'tsc')
  await execFileAsync(process.execPath, [tscBin, '-p', tsconfigPath], { cwd: desktopRoot })

  const compiledUtils = join(workspace, 'dist', 'agentCommand.js')
  const {
    agentExitMarker,
    extractAgentExitCode,
    isAgentInternalLine,
    stripAgentMarker,
    stripVisibleAgentMarkers,
    wrapAgentCommand,
  } = await import(pathToFileURL(compiledUtils))

  const marker = agentExitMarker('step-1.with spaces')
  const wrapped = wrapAgentCommand('printf "hello"\n# trailing comment', marker)
  assert.match(wrapped, /^\{\n/)
  assert.match(wrapped, /\n\}\n__ai_ssh_agent_exit_code=\$\?/)
  assert.match(wrapped, /command printf '\\n__AI_SSH_AGENT_DONE_step_1_with_spaces__%s\\n'/)
  assert.ok(!wrapped.includes('# trailing comment\ncommand printf'), 'marker must not be appended to a comment line')

  assert.equal(extractAgentExitCode(`hello\r\n${marker}0\r\n`, marker), 0)
  assert.equal(extractAgentExitCode(`hello\r\n${marker} 127\r\n`, marker), 127)
  assert.equal(extractAgentExitCode(`hello\r\n${marker}-1\r\n`, marker), -1)
  assert.equal(extractAgentExitCode('hello without marker', marker), undefined)
  assert.equal(isAgentInternalLine('{'), false)
  assert.equal(isAgentInternalLine('}'), false)
  assert.equal(isAgentInternalLine('__ai_ssh_agent_exit_code=$?'), true)
  assert.equal(isAgentInternalLine('(base) user@host:~$ __ai_ssh_agent_exit_code=$?'), true)
  assert.equal(isAgentInternalLine('(base) user@host:~$ unset __ai_ssh_agent_exit_code'), true)
  assert.equal(isAgentInternalLine('(base) user@host:~$ {'), true)
  assert.equal(isAgentInternalLine('> }'), true)
  assert.equal(isAgentInternalLine(`> command printf '\\n${marker}%s\\n' "$__ai_ssh_agent_exit_code"`), true)

  const rawOutput = [
    'echo before',
    '{',
    '(base) user@host:~$ {',
    '__ai_ssh_agent_exit_code=$?',
    '(base) user@host:~$ __ai_ssh_agent_exit_code=$?',
    `command printf '\\n${marker}%s\\n' "$__ai_ssh_agent_exit_code"`,
    'visible output',
    '}',
    '> }',
    `${marker}2`,
    '(base) user@host:~$ unset __ai_ssh_agent_exit_code',
  ].join('\n')
  assert.equal(stripAgentMarker(rawOutput, marker), 'echo before\n{\nvisible output\n}')
  assert.equal(
    stripVisibleAgentMarkers(rawOutput),
    'echo before\r\n{\r\nvisible output\r\n}',
  )
} finally {
  await rm(workspace, { recursive: true, force: true })
}
