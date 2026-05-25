package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	pathpkg "path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/pkg/sftp"
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

type fileEntry struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	Type       string `json:"type"`
	Size       int64  `json:"size"`
	ModifiedAt string `json:"modifiedAt"`
}

type fileListResponse struct {
	Path    string      `json:"path"`
	Entries []fileEntry `json:"entries"`
}

type serverMetrics struct {
	HostID         string `json:"hostId"`
	CPUPercent     int    `json:"cpuPercent"`
	MemoryPercent  int    `json:"memoryPercent"`
	DiskPercent    int    `json:"diskPercent"`
	NetworkRxBytes int64  `json:"networkRxBytes"`
	NetworkTxBytes int64  `json:"networkTxBytes"`
	CollectedAt    string `json:"collectedAt"`
}

type terminalSession struct {
	record sessionRecord
	input  chan string
	output chan terminalEvent
	done   chan struct{}
	once   sync.Once
	line   string
}

type sessionManager struct {
	mu          sync.RWMutex
	hosts       []hostRecord
	sessions    map[string]*terminalSession
	store       *hostStore
	credentials credentialStore
	logger      *appLogger
}

type hostStore struct {
	path string
}

type hostStoreFile struct {
	Hosts []hostRecord `json:"hosts"`
}

func newSessionManager() *sessionManager {
	return newSessionManagerWithStores(newHostStore(), newCredentialStore(), newAppLogger())
}

func newSessionManagerWithStores(store *hostStore, credentials credentialStore, logger *appLogger) *sessionManager {
	manager := &sessionManager{
		hosts:       defaultHosts(),
		sessions:    make(map[string]*terminalSession),
		store:       store,
		credentials: credentials,
		logger:      logger,
	}

	if hosts, err := manager.store.load(); err == nil && len(hosts) > 0 {
		manager.hosts = hosts
		manager.logger.info("hosts", "loaded hosts from local store", map[string]any{"count": len(hosts)})
	} else if err != nil {
		manager.logger.debug("hosts", "using default hosts", map[string]any{"reason": err.Error()})
	}

	return manager
}

func defaultHosts() []hostRecord {
	return []hostRecord{
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
	}
}

func newHostStore() *hostStore {
	if path := os.Getenv("AI_SSH_HOSTS_PATH"); path != "" {
		return &hostStore{path: path}
	}

	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}

	return &hostStore{path: filepath.Join(configDir, "ai-ssh", "hosts.json")}
}

func (s *hostStore) load() ([]hostRecord, error) {
	file, err := os.Open(s.path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var data hostStoreFile
	if err := json.NewDecoder(file).Decode(&data); err != nil {
		return nil, err
	}

	return data.Hosts, nil
}

func (s *hostStore) save(hosts []hostRecord) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}

	file, err := os.Create(s.path)
	if err != nil {
		return err
	}
	defer file.Close()

	persistedHosts := make([]hostRecord, len(hosts))
	for i, host := range hosts {
		persistedHosts[i] = host.withoutSecrets()
	}

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(hostStoreFile{Hosts: persistedHosts})
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

func (m *sessionManager) createHost(request hostUpsertRequest) (hostRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	host := hostFromRequest(request)
	host.ID = "host-" + uuid.NewString()
	if err := m.saveHostCredentials(&host); err != nil {
		m.logger.error("hosts", "save host credentials failed", map[string]any{
			"hostName": host.Name,
			"authType": host.AuthType,
			"error":    err.Error(),
		})
		return hostRecord{}, err
	}
	m.hosts = append(m.hosts, host)
	if err := m.store.save(m.hosts); err != nil {
		m.hosts = m.hosts[:len(m.hosts)-1]
		_ = m.credentials.Delete(host.ID, passwordCredential)
		_ = m.credentials.Delete(host.ID, privateKeyCredential)
		m.logger.error("hosts", "save host file failed", map[string]any{"hostID": host.ID, "error": err.Error()})
		return hostRecord{}, err
	}
	m.logger.info("hosts", "host created", map[string]any{
		"hostID":        host.ID,
		"name":          host.Name,
		"address":       host.Address,
		"authType":      host.AuthType,
		"hasPassword":   host.HasPassword,
		"hasPrivateKey": host.HasPrivateKey,
	})
	return host.sanitized(), nil
}

func (m *sessionManager) updateHost(hostID string, request hostUpsertRequest) (hostRecord, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i := range m.hosts {
		if m.hosts[i].ID == hostID {
			next := hostFromRequest(request)
			next.ID = hostID
			if request.Password == "" {
				next.HasPassword = m.hosts[i].HasPassword
			}
			if request.PrivateKey == "" {
				next.HasPrivateKey = m.hosts[i].HasPrivateKey
			}
			if err := m.saveHostCredentials(&next); err != nil {
				m.logger.error("hosts", "update host credentials failed", map[string]any{"hostID": hostID, "error": err.Error()})
				return hostRecord{}, true, err
			}
			m.hosts[i] = next
			_ = m.store.save(m.hosts)
			m.logger.info("hosts", "host updated", map[string]any{"hostID": hostID, "name": next.Name})
			return next.sanitized(), true, nil
		}
	}

	return hostRecord{}, false, nil
}

func (m *sessionManager) deleteHost(hostID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i := range m.hosts {
		if m.hosts[i].ID == hostID {
			m.hosts = append(m.hosts[:i], m.hosts[i+1:]...)
			_ = m.credentials.Delete(hostID, passwordCredential)
			_ = m.credentials.Delete(hostID, privateKeyCredential)
			_ = m.store.save(m.hosts)
			m.logger.info("hosts", "host deleted", map[string]any{"hostID": hostID})
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
		if err := m.saveHostCredentials(&host); err != nil {
			m.logger.warn("hosts", "skip imported host credentials", map[string]any{"name": host.Name, "error": err.Error()})
			continue
		}
		m.hosts = append(m.hosts, host)
		created = append(created, host.sanitized())
	}
	_ = m.store.save(m.hosts)
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
	h.Password = ""
	h.PrivateKey = ""
	return h
}

func (h hostRecord) withoutSecrets() hostRecord {
	h.Password = ""
	h.PrivateKey = ""
	return h
}

func (m *sessionManager) saveHostCredentials(host *hostRecord) error {
	if host.AuthType == "password" && host.Password != "" {
		if err := m.credentials.Set(host.ID, passwordCredential, host.Password); err != nil {
			return err
		}
		host.HasPassword = true
	}
	if host.AuthType != "password" {
		_ = m.credentials.Delete(host.ID, passwordCredential)
		host.HasPassword = false
	}
	host.Password = ""

	if host.AuthType == "privateKey" && host.PrivateKey != "" {
		if err := m.credentials.Set(host.ID, privateKeyCredential, host.PrivateKey); err != nil {
			return err
		}
		host.HasPrivateKey = true
	}
	if host.AuthType != "privateKey" {
		_ = m.credentials.Delete(host.ID, privateKeyCredential)
		host.HasPrivateKey = false
	}
	host.PrivateKey = ""

	return nil
}

func (m *sessionManager) resolveSessionHost(request sessionOpenRequest) (hostRecord, bool) {
	if request.TransientHost != nil {
		host := *request.TransientHost
		host.ID = "transient-" + uuid.NewString()
		if host.Name == "" {
			host.Name = host.Username + "@" + host.Address
		}
		if host.Port == 0 {
			host.Port = 22
		}
		return host, true
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	for i := range m.hosts {
		if m.hosts[i].ID == request.HostID {
			return m.hosts[i], true
		}
	}

	return hostRecord{}, false
}

func (m *sessionManager) loadHostCredentials(host *hostRecord) error {
	if host.HasPassword && host.Password == "" {
		password, found, err := m.credentials.Get(host.ID, passwordCredential)
		if err != nil {
			return err
		}
		if found {
			host.Password = password
		}
	}

	if host.HasPrivateKey && host.PrivateKey == "" {
		privateKey, found, err := m.credentials.Get(host.ID, privateKeyCredential)
		if err != nil {
			return err
		}
		if found {
			host.PrivateKey = privateKey
		}
	}

	return nil
}

func (m *sessionManager) resolveStoredHost(hostID string) (hostRecord, bool, error) {
	m.mu.RLock()
	var host hostRecord
	found := false
	for i := range m.hosts {
		if m.hosts[i].ID == hostID {
			host = m.hosts[i]
			found = true
			break
		}
	}
	m.mu.RUnlock()

	if !found {
		return hostRecord{}, false, nil
	}
	if err := m.loadHostCredentials(&host); err != nil {
		return hostRecord{}, true, err
	}
	return host, true, nil
}

func (m *sessionManager) openSession(request sessionOpenRequest) (*terminalSession, bool, error) {
	selectedHost, ok := m.resolveSessionHost(request)
	if !ok {
		m.logger.warn("sessions", "host not found for session", map[string]any{"hostID": request.HostID})
		return nil, false, nil
	}

	if request.TransientHost == nil {
		if err := m.loadHostCredentials(&selectedHost); err != nil {
			m.logger.error("sessions", "load credentials failed", map[string]any{"hostID": selectedHost.ID, "error": err.Error()})
			return nil, true, err
		}
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

	m.mu.Lock()
	m.sessions[session.record.ID] = session
	m.mu.Unlock()
	m.logger.info("sessions", "session created", map[string]any{
		"sessionID": session.record.ID,
		"hostID":    selectedHost.ID,
		"hostName":  selectedHost.Name,
	})

	if selectedHost.ID == "local-demo" {
		go session.runDemo()
	} else {
		go session.runSSH(selectedHost)
	}

	return session, true, nil
}

func (m *sessionManager) getSession(sessionID string) (*terminalSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	session, ok := m.sessions[sessionID]
	return session, ok
}

func (m *sessionManager) closeSession(sessionID string) bool {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if ok {
		delete(m.sessions, sessionID)
	}
	m.mu.Unlock()

	if ok {
		session.record.Status = "closed"
		session.close()
		m.logger.info("sessions", "session closed", map[string]any{"sessionID": sessionID})
	}
	return ok
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

func (s *terminalSession) observeInput(data string) string {
	extra := ""
	for _, r := range data {
		switch r {
		case '\r', '\n':
			command := strings.TrimSpace(s.line)
			if command == "pwd" || strings.HasPrefix(command, "cd ") {
				extra += "\nprintf '\\n__AI_SSH_CWD__%s\\n' \"$PWD\"\n"
			}
			s.line = ""
		case '\u007f', '\b':
			if len(s.line) > 0 {
				s.line = s.line[:len(s.line)-1]
			}
		default:
			if r >= ' ' {
				s.line += string(r)
			}
		}
	}
	return data + extra
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

	client, err := newSSHClient(host)
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
			if _, err := io.WriteString(stdin, s.observeInput(data)); err != nil {
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

func newSSHClient(host hostRecord) (*ssh.Client, error) {
	addr := fmt.Sprintf("%s:%d", host.Address, host.Port)
	authMethods := []ssh.AuthMethod{}
	if host.AuthType == "password" && host.Password != "" {
		authMethods = append(authMethods, ssh.Password(host.Password))
	}
	if host.AuthType == "privateKey" && host.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(host.PrivateKey))
		if err != nil {
			return nil, err
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	return ssh.Dial("tcp", addr, &ssh.ClientConfig{
		User:            host.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         8 * time.Second,
	})
}

func withSFTPClient(host hostRecord, fn func(*sftp.Client) error) error {
	client, err := newSSHClient(host)
	if err != nil {
		return err
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return err
	}
	defer sftpClient.Close()

	return fn(sftpClient)
}

func listRemoteFiles(host hostRecord, remotePath string) (fileListResponse, error) {
	if remotePath == "" {
		remotePath = "."
	}

	var response fileListResponse
	err := withSFTPClient(host, func(client *sftp.Client) error {
		cleanPath := pathpkg.Clean(remotePath)
		infos, err := client.ReadDir(cleanPath)
		if err != nil {
			return err
		}

		entries := make([]fileEntry, 0, len(infos))
		for _, info := range infos {
			entryType := "file"
			if info.IsDir() {
				entryType = "directory"
			}
			entries = append(entries, fileEntry{
				Name:       info.Name(),
				Path:       pathpkg.Join(cleanPath, info.Name()),
				Type:       entryType,
				Size:       info.Size(),
				ModifiedAt: info.ModTime().UTC().Format(time.RFC3339),
			})
		}

		sort.SliceStable(entries, func(i, j int) bool {
			if entries[i].Type != entries[j].Type {
				return entries[i].Type == "directory"
			}
			return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
		})

		response = fileListResponse{Path: cleanPath, Entries: entries}
		return nil
	})

	return response, err
}

func downloadRemoteFile(host hostRecord, remotePath string, w http.ResponseWriter) error {
	return withSFTPClient(host, func(client *sftp.Client) error {
		remoteFile, err := client.Open(remotePath)
		if err != nil {
			return err
		}
		defer remoteFile.Close()

		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, pathpkg.Base(remotePath)))
		_, err = io.Copy(w, remoteFile)
		return err
	})
}

func uploadRemoteFile(host hostRecord, remoteDir string, r *http.Request) error {
	if remoteDir == "" {
		remoteDir = "."
	}

	if err := r.ParseMultipartForm(256 << 20); err != nil {
		return err
	}

	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		return fmt.Errorf("no files uploaded")
	}

	return withSFTPClient(host, func(client *sftp.Client) error {
		for _, header := range files {
			source, err := header.Open()
			if err != nil {
				return err
			}

			targetPath := pathpkg.Join(pathpkg.Clean(remoteDir), filepath.Base(header.Filename))
			target, err := client.Create(targetPath)
			if err != nil {
				_ = source.Close()
				return err
			}

			_, copyErr := io.Copy(target, source)
			closeErr := target.Close()
			_ = source.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
			}
		}
		return nil
	})
}

func collectServerMetrics(host hostRecord) (serverMetrics, error) {
	metrics := serverMetrics{
		HostID:      host.ID,
		CollectedAt: time.Now().UTC().Format(time.RFC3339),
	}

	client, err := newSSHClient(host)
	if err != nil {
		return metrics, err
	}
	defer client.Close()

	output, err := runSSHCommand(client, "printf 'cpu='; awk 'NR==1 {total=$2+$3+$4+$5+$6+$7+$8; idle=$5; printf \"%d\\n\", (total-idle)*100/total}' /proc/stat; printf 'mem='; free | awk '/Mem:/ {printf \"%d\\n\", $3*100/$2}'; printf 'disk='; df -P / | awk 'NR==2 {gsub(\"%\", \"\", $5); print $5}'; printf 'net='; awk 'NR>2 {rx+=$2; tx+=$10} END {printf \"%d %d\\n\", rx, tx}' /proc/net/dev")
	if err != nil {
		return metrics, err
	}

	for _, line := range strings.Split(output, "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok {
			continue
		}
		switch key {
		case "cpu":
			metrics.CPUPercent = parsePercent(value)
		case "mem":
			metrics.MemoryPercent = parsePercent(value)
		case "disk":
			metrics.DiskPercent = parsePercent(value)
		case "net":
			fields := strings.Fields(value)
			if len(fields) == 2 {
				metrics.NetworkRxBytes, _ = strconv.ParseInt(fields[0], 10, 64)
				metrics.NetworkTxBytes, _ = strconv.ParseInt(fields[1], 10, 64)
			}
		}
	}

	return metrics, nil
}

func parsePercent(value string) int {
	percent, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 0
	}
	if percent < 0 {
		return 0
	}
	if percent > 100 {
		return 100
	}
	return percent
}

func runSSHCommand(client *ssh.Client, command string) (string, error) {
	session, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()

	output, err := session.CombinedOutput(command)
	return string(output), err
}

func copyOutput(session *terminalSession, reader io.Reader) {
	buffer := make([]byte, 4096)
	for {
		n, err := reader.Read(buffer)
		if n > 0 {
			data := string(buffer[:n])
			visible, cwd := extractCWDMarker(data)
			if visible != "" {
				session.send(terminalEvent{Type: "output", Data: visible})
			}
			if cwd != "" {
				session.send(terminalEvent{Type: "cwd", Data: cwd})
			}
		}
		if err != nil {
			if err != io.EOF {
				session.send(terminalEvent{Type: "error", Data: err.Error()})
			}
			return
		}
	}
}

func extractCWDMarker(data string) (string, string) {
	const marker = "__AI_SSH_CWD__"
	index := strings.LastIndex(data, marker)
	if index < 0 {
		return data, ""
	}
	before := data[:index]
	after := data[index+len(marker):]
	lineEnd := strings.IndexAny(after, "\r\n")
	if lineEnd < 0 {
		return before, strings.TrimSpace(after)
	}
	return before + after[lineEnd:], strings.TrimSpace(after[:lineEnd])
}

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
			session.close()
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
