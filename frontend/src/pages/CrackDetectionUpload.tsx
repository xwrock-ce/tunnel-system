import React, { useEffect, useState } from 'react'
import {
  Card, Button, Form, Progress, Row, Col,
  Typography, Image, Tag, Divider, message, Space, Tabs, Alert, Statistic
} from 'antd'
import { ReloadOutlined, FileSearchOutlined, HistoryOutlined, DeleteOutlined, PaperClipOutlined, WarningOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAnalysisStore } from '@/stores/useAnalysisStore'
import { useAppSettingsStore } from '@/stores/useAppSettingsStore'
import { analysisApi } from '@/api/client'
import DropZone from '@/components/DropZone'
import StatePanel from '@/components/feedback/StatePanel'
import { UI_COPY } from '@/constants/uiCopy'

const { Title, Text } = Typography

type UploadMode = 'single' | 'batch'

interface SelectedFile {
  file: File
  name: string
  previewUrl?: string
}

const CrackDetectionUpload: React.FC = () => {
  const navigate = useNavigate()
  const [mode, setMode] = useState<UploadMode>('single')
  const [singleFile, setSingleFile] = useState<SelectedFile | null>(null)
  const [batchFiles, setBatchFiles] = useState<SelectedFile[]>([])
  const [batchTaskIds, setBatchTaskIds] = useState<number[] | null>(null)
  const [form] = Form.useForm()
  const analysisDefaults = useAppSettingsStore((s) => s.analysisDefaults)

  const {
    currentAnalysis,
    currentAnalysisType,
    isAnalyzing,
    progress,
    progressMessage,
    uploadAndAnalyze,
    uploadBatch,
    clearCurrent
  } = useAnalysisStore()

  const isAnalyzingForPage = isAnalyzing && currentAnalysisType === 'crack_detection'
  const selectedCount = mode === 'single' ? (singleFile ? 1 : 0) : batchFiles.length
  const modeText = mode === 'single' ? UI_COPY.upload.crack.status.singleMode : UI_COPY.upload.crack.status.batchMode

  useEffect(() => {
    if (isAnalyzingForPage) return
    form.setFieldsValue({
      confidence_threshold: 0.5,
    })
  }, [form, isAnalyzingForPage])
  useEffect(() => {
    return () => {
      if (singleFile?.previewUrl) {
        URL.revokeObjectURL(singleFile.previewUrl)
      }
    }
  }, [singleFile])

  useEffect(() => {
    return () => {
      batchFiles.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
      })
    }
  }, [batchFiles])

  const handleSingleFileSelected = (files: File[]) => {
    const file = files[0]
    if (file) {
      const previewUrl = URL.createObjectURL(file)
      setSingleFile({ file, name: file.name, previewUrl })
    }
  }

  const handleBatchFilesSelected = (files: File[]) => {
    const newFiles: SelectedFile[] = files.map(file => ({
      file,
      name: file.name,
    }))
    setBatchFiles(prev => [...prev, ...newFiles].slice(0, 50))
  }

  const handleSingleUpload = async () => {
    if (!singleFile) {
      message.warning('请先选择图片')
      return
    }
    // Use crack_detection analysis type, pass default values for design_area and scale
    await uploadAndAnalyze(singleFile.file, analysisDefaults.designArea, analysisDefaults.scale, 'crack_detection')
  }

  const handleBatchUpload = async () => {
    if (batchFiles.length === 0) {
      message.warning('请先选择图片')
      return
    }
    const files = batchFiles.map(f => f.file)
    // Use crack_detection analysis type
    const taskIds = await uploadBatch(files, analysisDefaults.designArea, analysisDefaults.scale, 'crack_detection')
    if (!taskIds) {
      message.error('批量任务创建失败')
      return
    }
    setBatchTaskIds(taskIds)
    message.success(`已启动 ${taskIds.length} 个裂缝检测任务`)
  }

  const handleResetSingle = () => {
    if (singleFile?.previewUrl) {
      URL.revokeObjectURL(singleFile.previewUrl)
    }
    setSingleFile(null)
    clearCurrent()
  }

  const handleResetBatch = () => {
    batchFiles.forEach(f => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
    })
    setBatchFiles([])
    setBatchTaskIds(null)
  }

  const handleRemoveBatchFile = (index: number) => {
    setBatchFiles(prev => {
      const removed = prev[index]
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  const getCrackSeverityTag = (count: number) => {
    if (count === 0) {
      return <Tag color="green">无裂缝</Tag>
    } else if (count <= 3) {
      return <Tag color="orange">轻微</Tag>
    } else if (count <= 10) {
      return <Tag color="red">中等</Tag>
    } else {
      return <Tag color="magenta">严重</Tag>
    }
  }

  return (
    <div className="upload-page">
      <div className="page-header">
        <Title level={4} className="page-title">
          {UI_COPY.upload.crack.pageTitle}
        </Title>
      </div>

      <Alert
        message={UI_COPY.upload.crack.alert.message}
        description={UI_COPY.upload.crack.alert.description}
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        className="upload-page-alert"
      />

      <div className="upload-status-strip upload-status-strip-warning">
        <span className="upload-status-item">{modeText}</span>
        <span className="upload-status-item">{UI_COPY.upload.crack.status.selectedPrefix}{selectedCount}</span>
        <span className={`upload-status-item ${isAnalyzingForPage ? 'is-active' : ''}`}>
          {isAnalyzingForPage ? UI_COPY.upload.crack.status.active : UI_COPY.upload.crack.status.idle}
        </span>
      </div>

      <Tabs
        activeKey={mode}
        onChange={(key) => setMode(key as UploadMode)}
        destroyInactiveTabPane
        className="upload-tabs"
        items={[
          {
            key: 'single',
            label: UI_COPY.upload.crack.tabs.single,
            children: currentAnalysis && currentAnalysis.analysis_type === 'crack_detection' ? (
              <Card
                title={
                  <Space>
                    <span>{UI_COPY.upload.crack.resultCardTitle}</span>
                    {currentAnalysis.metrics && getCrackSeverityTag(currentAnalysis.metrics.crack_count || 0)}
                  </Space>
                }
                extra={
                  <Space>
                    <Button
                      icon={<FileSearchOutlined />}
                      onClick={() => navigate(`/report/${currentAnalysis.id}`)}
                      disabled={currentAnalysis.status !== 'completed'}
                    >
                      {UI_COPY.upload.crack.detailButtons.viewReport}
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={handleResetSingle}>
                      {UI_COPY.upload.crack.detailButtons.restart}
                    </Button>
                  </Space>
                }
                variant="borderless"
                className="card-surface"
              >
                {currentAnalysis.status === 'completed' ? (
                  <>
                    <Row gutter={24}>
                      <Col xs={24} md={12}>
                        <div className="upload-preview-title">
                          <Text strong>{UI_COPY.upload.crack.preview.original}</Text>
                        </div>
                        <Image
                          src={analysisApi.getImageUrl(currentAnalysis.id, 'original')}
                          className="upload-preview-image"
                        />
                      </Col>
                      <Col xs={24} md={12}>
                        <div className="upload-preview-title">
                          <Text strong>{UI_COPY.upload.crack.preview.result}</Text>
                        </div>
                        <Image
                          src={analysisApi.getImageUrl(currentAnalysis.id, 'crack_overlay')}
                          className="upload-preview-image"
                          fallback={analysisApi.getImageUrl(currentAnalysis.id, 'original')}
                        />
                      </Col>
                    </Row>

                    <Divider />

                    <Row gutter={[24, 24]}>
                      <Col xs={12} sm={8}>
                        <Statistic
                          title={UI_COPY.upload.crack.metrics.crackCount}
                          value={currentAnalysis.metrics?.crack_count || 0}
                          suffix="条"
                          valueStyle={{ color: (currentAnalysis.metrics?.crack_count || 0) > 0 ? '#cf1322' : '#3f8600' }}
                        />
                      </Col>
                      <Col xs={12} sm={8}>
                        <Statistic
                          title={UI_COPY.upload.crack.metrics.confidence}
                          value={((currentAnalysis.metrics?.crack_confidence || 0) * 100).toFixed(1)}
                          suffix="%"
                          precision={1}
                        />
                      </Col>
                      <Col xs={12} sm={8}>
                        <Statistic
                          title={UI_COPY.upload.crack.metrics.areaPixels}
                          value={currentAnalysis.metrics?.crack_pixel_count || 0}
                          suffix="px"
                        />
                      </Col>
                    </Row>

                    {(currentAnalysis.metrics?.crack_count || 0) > 0 && (
                      <>
                        <Divider />
                        <Alert
                          message={UI_COPY.upload.crack.crackDetected.message}
                          description={UI_COPY.upload.crack.crackDetected.description(currentAnalysis.metrics?.crack_count || 0)}
                          type="warning"
                          showIcon
                        />
                      </>
                    )}
                  </>
                ) : currentAnalysis.status === 'failed' ? (
                  <StatePanel
                    mode="error"
                    title={UI_COPY.upload.crackTaskFailed.title}
                    description={currentAnalysis.error_message || UI_COPY.upload.crackTaskFailed.fallbackDescription}
                    variant="card"
                    action={
                      <Button type="primary" onClick={handleResetSingle}>
                        {UI_COPY.upload.crackTaskFailed.actionText}
                      </Button>
                    }
                  />
                ) : (
                  <StatePanel
                    mode="info"
                    title={UI_COPY.upload.crackTaskProcessing.title}
                    description={UI_COPY.upload.crackTaskProcessing.description}
                    variant="card"
                    compact
                  />
                )}
              </Card>
            ) : (
              <Row gutter={24}>
                <Col xs={24} lg={16}>
                  <Card title={UI_COPY.upload.crack.cards.singleImage} variant="borderless" className="card-surface upload-workspace-card">
                    <DropZone
                      onFilesSelected={handleSingleFileSelected}
                      disabled={isAnalyzingForPage}
                      maxSizeMB={20}
                    />

                    {singleFile && (
                      <div className="upload-preview-panel">
                        <div className="upload-file-item">
                          <PaperClipOutlined />
                          <Text ellipsis className="upload-file-name">{singleFile.name}</Text>
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={handleResetSingle}
                            disabled={isAnalyzingForPage}
                          />
                        </div>
                        {singleFile.previewUrl && (
                          <Image
                            src={singleFile.previewUrl}
                            className="upload-preview-image"
                          />
                        )}
                      </div>
                    )}

                    {isAnalyzingForPage && (
                      <div className="upload-progress-panel">
                        <Progress percent={progress} status="active" strokeColor="var(--journal-under)" />
                        <Text type="secondary">{progressMessage}</Text>
                      </div>
                    )}
                  </Card>
                </Col>

                <Col xs={24} lg={8}>
                  <Card
                    title={UI_COPY.upload.crack.cards.config}
                    variant="borderless"
                    className="card-surface upload-config-card"
                  >
                    <Form
                      form={form}
                      layout="vertical"
                      initialValues={{
                        confidence_threshold: 0.5,
                      }}
                    >
                      <Alert
                        message={UI_COPY.upload.crack.configAlert.single.message}
                        description={UI_COPY.upload.crack.configAlert.single.description}
                        type="info"
                        className="upload-page-alert"
                      />

                      <Form.Item>
                        <Button
                          type="primary"
                          onClick={handleSingleUpload}
                          loading={isAnalyzingForPage}
                          disabled={!singleFile || isAnalyzingForPage}
                          block
                          size="large"
                          className="upload-warn-btn"
                        >
                          {isAnalyzingForPage ? UI_COPY.upload.crack.buttons.detecting : UI_COPY.upload.crack.buttons.startSingle}
                        </Button>
                      </Form.Item>
                    </Form>
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'batch',
            label: UI_COPY.upload.crack.tabs.batch,
            children: batchTaskIds ? (
              <Card variant="borderless" className="card-surface">
                <StatePanel
                  mode="info"
                  title={UI_COPY.upload.batchStarted.title}
                  description={UI_COPY.upload.batchStarted.crackDescription(batchTaskIds.length)}
                  variant="card"
                  action={
                    <Space>
                      <Button icon={<HistoryOutlined />} type="primary" onClick={() => navigate('/history')}>
                        {UI_COPY.upload.batchStarted.actions.viewHistory}
                      </Button>
                      <Button onClick={handleResetBatch}>{UI_COPY.upload.batchStarted.actions.continueUpload}</Button>
                    </Space>
                  }
                />
              </Card>
            ) : (
              <Row gutter={24}>
                <Col xs={24} lg={16}>
                  <Card title={UI_COPY.upload.crack.cards.batchImages} variant="borderless" className="card-surface upload-workspace-card">
                    <DropZone
                      onFilesSelected={handleBatchFilesSelected}
                      multiple
                      maxFiles={50}
                      disabled={isAnalyzingForPage}
                      maxSizeMB={20}
                    />

                    {batchFiles.length > 0 && (
                      <div className="upload-preview-panel">
                        <div className="upload-file-row-head">
                          <Text type="secondary">{UI_COPY.upload.shared.selectedFilesText(batchFiles.length)}</Text>
                          <Button
                            type="link"
                            size="small"
                            danger
                            onClick={handleResetBatch}
                            disabled={isAnalyzingForPage}
                          >
                            {UI_COPY.upload.crack.buttons.clear}
                          </Button>
                        </div>
                        <div className="upload-file-list">
                          {batchFiles.map((f, i) => (
                            <div
                              key={`${f.name}-${i}`}
                              className="upload-file-row"
                            >
                              <PaperClipOutlined />
                              <Text ellipsis className="upload-file-name upload-list-file-name">{f.name}</Text>
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => handleRemoveBatchFile(i)}
                                disabled={isAnalyzingForPage}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isAnalyzingForPage && (
                      <div className="upload-progress-panel">
                        <Progress percent={progress} status="active" strokeColor="var(--journal-under)" />
                        <Text type="secondary">{progressMessage}</Text>
                      </div>
                    )}
                  </Card>
                </Col>
                <Col xs={24} lg={8}>
                  <Card
                    title={UI_COPY.upload.crack.cards.config}
                    variant="borderless"
                    className="card-surface upload-config-card"
                  >
                    <Form
                      form={form}
                      layout="vertical"
                    >
                      <Alert
                        message={UI_COPY.upload.crack.configAlert.batch.message}
                        description={UI_COPY.upload.crack.configAlert.batch.description}
                        type="info"
                        className="upload-page-alert"
                      />

                      <Form.Item>
                        <Button
                          type="primary"
                          onClick={handleBatchUpload}
                          loading={isAnalyzingForPage}
                          disabled={batchFiles.length === 0 || isAnalyzingForPage}
                          block
                          size="large"
                          className="upload-warn-btn"
                        >
                          {isAnalyzingForPage ? UI_COPY.upload.crack.buttons.submitting : UI_COPY.upload.crack.buttons.startBatch}
                        </Button>
                      </Form.Item>
                      <Form.Item className="upload-form-item-no-bottom">
                        <Button block onClick={() => navigate('/history')} icon={<HistoryOutlined />}>
                          {UI_COPY.upload.crack.buttons.viewHistory}
                        </Button>
                      </Form.Item>
                    </Form>
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </div>
  )
}

export default CrackDetectionUpload
