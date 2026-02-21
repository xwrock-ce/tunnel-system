import { useEffect, useState } from 'react'

type SelectedFile = {
  file: File
  name: string
  previewUrl?: string
}

const revokePreview = (file: SelectedFile | null) => {
  if (file?.previewUrl) {
    URL.revokeObjectURL(file.previewUrl)
  }
}

const revokePreviews = (files: SelectedFile[]) => {
  files.forEach((file) => {
    if (file.previewUrl) {
      URL.revokeObjectURL(file.previewUrl)
    }
  })
}

export const useUploadFiles = (maxBatchFiles = 50) => {
  const [singleFile, setSingleFile] = useState<SelectedFile | null>(null)
  const [batchFiles, setBatchFiles] = useState<SelectedFile[]>([])

  useEffect(() => {
    return () => {
      revokePreview(singleFile)
    }
  }, [singleFile])

  useEffect(() => {
    return () => {
      revokePreviews(batchFiles)
    }
  }, [batchFiles])

  const handleSingleFileSelected = (files: File[]) => {
    const file = files[0]
    if (!file) return

    const previewUrl = URL.createObjectURL(file)
    setSingleFile({ file, name: file.name, previewUrl })
  }

  const handleBatchFilesSelected = (files: File[]) => {
    const newFiles: SelectedFile[] = files.map((file) => ({
      file,
      name: file.name,
    }))

    setBatchFiles((prev) => [...prev, ...newFiles].slice(0, maxBatchFiles))
  }

  const clearSingleFile = () => {
    revokePreview(singleFile)
    setSingleFile(null)
  }

  const clearBatchFiles = () => {
    revokePreviews(batchFiles)
    setBatchFiles([])
  }

  const removeBatchFile = (index: number) => {
    setBatchFiles((prev) => {
      const removed = prev[index]
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl)
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  return {
    singleFile,
    batchFiles,
    handleSingleFileSelected,
    handleBatchFilesSelected,
    clearSingleFile,
    clearBatchFiles,
    removeBatchFile,
  }
}

export type { SelectedFile }
