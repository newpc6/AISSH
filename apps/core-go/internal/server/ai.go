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
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
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

type assistContentStreamExtractor struct {
	buffer    string
	displayed string
	field     string
}

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
				Content: buildAssistSystemPrompt(normalized.SystemPrompt),
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
	result = finalizeAssistResponse(result)
	if logger != nil {
		logger.info("ai", "assist completed", map[string]any{
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
				Content: buildAssistSystemPrompt(normalized.SystemPrompt),
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
	contentExtractor := &assistContentStreamExtractor{}
	content, reasoning, finishReason, err := streamOpenAIChat(ctx, endpoint, normalized.APIKey, normalized.Model, body, logger, func(event aiStreamEvent) error {
		if event.Type == "thinking" {
			return write(event)
		}
		if event.Type == "content" && event.Text != "" {
			if text := contentExtractor.Append(event.Text); text != "" {
				return write(aiStreamEvent{Type: "content", Text: text})
			}
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
	result = finalizeAssistResponse(result)
	if text := contentExtractor.Finalize(result); text != "" {
		if err := write(aiStreamEvent{Type: "content", Text: text}); err != nil {
			return err
		}
	}
	if logger != nil {
		logger.info("ai", "stream assist completed", map[string]any{
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

func (extractor *assistContentStreamExtractor) Append(chunk string) string {
	extractor.buffer += chunk
	preview := extractor.preview()
	if preview == "" || len(preview) <= len(extractor.displayed) {
		return ""
	}
	delta := preview[len(extractor.displayed):]
	extractor.displayed = preview
	return delta
}

func (extractor *assistContentStreamExtractor) Finalize(response aiAssistResponse) string {
	final := extractor.finalText(response)
	if final == "" || len(final) <= len(extractor.displayed) || !strings.HasPrefix(final, extractor.displayed) {
		return ""
	}
	delta := final[len(extractor.displayed):]
	extractor.displayed = final
	return delta
}

func (extractor *assistContentStreamExtractor) preview() string {
	if extractor.field != "" {
		value, _ := partialJSONStringFieldValue(extractor.buffer, extractor.field)
		return value
	}
	for _, field := range []string{"answer", "summary", "agentReason"} {
		if value, ok := partialJSONStringFieldValue(extractor.buffer, field); ok {
			if value != "" {
				extractor.field = field
			}
			return value
		}
	}
	return ""
}

func (extractor *assistContentStreamExtractor) finalText(response aiAssistResponse) string {
	switch extractor.field {
	case "answer":
		return response.Answer
	case "summary":
		return response.Summary
	case "agentReason":
		return response.AgentReason
	default:
		return firstNonEmpty(response.Answer, response.Summary, response.AgentReason)
	}
}

func partialJSONStringFieldValue(content string, field string) (string, bool) {
	pattern := `"` + field + `"`
	keyIndex := strings.Index(content, pattern)
	if keyIndex < 0 {
		return "", false
	}
	rest := content[keyIndex+len(pattern):]
	colonIndex := strings.Index(rest, ":")
	if colonIndex < 0 {
		return "", false
	}
	rest = strings.TrimLeft(rest[colonIndex+1:], " \t\r\n")
	if !strings.HasPrefix(rest, `"`) {
		return "", false
	}
	return decodePartialJSONString(rest[1:]), true
}

func decodePartialJSONString(value string) string {
	var builder strings.Builder
	escaped := false
	for index := 0; index < len(value); {
		if escaped {
			switch value[index] {
			case '"', '\\', '/':
				builder.WriteByte(value[index])
				index++
			case 'b':
				builder.WriteByte('\b')
				index++
			case 'f':
				builder.WriteByte('\f')
				index++
			case 'n':
				builder.WriteByte('\n')
				index++
			case 'r':
				builder.WriteByte('\r')
				index++
			case 't':
				builder.WriteByte('\t')
				index++
			case 'u':
				if index+5 <= len(value) {
					if decoded, err := strconv.ParseInt(value[index+1:index+5], 16, 32); err == nil {
						builder.WriteRune(rune(decoded))
						index += 5
					} else {
						index++
					}
				} else {
					index = len(value)
				}
			default:
				builder.WriteByte(value[index])
				index++
			}
			escaped = false
			continue
		}
		switch value[index] {
		case '\\':
			escaped = true
			index++
		case '"':
			return builder.String()
		default:
			r, size := utf8.DecodeRuneInString(value[index:])
			builder.WriteRune(r)
			index += size
		}
	}
	return builder.String()
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
	request.SystemPrompt = trimToLastRunes(strings.TrimSpace(request.SystemPrompt), aiAssistPromptLimit)
	request.Prompt = trimToLastRunes(strings.TrimSpace(request.Prompt), aiAssistPromptLimit)
	if request.BaseURL == "" {
		return request, errors.New("ai base url is required")
	}
	if request.Model == "" {
		return request, errors.New("ai model is required")
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

func buildAssistSystemPrompt(customPrompt string) string {
	base := `你是 AI SSH 的统一运维助手。所有回答必须使用中文。你会看到终端上下文、当前对话上下文、历史命令、当前目录、主机信息、用户选中文本、用户目标和 Agent 已执行步骤。

你只有一个统一入口，必须自行判断用户意图：
1. 如果用户是在问答、解释错误、总结日志、分析现象或询问建议，直接给出结论、依据和下一步建议，不要生成 agentCommand。
2. 如果用户希望你驱动终端完成目标，或者已经有 Agent 执行步骤需要继续判断，每次返回一条可执行命令，同时用 agentReason 说明整体计划和当前这一步的目的。你的命令执行后会拿到输出和退出码，你必须根据实际结果决定下一步。复杂任务要分多步推进，比如先查询系统信息、根据查询结果筛选、再做配置或安装；不能假设一条命令就能拿到所有需要的信息。
3. 如果 Agent 已执行步骤 JSON 中已有 output 和 exitCode，必须优先把它作为最新事实判断任务是否完成；不要只根据终端上下文或用户最初输入判断。
4. 如果执行结果已经足以回答用户目标，例如命令返回路径、版本号、服务状态、明确的不存在信息或退出码已经说明结果，必须返回 agentStatus:"done"，在 answer 中直接给出结论和依据，不要继续生成无必要命令。
5. 不要输出交互式编辑器命令，不要输出需要长时间阻塞的命令。优先使用可验证、可回滚、保守的命令推进。
6. 安装、删除、重启、改配置、开放端口、sudo、rm、chmod 777、curl|sh、dd、mkfs 等命令必须标记 riskLevel:"high"，并说明原因。
7. 不要泄露或复述疑似密码、Token、密钥等敏感信息。

你必须只返回严格 JSON object，不要包裹 Markdown 代码块；answer、summary、agentReason 字段的字符串内容可以使用 Markdown。不要把隐藏推理过程放进 content。返回字段为：
{"answer":"给用户看的回答或说明","summary":"可选一句话摘要","commands":["可选命令草稿"],"warnings":["注意事项"],"riskLevel":"low|medium|high","riskReason":"风险原因","agentStatus":"command|done|question","agentCommand":"需要驱动终端时的一条下一步命令","agentReason":"为什么这样做"}

普通问答、解释和总结通常返回 answer，可附带 commands 作为用户可手动采用的草稿，但不要设置 agentCommand。需要继续驱动终端时返回 agentStatus:"command" 和 agentCommand；任务已完成时返回 agentStatus:"done"；信息不足时返回 agentStatus:"question"。`
	if customPrompt != "" {
		base += "\n用户自定义系统提示词：\n" + customPrompt
	}
	return base
}

func finalizeAssistResponse(result aiAssistResponse) aiAssistResponse {
	result.AgentStatus = strings.TrimSpace(result.AgentStatus)
	result.AgentCommand = strings.TrimSpace(result.AgentCommand)
	if result.AgentStatus != "" && result.AgentStatus != "command" && result.AgentStatus != "done" && result.AgentStatus != "question" {
		result.AgentStatus = ""
	}
	if result.AgentStatus == "" && result.AgentCommand != "" {
		result.AgentStatus = "command"
	}
	if result.AgentStatus == "command" || result.AgentCommand != "" {
		result = normalizeAgentAssistResponse(result)
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
	return fmt.Sprintf(`用户输入：%s
Agent 模式：%s
Agent 目标：%s
Agent 已执行步骤 JSON：%s
流程要求：如果 Agent 已执行步骤 JSON 中已有 output 和 exitCode，必须把它作为最新事实判断任务是否完成；不要只根据终端上下文或用户输入判断。执行结果能回答目标时直接返回 done 和 answer；不足时才返回下一步 command。
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

必须预测下一步命令。即使不确定，也返回保守的查看型命令
不要在 content 中输出解释、分析、Markdown 或空内容。
请只返回严格 JSON：{"commands":["命令1","命令2"]}`,
		// ，例如 ls -la、pwd、tail -n 100 nohup.out、ps -ef | grep 进程名。
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
