package server

import (
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type logLevel string

const (
	logLevelDebug logLevel = "debug"
	logLevelInfo  logLevel = "info"
	logLevelWarn  logLevel = "warn"
	logLevelError logLevel = "error"
)

type logEntry struct {
	ID        string         `json:"id"`
	Timestamp string         `json:"timestamp"`
	Level     logLevel       `json:"level"`
	Source    string         `json:"source"`
	Message   string         `json:"message"`
	Fields    map[string]any `json:"fields,omitempty"`
}

type logSettingsRequest struct {
	Level           logLevel `json:"level"`
	LogHealthChecks bool     `json:"logHealthChecks"`
}

type appLogger struct {
	mu              sync.Mutex
	level           logLevel
	logHealthChecks bool
	entries         []logEntry
	max             int
	output          *log.Logger
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func newAppLogger() *appLogger {
	return &appLogger{
		level:           normalizeLogLevel(os.Getenv("AI_SSH_LOG_LEVEL")),
		logHealthChecks: parseBoolEnv("AI_SSH_LOG_HEALTH_CHECKS", false),
		max:             500,
		output:          log.New(os.Stdout, "", 0),
	}
}

func normalizeLogLevel(value string) logLevel {
	switch logLevel(strings.ToLower(strings.TrimSpace(value))) {
	case logLevelDebug:
		return logLevelDebug
	case logLevelWarn:
		return logLevelWarn
	case logLevelError:
		return logLevelError
	default:
		return logLevelInfo
	}
}

func logLevelPriority(level logLevel) int {
	switch level {
	case logLevelDebug:
		return 10
	case logLevelInfo:
		return 20
	case logLevelWarn:
		return 30
	case logLevelError:
		return 40
	default:
		return 20
	}
}

func (l *appLogger) setLevel(level logLevel) {
	l.mu.Lock()
	l.level = normalizeLogLevel(string(level))
	l.mu.Unlock()
	l.info("core", "log level updated", map[string]any{"level": l.level})
}

func (l *appLogger) updateSettings(settings logSettingsRequest) {
	l.mu.Lock()
	l.level = normalizeLogLevel(string(settings.Level))
	l.logHealthChecks = settings.LogHealthChecks
	level := l.level
	logHealthChecks := l.logHealthChecks
	l.mu.Unlock()
	l.info("core", "log settings updated", map[string]any{"level": level, "logHealthChecks": logHealthChecks})
}

func (l *appLogger) settings() logSettingsRequest {
	l.mu.Lock()
	defer l.mu.Unlock()
	return logSettingsRequest{Level: l.level, LogHealthChecks: l.logHealthChecks}
}

func (l *appLogger) debug(source string, message string, fields map[string]any) {
	l.write(logLevelDebug, source, message, fields)
}

func (l *appLogger) info(source string, message string, fields map[string]any) {
	l.write(logLevelInfo, source, message, fields)
}

func (l *appLogger) warn(source string, message string, fields map[string]any) {
	l.write(logLevelWarn, source, message, fields)
}

func (l *appLogger) error(source string, message string, fields map[string]any) {
	l.write(logLevelError, source, message, fields)
}

func (l *appLogger) write(level logLevel, source string, message string, fields map[string]any) {
	level = normalizeLogLevel(string(level))
	l.mu.Lock()
	defer l.mu.Unlock()

	if logLevelPriority(level) < logLevelPriority(l.level) {
		return
	}

	entry := logEntry{
		ID:        uuid.NewString(),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Level:     level,
		Source:    source,
		Message:   message,
		Fields:    fields,
	}

	l.entries = append(l.entries, entry)
	if len(l.entries) > l.max {
		l.entries = l.entries[len(l.entries)-l.max:]
	}

	l.output.Printf("%s level=%s source=%s message=%q fields=%v", entry.Timestamp, entry.Level, entry.Source, entry.Message, entry.Fields)
}

func (l *appLogger) list(limit int) []logEntry {
	l.mu.Lock()
	defer l.mu.Unlock()

	if limit <= 0 || limit > len(l.entries) {
		limit = len(l.entries)
	}

	start := len(l.entries) - limit
	result := make([]logEntry, limit)
	copy(result, l.entries[start:])
	return result
}

func (l *appLogger) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: w}

		next.ServeHTTP(recorder, r)

		status := recorder.status
		if status == 0 {
			status = http.StatusOK
		}

		l.mu.Lock()
		logHealthChecks := l.logHealthChecks
		l.mu.Unlock()
		if !logHealthChecks && isHealthCheckPath(r.URL.Path) && status < 400 {
			return
		}

		level := logLevelInfo
		if status >= 500 {
			level = logLevelError
		} else if status >= 400 {
			level = logLevelWarn
		}

		l.write(level, "http", "request completed", map[string]any{
			"method":     r.Method,
			"path":       r.URL.Path,
			"status":     status,
			"durationMs": time.Since(start).Milliseconds(),
			"remoteAddr": r.RemoteAddr,
		})
	})
}

func isHealthCheckPath(path string) bool {
	return path == "/health" || path == "/api/health"
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(data []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.ResponseWriter.Write(data)
}

func (r *statusRecorder) Flush() {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-AI-SSH-Desktop-Token")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func parseLogLimit(r *http.Request) int {
	limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil {
		return 200
	}
	return limit
}
