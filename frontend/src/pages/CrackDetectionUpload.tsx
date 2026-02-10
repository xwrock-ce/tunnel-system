import React, { useEffect, useState } from 'react'
import {
  Card, Button, Form, Progress, Result, Row, Col,
  Typography, Image, Tag, Divider, message, Space, Tabs, Alert, Statistic
} from 'antd'
import { ReloadOutlined, FileSearchOutlined, HistoryOutlined, DeleteOutlined, PaperClipOutlined, WarningOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAnalysisStore } from '@/stores/useAnalysisStore'
import { useAppSettingsStore } from '@/stores/useAppSettingsStore'
import { analysisApi } from '@/api/client'
import DropZone from '@/components/DropZone'

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
  const modeText = mode === 'single' ? '单张模式' : '批量模式'

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
    <div>
      <div className="page-header">
        <Title level={4} className="page-title">
          裂缝检测
        </Title>
      </div>

      <Alert
        message="裂缝检测功能"
        description="上传混凝土表面图片，系统将自动检测裂缝位置并标记。使用 YOLOv11 深度学习模型进行精确检测，支持多种裂缝类型识别。"
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        style={{ marginBottom: 16 }}
      />

      <div className="upload-status-strip upload-status-strip-warning">
        <span className="upload-status-item">{modeText}</span>
        <span className="upload-status-item">已选文件：{selectedCount}</span>
        <span className={`upload-status-item ${isAnalyzingForPage ? 'is-active' : ''}`}>
          {isAnalyzingForPage ? '检测进行中' : '待开始'}
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
            label: '单张检测',
            children: currentAnalysis && currentAnalysis.analysis_type === 'crack_detection' ? (
              <Card
                title={
                  <Space>
                    <span>检测结果</span>
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
                      查看报告
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={handleResetSingle}>
                      新检测
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
                        <div style={{ marginBottom: 16 }}>
                          <Text strong>原始图片</Text>
                        </div>
                        <Image
                          src={analysisApi.getImageUrl(currentAnalysis.id, 'original')}
                          style={{ maxWidth: '100%', borderRadius: 8 }}
                        />
                      </Col>
                      <Col xs={24} md={12}>
                        <div style={{ marginBottom: 16 }}>
                          <Text strong>裂缝检测结果</Text>
                        </div>
                        <Image
                          src={analysisApi.getImageUrl(currentAnalysis.id, 'crack_overlay')}
                          style={{ maxWidth: '100%', borderRadius: 10 }}
                          fallback={analysisApi.getImageUrl(currentAnalysis.id, 'original')}
                        />
                      </Col>
                    </Row>

                    <Divider />

                    <Row gutter={[24, 24]}>
                      <Col xs={12} sm={8}>
                        <Statistic
                          title="检测到的裂缝数量"
                          value={currentAnalysis.metrics?.crack_count || 0}
                          suffix="条"
                          valueStyle={{ color: (currentAnalysis.metrics?.crack_count || 0) > 0 ? '#cf1322' : '#3f8600' }}
                        />
                      </Col>
                      <Col xs={12} sm={8}>
                        <Statistic
                          title="检测置信度"
                          value={((currentAnalysis.metrics?.crack_confidence || 0) * 100).toFixed(1)}
                          suffix="%"
                          precision={1}
                        />
                      </Col>
                      <Col xs={12} sm={8}>
                        <Statistic
                          title="检测区域像素"
                          value={currentAnalysis.metrics?.crack_pixel_count || 0}
                          suffix="px"
                        />
                      </Col>
                    </Row>

                    {(currentAnalysis.metrics?.crack_count || 0) > 0 && (
                      <>
                        <Divider />
                        <Alert
                          message="检测到裂缝"
                          description={`在图片中检测到 ${currentAnalysis.metrics?.crack_count} 条裂缝，建议进行进一步检查和维护。`}
                          type="warning"
                          showIcon
                        />
                      </>
                    )}
                  </>
                ) : currentAnalysis.status === 'failed' ? (
                  <Result
                    status="error"
                    title="检测失败"
                    subTitle={currentAnalysis.error_message}
                    extra={
                      <Button type="primary" onClick={handleResetSingle}>
                        重新检测
                      </Button>
                    }
                  />
                ) : (
                  <Result status="info" title="处理中" subTitle="请稍候…" />
                )}
              </Card>
            ) : (
              <Row gutter={24}>
                <Col xs={24} lg={16}>
                  <Card title="选择混凝土表面图片" variant="borderless" className="card-surface upload-workspace-card">
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
                            style={{ maxWidth: '100%', borderRadius: 10 }}
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
                    title="检测设置"
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
                        message="自动检测"
                        description="系统将使用预训练的 YOLOv11 模型自动检测图片中的裂缝，无需额外参数设置。"
                        type="info"
                        style={{ marginBottom: 16 }}
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
                          {isAnalyzingForPage ? '检测中…' : '开始裂缝检测'}
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
            label: '批量检测',
            children: batchTaskIds ? (
              <Card variant="borderless" className="card-surface">
                <Result
                  status="success"
                  title="批量任务已启动"
                  subTitle={`已提交 ${batchTaskIds.length} 张图片进行裂缝检测，任务将在后台依次处理。`}
                  extra={
                    <Space>
                      <Button icon={<HistoryOutlined />} type="primary" onClick={() => navigate('/history')}>
                        去历史记录查看
                      </Button>
                      <Button onClick={handleResetBatch}>继续批量上传</Button>
                    </Space>
                  }
                />
              </Card>
            ) : (
              <Row gutter={24}>
                <Col xs={24} lg={16}>
                  <Card title="选择图片（最多 50 张）" variant="borderless" className="card-surface upload-workspace-card">
                    <DropZone
                      onFilesSelected={handleBatchFilesSelected}
                      multiple
                      maxFiles={50}
                      disabled={isAnalyzingForPage}
                      maxSizeMB={20}
                    />

                    {batchFiles.length > 0 && (
                      <div className="upload-preview-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text type="secondary">已选择 {batchFiles.length} 张图片</Text>
                          <Button
                            type="link"
                            size="small"
                            danger
                            onClick={handleResetBatch}
                            disabled={isAnalyzingForPage}
                          >
                            清空
                          </Button>
                        </div>
                        <div className="upload-file-list">
                          {batchFiles.map((f, i) => (
                            <div
                              key={`${f.name}-${i}`}
                              className="upload-file-row"
                            >
                              <PaperClipOutlined />
                              <Text ellipsis style={{ flex: 1 }} className="upload-file-name">{f.name}</Text>
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
                    title="检测设置"
                    variant="borderless"
                    className="card-surface upload-config-card"
                  >
                    <Form
                      form={form}
                      layout="vertical"
                    >
                      <Alert
                        message="批量自动检测"
                        description="所有图片将使用相同的检测模型进行处理，结果可在历史记录中查看。"
                        type="info"
                        style={{ marginBottom: 16 }}
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
                          {isAnalyzingForPage ? '提交中…' : '开始批量检测'}
                        </Button>
                      </Form.Item>
                      <Form.Item style={{ marginBottom: 0 }}>
                        <Button block onClick={() => navigate('/history')} icon={<HistoryOutlined />}>
                          查看历史记录
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
