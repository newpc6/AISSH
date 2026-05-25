package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthEndpoint(t *testing.T) {
	srv := New("18555")
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
	srv := New("18555")
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

func TestCreateSessionEndpoint(t *testing.T) {
	srv := New("18555")
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
	srv := New("18555")
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
	srv := New("18555")
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
