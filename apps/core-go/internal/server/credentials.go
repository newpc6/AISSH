package server

import (
	"errors"
	"fmt"

	"github.com/zalando/go-keyring"
)

const credentialService = "ai-ssh"

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
	if err := keyring.Set(credentialService, credentialUser(hostID, kind), value); err != nil {
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
	return value, true, nil
}

func (s keyringCredentialStore) Delete(hostID string, kind credentialKind) error {
	if err := keyring.Delete(credentialService, credentialUser(hostID, kind)); err != nil {
		if errors.Is(err, keyring.ErrNotFound) {
			return nil
		}
		return fmt.Errorf("删除系统安全存储凭据失败: %w", err)
	}
	return nil
}

func credentialUser(hostID string, kind credentialKind) string {
	return fmt.Sprintf("%s:%s", hostID, kind)
}
