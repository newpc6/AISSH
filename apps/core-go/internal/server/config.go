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
