package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNewHostStoreDefaultsToCurrentDataDirectory(t *testing.T) {
	previousHostsPath := os.Getenv("AI_SSH_HOSTS_PATH")
	previousHome := os.Getenv("AI_SSH_HOME")
	t.Setenv("AI_SSH_HOSTS_PATH", "")
	t.Setenv("AI_SSH_HOME", "")
	defer func() {
		_ = os.Setenv("AI_SSH_HOSTS_PATH", previousHostsPath)
		_ = os.Setenv("AI_SSH_HOME", previousHome)
	}()

	workspace := t.TempDir()
	current, err := os.Getwd()
	if err != nil {
		t.Fatalf("expected cwd, got error: %v", err)
	}
	if err := os.Chdir(workspace); err != nil {
		t.Fatalf("expected chdir, got error: %v", err)
	}
	defer func() { _ = os.Chdir(current) }()

	store := newHostStore()
	expected := filepath.Join(workspace, "data", "hosts.json")
	if store.path != expected {
		t.Fatalf("expected host store path %q, got %q", expected, store.path)
	}
}

func TestFindNearestHostStoreBaseDir(t *testing.T) {
	workspace := t.TempDir()
	dataDir := filepath.Join(workspace, "data")
	nested := filepath.Join(workspace, "apps", "desktop", "src-tauri")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatalf("expected data dir, got error: %v", err)
	}
	if err := os.MkdirAll(nested, 0o700); err != nil {
		t.Fatalf("expected nested dir, got error: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "hosts.json"), []byte(`{"hosts":[]}`), 0o600); err != nil {
		t.Fatalf("expected hosts file, got error: %v", err)
	}

	baseDir, ok := findNearestHostStoreBaseDir(nested)
	if !ok {
		t.Fatalf("expected nearest host store base dir")
	}
	if filepath.Clean(baseDir) != filepath.Clean(workspace) {
		t.Fatalf("expected base dir %q, got %q", workspace, baseDir)
	}
}

func newTestServer(t *testing.T) *http.Server {
	t.Helper()
	return newTestServerWithCredentials(t, newMemoryCredentialStore())
}

func newTestServerWithCredentials(t *testing.T, credentials credentialStore) *http.Server {
	t.Helper()
	t.Setenv("AI_SSH_WEB_AUTH", "0")
	store := &hostStore{path: filepath.Join(t.TempDir(), "hosts.json")}
	return newServer("18555", newSessionManagerWithStores(store, credentials, newAppLogger()))
}

func TestHealthEndpoint(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	recorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var response map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}

	if response["status"] != "ok" {
		t.Fatalf("expected status ok, got %v", response["status"])
	}
	capabilities, ok := response["capabilities"].([]any)
	if !ok {
		t.Fatalf("expected capabilities, got %v", response["capabilities"])
	}
	if !containsCapability(capabilities, "ai-assist") ||
		!containsCapability(capabilities, "ai-agent") ||
		!containsCapability(capabilities, "ai-stream") ||
		!containsCapability(capabilities, "ai-unified") {
		t.Fatalf("expected ai capabilities, got %v", response["capabilities"])
	}
	hostStore, ok := response["hostStore"].(string)
	if !ok || filepath.Base(hostStore) != "hosts.json" {
		t.Fatalf("expected health response to include host store path, got %v", response["hostStore"])
	}
}

func containsCapability(capabilities []any, expected string) bool {
	for _, capability := range capabilities {
		if capability == expected {
			return true
		}
	}
	return false
}

func TestWebAuthProtectsAPIAndAllowsLogin(t *testing.T) {
	t.Setenv("AI_SSH_WEB_AUTH", "1")
	t.Setenv("AI_SSH_WEB_USER", "admin")
	t.Setenv("AI_SSH_WEB_PASSWORD", "secret")
	srv := newServer("18555", newSessionManagerWithStores(
		&hostStore{path: filepath.Join(t.TempDir(), "hosts.json")},
		newMemoryCredentialStore(),
		newAppLogger(),
	))

	unauthorizedReq := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	unauthorizedRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(unauthorizedRecorder, unauthorizedReq)
	if unauthorizedRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected protected api status 401, got %d", unauthorizedRecorder.Code)
	}

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(`{"username":"admin","password":"secret"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(loginRecorder, loginReq)
	if loginRecorder.Code != http.StatusOK {
		t.Fatalf("expected login status 200, got %d", loginRecorder.Code)
	}

	authorizedReq := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	for _, cookie := range loginRecorder.Result().Cookies() {
		authorizedReq.AddCookie(cookie)
	}
	authorizedRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(authorizedRecorder, authorizedReq)
	if authorizedRecorder.Code != http.StatusOK {
		t.Fatalf("expected authenticated api status 200, got %d", authorizedRecorder.Code)
	}
}

func TestWebAuthRequiresSetupWhenPasswordMissing(t *testing.T) {
	t.Setenv("AI_SSH_WEB_AUTH", "1")
	t.Setenv("AI_SSH_WEB_USER", "admin")
	t.Setenv("AI_SSH_WEB_PASSWORD", "")
	t.Setenv("AI_SSH_WEB_AUTH_PATH", filepath.Join(t.TempDir(), "web-auth.json"))
	srv := newServer("18555", newSessionManagerWithStores(
		&hostStore{path: filepath.Join(t.TempDir(), "hosts.json")},
		newMemoryCredentialStore(),
		newAppLogger(),
	))

	statusReq := httptest.NewRequest(http.MethodGet, "/api/auth/status", nil)
	statusRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(statusRecorder, statusReq)
	if statusRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", statusRecorder.Code)
	}
	var status webAuthStatusResponse
	if err := json.NewDecoder(statusRecorder.Body).Decode(&status); err != nil {
		t.Fatalf("decode auth status: %v", err)
	}
	if status.Initialized {
		t.Fatalf("expected auth to be uninitialized")
	}

	unauthorizedReq := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	unauthorizedRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(unauthorizedRecorder, unauthorizedReq)
	if unauthorizedRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected protected api status 401 before setup, got %d", unauthorizedRecorder.Code)
	}

	setupBody := bytes.NewBufferString(`{"username":"admin","password":"secret","desktopLoginRequired":true}`)
	setupReq := httptest.NewRequest(http.MethodPost, "/api/auth/setup", setupBody)
	setupReq.Header.Set("Content-Type", "application/json")
	setupRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(setupRecorder, setupReq)
	if setupRecorder.Code != http.StatusOK {
		t.Fatalf("expected setup status 200, got %d body=%s", setupRecorder.Code, setupRecorder.Body.String())
	}

	authorizedReq := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	for _, cookie := range setupRecorder.Result().Cookies() {
		authorizedReq.AddCookie(cookie)
	}
	authorizedRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(authorizedRecorder, authorizedReq)
	if authorizedRecorder.Code != http.StatusOK {
		t.Fatalf("expected authenticated api status 200 after setup, got %d", authorizedRecorder.Code)
	}
}

func TestDesktopLoginCanBeDisabledBySetting(t *testing.T) {
	t.Setenv("AI_SSH_WEB_AUTH", "1")
	t.Setenv("AI_SSH_WEB_USER", "admin")
	t.Setenv("AI_SSH_WEB_PASSWORD", "")
	t.Setenv("AI_SSH_WEB_AUTH_PATH", filepath.Join(t.TempDir(), "web-auth.json"))
	t.Setenv("AI_SSH_DESKTOP_TOKEN", "desktop-token")
	srv := newServer("18555", newSessionManagerWithStores(
		&hostStore{path: filepath.Join(t.TempDir(), "hosts.json")},
		newMemoryCredentialStore(),
		newAppLogger(),
	))

	setupReq := httptest.NewRequest(http.MethodPost, "/api/auth/desktop-setup", bytes.NewBufferString(`{
		"username":"admin",
		"password":"secret",
		"desktopLoginRequired":false
	}`))
	setupReq.Header.Set("Content-Type", "application/json")
	setupReq.Header.Set("X-AI-SSH-Desktop-Token", "desktop-token")
	setupRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(setupRecorder, setupReq)
	if setupRecorder.Code != http.StatusOK {
		t.Fatalf("expected desktop setup status 200, got %d body=%s", setupRecorder.Code, setupRecorder.Body.String())
	}

	desktopReq := httptest.NewRequest(http.MethodPost, "/api/auth/desktop", nil)
	desktopReq.Header.Set("X-AI-SSH-Desktop-Token", "desktop-token")
	desktopRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(desktopRecorder, desktopReq)
	if desktopRecorder.Code != http.StatusOK {
		t.Fatalf("expected desktop login status 200, got %d", desktopRecorder.Code)
	}

	desktopAPIReq := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	desktopAPIReq.Header.Set("X-AI-SSH-Desktop-Token", "desktop-token")
	desktopAPIRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(desktopAPIRecorder, desktopAPIReq)
	if desktopAPIRecorder.Code != http.StatusOK {
		t.Fatalf("expected desktop token api status 200, got %d", desktopAPIRecorder.Code)
	}

	updateReq := httptest.NewRequest(http.MethodPut, "/api/auth/settings", bytes.NewBufferString(`{"desktopLoginRequired":true}`))
	updateReq.Header.Set("Content-Type", "application/json")
	for _, cookie := range desktopRecorder.Result().Cookies() {
		updateReq.AddCookie(cookie)
	}
	updateRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(updateRecorder, updateReq)
	if updateRecorder.Code != http.StatusOK {
		t.Fatalf("expected auth settings update status 200, got %d body=%s", updateRecorder.Code, updateRecorder.Body.String())
	}

	blockedDesktopReq := httptest.NewRequest(http.MethodPost, "/api/auth/desktop", nil)
	blockedDesktopReq.Header.Set("X-AI-SSH-Desktop-Token", "desktop-token")
	blockedDesktopRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(blockedDesktopRecorder, blockedDesktopReq)
	if blockedDesktopRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected desktop login 401 when login is required, got %d", blockedDesktopRecorder.Code)
	}

	tokenCheckReq := httptest.NewRequest(http.MethodPost, "/api/auth/desktop-token", nil)
	tokenCheckReq.Header.Set("X-AI-SSH-Desktop-Token", "desktop-token")
	tokenCheckRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(tokenCheckRecorder, tokenCheckReq)
	if tokenCheckRecorder.Code != http.StatusOK {
		t.Fatalf("expected desktop token check status 200, got %d", tokenCheckRecorder.Code)
	}

	badTokenReq := httptest.NewRequest(http.MethodPost, "/api/auth/desktop-token", nil)
	badTokenReq.Header.Set("X-AI-SSH-Desktop-Token", "wrong-token")
	badTokenRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(badTokenRecorder, badTokenReq)
	if badTokenRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected bad desktop token status 401, got %d", badTokenRecorder.Code)
	}
}

func TestDesktopDownloadTokenQueryIsLimitedToLocalRequests(t *testing.T) {
	t.Setenv("AI_SSH_WEB_AUTH", "1")
	t.Setenv("AI_SSH_WEB_USER", "admin")
	t.Setenv("AI_SSH_WEB_PASSWORD", "")
	t.Setenv("AI_SSH_WEB_AUTH_PATH", filepath.Join(t.TempDir(), "web-auth.json"))
	t.Setenv("AI_SSH_DESKTOP_TOKEN", "desktop-token")
	authenticator := newWebAuthenticator(newAppLogger())

	setupReq := httptest.NewRequest(http.MethodPost, "/api/auth/desktop-setup", bytes.NewBufferString(`{
		"username":"admin",
		"password":"secret",
		"desktopLoginRequired":false
	}`))
	setupReq.RemoteAddr = "127.0.0.1:12345"
	setupReq.Header.Set("X-AI-SSH-Desktop-Token", "desktop-token")
	if err := authenticator.setupFromDesktop(httptest.NewRecorder(), setupReq, webAuthSetupRequest{
		Username:             "admin",
		Password:             "secret",
		DesktopLoginRequired: false,
	}); err != nil {
		t.Fatalf("expected desktop setup to succeed: %v", err)
	}

	localReq := httptest.NewRequest(http.MethodGet, "/api/files/host?download=1&desktopToken=desktop-token", nil)
	localReq.RemoteAddr = "127.0.0.1:23456"
	if !authenticator.requestAuthenticated(localReq) {
		t.Fatalf("expected local desktop token query to authenticate")
	}

	remoteReq := httptest.NewRequest(http.MethodGet, "/api/files/host?download=1&desktopToken=desktop-token", nil)
	remoteReq.RemoteAddr = "192.168.1.20:23456"
	if authenticator.requestAuthenticated(remoteReq) {
		t.Fatalf("expected remote desktop token query to be rejected")
	}
}

func TestCORSAllowsCredentialedRequests(t *testing.T) {
	t.Setenv("AI_SSH_WEB_AUTH", "0")
	srv := newServer("18555", newSessionManagerWithStores(
		&hostStore{path: filepath.Join(t.TempDir(), "hosts.json")},
		newMemoryCredentialStore(),
		newAppLogger(),
	))

	req := httptest.NewRequest(http.MethodOptions, "/api/auth/desktop-setup", nil)
	req.Header.Set("Origin", "http://127.0.0.1:1420")
	req.Header.Set("Access-Control-Request-Headers", "X-AI-SSH-Desktop-Token")
	recorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected CORS preflight 204, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:1420" {
		t.Fatalf("expected origin echo, got %q", got)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("expected credentials allowed, got %q", got)
	}
	if !strings.Contains(recorder.Header().Get("Access-Control-Allow-Headers"), "X-AI-SSH-Desktop-Token") {
		t.Fatalf("expected desktop token header allowed, got %q", recorder.Header().Get("Access-Control-Allow-Headers"))
	}
}

func TestAIPredictEndpointUsesOpenAICompatibleProvider(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("expected chat completions path, got %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("expected bearer token, got %q", r.Header.Get("Authorization"))
		}
		var providerRequest openAIChatRequest
		if err := json.NewDecoder(r.Body).Decode(&providerRequest); err != nil {
			t.Fatalf("expected valid provider request, got error: %v", err)
		}
		if len(providerRequest.Messages) != 2 {
			t.Fatalf("expected system and user messages, got %#v", providerRequest.Messages)
		}
		if !strings.Contains(providerRequest.Messages[0].Content, "你是 SSH 终端命令预测助手") {
			t.Fatalf("expected Chinese system prompt, got %q", providerRequest.Messages[0].Content)
		}
		if !strings.Contains(providerRequest.Messages[1].Content, "当前主机") || !strings.Contains(providerRequest.Messages[1].Content, "终端上下文") {
			t.Fatalf("expected Chinese user prompt, got %q", providerRequest.Messages[1].Content)
		}
		writeJSON(w, map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]string{
						"role":    "assistant",
						"content": `{"commands":["ls -lah","pwd","git status"]}`,
					},
				},
			},
		})
	}))
	defer provider.Close()

	srv := newTestServer(t)
	body, err := json.Marshal(aiPredictionRequest{
		BaseURL:         provider.URL + "/v1",
		APIKey:          "test-key",
		Model:           "test-model",
		PredictionCount: 2,
		TerminalContext: "$ cd /egova_apps",
		CommandHistory:  []string{"cd /egova_apps"},
	})
	if err != nil {
		t.Fatalf("expected request json, got error: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/ai/predict", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%q", recorder.Code, recorder.Body.String())
	}

	var response aiPredictionResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}
	if len(response.Commands) != 2 || response.Commands[0] != "ls -lah" || response.Commands[1] != "pwd" {
		t.Fatalf("expected two predicted commands, got %#v", response.Commands)
	}
}

func TestHostsEndpoint(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	recorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var response []map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}

	if len(response) == 0 {
		t.Fatal("expected seeded hosts, got empty list")
	}
}

func TestLogsEndpoints(t *testing.T) {
	srv := newTestServer(t)

	settingsBody := bytes.NewBufferString(`{"level":"debug"}`)
	settingsReq := httptest.NewRequest(http.MethodPut, "/api/logs/settings", settingsBody)
	settingsReq.Header.Set("Content-Type", "application/json")
	settingsRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(settingsRecorder, settingsReq)

	if settingsRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", settingsRecorder.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/logs?limit=10", nil)
	recorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var response map[string][]map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}
	if len(response["logs"]) == 0 {
		t.Fatal("expected logs after settings request")
	}
}

func TestCreateUpdateDeleteHostEndpoints(t *testing.T) {
	srv := newTestServer(t)
	createBody := []byte(`{
		"name":"Test Host",
		"address":"192.168.1.20",
		"port":22,
		"username":"root",
		"authType":"password",
		"group":"测试",
		"password":"secret"
	}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/hosts", bytes.NewBuffer(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(createRecorder, createReq)

	if createRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", createRecorder.Code)
	}

	var created map[string]any
	if err := json.Unmarshal(createRecorder.Body.Bytes(), &created); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}

	if _, ok := created["password"]; ok {
		t.Fatal("expected password to be omitted from host response")
	}
	if created["hasPassword"] != true {
		t.Fatalf("expected saved password flag, got %v", created["hasPassword"])
	}

	hostID := created["id"].(string)
	updateBody := []byte(`{
		"name":"Updated Host",
		"address":"192.168.1.21",
		"port":2222,
		"username":"deploy",
		"authType":"password",
		"group":"测试"
	}`)
	updateReq := httptest.NewRequest(http.MethodPut, "/api/hosts/"+hostID, bytes.NewBuffer(updateBody))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(updateRecorder, updateReq)

	if updateRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", updateRecorder.Code)
	}

	var updated map[string]any
	if err := json.Unmarshal(updateRecorder.Body.Bytes(), &updated); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}
	if updated["hasPassword"] != true {
		t.Fatalf("expected password flag to be retained, got %v", updated["hasPassword"])
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/hosts/"+hostID, nil)
	deleteRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(deleteRecorder, deleteReq)

	if deleteRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", deleteRecorder.Code)
	}
}

func TestHostGroupsPersistEmptyGroups(t *testing.T) {
	t.Setenv("AI_SSH_WEB_AUTH", "0")
	storePath := filepath.Join(t.TempDir(), "hosts.json")
	srv := newServer("18555", newSessionManagerWithStores(&hostStore{path: storePath}, newMemoryCredentialStore(), newAppLogger()))
	updateBody := []byte(`{"groups":[{"name":"默认"},{"name":"生产环境"},{"name":"空分组"}]}`)
	updateReq := httptest.NewRequest(http.MethodPut, "/api/host-groups", bytes.NewBuffer(updateBody))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(updateRecorder, updateReq)

	if updateRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", updateRecorder.Code)
	}
	if !bytes.Contains(updateRecorder.Body.Bytes(), []byte("空分组")) {
		t.Fatalf("expected empty group in response, got %q", updateRecorder.Body.String())
	}

	restarted := newServer("18555", newSessionManagerWithStores(&hostStore{path: storePath}, newMemoryCredentialStore(), newAppLogger()))
	listReq := httptest.NewRequest(http.MethodGet, "/api/host-groups", nil)
	listRecorder := httptest.NewRecorder()
	restarted.Handler.ServeHTTP(listRecorder, listReq)

	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", listRecorder.Code)
	}
	if !bytes.Contains(listRecorder.Body.Bytes(), []byte("空分组")) {
		t.Fatalf("expected persisted empty group, got %q", listRecorder.Body.String())
	}
}

func TestHostGroupsRenameUpdatesHosts(t *testing.T) {
	t.Setenv("AI_SSH_WEB_AUTH", "0")
	storePath := filepath.Join(t.TempDir(), "hosts.json")
	srv := newServer("18555", newSessionManagerWithStores(&hostStore{path: storePath}, newMemoryCredentialStore(), newAppLogger()))
	createBody := []byte(`{
		"name":"Grouped Host",
		"address":"192.168.1.22",
		"port":22,
		"username":"root",
		"authType":"agent",
		"group":"旧分组"
	}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/hosts", bytes.NewBuffer(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(createRecorder, createReq)
	if createRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", createRecorder.Code)
	}

	updateBody := []byte(`{"groups":[{"name":"新分组","previousName":"旧分组"}]}`)
	updateReq := httptest.NewRequest(http.MethodPut, "/api/host-groups", bytes.NewBuffer(updateBody))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(updateRecorder, updateReq)
	if updateRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", updateRecorder.Code)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	listRecorder := httptest.NewRecorder()
	srv.Handler.ServeHTTP(listRecorder, listReq)
	if !bytes.Contains(listRecorder.Body.Bytes(), []byte("新分组")) {
		t.Fatalf("expected host group to be renamed, got %q", listRecorder.Body.String())
	}
}

func TestHostsPersistAcrossServerRestartWithoutSecrets(t *testing.T) {
	t.Setenv("AI_SSH_WEB_AUTH", "0")
	storePath := filepath.Join(t.TempDir(), "hosts.json")
	credentials := newMemoryCredentialStore()

	srv := newServer("18555", newSessionManagerWithStores(&hostStore{path: storePath}, credentials, newAppLogger()))
	createBody := []byte(`{
		"name":"Persisted Host",
		"address":"192.168.1.30",
		"port":22,
		"username":"deploy",
		"authType":"password",
		"group":"测试",
		"password":"secret"
	}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/hosts", bytes.NewBuffer(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(createRecorder, createReq)

	if createRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", createRecorder.Code)
	}

	stored, err := os.ReadFile(storePath)
	if err != nil {
		t.Fatalf("expected persisted host file, got error: %v", err)
	}
	if bytes.Contains(stored, []byte("secret")) {
		t.Fatal("expected persisted host file to omit password secret")
	}
	if !bytes.Contains(stored, []byte("groups")) {
		t.Fatal("expected persisted host file to include host groups")
	}

	restarted := newServer("18555", newSessionManagerWithStores(&hostStore{path: storePath}, credentials, newAppLogger()))
	listReq := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	listRecorder := httptest.NewRecorder()

	restarted.Handler.ServeHTTP(listRecorder, listReq)

	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", listRecorder.Code)
	}

	var hosts []map[string]any
	if err := json.Unmarshal(listRecorder.Body.Bytes(), &hosts); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}

	for _, host := range hosts {
		if host["name"] != "Persisted Host" {
			continue
		}
		if _, ok := host["password"]; ok {
			t.Fatal("expected password to be omitted from persisted host response")
		}
		if host["hasPassword"] != true {
			t.Fatalf("expected password flag to persist, got %v", host["hasPassword"])
		}
		return
	}

	t.Fatal("expected persisted host after server restart")
}

func TestHostsEncryptedExportAndImportCredentials(t *testing.T) {
	exportCredentials := newMemoryCredentialStore()
	exportServer := newTestServerWithCredentials(t, exportCredentials)
	createBody := []byte(`{
		"name":"Exported Host",
		"address":"192.168.1.60",
		"port":22,
		"username":"deploy",
		"authType":"password",
		"group":"迁移",
		"password":"secret"
	}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/hosts", bytes.NewBuffer(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()

	exportServer.Handler.ServeHTTP(createRecorder, createReq)

	if createRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", createRecorder.Code)
	}

	exportReq := httptest.NewRequest(http.MethodGet, "/api/hosts/export?credentials=1", nil)
	exportRecorder := httptest.NewRecorder()
	exportServer.Handler.ServeHTTP(exportRecorder, exportReq)

	if exportRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", exportRecorder.Code)
	}
	if bytes.Contains(exportRecorder.Body.Bytes(), []byte("secret")) {
		t.Fatal("expected encrypted export to omit plaintext secret")
	}

	var exported hostsExportResponse
	if err := json.Unmarshal(exportRecorder.Body.Bytes(), &exported); err != nil {
		t.Fatalf("expected valid export json, got error: %v", err)
	}
	if !exported.Encrypted || exported.ExportKey == "" {
		t.Fatal("expected encrypted export with export key")
	}
	var exportedHost hostRecord
	for _, host := range exported.Hosts {
		if host.Name == "Exported Host" {
			exportedHost = host
			break
		}
	}
	if exportedHost.ID == "" || exportedHost.Password == "" {
		t.Fatal("expected encrypted password in export")
	}

	importCredentials := newMemoryCredentialStore()
	importServer := newTestServerWithCredentials(t, importCredentials)
	importReq := httptest.NewRequest(http.MethodPost, "/api/hosts/import", bytes.NewBuffer(exportRecorder.Body.Bytes()))
	importReq.Header.Set("Content-Type", "application/json")
	importRecorder := httptest.NewRecorder()

	importServer.Handler.ServeHTTP(importRecorder, importReq)

	if importRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", importRecorder.Code)
	}

	var imported map[string][]hostRecord
	if err := json.Unmarshal(importRecorder.Body.Bytes(), &imported); err != nil {
		t.Fatalf("expected valid import json, got error: %v", err)
	}
	var importedHost hostRecord
	for _, host := range imported["hosts"] {
		if host.Name == "Exported Host" {
			importedHost = host
			break
		}
	}
	if importedHost.ID == "" {
		t.Fatal("expected exported host to be imported")
	}
	password, ok, err := importCredentials.Get(importedHost.ID, passwordCredential)
	if err != nil {
		t.Fatalf("expected imported credential read without error, got %v", err)
	}
	if !ok || password != "secret" {
		t.Fatalf("expected imported password secret, ok=%v value=%q", ok, password)
	}
}

func TestSavedHostCredentialsStayInCredentialStore(t *testing.T) {
	credentials := newMemoryCredentialStore()
	srv := newTestServerWithCredentials(t, credentials)
	createBody := []byte(`{
		"name":"Credential Host",
		"address":"192.168.1.40",
		"port":22,
		"username":"deploy",
		"authType":"password",
		"group":"测试",
		"password":"secret"
	}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/hosts", bytes.NewBuffer(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(createRecorder, createReq)

	if createRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", createRecorder.Code)
	}

	var created map[string]any
	if err := json.Unmarshal(createRecorder.Body.Bytes(), &created); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}
	hostID := created["id"].(string)

	password, ok, err := credentials.Get(hostID, passwordCredential)
	if err != nil {
		t.Fatalf("expected credential read without error, got %v", err)
	}
	if !ok || password != "secret" {
		t.Fatalf("expected password in credential store, ok=%v value=%q", ok, password)
	}
}

func TestSavedPrivateKeyCredentialCanBeLarge(t *testing.T) {
	credentials := newMemoryCredentialStore()
	srv := newTestServerWithCredentials(t, credentials)
	privateKey := strings.Repeat("key-material", 300)
	body, err := json.Marshal(map[string]any{
		"name":       "Key Host",
		"address":    "192.168.1.50",
		"port":       22,
		"username":   "deploy",
		"authType":   "privateKey",
		"group":      "测试",
		"privateKey": privateKey,
	})
	if err != nil {
		t.Fatalf("expected json marshal without error, got %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/hosts", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var created map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &created); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}
	if created["hasPrivateKey"] != true {
		t.Fatalf("expected private key flag, got %v", created["hasPrivateKey"])
	}

	hostID := created["id"].(string)
	stored, ok, err := credentials.Get(hostID, privateKeyCredential)
	if err != nil {
		t.Fatalf("expected credential read without error, got %v", err)
	}
	if !ok || stored != privateKey {
		t.Fatalf("expected private key in credential store, ok=%v", ok)
	}
}

func TestCreateSessionEndpoint(t *testing.T) {
	srv := newTestServer(t)
	body := []byte(`{"hostId":"local-demo"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var response map[string]map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}

	session := response["session"]
	if session["hostId"] != "local-demo" {
		t.Fatalf("expected hostId local-demo, got %v", session["hostId"])
	}
}

func TestSessionEventsEndpointStreamsThroughLoggingMiddleware(t *testing.T) {
	srv := newTestServer(t)
	openReq := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBufferString(`{"hostId":"local-demo"}`))
	openReq.Header.Set("Content-Type", "application/json")
	openRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(openRecorder, openReq)

	if openRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", openRecorder.Code)
	}

	var openResponse map[string]map[string]any
	if err := json.Unmarshal(openRecorder.Body.Bytes(), &openResponse); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}

	sessionID := openResponse["session"]["id"].(string)
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequestWithContext(ctx, http.MethodGet, "/api/sessions/"+sessionID+"/events", nil)
	recorder := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		srv.Handler.ServeHTTP(recorder, req)
		close(done)
	}()

	deadline := time.After(2 * time.Second)
	for {
		if strings.Contains(recorder.Body.String(), "event: terminal") {
			cancel()
			<-done
			if recorder.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d", recorder.Code)
			}
			return
		}

		select {
		case <-deadline:
			cancel()
			<-done
			t.Fatalf("expected terminal event stream, got body %q and status %d", recorder.Body.String(), recorder.Code)
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}
}

func TestExtractPromptCWD(t *testing.T) {
	cwd := extractPromptCWD("(base) deploy@app-server:/var/www$ ")

	if cwd != "/var/www" {
		t.Fatalf("expected cwd /var/www, got %q", cwd)
	}
}

func TestExtractPromptCWDFromCondaPromptAfterCD(t *testing.T) {
	output := "(base) hwits@root123-Super-Server:~$ cd /egova_apps/\r\n(base) hwits@root123-Super-Server:/egova_apps$ "
	cwd := extractPromptCWD(output)

	if cwd != "/egova_apps" {
		t.Fatalf("expected cwd /egova_apps, got %q", cwd)
	}
}

func TestExtractPromptCWDForHome(t *testing.T) {
	cwd := extractPromptCWD("deploy@app-server:~/logs$ ")

	if cwd != "./logs" {
		t.Fatalf("expected cwd ./logs, got %q", cwd)
	}
}

func TestExtractPromptCWDForHomeRoot(t *testing.T) {
	cwd := extractPromptCWD("(base) hwits@root123-Super-Server:~$ ")

	if cwd != "." {
		t.Fatalf("expected cwd ., got %q", cwd)
	}
}

func TestExtractPromptCommandsFromShellEcho(t *testing.T) {
	output := `(base) hwits@root123-Super-Server:~$ cd /egova_apps/
(base) hwits@root123-Super-Server:/egova_apps$ cd CityEvent/bin
(base) hwits@root123-Super-Server:/egova_apps/CityEvent/bin$ ls -la
total 20
drwxr-xr-x 2 hwits hwits 4096 May 25 22:30 .
(base) hwits@root123-Super-Server:/egova_apps/CityEvent/bin$ cat ztva.json
{"enabled":true}
(base) hwits@root123-Super-Server:/egova_apps/CityEvent/bin$ ls -la
total 20
(base) hwits@root123-Super-Server:/egova_apps/CityEvent/bin$ history
 1990  cd /egova_apps/
 1991  cd CityEvent/bin
 1992  ls -la
 1993  cat ztva.json
 1994  ls -la
 1995  history
`

	commands := extractPromptCommands(output)
	expected := []string{
		"cd /egova_apps/",
		"cd CityEvent/bin",
		"ls -la",
		"cat ztva.json",
		"ls -la",
		"history",
	}

	if strings.Join(commands, "\n") != strings.Join(expected, "\n") {
		t.Fatalf("expected commands %q, got %q", expected, commands)
	}
}

func TestObserveCommandEchoBuffersSplitPromptLine(t *testing.T) {
	session := &terminalSession{
		output: make(chan terminalEvent, 1),
		done:   make(chan struct{}),
	}

	session.observeCommandEcho("(base) hwits@root123-Super-Server:~$ cd /ego")
	select {
	case event := <-session.output:
		t.Fatalf("expected no command before line break, got %#v", event)
	default:
	}

	session.observeCommandEcho("va_apps/\r\n")
	select {
	case event := <-session.output:
		if event.Type != "command" || event.Data != "cd /egova_apps/" {
			t.Fatalf("expected command event for cd /egova_apps/, got %#v", event)
		}
	default:
		t.Fatal("expected command event after complete echoed line")
	}
}

func TestNormalizeRemotePathForRequest(t *testing.T) {
	cases := map[string]string{
		"":              ".",
		"   ":           ".",
		"/var//log/":    "/var/log",
		" ./egova_apps": "egova_apps",
	}

	for input, expected := range cases {
		if actual := normalizeRemotePathForRequest(input); actual != expected {
			t.Fatalf("expected %q to normalize to %q, got %q", input, expected, actual)
		}
	}
}

func TestOutputTail(t *testing.T) {
	tail := outputTail(strings.Repeat("a", 600))

	if len(tail) != 512 {
		t.Fatalf("expected tail length 512, got %d", len(tail))
	}
}

func TestSessionCWDEndpoint(t *testing.T) {
	t.Setenv("AI_SSH_WEB_AUTH", "0")
	sessionID := "session-test-cwd"
	sessionManager := newSessionManagerWithStores(&hostStore{path: filepath.Join(t.TempDir(), "hosts.json")}, newMemoryCredentialStore(), newAppLogger())
	session := &terminalSession{
		record: sessionRecord{ID: sessionID, HostID: "local-demo", HostName: "Local Demo", Status: "connected"},
		input:  make(chan string, 1),
		resize: make(chan sessionResizeRequest, 1),
		output: make(chan terminalEvent, 1),
		done:   make(chan struct{}),
	}
	session.setCWD("/egova_apps")
	sessionManager.sessions[sessionID] = session
	cwdServer := newServer("18555", sessionManager)

	cwdReq := httptest.NewRequest(http.MethodGet, "/api/sessions/"+sessionID+"/cwd", nil)
	cwdRecorder := httptest.NewRecorder()
	cwdServer.Handler.ServeHTTP(cwdRecorder, cwdReq)
	if cwdRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", cwdRecorder.Code)
	}
	if !strings.Contains(cwdRecorder.Body.String(), "/egova_apps") {
		t.Fatalf("expected cwd response, got %q", cwdRecorder.Body.String())
	}
}

func TestReconnectSessionEndpoint(t *testing.T) {
	srv := newTestServer(t)
	openReq := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBufferString(`{"hostId":"local-demo"}`))
	openReq.Header.Set("Content-Type", "application/json")
	openRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(openRecorder, openReq)

	if openRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", openRecorder.Code)
	}

	var openResponse map[string]map[string]any
	if err := json.Unmarshal(openRecorder.Body.Bytes(), &openResponse); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}

	sessionID := openResponse["session"]["id"].(string)
	reconnectReq := httptest.NewRequest(http.MethodPost, "/api/sessions/"+sessionID+"/reconnect", nil)
	reconnectRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(reconnectRecorder, reconnectReq)

	if reconnectRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", reconnectRecorder.Code)
	}

	var reconnectResponse sessionReconnectResponse
	if err := json.Unmarshal(reconnectRecorder.Body.Bytes(), &reconnectResponse); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}
	if reconnectResponse.PreviousSessionID != sessionID {
		t.Fatalf("expected previous session %q, got %q", sessionID, reconnectResponse.PreviousSessionID)
	}
	if reconnectResponse.Session.ID == "" || reconnectResponse.Session.ID == sessionID {
		t.Fatalf("expected new session id, got %q", reconnectResponse.Session.ID)
	}
	if reconnectResponse.Session.HostID != "local-demo" {
		t.Fatalf("expected local-demo host, got %q", reconnectResponse.Session.HostID)
	}
}

func TestParsePercent(t *testing.T) {
	if parsePercent("88") != 88 {
		t.Fatal("expected percent 88")
	}
	if parsePercent("200") != 100 {
		t.Fatal("expected percent to be capped")
	}
	if parsePercent("bad") != 0 {
		t.Fatal("expected invalid percent to be zero")
	}
}

func TestParseCPUStat(t *testing.T) {
	total, idle, ok := parseCPUStat("100 20 30 900 10 5 5 0")

	if !ok {
		t.Fatal("expected cpu stat parse to succeed")
	}
	if total != 1070 || idle != 910 {
		t.Fatalf("expected total 1070 and idle 910, got %d %d", total, idle)
	}
}

func TestParseServerMetricsSections(t *testing.T) {
	output := `cpu  100 0 100 800 0 0 0 0

__AI_SSH_STAT2__
cpu  120 0 120 840 0 0 0 0

__AI_SSH_MEMINFO__
MemTotal:       1000 kB
MemAvailable:   250 kB

__AI_SSH_DF__
Filesystem 1024-blocks Used Available Capacity Mounted on
/dev/sda1 100 58 42 58% /egova_data
tmpfs 10 1 9 10% /run

__AI_SSH_NETDEV__
Inter-| Receive | Transmit
  eth0: 4294967296 0 0 0 0 0 0 0 2147483648 0 0 0 0 0 0 0
    lo: 100 0 0 0 0 0 0 0 200 0 0 0 0 0 0 0`

	if parseCPUPercent(output) != 50 {
		t.Fatalf("expected cpu percent 50, got %d", parseCPUPercent(output))
	}
	if parseMemoryPercent(output) != 75 {
		t.Fatalf("expected memory percent 75, got %d", parseMemoryPercent(output))
	}
	memoryPercent, memoryUsedBytes, memoryTotalBytes := parseMemoryMetrics(output)
	if memoryPercent != 75 || memoryUsedBytes != 750*1024 || memoryTotalBytes != 1000*1024 {
		t.Fatalf("expected memory metrics 75%% 750/1000 KiB, got percent=%d used=%d total=%d", memoryPercent, memoryUsedBytes, memoryTotalBytes)
	}
	disks, diskPercent := parseDiskMetrics(output)
	if diskPercent != 58 || len(disks) != 1 || disks[0].Mount != "/egova_data" {
		t.Fatalf("expected egova_data disk metric, got percent=%d disks=%v", diskPercent, disks)
	}
	rx, tx := parseNetworkTotals(output)
	if rx != 4294967396 || tx != 2147483848 {
		t.Fatalf("expected 64-bit network totals, got rx=%d tx=%d", rx, tx)
	}
}

func TestCreateTransientSessionEndpoint(t *testing.T) {
	srv := newTestServer(t)
	body := []byte(`{
		"hostId":"transient",
		"transientHost":{
			"address":"127.0.0.1",
			"port":22,
			"username":"test",
			"password":"secret",
			"authType":"password"
		}
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var response map[string]map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}

	session := response["session"]
	if session["hostName"] != "test@127.0.0.1" {
		t.Fatalf("expected transient hostName test@127.0.0.1, got %v", session["hostName"])
	}
}

func TestWriteSessionInputEndpoint(t *testing.T) {
	srv := newTestServer(t)
	openReq := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBufferString(`{"hostId":"local-demo"}`))
	openReq.Header.Set("Content-Type", "application/json")
	openRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(openRecorder, openReq)

	if openRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", openRecorder.Code)
	}

	var openResponse map[string]map[string]any
	if err := json.Unmarshal(openRecorder.Body.Bytes(), &openResponse); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}

	sessionID := openResponse["session"]["id"].(string)
	inputReq := httptest.NewRequest(
		http.MethodPost,
		"/api/sessions/"+sessionID+"/input",
		bytes.NewBufferString(`{"data":"hello\r"}`),
	)
	inputReq.Header.Set("Content-Type", "application/json")
	inputRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(inputRecorder, inputReq)

	if inputRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", inputRecorder.Code)
	}
}

func TestResizeSessionEndpoint(t *testing.T) {
	srv := newTestServer(t)
	openReq := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBufferString(`{"hostId":"local-demo"}`))
	openReq.Header.Set("Content-Type", "application/json")
	openRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(openRecorder, openReq)

	if openRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", openRecorder.Code)
	}

	var openResponse map[string]map[string]any
	if err := json.Unmarshal(openRecorder.Body.Bytes(), &openResponse); err != nil {
		t.Fatalf("expected valid json response, got error: %v", err)
	}

	sessionID := openResponse["session"]["id"].(string)
	resizeReq := httptest.NewRequest(
		http.MethodPost,
		"/api/sessions/"+sessionID+"/resize",
		bytes.NewBufferString(`{"cols":132,"rows":42}`),
	)
	resizeReq.Header.Set("Content-Type", "application/json")
	resizeRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(resizeRecorder, resizeReq)

	if resizeRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resizeRecorder.Code)
	}
}
