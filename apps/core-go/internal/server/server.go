package server

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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
	HostStore    string   `json:"hostStore,omitempty"`
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

type hostGroup struct {
	Name         string `json:"name"`
	PreviousName string `json:"previousName,omitempty"`
	Delete       bool   `json:"delete,omitempty"`
}

type hostGroupsResponse struct {
	Groups []hostGroup `json:"groups"`
}

type hostGroupsUpdateRequest struct {
	Groups []hostGroup `json:"groups"`
}

type hostsExportResponse struct {
	Version   int          `json:"version"`
	Encrypted bool         `json:"encrypted"`
	ExportKey string       `json:"exportKey,omitempty"`
	Hosts     []hostRecord `json:"hosts"`
	Groups    []hostGroup  `json:"groups,omitempty"`
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
	Hosts     []hostUpsertRequest `json:"hosts"`
	ExportKey string              `json:"exportKey,omitempty"`
	Encrypted bool                `json:"encrypted,omitempty"`
	Groups    []hostGroup         `json:"groups,omitempty"`
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

type sessionResizeRequest struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}

type aiPredictionRequest struct {
	BaseURL         string   `json:"baseUrl"`
	APIKey          string   `json:"apiKey,omitempty"`
	Model           string   `json:"model"`
	TimeoutSeconds  int      `json:"timeoutSeconds,omitempty"`
	PredictionCount int      `json:"predictionCount"`
	IncludeThinking bool     `json:"includeThinking,omitempty"`
	TerminalContext string   `json:"terminalContext"`
	CommandHistory  []string `json:"commandHistory"`
	CurrentCommand  string   `json:"currentCommand,omitempty"`
	HostName        string   `json:"hostName,omitempty"`
	HostAddress     string   `json:"hostAddress,omitempty"`
	Username        string   `json:"username,omitempty"`
}

type aiPredictionResponse struct {
	Commands []string `json:"commands"`
}

type aiAssistRequest struct {
	BaseURL         string        `json:"baseUrl"`
	APIKey          string        `json:"apiKey,omitempty"`
	Model           string        `json:"model"`
	TimeoutSeconds  int           `json:"timeoutSeconds,omitempty"`
	SystemPrompt    string        `json:"systemPrompt,omitempty"`
	Prompt          string        `json:"prompt"`
	TerminalContext string        `json:"terminalContext,omitempty"`
	SelectedText    string        `json:"selectedText,omitempty"`
	CommandHistory  []string      `json:"commandHistory,omitempty"`
	CurrentCommand  string        `json:"currentCommand,omitempty"`
	CWD             string        `json:"cwd,omitempty"`
	HostName        string        `json:"hostName,omitempty"`
	HostAddress     string        `json:"hostAddress,omitempty"`
	Username        string        `json:"username,omitempty"`
	AgentMode       string        `json:"agentMode,omitempty"`
	AgentGoal       string        `json:"agentGoal,omitempty"`
	AgentSteps      []aiAgentStep `json:"agentSteps,omitempty"`
}

type aiAgentStep struct {
	Command     string `json:"command"`
	Status      string `json:"status"`
	SessionID   string `json:"sessionId,omitempty"`
	Explanation string `json:"explanation,omitempty"`
	RiskLevel   string `json:"riskLevel,omitempty"`
	RiskReason  string `json:"riskReason,omitempty"`
	Output      string `json:"output,omitempty"`
	ExitCode    *int   `json:"exitCode,omitempty"`
	CreatedAt   string `json:"createdAt,omitempty"`
}

type aiAssistResponse struct {
	Answer       string   `json:"answer"`
	Commands     []string `json:"commands,omitempty"`
	Warnings     []string `json:"warnings,omitempty"`
	RiskLevel    string   `json:"riskLevel,omitempty"`
	RiskReason   string   `json:"riskReason,omitempty"`
	AgentStatus  string   `json:"agentStatus,omitempty"`
	AgentCommand string   `json:"agentCommand,omitempty"`
	AgentReason  string   `json:"agentReason,omitempty"`
	Summary      string   `json:"summary,omitempty"`
}

type aiChatConversation struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Snippet   string `json:"snippet,omitempty"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type aiChatMessage struct {
	ID             string            `json:"id"`
	ConversationID string            `json:"conversationId"`
	Kind           string            `json:"kind"`
	Content        string            `json:"content"`
	CreatedAt      string            `json:"createdAt"`
	Response       *aiAssistResponse `json:"response,omitempty"`
	Step           *aiAgentStep      `json:"step,omitempty"`
}

type aiChatConversationCreateRequest struct {
	Title string `json:"title,omitempty"`
}

type aiChatConversationUpdateRequest struct {
	Title string `json:"title,omitempty"`
}

type aiChatMessageCreateRequest struct {
	Kind     string            `json:"kind"`
	Content  string            `json:"content"`
	Response *aiAssistResponse `json:"response,omitempty"`
	Step     *aiAgentStep      `json:"step,omitempty"`
}

type aiChatMessageUpdateRequest struct {
	Content  string            `json:"content,omitempty"`
	Response *aiAssistResponse `json:"response,omitempty"`
	Step     *aiAgentStep      `json:"step,omitempty"`
}

type sessionReconnectResponse struct {
	PreviousSessionID string        `json:"previousSessionId"`
	Session           sessionRecord `json:"session"`
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
	HostID           string       `json:"hostId"`
	CPUPercent       int          `json:"cpuPercent"`
	MemoryPercent    int          `json:"memoryPercent"`
	MemoryUsedBytes  int64        `json:"memoryUsedBytes"`
	MemoryTotalBytes int64        `json:"memoryTotalBytes"`
	DiskPercent      int          `json:"diskPercent"`
	Disks            []diskMetric `json:"disks"`
	NetworkRxBytes   int64        `json:"networkRxBytes"`
	NetworkTxBytes   int64        `json:"networkTxBytes"`
	CollectedAt      string       `json:"collectedAt"`
}

type diskMetric struct {
	Mount       string `json:"mount"`
	Filesystem  string `json:"filesystem"`
	UsedPercent int    `json:"usedPercent"`
}

type systemInfo struct {
	HostID      string `json:"hostId"`
	Hostname    string `json:"hostname"`
	OS          string `json:"os"`
	Kernel      string `json:"kernel"`
	Arch        string `json:"arch"`
	Uptime      string `json:"uptime"`
	CollectedAt string `json:"collectedAt"`
}

type terminalSession struct {
	record            sessionRecord
	input             chan string
	resize            chan sessionResizeRequest
	output            chan terminalEvent
	done              chan struct{}
	once              sync.Once
	mu                sync.RWMutex
	cwd               string
	commandMu         sync.Mutex
	commandLineBuffer string
}

type sessionManager struct {
	mu          sync.RWMutex
	hosts       []hostRecord
	groups      []hostGroup
	sessions    map[string]*terminalSession
	store       *hostStore
	credentials credentialStore
	logger      *appLogger
}

type hostStore struct {
	path string
}

type hostStoreFile struct {
	Hosts  []hostRecord `json:"hosts"`
	Groups []hostGroup  `json:"groups,omitempty"`
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
	manager.logger.info("hosts", "host store configured", map[string]any{"path": manager.store.path})

	if hosts, groups, err := manager.store.load(); err == nil && (len(hosts) > 0 || len(groups) > 0) {
		manager.hosts = hosts
		manager.groups = mergeHostGroups(groups, hosts)
		manager.logger.info("hosts", "loaded hosts from local store", map[string]any{"count": len(hosts), "path": manager.store.path})
	} else if err != nil {
		manager.logger.debug("hosts", "using default hosts", map[string]any{"reason": err.Error(), "path": manager.store.path})
	}
	if len(manager.groups) == 0 {
		manager.groups = mergeHostGroups(nil, manager.hosts)
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

	baseDir := resolveHostStoreBaseDir()

	return &hostStore{path: filepath.Join(baseDir, "data", "hosts.json")}
}

func resolveHostStoreBaseDir() string {
	if exePath, err := os.Executable(); err == nil {
		if exeDir := filepath.Dir(exePath); exeDir != "" {
			return exeDir
		}
	}
	current, err := os.Getwd()
	if err != nil {
		return "."
	}
	return current
}

func (s *hostStore) load() ([]hostRecord, []hostGroup, error) {
	file, err := os.Open(s.path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	var data hostStoreFile
	if err := json.NewDecoder(file).Decode(&data); err != nil {
		return nil, nil, err
	}

	return data.Hosts, normalizeHostGroups(data.Groups), nil
}

func (s *hostStore) save(hosts []hostRecord, groups []hostGroup) error {
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
	return encoder.Encode(hostStoreFile{
		Hosts:  persistedHosts,
		Groups: mergeHostGroups(groups, hosts),
	})
}

func normalizeHostGroups(groups []hostGroup) []hostGroup {
	normalized := make([]hostGroup, 0, len(groups))
	seen := map[string]bool{}
	for _, group := range groups {
		name := strings.TrimSpace(group.Name)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		normalized = append(normalized, hostGroup{Name: name})
	}
	return normalized
}

func mergeHostGroups(groups []hostGroup, hosts []hostRecord) []hostGroup {
	merged := normalizeHostGroups(groups)
	seen := map[string]bool{}
	for _, group := range merged {
		seen[group.Name] = true
	}
	for _, host := range hosts {
		name := strings.TrimSpace(host.Group)
		if name == "" {
			name = "默认"
		}
		if seen[name] {
			continue
		}
		seen[name] = true
		merged = append(merged, hostGroup{Name: name})
	}
	return merged
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

func (m *sessionManager) listHostGroups() []hostGroup {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return mergeHostGroups(m.groups, m.hosts)
}

func (m *sessionManager) updateHostGroups(request hostGroupsUpdateRequest) []hostGroup {
	m.mu.Lock()
	defer m.mu.Unlock()

	deletedGroups := map[string]bool{}
	keptGroups := make([]hostGroup, 0, len(request.Groups))
	for _, group := range request.Groups {
		if group.Delete {
			name := strings.TrimSpace(group.PreviousName)
			if name == "" {
				name = strings.TrimSpace(group.Name)
			}
			if name != "" {
				deletedGroups[name] = true
			}
			continue
		}
		keptGroups = append(keptGroups, group)
		previousName := strings.TrimSpace(group.PreviousName)
		nextName := strings.TrimSpace(group.Name)
		if previousName == "" || nextName == "" || previousName == nextName {
			continue
		}
		for i := range m.hosts {
			if strings.TrimSpace(m.hosts[i].Group) == previousName {
				m.hosts[i].Group = nextName
			}
		}
	}
	for i := range m.hosts {
		groupName := strings.TrimSpace(m.hosts[i].Group)
		if groupName == "" || deletedGroups[groupName] {
			m.hosts[i].Group = "默认"
		}
	}
	m.groups = mergeHostGroups(keptGroups, m.hosts)
	_ = m.store.save(m.hosts, m.groups)
	m.logger.info("hosts", "host groups updated", map[string]any{"count": len(m.groups)})
	return m.groups
}

func (m *sessionManager) exportHosts(includeCredentials bool) (hostsExportResponse, error) {
	m.mu.RLock()
	hosts := make([]hostRecord, len(m.hosts))
	copy(hosts, m.hosts)
	groups := mergeHostGroups(m.groups, m.hosts)
	m.mu.RUnlock()

	response := hostsExportResponse{
		Version:   1,
		Encrypted: includeCredentials,
		Hosts:     make([]hostRecord, 0, len(hosts)),
		Groups:    groups,
	}

	exportKey := ""
	if includeCredentials {
		var err error
		exportKey, err = generateExportKey()
		if err != nil {
			return response, err
		}
		response.ExportKey = exportKey
	}

	for _, host := range hosts {
		exportedHost := host.sanitized()
		if includeCredentials {
			if err := m.loadHostCredentials(&exportedHost); err != nil {
				return response, err
			}
			if exportedHost.Password != "" {
				encrypted, err := encryptExportSecret(exportKey, exportedHost.Password)
				if err != nil {
					return response, err
				}
				exportedHost.Password = encrypted
			}
			if exportedHost.PrivateKey != "" {
				encrypted, err := encryptExportSecret(exportKey, exportedHost.PrivateKey)
				if err != nil {
					return response, err
				}
				exportedHost.PrivateKey = encrypted
			}
		}
		response.Hosts = append(response.Hosts, exportedHost)
	}

	return response, nil
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
	m.groups = mergeHostGroups(m.groups, m.hosts)
	if err := m.store.save(m.hosts, m.groups); err != nil {
		m.hosts = m.hosts[:len(m.hosts)-1]
		m.groups = mergeHostGroups(m.groups, m.hosts)
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
			m.groups = mergeHostGroups(m.groups, m.hosts)
			_ = m.store.save(m.hosts, m.groups)
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
			m.groups = mergeHostGroups(m.groups, m.hosts)
			_ = m.store.save(m.hosts, m.groups)
			m.logger.info("hosts", "host deleted", map[string]any{"hostID": hostID})
			return true
		}
	}

	return false
}

func (m *sessionManager) importHosts(request hostsImportRequest) []hostRecord {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.groups = mergeHostGroups(append(m.groups, request.Groups...), m.hosts)
	created := make([]hostRecord, 0, len(request.Hosts))
	for _, hostRequest := range request.Hosts {
		if request.Encrypted {
			var err error
			hostRequest.Password, err = decryptOptionalExportSecret(request.ExportKey, hostRequest.Password)
			if err != nil {
				m.logger.warn("hosts", "skip imported encrypted password", map[string]any{"name": hostRequest.Name, "error": err.Error()})
				continue
			}
			hostRequest.PrivateKey, err = decryptOptionalExportSecret(request.ExportKey, hostRequest.PrivateKey)
			if err != nil {
				m.logger.warn("hosts", "skip imported encrypted private key", map[string]any{"name": hostRequest.Name, "error": err.Error()})
				continue
			}
		}
		host := hostFromRequest(hostRequest)
		host.ID = "host-" + uuid.NewString()
		if err := m.saveHostCredentials(&host); err != nil {
			m.logger.warn("hosts", "skip imported host credentials", map[string]any{"name": host.Name, "error": err.Error()})
			continue
		}
		m.hosts = append(m.hosts, host)
		created = append(created, host.sanitized())
	}
	m.groups = mergeHostGroups(m.groups, m.hosts)
	_ = m.store.save(m.hosts, m.groups)
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

func generateExportKey() (string, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", fmt.Errorf("生成导出密钥失败: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(key), nil
}

func exportCipherKey(exportKey string) []byte {
	hash := sha256.Sum256([]byte(exportKey))
	return hash[:]
}

func encryptExportSecret(exportKey string, value string) (string, error) {
	if value == "" {
		return "", nil
	}

	block, err := aes.NewCipher(exportCipherKey(exportKey))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("生成凭据加密随机数失败: %w", err)
	}
	ciphertext := gcm.Seal(nil, nonce, []byte(value), nil)
	payload := append(nonce, ciphertext...)
	return "enc:v1:" + base64.RawURLEncoding.EncodeToString(payload), nil
}

func decryptOptionalExportSecret(exportKey string, value string) (string, error) {
	if value == "" || !strings.HasPrefix(value, "enc:v1:") {
		return value, nil
	}
	if exportKey == "" {
		return "", fmt.Errorf("缺少导出密钥")
	}

	block, err := aes.NewCipher(exportCipherKey(exportKey))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	payload, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(value, "enc:v1:"))
	if err != nil {
		return "", fmt.Errorf("凭据密文格式无效: %w", err)
	}
	if len(payload) <= gcm.NonceSize() {
		return "", fmt.Errorf("凭据密文太短")
	}
	nonce := payload[:gcm.NonceSize()]
	ciphertext := payload[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("凭据解密失败: %w", err)
	}
	return string(plaintext), nil
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
		input:  make(chan string, 256),
		resize: make(chan sessionResizeRequest, 16),
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

func (m *sessionManager) reconnectSession(sessionID string) (*terminalSession, *terminalSession, bool, error) {
	m.mu.Lock()
	oldSession, ok := m.sessions[sessionID]
	if ok {
		delete(m.sessions, sessionID)
	}
	m.mu.Unlock()

	if !ok {
		return nil, nil, false, nil
	}

	newSession, _, err := m.openSession(sessionOpenRequest{HostID: oldSession.record.HostID})
	if err != nil {
		m.mu.Lock()
		m.sessions[sessionID] = oldSession
		m.mu.Unlock()
		return nil, oldSession, true, err
	}

	oldSession.record.Status = "closed"
	oldSession.close()
	m.logger.info("sessions", "session reconnect requested", map[string]any{
		"oldSessionID": sessionID,
		"newSessionID": newSession.record.ID,
		"hostID":       oldSession.record.HostID,
	})
	return newSession, oldSession, true, nil
}

func (s *terminalSession) snapshot() sessionRecord {
	return s.record
}

func (s *terminalSession) snapshotStatus() (string, string) {
	return s.record.Status, s.record.LastError
}

func (s *terminalSession) currentCWD() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cwd
}

func (s *terminalSession) setCWD(cwd string) {
	if cwd == "" {
		return
	}
	s.mu.Lock()
	s.cwd = cwd
	s.mu.Unlock()
}

func (s *terminalSession) send(event terminalEvent) {
	defer func() {
		_ = recover()
	}()
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
					if strings.TrimSpace(line) != "" {
						s.send(terminalEvent{Type: "command", Data: line})
					}
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
		case <-s.resize:
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

	if err := sshSession.RequestPty("xterm-256color", 24, 80, ssh.TerminalModes{
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

	waitDone := make(chan error, 1)
	go func() {
		waitDone <- sshSession.Wait()
	}()

	for {
		select {
		case data := <-s.input:
			if _, err := io.WriteString(stdin, data); err != nil {
				s.record.Status = "error"
				s.record.LastError = err.Error()
				s.send(terminalEvent{Type: "error", Data: err.Error()})
				return
			}
		case size := <-s.resize:
			if size.Rows <= 0 || size.Cols <= 0 {
				continue
			}
			if err := sshSession.WindowChange(size.Rows, size.Cols); err != nil {
				s.record.Status = "error"
				s.record.LastError = err.Error()
				s.send(terminalEvent{Type: "error", Data: err.Error()})
				return
			}
		case err := <-waitDone:
			if err != nil {
				s.record.Status = "error"
				s.record.LastError = err.Error()
				s.send(terminalEvent{Type: "error", Data: err.Error()})
				return
			}
			s.record.Status = "closed"
			s.send(terminalEvent{Type: "status", Data: "closed"})
			return
		case <-s.done:
			return
		}
	}
}

func copyOutput(session *terminalSession, reader io.Reader) {
	buffer := make([]byte, 4096)
	tail := ""
	for {
		n, err := reader.Read(buffer)
		if n > 0 {
			data := string(buffer[:n])
			session.send(terminalEvent{Type: "output", Data: data})
			session.observeCommandEcho(data)
			combined := tail + data
			cwd := extractPromptCWD(combined)
			if cwd != "" {
				session.setCWD(cwd)
				session.send(terminalEvent{Type: "cwd", Data: cwd})
				session.send(terminalEvent{Type: "prompt", Data: cwd})
			}
			tail = outputTail(combined)
		}
		if err != nil {
			if err != io.EOF {
				session.record.Status = "error"
				session.record.LastError = err.Error()
				session.send(terminalEvent{Type: "error", Data: err.Error()})
			}
			return
		}
	}
}

func (s *terminalSession) observeCommandEcho(data string) {
	clean := cleanTerminalOutputForParsing(data)
	s.commandMu.Lock()
	combined := s.commandLineBuffer + clean
	lines, remainder := splitCompleteTerminalLines(combined)
	if len(remainder) > 4096 {
		remainder = remainder[len(remainder)-4096:]
	}
	s.commandLineBuffer = remainder
	s.commandMu.Unlock()

	for _, line := range lines {
		command := extractPromptCommandFromLine(line)
		if isRecordableEchoCommand(command) {
			s.send(terminalEvent{Type: "command", Data: command})
		}
	}
}

func outputTail(data string) string {
	const maxTailLength = 512
	if len(data) <= maxTailLength {
		return data
	}
	return data[len(data)-maxTailLength:]
}

var (
	ansiSequencePattern         = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]`)
	oscSequencePattern          = regexp.MustCompile(`\x1b\][^\x07]*(?:\x07|\x1b\\)`)
	charsetSequencePattern      = regexp.MustCompile(`\x1b[()][A-Za-z0-9]`)
	singleEscapeSequencePattern = regexp.MustCompile(`\x1b[@-Z\\-_]`)
	promptCWDPattern            = regexp.MustCompile(`(?m)(?:^|\r|\n)[^\r\n@]*@[^:\r\n]+:([~/][^\r\n$#]*)[$#]\s*$`)
	promptCommandPattern        = regexp.MustCompile(`^(?:.*)(?:\([^)]+\)[[:space:]]*)?[[:alnum:]_.%+-]+@[^:[:space:]]+:[^$#\r\n]*[$#][[:space:]]*(.+)[[:space:]]*$`)
	simplePromptCommandPattern  = regexp.MustCompile(`^[[:space:]]*[$#][[:space:]]+(.+)[[:space:]]*$`)
)

func cleanTerminalOutputForParsing(data string) string {
	clean := oscSequencePattern.ReplaceAllString(data, "")
	clean = ansiSequencePattern.ReplaceAllString(clean, "")
	clean = charsetSequencePattern.ReplaceAllString(clean, "")
	clean = singleEscapeSequencePattern.ReplaceAllString(clean, "")
	return applyTerminalBackspaces(clean)
}

func applyTerminalBackspaces(data string) string {
	runes := make([]rune, 0, len(data))
	for _, r := range data {
		if r == '\b' || r == '\u007f' {
			if len(runes) > 0 {
				runes = runes[:len(runes)-1]
			}
			continue
		}
		runes = append(runes, r)
	}
	return string(runes)
}

func splitCompleteTerminalLines(data string) ([]string, string) {
	lines := []string{}
	start := 0
	for i := 0; i < len(data); i++ {
		if data[i] != '\n' {
			continue
		}
		line := strings.TrimSuffix(data[start:i], "\r")
		lines = append(lines, normalizeCarriageReturnLine(line))
		start = i + 1
	}
	return lines, data[start:]
}

func normalizeCarriageReturnLine(line string) string {
	parts := strings.Split(line, "\r")
	return parts[len(parts)-1]
}

func extractPromptCommands(data string) []string {
	lines, _ := splitCompleteTerminalLines(cleanTerminalOutputForParsing(data))
	commands := make([]string, 0, len(lines))
	for _, line := range lines {
		command := extractPromptCommandFromLine(line)
		if isRecordableEchoCommand(command) {
			commands = append(commands, command)
		}
	}
	return commands
}

func extractPromptCommandFromLine(line string) string {
	line = strings.TrimSpace(normalizeCarriageReturnLine(line))
	if line == "" {
		return ""
	}
	if matches := promptCommandPattern.FindStringSubmatch(line); len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	if matches := simplePromptCommandPattern.FindStringSubmatch(line); len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	return ""
}

func isRecordableEchoCommand(command string) bool {
	command = strings.TrimSpace(command)
	if command == "" {
		return false
	}
	if strings.Contains(command, "__AI_SSH_CWD__") {
		return false
	}
	if strings.Contains(command, "__AI_SSH_AGENT_DONE_") {
		return false
	}
	if strings.HasPrefix(command, "printf ") && strings.Contains(command, "$PWD") {
		return false
	}
	return true
}

func extractPromptCWD(data string) string {
	clean := cleanTerminalOutputForParsing(data)
	matches := promptCWDPattern.FindAllStringSubmatch(clean, -1)
	if len(matches) == 0 {
		return ""
	}

	cwd := strings.TrimSpace(matches[len(matches)-1][1])
	if cwd == "~" {
		return "."
	}
	if strings.HasPrefix(cwd, "~/") {
		return "." + strings.TrimPrefix(cwd, "~")
	}
	if strings.HasPrefix(cwd, "/") {
		return cwd
	}
	return ""
}
