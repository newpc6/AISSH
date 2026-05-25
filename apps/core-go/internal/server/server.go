package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type healthResponse struct {
	Status       string   `json:"status"`
	Service      string   `json:"service"`
	Version      string   `json:"version"`
	Timestamp    string   `json:"timestamp"`
	Capabilities []string `json:"capabilities"`
}

type hostRecord struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Address     string `json:"address"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	AuthType    string `json:"authType"`
	Description string `json:"description,omitempty"`
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
	HostID string `json:"hostId"`
}

type sessionOpenResponse struct {
	Session sessionRecord `json:"session"`
}

func New(port string) *http.Server {
	mux := http.NewServeMux()
	hosts := []hostRecord{
		{
			ID:          "gpu-dev-01",
			Name:        "GPU Dev 01",
			Address:     "10.10.1.25",
			Port:        22,
			Username:    "ubuntu",
			AuthType:    "privateKey",
			Description: "AI 训练与实验环境",
		},
		{
			ID:          "prod-api-01",
			Name:        "Prod API 01",
			Address:     "10.10.8.12",
			Port:        22,
			Username:    "deploy",
			AuthType:    "agent",
			Description: "线上 API 节点",
		},
	}

	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")

		response := healthResponse{
			Status:    "ok",
			Service:   "ai-ssh-core",
			Version:   "0.1.0",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Capabilities: []string{
				"health-check",
				"api-contract",
				"future-ssh-session",
			},
		}

		_ = json.NewEncoder(w).Encode(response)
	}

	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/health", healthHandler)
	mux.HandleFunc("/api/hosts", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(hosts)
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

		var selectedHost *hostRecord
		for i := range hosts {
			if hosts[i].ID == request.HostID {
				selectedHost = &hosts[i]
				break
			}
		}

		if selectedHost == nil {
			http.Error(w, "host not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(sessionOpenResponse{
			Session: sessionRecord{
				ID:        uuid.NewString(),
				HostID:    selectedHost.ID,
				HostName:  selectedHost.Name,
				Status:    "connected",
				CreatedAt: time.Now().UTC().Format(time.RFC3339),
			},
		})
	})

	return &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%s", port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
}
