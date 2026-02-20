package api

import "time"

type detailError struct {
	Detail string `json:"detail"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
}

type userResponse struct {
	ID        uint      `json:"id"`
	Username  string    `json:"username"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type analysisCreateResponse struct {
	ID      uint   `json:"id"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type batchAnalysisCreateResponse struct {
	BatchID string `json:"batch_id"`
	TaskIDs []uint `json:"task_ids"`
	Total   int    `json:"total"`
}

type excavationResultResponse struct {
	PixelCount        int     `json:"pixel_count"`
	ActualAreaM2      float64 `json:"actual_area_m2"`
	DesignAreaM2      float64 `json:"design_area_m2"`
	DifferenceM2      float64 `json:"difference_m2"`
	DifferencePercent float64 `json:"difference_percent"`
	Status            string  `json:"status"`
}

type segmentationMetricsResponse struct {
	Confidence      float64  `json:"confidence"`
	MaskQuality     *string  `json:"mask_quality"`
	CrackConfidence *float64 `json:"crack_confidence"`
	CrackCount      *int     `json:"crack_count"`
	CrackPixelCount *int     `json:"crack_pixel_count"`
}

type analysisResponse struct {
	ID                      uint                         `json:"id"`
	Status                  string                       `json:"status"`
	AnalysisType            *string                      `json:"analysis_type"`
	DesignAreaM2            *float64                     `json:"design_area_m2"`
	ScaleMMPixel            *float64                     `json:"scale_mm_per_pixel"`
	OriginalImageURL        *string                      `json:"original_image_url"`
	MaskImageURL            *string                      `json:"mask_image_url"`
	OverlayImageURL         *string                      `json:"overlay_image_url"`
	CrackMaskImageURL       *string                      `json:"crack_mask_image_url"`
	CrackOverlayImageURL    *string                      `json:"crack_overlay_image_url"`
	CombinedOverlayImageURL *string                      `json:"combined_overlay_image_url"`
	Excavation              *excavationResultResponse    `json:"excavation"`
	Metrics                 *segmentationMetricsResponse `json:"metrics"`
	ErrorMessage            *string                      `json:"error_message"`
	CreatedAt               time.Time                    `json:"created_at"`
	CompletedAt             *time.Time                   `json:"completed_at"`
}

type analysisListItemResponse struct {
	ID                uint      `json:"id"`
	Status            string    `json:"status"`
	ExcavationStatus  *string   `json:"excavation_status"`
	ActualAreaM2      *float64  `json:"actual_area_m2"`
	DifferencePercent *float64  `json:"difference_percent"`
	CreatedAt         time.Time `json:"created_at"`
}

type analysisListResponse struct {
	Items []analysisListItemResponse `json:"items"`
	Total int64                      `json:"total"`
	Page  int                        `json:"page"`
	Pages int                        `json:"pages"`
}

type trendDataPointResponse struct {
	ID                  uint      `json:"id"`
	Label               string    `json:"label"`
	OverExcavationArea  float64   `json:"over_excavation_area"`
	UnderExcavationArea float64   `json:"under_excavation_area"`
	DifferencePercent   *float64  `json:"difference_percent"`
	CreatedAt           time.Time `json:"created_at"`
}

type trendResponse struct {
	Labels              []string                 `json:"labels"`
	OverExcavationData  []float64                `json:"over_excavation_data"`
	UnderExcavationData []float64                `json:"under_excavation_data"`
	DataPoints          []trendDataPointResponse `json:"data_points"`
}

type systemResourceStatusResponse struct {
	CPUPct           float64  `json:"cpu_percent"`
	MemoryPct        float64  `json:"memory_percent"`
	MemoryUsedGB     float64  `json:"memory_used_gb"`
	MemoryTotalGB    float64  `json:"memory_total_gb"`
	GPUPct           *float64 `json:"gpu_percent"`
	GPUMemoryUsedGB  *float64 `json:"gpu_memory_used_gb"`
	GPUMemoryTotalGB *float64 `json:"gpu_memory_total_gb"`
	GPUAvailable     bool     `json:"gpu_available"`
}

type modelStatusResponse struct {
	Name    string  `json:"name"`
	Version string  `json:"version"`
	Status  string  `json:"status"`
	Speed   *string `json:"speed"`
	Loaded  bool    `json:"loaded"`
}

type systemStatusResponse struct {
	Resources     systemResourceStatusResponse `json:"resources"`
	Models        []modelStatusResponse        `json:"models"`
	UptimeSeconds *float64                     `json:"uptime_seconds"`
}
