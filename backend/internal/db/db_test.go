package db

import (
	"path/filepath"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tunnel-system/backend/internal/auth"
	"tunnel-system/backend/internal/models"
)

func setupDBForAdminTests(t *testing.T) *gorm.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "test.db")
	database, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	if err := runMigrations(database); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	return database
}

func TestEnsureAdminUserCreatesNewConfiguredAdmin(t *testing.T) {
	database := setupDBForAdminTests(t)

	if err := ensureAdminUser(database, "rockxw", "csustxw"); err != nil {
		t.Fatalf("ensure admin user: %v", err)
	}

	var user models.User
	if err := database.Where("username = ?", "rockxw").First(&user).Error; err != nil {
		t.Fatalf("query configured admin: %v", err)
	}

	if !user.IsActive {
		t.Fatalf("expected configured admin to be active")
	}
	if !auth.VerifyPasswordHash("csustxw", user.PasswordHash) {
		t.Fatalf("expected configured admin password to match")
	}
}

func TestEnsureAdminUserSyncsExistingAdminCredentials(t *testing.T) {
	database := setupDBForAdminTests(t)

	oldHash, err := auth.HashPassword("old-password")
	if err != nil {
		t.Fatalf("hash old password: %v", err)
	}
	existing := models.User{
		Username:     "rockxw",
		PasswordHash: oldHash,
		IsActive:     false,
	}
	if err := database.Create(&existing).Error; err != nil {
		t.Fatalf("create existing admin: %v", err)
	}

	if err := ensureAdminUser(database, "rockxw", "new-password"); err != nil {
		t.Fatalf("ensure admin user: %v", err)
	}

	var user models.User
	if err := database.Where("username = ?", "rockxw").First(&user).Error; err != nil {
		t.Fatalf("query configured admin: %v", err)
	}

	if !user.IsActive {
		t.Fatalf("expected configured admin to be reactivated")
	}
	if !auth.VerifyPasswordHash("new-password", user.PasswordHash) {
		t.Fatalf("expected configured admin password to be updated")
	}
}

func TestEnsureAdminUserDeactivatesLegacyDefaultAdmin(t *testing.T) {
	database := setupDBForAdminTests(t)

	defaultHash, err := auth.HashPassword(legacyDefaultAdminPassword)
	if err != nil {
		t.Fatalf("hash legacy password: %v", err)
	}
	legacy := models.User{
		Username:     legacyDefaultAdminUsername,
		PasswordHash: defaultHash,
		IsActive:     true,
	}
	if err := database.Create(&legacy).Error; err != nil {
		t.Fatalf("create legacy admin: %v", err)
	}

	if err := ensureAdminUser(database, "rockxw", "csustxw"); err != nil {
		t.Fatalf("ensure admin user: %v", err)
	}

	var user models.User
	if err := database.Where("username = ?", legacyDefaultAdminUsername).First(&user).Error; err != nil {
		t.Fatalf("query legacy admin: %v", err)
	}

	if user.IsActive {
		t.Fatalf("expected legacy default admin to be deactivated")
	}
}

func TestEnsureAdminUserKeepsLegacyAdminWhenStillConfigured(t *testing.T) {
	database := setupDBForAdminTests(t)

	if err := ensureAdminUser(database, legacyDefaultAdminUsername, legacyDefaultAdminPassword); err != nil {
		t.Fatalf("ensure legacy configured admin: %v", err)
	}

	var user models.User
	if err := database.Where("username = ?", legacyDefaultAdminUsername).First(&user).Error; err != nil {
		t.Fatalf("query legacy admin: %v", err)
	}

	if !user.IsActive {
		t.Fatalf("expected legacy admin to remain active when still configured")
	}
	if !auth.VerifyPasswordHash(legacyDefaultAdminPassword, user.PasswordHash) {
		t.Fatalf("expected legacy admin password to remain valid")
	}
}
