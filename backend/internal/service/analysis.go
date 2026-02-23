package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"strconv"
	"time"

	"gorm.io/gorm"

	"tunnel-system/backend/internal/analyzer"
	"tunnel-system/backend/internal/config"
	"tunnel-system/backend/internal/models"
	"tunnel-system/backend/internal/ws"
)

type AnalysisService struct {
	db       *gorm.DB
	cfg      *config.Config
	analyzer analyzer.Interface
	hub      *ws.Hub
}

func NewAnalysisService(db *gorm.DB, cfg *config.Config, analyzer analyzer.Interface, hub *ws.Hub) *AnalysisService {
	return &AnalysisService{db: db, cfg: cfg, analyzer: analyzer, hub: hub}
}

func (s *AnalysisService) CreateAnalysis(userID uint, imagePath string, designArea, scale float64, analysisType string) (*models.Analysis, error) {
	design := designArea
	scaleValue := scale
	record := &models.Analysis{
		UserID:          userID,
		OriginalImage:   imagePath,
		Status:          models.AnalysisStatusPending,
		DesignAreaM2:    &design,
		ScaleMMPerPixel: &scaleValue,
		AnalysisType:    analysisType,
	}

	if err := s.db.Create(record).Error; err != nil {
		return nil, fmt.Errorf("create analysis: %w", err)
	}
	return record, nil
}

func (s *AnalysisService) UpdateOriginalImagePath(analysisID uint, imagePath string) error {
	return s.db.Model(&models.Analysis{}).
		Where("id = ?", analysisID).
		Update("original_image", imagePath).Error
}

func (s *AnalysisService) RunAsync(analysisID uint) {
	go s.runTask(analysisID)
}

func (s *AnalysisService) runTask(analysisID uint) {
	var record models.Analysis
	if err := s.db.First(&record, analysisID).Error; err != nil {
		return
	}

	if err := s.db.Model(&record).Update("status", models.AnalysisStatusProcessing).Error; err != nil {
		return
	}

	designArea := s.cfg.DesignAreaM2
	if record.DesignAreaM2 != nil && *record.DesignAreaM2 > 0 {
		designArea = *record.DesignAreaM2
	}
	scale := s.cfg.ScaleMMPerPixel
	if record.ScaleMMPerPixel != nil && *record.ScaleMMPerPixel > 0 {
		scale = *record.ScaleMMPerPixel
	}
	analysisType := record.AnalysisType
	if analysisType == "" {
		analysisType = models.AnalysisTypeFull
	}

	progressCallback := func(progress analyzer.Progress) {
		s.hub.Send(analysisID, ws.Message{
			Type:     "progress",
			Stage:    progress.Stage,
			Progress: progress.Progress,
			Message:  progress.Message,
		})
	}

	if _, err := os.Stat(record.OriginalImage); err != nil {
		s.markFailed(&record, fmt.Errorf("image not found: %w", err))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	result, err := s.analyzer.Analyze(ctx, analyzer.Request{
		AnalysisID:   analysisID,
		ImagePath:    record.OriginalImage,
		OutputDir:    s.cfg.UploadDir,
		DesignAreaM2: designArea,
		ScaleMMPixel: scale,
		AnalysisType: analysisType,
	}, progressCallback)
	if err != nil {
		s.markFailed(&record, err)
		s.hub.Send(analysisID, ws.Message{Type: "error", Stage: "failed", Progress: 0, Message: err.Error()})
		return
	}

	completedAt := time.Now().UTC()
	updates := map[string]interface{}{
		"status":                 models.AnalysisStatusCompleted,
		"completed_at":           completedAt,
		"error_message":          nil,
		"mask_image":             result.MaskImagePath,
		"overlay_image":          result.OverlayImagePath,
		"crack_mask_image":       result.CrackMaskImagePath,
		"crack_overlay_image":    result.CrackOverlayImagePath,
		"combined_overlay_image": result.CombinedOverlayImagePath,
		"pixel_count":            result.PixelCount,
		"actual_area_m2":         result.ActualAreaM2,
		"difference_m2":          result.DifferenceM2,
		"difference_percent":     result.DifferencePercent,
		"excavation_status":      result.ExcavationStatus,
		"confidence":             result.Confidence,
		"crack_count":            result.CrackCount,
		"crack_pixel_count":      result.CrackPixelCount,
		"crack_confidence":       result.CrackConfidence,
	}
	if result.DesignAreaM2 != nil {
		updates["design_area_m2"] = result.DesignAreaM2
	}

	if err := s.db.Model(&models.Analysis{}).Where("id = ?", analysisID).Updates(updates).Error; err != nil {
		s.markFailed(&record, err)
		s.hub.Send(analysisID, ws.Message{Type: "error", Stage: "failed", Progress: 0, Message: err.Error()})
		return
	}

	s.hub.Send(analysisID, ws.Message{Type: "result", Stage: "completed", Progress: 100, Message: "Analysis completed successfully"})
}

func (s *AnalysisService) markFailed(record *models.Analysis, err error) {
	message := err.Error()
	_ = s.db.Model(&models.Analysis{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"status":        models.AnalysisStatusFailed,
		"error_message": &message,
	}).Error
}

func (s *AnalysisService) GetAnalysisByID(analysisID uint) (*models.Analysis, error) {
	var record models.Analysis
	if err := s.db.First(&record, analysisID).Error; err != nil {
		return nil, err
	}
	return &record, nil
}

func (s *AnalysisService) GetUserAnalyses(userID uint, page, limit int, statusFilter, search string) ([]models.Analysis, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}

	query := s.db.Model(&models.Analysis{}).Where("user_id = ?", userID)
	if statusFilter != "" {
		query = query.Where("excavation_status = ?", statusFilter)
	}
	if search != "" {
		if id, err := strconv.Atoi(search); err == nil {
			query = query.Where("id = ?", id)
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var items []models.Analysis
	err := query.Order("created_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&items).Error
	if err != nil {
		return nil, 0, err
	}

	return items, total, nil
}

func (s *AnalysisService) DeleteAnalysis(analysisID, userID uint) (bool, error) {
	var record models.Analysis
	err := s.db.Where("id = ? AND user_id = ?", analysisID, userID).First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}

	for _, path := range []*string{
		&record.OriginalImage,
		record.MaskImage,
		record.OverlayImage,
		record.CrackMaskImage,
		record.CrackOverlayImage,
		record.CombinedOverlayImage,
	} {
		if path == nil || *path == "" {
			continue
		}
		_ = os.Remove(*path)
	}

	if err := s.db.Delete(&record).Error; err != nil {
		return false, err
	}
	return true, nil
}

type Stats struct {
	TotalAnalyses           int64    `json:"total_analyses"`
	TodayAnalyses           int64    `json:"today_analyses"`
	YesterdayAnalyses       int64    `json:"yesterday_analyses"`
	TodayVsYesterdayPercent *float64 `json:"today_vs_yesterday_percent"`
	OverExcavationCount     int64    `json:"over_excavation_count"`
	UnderExcavationCount    int64    `json:"under_excavation_count"`
	NormalCount             int64    `json:"normal_count"`
	AvgDifferencePercent    float64  `json:"avg_difference_percent"`
}

func (s *AnalysisService) GetStats(userID uint) (Stats, error) {
	stats := Stats{}
	now := time.Now().UTC()
	today := now.Format("2006-01-02")
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")

	type statsRow struct {
		TotalAnalyses        int64    `gorm:"column:total_analyses"`
		TodayAnalyses        int64    `gorm:"column:today_analyses"`
		YesterdayAnalyses    int64    `gorm:"column:yesterday_analyses"`
		OverExcavationCount  int64    `gorm:"column:over_excavation_count"`
		UnderExcavationCount int64    `gorm:"column:under_excavation_count"`
		NormalCount          int64    `gorm:"column:normal_count"`
		AvgDifference        *float64 `gorm:"column:avg_difference_percent"`
	}

	var row statsRow
	err := s.db.Model(&models.Analysis{}).
		Select(
			`COUNT(*) as total_analyses,
			COALESCE(SUM(CASE WHEN date(created_at) = ? THEN 1 ELSE 0 END), 0) as today_analyses,
			COALESCE(SUM(CASE WHEN date(created_at) = ? THEN 1 ELSE 0 END), 0) as yesterday_analyses,
			COALESCE(SUM(CASE WHEN excavation_status = ? THEN 1 ELSE 0 END), 0) as over_excavation_count,
			COALESCE(SUM(CASE WHEN excavation_status = ? THEN 1 ELSE 0 END), 0) as under_excavation_count,
			COALESCE(SUM(CASE WHEN excavation_status = ? THEN 1 ELSE 0 END), 0) as normal_count,
			AVG(difference_percent) as avg_difference_percent`,
			today,
			yesterday,
			models.ExcavationStatusOver,
			models.ExcavationStatusUnder,
			models.ExcavationStatusNormal,
		).
		Where("user_id = ?", userID).
		Scan(&row).Error
	if err != nil {
		return stats, err
	}

	stats.TotalAnalyses = row.TotalAnalyses
	stats.TodayAnalyses = row.TodayAnalyses
	stats.YesterdayAnalyses = row.YesterdayAnalyses
	stats.OverExcavationCount = row.OverExcavationCount
	stats.UnderExcavationCount = row.UnderExcavationCount
	stats.NormalCount = row.NormalCount
	if row.AvgDifference != nil {
		stats.AvgDifferencePercent = math.Round((*row.AvgDifference)*100) / 100
	}

	if stats.YesterdayAnalyses > 0 {
		v := (float64(stats.TodayAnalyses-stats.YesterdayAnalyses) / float64(stats.YesterdayAnalyses)) * 100
		v = math.Round(v*10) / 10
		stats.TodayVsYesterdayPercent = &v
	}

	return stats, nil
}

type TrendPoint struct {
	ID                  uint      `json:"id"`
	Label               string    `json:"label"`
	OverExcavationArea  float64   `json:"over_excavation_area"`
	UnderExcavationArea float64   `json:"under_excavation_area"`
	DifferencePercent   *float64  `json:"difference_percent"`
	CreatedAt           time.Time `json:"created_at"`
}

type TrendData struct {
	Labels              []string     `json:"labels"`
	OverExcavationData  []float64    `json:"over_excavation_data"`
	UnderExcavationData []float64    `json:"under_excavation_data"`
	DataPoints          []TrendPoint `json:"data_points"`
}

func (s *AnalysisService) GetTrendData(userID uint, limit int) (TrendData, error) {
	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	var analyses []models.Analysis
	err := s.db.Where("user_id = ? AND status = ? AND difference_m2 IS NOT NULL AND actual_area_m2 IS NOT NULL AND design_area_m2 IS NOT NULL", userID, models.AnalysisStatusCompleted).
		Order("id DESC").
		Limit(limit).
		Find(&analyses).Error
	if err != nil {
		return TrendData{}, err
	}

	for i, j := 0, len(analyses)-1; i < j; i, j = i+1, j-1 {
		analyses[i], analyses[j] = analyses[j], analyses[i]
	}

	trend := TrendData{
		Labels:              make([]string, 0, len(analyses)),
		OverExcavationData:  make([]float64, 0, len(analyses)),
		UnderExcavationData: make([]float64, 0, len(analyses)),
		DataPoints:          make([]TrendPoint, 0, len(analyses)),
	}

	for _, a := range analyses {
		label := fmt.Sprintf("#%d", a.ID)
		trend.Labels = append(trend.Labels, label)

		diff := 0.0
		if a.DifferenceM2 != nil {
			diff = *a.DifferenceM2
		}

		overArea := 0.0
		underArea := 0.0
		if diff > 0 {
			overArea = math.Round(math.Abs(diff)*100) / 100
		} else {
			underArea = math.Round(math.Abs(diff)*100) / 100
		}

		trend.OverExcavationData = append(trend.OverExcavationData, overArea)
		trend.UnderExcavationData = append(trend.UnderExcavationData, underArea)
		trend.DataPoints = append(trend.DataPoints, TrendPoint{
			ID:                  a.ID,
			Label:               label,
			OverExcavationArea:  overArea,
			UnderExcavationArea: underArea,
			DifferencePercent:   a.DifferencePercent,
			CreatedAt:           a.CreatedAt,
		})
	}

	return trend, nil
}

type Distribution struct {
	SevereOverCount  int64 `json:"severe_over_count"`
	MinorOverCount   int64 `json:"minor_over_count"`
	NormalCount      int64 `json:"normal_count"`
	MinorUnderCount  int64 `json:"minor_under_count"`
	SevereUnderCount int64 `json:"severe_under_count"`
}

func (s *AnalysisService) GetDeviationDistribution(userID uint) (Distribution, error) {
	d := Distribution{}
	err := s.db.Model(&models.Analysis{}).
		Select(
			`COALESCE(SUM(CASE WHEN difference_percent > 5 THEN 1 ELSE 0 END), 0) as severe_over_count,
			COALESCE(SUM(CASE WHEN difference_percent > 2 AND difference_percent <= 5 THEN 1 ELSE 0 END), 0) as minor_over_count,
			COALESCE(SUM(CASE WHEN difference_percent >= -2 AND difference_percent <= 2 THEN 1 ELSE 0 END), 0) as normal_count,
			COALESCE(SUM(CASE WHEN difference_percent >= -5 AND difference_percent < -2 THEN 1 ELSE 0 END), 0) as minor_under_count,
			COALESCE(SUM(CASE WHEN difference_percent < -5 THEN 1 ELSE 0 END), 0) as severe_under_count`,
		).
		Where("user_id = ? AND status = ? AND difference_percent IS NOT NULL", userID, models.AnalysisStatusCompleted).
		Scan(&d).Error
	if err != nil {
		return Distribution{}, err
	}
	return d, nil
}
