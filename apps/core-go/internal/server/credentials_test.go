package server

import "sync"

type memoryCredentialStore struct {
	mu     sync.Mutex
	values map[string]string
}

func newMemoryCredentialStore() *memoryCredentialStore {
	return &memoryCredentialStore{values: make(map[string]string)}
}

func (s *memoryCredentialStore) Set(hostID string, kind credentialKind, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.values[credentialUser(hostID, kind)] = value
	return nil
}

func (s *memoryCredentialStore) Get(hostID string, kind credentialKind) (string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	value, ok := s.values[credentialUser(hostID, kind)]
	return value, ok, nil
}

func (s *memoryCredentialStore) Delete(hostID string, kind credentialKind) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.values, credentialUser(hostID, kind))
	return nil
}
