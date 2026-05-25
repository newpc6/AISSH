package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
)

type healthResponse struct {
	Status       string   `json:"status"`
	Service      string   `json:"service"`
	Version      string   `json:"version"`
	Timestamp    string   `json:"timestamp"`
	Capabilities []string `json:"capabilities"`
}

type hostRecord struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Address       string `json:"address"`
	Port          int    `json:"port"`
	Username      string `json:"username"`
	AuthType      string `json:"authType"`
	Group         string `json:"group,omitempty"`
	Password      string `json:"password,omitempty"`
	PrivateKey    string `json:"privateKey,omitempty"`
	Description   string `json:"description,omitempty"`
	HasPassword   bool   `json:"hasPassword,omitempty"`
	HasPrivateKey bool   `json:"hasPrivateKey,omitempty"`
}

type hostUpsertRequest struct {
	Name        string `json:"name"`
	Address     string `json:"address"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	AuthType    string `json:"authType"`
	Group       string `json:"group,omitempty"`
	Password    string `json:"password,omitempty"`
	PrivateKey  string `json:"privateKey,omitempty"`
	Description string `json:"description,omitempty"`
}

type hostsImportRequest struct {
	Hosts []hostUpsertRequest `json:"hosts"`
}

type sessionRecord struct {
	ID        string `json:"id"`
	HostID    string `json:"hostId"`
	HostName  string `json:"hostName"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
	LastError string `json:"lastError,omitempty"`
}

type sessionOpenRequest struct {
	HostID        string      `json:"hostId"`
	TransientHost *hostRecord `json:"transientHost,omitempty"`
}

type sessionOpenResponse struct {
	Session sessionRecord `json:"session"`
}

type sessionInputRequest struct {
	Data string `json:"data"`
}

type terminalEvent struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
}

type terminalSession struct {
	record sessionRecord
	input  chan string
	output chan terminalEvent
	done   chan struct{}
	once   sync.Once
}

type sessionManager struct {
	mu       sync.RWMutex
	hosts    []hostRecord
	sessions map[string]*terminalSession
}

func newSessionManager() *sessionManager {
	return &sessionManager{
		hosts: []hostRecord{
			{
				ID:          "local-demo",
				Name:        "Local Demo",
				Address:     "demo.local",
				Port:        0,
				Username:    "demo",
				AuthType:    "agent",
				Group:       "演示",
				Description: "本地演示会话，用于验证终端输入输出链路",
			},
			{
				ID:          "gpu-dev-01",
				Name:        "GPU Dev 01",
				Address:     "10.10.1.25",
				Port:        22,
				Username:    "ubuntu",
				AuthType:    "privateKey",
				Group:       "开发环境",
				Description: "AI 训练与实验环境",
			},
			{
				ID:          "prod-api-01",
				Name:        "Prod API 01",
				Address:     "10.10.8.12",
				Port:        22,
				Username:    "deploy",
				AuthType:    "agent",
				Group:       "生产环境",
				Description: "线上 API 节点",
			},
		},
		sessions: make(map[string]*terminalSession),
	}
}

func (m *sessionManager) listHosts() []hostRecord {
	m.mu.RLock()
	defer m.mu.RUnlock()

	hosts := make([]hostRecord, len(m.hosts))
	for i, host := range m.hosts {
		hosts[i] = host.sanitized()
	}
	return hosts
}

func (m *sessionManager) createHost(request hostUpsertRequest) hostRecord {
	m.mu.Lock()
	defer m.mu.Unlock()

	host := hostFromRequest(request)
	host.ID = "host-" + uuid.NewString()
	m.hosts = append(m.hosts, host)
	return host.sanitized()
}

func (m *sessionManager) updateHost(hostID string, request hostUpsertRequest) (hostRecord, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i := range m.hosts {
		if m.hosts[i].ID == hostID {
			next := hostFromRequest(request)
			next.ID = hostID
			if next.Password == "" {
				next.Password = m.hosts[i].Password
			}
			if next.PrivateKey == "" {
				next.PrivateKey = m.hosts[i].PrivateKey
			}
			m.hosts[i] = next
			return next.sanitized(), true
		}
	}

	return hostRecord{}, false
}

func (m *sessionManager) deleteHost(hostID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i := range m.hosts {
		if m.hosts[i].ID == hostID {
			m.hosts = append(m.hosts[:i], m.hosts[i+1:]...)
			return true
		}
	}

	return false
}

func (m *sessionManager) importHosts(requests []hostUpsertRequest) []hostRecord {
	m.mu.Lock()
	defer m.mu.Unlock()

	created := make([]hostRecord, 0, len(requests))
	for _, request := range requests {
		host := hostFromRequest(request)
		host.ID = "host-" + uuid.NewString()
		m.hosts = append(m.hosts, host)
		created = append(created, host.sanitized())
	}
	return created
}

func hostFromRequest(request hostUpsertRequest) hostRecord {
	port := request.Port
	if port == 0 {
		port = 22
	}
	authType := request.AuthType
	if authType == "" {
		authType = "password"
	}
	return hostRecord{
		Name:        request.Name,
		Address:     request.Address,
		Port:        port,
		Username:    request.Username,
		AuthType:    authType,
		Group:       request.Group,
		Password:    request.Password,
		PrivateKey:  request.PrivateKey,
		Description: request.Description,
	}
}

func (h hostRecord) sanitized() hostRecord {
	h.HasPassword = h.Password != ""
	h.HasPrivateKey = h.PrivateKey != ""
	h.Password = ""
	h.PrivateKey = ""
	return h
}

func (m *sessionManager) openSession(request sessionOpenRequest) (*terminalSession, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var selectedHost *hostRecord
	if request.TransientHost != nil {
		host := *request.TransientHost
		host.ID = "transient-" + uuid.NewString()
		if host.Name == "" {
			host.Name = host.Username + "@" + host.Address
		}
		if host.Port == 0 {
			host.Port = 22
		}
		selectedHost = &host
	} else {
		for i := range m.hosts {
			if m.hosts[i].ID == request.HostID {
				selectedHost = &m.hosts[i]
				break
			}
		}
	}

	if selectedHost == nil {
		return nil, false
	}

	session := &terminalSession{
		record: sessionRecord{
			ID:        uuid.NewString(),
			HostID:    selectedHost.ID,
			HostName:  selectedHost.Name,
			Status:    "connecting",
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		},
		input:  make(chan string, 64),
		output: make(chan terminalEvent, 256),
		done:   make(chan struct{}),
	}

	m.sessions[session.record.ID] = session

	if selectedHost.ID == "local-demo" {
		go session.runDemo()
	} else {
		go session.runSSH(*selectedHost)
	}

	return session, true
}

func (m *sessionManager) getSession(sessionID string) (*terminalSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	session, ok := m.sessions[sessionID]
	return session, ok
}

func (s *terminalSession) snapshot() sessionRecord {
	return s.record
}

func (s *terminalSession) send(event terminalEvent) {
	select {
	case s.output <- event:
	case <-s.done:
	}
}

func (s *terminalSession) close() {
	s.once.Do(func() {
		close(s.done)
		close(s.output)
	})
}

func (s *terminalSession) runDemo() {
	s.record.Status = "connected"
	s.send(terminalEvent{Type: "status", Data: "connected"})
	s.send(terminalEvent{Type: "output", Data: "\r\nAI SSH demo shell connected.\r\n"})
	s.send(terminalEvent{Type: "output", Data: "Type anything and press Enter. Demo mode echoes input.\r\n\r\n$ "})

	var line string
	for {
		select {
		case data := <-s.input:
			for _, r := range data {
				switch r {
				case '\r', '\n':
					s.send(terminalEvent{Type: "output", Data: "\r\n"})
					if line == "clear" {
						s.send(terminalEvent{Type: "output", Data: "\x1b[2J\x1b[H$ "})
					} else {
						s.send(terminalEvent{Type: "output", Data: fmt.Sprintf("demo: %s\r\n$ ", line)})
					}
					line = ""
				case '\u007f', '\b':
					if len(line) > 0 {
						line = line[:len(line)-1]
						s.send(terminalEvent{Type: "output", Data: "\b \b"})
					}
				default:
					line += string(r)
					s.send(terminalEvent{Type: "output", Data: string(r)})
				}
			}
		case <-s.done:
			return
		}
	}
}

func (s *terminalSession) runSSH(host hostRecord) {
	defer s.close()

	addr := fmt.Sprintf("%s:%d", host.Address, host.Port)
	authMethods := []ssh.AuthMethod{}
	if host.AuthType == "password" && host.Password != "" {
		authMethods = append(authMethods, ssh.Password(host.Password))
	}
	if host.AuthType == "privateKey" && host.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(host.PrivateKey))
		if err != nil {
			s.record.Status = "error"
			s.record.LastError = err.Error()
			s.send(terminalEvent{Type: "error", Data: err.Error()})
			return
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	config := &ssh.ClientConfig{
		User:            host.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         8 * time.Second,
	}

	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		s.record.Status = "error"
		s.record.LastError = err.Error()
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			s.send(terminalEvent{Type: "error", Data: "SSH connection timed out"})
			return
		}
		s.send(terminalEvent{Type: "error", Data: err.Error()})
		return
	}
	defer client.Close()

	sshSession, err := client.NewSession()
	if err != nil {
		s.record.Status = "error"
		s.record.LastError = err.Error()
		s.send(terminalEvent{Type: "error", Data: err.Error()})
		return
	}
	defer sshSession.Close()

	stdin, err := sshSession.StdinPipe()
	if err != nil {
		s.record.Status = "error"
		s.record.LastError = err.Error()
		s.send(terminalEvent{Type: "error", Data: err.Error()})
		return
	}

	stdout, err := sshSession.StdoutPipe()
	if err != nil {
		s.record.Status = "error"
		s.record.LastError = err.Error()
		s.send(terminalEvent{Type: "error", Data: err.Error()})
		return
	}

	stderr, err := sshSession.StderrPipe()
	if err != nil {
		s.record.Status = "error"
		s.record.LastError = err.Error()
		s.send(terminalEvent{Type: "error", Data: err.Error()})
		return
	}

	if err := sshSession.RequestPty("xterm-256color", 40, 120, ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}); err != nil {
		s.record.Status = "error"
		s.record.LastError = err.Error()
		s.send(terminalEvent{Type: "error", Data: err.Error()})
		return
	}

	if err := sshSession.Shell(); err != nil {
		s.record.Status = "error"
		s.record.LastError = err.Error()
		s.send(terminalEvent{Type: "error", Data: err.Error()})
		return
	}

	s.record.Status = "connected"
	s.send(terminalEvent{Type: "status", Data: "connected"})

	go copyOutput(s, stdout)
	go copyOutput(s, stderr)

	for {
		select {
		case data := <-s.input:
			if _, err := io.WriteString(stdin, data); err != nil {
				s.record.Status = "error"
				s.record.LastError = err.Error()
				s.send(terminalEvent{Type: "error", Data: err.Error()})
				return
			}
		case <-s.done:
			return
		}
	}
}

func copyOutput(session *terminalSession, reader io.Reader) {
	buffer := make([]byte, 4096)
	for {
		n, err := reader.Read(buffer)
		if n > 0 {
			session.send(terminalEvent{Type: "output", Data: string(buffer[:n])})
		}
		if err != nil {
			if err != io.EOF {
				session.send(terminalEvent{Type: "error", Data: err.Error()})
			}
			return
		}
	}
}

func New(port string) *http.Server {
	mux := http.NewServeMux()
	manager := newSessionManager()

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
			writeJSON(w, manager.createHost(request))
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/hosts/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, map[string][]hostRecord{"hosts": manager.listHosts()})
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
		writeJSON(w, map[string][]hostRecord{"hosts": manager.importHosts(request.Hosts)})
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
			host, ok := manager.updateHost(hostID, request)
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

		session, ok := manager.openSession(request)
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
		default:
			http.NotFound(w, r)
		}
	})

	return &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%s", port),
		Handler:           mux,
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
