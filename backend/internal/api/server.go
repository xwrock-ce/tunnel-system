package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/mem"
	"gorm.io/gorm"

	"tunnel-system/backend/internal/analyzer"
	"tunnel-system/backend/internal/auth"
	"tunnel-system/backend/internal/config"
	"tunnel-system/backend/internal/models"
	"tunnel-system/backend/internal/service"
	"tunnel-system/backend/internal/ws"
)

type contextKey string

const userContextKey contextKey = "current_user"

type Server struct {
	cfg             *config.Config
	db              *gorm.DB
	authManager     *auth.Manager
	analysisService *service.AnalysisService
	hub             *ws.Hub
	analyzer        analyzer.Interface
	startedAt       time.Time
}

func NewServer(
	cfg *config.Config,
	db *gorm.DB,
	authManager *auth.Manager,
	analysisService *service.AnalysisService,
	hub *ws.Hub,
	analyzer analyzer.Interface,
) *Server {
	return &Server{
		cfg:             cfg,
		db:              db,
		authManager:     authManager,
		analysisService: analysisService,
		hub:             hub,
		analyzer:        analyzer,
		startedAt:       time.Now(),
	}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(s.corsMiddleware)

	r.Get("/", s.handleRoot)
	r.Get("/health", s.handleHealth)
	r.Handle("/static/*", http.StripPrefix("/static/", http.FileServer(http.Dir(s.cfg.StaticDir))))

	r.Route(s.cfg.APIV1Prefix, func(r chi.Router) {
		r.Get("/health", s.handleHealth)

		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", s.handleLogin)
			r.Post("/token", s.handleToken)
			r.With(s.authMiddleware).Get("/me", s.handleGetMe)
		})

		r.Route("/analysis", func(r chi.Router) {
			r.Get("/ws/{analysisID}", s.handleAnalysisWebSocket)
			r.Get("/{analysisID}/image/{imageType}", s.handleAnalysisImage)

			r.With(s.authMiddleware).Post("/", s.handleCreateAnalysis)
			r.With(s.authMiddleware).Post("/batch", s.handleCreateBatchAnalysis)
			r.With(s.authMiddleware).Get("/", s.handleListAnalyses)
			r.With(s.authMiddleware).Get("/stats/dashboard", s.handleDashboardStats)
			r.With(s.authMiddleware).Get("/stats/trend", s.handleTrendData)
			r.With(s.authMiddleware).Get("/stats/distribution", s.handleDeviationDistribution)
			r.With(s.authMiddleware).Get("/{analysisID}", s.handleGetAnalysis)
			r.With(s.authMiddleware).Delete("/{analysisID}", s.handleDeleteAnalysis)
		})

		r.With(s.authMiddleware).Get("/system/status", s.handleSystemStatus)
	})

	return r
}

func (s *Server) handleRoot(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"name":    s.cfg.AppName,
		"version": s.cfg.AppVersion,
		"docs":    "/docs",
		"api":     s.cfg.APIV1Prefix,
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeDetailError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Username == "" || req.Password == "" {
		writeDetailError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	var user models.User
	err := s.db.Where("username = ?", req.Username).First(&user).Error
	if err != nil || !user.IsActive || !auth.VerifyPasswordHash(req.Password, user.PasswordHash) {
		w.Header().Set("WWW-Authenticate", "Bearer")
		writeDetailError(w, http.StatusUnauthorized, "Incorrect username or password")
		return
	}

	token, err := s.authManager.CreateAccessToken(user.Username)
	if err != nil {
		writeDetailError(w, http.StatusInternalServerError, "Failed to create token")
		return
	}

	writeJSON(w, http.StatusOK, tokenResponse{AccessToken: token, TokenType: "bearer"})
}

func (s *Server) handleToken(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeDetailError(w, http.StatusBadRequest, "Invalid form data")
		return
	}
	username := r.FormValue("username")
	password := r.FormValue("password")
	if username == "" || password == "" {
		writeDetailError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	var user models.User
	err := s.db.Where("username = ?", username).First(&user).Error
	if err != nil || !user.IsActive || !auth.VerifyPasswordHash(password, user.PasswordHash) {
		w.Header().Set("WWW-Authenticate", "Bearer")
		writeDetailError(w, http.StatusUnauthorized, "Incorrect username or password")
		return
	}

	token, err := s.authManager.CreateAccessToken(user.Username)
	if err != nil {
		writeDetailError(w, http.StatusInternalServerError, "Failed to create token")
		return
	}

	writeJSON(w, http.StatusOK, tokenResponse{AccessToken: token, TokenType: "bearer"})
}

func (s *Server) handleGetMe(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
		return
	}

	writeJSON(w, http.StatusOK, userResponse{
		ID:        user.ID,
		Username:  user.Username,
		IsActive:  user.IsActive,
		CreatedAt: user.CreatedAt,
	})
}

func (s *Server) handleCreateAnalysis(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
		return
	}

	if err := r.ParseMultipartForm(s.cfg.MaxUploadSize); err != nil {
		writeDetailError(w, http.StatusBadRequest, "Invalid multipart form")
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		writeDetailError(w, http.StatusBadRequest, "image is required")
		return
	}
	defer file.Close()

	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(header.Filename)), ".")
	if ext == "" {
		writeDetailError(w, http.StatusBadRequest, "No filename provided")
		return
	}
	if _, ok := s.cfg.AllowedExtensions[ext]; !ok {
		writeDetailError(w, http.StatusBadRequest, fmt.Sprintf("File type not allowed. Allowed: %v", keys(s.cfg.AllowedExtensions)))
		return
	}

	analysisInput, ok := s.parseAnalysisInput(w, r)
	if !ok {
		return
	}

	analysisRecord, err := s.analysisService.CreateAnalysis(user.ID, "", analysisInput.designArea, analysisInput.scale, analysisInput.analysisType)
	if err != nil {
		writeDetailError(w, http.StatusInternalServerError, "Failed to create analysis")
		return
	}

	path := filepath.Join(s.cfg.UploadDir, fmt.Sprintf("%d_original.%s", analysisRecord.ID, ext))
	if err := saveUploadedFile(path, file); err != nil {
		writeDetailError(w, http.StatusInternalServerError, "Failed to save uploaded file")
		return
	}

	if err := s.analysisService.UpdateOriginalImagePath(analysisRecord.ID, path); err != nil {
		writeDetailError(w, http.StatusInternalServerError, "Failed to persist upload path")
		return
	}

	s.analysisService.RunAsync(analysisRecord.ID)

	writeJSON(w, http.StatusOK, analysisCreateResponse{
		ID:      analysisRecord.ID,
		Status:  models.AnalysisStatusPending,
		Message: "Analysis task created. Connect to WebSocket for progress updates.",
	})
}

func (s *Server) handleCreateBatchAnalysis(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
		return
	}

	if err := r.ParseMultipartForm(s.cfg.MaxUploadSize * 50); err != nil {
		writeDetailError(w, http.StatusBadRequest, "Invalid multipart form")
		return
	}

	files := r.MultipartForm.File["images"]
	if len(files) == 0 {
		writeDetailError(w, http.StatusBadRequest, "At least one image is required")
		return
	}
	if len(files) > 50 {
		writeDetailError(w, http.StatusBadRequest, "Maximum 50 images per batch")
		return
	}

	analysisInput, ok := s.parseAnalysisInput(w, r)
	if !ok {
		return
	}

	taskIDs := make([]uint, 0, len(files))
	for _, uploaded := range files {
		ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(uploaded.Filename)), ".")
		if _, ok := s.cfg.AllowedExtensions[ext]; !ok {
			writeDetailError(w, http.StatusBadRequest, fmt.Sprintf("File type not allowed. Allowed: %v", keys(s.cfg.AllowedExtensions)))
			return
		}

		analysisRecord, err := s.analysisService.CreateAnalysis(user.ID, "", analysisInput.designArea, analysisInput.scale, analysisInput.analysisType)
		if err != nil {
			writeDetailError(w, http.StatusInternalServerError, "Failed to create analysis")
			return
		}

		src, err := uploaded.Open()
		if err != nil {
			writeDetailError(w, http.StatusBadRequest, "Failed to read uploaded image")
			return
		}

		path := filepath.Join(s.cfg.UploadDir, fmt.Sprintf("%d_original.%s", analysisRecord.ID, ext))
		saveErr := saveUploadedFile(path, src)
		_ = src.Close()
		if saveErr != nil {
			writeDetailError(w, http.StatusInternalServerError, "Failed to save uploaded file")
			return
		}

		if err := s.analysisService.UpdateOriginalImagePath(analysisRecord.ID, path); err != nil {
			writeDetailError(w, http.StatusInternalServerError, "Failed to persist upload path")
			return
		}

		taskIDs = append(taskIDs, analysisRecord.ID)
		s.analysisService.RunAsync(analysisRecord.ID)
	}

	writeJSON(w, http.StatusOK, batchAnalysisCreateResponse{
		BatchID: uuid.NewString(),
		TaskIDs: taskIDs,
		Total:   len(taskIDs),
	})
}

func (s *Server) handleGetAnalysis(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
		return
	}

	analysisID, ok := parseAnalysisID(w, r)
	if !ok {
		return
	}

	record, err := s.analysisService.GetAnalysisByID(analysisID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			writeDetailError(w, http.StatusNotFound, "Analysis not found")
			return
		}
		writeDetailError(w, http.StatusInternalServerError, "Failed to query analysis")
		return
	}

	if record.UserID != user.ID {
		writeDetailError(w, http.StatusForbidden, "Access denied")
		return
	}

	resp := buildAnalysisResponse(record, s.cfg.APIV1Prefix, s.cfg.DesignAreaM2, s.cfg.ScaleMMPerPixel)
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleAnalysisImage(w http.ResponseWriter, r *http.Request) {
	analysisID, ok := parseAnalysisID(w, r)
	if !ok {
		return
	}
	imageType := chi.URLParam(r, "imageType")

	record, err := s.analysisService.GetAnalysisByID(analysisID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			writeDetailError(w, http.StatusNotFound, "Analysis not found")
			return
		}
		writeDetailError(w, http.StatusInternalServerError, "Failed to query analysis")
		return
	}

	var path string
	switch imageType {
	case "original":
		path = record.OriginalImage
	case "mask":
		path = derefString(record.MaskImage)
	case "overlay":
		path = derefString(record.OverlayImage)
	case "crack_mask":
		path = derefString(record.CrackMaskImage)
	case "crack_overlay":
		path = derefString(record.CrackOverlayImage)
	case "combined_overlay":
		path = derefString(record.CombinedOverlayImage)
	default:
		writeDetailError(w, http.StatusBadRequest, "Invalid image type")
		return
	}

	if path == "" {
		writeDetailError(w, http.StatusNotFound, "Image not found")
		return
	}

	if _, err := os.Stat(path); err != nil {
		writeDetailError(w, http.StatusNotFound, "Image not found")
		return
	}

	http.ServeFile(w, r, path)
}

func (s *Server) handleDeleteAnalysis(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
		return
	}

	analysisID, ok := parseAnalysisID(w, r)
	if !ok {
		return
	}

	deleted, err := s.analysisService.DeleteAnalysis(analysisID, user.ID)
	if err != nil {
		writeDetailError(w, http.StatusInternalServerError, "Failed to delete analysis")
		return
	}
	if !deleted {
		writeDetailError(w, http.StatusNotFound, "Analysis not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Analysis deleted successfully"})
}

func (s *Server) handleListAnalyses(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
		return
	}

	page := parseQueryInt(r, "page", 1)
	limit := parseQueryInt(r, "limit", 20)
	if limit > 100 {
		limit = 100
	}

	statusFilter := strings.TrimSpace(r.URL.Query().Get("status"))
	search := strings.TrimSpace(r.URL.Query().Get("search"))

	items, total, err := s.analysisService.GetUserAnalyses(user.ID, page, limit, statusFilter, search)
	if err != nil {
		writeDetailError(w, http.StatusInternalServerError, "Failed to query analyses")
		return
	}

	responseItems := make([]analysisListItemResponse, 0, len(items))
	for _, item := range items {
		responseItems = append(responseItems, analysisListItemResponse{
			ID:                item.ID,
			Status:            item.Status,
			ExcavationStatus:  item.ExcavationStatus,
			ActualAreaM2:      item.ActualAreaM2,
			DifferencePercent: item.DifferencePercent,
			CreatedAt:         item.CreatedAt,
		})
	}

	pages := 0
	if limit > 0 {
		pages = int((total + int64(limit) - 1) / int64(limit))
	}

	writeJSON(w, http.StatusOK, analysisListResponse{
		Items: responseItems,
		Total: total,
		Page:  page,
		Pages: pages,
	})
}

func (s *Server) handleDashboardStats(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
		return
	}

	stats, err := s.analysisService.GetStats(user.ID)
	if err != nil {
		writeDetailError(w, http.StatusInternalServerError, "Failed to query stats")
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleTrendData(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
		return
	}

	limit := parseQueryInt(r, "limit", 20)
	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 20
	}

	trend, err := s.analysisService.GetTrendData(user.ID, limit)
	if err != nil {
		writeDetailError(w, http.StatusInternalServerError, "Failed to query trend data")
		return
	}

	points := make([]trendDataPointResponse, 0, len(trend.DataPoints))
	for _, point := range trend.DataPoints {
		points = append(points, trendDataPointResponse{
			ID:                  point.ID,
			Label:               point.Label,
			OverExcavationArea:  point.OverExcavationArea,
			UnderExcavationArea: point.UnderExcavationArea,
			DifferencePercent:   point.DifferencePercent,
			CreatedAt:           point.CreatedAt,
		})
	}

	writeJSON(w, http.StatusOK, trendResponse{
		Labels:              trend.Labels,
		OverExcavationData:  trend.OverExcavationData,
		UnderExcavationData: trend.UnderExcavationData,
		DataPoints:          points,
	})
}

func (s *Server) handleDeviationDistribution(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
		return
	}

	distribution, err := s.analysisService.GetDeviationDistribution(user.ID)
	if err != nil {
		writeDetailError(w, http.StatusInternalServerError, "Failed to query distribution")
		return
	}

	writeJSON(w, http.StatusOK, distribution)
}

func (s *Server) handleAnalysisWebSocket(w http.ResponseWriter, r *http.Request) {
	analysisID, ok := parseAnalysisID(w, r)
	if !ok {
		return
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(_ *http.Request) bool {
			return true
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.hub.Set(analysisID, conn)
	defer func() {
		s.hub.Remove(analysisID, conn)
		_ = conn.Close()
	}()

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (s *Server) handleSystemStatus(w http.ResponseWriter, _ *http.Request) {
	cpuPercent := 0.0
	if values, err := cpu.Percent(100*time.Millisecond, false); err == nil && len(values) > 0 {
		cpuPercent = round(values[0], 1)
	}

	memoryPercent := 0.0
	memoryUsedGB := 0.0
	memoryTotalGB := 0.0
	if vm, err := mem.VirtualMemory(); err == nil {
		memoryPercent = round(vm.UsedPercent, 1)
		memoryUsedGB = round(float64(vm.Used)/float64(1<<30), 2)
		memoryTotalGB = round(float64(vm.Total)/float64(1<<30), 2)
	}

	gpuPercent, gpuMemUsed, gpuMemTotal, gpuAvailable := getGPUInfo()

	modelStatuses := s.analyzer.ModelStatus()
	modelsResp := make([]modelStatusResponse, 0, len(modelStatuses))
	for _, model := range modelStatuses {
		modelsResp = append(modelsResp, modelStatusResponse{
			Name:    model.Name,
			Version: model.Version,
			Status:  model.Status,
			Speed:   model.Speed,
			Loaded:  model.Loaded,
		})
	}

	uptime := round(time.Since(s.startedAt).Seconds(), 0)

	writeJSON(w, http.StatusOK, systemStatusResponse{
		Resources: systemResourceStatusResponse{
			CPUPct:           cpuPercent,
			MemoryPct:        memoryPercent,
			MemoryUsedGB:     memoryUsedGB,
			MemoryTotalGB:    memoryTotalGB,
			GPUPct:           gpuPercent,
			GPUMemoryUsedGB:  gpuMemUsed,
			GPUMemoryTotalGB: gpuMemTotal,
			GPUAvailable:     gpuAvailable,
		},
		Models:        modelsResp,
		UptimeSeconds: &uptime,
	})
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(strings.ToLower(authorization), "bearer ") {
			w.Header().Set("WWW-Authenticate", "Bearer")
			writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
			return
		}

		token := strings.TrimSpace(authorization[7:])
		username, err := s.authManager.ParseUsername(token)
		if err != nil {
			w.Header().Set("WWW-Authenticate", "Bearer")
			writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
			return
		}

		var user models.User
		if err := s.db.Where("username = ?", username).First(&user).Error; err != nil {
			w.Header().Set("WWW-Authenticate", "Bearer")
			writeDetailError(w, http.StatusUnauthorized, "Could not validate credentials")
			return
		}
		if !user.IsActive {
			writeDetailError(w, http.StatusBadRequest, "Inactive user")
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, &user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func currentUser(r *http.Request) *models.User {
	value := r.Context().Value(userContextKey)
	if value == nil {
		return nil
	}
	user, ok := value.(*models.User)
	if !ok {
		return nil
	}
	return user
}

func parseAnalysisID(w http.ResponseWriter, r *http.Request) (uint, bool) {
	param := chi.URLParam(r, "analysisID")
	id, err := strconv.ParseUint(param, 10, 32)
	if err != nil || id == 0 {
		writeDetailError(w, http.StatusBadRequest, "Invalid analysis id")
		return 0, false
	}
	return uint(id), true
}

func parseQueryInt(r *http.Request, key string, fallback int) int {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

type analysisFormInput struct {
	designArea   float64
	scale        float64
	analysisType string
}

func (s *Server) parseAnalysisInput(w http.ResponseWriter, r *http.Request) (analysisFormInput, bool) {
	designArea := s.cfg.DesignAreaM2
	if value := strings.TrimSpace(r.FormValue("design_area")); value != "" {
		parsed, parseErr := strconv.ParseFloat(value, 64)
		if parseErr != nil {
			writeDetailError(w, http.StatusBadRequest, "design_area must be a number")
			return analysisFormInput{}, false
		}
		designArea = parsed
	}
	if designArea <= 0 {
		writeDetailError(w, http.StatusBadRequest, "design_area must be > 0")
		return analysisFormInput{}, false
	}

	scale := s.cfg.ScaleMMPerPixel
	if value := strings.TrimSpace(r.FormValue("scale")); value != "" {
		parsed, parseErr := strconv.ParseFloat(value, 64)
		if parseErr != nil {
			writeDetailError(w, http.StatusBadRequest, "scale must be a number")
			return analysisFormInput{}, false
		}
		scale = parsed
	}
	if scale <= 0 {
		writeDetailError(w, http.StatusBadRequest, "scale must be > 0")
		return analysisFormInput{}, false
	}

	analysisType := strings.TrimSpace(r.FormValue("analysis_type"))
	if analysisType == "" {
		analysisType = models.AnalysisTypeFull
	}
	if !isValidAnalysisType(analysisType) {
		writeDetailError(w, http.StatusBadRequest, "Invalid analysis_type. Must be one of: [face_segmentation crack_detection full]")
		return analysisFormInput{}, false
	}

	return analysisFormInput{
		designArea:   designArea,
		scale:        scale,
		analysisType: analysisType,
	}, true
}

func saveUploadedFile(path string, source io.Reader) error {
	out, err := os.Create(path)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, source)
	return err
}

func isValidAnalysisType(t string) bool {
	switch t {
	case models.AnalysisTypeFaceSegmentation, models.AnalysisTypeCrackDetection, models.AnalysisTypeFull:
		return true
	default:
		return false
	}
}

func keys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}

func buildAnalysisResponse(record *models.Analysis, apiPrefix string, defaultDesign, defaultScale float64) analysisResponse {
	design := defaultDesign
	if record.DesignAreaM2 != nil {
		design = *record.DesignAreaM2
	}
	scale := defaultScale
	if record.ScaleMMPerPixel != nil {
		scale = *record.ScaleMMPerPixel
	}
	analysisType := record.AnalysisType

	resp := analysisResponse{
		ID:           record.ID,
		Status:       record.Status,
		AnalysisType: &analysisType,
		DesignAreaM2: &design,
		ScaleMMPixel: &scale,
		ErrorMessage: record.ErrorMessage,
		CreatedAt:    record.CreatedAt,
		CompletedAt:  record.CompletedAt,
	}

	if record.OriginalImage != "" {
		url := fmt.Sprintf("%s/analysis/%d/image/original", apiPrefix, record.ID)
		resp.OriginalImageURL = &url
	}
	if record.MaskImage != nil {
		url := fmt.Sprintf("%s/analysis/%d/image/mask", apiPrefix, record.ID)
		resp.MaskImageURL = &url
	}
	if record.OverlayImage != nil {
		url := fmt.Sprintf("%s/analysis/%d/image/overlay", apiPrefix, record.ID)
		resp.OverlayImageURL = &url
	}
	if record.CrackMaskImage != nil {
		url := fmt.Sprintf("%s/analysis/%d/image/crack_mask", apiPrefix, record.ID)
		resp.CrackMaskImageURL = &url
	}
	if record.CrackOverlayImage != nil {
		url := fmt.Sprintf("%s/analysis/%d/image/crack_overlay", apiPrefix, record.ID)
		resp.CrackOverlayImageURL = &url
	}
	if record.CombinedOverlayImage != nil {
		url := fmt.Sprintf("%s/analysis/%d/image/combined_overlay", apiPrefix, record.ID)
		resp.CombinedOverlayImageURL = &url
	}

	if record.Status == models.AnalysisStatusCompleted {
		if record.PixelCount != nil {
			actualArea := 0.0
			if record.ActualAreaM2 != nil {
				actualArea = *record.ActualAreaM2
			}
			differenceM2 := 0.0
			if record.DifferenceM2 != nil {
				differenceM2 = *record.DifferenceM2
			}
			differencePct := 0.0
			if record.DifferencePercent != nil {
				differencePct = *record.DifferencePercent
			}
			status := ""
			if record.ExcavationStatus != nil {
				status = *record.ExcavationStatus
			}

			resp.Excavation = &excavationResultResponse{
				PixelCount:        *record.PixelCount,
				ActualAreaM2:      actualArea,
				DesignAreaM2:      design,
				DifferenceM2:      differenceM2,
				DifferencePercent: differencePct,
				Status:            status,
			}
		}

		confidence := 0.0
		if record.Confidence != nil {
			confidence = *record.Confidence
		}

		var maskQuality *string
		if record.Confidence != nil && *record.Confidence > 0 {
			quality := "medium"
			if *record.Confidence > 0.8 {
				quality = "high"
			}
			maskQuality = &quality
		}

		resp.Metrics = &segmentationMetricsResponse{
			Confidence:      confidence,
			MaskQuality:     maskQuality,
			CrackConfidence: record.CrackConfidence,
			CrackCount:      record.CrackCount,
			CrackPixelCount: record.CrackPixelCount,
		}
	}

	return resp
}

func getGPUInfo() (*float64, *float64, *float64, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "nvidia-smi", "--query-gpu=memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits")
	output, err := cmd.Output()
	if err != nil {
		return nil, nil, nil, false
	}

	line := strings.TrimSpace(string(output))
	if line == "" {
		return nil, nil, nil, false
	}
	firstLine := strings.Split(line, "\n")[0]
	parts := strings.Split(firstLine, ",")
	if len(parts) < 3 {
		return nil, nil, nil, false
	}

	memUsedMB, err1 := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	memTotalMB, err2 := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	gpuUtil, err3 := strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
	if err1 != nil || err2 != nil || err3 != nil {
		return nil, nil, nil, false
	}

	usedGB := round(memUsedMB/1024.0, 2)
	totalGB := round(memTotalMB/1024.0, 2)
	gpu := round(gpuUtil, 1)
	return &gpu, &usedGB, &totalGB, true
}

func derefString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func round(value float64, precision int) float64 {
	factor := math.Pow(10, float64(precision))
	return math.Round(value*factor) / factor
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeDetailError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, detailError{Detail: message})
}
