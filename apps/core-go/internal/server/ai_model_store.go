package server

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type aiModelStore struct {
	path   string
	db     *sql.DB
	mu     sync.Mutex
	logger *appLogger
}

type aiModelState struct {
	Models         []AIModelConfig `json:"models"`
	ActiveModelID  string          `json:"activeModelId"`
}

func newAIModelStore(logger *appLogger) *aiModelStore {
	path := resolveAIChatStorePath()
	store := &aiModelStore{path: path, logger: logger}
	if err := store.open(); err != nil && logger != nil {
		logger.error("ai.model", "open ai model store failed", map[string]any{"path": path, "error": err.Error()})
	}
	return store
}

func (s *aiModelStore) open() error {
	if s.db != nil {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	db, err := sql.Open("sqlite", s.path)
	if err != nil {
		return err
	}
	if _, err := db.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		_ = db.Close()
		return err
	}
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  thinking_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_model_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_models_sort_order ON ai_models(sort_order ASC, updated_at DESC);
`); err != nil {
		_ = db.Close()
		return err
	}
	s.db = db
	return nil
}

func (s *aiModelStore) ensureDB() (*sql.DB, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.open(); err != nil {
		return nil, err
	}
	return s.db, nil
}

func (s *aiModelStore) listModels() (aiModelState, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiModelState{}, err
	}
	rows, err := db.Query(`SELECT id, name, provider, base_url, api_key, model, thinking_enabled FROM ai_models ORDER BY sort_order ASC, updated_at DESC`)
	if err != nil {
		return aiModelState{}, err
	}
	defer rows.Close()

	models := []AIModelConfig{}
	for rows.Next() {
		var item AIModelConfig
		var thinkingEnabled int
		if err := rows.Scan(&item.ID, &item.Name, &item.Provider, &item.BaseURL, &item.APIKey, &item.Model, &thinkingEnabled); err != nil {
			return aiModelState{}, err
		}
		item.ThinkingEnabled = thinkingEnabled != 0
		models = append(models, item)
	}
	if err := rows.Err(); err != nil {
		return aiModelState{}, err
	}

	activeID := ""
	_ = db.QueryRow(`SELECT value FROM ai_model_state WHERE key = 'active_model_id'`).Scan(&activeID)
	activeID = strings.TrimSpace(activeID)
	if activeID == "" || !containsAIModelID(models, activeID) {
		if len(models) > 0 {
			activeID = models[0].ID
		}
	}
	return aiModelState{Models: models, ActiveModelID: activeID}, nil
}

func (s *aiModelStore) replaceModels(models []AIModelConfig, activeModelID string) (aiModelState, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiModelState{}, err
	}
	normalized := normalizeAIModelStoreConfigs(models)
	activeModelID = strings.TrimSpace(activeModelID)
	if activeModelID != "" && !containsAIModelID(normalized, activeModelID) {
		return aiModelState{}, errors.New("active model id is invalid")
	}
	if activeModelID == "" && len(normalized) > 0 {
		activeModelID = normalized[0].ID
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)

	tx, err := db.Begin()
	if err != nil {
		return aiModelState{}, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(`DELETE FROM ai_models`); err != nil {
		return aiModelState{}, err
	}
	for index, model := range normalized {
		if _, err = tx.Exec(
			`INSERT INTO ai_models(id, name, provider, base_url, api_key, model, thinking_enabled, sort_order, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			model.ID,
			model.Name,
			model.Provider,
			model.BaseURL,
			model.APIKey,
			model.Model,
			boolToInt(model.ThinkingEnabled),
			index,
			now,
			now,
		); err != nil {
			return aiModelState{}, err
		}
	}
	if _, err = tx.Exec(
		`INSERT INTO ai_model_state(key, value, updated_at) VALUES('active_model_id', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		activeModelID,
		now,
	); err != nil {
		return aiModelState{}, err
	}
	if err = tx.Commit(); err != nil {
		return aiModelState{}, err
	}
	return aiModelState{Models: normalized, ActiveModelID: activeModelID}, nil
}

func containsAIModelID(models []AIModelConfig, id string) bool {
	for _, model := range models {
		if model.ID == id {
			return true
		}
	}
	return false
}

func (s *aiModelStore) resolveModel(modelID string) (AIModelConfig, error) {
	state, err := s.listModels()
	if err != nil {
		return AIModelConfig{}, err
	}
	targetID := strings.TrimSpace(modelID)
	if targetID == "" {
		targetID = strings.TrimSpace(state.ActiveModelID)
	}
	if targetID != "" {
		for _, model := range state.Models {
			if model.ID == targetID {
				return model, nil
			}
		}
	}
	if len(state.Models) > 0 {
		return state.Models[0], nil
	}
	return AIModelConfig{}, errors.New("no ai models configured")
}

func normalizeAIModelStoreConfigs(models []AIModelConfig) []AIModelConfig {
	normalized := make([]AIModelConfig, 0, len(models))
	seen := map[string]struct{}{}
	for _, model := range models {
		item := AIModelConfig{
			ID:               strings.TrimSpace(model.ID),
			Name:             strings.TrimSpace(model.Name),
			Provider:         normalizeAIProvider(model.Provider),
			BaseURL:          strings.TrimSpace(model.BaseURL),
			APIKey:           model.APIKey,
			Model:            strings.TrimSpace(model.Model),
			ThinkingEnabled:  model.ThinkingEnabled,
		}
		if item.ID == "" || item.Name == "" || item.Model == "" || item.BaseURL == "" {
			continue
		}
		if _, ok := seen[item.ID]; ok {
			continue
		}
		seen[item.ID] = struct{}{}
		normalized = append(normalized, item)
	}
	return normalized
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
