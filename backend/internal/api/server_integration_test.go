package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"tunnel-system/backend/internal/analyzer"
	"tunnel-system/backend/internal/auth"
	"tunnel-system/backend/internal/config"
	"tunnel-system/backend/internal/db"
	"tunnel-system/backend/internal/service"
	"tunnel-system/backend/internal/ws"
)

func TestEndToEndAPIFlow(t *testing.T) {
	testServer, cfg := setupTestServer(t)
	defer testServer.Close()

	token := loginAndGetToken(t, testServer.URL)

	analysisID := createAnalysisTask(t, testServer.URL, token)
	analysis := waitForAnalysisCompletion(t, testServer.URL, token, analysisID)

	if analysis.Status != "completed" {
		t.Fatalf("expected completed analysis status, got %q", analysis.Status)
	}
	if analysis.Excavation == nil {
		t.Fatalf("expected excavation payload for full analysis")
	}
	if analysis.Metrics == nil {
		t.Fatalf("expected metrics payload for completed analysis")
	}

	imageResp, err := http.Get(fmt.Sprintf("%s/api/v1/analysis/%d/image/original", testServer.URL, analysisID))
	if err != nil {
		t.Fatalf("failed to get original image: %v", err)
	}
	defer imageResp.Body.Close()
	if imageResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from image endpoint, got %d", imageResp.StatusCode)
	}

	listResp := doAuthorizedRequest(t, token, http.MethodGet, fmt.Sprintf("%s/api/v1/analysis?page=1&limit=20", testServer.URL), nil)
	defer listResp.Body.Close()
	if listResp.StatusCode != http.StatusOK {
		t.Fatalf("expected list endpoint status 200, got %d", listResp.StatusCode)
	}
	var listBody struct {
		Total int64 `json:"total"`
		Items []struct {
			ID uint `json:"id"`
		} `json:"items"`
	}
	decodeJSON(t, listResp, &listBody)
	if listBody.Total < 1 || len(listBody.Items) < 1 {
		t.Fatalf("expected at least one analysis item, total=%d len(items)=%d", listBody.Total, len(listBody.Items))
	}

	statsResp := doAuthorizedRequest(t, token, http.MethodGet, fmt.Sprintf("%s/api/v1/analysis/stats/dashboard", testServer.URL), nil)
	defer statsResp.Body.Close()
	if statsResp.StatusCode != http.StatusOK {
		t.Fatalf("expected stats endpoint status 200, got %d", statsResp.StatusCode)
	}
	var statsBody struct {
		TotalAnalyses int64 `json:"total_analyses"`
	}
	decodeJSON(t, statsResp, &statsBody)
	if statsBody.TotalAnalyses < 1 {
		t.Fatalf("expected total analyses >= 1, got %d", statsBody.TotalAnalyses)
	}

	trendResp := doAuthorizedRequest(t, token, http.MethodGet, fmt.Sprintf("%s/api/v1/analysis/stats/trend?limit=5", testServer.URL), nil)
	defer trendResp.Body.Close()
	if trendResp.StatusCode != http.StatusOK {
		t.Fatalf("expected trend endpoint status 200, got %d", trendResp.StatusCode)
	}

	distributionResp := doAuthorizedRequest(t, token, http.MethodGet, fmt.Sprintf("%s/api/v1/analysis/stats/distribution", testServer.URL), nil)
	defer distributionResp.Body.Close()
	if distributionResp.StatusCode != http.StatusOK {
		t.Fatalf("expected distribution endpoint status 200, got %d", distributionResp.StatusCode)
	}

	systemResp := doAuthorizedRequest(t, token, http.MethodGet, fmt.Sprintf("%s/api/v1/system/status", testServer.URL), nil)
	defer systemResp.Body.Close()
	if systemResp.StatusCode != http.StatusOK {
		t.Fatalf("expected system status endpoint 200, got %d", systemResp.StatusCode)
	}
	var systemBody struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	decodeJSON(t, systemResp, &systemBody)
	if len(systemBody.Models) != 3 {
		t.Fatalf("expected 3 model status entries, got %d", len(systemBody.Models))
	}

	deleteResp := doAuthorizedRequest(t, token, http.MethodDelete, fmt.Sprintf("%s/api/v1/analysis/%d", testServer.URL, analysisID), nil)
	defer deleteResp.Body.Close()
	if deleteResp.StatusCode != http.StatusOK {
		t.Fatalf("expected delete endpoint status 200, got %d", deleteResp.StatusCode)
	}

	// After deletion, image should be unavailable.
	imageRespAfterDelete, err := http.Get(fmt.Sprintf("%s/api/v1/analysis/%d/image/original", testServer.URL, analysisID))
	if err != nil {
		t.Fatalf("failed to query image after delete: %v", err)
	}
	defer imageRespAfterDelete.Body.Close()
	if imageRespAfterDelete.StatusCode != http.StatusNotFound {
		t.Fatalf("expected image endpoint 404 after delete, got %d", imageRespAfterDelete.StatusCode)
	}

	if _, err := os.Stat(cfg.UploadDir); err != nil {
		t.Fatalf("upload directory should remain available: %v", err)
	}
}

func setupTestServer(t *testing.T) (*httptest.Server, *config.Config) {
	t.Helper()

	baseDir := t.TempDir()
	backendDir := filepath.Join(baseDir, "backend")
	uploadDir := filepath.Join(baseDir, "uploads")
	staticDir := filepath.Join(baseDir, "static")
	modelDir := filepath.Join(baseDir, "model_weights")
	dbPath := filepath.Join(backendDir, "tunnel.db")

	for _, dir := range []string{backendDir, uploadDir, staticDir, modelDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("failed to create directory %s: %v", dir, err)
		}
	}

	cfg := &config.Config{
		AppName:                  "Tunnel Excavation Detection System",
		AppVersion:               "1.1.0",
		Debug:                    false,
		APIV1Prefix:              "/api/v1",
		SecretKey:                "test-secret",
		AccessTokenExpireMinutes: 60,
		AdminUsername:            "admin",
		AdminPassword:            "admin123",
		BaseDir:                  baseDir,
		BackendDir:               backendDir,
		UploadDir:                uploadDir,
		ModelWeightsDir:          modelDir,
		StaticDir:                staticDir,
		DatabaseURL:              "sqlite+aiosqlite:///./tunnel.db",
		DatabaseDSN:              dbPath,
		YOLOWeights:              "yolo_best.pt",
		CrackYOLOWeights:         "crack_best.pt",
		SAM2BaseCheckpoint:       "sam2_base.pt",
		SAM2FinetunedCheckpoint:  "sam2_finetuned.pt",
		SAM2Config:               "configs/sam2.1/sam2.1_hiera_b+.yaml",
		ScaleMMPerPixel:          7.6,
		DesignAreaM2:             78.5,
		MaxUploadSize:            20 * 1024 * 1024,
		AllowedExtensions: map[string]struct{}{
			"jpg":  {},
			"jpeg": {},
			"png":  {},
			"bmp":  {},
			"tiff": {},
		},
		AnalyzerMode: "mock",
		PythonExec:   "python3",
	}

	database, err := db.Open(cfg)
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}

	authManager := auth.NewManager(cfg.SecretKey, cfg.AccessTokenExpireMinutes)
	analysisEngine := analyzer.NewMockAnalyzer()
	hub := ws.NewHub()
	analysisService := service.NewAnalysisService(database, cfg, analysisEngine, hub)
	server := NewServer(cfg, database, authManager, analysisService, hub, analysisEngine)

	return httptest.NewServer(server.Router()), cfg
}

func loginAndGetToken(t *testing.T, baseURL string) string {
	t.Helper()

	payload := strings.NewReader(`{"username":"admin","password":"admin123"}`)
	resp, err := http.Post(baseURL+"/api/v1/auth/login", "application/json", payload)
	if err != nil {
		t.Fatalf("login request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected login status 200, got %d", resp.StatusCode)
	}

	var body struct {
		AccessToken string `json:"access_token"`
	}
	decodeJSON(t, resp, &body)
	if body.AccessToken == "" {
		t.Fatalf("expected access_token in login response")
	}
	return body.AccessToken
}

func createAnalysisTask(t *testing.T, baseURL, token string) uint {
	t.Helper()

	var payload bytes.Buffer
	writer := multipart.NewWriter(&payload)

	formFile, err := writer.CreateFormFile("image", "sample.png")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	if _, err := formFile.Write(createSamplePNG(t)); err != nil {
		t.Fatalf("failed to write sample image to multipart payload: %v", err)
	}

	if err := writer.WriteField("analysis_type", "full"); err != nil {
		t.Fatalf("failed to write analysis_type field: %v", err)
	}
	if err := writer.WriteField("design_area", "78.5"); err != nil {
		t.Fatalf("failed to write design_area field: %v", err)
	}
	if err := writer.WriteField("scale", "7.6"); err != nil {
		t.Fatalf("failed to write scale field: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, baseURL+"/api/v1/analysis", &payload)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("create analysis request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected create analysis status 200, got %d", resp.StatusCode)
	}

	var body struct {
		ID uint `json:"id"`
	}
	decodeJSON(t, resp, &body)
	if body.ID == 0 {
		t.Fatalf("expected non-zero analysis id")
	}
	return body.ID
}

func waitForAnalysisCompletion(t *testing.T, baseURL, token string, analysisID uint) analysisResponse {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		resp := doAuthorizedRequest(t, token, http.MethodGet, fmt.Sprintf("%s/api/v1/analysis/%d", baseURL, analysisID), nil)
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			t.Fatalf("expected get analysis status 200, got %d", resp.StatusCode)
		}

		var body analysisResponse
		decodeJSON(t, resp, &body)
		resp.Body.Close()

		if body.Status == "completed" {
			return body
		}
		if body.Status == "failed" {
			t.Fatalf("analysis failed unexpectedly: %v", body.ErrorMessage)
		}

		time.Sleep(50 * time.Millisecond)
	}

	t.Fatalf("analysis did not complete within timeout")
	return analysisResponse{}
}

func doAuthorizedRequest(t *testing.T, token, method, url string, body *bytes.Buffer) *http.Response {
	t.Helper()

	var reader io.Reader
	if body != nil {
		reader = body
	}

	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	return resp
}

func createSamplePNG(t *testing.T) []byte {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, 120, 80))
	for y := 0; y < 80; y++ {
		for x := 0; x < 120; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 180, A: 255})
		}
	}

	buf := bytes.Buffer{}
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode sample png: %v", err)
	}
	return buf.Bytes()
}

func decodeJSON(t *testing.T, resp *http.Response, target interface{}) {
	t.Helper()
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		t.Fatalf("failed to decode json response: %v", err)
	}
}
