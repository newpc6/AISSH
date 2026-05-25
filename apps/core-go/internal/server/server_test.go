package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func newTestServer(t *testing.T) *http.Server {
	t.Helper()
	t.Setenv("AI_SSH_HOSTS_PATH", filepath.Join(t.TempDir(), "hosts.json"))
	return New("18555")
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

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/hosts/"+hostID, nil)
	deleteRecorder := httptest.NewRecorder()

	srv.Handler.ServeHTTP(deleteRecorder, deleteReq)

	if deleteRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", deleteRecorder.Code)
	}
}

func TestHostsPersistAcrossServerRestartWithoutSecrets(t *testing.T) {
	storePath := filepath.Join(t.TempDir(), "hosts.json")
	t.Setenv("AI_SSH_HOSTS_PATH", storePath)

	srv := New("18555")
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

	restarted := New("18555")
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
		if host["hasPassword"] == true {
			t.Fatal("expected password flag to be false after persistence reload")
		}
		return
	}

	t.Fatal("expected persisted host after server restart")
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
