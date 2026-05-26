package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type openAIChatRequest struct {
	Model          string                `json:"model"`
	Messages       []openAIChatMessage   `json:"messages"`
	Temperature    float64               `json:"temperature"`
	MaxTokens      int                   `json:"max_tokens,omitempty"`
	ResponseFormat *openAIResponseFormat `json:"response_format,omitempty"`
}

type openAIResponseFormat struct {
	Type string `json:"type"`
}

type openAIChatMessage struct {
	Role             string `json:"role"`
	Content          string `json:"content"`
	ReasoningContent string `json:"reasoning_content,omitempty"`
}

type openAIChatResponse struct {
	Choices []struct {
		Message      openAIChatMessage `json:"message"`
		FinishReason string            `json:"finish_reason"`
	} `json:"choices"`
}

var numberedCommandPattern = regexp.MustCompile(`^\s*(?:[-*]|\d+[.)])\s*`)

const (
	aiDefaultPredictionCount = 3
	aiMaxPredictionCount     = 8
	aiTerminalContextLimit   = 50000
	aiCommandHistoryLimit    = 200
	aiRequestTimeout         = 18 * time.Second
	aiMaxTokens              = 1024
	aiProviderBodyReadLimit  = 1024 * 1024
	aiLogSnippetLimit        = 2000
)

func predictCommands(ctx context.Context, request aiPredictionRequest, logger *appLogger) (aiPredictionResponse, error) {
	normalized, err := normalizeAIRequest(request)
	if err != nil {
		return aiPredictionResponse{}, err
	}

	endpoint, err := chatCompletionsURL(normalized.BaseURL)
	if err != nil {
		return aiPredictionResponse{}, err
	}

	body, err := json.Marshal(openAIChatRequest{
		Model:          normalized.Model,
		Temperature:    0,
		MaxTokens:      aiMaxTokens,
		ResponseFormat: &openAIResponseFormat{Type: "json_object"},
		Messages: []openAIChatMessage{
			{
				Role:    "system",
				Content: "你是 SSH 终端命令预测助手。必须预测用户接下来最可能人工确认执行的 shell 命令，因为最终是否应用由用户确认。你只能在最终 content 中返回严格 JSON，不能返回 Markdown、解释、思考过程或空内容。即使不确定，也要给出保守的查看型命令。不要执行任何操作，不要返回危险或破坏性命令。响应格式必须是 {\"commands\":[\"命令1\",\"命令2\"]}。",
			},
			{
				Role:    "user",
				Content: buildPredictionPrompt(normalized),
			},
		},
	})
	if err != nil {
		return aiPredictionResponse{}, err
	}

	started := time.Now()
	if logger != nil {
		logger.debug("ai", "prediction request prepared", map[string]any{
			"endpoint":             endpoint,
			"model":                normalized.Model,
			"predictionCount":      normalized.PredictionCount,
			"terminalContextChars": len(normalized.TerminalContext),
			"commandHistoryCount":  len(normalized.CommandHistory),
			"currentCommandChars":  len(normalized.CurrentCommand),
			"host":                 normalized.HostName,
			"hasAPIKey":            normalized.APIKey != "",
		})
	}

	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return aiPredictionResponse{}, err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	if normalized.APIKey != "" {
		httpRequest.Header.Set("Authorization", "Bearer "+normalized.APIKey)
	}

	client := &http.Client{Timeout: aiRequestTimeout}
	response, err := client.Do(httpRequest)
	if err != nil {
		if logger != nil {
			logger.error("ai", "provider request failed", map[string]any{
				"endpoint":   endpoint,
				"model":      normalized.Model,
				"error":      err.Error(),
				"durationMs": time.Since(started).Milliseconds(),
			})
		}
		return aiPredictionResponse{}, err
	}
	defer response.Body.Close()

	responseBody, bodyTruncated, err := readLimitedAIResponseBody(response.Body)
	if err != nil {
		if logger != nil {
			logger.error("ai", "provider response read failed", map[string]any{
				"endpoint":   endpoint,
				"model":      normalized.Model,
				"status":     response.StatusCode,
				"error":      err.Error(),
				"durationMs": time.Since(started).Milliseconds(),
			})
		}
		return aiPredictionResponse{}, err
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		bodySnippet := logTextSnippet(string(responseBody))
		if logger != nil {
			logger.error("ai", "provider returned non-success status", map[string]any{
				"endpoint":      endpoint,
				"model":         normalized.Model,
				"status":        response.StatusCode,
				"bodySnippet":   bodySnippet,
				"bodyTruncated": bodyTruncated,
				"durationMs":    time.Since(started).Milliseconds(),
			})
		}
		if bodySnippet != "" {
			return aiPredictionResponse{}, fmt.Errorf("ai provider returned status %d: %s", response.StatusCode, bodySnippet)
		}
		return aiPredictionResponse{}, fmt.Errorf("ai provider returned status %d", response.StatusCode)
	}

	var chatResponse openAIChatResponse
	if err := json.Unmarshal(responseBody, &chatResponse); err != nil {
		if logger != nil {
			logger.error("ai", "provider response decode failed", map[string]any{
				"endpoint":      endpoint,
				"model":         normalized.Model,
				"status":        response.StatusCode,
				"error":         err.Error(),
				"bodySnippet":   logTextSnippet(string(responseBody)),
				"bodyTruncated": bodyTruncated,
				"durationMs":    time.Since(started).Milliseconds(),
			})
		}
		return aiPredictionResponse{}, err
	}
	if len(chatResponse.Choices) == 0 {
		if logger != nil {
			logger.error("ai", "provider returned no choices", map[string]any{
				"endpoint":      endpoint,
				"model":         normalized.Model,
				"status":        response.StatusCode,
				"bodySnippet":   logTextSnippet(string(responseBody)),
				"bodyTruncated": bodyTruncated,
				"durationMs":    time.Since(started).Milliseconds(),
			})
		}
		return aiPredictionResponse{}, errors.New("ai provider returned no choices; see run logs for provider response")
	}

	choice := chatResponse.Choices[0]
	content := choice.Message.Content
	commands := parsePredictedCommands(content, normalized.PredictionCount)
	if len(commands) == 0 {
		if logger != nil {
			logger.error("ai", "provider returned no commands", map[string]any{
				"endpoint":              endpoint,
				"model":                 normalized.Model,
				"status":                response.StatusCode,
				"finishReason":          choice.FinishReason,
				"contentChars":          len(content),
				"contentSnippet":        logTextSnippet(content),
				"reasoningContentChars": len(choice.Message.ReasoningContent),
				"reasoningSnippet":      logTextSnippet(choice.Message.ReasoningContent),
				"bodySnippet":           logTextSnippet(string(responseBody)),
				"bodyTruncated":         bodyTruncated,
				"durationMs":            time.Since(started).Milliseconds(),
			})
		}
		if choice.FinishReason == "length" {
			return aiPredictionResponse{}, errors.New("ai provider output was truncated before final commands; see run logs for provider reasoning")
		}
		return aiPredictionResponse{}, errors.New("ai provider returned no commands; see run logs for provider content")
	}

	if logger != nil {
		logger.debug("ai", "prediction parsed commands", map[string]any{
			"endpoint":      endpoint,
			"model":         normalized.Model,
			"status":        response.StatusCode,
			"finishReason":  choice.FinishReason,
			"commandCount":  len(commands),
			"contentChars":  len(content),
			"bodyTruncated": bodyTruncated,
			"durationMs":    time.Since(started).Milliseconds(),
		})
	}
	return aiPredictionResponse{Commands: commands}, nil
}

func normalizeAIRequest(request aiPredictionRequest) (aiPredictionRequest, error) {
	request.BaseURL = strings.TrimSpace(request.BaseURL)
	request.Model = strings.TrimSpace(request.Model)
	if request.BaseURL == "" {
		return request, errors.New("ai base url is required")
	}
	if request.Model == "" {
		return request, errors.New("ai model is required")
	}
	if request.PredictionCount <= 0 {
		request.PredictionCount = aiDefaultPredictionCount
	}
	if request.PredictionCount > aiMaxPredictionCount {
		request.PredictionCount = aiMaxPredictionCount
	}
	if len(request.TerminalContext) > aiTerminalContextLimit {
		request.TerminalContext = request.TerminalContext[len(request.TerminalContext)-aiTerminalContextLimit:]
	}
	if len(request.CommandHistory) > aiCommandHistoryLimit {
		request.CommandHistory = request.CommandHistory[:aiCommandHistoryLimit]
	}
	return request, nil
}

func readLimitedAIResponseBody(reader io.Reader) ([]byte, bool, error) {
	body, err := io.ReadAll(io.LimitReader(reader, aiProviderBodyReadLimit+1))
	truncated := len(body) > aiProviderBodyReadLimit
	if truncated {
		body = body[:aiProviderBodyReadLimit]
	}
	return body, truncated, err
}

func logTextSnippet(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= aiLogSnippetLimit {
		return value
	}
	return string(runes[:aiLogSnippetLimit]) + "...(truncated)"
}

func chatCompletionsURL(baseURL string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmed == "" {
		return "", errors.New("ai base url is required")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("invalid ai base url")
	}
	if strings.HasSuffix(parsed.Path, "/chat/completions") {
		return trimmed, nil
	}
	return trimmed + "/chat/completions", nil
}

func buildPredictionPrompt(request aiPredictionRequest) string {
	history, _ := json.Marshal(request.CommandHistory)
	return fmt.Sprintf(`当前主机：%s
连接信息：%s@%s
回车前当前命令草稿：%s
需要预测的命令数量：%d
最近命令历史 JSON：%s

终端上下文：
%s

必须预测下一步命令。即使不确定，也返回保守的查看型命令，例如 ls -la、pwd、tail -n 100 nohup.out、ps -ef | grep 进程名。
不要在 content 中输出解释、分析、Markdown 或空内容。
请只返回严格 JSON：{"commands":["命令1","命令2"]}`,
		emptyAsDash(request.HostName),
		emptyAsDash(request.Username),
		emptyAsDash(request.HostAddress),
		request.CurrentCommand,
		request.PredictionCount,
		string(history),
		request.TerminalContext,
	)
}

func emptyAsDash(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "-"
	}
	return value
}

func parsePredictedCommands(content string, limit int) []string {
	if limit <= 0 {
		limit = 3
	}
	content = strings.TrimSpace(content)

	if commands := parseStructuredPredictedCommands(content, limit); len(commands) > 0 {
		return commands
	}

	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start >= 0 && end > start {
		if commands := parseStructuredPredictedCommands(content[start:end+1], limit); len(commands) > 0 {
			return commands
		}
	}

	if looksLikeBrokenStructuredPrediction(content) {
		return nil
	}

	lines := strings.Split(content, "\n")
	commands := make([]string, 0, limit)
	for _, line := range lines {
		line = numberedCommandPattern.ReplaceAllString(line, "")
		line = strings.Trim(strings.TrimSpace(line), "`\"'")
		if line != "" && !looksLikeBrokenStructuredPrediction(line) {
			commands = append(commands, line)
		}
	}
	return cleanPredictedCommands(commands, limit)
}

func parseStructuredPredictedCommands(content string, limit int) []string {
	var structured struct {
		Commands []string `json:"commands"`
	}
	if err := json.Unmarshal([]byte(content), &structured); err == nil && len(structured.Commands) > 0 {
		return cleanPredictedCommands(structured.Commands, limit)
	}

	var array []string
	if err := json.Unmarshal([]byte(content), &array); err == nil && len(array) > 0 {
		return cleanPredictedCommands(array, limit)
	}

	return nil
}

func looksLikeBrokenStructuredPrediction(content string) bool {
	trimmed := strings.TrimSpace(strings.Trim(content, "`"))
	lower := strings.ToLower(trimmed)
	return strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") || strings.Contains(lower, `"commands"`)
}

func cleanPredictedCommands(values []string, limit int) []string {
	seen := map[string]bool{}
	commands := make([]string, 0, limit)
	for _, value := range values {
		command := strings.TrimSpace(strings.Trim(strings.TrimSpace(value), "`\"'"))
		command = strings.TrimSuffix(command, "\r")
		if command == "" || strings.Contains(command, "\n") {
			continue
		}
		if looksLikeBrokenStructuredPrediction(command) || looksDangerousCommand(command) || seen[command] {
			continue
		}
		seen[command] = true
		commands = append(commands, command)
		if len(commands) >= limit {
			break
		}
	}
	return commands
}

func looksDangerousCommand(command string) bool {
	lower := strings.ToLower(strings.TrimSpace(command))
	dangerousPrefixes := []string{
		"rm -rf /",
		"rm -fr /",
		"mkfs",
		"dd if=",
		":(){",
		"shutdown",
		"reboot",
		"halt",
		"poweroff",
	}
	for _, prefix := range dangerousPrefixes {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}
