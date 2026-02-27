package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

const (
	defaultDBURL = "sqlite+aiosqlite:///./tunnel.db"
)

type Config struct {
	AppName                  string
	AppVersion               string
	Debug                    bool
	APIV1Prefix              string
	SecretKey                string
	AccessTokenExpireMinutes int
	AdminUsername            string
	AdminPassword            string
	BaseDir                  string
	BackendDir               string
	UploadDir                string
	ModelWeightsDir          string
	StaticDir                string
	DatabaseURL              string
	DatabaseDSN              string
	YOLOWeights              string
	CrackYOLOWeights         string
	SAM2BaseCheckpoint       string
	SAM2FinetunedCheckpoint  string
	SAM2Config               string
	ScaleMMPerPixel          float64
	DesignAreaM2             float64
	MaxUploadSize            int64
	AllowedExtensions        map[string]struct{}
	AnalyzerMode             string
	PythonExec               string
}

func Load() (*Config, error) {
	_ = godotenv.Load(".env")
	_ = godotenv.Load(filepath.Join("..", ".env"))

	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("get working directory: %w", err)
	}

	baseDir := strings.TrimSpace(os.Getenv("BASE_DIR"))
	if baseDir == "" {
		baseDir = inferBaseDir(cwd)
	}
	baseDir, err = filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve base dir: %w", err)
	}

	backendDir := filepath.Join(baseDir, "backend")
	if st, statErr := os.Stat(filepath.Join(baseDir, "go.mod")); statErr == nil && !st.IsDir() {
		backendDir = baseDir
		baseDir = filepath.Dir(baseDir)
	}

	databaseURL := envString("DATABASE_URL", defaultDBURL)
	databaseDSN := parseSQLiteDSN(databaseURL, backendDir)
	if err := os.MkdirAll(filepath.Dir(databaseDSN), 0o755); err != nil {
		return nil, fmt.Errorf("prepare database directory: %w", err)
	}

	cfg := &Config{
		AppName:                  envString("APP_NAME", "Tunnel Excavation Detection System"),
		AppVersion:               envString("APP_VERSION", "1.1.0"),
		Debug:                    envBool("DEBUG", false),
		APIV1Prefix:              envString("API_V1_PREFIX", "/api/v1"),
		SecretKey:                envString("SECRET_KEY", "tunnel-excavation-secret-key-change-in-production"),
		AccessTokenExpireMinutes: envInt("ACCESS_TOKEN_EXPIRE_MINUTES", 1440),
		AdminUsername:            envString("ADMIN_USERNAME", "rockxw"),
		AdminPassword:            envString("ADMIN_PASSWORD", "csustxw"),
		BaseDir:                  baseDir,
		BackendDir:               backendDir,
		UploadDir:                filepath.Join(baseDir, "uploads"),
		ModelWeightsDir:          filepath.Join(baseDir, "model_weights"),
		StaticDir:                filepath.Join(baseDir, "static"),
		DatabaseURL:              databaseURL,
		DatabaseDSN:              databaseDSN,
		YOLOWeights:              envString("YOLO_WEIGHTS", "yolo_best.pt"),
		CrackYOLOWeights:         envString("CRACK_YOLO_WEIGHTS", "crack_best.pt"),
		SAM2BaseCheckpoint:       envString("SAM2_BASE_CHECKPOINT", "sam2_base.pt"),
		SAM2FinetunedCheckpoint:  envString("SAM2_FINETUNED_CHECKPOINT", "sam2_finetuned.pt"),
		SAM2Config:               envString("SAM2_CONFIG", "configs/sam2.1/sam2.1_hiera_b+.yaml"),
		ScaleMMPerPixel:          envFloat("SCALE_MM_PER_PIXEL", 7.6),
		DesignAreaM2:             envFloat("DESIGN_AREA_M2", 78.5),
		MaxUploadSize:            envInt64("MAX_UPLOAD_SIZE", 20*1024*1024),
		AllowedExtensions: map[string]struct{}{
			"jpg":  {},
			"jpeg": {},
			"png":  {},
			"bmp":  {},
			"tiff": {},
		},
		AnalyzerMode: strings.ToLower(envString("ANALYZER_MODE", "python")),
		PythonExec:   envString("PYTHON_EXEC", "python3"),
	}

	if err := os.MkdirAll(cfg.UploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("create upload directory: %w", err)
	}
	if err := os.MkdirAll(cfg.StaticDir, 0o755); err != nil {
		return nil, fmt.Errorf("create static directory: %w", err)
	}

	return cfg, nil
}

func inferBaseDir(cwd string) string {
	cur := cwd
	for {
		if _, err := os.Stat(filepath.Join(cur, "docker-compose.yml")); err == nil {
			return cur
		}
		next := filepath.Dir(cur)
		if next == cur {
			break
		}
		cur = next
	}

	if filepath.Base(cwd) == "backend" {
		return filepath.Dir(cwd)
	}

	if _, err := os.Stat(filepath.Join(cwd, "backend")); err == nil {
		return cwd
	}

	return cwd
}

func parseSQLiteDSN(rawURL, backendDir string) string {
	raw := strings.TrimSpace(rawURL)
	if raw == "" {
		raw = defaultDBURL
	}

	path := raw
	for _, prefix := range []string{"sqlite+aiosqlite:///", "sqlite:///"} {
		if strings.HasPrefix(path, prefix) {
			path = strings.TrimPrefix(path, prefix)
			break
		}
	}
	path = strings.TrimSpace(path)
	if path == "" {
		path = "./tunnel.db"
	}

	if !filepath.IsAbs(path) {
		path = filepath.Join(backendDir, path)
	}
	return filepath.Clean(path)
}

func envString(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envInt64(key string, fallback int64) int64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func envFloat(key string, fallback float64) float64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}
