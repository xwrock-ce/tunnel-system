import React, { useEffect, useState } from 'react'
import {
  Card, Button, Form, InputNumber, Progress, Result, Row, Col,
  Typography, Image, Tag, Descriptions, Divider, message, Space, Tabs
} from 'antd'
import { ReloadOutlined, FileSearchOutlined, HistoryOutlined, DeleteOutlined, PaperClipOutlined } from '@ant-design/icons'
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
    <div>
      <div className="page-header">
        <Title level={4} className="page-title">
          上传分析
        </Title>
      </div>

      <Tabs
        activeKey={mode}
        onChange={(key) => setMode(key as UploadMode)}
        destroyInactiveTabPane
        items={[
          {
            key: 'single',
            label: '单张分析',
            children: currentAnalysis ? (
              <Card
                title={
                  <Space>
                    <span>分析结果</span>
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
                      查看报告
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={handleResetSingle}>
                      新分析
                    </Button>
                  </Space>
                }
                bordered={false}
              >
                {currentAnalysis.status === 'completed' && currentAnalysis.excavation ? (
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
                          <Text strong>分割视图</Text>
                        </div>
                        <Tabs
                          size="small"
                          items={[
                            {
                              key: 'combined',
                              label: '综合叠加',
                              children: (
                                <Image
                                  src={analysisApi.getImageUrl(
                                    currentAnalysis.id,
                                    currentAnalysis.combined_overlay_image_url ? 'combined_overlay' : 'overlay'
                                  )}
                                  style={{ maxWidth: '100%', borderRadius: 10 }}
                                />
                              ),
                            },
                            {
                              key: 'face',
                              label: '掌子面',
                              children: (
                                <Image
                                  src={analysisApi.getImageUrl(currentAnalysis.id, 'overlay')}
                                  style={{ maxWidth: '100%', borderRadius: 10 }}
                                />
                              ),
                            },
                            ...(currentAnalysis.crack_overlay_image_url
                              ? [
                                {
                                  key: 'crack',
                                  label: '裂缝',
                                  children: (
                                    <Image
                                      src={analysisApi.getImageUrl(currentAnalysis.id, 'crack_overlay')}
                                      style={{ maxWidth: '100%', borderRadius: 10 }}
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

                    <Descriptions title="超欠挖分析" bordered column={{ xs: 1, sm: 2, md: 3 }}>
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
                  <Result
                    status="error"
                    title="分析失败"
                    subTitle={currentAnalysis.error_message}
                    extra={
                      <Button type="primary" onClick={handleResetSingle}>
                        重新分析
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
                  <Card title="选择图片" bordered={false}>
                    <DropZone
                      onFilesSelected={handleSingleFileSelected}
                      disabled={isAnalyzing}
                      maxSizeMB={20}
                    />

                    {singleFile && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <PaperClipOutlined />
                          <Text>{singleFile.name}</Text>
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
                            style={{ maxWidth: '100%', borderRadius: 10 }}
                          />
                        )}
                      </div>
                    )}

                    {isAnalyzing && (
                      <div style={{ marginTop: 20 }}>
                        <Progress percent={progress} status="active" strokeColor="#4f46e5" />
                        <Text type="secondary">{progressMessage}</Text>
                      </div>
                    )}
                  </Card>
                </Col>

                <Col xs={24} lg={8}>
                  <Card
                    title="分析参数"
                    bordered={false}
                    extra={<Text type="secondary" style={{ fontSize: 12 }}>默认值可在系统设置中修改</Text>}
                  >
                    <Form
                      form={form}
                      layout="vertical"
                      initialValues={{
                        design_area: analysisDefaults.designArea,
                        scale: analysisDefaults.scale,
                      }}
                    >
                      <Form.Item name="design_area" label="设计面积 (m²)" tooltip="隧道设计轮廓面积">
                        <InputNumber style={{ width: '100%' }} min={0.01} precision={2} disabled={isAnalyzing} />
                      </Form.Item>

                      <Form.Item name="scale" label="比例尺 (mm/pixel)" tooltip="图像像素与实际尺寸的对应关系">
                        <InputNumber style={{ width: '100%' }} min={0.01} precision={2} disabled={isAnalyzing} />
                      </Form.Item>

                      <Form.Item>
                        <Button
                          type="primary"
                          onClick={handleSingleUpload}
                          loading={isAnalyzing}
                          block
                          size="large"
                        >
                          {isAnalyzing ? '分析中…' : '开始分析'}
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
            label: '批量分析',
            children: batchTaskIds ? (
              <Card bordered={false}>
                <Result
                  status="success"
                  title="批量任务已启动"
                  subTitle={`已提交 ${batchTaskIds.length} 张图片，任务将在后台依次处理。`}
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
                  <Card title="选择图片（最多 50 张）" bordered={false}>
                    <DropZone
                      onFilesSelected={handleBatchFilesSelected}
                      multiple
                      maxFiles={50}
                      disabled={isAnalyzing}
                      maxSizeMB={20}
                    />

                    {batchFiles.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text type="secondary">已选择 {batchFiles.length} 张图片</Text>
                          <Button
                            type="link"
                            size="small"
                            danger
                            onClick={handleResetBatch}
                            disabled={isAnalyzing}
                          >
                            清空
                          </Button>
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {batchFiles.map((f, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '4px 0',
                                borderBottom: '1px solid rgba(0,0,0,0.06)'
                              }}
                            >
                              <PaperClipOutlined />
                              <Text ellipsis style={{ flex: 1 }}>{f.name}</Text>
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
                      <div style={{ marginTop: 20 }}>
                        <Progress percent={progress} status="active" strokeColor="#4f46e5" />
                        <Text type="secondary">{progressMessage}</Text>
                      </div>
                    )}
                  </Card>
                </Col>
                <Col xs={24} lg={8}>
                  <Card
                    title="分析参数"
                    bordered={false}
                    extra={<Text type="secondary" style={{ fontSize: 12 }}>默认值可在系统设置中修改</Text>}
                  >
                    <Form
                      form={form}
                      layout="vertical"
                      initialValues={{
                        design_area: analysisDefaults.designArea,
                        scale: analysisDefaults.scale,
                      }}
                    >
                      <Form.Item name="design_area" label="设计面积 (m²)" tooltip="隧道设计轮廓面积">
                        <InputNumber style={{ width: '100%' }} min={0.01} precision={2} disabled={isAnalyzing} />
                      </Form.Item>

                      <Form.Item name="scale" label="比例尺 (mm/pixel)" tooltip="图像像素与实际尺寸的对应关系">
                        <InputNumber style={{ width: '100%' }} min={0.01} precision={2} disabled={isAnalyzing} />
                      </Form.Item>

                      <Form.Item>
                        <Button
                          type="primary"
                          onClick={handleBatchUpload}
                          loading={isAnalyzing}
                          block
                          size="large"
                        >
                          {isAnalyzing ? '提交中…' : '开始批量分析'}
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

export default Upload_Page
