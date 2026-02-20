package models

import "time"

const (
	ExcavationStatusOver   = "over_excavation"
	ExcavationStatusUnder  = "under_excavation"
	ExcavationStatusNormal = "within_tolerance"
)

const (
	AnalysisStatusPending    = "pending"
	AnalysisStatusProcessing = "processing"
	AnalysisStatusCompleted  = "completed"
	AnalysisStatusFailed     = "failed"
)

const (
	AnalysisTypeFaceSegmentation = "face_segmentation"
	AnalysisTypeCrackDetection   = "crack_detection"
	AnalysisTypeFull             = "full"
)

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"size:50;uniqueIndex;not null" json:"username"`
	PasswordHash string    `gorm:"size:128;not null" json:"-"`
	IsActive     bool      `gorm:"not null;default:true" json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	Analyses     []Analysis
}

func (User) TableName() string {
	return "users"
}

type Analysis struct {
	ID     uint `gorm:"primaryKey"`
	UserID uint `gorm:"not null;index"`

	AnalysisType string `gorm:"size:20;not null;default:full"`

	OriginalImage        string  `gorm:"size:255;not null"`
	MaskImage            *string `gorm:"size:255"`
	OverlayImage         *string `gorm:"size:255"`
	CrackMaskImage       *string `gorm:"size:255"`
	CrackOverlayImage    *string `gorm:"size:255"`
	CombinedOverlayImage *string `gorm:"size:255"`

	Status            string `gorm:"size:20;not null;default:pending"`
	PixelCount        *int   `gorm:"index"`
	ActualAreaM2      *float64
	DesignAreaM2      *float64
	ScaleMMPerPixel   *float64
	DifferenceM2      *float64
	DifferencePercent *float64
	ExcavationStatus  *string `gorm:"size:20;index"`

	Confidence      *float64
	IOU             *float64
	CrackCount      *int
	CrackPixelCount *int
	CrackConfidence *float64

	ErrorMessage *string `gorm:"type:text"`

	CreatedAt   time.Time
	CompletedAt *time.Time

	User User
}

func (Analysis) TableName() string {
	return "analyses"
}
