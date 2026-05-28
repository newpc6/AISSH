package main

import (
	"fmt"
	"log"
	"os"

	"ai-ssh-core/internal/server"
)

func main() {
	cfg := server.LoadCoreConfig()

	if os.Getenv("AI_SSH_BIND_HOST") == "" {
		os.Setenv("AI_SSH_BIND_HOST", cfg.BindHost)
	}

	port := fmt.Sprintf("%d", cfg.Port)
	if envPort := os.Getenv("AI_SSH_CORE_PORT"); envPort != "" {
		port = envPort
	}

	if os.Getenv("AI_SSH_CORE_PORT") == "" {
		os.Setenv("AI_SSH_CORE_PORT", port)
	}

	srv := server.New(port)

	log.Printf("AI SSH core listening on http://%s", srv.Addr)

	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
