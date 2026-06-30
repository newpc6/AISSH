package server

import (
	"database/sql"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type aiAgentAuditStore struct {
	path   string
	db     *sql.DB
	mu     sync.Mutex
	logger *appLogger
}

func newAIAgentAuditStore(logger *appLogger) *aiAgentAuditStore {
	path := resolveAIChatStorePath()
	store := &aiAgentAuditStore{path: path, logger: logger}
	if err := store.open(); err != nil && logger != nil {
		logger.error("ai.audit", "open ai agent audit store failed", map[string]any{"path": path, "error": err.Error()})
	}
	return store
}

func (s *aiAgentAuditStore) open() error {
	if s.db != nil {
		return nil
	}
	db, err := sql.Open("sqlite", s.path)
	if err != nil {
		return err
	}
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS agent_audit_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  message_id TEXT,
  session_id TEXT,
  host_id TEXT,
  host_name TEXT,
  event_type TEXT NOT NULL,
  agent_mode TEXT,
  command TEXT,
  risk_level TEXT,
  risk_reason TEXT,
  status TEXT,
  exit_code INTEGER,
  output_summary TEXT,
  actor TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_audit_conversation_created ON agent_audit_events(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_audit_session_created ON agent_audit_events(session_id, created_at);
`); err != nil {
		_ = db.Close()
		return err
	}
	s.db = db
	return nil
}

func (s *aiAgentAuditStore) ensureDB() (*sql.DB, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.open(); err != nil {
		return nil, err
	}
	return s.db, nil
}

func (s *aiAgentAuditStore) close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return nil
	}
	err := s.db.Close()
	s.db = nil
	return err
}

func (s *aiAgentAuditStore) addEvent(request aiAgentAuditEventCreateRequest) (aiAgentAuditEvent, error) {
	db, err := s.ensureDB()
	if err != nil {
		return aiAgentAuditEvent{}, err
	}
	eventType := normalizeAgentAuditEventType(request.EventType)
	if eventType == "" {
		return aiAgentAuditEvent{}, errors.New("event type is required")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	event := aiAgentAuditEvent{
		ID:             "audit-" + uuid.NewString(),
		ConversationID: strings.TrimSpace(request.ConversationID),
		MessageID:      strings.TrimSpace(request.MessageID),
		SessionID:      strings.TrimSpace(request.SessionID),
		HostID:         strings.TrimSpace(request.HostID),
		HostName:       trimAuditText(request.HostName, 120),
		EventType:      eventType,
		AgentMode:      normalizeAgentAuditMode(request.AgentMode),
		Command:        trimAuditText(request.Command, 4000),
		RiskLevel:      normalizeAgentAuditRisk(request.RiskLevel),
		RiskReason:     trimAuditText(request.RiskReason, 1000),
		Status:         normalizeAgentAuditStatus(request.Status),
		ExitCode:       request.ExitCode,
		OutputSummary:  trimAuditText(request.OutputSummary, 8000),
		Actor:          normalizeAgentAuditActor(request.Actor),
		Reason:         trimAuditText(request.Reason, 2000),
		CreatedAt:      now,
	}
	_, err = db.Exec(
		`INSERT INTO agent_audit_events(id, conversation_id, message_id, session_id, host_id, host_name, event_type, agent_mode, command, risk_level, risk_reason, status, exit_code, output_summary, actor, reason, created_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		event.ID,
		nullableString(event.ConversationID),
		nullableString(event.MessageID),
		nullableString(event.SessionID),
		nullableString(event.HostID),
		nullableString(event.HostName),
		event.EventType,
		nullableString(event.AgentMode),
		nullableString(event.Command),
		nullableString(event.RiskLevel),
		nullableString(event.RiskReason),
		nullableString(event.Status),
		event.ExitCode,
		nullableString(event.OutputSummary),
		nullableString(event.Actor),
		nullableString(event.Reason),
		event.CreatedAt,
	)
	return event, err
}

func (s *aiAgentAuditStore) listEvents(request aiAgentAuditListRequest) ([]aiAgentAuditEvent, error) {
	db, err := s.ensureDB()
	if err != nil {
		return nil, err
	}
	limit := request.Limit
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	query := `SELECT id, conversation_id, message_id, session_id, host_id, host_name, event_type, agent_mode, command, risk_level, risk_reason, status, exit_code, output_summary, actor, reason, created_at FROM agent_audit_events`
	clauses := []string{}
	args := []any{}
	if strings.TrimSpace(request.ConversationID) != "" {
		clauses = append(clauses, "conversation_id = ?")
		args = append(args, strings.TrimSpace(request.ConversationID))
	}
	if strings.TrimSpace(request.SessionID) != "" {
		clauses = append(clauses, "session_id = ?")
		args = append(args, strings.TrimSpace(request.SessionID))
	}
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}
	query += " ORDER BY created_at DESC LIMIT ?"
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []aiAgentAuditEvent{}
	for rows.Next() {
		event, err := scanAIAgentAuditEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

type aiAgentAuditScanner interface {
	Scan(dest ...any) error
}

func scanAIAgentAuditEvent(scanner aiAgentAuditScanner) (aiAgentAuditEvent, error) {
	var event aiAgentAuditEvent
	var conversationID, messageID, sessionID, hostID, hostName sql.NullString
	var agentMode, command, riskLevel, riskReason, status, outputSummary, actor, reason sql.NullString
	var exitCode sql.NullInt64
	if err := scanner.Scan(
		&event.ID,
		&conversationID,
		&messageID,
		&sessionID,
		&hostID,
		&hostName,
		&event.EventType,
		&agentMode,
		&command,
		&riskLevel,
		&riskReason,
		&status,
		&exitCode,
		&outputSummary,
		&actor,
		&reason,
		&event.CreatedAt,
	); err != nil {
		return event, err
	}
	event.ConversationID = conversationID.String
	event.MessageID = messageID.String
	event.SessionID = sessionID.String
	event.HostID = hostID.String
	event.HostName = hostName.String
	event.AgentMode = agentMode.String
	event.Command = command.String
	event.RiskLevel = riskLevel.String
	event.RiskReason = riskReason.String
	event.Status = status.String
	if exitCode.Valid {
		value := int(exitCode.Int64)
		event.ExitCode = &value
	}
	event.OutputSummary = outputSummary.String
	event.Actor = actor.String
	event.Reason = reason.String
	return event, nil
}

func normalizeAgentAuditEventType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "suggested", "approved", "auto_approved", "started", "completed", "failed", "timed_out", "skipped", "blocked":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeAgentAuditMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "review", "auto", "full-auto":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeAgentAuditRisk(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "low", "medium", "high":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeAgentAuditStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "pending", "approved", "running", "executed", "skipped", "failed":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeAgentAuditActor(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "ai", "user", "system":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "system"
	}
}

func trimAuditText(value string, maxRunes int) string {
	trimmed := strings.TrimSpace(value)
	runes := []rune(trimmed)
	if len(runes) <= maxRunes {
		return trimmed
	}
	return string(runes[len(runes)-maxRunes:])
}
