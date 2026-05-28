package server

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type CoreConfig struct {
	BindHost string `json:"bindHost"`
	Port     int    `json:"port"`
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
