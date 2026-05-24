package main

import (
	"log"
	"os"

	"github.com/liupengcheng/ai-ssh-core/internal/server"
)

func main() {
	port := os.Getenv("AI_SSH_CORE_PORT")
	if port == "" {
		port = "18555"
	}

	srv := server.New(port)

	log.Printf("AI SSH core listening on http://127.0.0.1:%s", port)

	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
