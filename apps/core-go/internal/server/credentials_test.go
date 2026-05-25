package server

import (
	"strconv"
	"strings"
	"sync"
	"testing"
)

type memoryCredentialStore struct {
	mu     sync.Mutex
	values map[string]string
}

func TestSplitCredential(t *testing.T) {
	value := strings.Repeat("x", credentialChunkSize*2+7)
	chunks := splitCredential(value)

	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks, got %d", len(chunks))
	}
	if strings.Join(chunks, "") != value {
		t.Fatal("expected chunks to rebuild original credential")
	}
	for i, chunk := range chunks[:2] {
		if len(chunk) != credentialChunkSize {
			t.Fatalf("expected chunk %d length %d, got %d", i, credentialChunkSize, len(chunk))
		}
	}
}

func newMemoryCredentialStore() *memoryCredentialStore {
	return &memoryCredentialStore{values: make(map[string]string)}
}

func (s *memoryCredentialStore) Set(hostID string, kind credentialKind, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deleteLocked(hostID, kind)

	if len(value) <= credentialChunkSize {
		s.values[credentialUser(hostID, kind)] = value
		return nil
	}

	chunks := splitCredential(value)
	for i, chunk := range chunks {
		s.values[credentialChunkUser(hostID, kind, i)] = chunk
	}
	s.values[credentialUser(hostID, kind)] = credentialChunkToken + strconv.Itoa(len(chunks))
	return nil
}

func (s *memoryCredentialStore) Get(hostID string, kind credentialKind) (string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	value, ok := s.values[credentialUser(hostID, kind)]
	if !ok {
		return "", false, nil
	}
	if !strings.HasPrefix(value, credentialChunkToken) {
		return value, true, nil
	}

	chunkCount, err := strconv.Atoi(strings.TrimPrefix(value, credentialChunkToken))
	if err != nil {
		return "", false, err
	}
	var builder strings.Builder
	for i := 0; i < chunkCount; i++ {
		builder.WriteString(s.values[credentialChunkUser(hostID, kind, i)])
	}
	return builder.String(), true, nil
}

func (s *memoryCredentialStore) Delete(hostID string, kind credentialKind) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deleteLocked(hostID, kind)
	return nil
}

func (s *memoryCredentialStore) deleteLocked(hostID string, kind credentialKind) {
	value := s.values[credentialUser(hostID, kind)]
	if strings.HasPrefix(value, credentialChunkToken) {
		chunkCount, err := strconv.Atoi(strings.TrimPrefix(value, credentialChunkToken))
		if err == nil {
			for i := 0; i < chunkCount; i++ {
				delete(s.values, credentialChunkUser(hostID, kind, i))
			}
		}
	}
	delete(s.values, credentialUser(hostID, kind))
}
