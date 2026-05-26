package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type openAIChatRequest struct {
	Model       string              `json:"model"`
	Messages    []openAIChatMessage `json:"messages"`
	Temperature float64             `json:"temperature"`
	MaxTokens   int                 `json:"max_tokens,omitempty"`
}

type openAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIChatResponse struct {
	Choices []struct {
		Message openAIChatMessage `json:"message"`
	} `json:"choices"`
}

var numberedCommandPattern = regexp.MustCompile(`^\s*(?:[-*]|\d+[.)])\s*`)

const (
	aiDefaultPredictionCount = 3
	aiMaxPredictionCount     = 8
	aiTerminalContextLimit   = 50000
	aiCommandHistoryLimit    = 200
	aiRequestTimeout         = 18 * time.Second
	aiMaxTokens              = 260
)

func predictCommands(ctx context.Context, request aiPredictionRequest) (aiPredictionResponse, error) {
	normalized, err := normalizeAIRequest(request)
	if err != nil {
		return aiPredictionResponse{}, err
	}

	endpoint, err := chatCompletionsURL(normalized.BaseURL)
	if err != nil {
		return aiPredictionResponse{}, err
	}

	body, err := json.Marshal(openAIChatRequest{
		Model:       normalized.Model,
		Temperature: 0.2,
		MaxTokens:   aiMaxTokens,
		Messages: []openAIChatMessage{
			{
				Role:    "system",
				Content: "你是 SSH 终端命令预测助手。你只能返回严格 JSON，不能返回 Markdown。请根据当前终端上下文预测用户最可能执行的下一步 shell 命令。不要解释，不要执行任何操作，不要返回危险或破坏性命令。响应格式必须是 {\"commands\":[\"命令1\",\"命令2\"]}。",
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
		return aiPredictionResponse{}, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return aiPredictionResponse{}, fmt.Errorf("ai provider returned status %d", response.StatusCode)
	}

	var chatResponse openAIChatResponse
	if err := json.NewDecoder(response.Body).Decode(&chatResponse); err != nil {
		return aiPredictionResponse{}, err
	}
	if len(chatResponse.Choices) == 0 {
		return aiPredictionResponse{}, errors.New("ai provider returned no choices")
	}

	commands := parsePredictedCommands(chatResponse.Choices[0].Message.Content, normalized.PredictionCount)
	if len(commands) == 0 {
		return aiPredictionResponse{}, errors.New("ai provider returned no commands")
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

	var structured struct {
		Commands []string `json:"commands"`
	}
	if err := json.Unmarshal([]byte(content), &structured); err == nil && len(structured.Commands) > 0 {
		return cleanPredictedCommands(structured.Commands, limit)
	}

	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start >= 0 && end > start {
		if err := json.Unmarshal([]byte(content[start:end+1]), &structured); err == nil && len(structured.Commands) > 0 {
			return cleanPredictedCommands(structured.Commands, limit)
		}
	}

	lines := strings.Split(content, "\n")
	commands := make([]string, 0, limit)
	for _, line := range lines {
		line = numberedCommandPattern.ReplaceAllString(line, "")
		line = strings.Trim(strings.TrimSpace(line), "`\"'")
		if line != "" {
			commands = append(commands, line)
		}
	}
	return cleanPredictedCommands(commands, limit)
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
		if looksDangerousCommand(command) || seen[command] {
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
