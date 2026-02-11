import React, { useState, useRef, useCallback } from 'react'
import { InboxOutlined } from '@ant-design/icons'
import { Button, message } from 'antd'

const inputVisuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void
  multiple?: boolean
  maxFiles?: number
  disabled?: boolean
  accept?: string
  maxSizeMB?: number
  children?: React.ReactNode
}

const DropZone: React.FC<DropZoneProps> = ({
  onFilesSelected,
  multiple = false,
  maxFiles = 1,
  disabled = false,
  accept = 'image/*',
  maxSizeMB = 20,
  children
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)
  const isClickPending = useRef(false)

  const modeLabel = multiple ? `最多 ${maxFiles} 张` : '单张上传'

  const validateFiles = useCallback((files: File[]): File[] => {
    const validFiles: File[] = []
    const maxBytes = maxSizeMB * 1024 * 1024

    for (const file of files.slice(0, maxFiles)) {
      if (!file.type.startsWith('image/')) {
        message.error(`${file.name} 不是图片文件`)
        continue
      }
      if (file.size > maxBytes) {
        message.error(`${file.name} 超过 ${maxSizeMB}MB 限制`)
        continue
      }
      validFiles.push(file)
    }

    return validFiles
  }, [maxFiles, maxSizeMB])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    if (disabled) return

    const files = Array.from(e.dataTransfer.files)
    const validFiles = validateFiles(files)
    if (validFiles.length > 0) {
      onFilesSelected(validFiles)
    }
  }, [disabled, validateFiles, onFilesSelected])

  const handleClick = useCallback(() => {
    // Guard against double-clicks (React StrictMode can trigger twice)
    if (!disabled && !isClickPending.current) {
      isClickPending.current = true
      inputRef.current?.click()
      // Reset after a short delay
      setTimeout(() => {
        isClickPending.current = false
      }, 100)
    }
  }, [disabled])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const validFiles = validateFiles(files)
    if (validFiles.length > 0) {
      onFilesSelected(validFiles)
    }
    // Reset input to allow selecting the same file again
    e.target.value = ''
  }, [validateFiles, onFilesSelected])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }, [disabled, handleClick])

  const dropzoneClasses = [
    'dropzone',
    isDragging ? 'dropzone--dragging' : '',
    disabled ? 'dropzone--disabled' : '',
  ].filter(Boolean).join(' ')

  const dropzoneStyle: React.CSSProperties = {
    background: isDragging ? 'rgba(43, 98, 152, 0.1)' : 'rgba(255, 255, 255, 0.62)',
    borderColor: isDragging ? 'rgba(43, 98, 152, 0.66)' : 'rgba(43, 62, 85, 0.2)',
  }

  return (
    <>
      {/* Hidden file input - visually hidden but still clickable */}
      <input
        type="file"
        ref={inputRef}
        style={inputVisuallyHiddenStyle}
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
      />

      {/* Drop zone area */}
      <div
        className={dropzoneClasses}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        title={disabled ? '上传中，暂不可用' : '点击或拖拽图片上传'}
        style={dropzoneStyle}
      >
        <span className="dropzone-mode-tag">{modeLabel}</span>
        {children || (
          <>
            <p className="dropzone-icon-wrap">
              <InboxOutlined className="dropzone-icon" />
            </p>
            <p className="dropzone-title">
              拖拽图片到此处
            </p>
            <p className="dropzone-desc">
              支持 JPG、PNG 格式，单个文件最大 {maxSizeMB}MB
            </p>
            <Button
              type="primary"
              ghost
              onClick={handleClick}
              disabled={disabled}
            >
              或点击选择文件
            </Button>
          </>
        )}
      </div>
    </>
  )
}

export default DropZone
