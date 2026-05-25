package server

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/zalando/go-keyring"
)

const (
	credentialService    = "ai-ssh"
	credentialChunkSize  = 1900
	credentialChunkToken = "ai-ssh-chunked:v1:"
)

type credentialKind string

const (
	passwordCredential   credentialKind = "password"
	privateKeyCredential credentialKind = "privateKey"
)

type credentialStore interface {
	Set(hostID string, kind credentialKind, value string) error
	Get(hostID string, kind credentialKind) (string, bool, error)
	Delete(hostID string, kind credentialKind) error
}

type keyringCredentialStore struct{}

func newCredentialStore() credentialStore {
	return keyringCredentialStore{}
}

func (s keyringCredentialStore) Set(hostID string, kind credentialKind, value string) error {
	if value == "" {
		return nil
	}
	if err := s.Delete(hostID, kind); err != nil {
		return err
	}

	if len(value) <= credentialChunkSize {
		if err := keyring.Set(credentialService, credentialUser(hostID, kind), value); err != nil {
			return fmt.Errorf("保存凭据到系统安全存储失败: %w", err)
		}
		return nil
	}

	chunks := splitCredential(value)
	for i, chunk := range chunks {
		if err := keyring.Set(credentialService, credentialChunkUser(hostID, kind, i), chunk); err != nil {
			_ = s.Delete(hostID, kind)
			return fmt.Errorf("保存凭据到系统安全存储失败: %w", err)
		}
	}

	manifest := credentialChunkToken + strconv.Itoa(len(chunks))
	if err := keyring.Set(credentialService, credentialUser(hostID, kind), manifest); err != nil {
		_ = s.Delete(hostID, kind)
		return fmt.Errorf("保存凭据到系统安全存储失败: %w", err)
	}
	return nil
}

func (s keyringCredentialStore) Get(hostID string, kind credentialKind) (string, bool, error) {
	value, err := keyring.Get(credentialService, credentialUser(hostID, kind))
	if errors.Is(err, keyring.ErrNotFound) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("读取系统安全存储凭据失败: %w", err)
	}
	if !strings.HasPrefix(value, credentialChunkToken) {
		return value, true, nil
	}

	chunkCount, err := strconv.Atoi(strings.TrimPrefix(value, credentialChunkToken))
	if err != nil || chunkCount <= 0 {
		return "", false, fmt.Errorf("读取系统安全存储凭据失败: chunk manifest invalid")
	}

	var builder strings.Builder
	for i := 0; i < chunkCount; i++ {
		chunk, err := keyring.Get(credentialService, credentialChunkUser(hostID, kind, i))
		if err != nil {
			return "", false, fmt.Errorf("读取系统安全存储凭据失败: %w", err)
		}
		builder.WriteString(chunk)
	}

	return builder.String(), true, nil
}

func (s keyringCredentialStore) Delete(hostID string, kind credentialKind) error {
	value, err := keyring.Get(credentialService, credentialUser(hostID, kind))
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return fmt.Errorf("删除系统安全存储凭据失败: %w", err)
	}

	if strings.HasPrefix(value, credentialChunkToken) {
		chunkCount, parseErr := strconv.Atoi(strings.TrimPrefix(value, credentialChunkToken))
		if parseErr == nil {
			for i := 0; i < chunkCount; i++ {
				if err := keyring.Delete(credentialService, credentialChunkUser(hostID, kind, i)); err != nil && !errors.Is(err, keyring.ErrNotFound) {
					return fmt.Errorf("删除系统安全存储凭据失败: %w", err)
				}
			}
		}
	}

	if err := keyring.Delete(credentialService, credentialUser(hostID, kind)); err != nil {
		if errors.Is(err, keyring.ErrNotFound) {
			return nil
		}
		return fmt.Errorf("删除系统安全存储凭据失败: %w", err)
	}
	return nil
}

func splitCredential(value string) []string {
	chunks := make([]string, 0, (len(value)/credentialChunkSize)+1)
	for start := 0; start < len(value); start += credentialChunkSize {
		end := start + credentialChunkSize
		if end > len(value) {
			end = len(value)
		}
		chunks = append(chunks, value[start:end])
	}
	return chunks
}

func credentialUser(hostID string, kind credentialKind) string {
	return fmt.Sprintf("%s:%s", hostID, kind)
}

func credentialChunkUser(hostID string, kind credentialKind, index int) string {
	return fmt.Sprintf("%s:%s:%d", hostID, kind, index)
}
