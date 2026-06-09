package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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

	// 启动服务器在 goroutine 中
	go func() {
		log.Printf("AI SSH core listening on http://%s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// 给服务器 5 秒时间完成当前请求
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exited")
}
