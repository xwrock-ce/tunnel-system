package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidToken = errors.New("invalid token")

type Manager struct {
	secret                []byte
	accessTokenExpiration time.Duration
}

func NewManager(secret string, accessTokenExpireMinutes int) *Manager {
	return &Manager{
		secret:                []byte(secret),
		accessTokenExpiration: time.Duration(accessTokenExpireMinutes) * time.Minute,
	}
}

func HashPassword(password string) (string, error) {
	saltBytes := make([]byte, 16)
	if _, err := rand.Read(saltBytes); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}
	salt := hex.EncodeToString(saltBytes)
	sum := sha256.Sum256([]byte(salt + password))
	return salt + "$" + hex.EncodeToString(sum[:]), nil
}

func VerifyPasswordHash(password, hashed string) bool {
	parts := strings.SplitN(hashed, "$", 2)
	if len(parts) != 2 {
		return false
	}
	salt := parts[0]
	expected := parts[1]
	sum := sha256.Sum256([]byte(salt + password))
	return hex.EncodeToString(sum[:]) == expected
}

func (m *Manager) CreateAccessToken(username string) (string, error) {
	now := time.Now().UTC()
	claims := jwt.RegisteredClaims{
		Subject:   username,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(m.accessTokenExpiration)),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(m.secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return signed, nil
}

func (m *Manager) ParseUsername(tokenString string) (string, error) {
	token, err := jwt.ParseWithClaims(tokenString, &jwt.RegisteredClaims{}, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, ErrInvalidToken
		}
		return m.secret, nil
	})
	if err != nil {
		return "", ErrInvalidToken
	}

	claims, ok := token.Claims.(*jwt.RegisteredClaims)
	if !ok || !token.Valid || claims.Subject == "" {
		return "", ErrInvalidToken
	}
	return claims.Subject, nil
}
