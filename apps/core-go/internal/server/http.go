package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func New(port string) *http.Server {
	return newServer(port, newSessionManager())
}

func newServer(port string, manager *sessionManager) *http.Server {
	mux := http.NewServeMux()
	logger := manager.logger

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
			Capabilities: []string{
				"health-check",
				"api-contract",
				"ssh-session-stream",
			},
		})
	}

	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/health", healthHandler)
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
			logger.setLevel(request.Level)
			writeJSON(w, logger.settings())
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
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

		session, exists := manager.getSession(sessionID)
		if !exists {
			http.Error(w, "session not found", http.StatusNotFound)
			return
		}

		switch action {
		case "events":
			if r.Method != http.MethodGet {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			streamSessionEvents(w, r, session)
		case "input":
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			writeSessionInput(w, r, session)
		case "close":
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

	return &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%s", port),
		Handler:           logger.middleware(withCORS(mux)),
		ReadHeaderTimeout: 5 * time.Second,
	}
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
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

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	writer := bufio.NewWriter(w)
	defer writer.Flush()

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
