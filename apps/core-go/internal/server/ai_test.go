package server

import (
	"strings"
	"testing"
)

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

func TestFinalizeAssistResponseNormalizesCommandWithoutTask(t *testing.T) {
	response := finalizeAssistResponse(aiAssistResponse{
		AgentCommand: "which nginx",
		Answer:       "检查 nginx 是否在 PATH 中。",
	})

	if response.AgentStatus != "command" {
		t.Fatalf("expected command status, got %q", response.AgentStatus)
	}
	if len(response.Commands) != 1 || response.Commands[0] != "which nginx" {
		t.Fatalf("expected command to be mirrored into commands, got %#v", response.Commands)
	}
	if response.RiskLevel != "low" {
		t.Fatalf("expected low risk, got %q", response.RiskLevel)
	}
}

func TestBuildAssistSystemPromptUsesCustomPromptAsUnifiedPrompt(t *testing.T) {
	prompt := buildAssistSystemPrompt("优先给出简短结论。")
	if !strings.Contains(prompt, "只有一个统一入口") {
		t.Fatalf("expected unified entry guidance in prompt")
	}
	if !strings.Contains(prompt, "优先给出简短结论。") {
		t.Fatalf("expected custom system prompt to be included")
	}
}

func TestAssistContentStreamExtractorReturnsReadableAnswerDelta(t *testing.T) {
	extractor := &assistContentStreamExtractor{}
	var streamed string
	for _, chunk := range []string{
		`{"answer":"第一行`,
		`\n第二行`,
		`","agentStatus":"done"}`,
	} {
		streamed += extractor.Append(chunk)
	}
	if streamed != "第一行\n第二行" {
		t.Fatalf("expected readable answer stream, got %q", streamed)
	}
	if tail := extractor.Finalize(aiAssistResponse{Answer: "第一行\n第二行"}); tail != "" {
		t.Fatalf("expected no duplicate final tail, got %q", tail)
	}
}

func TestAssistContentStreamExtractorFallsBackToFinalAnswer(t *testing.T) {
	extractor := &assistContentStreamExtractor{}
	if text := extractor.Append(`{"agentStatus":"command","agentCommand":"which nginx"`); text != "" {
		t.Fatalf("expected no readable stream before answer-like fields, got %q", text)
	}
	tail := extractor.Finalize(aiAssistResponse{Answer: "需要执行 which nginx 检查。"})
	if tail != "需要执行 which nginx 检查。" {
		t.Fatalf("expected final answer tail, got %q", tail)
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

func TestNormalizeAIRequestTimeoutSeconds(t *testing.T) {
	tests := []struct {
		name  string
		input int
		want  int
	}{
		{name: "default", input: 0, want: 120},
		{name: "minimum", input: 1, want: 10},
		{name: "custom", input: 300, want: 300},
		{name: "maximum", input: 3600, want: 1800},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeAIRequestTimeoutSeconds(tt.input); got != tt.want {
				t.Fatalf("expected %d, got %d", tt.want, got)
			}
		})
	}
}
