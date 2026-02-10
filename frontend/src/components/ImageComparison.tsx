import React, { useEffect, useRef, useState, useCallback } from 'react'

export type ImageComparisonHeight = number | string

interface ImageComparisonProps {
  leftImage: string
  rightImage: string
  leftLabel?: string
  rightLabel?: string
  height?: ImageComparisonHeight
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const ImageComparison: React.FC<ImageComparisonProps> = ({
  leftImage,
  rightImage,
  leftLabel = 'Original',
  rightLabel = 'Overlay',
  height = '500px',
}) => {
  const [sliderPosition, setSliderPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const moveSliderByClientX = useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const nextValue = ((clientX - rect.left) / rect.width) * 100
    setSliderPosition(clamp(nextValue, 0, 100))
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true)
    setHasInteracted(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    moveSliderByClientX(event.clientX)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    moveSliderByClientX(event.clientX)
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(() => {
    const handlePointerUp = () => setIsDragging(false)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      setHasInteracted(true)
      setSliderPosition((prev) => clamp(prev - 2, 0, 100))
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      setHasInteracted(true)
      setSliderPosition((prev) => clamp(prev + 2, 0, 100))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setHasInteracted(true)
      setSliderPosition(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setHasInteracted(true)
      setSliderPosition(100)
    }
  }

  return (
    <div
      ref={containerRef}
      className="image-compare"
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setIsDragging(false)}
    >
      {!hasInteracted && <div className="image-compare-hint">拖动分隔线对比</div>}

      <img src={rightImage} alt={rightLabel} className="image-compare-image" draggable={false} />
      <div className="image-compare-label image-compare-label--right">{rightLabel}</div>

      <img
        src={leftImage}
        alt={leftLabel}
        className="image-compare-image"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        draggable={false}
      />
      <div className="image-compare-label image-compare-label--left">{leftLabel}</div>

      <div
        className="image-compare-slider"
        style={{ left: `${sliderPosition}%` }}
        role="slider"
        aria-label="图像对比滑块"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(sliderPosition)}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div className="image-compare-knob" aria-hidden="true">
          ⬌
        </div>
      </div>
    </div>
  )
}

export default ImageComparison
