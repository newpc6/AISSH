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
	prompt := buildAssistSystemPrompt(aiAssistRequest{SystemPrompt: "优先给出简短结论。"})
	if !strings.Contains(prompt, "只有一个统一入口") {
		t.Fatalf("expected unified entry guidance in prompt")
	}
	if !strings.Contains(prompt, "优先给出简短结论。") {
		t.Fatalf("expected custom system prompt to be included")
	}
}

func TestBuildAssistSystemPromptIncludesSelectedSkills(t *testing.T) {
	prompt := buildAssistSystemPrompt(aiAssistRequest{
		SelectedSkills: []aiSkill{
			{Name: "Linux inspection", Prompt: "Prefer read-only inspection commands first."},
			{Name: "GPU check", Prompt: "When GPU is involved, inspect nvidia-smi before any changes."},
		},
	})
	if !strings.Contains(prompt, "已启用的技能提示") {
		t.Fatalf("expected selected skills section in prompt")
	}
	if !strings.Contains(prompt, "Linux inspection") || !strings.Contains(prompt, "GPU check") {
		t.Fatalf("expected skill names in prompt, got %q", prompt)
	}
}

func TestAssistThinkingCanBeDisabled(t *testing.T) {
	disabled := false
	request, err := normalizeAIAssistRequest(aiAssistRequest{
		BaseURL:              "http://127.0.0.1:11434/v1",
		Model:                "qwen3.6:latest",
		Provider:             "ollama",
		Prompt:               "检查服务状态",
		AgentThinkingEnabled: &disabled,
	})
	if err != nil {
		t.Fatalf("normalize assist request: %v", err)
	}

	chatRequest := openAIChatRequest{}
	applyAgentThinkingOptions(&chatRequest, request)
	if chatRequest.EnableThinking == nil || *chatRequest.EnableThinking {
		t.Fatalf("expected enable_thinking false, got %#v", chatRequest.EnableThinking)
	}
	if chatRequest.Think == nil || *chatRequest.Think {
		t.Fatalf("expected ollama think false, got %#v", chatRequest.Think)
	}
	if chatRequest.ReasoningEffort != "none" {
		t.Fatalf("expected reasoning_effort none, got %q", chatRequest.ReasoningEffort)
	}
	if prompt := buildAssistSystemPrompt(request); !strings.Contains(prompt, "/no_think") {
		t.Fatalf("expected no_think instruction in prompt")
	}
}

func TestNormalizeAIRequestDefaultsThinkingEnabled(t *testing.T) {
	request, err := normalizeAIRequest(aiPredictionRequest{
		BaseURL:         "https://api.anthropic.com/v1",
		Model:           "claude-sonnet-4-0",
		Provider:        "anthropic-claude",
		PredictionCount: 3,
		TerminalContext: "ls -la",
		CommandHistory:  []string{"pwd"},
	})
	if err != nil {
		t.Fatalf("normalize prediction request: %v", err)
	}
	if request.ThinkingEnabled == nil || !*request.ThinkingEnabled {
		t.Fatalf("expected prediction thinking to default to enabled, got %#v", request.ThinkingEnabled)
	}
}

func TestApplyPredictionThinkingOptionsCanBeDisabled(t *testing.T) {
	disabled := false
	request := aiPredictionRequest{
		Provider:        "ollama",
		ThinkingEnabled: &disabled,
	}
	chatRequest := openAIChatRequest{}
	applyPredictionThinkingOptions(&chatRequest, request)
	if chatRequest.EnableThinking == nil || *chatRequest.EnableThinking {
		t.Fatalf("expected enable_thinking false, got %#v", chatRequest.EnableThinking)
	}
	if chatRequest.Think == nil || *chatRequest.Think {
		t.Fatalf("expected ollama think false, got %#v", chatRequest.Think)
	}
	if chatRequest.ReasoningEffort != "none" {
		t.Fatalf("expected reasoning_effort none, got %q", chatRequest.ReasoningEffort)
	}
}

func TestAnthropicMessagesURL(t *testing.T) {
	tests := []struct {
		base string
		want string
	}{
		{base: "https://api.anthropic.com", want: "https://api.anthropic.com/v1/messages"},
		{base: "https://api.anthropic.com/v1", want: "https://api.anthropic.com/v1/messages"},
		{base: "https://api.anthropic.com/v1/messages", want: "https://api.anthropic.com/v1/messages"},
	}
	for _, tt := range tests {
		got, err := anthropicMessagesURL(tt.base)
		if err != nil {
			t.Fatalf("anthropicMessagesURL(%q): %v", tt.base, err)
		}
		if got != tt.want {
			t.Fatalf("anthropicMessagesURL(%q) = %q, want %q", tt.base, got, tt.want)
		}
	}
}

func TestAnthropicContentAndThinking(t *testing.T) {
	content, thinking := anthropicContentAndThinking([]anthropicContentBlock{
		{Type: "thinking", Thinking: "step1"},
		{Type: "text", Text: `{"commands":["pwd"]}`},
	})
	if content != `{"commands":["pwd"]}` {
		t.Fatalf("expected content, got %q", content)
	}
	if thinking != "step1" {
		t.Fatalf("expected thinking, got %q", thinking)
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

func TestBuildPredictionSystemPromptIsReadableChinese(t *testing.T) {
	prompt := buildPredictionSystemPrompt()
	if !strings.Contains(prompt, "SSH 终端命令预测助手") {
		t.Fatalf("expected readable chinese prediction prompt, got %q", prompt)
	}
	if strings.Contains(prompt, "浣犳") {
		t.Fatalf("expected mojibake to be removed, got %q", prompt)
	}
}

func TestNormalizeAIRequestRedactsAndTrimsPredictionInputs(t *testing.T) {
	request, err := normalizeAIRequest(aiPredictionRequest{
		BaseURL:         "http://127.0.0.1:11434/v1",
		Model:           "deepseek-v4-flash",
		PredictionCount: 3,
		TerminalContext: "token=secret-value\nlast line",
		CommandHistory:  []string{" password=super-secret ", "pwd"},
		CurrentCommand:  " api_key=abc123 ",
		HostName:        strings.Repeat("h", 200),
		HostAddress:     strings.Repeat("1", 300),
		Username:        strings.Repeat("u", 200),
	})
	if err != nil {
		t.Fatalf("normalize prediction request: %v", err)
	}
	if strings.Contains(request.TerminalContext, "secret-value") {
		t.Fatalf("expected terminal context to be redacted, got %q", request.TerminalContext)
	}
	if strings.Contains(request.CommandHistory[0], "super-secret") {
		t.Fatalf("expected command history to be redacted, got %#v", request.CommandHistory)
	}
	if strings.Contains(request.CurrentCommand, "abc123") {
		t.Fatalf("expected current command to be redacted, got %q", request.CurrentCommand)
	}
	if len([]rune(request.HostName)) > 120 || len([]rune(request.HostAddress)) > 200 || len([]rune(request.Username)) > 120 {
		t.Fatalf("expected host identity fields to be trimmed, got host=%d addr=%d user=%d",
			len([]rune(request.HostName)), len([]rune(request.HostAddress)), len([]rune(request.Username)))
	}
}
