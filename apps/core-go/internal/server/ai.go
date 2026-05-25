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
		MaxTokens:   260,
		Messages: []openAIChatMessage{
			{
				Role:    "system",
				Content: "You are an SSH terminal command prediction assistant. Return strict JSON only, never Markdown. Predict the most likely next shell commands from the current terminal context. Do not explain, do not execute anything, and do not return destructive commands. The response format must be {\"commands\":[\"cmd1\",\"cmd2\"]}.",
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

	client := &http.Client{Timeout: 18 * time.Second}
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
		request.PredictionCount = 3
	}
	if request.PredictionCount > 8 {
		request.PredictionCount = 8
	}
	if len(request.TerminalContext) > 6000 {
		request.TerminalContext = request.TerminalContext[len(request.TerminalContext)-6000:]
	}
	if len(request.CommandHistory) > 20 {
		request.CommandHistory = request.CommandHistory[:20]
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
	return fmt.Sprintf(`Current host: %s
Connection: %s@%s
Current command draft before Enter: %s
Prediction count: %d
Recent command history JSON: %s

Terminal context:
%s

Return strict JSON: {"commands":["command1","command2"]}`,
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
