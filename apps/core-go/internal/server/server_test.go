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

func newTestServer(t *testing.T) *http.Server {
	t.Helper()
	return newTestServerWithCredentials(t, newMemoryCredentialStore())
}

func newTestServerWithCredentials(t *testing.T, credentials credentialStore) *http.Server {
	t.Helper()
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

func TestHostsPersistAcrossServerRestartWithoutSecrets(t *testing.T) {
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

func TestExtractPromptCWDForHome(t *testing.T) {
	cwd := extractPromptCWD("deploy@app-server:~/logs$ ")

	if cwd != "./logs" {
		t.Fatalf("expected cwd ./logs, got %q", cwd)
	}
}

func TestOutputTail(t *testing.T) {
	tail := outputTail(strings.Repeat("a", 600))

	if len(tail) != 512 {
		t.Fatalf("expected tail length 512, got %d", len(tail))
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
	total, idle, ok := parseCPUStat("1200 900")

	if !ok {
		t.Fatal("expected cpu stat parse to succeed")
	}
	if total != 1200 || idle != 900 {
		t.Fatalf("expected total 1200 and idle 900, got %d %d", total, idle)
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
