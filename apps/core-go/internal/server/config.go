package server

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type CoreConfig struct {
	BindHost string         `json:"bindHost"`
	Port     int            `json:"port"`
	App      *CoreAppConfig `json:"app,omitempty"`
}

type CoreAppConfig struct {
	HealthCheckIntervalSeconds    int      `json:"healthCheckIntervalSeconds,omitempty"`
	MetricsRefreshIntervalSeconds int      `json:"metricsRefreshIntervalSeconds,omitempty"`
	MetricsHistoryWindowMinutes   int      `json:"metricsHistoryWindowMinutes,omitempty"`
	MetricsCompactPointLimit      int      `json:"metricsCompactPointLimit,omitempty"`
	MetricsExpandedPointLimit     int      `json:"metricsExpandedPointLimit,omitempty"`
	TerminalRetainedLines         int      `json:"terminalRetainedLines,omitempty"`
	RightServerInfoPanelHeight    int      `json:"rightServerInfoPanelHeight,omitempty"`
	RightPanelWidth               int      `json:"rightPanelWidth,omitempty"`
	LeftRailWidth                 int      `json:"leftRailWidth,omitempty"`
	PredictionPanelHeight         int      `json:"predictionPanelHeight,omitempty"`
	AIEnabled                     bool     `json:"aiEnabled,omitempty"`
	AIBaseUrl                     string   `json:"aiBaseUrl,omitempty"`
	AIApiKey                      string   `json:"aiApiKey,omitempty"`
	AIModel                       string   `json:"aiModel,omitempty"`
	AIPredictionEnabled           bool     `json:"aiPredictionEnabled,omitempty"`
	AIPredictionThinkingEnabled   bool     `json:"aiPredictionThinkingEnabled,omitempty"`
	AIPredictionCount             int      `json:"aiPredictionCount,omitempty"`
	AIPredictionTriggerDelayMs    int      `json:"aiPredictionTriggerDelayMs,omitempty"`
	AITerminalContextLimit        int      `json:"aiTerminalContextLimit,omitempty"`
	AICommandHistoryLimit         int      `json:"aiCommandHistoryLimit,omitempty"`
	AIConversationContextLimit    int      `json:"aiConversationContextLimit,omitempty"`
	AISystemPrompt                string   `json:"aiSystemPrompt,omitempty"`
	AgentCommandTimeoutSeconds    int      `json:"agentCommandTimeoutSeconds,omitempty"`
	FavoriteCommands              []string `json:"favoriteCommands,omitempty"`
}

func DefaultCoreConfig() CoreConfig {
	return CoreConfig{
		BindHost: "0.0.0.0",
		Port:     18555,
	}
}

func LoadCoreConfig() CoreConfig {
	cfg := DefaultCoreConfig()

	configPath := resolveConfigPath()
	if data, err := os.ReadFile(configPath); err == nil {
		var fileCfg CoreConfig
		if json.Unmarshal(data, &fileCfg) == nil {
			if fileCfg.BindHost != "" {
				cfg.BindHost = fileCfg.BindHost
			}
			if fileCfg.Port > 0 && fileCfg.Port <= 65535 {
				cfg.Port = fileCfg.Port
			}
			cfg.App = fileCfg.App
		}
	}

	if host := os.Getenv("AI_SSH_BIND_HOST"); host != "" {
		cfg.BindHost = host
	}
	if port := os.Getenv("AI_SSH_CORE_PORT"); port != "" {
		if p, ok := parsePortNumber(port); ok {
			cfg.Port = p
		}
	}

	return cfg
}

func SaveCoreConfig(cfg CoreConfig) error {
	configPath := resolveConfigPath()
	if err := os.MkdirAll(filepath.Dir(configPath), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, data, 0o600)
}

func MergeCoreConfigPayload(existing CoreConfig, data []byte) (CoreConfig, error) {
	var incoming CoreConfig
	if err := json.Unmarshal(data, &incoming); err != nil {
		return CoreConfig{}, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return CoreConfig{}, err
	}
	merged := existing
	if _, ok := fields["bindHost"]; ok && incoming.BindHost != "" {
		merged.BindHost = incoming.BindHost
	}
	if _, ok := fields["port"]; ok && incoming.Port > 0 && incoming.Port <= 65535 {
		merged.Port = incoming.Port
	}
	if appRaw, ok := fields["app"]; ok && string(appRaw) != "null" {
		app := CoreAppConfig{}
		if existing.App != nil {
			app = *existing.App
		}
		var appFields map[string]json.RawMessage
		if err := json.Unmarshal(appRaw, &appFields); err != nil {
			return CoreConfig{}, err
		}
		mergeCoreAppConfig(&app, incoming.App, appFields)
		merged.App = &app
	}
	return merged, nil
}

func mergeCoreAppConfig(target *CoreAppConfig, incoming *CoreAppConfig, fields map[string]json.RawMessage) {
	if _, ok := fields["healthCheckIntervalSeconds"]; ok && incoming.HealthCheckIntervalSeconds > 0 {
		target.HealthCheckIntervalSeconds = incoming.HealthCheckIntervalSeconds
	}
	if _, ok := fields["metricsRefreshIntervalSeconds"]; ok && incoming.MetricsRefreshIntervalSeconds > 0 {
		target.MetricsRefreshIntervalSeconds = incoming.MetricsRefreshIntervalSeconds
	}
	if _, ok := fields["metricsHistoryWindowMinutes"]; ok && incoming.MetricsHistoryWindowMinutes > 0 {
		target.MetricsHistoryWindowMinutes = incoming.MetricsHistoryWindowMinutes
	}
	if _, ok := fields["metricsCompactPointLimit"]; ok && incoming.MetricsCompactPointLimit > 0 {
		target.MetricsCompactPointLimit = incoming.MetricsCompactPointLimit
	}
	if _, ok := fields["metricsExpandedPointLimit"]; ok && incoming.MetricsExpandedPointLimit > 0 {
		target.MetricsExpandedPointLimit = incoming.MetricsExpandedPointLimit
	}
	if _, ok := fields["terminalRetainedLines"]; ok && incoming.TerminalRetainedLines > 0 {
		target.TerminalRetainedLines = incoming.TerminalRetainedLines
	}
	if _, ok := fields["rightServerInfoPanelHeight"]; ok && incoming.RightServerInfoPanelHeight > 0 {
		target.RightServerInfoPanelHeight = incoming.RightServerInfoPanelHeight
	}
	if _, ok := fields["rightPanelWidth"]; ok && incoming.RightPanelWidth > 0 {
		target.RightPanelWidth = incoming.RightPanelWidth
	}
	if _, ok := fields["leftRailWidth"]; ok && incoming.LeftRailWidth > 0 {
		target.LeftRailWidth = incoming.LeftRailWidth
	}
	if _, ok := fields["predictionPanelHeight"]; ok && incoming.PredictionPanelHeight > 0 {
		target.PredictionPanelHeight = incoming.PredictionPanelHeight
	}
	if _, ok := fields["aiEnabled"]; ok {
		target.AIEnabled = incoming.AIEnabled
	}
	if _, ok := fields["aiBaseUrl"]; ok {
		target.AIBaseUrl = incoming.AIBaseUrl
	}
	if _, ok := fields["aiApiKey"]; ok {
		target.AIApiKey = incoming.AIApiKey
	}
	if _, ok := fields["aiModel"]; ok {
		target.AIModel = incoming.AIModel
	}
	if _, ok := fields["aiPredictionEnabled"]; ok {
		target.AIPredictionEnabled = incoming.AIPredictionEnabled
	}
	if _, ok := fields["aiPredictionThinkingEnabled"]; ok {
		target.AIPredictionThinkingEnabled = incoming.AIPredictionThinkingEnabled
	}
	if _, ok := fields["aiPredictionCount"]; ok && incoming.AIPredictionCount > 0 {
		target.AIPredictionCount = incoming.AIPredictionCount
	}
	if _, ok := fields["aiPredictionTriggerDelayMs"]; ok && incoming.AIPredictionTriggerDelayMs > 0 {
		target.AIPredictionTriggerDelayMs = incoming.AIPredictionTriggerDelayMs
	}
	if _, ok := fields["aiTerminalContextLimit"]; ok && incoming.AITerminalContextLimit > 0 {
		target.AITerminalContextLimit = incoming.AITerminalContextLimit
	}
	if _, ok := fields["aiCommandHistoryLimit"]; ok && incoming.AICommandHistoryLimit > 0 {
		target.AICommandHistoryLimit = incoming.AICommandHistoryLimit
	}
	if _, ok := fields["aiConversationContextLimit"]; ok && incoming.AIConversationContextLimit > 0 {
		target.AIConversationContextLimit = incoming.AIConversationContextLimit
	}
	if _, ok := fields["aiSystemPrompt"]; ok {
		target.AISystemPrompt = incoming.AISystemPrompt
	}
	if _, ok := fields["agentCommandTimeoutSeconds"]; ok && incoming.AgentCommandTimeoutSeconds > 0 {
		target.AgentCommandTimeoutSeconds = incoming.AgentCommandTimeoutSeconds
	}
	if _, ok := fields["favoriteCommands"]; ok {
		target.FavoriteCommands = incoming.FavoriteCommands
	}
}

func resolveConfigPath() string {
	if path := os.Getenv("AI_SSH_CONFIG_PATH"); path != "" {
		return path
	}
	return filepath.Join(resolveHostStoreBaseDir(), "data", "config.json")
}

func parsePortNumber(value string) (int, bool) {
	n := 0
	for _, ch := range value {
		if ch < '0' || ch > '9' {
			return 0, false
		}
		n = n*10 + int(ch-'0')
		if n > 65535 {
			return 0, false
		}
	}
	if n == 0 {
		return 0, false
	}
	return n, true
}
