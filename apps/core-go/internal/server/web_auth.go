package server

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	webAuthCookieName = "ai_ssh_session"
	webAuthTokenBytes = 32
	webAuthTTL        = 24 * time.Hour
)

type webAuthConfig struct {
	Enabled  bool
	Username string
	Password string
}

type webLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type webAuthStatusResponse struct {
	Authenticated bool   `json:"authenticated"`
	Username      string `json:"username,omitempty"`
	Enabled       bool   `json:"enabled"`
}

type webAuthStoreFile struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type webSession struct {
	username  string
	expiresAt time.Time
}

type webAuthenticator struct {
	mu       sync.Mutex
	enabled  bool
	username string
	password string
	sessions map[string]webSession
	logger   *appLogger
}

func newWebAuthenticator(logger *appLogger) *webAuthenticator {
	config := loadWebAuthConfig(logger)
	return &webAuthenticator{
		enabled:  config.Enabled,
		username: config.Username,
		password: config.Password,
		sessions: map[string]webSession{},
		logger:   logger,
	}
}

func loadWebAuthConfig(logger *appLogger) webAuthConfig {
	enabledValue := strings.ToLower(strings.TrimSpace(os.Getenv("AI_SSH_WEB_AUTH")))
	if enabledValue == "0" || enabledValue == "false" || enabledValue == "off" {
		logger.warn("auth", "web auth disabled by AI_SSH_WEB_AUTH", nil)
		return webAuthConfig{Enabled: false}
	}

	username := strings.TrimSpace(os.Getenv("AI_SSH_WEB_USER"))
	password := os.Getenv("AI_SSH_WEB_PASSWORD")
	if username == "" {
		username = "admin"
	}
	if password != "" {
		return webAuthConfig{Enabled: true, Username: username, Password: password}
	}

	configPath := webAuthConfigPath()
	if config, err := readWebAuthStore(configPath); err == nil && config.Password != "" {
		if strings.TrimSpace(config.Username) != "" {
			username = strings.TrimSpace(config.Username)
		}
		logger.info("auth", "loaded web auth password from local store", map[string]any{"path": configPath, "username": username})
		return webAuthConfig{Enabled: true, Username: username, Password: config.Password}
	}

	generatedPassword, err := generateWebPassword()
	if err != nil {
		logger.error("auth", "generate web auth password failed", map[string]any{"error": err.Error()})
		generatedPassword = "admin"
	}
	if err := writeWebAuthStore(configPath, webAuthStoreFile{Username: username, Password: generatedPassword}); err != nil {
		logger.error("auth", "persist generated web auth password failed", map[string]any{"path": configPath, "error": err.Error()})
	} else {
		logger.warn("auth", "generated initial web login password", map[string]any{
			"path":     configPath,
			"username": username,
			"password": generatedPassword,
		})
	}
	return webAuthConfig{Enabled: true, Username: username, Password: generatedPassword}
}

func webAuthConfigPath() string {
	if path := os.Getenv("AI_SSH_WEB_AUTH_PATH"); strings.TrimSpace(path) != "" {
		return path
	}
	baseDir := os.Getenv("AI_SSH_HOME")
	if baseDir == "" {
		var err error
		baseDir, err = os.Getwd()
		if err != nil {
			baseDir = "."
		}
	}
	return filepath.Join(baseDir, "data", "web-auth.json")
}

func readWebAuthStore(path string) (webAuthStoreFile, error) {
	file, err := os.Open(path)
	if err != nil {
		return webAuthStoreFile{}, err
	}
	defer file.Close()

	var config webAuthStoreFile
	if err := json.NewDecoder(file).Decode(&config); err != nil {
		return webAuthStoreFile{}, err
	}
	return config, nil
}

func writeWebAuthStore(path string, config webAuthStoreFile) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(config)
}

func generateWebPassword() (string, error) {
	buffer := make([]byte, 18)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("生成 Web 登录密码失败: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func (a *webAuthenticator) status(r *http.Request) webAuthStatusResponse {
	if !a.enabled {
		return webAuthStatusResponse{Authenticated: true, Enabled: false}
	}
	username, ok := a.authenticatedUsername(r)
	return webAuthStatusResponse{Authenticated: ok, Username: username, Enabled: true}
}

func (a *webAuthenticator) login(w http.ResponseWriter, request webLoginRequest) bool {
	if !a.enabled {
		writeAuthCookie(w, "disabled", time.Now().Add(webAuthTTL))
		return true
	}
	usernameMatches := subtle.ConstantTimeCompare([]byte(strings.TrimSpace(request.Username)), []byte(a.username)) == 1
	passwordMatches := subtle.ConstantTimeCompare(hashString(request.Password), hashString(a.password)) == 1
	if !usernameMatches || !passwordMatches {
		return false
	}

	token, err := generateSessionToken()
	if err != nil {
		a.logger.error("auth", "create web session token failed", map[string]any{"error": err.Error()})
		return false
	}
	expiresAt := time.Now().Add(webAuthTTL)
	a.mu.Lock()
	a.sessions[token] = webSession{username: a.username, expiresAt: expiresAt}
	a.mu.Unlock()
	writeAuthCookie(w, token, expiresAt)
	a.logger.info("auth", "web login succeeded", map[string]any{"username": a.username})
	return true
}

func (a *webAuthenticator) desktopLogin(w http.ResponseWriter, r *http.Request) bool {
	if !a.enabled {
		writeAuthCookie(w, "disabled", time.Now().Add(webAuthTTL))
		return true
	}
	token := os.Getenv("AI_SSH_DESKTOP_TOKEN")
	if token == "" || subtle.ConstantTimeCompare(hashString(r.Header.Get("X-AI-SSH-Desktop-Token")), hashString(token)) != 1 {
		return false
	}

	sessionToken, err := generateSessionToken()
	if err != nil {
		a.logger.error("auth", "create desktop web session token failed", map[string]any{"error": err.Error()})
		return false
	}
	expiresAt := time.Now().Add(webAuthTTL)
	a.mu.Lock()
	a.sessions[sessionToken] = webSession{username: a.username, expiresAt: expiresAt}
	a.mu.Unlock()
	writeAuthCookie(w, sessionToken, expiresAt)
	a.logger.info("auth", "desktop web login succeeded", map[string]any{"username": a.username})
	return true
}

func (a *webAuthenticator) logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(webAuthCookieName)
	if err == nil {
		a.mu.Lock()
		delete(a.sessions, cookie.Value)
		a.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{
		Name:     webAuthCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		SameSite: http.SameSiteLaxMode,
		HttpOnly: true,
	})
}

func (a *webAuthenticator) authenticatedUsername(r *http.Request) (string, bool) {
	if !a.enabled {
		return "", true
	}
	cookie, err := r.Cookie(webAuthCookieName)
	if err != nil || cookie.Value == "" {
		return "", false
	}
	now := time.Now()
	a.mu.Lock()
	defer a.mu.Unlock()
	session, ok := a.sessions[cookie.Value]
	if !ok {
		return "", false
	}
	if now.After(session.expiresAt) {
		delete(a.sessions, cookie.Value)
		return "", false
	}
	return session.username, true
}

func (a *webAuthenticator) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isAuthBypassPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
	if _, ok := a.authenticatedUsername(r); ok {
		next.ServeHTTP(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	next.ServeHTTP(w, r)
})
}

func isAuthBypassPath(path string) bool {
	return path == "/health" ||
		path == "/api/health" ||
		path == "/api/auth/status" ||
		path == "/api/auth/login" ||
		path == "/api/auth/desktop" ||
		path == "/api/auth/logout"
}

func generateSessionToken() (string, error) {
	buffer := make([]byte, webAuthTokenBytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func hashString(value string) []byte {
	hash := sha256.Sum256([]byte(value))
	return hash[:]
}

func writeAuthCookie(w http.ResponseWriter, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     webAuthCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		SameSite: http.SameSiteLaxMode,
		HttpOnly: true,
	})
}
