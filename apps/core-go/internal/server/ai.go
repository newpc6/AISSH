package server

import (
	"bufio"
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
	Stream         bool                  `json:"stream,omitempty"`
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

type openAIChatStreamResponse struct {
	Choices []struct {
		Delta        openAIChatMessage `json:"delta"`
		FinishReason string            `json:"finish_reason"`
	} `json:"choices"`
}

type aiStreamEvent struct {
	Type         string            `json:"type"`
	Text         string            `json:"text,omitempty"`
	Commands     []string          `json:"commands,omitempty"`
	Response     *aiAssistResponse `json:"response,omitempty"`
	Error        string            `json:"error,omitempty"`
	FinishReason string            `json:"finishReason,omitempty"`
}

var numberedCommandPattern = regexp.MustCompile(`^\s*(?:[-*]|\d+[.)])\s*`)

type aiStreamWriter func(aiStreamEvent) error

const (
	aiDefaultPredictionCount = 3
	aiMaxPredictionCount     = 8
	aiTerminalContextLimit   = 50000
	aiCommandHistoryLimit    = 200
	aiAssistContextLimit     = 50000
	aiAssistPromptLimit      = 12000
	aiAssistStepsLimit       = 30
	aiRequestTimeout         = 18 * time.Second
	aiMaxTokens              = 1024
	aiAssistMaxTokens        = 1600
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

func assistWithAI(ctx context.Context, request aiAssistRequest, logger *appLogger) (aiAssistResponse, error) {
	normalized, err := normalizeAIAssistRequest(request)
	if err != nil {
		return aiAssistResponse{}, err
	}

	endpoint, err := chatCompletionsURL(normalized.BaseURL)
	if err != nil {
		return aiAssistResponse{}, err
	}

	body, err := json.Marshal(openAIChatRequest{
		Model:          normalized.Model,
		Temperature:    0,
		MaxTokens:      aiAssistMaxTokens,
		ResponseFormat: &openAIResponseFormat{Type: "json_object"},
		Messages: []openAIChatMessage{
			{
				Role:    "system",
				Content: buildAssistSystemPrompt(normalized.Task, normalized.SystemPrompt),
			},
			{
				Role:    "user",
				Content: buildAssistPrompt(normalized),
			},
		},
	})
	if err != nil {
		return aiAssistResponse{}, err
	}

	started := time.Now()
	if logger != nil {
		logger.debug("ai", "assist request prepared", map[string]any{
			"task":                 normalized.Task,
			"endpoint":             endpoint,
			"model":                normalized.Model,
			"terminalContextChars": len(normalized.TerminalContext),
			"commandHistoryCount":  len(normalized.CommandHistory),
			"agentMode":            normalized.AgentMode,
			"agentStepCount":       len(normalized.AgentSteps),
			"hasAPIKey":            normalized.APIKey != "",
		})
	}

	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return aiAssistResponse{}, err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	if normalized.APIKey != "" {
		httpRequest.Header.Set("Authorization", "Bearer "+normalized.APIKey)
	}

	client := &http.Client{Timeout: aiRequestTimeout}
	response, err := client.Do(httpRequest)
	if err != nil {
		if logger != nil {
			logger.error("ai", "assist provider request failed", map[string]any{
				"task":       normalized.Task,
				"endpoint":   endpoint,
				"model":      normalized.Model,
				"error":      err.Error(),
				"durationMs": time.Since(started).Milliseconds(),
			})
		}
		return aiAssistResponse{}, err
	}
	defer response.Body.Close()

	responseBody, bodyTruncated, err := readLimitedAIResponseBody(response.Body)
	if err != nil {
		if logger != nil {
			logger.error("ai", "assist provider response read failed", map[string]any{
				"task":       normalized.Task,
				"endpoint":   endpoint,
				"model":      normalized.Model,
				"status":     response.StatusCode,
				"error":      err.Error(),
				"durationMs": time.Since(started).Milliseconds(),
			})
		}
		return aiAssistResponse{}, err
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		bodySnippet := logTextSnippet(string(responseBody))
		if logger != nil {
			logger.error("ai", "assist provider returned non-success status", map[string]any{
				"task":          normalized.Task,
				"endpoint":      endpoint,
				"model":         normalized.Model,
				"status":        response.StatusCode,
				"bodySnippet":   bodySnippet,
				"bodyTruncated": bodyTruncated,
				"durationMs":    time.Since(started).Milliseconds(),
			})
		}
		if bodySnippet != "" {
			return aiAssistResponse{}, fmt.Errorf("ai provider returned status %d: %s", response.StatusCode, bodySnippet)
		}
		return aiAssistResponse{}, fmt.Errorf("ai provider returned status %d", response.StatusCode)
	}

	var chatResponse openAIChatResponse
	if err := json.Unmarshal(responseBody, &chatResponse); err != nil {
		if logger != nil {
			logger.error("ai", "assist provider response decode failed", map[string]any{
				"task":          normalized.Task,
				"endpoint":      endpoint,
				"model":         normalized.Model,
				"status":        response.StatusCode,
				"error":         err.Error(),
				"bodySnippet":   logTextSnippet(string(responseBody)),
				"bodyTruncated": bodyTruncated,
				"durationMs":    time.Since(started).Milliseconds(),
			})
		}
		return aiAssistResponse{}, err
	}
	if len(chatResponse.Choices) == 0 {
		return aiAssistResponse{}, errors.New("ai provider returned no choices; see run logs for provider response")
	}

	choice := chatResponse.Choices[0]
	result, err := parseAssistResponse(choice.Message.Content)
	if err != nil {
		if logger != nil {
			logger.error("ai", "assist provider returned invalid content", map[string]any{
				"task":                  normalized.Task,
				"endpoint":              endpoint,
				"model":                 normalized.Model,
				"status":                response.StatusCode,
				"finishReason":          choice.FinishReason,
				"contentChars":          len(choice.Message.Content),
				"contentSnippet":        logTextSnippet(choice.Message.Content),
				"reasoningContentChars": len(choice.Message.ReasoningContent),
				"reasoningSnippet":      logTextSnippet(choice.Message.ReasoningContent),
				"bodySnippet":           logTextSnippet(string(responseBody)),
				"bodyTruncated":         bodyTruncated,
				"durationMs":            time.Since(started).Milliseconds(),
			})
		}
		if choice.FinishReason == "length" {
			return aiAssistResponse{}, errors.New("ai provider output was truncated before final answer; see run logs")
		}
		return aiAssistResponse{}, err
	}
	result = finalizeAssistResponse(normalized, result)
	if logger != nil {
		logger.info("ai", "assist completed", map[string]any{
			"task":         normalized.Task,
			"model":        normalized.Model,
			"agentStatus":  result.AgentStatus,
			"commandCount": len(result.Commands),
			"riskLevel":    result.RiskLevel,
			"durationMs":   time.Since(started).Milliseconds(),
		})
	}
	return result, nil
}

func streamPredictedCommands(ctx context.Context, request aiPredictionRequest, logger *appLogger, write aiStreamWriter) error {
	normalized, err := normalizeAIRequest(request)
	if err != nil {
		return err
	}
	endpoint, err := chatCompletionsURL(normalized.BaseURL)
	if err != nil {
		return err
	}
	body, err := json.Marshal(openAIChatRequest{
		Model:          normalized.Model,
		Temperature:    0,
		MaxTokens:      aiMaxTokens,
		ResponseFormat: &openAIResponseFormat{Type: "json_object"},
		Stream:         true,
		Messages: []openAIChatMessage{
			{
				Role:    "system",
				Content: "你是 SSH 终端命令预测助手。所有内容必须使用中文。必须预测用户接下来最可能人工确认执行的 shell 命令，因为最终是否应用由用户确认。你只能在最终 content 中返回严格 JSON，不能返回 Markdown、解释或空内容。即使不确定，也要给出保守的查看型命令。不要执行任何操作，不要返回危险或破坏性命令。响应格式必须是 {\"commands\":[\"命令1\",\"命令2\"]}。",
			},
			{
				Role:    "user",
				Content: buildPredictionPrompt(normalized),
			},
		},
	})
	if err != nil {
		return err
	}

	started := time.Now()
	content, reasoning, finishReason, err := streamOpenAIChat(ctx, endpoint, normalized.APIKey, normalized.Model, body, logger, func(event aiStreamEvent) error {
		if event.Type == "thinking" || event.Type == "content" {
			return write(event)
		}
		return nil
	})
	if err != nil {
		return err
	}
	commands := parsePredictedCommands(content, normalized.PredictionCount)
	if len(commands) == 0 {
		if logger != nil {
			logger.error("ai", "stream prediction returned no commands", map[string]any{
				"endpoint":              endpoint,
				"model":                 normalized.Model,
				"finishReason":          finishReason,
				"contentChars":          len(content),
				"contentSnippet":        logTextSnippet(content),
				"reasoningContentChars": len(reasoning),
				"reasoningSnippet":      logTextSnippet(reasoning),
				"durationMs":            time.Since(started).Milliseconds(),
			})
		}
		return errors.New("ai provider returned no commands; see run logs for streamed content")
	}
	if logger != nil {
		logger.debug("ai", "stream prediction parsed commands", map[string]any{
			"endpoint":     endpoint,
			"model":        normalized.Model,
			"finishReason": finishReason,
			"commandCount": len(commands),
			"durationMs":   time.Since(started).Milliseconds(),
		})
	}
	return write(aiStreamEvent{Type: "done", Commands: commands, FinishReason: finishReason})
}

func streamAssistWithAI(ctx context.Context, request aiAssistRequest, logger *appLogger, write aiStreamWriter) error {
	normalized, err := normalizeAIAssistRequest(request)
	if err != nil {
		return err
	}
	endpoint, err := chatCompletionsURL(normalized.BaseURL)
	if err != nil {
		return err
	}
	body, err := json.Marshal(openAIChatRequest{
		Model:          normalized.Model,
		Temperature:    0,
		MaxTokens:      aiAssistMaxTokens,
		ResponseFormat: &openAIResponseFormat{Type: "json_object"},
		Stream:         true,
		Messages: []openAIChatMessage{
			{
				Role:    "system",
				Content: buildAssistSystemPrompt(normalized.Task, normalized.SystemPrompt),
			},
			{
				Role:    "user",
				Content: buildAssistPrompt(normalized),
			},
		},
	})
	if err != nil {
		return err
	}

	started := time.Now()
	content, reasoning, finishReason, err := streamOpenAIChat(ctx, endpoint, normalized.APIKey, normalized.Model, body, logger, func(event aiStreamEvent) error {
		if event.Type == "thinking" || event.Type == "content" {
			return write(event)
		}
		return nil
	})
	if err != nil {
		return err
	}
	result, err := parseAssistResponse(content)
	if err != nil {
		if logger != nil {
			logger.error("ai", "stream assist returned invalid content", map[string]any{
				"task":                  normalized.Task,
				"endpoint":              endpoint,
				"model":                 normalized.Model,
				"finishReason":          finishReason,
				"contentChars":          len(content),
				"contentSnippet":        logTextSnippet(content),
				"reasoningContentChars": len(reasoning),
				"reasoningSnippet":      logTextSnippet(reasoning),
				"durationMs":            time.Since(started).Milliseconds(),
			})
		}
		return err
	}
	result = finalizeAssistResponse(normalized, result)
	if logger != nil {
		logger.info("ai", "stream assist completed", map[string]any{
			"task":         normalized.Task,
			"model":        normalized.Model,
			"agentStatus":  result.AgentStatus,
			"commandCount": len(result.Commands),
			"riskLevel":    result.RiskLevel,
			"durationMs":   time.Since(started).Milliseconds(),
		})
	}
	return write(aiStreamEvent{Type: "done", Response: &result, FinishReason: finishReason})
}

func streamOpenAIChat(ctx context.Context, endpoint string, apiKey string, model string, body []byte, logger *appLogger, write aiStreamWriter) (string, string, string, error) {
	started := time.Now()
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", "", "", err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		httpRequest.Header.Set("Authorization", "Bearer "+apiKey)
	}
	client := &http.Client{Timeout: aiRequestTimeout}
	response, err := client.Do(httpRequest)
	if err != nil {
		if logger != nil {
			logger.error("ai", "stream provider request failed", map[string]any{
				"endpoint":   endpoint,
				"model":      model,
				"error":      err.Error(),
				"durationMs": time.Since(started).Milliseconds(),
			})
		}
		return "", "", "", err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		responseBody, bodyTruncated, readErr := readLimitedAIResponseBody(response.Body)
		if readErr != nil {
			return "", "", "", readErr
		}
		bodySnippet := logTextSnippet(string(responseBody))
		if logger != nil {
			logger.error("ai", "stream provider returned non-success status", map[string]any{
				"endpoint":      endpoint,
				"model":         model,
				"status":        response.StatusCode,
				"bodySnippet":   bodySnippet,
				"bodyTruncated": bodyTruncated,
				"durationMs":    time.Since(started).Milliseconds(),
			})
		}
		if bodySnippet != "" {
			return "", "", "", fmt.Errorf("ai provider returned status %d: %s", response.StatusCode, bodySnippet)
		}
		return "", "", "", fmt.Errorf("ai provider returned status %d", response.StatusCode)
	}

	var contentBuilder strings.Builder
	var reasoningBuilder strings.Builder
	finishReason := ""
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), aiProviderBodyReadLimit)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ":") {
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "[DONE]" {
			break
		}
		var chunk openAIChatStreamResponse
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			if logger != nil {
				logger.warn("ai", "stream provider chunk decode failed", map[string]any{
					"endpoint": endpoint,
					"model":    model,
					"chunk":    logTextSnippet(payload),
					"error":    err.Error(),
				})
			}
			continue
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.ReasoningContent != "" {
				reasoningBuilder.WriteString(choice.Delta.ReasoningContent)
				if err := write(aiStreamEvent{Type: "thinking", Text: choice.Delta.ReasoningContent}); err != nil {
					return contentBuilder.String(), reasoningBuilder.String(), finishReason, err
				}
			}
			if choice.Delta.Content != "" {
				contentBuilder.WriteString(choice.Delta.Content)
				if err := write(aiStreamEvent{Type: "content", Text: choice.Delta.Content}); err != nil {
					return contentBuilder.String(), reasoningBuilder.String(), finishReason, err
				}
			}
			if choice.FinishReason != "" {
				finishReason = choice.FinishReason
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return contentBuilder.String(), reasoningBuilder.String(), finishReason, err
	}
	return contentBuilder.String(), reasoningBuilder.String(), finishReason, nil
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

func normalizeAIAssistRequest(request aiAssistRequest) (aiAssistRequest, error) {
	request.BaseURL = strings.TrimSpace(request.BaseURL)
	request.Model = strings.TrimSpace(request.Model)
	request.Task = strings.TrimSpace(request.Task)
	request.SystemPrompt = trimToLastRunes(strings.TrimSpace(request.SystemPrompt), aiAssistPromptLimit)
	request.Prompt = trimToLastRunes(strings.TrimSpace(request.Prompt), aiAssistPromptLimit)
	if request.BaseURL == "" {
		return request, errors.New("ai base url is required")
	}
	if request.Model == "" {
		return request, errors.New("ai model is required")
	}
	if request.Task == "" {
		request.Task = "auto"
	}
	if !validAssistTask(request.Task) {
		return request, fmt.Errorf("unsupported ai assist task: %s", request.Task)
	}
	if request.Prompt == "" && request.AgentGoal == "" && request.SelectedText == "" && request.TerminalContext == "" {
		return request, errors.New("ai prompt or context is required")
	}
	request.TerminalContext = redactSensitiveText(trimToLastRunes(request.TerminalContext, aiAssistContextLimit))
	request.SelectedText = redactSensitiveText(trimToLastRunes(request.SelectedText, aiAssistPromptLimit))
	request.CurrentCommand = redactSensitiveText(trimToLastRunes(request.CurrentCommand, 2000))
	if len(request.CommandHistory) > aiCommandHistoryLimit {
		request.CommandHistory = request.CommandHistory[:aiCommandHistoryLimit]
	}
	for index, command := range request.CommandHistory {
		request.CommandHistory[index] = redactSensitiveText(trimToLastRunes(command, 2000))
	}
	if len(request.AgentSteps) > aiAssistStepsLimit {
		request.AgentSteps = request.AgentSteps[len(request.AgentSteps)-aiAssistStepsLimit:]
	}
	for index, step := range request.AgentSteps {
		step.Command = redactSensitiveText(trimToLastRunes(step.Command, 2000))
		step.Output = redactSensitiveText(trimToLastRunes(step.Output, 8000))
		request.AgentSteps[index] = step
	}
	request.AgentGoal = trimToLastRunes(strings.TrimSpace(request.AgentGoal), aiAssistPromptLimit)
	if request.AgentMode == "" {
		request.AgentMode = "review"
	}
	return request, nil
}

func validAssistTask(task string) bool {
	switch task {
	case "auto", "explain_error", "generate_command", "summarize_logs", "ops_qa", "agent_next":
		return true
	default:
		return false
	}
}

func trimToLastRunes(value string, limit int) string {
	if limit <= 0 {
		return value
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[len(runes)-limit:])
}

func redactSensitiveText(value string) string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)(password|passwd|pwd|token|api[_-]?key|secret|authorization)\s*[:=]\s*['"]?[^'"\s]+`),
		regexp.MustCompile(`(?i)bearer\s+[a-z0-9._\-]+`),
		regexp.MustCompile(`sk-[A-Za-z0-9_\-]{16,}`),
	}
	redacted := value
	for _, pattern := range patterns {
		redacted = pattern.ReplaceAllString(redacted, "$1=<已脱敏>")
	}
	return redacted
}

func buildAssistSystemPrompt(task string, customPrompt string) string {
	base := `你是 AI SSH 的统一运维助手。所有回答必须使用中文。你会看到终端上下文、历史命令、当前目录、主机信息、用户选中文本和用户目标。不要泄露或复述疑似密码、Token、密钥等敏感信息。必须只返回严格 JSON，不要 Markdown，不要把推理过程放进 content。你需要先判断用户意图：如果只是解释、总结、问答，就直接回答；如果需要驱动终端完成目标，就给出下一步命令并说明风险；如果信息不足，就提问。`
	if customPrompt != "" {
		base += "\n用户自定义系统提示词：\n" + customPrompt
	}
	switch task {
	case "auto":
		return base + `返回 {"answer":"给用户看的说明","commands":["可选命令草稿"],"warnings":["注意事项"],"riskLevel":"low|medium|high","riskReason":"原因","agentStatus":"command|done|question","agentCommand":"如果需要驱动终端则给一个下一步命令","agentReason":"为什么这样做"}。只有当用户明显要求执行、安装、配置、排障推进或完成目标时，才设置 agentStatus 为 command；普通问答、解释和总结不要给 agentCommand。危险命令必须标 high。`
	case "explain_error":
		return base + `任务是解释错误。返回 {"answer":"易懂解释","summary":"一句话摘要","warnings":["风险或注意事项"],"commands":["可选排查命令"]}。`
	case "generate_command":
		return base + `任务是把自然语言转换成 shell 命令草稿。生成的命令不能自动执行。返回 {"answer":"说明","commands":["命令1"],"warnings":["注意事项"],"riskLevel":"low|medium|high","riskReason":"原因"}。危险命令必须标 high。`
	case "summarize_logs":
		return base + `任务是总结日志。返回 {"answer":"总结","summary":"一句话结论","warnings":["异常点"],"commands":["可选排查命令"]}。`
	case "agent_next":
		return base + `任务是驱动终端完成用户目标。每次只给一个下一步命令，或者判断目标已完成，或者提出需要用户补充的问题。不要输出交互式编辑器命令，不要输出需要长时间阻塞的命令。优先用可验证、可回滚、保守的命令推进。返回 {"agentStatus":"command|done|question","agentCommand":"下一步命令","agentReason":"为什么执行这一步","answer":"给用户看的说明","riskLevel":"low|medium|high","riskReason":"风险原因","warnings":["注意事项"]}。安装、删除、重启、改配置、开放端口、sudo、rm、chmod 777、curl|sh、dd、mkfs 等必须标 high。`
	default:
		return base + `任务是围绕当前 SSH 会话做运维问答。返回 {"answer":"回答","commands":["可选命令草稿"],"warnings":["注意事项"],"riskLevel":"low|medium|high","riskReason":"原因"}。`
	}
}

func finalizeAssistResponse(request aiAssistRequest, result aiAssistResponse) aiAssistResponse {
	if request.Task == "agent_next" {
		result = normalizeAgentAssistResponse(result)
	}
	if request.Task == "auto" {
		result.AgentStatus = strings.TrimSpace(result.AgentStatus)
		result.AgentCommand = strings.TrimSpace(result.AgentCommand)
		if result.AgentStatus == "" && result.AgentCommand != "" {
			result.AgentStatus = "command"
		}
		if result.AgentStatus == "command" {
			result = normalizeAgentAssistResponse(result)
		}
	}
	result.Commands = cleanPredictedCommands(result.Commands, 8)
	result.Warnings = cleanStringList(result.Warnings, 8)
	if result.Answer == "" && result.Summary != "" {
		result.Answer = result.Summary
	}
	if result.Answer == "" && result.AgentReason != "" {
		result.Answer = result.AgentReason
	}
	if result.RiskLevel == "" {
		result.RiskLevel = classifyCommandRisk(firstNonEmpty(result.AgentCommand, firstString(result.Commands)))
	}
	if result.RiskReason == "" && result.RiskLevel == "high" {
		result.RiskReason = "命令可能修改系统、安装软件、删除文件或影响服务，需要人工确认。"
	}
	return result
}

func buildAssistPrompt(request aiAssistRequest) string {
	history, _ := json.Marshal(request.CommandHistory)
	steps, _ := json.Marshal(request.AgentSteps)
	return fmt.Sprintf(`任务类型：%s
用户输入：%s
Agent 模式：%s
Agent 目标：%s
Agent 已执行步骤 JSON：%s
当前主机：%s
连接信息：%s@%s
当前目录：%s
当前命令草稿：%s
最近命令历史 JSON：%s

用户选中文本：
%s

终端上下文：
%s

请严格按系统要求返回 JSON。`,
		request.Task,
		emptyAsDash(request.Prompt),
		emptyAsDash(request.AgentMode),
		emptyAsDash(request.AgentGoal),
		string(steps),
		emptyAsDash(request.HostName),
		emptyAsDash(request.Username),
		emptyAsDash(request.HostAddress),
		emptyAsDash(request.CWD),
		request.CurrentCommand,
		string(history),
		request.SelectedText,
		request.TerminalContext,
	)
}

func parseAssistResponse(content string) (aiAssistResponse, error) {
	content = strings.TrimSpace(content)
	var response aiAssistResponse
	if err := json.Unmarshal([]byte(content), &response); err == nil {
		return cleanupAssistResponse(response), nil
	}
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start >= 0 && end > start {
		if err := json.Unmarshal([]byte(content[start:end+1]), &response); err == nil {
			return cleanupAssistResponse(response), nil
		}
	}
	if looksLikeBrokenStructuredPrediction(content) {
		return aiAssistResponse{}, errors.New("ai provider returned broken structured response")
	}
	return aiAssistResponse{Answer: content}, nil
}

func cleanupAssistResponse(response aiAssistResponse) aiAssistResponse {
	response.Answer = strings.TrimSpace(response.Answer)
	response.Summary = strings.TrimSpace(response.Summary)
	response.RiskLevel = normalizeRiskLevel(response.RiskLevel)
	response.RiskReason = strings.TrimSpace(response.RiskReason)
	response.AgentStatus = strings.TrimSpace(response.AgentStatus)
	response.AgentCommand = strings.TrimSpace(response.AgentCommand)
	response.AgentReason = strings.TrimSpace(response.AgentReason)
	return response
}

func normalizeAgentAssistResponse(response aiAssistResponse) aiAssistResponse {
	switch response.AgentStatus {
	case "done", "question":
	default:
		response.AgentStatus = "command"
	}
	response.AgentCommand = firstNonEmpty(response.AgentCommand, firstString(response.Commands))
	response.AgentCommand = strings.TrimSpace(response.AgentCommand)
	if response.AgentStatus == "command" && response.AgentCommand == "" {
		response.AgentStatus = "question"
		if response.Answer == "" {
			response.Answer = "我还需要更多上下文才能决定下一步命令。"
		}
	}
	if response.AgentCommand != "" {
		response.Commands = []string{response.AgentCommand}
	}
	if response.AgentReason == "" {
		response.AgentReason = response.Answer
	}
	return response
}

func cleanStringList(values []string, limit int) []string {
	seen := map[string]bool{}
	result := make([]string, 0, limit)
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
		if len(result) >= limit {
			break
		}
	}
	return result
}

func normalizeRiskLevel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "low", "medium", "high":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func classifyCommandRisk(command string) string {
	lower := strings.ToLower(strings.TrimSpace(command))
	if lower == "" {
		return "low"
	}
	highPatterns := []string{
		"sudo ", "su -", "rm ", "mv /", "chmod 777", "chown ", "mkfs", "dd if=", "shutdown", "reboot",
		"systemctl restart", "systemctl stop", "service ", "apt install", "apt-get install", "yum install",
		"dnf install", "docker rm", "docker system prune", "iptables", "ufw ", "firewall-cmd", "curl ", "wget ",
	}
	for _, pattern := range highPatterns {
		if strings.Contains(lower, pattern) {
			return "high"
		}
	}
	mediumPatterns := []string{"systemctl status", "docker run", "docker compose", "npm install", "pip install", "cp "}
	for _, pattern := range mediumPatterns {
		if strings.Contains(lower, pattern) {
			return "medium"
		}
	}
	return "low"
}

func firstString(values []string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
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
