package server

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type aiSkill struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Prompt    string `json:"prompt"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type aiSkillStore struct {
	path   string
	db     *sql.DB
	mu     sync.Mutex
	logger *appLogger
}

func newAISkillStore(logger *appLogger) *aiSkillStore {
	path := resolveAIChatStorePath()
	store := &aiSkillStore{path: path, logger: logger}
	if err := store.open(); err != nil && logger != nil {
		logger.error("ai.skill", "open ai skill store failed", map[string]any{"path": path, "error": err.Error()})
	}
	return store
}

func (s *aiSkillStore) open() error {
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
CREATE TABLE IF NOT EXISTS ai_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_skills_updated_at ON ai_skills(updated_at DESC);
`); err != nil {
		_ = db.Close()
		return err
	}
	if err := ensureSQLiteColumns(db, "ai_skills", []sqliteColumnSpec{
		{Name: "prompt", Definition: "TEXT NOT NULL DEFAULT ''"},
		{Name: "created_at", Definition: "TEXT NOT NULL DEFAULT ''"},
		{Name: "updated_at", Definition: "TEXT NOT NULL DEFAULT ''"},
	}); err != nil {
		_ = db.Close()
		return err
	}
	s.db = db
	return nil
}

func (s *aiSkillStore) ensureDB() (*sql.DB, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.open(); err != nil {
		return nil, err
	}
	return s.db, nil
}

func (s *aiSkillStore) listSkills() ([]aiSkill, error) {
	db, err := s.ensureDB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT id, name, prompt, created_at, updated_at FROM ai_skills ORDER BY updated_at DESC, created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	skills := []aiSkill{}
	for rows.Next() {
		var skill aiSkill
		if err := rows.Scan(&skill.ID, &skill.Name, &skill.Prompt, &skill.CreatedAt, &skill.UpdatedAt); err != nil {
			return nil, err
		}
		skills = append(skills, skill)
	}
	return skills, rows.Err()
}

func (s *aiSkillStore) createSkill(name string, prompt string) (aiSkill, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiSkill{}, err
	}
	name = normalizeAISkillName(name)
	prompt = normalizeAISkillPrompt(prompt)
	if name == "" {
		return aiSkill{}, errors.New("skill name is required")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	skill := aiSkill{
		ID:        "skill-" + uuid.NewString(),
		Name:      name,
		Prompt:    prompt,
		CreatedAt: now,
		UpdatedAt: now,
	}
	_, err = db.Exec(`INSERT INTO ai_skills(id, name, prompt, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`, skill.ID, skill.Name, skill.Prompt, skill.CreatedAt, skill.UpdatedAt)
	return skill, err
}

func (s *aiSkillStore) updateSkill(id string, name string, prompt string) (aiSkill, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiSkill{}, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return aiSkill{}, errors.New("skill id is required")
	}
	name = normalizeAISkillName(name)
	prompt = normalizeAISkillPrompt(prompt)
	if name == "" {
		return aiSkill{}, errors.New("skill name is required")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	result, err := db.Exec(`UPDATE ai_skills SET name = ?, prompt = ?, updated_at = ? WHERE id = ?`, name, prompt, now, id)
	if err != nil {
		return aiSkill{}, err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return aiSkill{}, sql.ErrNoRows
	}
	return s.getSkill(id)
}

func (s *aiSkillStore) deleteSkill(id string) error {
	db, err := s.ensureDB()
	if err != nil {
		return err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("skill id is required")
	}
	result, err := db.Exec(`DELETE FROM ai_skills WHERE id = ?`, id)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *aiSkillStore) getSkill(id string) (aiSkill, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiSkill{}, err
	}
	var skill aiSkill
	err = db.QueryRow(`SELECT id, name, prompt, created_at, updated_at FROM ai_skills WHERE id = ?`, id).Scan(
		&skill.ID,
		&skill.Name,
		&skill.Prompt,
		&skill.CreatedAt,
		&skill.UpdatedAt,
	)
	return skill, err
}

func (s *aiSkillStore) replaceSkills(skills []aiSkill) ([]aiSkill, error) {
	db, err := s.ensureDB()
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	normalized := make([]aiSkill, 0, len(skills))
	seen := map[string]struct{}{}
	for index, skill := range skills {
		id := strings.TrimSpace(skill.ID)
		if id == "" {
			id = "skill-" + uuid.NewString()
		}
		name := normalizeAISkillName(skill.Name)
		prompt := normalizeAISkillPrompt(skill.Prompt)
		if name == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		createdAt := strings.TrimSpace(skill.CreatedAt)
		if createdAt == "" {
			createdAt = now
		}
		normalized = append(normalized, aiSkill{
			ID:        id,
			Name:      name,
			Prompt:    prompt,
			CreatedAt: createdAt,
			UpdatedAt: now,
		})
		_ = index
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	if _, err = tx.Exec(`DELETE FROM ai_skills`); err != nil {
		return nil, err
	}
	for _, skill := range normalized {
		if _, err = tx.Exec(`INSERT INTO ai_skills(id, name, prompt, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`, skill.ID, skill.Name, skill.Prompt, skill.CreatedAt, skill.UpdatedAt); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeAISkillName(name string) string {
	normalized := strings.TrimSpace(name)
	if normalized == "" {
		return ""
	}
	runes := []rune(normalized)
	if len(runes) > 60 {
		return string(runes[:60])
	}
	return normalized
}

func normalizeAISkillPrompt(prompt string) string {
	return strings.TrimSpace(prompt)
}
