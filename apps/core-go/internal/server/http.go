package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func New(port string) *http.Server {
	return newServer(port, newSessionManager())
}

func newServer(port string, manager *sessionManager) *http.Server {
	mux := http.NewServeMux()
	logger := manager.logger
	authenticator := newWebAuthenticator(logger)
	aiChats := newAIChatStore(logger)

	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		writeJSON(w, healthResponse{
			Status:    "ok",
			Service:   "ai-ssh-core",
			Version:   "0.1.0",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			HostStore: manager.store.path,
			Capabilities: []string{
				"health-check",
				"api-contract",
				"ssh-session-stream",
				"ai-assist",
				"ai-agent",
				"ai-stream",
				"ai-unified",
				"ai-chat-history",
			},
		})
	}

	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/health", healthHandler)
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, LoadCoreConfig())
		case http.MethodPut:
			var cfg CoreConfig
			if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			if err := SaveCoreConfig(cfg); err != nil {
				logger.error("config", "save core config failed", map[string]any{"error": err.Error()})
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			logger.info("config", "core config updated; restart required for bind host or port changes", map[string]any{
				"bindHost": cfg.BindHost,
				"port":     cfg.Port,
			})
			writeJSON(w, map[string]string{"message": "config saved; restart core for host/port changes to take effect"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/auth/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, authenticator.status(r))
	})
	mux.HandleFunc("/api/auth/setup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var request webAuthSetupRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if err := authenticator.setup(w, request); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, authenticator.status(r))
	})
	mux.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var request webLoginRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if !authenticator.login(w, request) {
			http.Error(w, "用户名或密码错误", http.StatusUnauthorized)
			return
		}
		writeJSON(w, authenticator.status(r))
	})
	mux.HandleFunc("/api/auth/desktop-setup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var request webAuthSetupRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if err := authenticator.setupFromDesktop(w, r, request); err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		writeJSON(w, authenticator.status(r))
	})
	mux.HandleFunc("/api/auth/desktop", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !authenticator.desktopLogin(w, r) {
			http.Error(w, "desktop token invalid", http.StatusUnauthorized)
			return
		}
		writeJSON(w, authenticator.status(r))
	})
	mux.HandleFunc("/api/auth/desktop-token", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !authenticator.desktopAuthenticated(r) {
			http.Error(w, "desktop token invalid", http.StatusUnauthorized)
			return
		}
		writeJSON(w, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		authenticator.logout(w, r)
		writeJSON(w, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/api/auth/settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			response, ok := authenticator.settings(r)
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			writeJSON(w, response)
		case http.MethodPut:
			var request webAuthSettingsRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			response, ok, err := authenticator.updateSettings(r, request)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			writeJSON(w, response)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, map[string][]logEntry{"logs": logger.list(parseLogLimit(r))})
	})
	mux.HandleFunc("/api/logs/settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, logger.settings())
		case http.MethodPut:
			var request logSettingsRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			logger.updateSettings(request)
			writeJSON(w, logger.settings())
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/ai/predict", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var request aiPredictionRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		response, err := predictCommands(r.Context(), request, logger)
		if err != nil {
			logger.error("ai", "prediction failed", map[string]any{"error": err.Error()})
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		logger.info("ai", "prediction completed", map[string]any{"count": len(response.Commands), "model": request.Model})
		writeJSON(w, response)
	})
	mux.HandleFunc("/api/ai/predict/stream", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var request aiPredictionRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		streamAIEvents(w, r, logger, func(write aiStreamWriter) error {
			return streamPredictedCommands(r.Context(), request, logger, write)
		})
	})
	mux.HandleFunc("/api/ai/assist", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var request aiAssistRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		response, err := assistWithAI(r.Context(), request, logger)
		if err != nil {
			logger.error("ai", "assist failed", map[string]any{"error": err.Error()})
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, response)
	})
	mux.HandleFunc("/api/ai/assist/stream", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var request aiAssistRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		streamAIEvents(w, r, logger, func(write aiStreamWriter) error {
			return streamAssistWithAI(r.Context(), request, logger, write)
		})
	})
	mux.HandleFunc("/api/ai/chats", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			before := r.URL.Query().Get("before")
			limit := 80
			if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
				if parsed, err := fmt.Sscanf(rawLimit, "%d", &limit); err == nil && parsed == 1 && limit > 0 {
					if limit > 200 {
						limit = 200
					}
				}
			}
			conversations, err := aiChats.listConversations(before, limit)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, map[string][]aiChatConversation{"conversations": conversations})
		case http.MethodPost:
			var request aiChatConversationCreateRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil && err != io.EOF {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			conversation, err := aiChats.createConversation(request.Title)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, conversation)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/ai/chats/", func(w http.ResponseWriter, r *http.Request) {
		rest := strings.TrimPrefix(r.URL.Path, "/api/ai/chats/")
		parts := strings.Split(strings.Trim(rest, "/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			http.NotFound(w, r)
			return
		}
		conversationID := parts[0]
		if len(parts) == 1 {
			if r.Method == http.MethodDelete {
				if err := aiChats.deleteConversation(conversationID); err != nil {
					http.Error(w, err.Error(), http.StatusNotFound)
					return
				}
				writeJSON(w, map[string]string{"status": "ok"})
				return
			}
			if r.Method != http.MethodPatch {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			var request aiChatConversationUpdateRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			conversation, err := aiChats.updateConversation(conversationID, request)
			if err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			writeJSON(w, conversation)
			return
		}
		if len(parts) == 2 && parts[1] == "messages" {
			switch r.Method {
			case http.MethodGet:
				messages, err := aiChats.listMessages(conversationID, 500)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				writeJSON(w, map[string][]aiChatMessage{"messages": messages})
			case http.MethodPost:
				var request aiChatMessageCreateRequest
				if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
					http.Error(w, "invalid request body", http.StatusBadRequest)
					return
				}
				message, err := aiChats.addMessage(conversationID, request)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				writeJSON(w, message)
			default:
				w.WriteHeader(http.StatusMethodNotAllowed)
			}
			return
		}
		if len(parts) == 3 && parts[1] == "messages" {
			if r.Method != http.MethodPatch {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			var request aiChatMessageUpdateRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			message, err := aiChats.updateMessage(conversationID, parts[2], request)
			if err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			writeJSON(w, message)
			return
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("/api/hosts", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, manager.listHosts())
		case http.MethodPost:
			var request hostUpsertRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			host, err := manager.createHost(request)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, host)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/host-groups", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, hostGroupsResponse{Groups: manager.listHostGroups()})
		case http.MethodPut:
			var request hostGroupsUpdateRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			writeJSON(w, hostGroupsResponse{Groups: manager.updateHostGroups(request)})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/hosts/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		includeCredentials := r.URL.Query().Get("credentials") == "1"
		response, err := manager.exportHosts(includeCredentials)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, response)
	})
	mux.HandleFunc("/api/hosts/import", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var request hostsImportRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string][]hostRecord{"hosts": manager.importHosts(request)})
	})
	mux.HandleFunc("/api/hosts/", func(w http.ResponseWriter, r *http.Request) {
		hostID := r.URL.Path[len("/api/hosts/"):]
		if hostID == "" {
			http.NotFound(w, r)
			return
		}

		switch r.Method {
		case http.MethodPut:
			var request hostUpsertRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			host, ok, err := manager.updateHost(hostID, request)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if !ok {
				http.Error(w, "host not found", http.StatusNotFound)
				return
			}
			writeJSON(w, host)
		case http.MethodDelete:
			if !manager.deleteHost(hostID) {
				http.Error(w, "host not found", http.StatusNotFound)
				return
			}
			writeJSON(w, map[string]string{"status": "ok"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/files/", func(w http.ResponseWriter, r *http.Request) {
		hostID := r.URL.Path[len("/api/files/"):]
		if hostID == "" {
			http.NotFound(w, r)
			return
		}

		host, ok, err := manager.resolveStoredHost(hostID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, "host not found", http.StatusNotFound)
			return
		}

		remotePath := r.URL.Query().Get("path")
		switch r.Method {
		case http.MethodGet:
			if r.URL.Query().Get("download") == "1" {
				if !authenticator.requestAuthenticated(r) {
					http.Error(w, "unauthorized", http.StatusUnauthorized)
					return
				}
				if err := downloadRemoteFile(host, remotePath, w); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
				}
				return
			}
			response, err := listRemoteFiles(host, remotePath)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, response)
		case http.MethodPost:
			if err := uploadRemoteFile(host, remotePath, r); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, map[string]string{"status": "ok"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/metrics/", func(w http.ResponseWriter, r *http.Request) {
		hostID := r.URL.Path[len("/api/metrics/"):]
		if hostID == "" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		host, ok, err := manager.resolveStoredHost(hostID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, "host not found", http.StatusNotFound)
			return
		}

		metrics, err := collectServerMetrics(host)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, metrics)
	})

	mux.HandleFunc("/api/system-info/", func(w http.ResponseWriter, r *http.Request) {
		hostID := r.URL.Path[len("/api/system-info/"):]
		if hostID == "" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		host, ok, err := manager.resolveStoredHost(hostID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, "host not found", http.StatusNotFound)
			return
		}

		info, err := collectSystemInfo(host)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, info)
	})

	mux.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var request sessionOpenRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		session, ok, err := manager.openSession(request)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, "host not found", http.StatusNotFound)
			return
		}

		writeJSON(w, sessionOpenResponse{Session: session.snapshot()})
	})
	mux.HandleFunc("/api/sessions/", func(w http.ResponseWriter, r *http.Request) {
		sessionID, action, ok := parseSessionPath(r.URL.Path)
		if !ok {
			http.NotFound(w, r)
			return
		}

		switch action {
		case "events":
			session, exists := manager.getSession(sessionID)
			if !exists {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			if r.Method != http.MethodGet {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			streamSessionEvents(w, r, session)
		case "input":
			session, exists := manager.getSession(sessionID)
			if !exists {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			writeSessionInput(w, r, session)
		case "resize":
			session, exists := manager.getSession(sessionID)
			if !exists {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			resizeSession(w, r, session)
		case "cwd":
			session, exists := manager.getSession(sessionID)
			if !exists {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			if r.Method != http.MethodGet {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			writeJSON(w, map[string]string{"path": session.currentCWD()})
		case "reconnect":
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			newSession, oldSession, ok, err := manager.reconnectSession(sessionID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if !ok {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			writeJSON(w, sessionReconnectResponse{
				PreviousSessionID: oldSession.record.ID,
				Session:           newSession.snapshot(),
			})
		case "close":
			if _, exists := manager.getSession(sessionID); !exists {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			manager.closeSession(sessionID)
			writeJSON(w, map[string]string{"status": "ok"})
		default:
			http.NotFound(w, r)
		}
	})

	handler := http.Handler(mux)
	if staticDir := resolveWebStaticDir(); staticDir != "" {
		logger.info("web", "serving web assets", map[string]any{"dir": staticDir})
		handler = withStaticFallback(handler, staticDir)
	} else {
		logger.info("web", "web assets not configured; api only mode", nil)
	}
	handler = authenticator.requireAuth(handler)

	return &http.Server{
		Addr:              fmt.Sprintf("%s:%s", resolveBindHost(), port),
		Handler:           logger.middleware(withCORS(handler)),
		ReadHeaderTimeout: 5 * time.Second,
	}
}

func resolveBindHost() string {
	host := strings.TrimSpace(os.Getenv("AI_SSH_BIND_HOST"))
	if host == "" {
		return "0.0.0.0"
	}
	return host
}

func resolveWebStaticDir() string {
	if value := strings.TrimSpace(os.Getenv("AI_SSH_WEB_ROOT")); value != "" {
		if directoryExists(value) {
			return value
		}
		return ""
	}

	candidates := []string{
		filepath.Join("apps", "desktop", "dist"),
		filepath.Join("..", "..", "desktop", "dist"),
		filepath.Join("web"),
		filepath.Join("dist"),
	}
	executable, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(executable)
		candidates = append([]string{
			filepath.Join(exeDir, "web"),
			filepath.Join(exeDir, "dist"),
			filepath.Join(exeDir, "resources", "web"),
			filepath.Join(exeDir, "..", "resources", "web"),
		}, candidates...)
	}
	for _, candidate := range candidates {
		if directoryExists(candidate) {
			return candidate
		}
	}
	return ""
}

func directoryExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func withStaticFallback(api http.Handler, staticDir string) http.Handler {
	fileServer := http.FileServer(http.Dir(staticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/health" {
			api.ServeHTTP(w, r)
			return
		}

		requestPath := strings.TrimPrefix(filepath.Clean(r.URL.Path), string(filepath.Separator))
		if requestPath == "." || requestPath == "" {
			http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
			return
		}
		fullPath := filepath.Join(staticDir, requestPath)
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(value)
}

func parseSessionPath(path string) (string, string, bool) {
	const prefix = "/api/sessions/"
	if len(path) <= len(prefix) {
		return "", "", false
	}

	rest := path[len(prefix):]
	for i := 0; i < len(rest); i++ {
		if rest[i] == '/' {
			return rest[:i], rest[i+1:], rest[:i] != "" && rest[i+1:] != ""
		}
	}

	return "", "", false
}

func streamSessionEvents(w http.ResponseWriter, r *http.Request, session *terminalSession) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	writer := bufio.NewWriter(w)
	defer writer.Flush()

	status, lastError := session.snapshotStatus()
	if status != "" {
		writeSSEEvent(writer, flusher, terminalEvent{Type: "status", Data: status})
	}
	if lastError != "" {
		writeSSEEvent(writer, flusher, terminalEvent{Type: "error", Data: lastError})
		if status == "error" || status == "closed" {
			_, _ = writer.WriteString("event: close\ndata: {}\n\n")
			flusher.Flush()
			return
		}
	}

	for {
		select {
		case event, ok := <-session.output:
			if !ok {
				_, _ = writer.WriteString("event: close\ndata: {}\n\n")
				flusher.Flush()
				return
			}

			payload, _ := json.Marshal(event)
			_, _ = writer.WriteString("event: terminal\n")
			_, _ = writer.WriteString("data: ")
			_, _ = writer.Write(payload)
			_, _ = writer.WriteString("\n\n")
			_ = writer.Flush()
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func writeSSEEvent(writer *bufio.Writer, flusher http.Flusher, event terminalEvent) {
	payload, _ := json.Marshal(event)
	_, _ = writer.WriteString("event: terminal\n")
	_, _ = writer.WriteString("data: ")
	_, _ = writer.Write(payload)
	_, _ = writer.WriteString("\n\n")
	_ = writer.Flush()
	flusher.Flush()
}

func streamAIEvents(w http.ResponseWriter, r *http.Request, logger *appLogger, run func(aiStreamWriter) error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	writer := bufio.NewWriter(w)
	write := func(event aiStreamEvent) error {
		payload, _ := json.Marshal(event)
		if _, err := writer.WriteString("event: ai\n"); err != nil {
			return err
		}
		if _, err := writer.WriteString("data: "); err != nil {
			return err
		}
		if _, err := writer.Write(payload); err != nil {
			return err
		}
		if _, err := writer.WriteString("\n\n"); err != nil {
			return err
		}
		if err := writer.Flush(); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	if err := run(write); err != nil {
		logger.error("ai", "stream failed", map[string]any{"path": r.URL.Path, "error": err.Error()})
		_ = write(aiStreamEvent{Type: "error", Error: err.Error()})
	}
	_ = writer.Flush()
}

func writeSessionInput(w http.ResponseWriter, r *http.Request, session *terminalSession) {
	var request sessionInputRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	select {
	case session.input <- request.Data:
		writeJSON(w, map[string]string{"status": "ok"})
	case <-session.done:
		http.Error(w, "session closed", http.StatusGone)
	}
}

func resizeSession(w http.ResponseWriter, r *http.Request, session *terminalSession) {
	var request sessionResizeRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if request.Cols <= 0 || request.Rows <= 0 {
		http.Error(w, "invalid terminal size", http.StatusBadRequest)
		return
	}

	select {
	case session.resize <- request:
		writeJSON(w, map[string]string{"status": "ok"})
	case <-session.done:
		http.Error(w, "session closed", http.StatusGone)
	}
}
