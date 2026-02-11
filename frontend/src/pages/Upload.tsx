import React, { useEffect, useState } from 'react'
import {
  Card, Button, Form, InputNumber, Progress, Row, Col,
  Typography, Image, Tag, Descriptions, Divider, message, Space, Tabs
} from 'antd'
import { ReloadOutlined, FileSearchOutlined, HistoryOutlined, DeleteOutlined, PaperClipOutlined } from '@ant-design/icons'
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

const Upload_Page: React.FC = () => {
  const navigate = useNavigate()
  const [mode, setMode] = useState<UploadMode>('single')
  const [singleFile, setSingleFile] = useState<SelectedFile | null>(null)
  const [batchFiles, setBatchFiles] = useState<SelectedFile[]>([])
  const [batchTaskIds, setBatchTaskIds] = useState<number[] | null>(null)
  const [form] = Form.useForm()
  const analysisDefaults = useAppSettingsStore((s) => s.analysisDefaults)

  const {
    currentAnalysis,
    isAnalyzing,
    progress,
    progressMessage,
    uploadAndAnalyze,
    uploadBatch,
    clearCurrent
  } = useAnalysisStore()

  useEffect(() => {
    if (isAnalyzing) return
    form.setFieldsValue({
      design_area: analysisDefaults.designArea,
      scale: analysisDefaults.scale,
    })
  }, [analysisDefaults.designArea, analysisDefaults.scale, form, isAnalyzing])

  // Cleanup preview URLs on unmount or file change
  useEffect(() => {
    return () => {
      if (singleFile?.previewUrl) {
        URL.revokeObjectURL(singleFile.previewUrl)
      }
    }
  }, [singleFile])

  // Cleanup batch preview URLs
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

    const values = form.getFieldsValue()
    await uploadAndAnalyze(singleFile.file, values.design_area, values.scale)
  }

  const handleBatchUpload = async () => {
    if (batchFiles.length === 0) {
      message.warning('请先选择图片')
      return
    }
    const values = form.getFieldsValue()
    const files = batchFiles.map(f => f.file)

    const taskIds = await uploadBatch(files, values.design_area, values.scale)
    if (!taskIds) {
      message.error('批量任务创建失败')
      return
    }
    setBatchTaskIds(taskIds)
    message.success(`已启动 ${taskIds.length} 个任务`)
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

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'over_excavation':
        return <Tag color="red">超挖</Tag>
      case 'under_excavation':
        return <Tag color="orange">欠挖</Tag>
      case 'within_tolerance':
        return <Tag color="green">合格</Tag>
      default:
        return <Tag>{status}</Tag>
    }
  }

  return (
    <div className="upload-page">
      <div className="page-header">
        <Title level={4} className="page-title">
          {UI_COPY.upload.shared.pageTitle}
        </Title>
      </div>

      <Tabs
        activeKey={mode}
        onChange={(key) => setMode(key as UploadMode)}
        destroyInactiveTabPane
        className="upload-tabs"
        items={[
          {
            key: 'single',
            label: UI_COPY.upload.shared.tabs.single,
            children: currentAnalysis ? (
              <Card
                title={
                  <Space>
                    <span>{UI_COPY.upload.shared.resultCardTitle}</span>
                    {currentAnalysis.excavation && getStatusTag(currentAnalysis.excavation.status)}
                  </Space>
                }
                extra={
                  <Space>
                    <Button
                      icon={<FileSearchOutlined />}
                      onClick={() => navigate(`/report/${currentAnalysis.id}`)}
                      disabled={currentAnalysis.status !== 'completed'}
                    >
                      {UI_COPY.upload.shared.detailButtons.viewReport}
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={handleResetSingle}>
                      {UI_COPY.upload.shared.detailButtons.restart}
                    </Button>
                  </Space>
                }
                bordered={false}
                className="card-surface"
              >
                {currentAnalysis.status === 'completed' && currentAnalysis.excavation ? (
                  <>
              <Row gutter={24}>
                <Col xs={24} md={12}>
                        <div className="upload-preview-title">
                          <Text strong>{UI_COPY.upload.shared.preview.original}</Text>
                        </div>
                        <Image
                          src={analysisApi.getImageUrl(currentAnalysis.id, 'original')}
                          className="upload-preview-image"
                        />
                      </Col>
                      <Col xs={24} md={12}>
                        <div className="upload-preview-title">
                          <Text strong>{UI_COPY.upload.shared.preview.segmented}</Text>
                        </div>
                        <Tabs
                          size="small"
                          items={[
                            {
                              key: 'combined',
                              label: UI_COPY.upload.shared.preview.combined,
                              children: (
                                <Image
                                  src={analysisApi.getImageUrl(
                                    currentAnalysis.id,
                                    currentAnalysis.combined_overlay_image_url ? 'combined_overlay' : 'overlay'
                                  )}
                                  className="upload-preview-image"
                                />
                              ),
                            },
                            {
                              key: 'face',
                              label: UI_COPY.upload.shared.preview.face,
                              children: (
                                <Image
                                  src={analysisApi.getImageUrl(currentAnalysis.id, 'overlay')}
                                  className="upload-preview-image"
                                />
                              ),
                            },
                            ...(currentAnalysis.crack_overlay_image_url
                              ? [
                                {
                                  key: 'crack',
                                  label: UI_COPY.upload.shared.preview.crack,
                                  children: (
                                    <Image
                                      src={analysisApi.getImageUrl(currentAnalysis.id, 'crack_overlay')}
                                      className="upload-preview-image"
                                    />
                                  ),
                                },
                              ]
                              : []),
                          ]}
                        />
                      </Col>
                    </Row>

                    <Divider />

                    <Descriptions title={UI_COPY.upload.shared.analysisSummaryTitle} bordered column={{ xs: 1, sm: 2, md: 3 }}>
                      <Descriptions.Item label="像素数量">
                        {currentAnalysis.excavation.pixel_count.toLocaleString()}
                      </Descriptions.Item>
                      <Descriptions.Item label="实际面积">
                        {currentAnalysis.excavation.actual_area_m2.toFixed(2)} m²
                      </Descriptions.Item>
                      <Descriptions.Item label="设计面积">
                        {currentAnalysis.excavation.design_area_m2.toFixed(2)} m²
                      </Descriptions.Item>
                      <Descriptions.Item label="比例尺">
                        {currentAnalysis.scale_mm_per_pixel
                          ? `${currentAnalysis.scale_mm_per_pixel.toFixed(2)} mm/pixel`
                          : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="面积差值">
                        <Text type={currentAnalysis.excavation.difference_m2 > 0 ? 'danger' : 'warning'}>
                          {currentAnalysis.excavation.difference_m2 > 0 ? '+' : ''}
                          {currentAnalysis.excavation.difference_m2.toFixed(2)} m²
                        </Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="偏差比例">
                        <Text type={Math.abs(currentAnalysis.excavation.difference_percent) > 2 ? 'danger' : 'success'}>
                          {currentAnalysis.excavation.difference_percent > 0 ? '+' : ''}
                          {currentAnalysis.excavation.difference_percent.toFixed(2)}%
                        </Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="检测置信度">
                        {((currentAnalysis.metrics?.confidence || 0) * 100).toFixed(1)}%
                      </Descriptions.Item>
                      <Descriptions.Item label="裂缝数量">
                        {currentAnalysis.metrics?.crack_count ?? '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="裂缝置信度">
                        {currentAnalysis.metrics?.crack_confidence === null || currentAnalysis.metrics?.crack_confidence === undefined
                          ? '-'
                          : `${((currentAnalysis.metrics?.crack_confidence ?? 0) * 100).toFixed(1)}%`}
                      </Descriptions.Item>
                    </Descriptions>
                  </>
                ) : currentAnalysis.status === 'failed' ? (
                  <StatePanel
                    mode="error"
                    title={UI_COPY.upload.taskFailed.title}
                    description={currentAnalysis.error_message || UI_COPY.upload.taskFailed.fallbackDescription}
                    variant="card"
                    action={
                      <Button type="primary" onClick={handleResetSingle}>
                        {UI_COPY.upload.taskFailed.actionText}
                      </Button>
                    }
                  />
                ) : (
                  <StatePanel
                    mode="info"
                    title={UI_COPY.upload.taskProcessing.title}
                    description={UI_COPY.upload.taskProcessing.description}
                    variant="card"
                    compact
                  />
                )}
              </Card>
            ) : (
              <Row gutter={24}>
                <Col xs={24} lg={16}>
                  <Card title={UI_COPY.upload.shared.cards.singleImage} bordered={false} className="card-surface upload-workspace-card">
                    <DropZone
                      onFilesSelected={handleSingleFileSelected}
                      disabled={isAnalyzing}
                      maxSizeMB={20}
                    />

                    {singleFile && (
                      <div className="upload-preview-panel">
                        <div className="upload-file-item">
                          <PaperClipOutlined />
                          <Text className="upload-list-file-name">{singleFile.name}</Text>
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={handleResetSingle}
                            disabled={isAnalyzing}
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

                    {isAnalyzing && (
                      <div className="upload-progress-panel">
                        <Progress percent={progress} status="active" strokeColor="var(--ui-primary)" />
                        <Text type="secondary">{progressMessage}</Text>
                      </div>
                    )}
                  </Card>
                </Col>

                <Col xs={24} lg={8}>
                  <Card
                    title={UI_COPY.upload.shared.cards.config}
                    bordered={false}
                    className="card-surface upload-config-card"
                    extra={<Text type="secondary" className="upload-config-extra-note">{UI_COPY.upload.shared.configNote}</Text>}
                  >
                    <Form
                      form={form}
                      layout="vertical"
                      initialValues={{
                        design_area: analysisDefaults.designArea,
                        scale: analysisDefaults.scale,
                      }}
                    >
                      <Form.Item name="design_area" label={UI_COPY.upload.shared.fields.designAreaLabel} tooltip={UI_COPY.upload.shared.fields.designAreaTooltip}>
                        <InputNumber className="upload-full-width-input" min={0.01} precision={2} disabled={isAnalyzing} />
                      </Form.Item>

                      <Form.Item name="scale" label={UI_COPY.upload.shared.fields.scaleLabel} tooltip={UI_COPY.upload.shared.fields.scaleTooltip}>
                        <InputNumber className="upload-full-width-input" min={0.01} precision={2} disabled={isAnalyzing} />
                      </Form.Item>

                      <Form.Item>
                        <Button
                          type="primary"
                          onClick={handleSingleUpload}
                          loading={isAnalyzing}
                          block
                          size="large"
                        >
                          {isAnalyzing ? UI_COPY.upload.shared.buttons.analyzing : UI_COPY.upload.shared.buttons.startSingle}
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
            label: UI_COPY.upload.shared.tabs.batch,
            children: batchTaskIds ? (
              <Card bordered={false} className="card-surface">
                <StatePanel
                  mode="info"
                  title={UI_COPY.upload.batchStarted.title}
                  description={UI_COPY.upload.batchStarted.description(batchTaskIds.length)}
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
                  <Card title={UI_COPY.upload.shared.cards.batchImages} bordered={false} className="card-surface upload-workspace-card">
                    <DropZone
                      onFilesSelected={handleBatchFilesSelected}
                      multiple
                      maxFiles={50}
                      disabled={isAnalyzing}
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
                            disabled={isAnalyzing}
                          >
                            {UI_COPY.upload.shared.buttons.clear}
                          </Button>
                        </div>
                        <div className="upload-file-list">
                          {batchFiles.map((f, i) => (
                            <div
                              key={i}
                              className="upload-file-row"
                            >
                              <PaperClipOutlined />
                              <Text ellipsis className="upload-list-file-name">{f.name}</Text>
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => handleRemoveBatchFile(i)}
                                disabled={isAnalyzing}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isAnalyzing && (
                      <div className="upload-progress-panel">
                        <Progress percent={progress} status="active" strokeColor="var(--ui-primary)" />
                        <Text type="secondary">{progressMessage}</Text>
                      </div>
                    )}
                  </Card>
                </Col>
                <Col xs={24} lg={8}>
                  <Card
                    title={UI_COPY.upload.shared.cards.config}
                    bordered={false}
                    className="card-surface upload-config-card"
                    extra={<Text type="secondary" className="upload-config-extra-note">{UI_COPY.upload.shared.configNote}</Text>}
                  >
                    <Form
                      form={form}
                      layout="vertical"
                      initialValues={{
                        design_area: analysisDefaults.designArea,
                        scale: analysisDefaults.scale,
                      }}
                    >
                      <Form.Item name="design_area" label={UI_COPY.upload.shared.fields.designAreaLabel} tooltip={UI_COPY.upload.shared.fields.designAreaTooltip}>
                        <InputNumber className="upload-full-width-input" min={0.01} precision={2} disabled={isAnalyzing} />
                      </Form.Item>

                      <Form.Item name="scale" label={UI_COPY.upload.shared.fields.scaleLabel} tooltip={UI_COPY.upload.shared.fields.scaleTooltip}>
                        <InputNumber className="upload-full-width-input" min={0.01} precision={2} disabled={isAnalyzing} />
                      </Form.Item>

                      <Form.Item>
                        <Button
                          type="primary"
                          onClick={handleBatchUpload}
                          loading={isAnalyzing}
                          block
                          size="large"
                        >
                          {isAnalyzing ? UI_COPY.upload.shared.buttons.submitting : UI_COPY.upload.shared.buttons.startBatch}
                        </Button>
                      </Form.Item>
                      <Form.Item className="upload-form-item-no-bottom">
                        <Button block onClick={() => navigate('/history')} icon={<HistoryOutlined />}>
                          {UI_COPY.upload.shared.buttons.viewHistory}
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

export default Upload_Page
