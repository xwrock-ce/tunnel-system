import React, { useState, useRef, useCallback } from 'react'
import { InboxOutlined } from '@ant-design/icons'
import { Button, message } from 'antd'

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

  return (
    <>
      {/* Hidden file input - visually hidden but still clickable */}
      <input
        type="file"
        ref={inputRef}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
      />

      {/* Drop zone area */}
      <div
        className="dropzone"
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
        style={{
          padding: '32px 24px',
          background: isDragging ? 'rgba(79, 70, 229, 0.06)' : 'rgba(255, 255, 255, 0.55)',
          border: `1px dashed ${isDragging ? 'rgba(79, 70, 229, 0.6)' : 'rgba(15, 23, 42, 0.18)'}`,
          borderRadius: 14,
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {children || (
          <>
            <p style={{ marginBottom: 8 }}>
              <InboxOutlined style={{ fontSize: 48, color: 'rgba(79, 70, 229, 0.65)' }} />
            </p>
            <p style={{ fontSize: 16, color: '#334155', marginBottom: 4 }}>
              拖拽图片到此处
            </p>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
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
