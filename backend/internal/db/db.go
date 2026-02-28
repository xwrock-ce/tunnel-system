package db

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tunnel-system/backend/internal/auth"
	"tunnel-system/backend/internal/config"
	"tunnel-system/backend/internal/models"
)

const (
	legacyDefaultAdminUsername = "admin"
	legacyDefaultAdminPassword = "admin123"
)

func Open(cfg *config.Config) (*gorm.DB, error) {
	gormLogger := logger.Default.LogMode(logger.Silent)
	if cfg.Debug {
		gormLogger = logger.Default.LogMode(logger.Info)
	}

	db, err := gorm.Open(sqlite.Open(cfg.DatabaseDSN), &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("get sql db: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetConnMaxLifetime(10 * time.Minute)

	if err := runMigrations(db); err != nil {
		return nil, fmt.Errorf("migrate sqlite schema: %w", err)
	}

	if err := ensureAdminUser(db, cfg.AdminUsername, cfg.AdminPassword); err != nil {
		return nil, err
	}

	return db, nil
}

func ensureAdminUser(db *gorm.DB, username, password string) error {
	var existing models.User
	err := db.Where("username = ?", username).First(&existing).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("query admin user: %w", err)
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		hash, hashErr := auth.HashPassword(password)
		if hashErr != nil {
			return fmt.Errorf("hash admin password: %w", hashErr)
		}

		admin := models.User{
			Username:     username,
			PasswordHash: hash,
			IsActive:     true,
		}
		if createErr := db.Create(&admin).Error; createErr != nil {
			return fmt.Errorf("create admin user: %w", createErr)
		}
	} else {
		needResetPassword := !auth.VerifyPasswordHash(password, existing.PasswordHash)
		needActivateUser := !existing.IsActive
		if needResetPassword || needActivateUser {
			hash, hashErr := auth.HashPassword(password)
			if hashErr != nil {
				return fmt.Errorf("hash admin password: %w", hashErr)
			}

			updates := map[string]interface{}{
				"password_hash": hash,
				"is_active":     true,
			}
			if updateErr := db.Model(&existing).Updates(updates).Error; updateErr != nil {
				return fmt.Errorf("update admin user: %w", updateErr)
			}
		}
	}

	if err := deactivateLegacyDefaultAdminIfNeeded(db, username, password); err != nil {
		return err
	}
	return nil
}

func deactivateLegacyDefaultAdminIfNeeded(db *gorm.DB, configuredUsername, configuredPassword string) error {
	if configuredUsername == legacyDefaultAdminUsername && configuredPassword == legacyDefaultAdminPassword {
		return nil
	}

	var legacyAdmin models.User
	err := db.Where("username = ?", legacyDefaultAdminUsername).First(&legacyAdmin).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("query legacy admin user: %w", err)
	}
	if !legacyAdmin.IsActive {
		return nil
	}
	if !auth.VerifyPasswordHash(legacyDefaultAdminPassword, legacyAdmin.PasswordHash) {
		return nil
	}

	if err := db.Model(&legacyAdmin).Update("is_active", false).Error; err != nil {
		return fmt.Errorf("deactivate legacy admin user: %w", err)
	}

	return nil
}

func runMigrations(db *gorm.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username VARCHAR(50) NOT NULL UNIQUE,
			password_hash VARCHAR(128) NOT NULL,
			is_active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`,
		`CREATE TABLE IF NOT EXISTS analyses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			analysis_type VARCHAR(20) DEFAULT 'full',
			original_image VARCHAR(255) NOT NULL,
			mask_image VARCHAR(255),
			overlay_image VARCHAR(255),
			crack_mask_image VARCHAR(255),
			crack_overlay_image VARCHAR(255),
			combined_overlay_image VARCHAR(255),
			status VARCHAR(20) DEFAULT 'pending',
			pixel_count INTEGER,
			actual_area_m2 FLOAT,
			design_area_m2 FLOAT,
			scale_mm_per_pixel FLOAT,
			difference_m2 FLOAT,
			difference_percent FLOAT,
			excavation_status VARCHAR(20),
			confidence FLOAT,
			iou FLOAT,
			crack_count INTEGER,
			crack_pixel_count INTEGER,
			crack_confidence FLOAT,
			error_message TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			completed_at DATETIME,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);`,
		`CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);`,
		`CREATE INDEX IF NOT EXISTS idx_analyses_excavation_status ON analyses(excavation_status);`,
	}

	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return err
		}
	}

	if err := ensureAnalysisColumns(db); err != nil {
		return err
	}
	if err := db.Exec(`UPDATE users SET is_active = 1 WHERE is_active IS NULL`).Error; err != nil {
		return err
	}
	return nil
}

func ensureAnalysisColumns(db *gorm.DB) error {
	type columnMigration struct {
		name string
		ddl  string
	}
	migrations := []columnMigration{
		{name: "analysis_type", ddl: "VARCHAR(20) DEFAULT 'full'"},
		{name: "scale_mm_per_pixel", ddl: "FLOAT"},
		{name: "crack_mask_image", ddl: "VARCHAR(255)"},
		{name: "crack_overlay_image", ddl: "VARCHAR(255)"},
		{name: "combined_overlay_image", ddl: "VARCHAR(255)"},
		{name: "crack_count", ddl: "INTEGER"},
		{name: "crack_pixel_count", ddl: "INTEGER"},
		{name: "crack_confidence", ddl: "FLOAT"},
	}

	for _, migration := range migrations {
		if db.Migrator().HasColumn(&models.Analysis{}, migration.name) {
			continue
		}
		statement := fmt.Sprintf("ALTER TABLE analyses ADD COLUMN %s %s", migration.name, migration.ddl)
		if err := db.Exec(statement).Error; err != nil {
			return err
		}
	}
	return nil
}
