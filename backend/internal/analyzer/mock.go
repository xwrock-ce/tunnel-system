package analyzer

import (
	"context"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"os"
	"path/filepath"
)

type MockAnalyzer struct{}

func NewMockAnalyzer() *MockAnalyzer {
	return &MockAnalyzer{}
}

func (m *MockAnalyzer) Analyze(_ context.Context, request Request, progress func(Progress)) (Result, error) {
	if progress != nil {
		progress(Progress{Stage: "init", Progress: 5, Message: "Loading image..."})
	}

	file, err := os.Open(request.ImagePath)
	if err != nil {
		return Result{}, fmt.Errorf("open image: %w", err)
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		return Result{}, fmt.Errorf("decode image: %w", err)
	}

	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width == 0 || height == 0 {
		return Result{}, fmt.Errorf("empty image")
	}

	faceEnabled := request.AnalysisType == "full" || request.AnalysisType == "face_segmentation"
	crackEnabled := request.AnalysisType == "full" || request.AnalysisType == "crack_detection"

	var (
		maskPath         *string
		overlayPath      *string
		crackMaskPath    *string
		crackOverlayPath *string
		combinedPath     *string
	)

	var (
		pixelCount        *int
		actualAreaM2      *float64
		designAreaM2      *float64
		differenceM2      *float64
		differencePercent *float64
		excavationStatus  *string
		confidence        *float64
		crackCount        *int
		crackPixelCount   *int
		crackConfidence   *float64
	)

	faceMask := make([][]bool, height)
	for y := range faceMask {
		faceMask[y] = make([]bool, width)
	}

	if faceEnabled {
		if progress != nil {
			progress(Progress{Stage: "face_segmentation", Progress: 45, Message: "Running face segmentation..."})
		}

		cx := float64(width) * 0.5
		cy := float64(height) * 0.55
		rx := float64(width) * 0.35
		ry := float64(height) * 0.4

		count := 0
		for y := 0; y < height; y++ {
			for x := 0; x < width; x++ {
				dx := (float64(x) - cx) / rx
				dy := (float64(y) - cy) / ry
				inside := dx*dx+dy*dy <= 1.0
				faceMask[y][x] = inside
				if inside {
					count++
				}
			}
		}

		pixelCount = intPtr(count)
		designAreaM2 = floatPtr(request.DesignAreaM2)

		areaPerPixel := math.Pow(request.ScaleMMPixel/1000.0, 2)
		actual := float64(count) * areaPerPixel
		diff := actual - request.DesignAreaM2
		diffPercent := 0.0
		if request.DesignAreaM2 > 0 {
			diffPercent = diff / request.DesignAreaM2 * 100.0
		}

		status := "within_tolerance"
		if math.Abs(diffPercent) > 2.0 {
			if diffPercent > 0 {
				status = "over_excavation"
			} else {
				status = "under_excavation"
			}
		}

		actualAreaM2 = floatPtr(actual)
		differenceM2 = floatPtr(diff)
		differencePercent = floatPtr(diffPercent)
		excavationStatus = strPtr(status)
		confidence = floatPtr(0.86)

		maskName := fmt.Sprintf("%d_mask.png", request.AnalysisID)
		maskFullPath := filepath.Join(request.OutputDir, maskName)
		if err := saveBinaryMask(maskFullPath, faceMask); err != nil {
			return Result{}, err
		}
		maskPath = strPtr(maskFullPath)

		overlayName := fmt.Sprintf("%d_overlay.png", request.AnalysisID)
		overlayFullPath := filepath.Join(request.OutputDir, overlayName)
		if err := saveFaceOverlay(overlayFullPath, img, faceMask); err != nil {
			return Result{}, err
		}
		overlayPath = strPtr(overlayFullPath)
	}

	if crackEnabled {
		if progress != nil {
			progress(Progress{Stage: "crack_detection", Progress: 80, Message: "Detecting cracks..."})
		}

		x1 := int(float64(width) * 0.35)
		x2 := int(float64(width) * 0.65)
		y1 := int(float64(height) * 0.2)
		y2 := int(float64(height) * 0.27)

		if x2 <= x1 {
			x2 = x1 + 1
		}
		if y2 <= y1 {
			y2 = y1 + 1
		}

		mask := make([][]bool, height)
		for y := range mask {
			mask[y] = make([]bool, width)
		}

		for y := y1; y < y2 && y < height; y++ {
			if y < 0 {
				continue
			}
			for x := x1; x < x2 && x < width; x++ {
				if x >= 0 {
					mask[y][x] = true
				}
			}
		}

		count := (x2 - x1) * (y2 - y1)
		if count < 0 {
			count = 0
		}

		crackCount = intPtr(1)
		crackPixelCount = intPtr(count)
		crackConfidence = floatPtr(0.79)

		crackMaskName := fmt.Sprintf("%d_crack_mask.png", request.AnalysisID)
		crackMaskFullPath := filepath.Join(request.OutputDir, crackMaskName)
		if err := saveBinaryMask(crackMaskFullPath, mask); err != nil {
			return Result{}, err
		}
		crackMaskPath = strPtr(crackMaskFullPath)

		crackOverlayName := fmt.Sprintf("%d_crack_overlay.png", request.AnalysisID)
		crackOverlayFullPath := filepath.Join(request.OutputDir, crackOverlayName)
		if err := saveCrackOverlay(crackOverlayFullPath, img, x1, y1, x2, y2); err != nil {
			return Result{}, err
		}
		crackOverlayPath = strPtr(crackOverlayFullPath)

		if faceEnabled {
			combinedName := fmt.Sprintf("%d_combined_overlay.png", request.AnalysisID)
			combinedFullPath := filepath.Join(request.OutputDir, combinedName)
			if err := saveCombinedOverlay(combinedFullPath, img, faceMask, x1, y1, x2, y2); err != nil {
				return Result{}, err
			}
			combinedPath = strPtr(combinedFullPath)
		}
	}

	if progress != nil {
		progress(Progress{Stage: "completed", Progress: 100, Message: "Analysis completed"})
	}

	return Result{
		MaskImagePath:            maskPath,
		OverlayImagePath:         overlayPath,
		CrackMaskImagePath:       crackMaskPath,
		CrackOverlayImagePath:    crackOverlayPath,
		CombinedOverlayImagePath: combinedPath,
		PixelCount:               pixelCount,
		ActualAreaM2:             actualAreaM2,
		DesignAreaM2:             designAreaM2,
		DifferenceM2:             differenceM2,
		DifferencePercent:        differencePercent,
		ExcavationStatus:         excavationStatus,
		Confidence:               confidence,
		CrackCount:               crackCount,
		CrackPixelCount:          crackPixelCount,
		CrackConfidence:          crackConfidence,
	}, nil
}

func (m *MockAnalyzer) ModelStatus() []ModelStatusItem {
	speedFace := "~12ms/frame"
	speedSam2 := "~50ms/frame"
	speedCrack := "~8ms/frame"
	return []ModelStatusItem{
		{Name: "YOLOv11-L 掌子面检测", Version: "v2.4", Status: "online", Speed: &speedFace, Loaded: true},
		{Name: "SAM2 分割优化", Version: "v2.1", Status: "online", Speed: &speedSam2, Loaded: true},
		{Name: "YOLOv11 裂缝检测", Version: "v1.0", Status: "online", Speed: &speedCrack, Loaded: true},
	}
}

func saveBinaryMask(path string, mask [][]bool) error {
	height := len(mask)
	if height == 0 {
		return fmt.Errorf("mask height is zero")
	}
	width := len(mask[0])
	img := image.NewGray(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			if mask[y][x] {
				img.SetGray(x, y, color.Gray{Y: 255})
			}
		}
	}
	return writePNG(path, img)
}

func saveFaceOverlay(path string, src image.Image, mask [][]bool) error {
	rgba := toRGBA(src)
	teal := color.RGBA{R: 38, G: 166, B: 154, A: 255}
	alpha := 0.4
	height := len(mask)
	width := len(mask[0])

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			if !mask[y][x] {
				continue
			}
			orig := rgba.RGBAAt(x, y)
			rgba.SetRGBA(x, y, blend(orig, teal, alpha))
		}
	}

	return writePNG(path, rgba)
}

func saveCrackOverlay(path string, src image.Image, x1, y1, x2, y2 int) error {
	rgba := toRGBA(src)
	red := color.RGBA{R: 239, G: 68, B: 68, A: 255}
	drawRect(rgba, x1, y1, x2, y2, red, 3)
	return writePNG(path, rgba)
}

func saveCombinedOverlay(path string, src image.Image, mask [][]bool, x1, y1, x2, y2 int) error {
	rgba := toRGBA(src)
	teal := color.RGBA{R: 38, G: 166, B: 154, A: 255}
	red := color.RGBA{R: 239, G: 68, B: 68, A: 255}
	alpha := 0.35
	height := len(mask)
	width := len(mask[0])

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			if !mask[y][x] {
				continue
			}
			orig := rgba.RGBAAt(x, y)
			rgba.SetRGBA(x, y, blend(orig, teal, alpha))
		}
	}
	drawRect(rgba, x1, y1, x2, y2, red, 3)
	return writePNG(path, rgba)
}

func drawRect(img *image.RGBA, x1, y1, x2, y2 int, c color.RGBA, thickness int) {
	bounds := img.Bounds()
	if x1 < bounds.Min.X {
		x1 = bounds.Min.X
	}
	if y1 < bounds.Min.Y {
		y1 = bounds.Min.Y
	}
	if x2 > bounds.Max.X {
		x2 = bounds.Max.X
	}
	if y2 > bounds.Max.Y {
		y2 = bounds.Max.Y
	}
	if x2 <= x1 || y2 <= y1 {
		return
	}

	for t := 0; t < thickness; t++ {
		for x := x1; x < x2; x++ {
			img.SetRGBA(x, y1+t, c)
			img.SetRGBA(x, y2-1-t, c)
		}
		for y := y1; y < y2; y++ {
			img.SetRGBA(x1+t, y, c)
			img.SetRGBA(x2-1-t, y, c)
		}
	}
}

func blend(base color.RGBA, over color.RGBA, alpha float64) color.RGBA {
	inv := 1 - alpha
	return color.RGBA{
		R: uint8(float64(base.R)*inv + float64(over.R)*alpha),
		G: uint8(float64(base.G)*inv + float64(over.G)*alpha),
		B: uint8(float64(base.B)*inv + float64(over.B)*alpha),
		A: 255,
	}
}

func toRGBA(src image.Image) *image.RGBA {
	bounds := src.Bounds()
	rgba := image.NewRGBA(bounds)
	draw.Draw(rgba, bounds, src, bounds.Min, draw.Src)
	return rgba
}

func writePNG(path string, img image.Image) error {
	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create png file: %w", err)
	}
	defer file.Close()
	if err := png.Encode(file, img); err != nil {
		return fmt.Errorf("encode png: %w", err)
	}
	return nil
}

func intPtr(v int) *int {
	return &v
}

func floatPtr(v float64) *float64 {
	return &v
}

func strPtr(v string) *string {
	return &v
}
