package server

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
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
	Enabled              bool
	Initialized          bool
	Username             string
	Password             string
	DesktopLoginRequired bool
}

type webLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type webAuthStatusResponse struct {
	Authenticated        bool   `json:"authenticated"`
	Username             string `json:"username,omitempty"`
	Enabled              bool   `json:"enabled"`
	Initialized          bool   `json:"initialized"`
	DesktopLoginRequired bool   `json:"desktopLoginRequired"`
}

type webAuthSetupRequest struct {
	Username             string `json:"username"`
	Password             string `json:"password"`
	DesktopLoginRequired bool   `json:"desktopLoginRequired"`
}

type webAuthSettingsRequest struct {
	DesktopLoginRequired bool `json:"desktopLoginRequired"`
}

type webAuthSettingsResponse struct {
	DesktopLoginRequired bool `json:"desktopLoginRequired"`
}

type webAuthStoreFile struct {
	Username             string `json:"username"`
	Password             string `json:"password"`
	DesktopLoginRequired bool   `json:"desktopLoginRequired"`
}

type webSession struct {
	username  string
	expiresAt time.Time
}

type webAuthenticator struct {
	mu                   sync.Mutex
	enabled              bool
	initialized          bool
	username             string
	password             string
	desktopLoginRequired bool
	configPath           string
	sessions             map[string]webSession
	logger               *appLogger
}

func newWebAuthenticator(logger *appLogger) *webAuthenticator {
	config := loadWebAuthConfig(logger)
	return &webAuthenticator{
		enabled:              config.Enabled,
		initialized:          config.Initialized,
		username:             config.Username,
		password:             config.Password,
		desktopLoginRequired: config.DesktopLoginRequired,
		configPath:           webAuthConfigPath(),
		sessions:             map[string]webSession{},
		logger:               logger,
	}
}

func loadWebAuthConfig(logger *appLogger) webAuthConfig {
	enabledValue := strings.ToLower(strings.TrimSpace(os.Getenv("AI_SSH_WEB_AUTH")))
	if enabledValue == "0" || enabledValue == "false" || enabledValue == "off" {
		logger.warn("auth", "web auth disabled by AI_SSH_WEB_AUTH", nil)
		return webAuthConfig{Enabled: false, Initialized: true}
	}

	username := strings.TrimSpace(os.Getenv("AI_SSH_WEB_USER"))
	password := os.Getenv("AI_SSH_WEB_PASSWORD")
	desktopLoginRequired := parseBoolEnv("AI_SSH_DESKTOP_LOGIN_REQUIRED", false)
	if username == "" {
		username = "admin"
	}
	if password != "" {
		return webAuthConfig{
			Enabled:              true,
			Initialized:          true,
			Username:             username,
			Password:             password,
			DesktopLoginRequired: desktopLoginRequired,
		}
	}

	configPath := webAuthConfigPath()
	if config, err := readWebAuthStore(configPath); err == nil && config.Password != "" {
		if strings.TrimSpace(config.Username) != "" {
			username = strings.TrimSpace(config.Username)
		}
		logger.info("auth", "loaded web auth password from local store", map[string]any{"path": configPath, "username": username})
		return webAuthConfig{
			Enabled:              true,
			Initialized:          true,
			Username:             username,
			Password:             config.Password,
			DesktopLoginRequired: config.DesktopLoginRequired,
		}
	}

	logger.warn("auth", "web auth is not initialized; waiting for user setup", map[string]any{"path": configPath, "username": username})
	return webAuthConfig{
		Enabled:              true,
		Initialized:          false,
		Username:             username,
		DesktopLoginRequired: desktopLoginRequired,
	}
}

func parseBoolEnv(name string, defaultValue bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(name)))
	if value == "" {
		return defaultValue
	}
	return value == "1" || value == "true" || value == "on" || value == "yes"
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
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(config)
}

func (a *webAuthenticator) status(r *http.Request) webAuthStatusResponse {
	a.mu.Lock()
	enabled := a.enabled
	initialized := a.initialized
	username := a.username
	desktopLoginRequired := a.desktopLoginRequired
	a.mu.Unlock()

	if !enabled {
		return webAuthStatusResponse{Authenticated: true, Enabled: false, Initialized: true, DesktopLoginRequired: false}
	}
	if !initialized {
		return webAuthStatusResponse{
			Authenticated:        false,
			Username:             username,
			Enabled:              true,
			Initialized:          false,
			DesktopLoginRequired: desktopLoginRequired,
		}
	}
	authenticatedUsername, ok := a.authenticatedUsername(r)
	if !ok {
		authenticatedUsername = username
	}
	return webAuthStatusResponse{
		Authenticated:        ok,
		Username:             authenticatedUsername,
		Enabled:              true,
		Initialized:          true,
		DesktopLoginRequired: desktopLoginRequired,
	}
}

func (a *webAuthenticator) setup(w http.ResponseWriter, request webAuthSetupRequest) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if !a.enabled {
		writeAuthCookie(w, "disabled", time.Now().Add(webAuthTTL))
		return nil
	}
	if a.initialized {
		return errWebAuthAlreadyInitialized
	}
	username := strings.TrimSpace(request.Username)
	if username == "" {
		username = "admin"
	}
	if strings.TrimSpace(request.Password) == "" {
		return errWebAuthPasswordRequired
	}

	config := webAuthStoreFile{
		Username:             username,
		Password:             request.Password,
		DesktopLoginRequired: request.DesktopLoginRequired,
	}
	if err := writeWebAuthStore(a.configPath, config); err != nil {
		return err
	}

	a.username = username
	a.password = request.Password
	a.desktopLoginRequired = request.DesktopLoginRequired
	a.initialized = true
	a.logger.info("auth", "web auth initialized", map[string]any{
		"path":                 a.configPath,
		"username":             username,
		"desktopLoginRequired": request.DesktopLoginRequired,
	})
	return a.createSessionLocked(w, username, "setup")
}

func (a *webAuthenticator) setupFromDesktop(w http.ResponseWriter, r *http.Request, request webAuthSetupRequest) error {
	if !a.desktopAuthenticated(r) {
		return errWebAuthDesktopTokenInvalid
	}
	return a.setup(w, request)
}

var (
	errWebAuthAlreadyInitialized = &webAuthError{message: "登录密码已经初始化"}
	errWebAuthPasswordRequired   = &webAuthError{message: "密码不能为空"}
)

type webAuthError struct {
	message string
}

func (e *webAuthError) Error() string {
	return e.message
}

func (a *webAuthenticator) login(w http.ResponseWriter, request webLoginRequest) bool {
	if !a.enabled {
		writeAuthCookie(w, "disabled", time.Now().Add(webAuthTTL))
		return true
	}
	a.mu.Lock()
	initialized := a.initialized
	username := a.username
	password := a.password
	a.mu.Unlock()

	if !initialized {
		return false
	}

	usernameMatches := subtle.ConstantTimeCompare([]byte(strings.TrimSpace(request.Username)), []byte(username)) == 1
	passwordMatches := subtle.ConstantTimeCompare(hashString(request.Password), hashString(password)) == 1
	if !usernameMatches || !passwordMatches {
		return false
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.createSessionLocked(w, username, "web"); err != nil {
		a.logger.error("auth", "create web session token failed", map[string]any{"error": err.Error()})
		return false
	}
	return true
}

func (a *webAuthenticator) settings(r *http.Request) (webAuthSettingsResponse, bool) {
	if !a.requestAuthenticated(r) {
		return webAuthSettingsResponse{}, false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return webAuthSettingsResponse{DesktopLoginRequired: a.desktopLoginRequired}, true
}

func (a *webAuthenticator) updateSettings(r *http.Request, request webAuthSettingsRequest) (webAuthSettingsResponse, bool, error) {
	if !a.requestAuthenticated(r) {
		return webAuthSettingsResponse{}, false, nil
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.enabled || !a.initialized {
		return webAuthSettingsResponse{DesktopLoginRequired: false}, true, nil
	}
	config := webAuthStoreFile{
		Username:             a.username,
		Password:             a.password,
		DesktopLoginRequired: request.DesktopLoginRequired,
	}
	if err := writeWebAuthStore(a.configPath, config); err != nil {
		return webAuthSettingsResponse{}, true, err
	}
	a.desktopLoginRequired = request.DesktopLoginRequired
	a.logger.info("auth", "auth settings updated", map[string]any{"desktopLoginRequired": request.DesktopLoginRequired})
	return webAuthSettingsResponse{DesktopLoginRequired: a.desktopLoginRequired}, true, nil
}

func (a *webAuthenticator) createSessionLocked(w http.ResponseWriter, username string, source string) error {
	token, err := generateSessionToken()
	if err != nil {
		return err
	}
	expiresAt := time.Now().Add(webAuthTTL)
	a.sessions[token] = webSession{username: username, expiresAt: expiresAt}
	writeAuthCookie(w, token, expiresAt)
	a.logger.info("auth", "login session created", map[string]any{"username": username, "source": source})
	return nil
}

func (a *webAuthenticator) desktopLogin(w http.ResponseWriter, r *http.Request) bool {
	if !a.enabled {
		writeAuthCookie(w, "disabled", time.Now().Add(webAuthTTL))
		return true
	}
	a.mu.Lock()
	initialized := a.initialized
	username := a.username
	desktopLoginRequired := a.desktopLoginRequired
	a.mu.Unlock()

	if !initialized {
		return false
	}
	if desktopLoginRequired {
		return false
	}

	token := os.Getenv("AI_SSH_DESKTOP_TOKEN")
	if token == "" || subtle.ConstantTimeCompare(hashString(r.Header.Get("X-AI-SSH-Desktop-Token")), hashString(token)) != 1 {
		return false
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.createSessionLocked(w, username, "desktop"); err != nil {
		a.logger.error("auth", "create desktop web session token failed", map[string]any{"error": err.Error()})
		return false
	}
	return true
}

var errWebAuthDesktopTokenInvalid = &webAuthError{message: "desktop token invalid"}

func (a *webAuthenticator) desktopAuthenticated(r *http.Request) bool {
	token := os.Getenv("AI_SSH_DESKTOP_TOKEN")
	return token != "" && subtle.ConstantTimeCompare(hashString(r.Header.Get("X-AI-SSH-Desktop-Token")), hashString(token)) == 1
}

func (a *webAuthenticator) desktopRequestAllowed(r *http.Request) bool {
	a.mu.Lock()
	enabled := a.enabled
	initialized := a.initialized
	desktopLoginRequired := a.desktopLoginRequired
	a.mu.Unlock()
	if !enabled {
		return true
	}
	return initialized && !desktopLoginRequired && a.desktopAuthenticated(r)
}

func (a *webAuthenticator) requestAuthenticated(r *http.Request) bool {
	if _, ok := a.authenticatedUsername(r); ok {
		return true
	}
	return a.desktopRequestAllowed(r)
}

func (a *webAuthenticator) desktopLoginIfAllowed(w http.ResponseWriter, r *http.Request) bool {
	if !a.desktopRequestAllowed(r) {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.enabled {
		writeAuthCookie(w, "disabled", time.Now().Add(webAuthTTL))
		return true
	}
	if err := a.createSessionLocked(w, a.username, "desktop"); err != nil {
		a.logger.error("auth", "create desktop session failed", map[string]any{"error": err.Error()})
		return false
	}
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
	a.mu.Lock()
	if !a.initialized {
		a.mu.Unlock()
		return a.username, false
	}
	a.mu.Unlock()
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
		if a.requestAuthenticated(r) {
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
		path == "/api/auth/setup" ||
		path == "/api/auth/desktop-setup" ||
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
