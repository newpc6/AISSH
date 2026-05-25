package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestServer(t *testing.T) *http.Server {
	t.Helper()
	return newTestServerWithCredentials(t, newMemoryCredentialStore())
}

func newTestServerWithCredentials(t *testing.T, credentials credentialStore) *http.Server {
	t.Helper()
	store := &hostStore{path: filepath.Join(t.TempDir(), "hosts.json")}
	return newServer("18555", newSessionManagerWithStores(store, credentials))
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

	srv := newServer("18555", newSessionManagerWithStores(&hostStore{path: storePath}, credentials))
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

	restarted := newServer("18555", newSessionManagerWithStores(&hostStore{path: storePath}, credentials))
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
