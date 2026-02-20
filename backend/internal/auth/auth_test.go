package auth

import (
	"testing"
	"time"
)

func TestHashAndVerifyPassword(t *testing.T) {
	hashed, err := HashPassword("secret-pass")
	if err != nil {
		t.Fatalf("HashPassword returned error: %v", err)
	}

	if !VerifyPasswordHash("secret-pass", hashed) {
		t.Fatalf("VerifyPasswordHash should accept valid password")
	}

	if VerifyPasswordHash("wrong-pass", hashed) {
		t.Fatalf("VerifyPasswordHash should reject invalid password")
	}
}

func TestJWTLifecycle(t *testing.T) {
	manager := NewManager("test-secret", 1)

	token, err := manager.CreateAccessToken("admin")
	if err != nil {
		t.Fatalf("CreateAccessToken returned error: %v", err)
	}

	username, err := manager.ParseUsername(token)
	if err != nil {
		t.Fatalf("ParseUsername returned error: %v", err)
	}
	if username != "admin" {
		t.Fatalf("expected username admin, got %q", username)
	}

	expiredManager := NewManager("test-secret", -1)
	expiredToken, err := expiredManager.CreateAccessToken("admin")
	if err != nil {
		t.Fatalf("CreateAccessToken for expired token returned error: %v", err)
	}

	// Ensure the token is already expired.
	time.Sleep(10 * time.Millisecond)
	if _, err := manager.ParseUsername(expiredToken); err == nil {
		t.Fatalf("expected expired token to fail validation")
	}
}
