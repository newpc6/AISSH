package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type aiChatStore struct {
	path   string
	db     *sql.DB
	mu     sync.Mutex
	logger *appLogger
}

func newAIChatStore(logger *appLogger) *aiChatStore {
	path := filepath.Join(resolveHostStoreBaseDir(), "data", "ai-chat.sqlite3")
	store := &aiChatStore{path: path, logger: logger}
	if err := store.open(); err != nil && logger != nil {
		logger.error("ai.chat", "open ai chat store failed", map[string]any{"path": path, "error": err.Error()})
	}
	return store
}

func (s *aiChatStore) open() error {
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
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  response_json TEXT,
  step_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
`); err != nil {
		_ = db.Close()
		return err
	}
	s.db = db
	return nil
}

func (s *aiChatStore) ensureDB() (*sql.DB, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.open(); err != nil {
		return nil, err
	}
	return s.db, nil
}

func (s *aiChatStore) listConversations(limit int) ([]aiChatConversation, error) {
	db, err := s.ensureDB()
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 80
	}
	rows, err := db.Query(`SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	conversations := []aiChatConversation{}
	for rows.Next() {
		var conversation aiChatConversation
		if err := rows.Scan(&conversation.ID, &conversation.Title, &conversation.CreatedAt, &conversation.UpdatedAt); err != nil {
			return nil, err
		}
		conversations = append(conversations, conversation)
	}
	return conversations, rows.Err()
}

func (s *aiChatStore) createConversation(title string) (aiChatConversation, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiChatConversation{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	conversation := aiChatConversation{
		ID:        "chat-" + uuid.NewString(),
		Title:     normalizeAIChatTitle(title),
		CreatedAt: now,
		UpdatedAt: now,
	}
	_, err = db.Exec(`INSERT INTO conversations(id, title, created_at, updated_at) VALUES(?, ?, ?, ?)`, conversation.ID, conversation.Title, conversation.CreatedAt, conversation.UpdatedAt)
	return conversation, err
}

func (s *aiChatStore) updateConversation(id string, request aiChatConversationUpdateRequest) (aiChatConversation, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiChatConversation{}, err
	}
	title := normalizeAIChatTitle(request.Title)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	result, err := db.Exec(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`, title, now, id)
	if err != nil {
		return aiChatConversation{}, err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return aiChatConversation{}, sql.ErrNoRows
	}
	return s.getConversation(id)
}

func (s *aiChatStore) deleteConversation(id string) error {
	db, err := s.ensureDB()
	if err != nil {
		return err
	}
	if strings.TrimSpace(id) == "" {
		return errors.New("conversation id is required")
	}
	result, err := db.Exec(`DELETE FROM conversations WHERE id = ?`, id)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *aiChatStore) getConversation(id string) (aiChatConversation, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiChatConversation{}, err
	}
	var conversation aiChatConversation
	err = db.QueryRow(`SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?`, id).Scan(
		&conversation.ID,
		&conversation.Title,
		&conversation.CreatedAt,
		&conversation.UpdatedAt,
	)
	return conversation, err
}

func (s *aiChatStore) listMessages(conversationID string, limit int) ([]aiChatMessage, error) {
	db, err := s.ensureDB()
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 1000 {
		limit = 500
	}
	rows, err := db.Query(`
SELECT id, conversation_id, kind, content, response_json, step_json, created_at
FROM (
  SELECT id, conversation_id, kind, content, response_json, step_json, created_at
  FROM messages
  WHERE conversation_id = ?
  ORDER BY created_at DESC
  LIMIT ?
) ORDER BY created_at ASC`, conversationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := []aiChatMessage{}
	for rows.Next() {
		message, err := scanAIChatMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, message)
	}
	return messages, rows.Err()
}

func (s *aiChatStore) addMessage(conversationID string, request aiChatMessageCreateRequest) (aiChatMessage, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiChatMessage{}, err
	}
	if strings.TrimSpace(conversationID) == "" {
		return aiChatMessage{}, errors.New("conversation id is required")
	}
	if _, err := s.getConversation(conversationID); err != nil {
		return aiChatMessage{}, err
	}
	kind := normalizeAIChatMessageKind(request.Kind)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	message := aiChatMessage{
		ID:             "msg-" + uuid.NewString(),
		ConversationID: conversationID,
		Kind:           kind,
		Content:        strings.TrimSpace(request.Content),
		CreatedAt:      now,
		Response:       request.Response,
		Step:           request.Step,
	}
	responseJSON, err := marshalNullableJSON(message.Response)
	if err != nil {
		return aiChatMessage{}, err
	}
	stepJSON, err := marshalNullableJSON(message.Step)
	if err != nil {
		return aiChatMessage{}, err
	}
	tx, err := db.Begin()
	if err != nil {
		return aiChatMessage{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(
		`INSERT INTO messages(id, conversation_id, kind, content, response_json, step_json, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)`,
		message.ID,
		message.ConversationID,
		message.Kind,
		message.Content,
		nullableString(responseJSON),
		nullableString(stepJSON),
		message.CreatedAt,
	); err != nil {
		return aiChatMessage{}, err
	}
	if _, err := tx.Exec(`UPDATE conversations SET updated_at = ? WHERE id = ?`, now, conversationID); err != nil {
		return aiChatMessage{}, err
	}
	if err := tx.Commit(); err != nil {
		return aiChatMessage{}, err
	}
	return message, nil
}

func (s *aiChatStore) getMessage(conversationID string, messageID string) (aiChatMessage, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiChatMessage{}, err
	}
	row := db.QueryRow(`
SELECT id, conversation_id, kind, content, response_json, step_json, created_at
FROM messages
WHERE conversation_id = ? AND id = ?`, conversationID, messageID)
	return scanAIChatMessage(row)
}

func (s *aiChatStore) updateMessage(conversationID string, messageID string, request aiChatMessageUpdateRequest) (aiChatMessage, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiChatMessage{}, err
	}
	if strings.TrimSpace(conversationID) == "" || strings.TrimSpace(messageID) == "" {
		return aiChatMessage{}, errors.New("conversation id and message id are required")
	}
	responseJSON, err := marshalNullableJSON(request.Response)
	if err != nil {
		return aiChatMessage{}, err
	}
	stepJSON, err := marshalNullableJSON(request.Step)
	if err != nil {
		return aiChatMessage{}, err
	}
	tx, err := db.Begin()
	if err != nil {
		return aiChatMessage{}, err
	}
	defer tx.Rollback()
	result, err := tx.Exec(
		`UPDATE messages SET content = ?, response_json = ?, step_json = ? WHERE conversation_id = ? AND id = ?`,
		strings.TrimSpace(request.Content),
		nullableString(responseJSON),
		nullableString(stepJSON),
		conversationID,
		messageID,
	)
	if err != nil {
		return aiChatMessage{}, err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return aiChatMessage{}, sql.ErrNoRows
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := tx.Exec(`UPDATE conversations SET updated_at = ? WHERE id = ?`, now, conversationID); err != nil {
		return aiChatMessage{}, err
	}
	if err := tx.Commit(); err != nil {
		return aiChatMessage{}, err
	}
	return s.getMessage(conversationID, messageID)
}

type aiChatMessageScanner interface {
	Scan(dest ...any) error
}

func scanAIChatMessage(scanner aiChatMessageScanner) (aiChatMessage, error) {
	var message aiChatMessage
	var responseJSON sql.NullString
	var stepJSON sql.NullString
	if err := scanner.Scan(
		&message.ID,
		&message.ConversationID,
		&message.Kind,
		&message.Content,
		&responseJSON,
		&stepJSON,
		&message.CreatedAt,
	); err != nil {
		return message, err
	}
	if responseJSON.Valid && responseJSON.String != "" {
		var response aiAssistResponse
		if err := json.Unmarshal([]byte(responseJSON.String), &response); err == nil {
			message.Response = &response
		}
	}
	if stepJSON.Valid && stepJSON.String != "" {
		var step aiAgentStep
		if err := json.Unmarshal([]byte(stepJSON.String), &step); err == nil {
			message.Step = &step
		}
	}
	return message, nil
}

func normalizeAIChatTitle(title string) string {
	normalized := strings.TrimSpace(title)
	if normalized == "" {
		return "新对话"
	}
	runes := []rune(normalized)
	if len(runes) > 36 {
		return string(runes[:36])
	}
	return normalized
}

func normalizeAIChatMessageKind(kind string) string {
	switch kind {
	case "user", "thinking", "content", "assistant", "command", "agent_step", "agent_result", "status", "error":
		return kind
	default:
		return "content"
	}
}

func marshalNullableJSON(value any) (string, error) {
	if value == nil {
		return "", nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
