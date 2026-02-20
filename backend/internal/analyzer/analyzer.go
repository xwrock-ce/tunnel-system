package analyzer

import (
	"context"
)

type Request struct {
	AnalysisID   uint    `json:"analysis_id"`
	ImagePath    string  `json:"image_path"`
	OutputDir    string  `json:"output_dir"`
	DesignAreaM2 float64 `json:"design_area_m2"`
	ScaleMMPixel float64 `json:"scale_mm_per_pixel"`
	AnalysisType string  `json:"analysis_type"`
}

type Result struct {
	MaskImagePath            *string  `json:"mask_image_path"`
	OverlayImagePath         *string  `json:"overlay_image_path"`
	CrackMaskImagePath       *string  `json:"crack_mask_image_path"`
	CrackOverlayImagePath    *string  `json:"crack_overlay_image_path"`
	CombinedOverlayImagePath *string  `json:"combined_overlay_image_path"`
	PixelCount               *int     `json:"pixel_count"`
	ActualAreaM2             *float64 `json:"actual_area_m2"`
	DesignAreaM2             *float64 `json:"design_area_m2"`
	DifferenceM2             *float64 `json:"difference_m2"`
	DifferencePercent        *float64 `json:"difference_percent"`
	ExcavationStatus         *string  `json:"excavation_status"`
	Confidence               *float64 `json:"confidence"`
	CrackCount               *int     `json:"crack_count"`
	CrackPixelCount          *int     `json:"crack_pixel_count"`
	CrackConfidence          *float64 `json:"crack_confidence"`
}

type Progress struct {
	Stage    string
	Progress int
	Message  string
}

type ModelStatusItem struct {
	Name    string
	Version string
	Status  string
	Speed   *string
	Loaded  bool
}

type Interface interface {
	Analyze(ctx context.Context, request Request, progress func(Progress)) (Result, error)
	ModelStatus() []ModelStatusItem
}
