package server

import "testing"

func TestParsePredictedCommandsRejectsBrokenStructuredContent(t *testing.T) {
	commands := parsePredictedCommands(`{"commands":["docker ps -a`, 3)
	if len(commands) != 0 {
		t.Fatalf("expected broken JSON-like response to be rejected, got %#v", commands)
	}

	commands = parsePredictedCommands(`{"commands":["ls -la","./start`, 3)
	if len(commands) != 0 {
		t.Fatalf("expected truncated JSON-like response to be rejected, got %#v", commands)
	}

	commands = cleanPredictedCommands([]string{`{"commands":["ls -la","./start`}, 3)
	if len(commands) != 0 {
		t.Fatalf("expected JSON-like command candidate to be rejected, got %#v", commands)
	}
}

func TestParsePredictedCommandsAcceptsStructuredJSON(t *testing.T) {
	commands := parsePredictedCommands(`{"commands":["docker ps -a","pwd"]}`, 3)
	if len(commands) != 2 || commands[0] != "docker ps -a" || commands[1] != "pwd" {
		t.Fatalf("expected commands from structured JSON, got %#v", commands)
	}
}

func TestParsePredictedCommandsKeepsPlainTextFallback(t *testing.T) {
	commands := parsePredictedCommands("1. docker ps -a\n2. pwd", 3)
	if len(commands) != 2 || commands[0] != "docker ps -a" || commands[1] != "pwd" {
		t.Fatalf("expected commands from plain text fallback, got %#v", commands)
	}
}

func TestParseAssistResponseAcceptsAgentJSON(t *testing.T) {
	response, err := parseAssistResponse(`{"agentStatus":"command","agentCommand":"sudo apt update","agentReason":"更新软件源","answer":"先更新软件源","riskLevel":"high"}`)
	if err != nil {
		t.Fatalf("expected assist response to parse: %v", err)
	}
	response = normalizeAgentAssistResponse(response)
	if response.AgentStatus != "command" || response.AgentCommand != "sudo apt update" || response.RiskLevel != "high" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestRedactSensitiveText(t *testing.T) {
	redacted := redactSensitiveText(`password=secret token: abc123 Authorization: Bearer very-secret`)
	if redacted == "" || redacted == `password=secret token: abc123 Authorization: Bearer very-secret` {
		t.Fatalf("expected sensitive text to be redacted, got %q", redacted)
	}
	if redacted == "password=secret" || redacted == "token: abc123" {
		t.Fatalf("redaction did not apply: %q", redacted)
	}
}
