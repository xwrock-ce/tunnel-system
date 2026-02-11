import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Row, Col, Typography, Tag, Descriptions, Button,
  Spin, Result, Divider, Tabs, Space, Statistic, Empty
} from 'antd'
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  PercentageOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { analysisApi, AnalysisResponse } from '@/api/client'
import ImageComparison, { type ImageComparisonHeight } from '@/components/ImageComparison'

const { Title, Text } = Typography

const Report: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeComparisonKey, setActiveComparisonKey] = useState<string>()

  useEffect(() => {
    const load = async () => {
      if (!id) return
      setIsLoading(true)
      setError(null)
      setAnalysis(null)
      setActiveComparisonKey(undefined)
      try {
        const res = await analysisApi.get(parseInt(id))
        setAnalysis(res.data)
      } catch (err: any) {
        setError(err.response?.data?.detail || '加载失败')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  if (isLoading) {
    return (
      <div className="report-loading">
        <Spin size="large" tip="加载分析数据..." />
      </div>
    )
  }

  if (error) {
    return (
      <Result
        status="error"
        title="加载失败"
        subTitle={error}
        extra={
          <Button onClick={() => navigate('/history')}>返回列表</Button>
        }
      />
    )
  }

  if (!analysis) {
    return (
      <Result
        status="info"
        title="暂无数据"
        extra={<Button onClick={() => navigate('/history')}>返回列表</Button>}
      />
    )
  }

  if (analysis.status === 'failed') {
    return (
      <Result
        status="error"
        title="分析失败"
        subTitle={analysis.error_message}
        extra={<Button onClick={() => navigate('/history')}>返回列表</Button>}
      />
    )
  }

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'over_excavation':
        return <Tag color="error" className="report-status-tag">超挖异常</Tag>
      case 'under_excavation':
        return <Tag color="warning" className="report-status-tag">欠挖异常</Tag>
      case 'within_tolerance':
        return <Tag color="success" className="report-status-tag">合格</Tag>
      default:
        return <Tag>{status}</Tag>
    }
  }

  const excavation = analysis.excavation
  const analysisType = analysis.analysis_type || 'full'
  const showFace = analysisType === 'face_segmentation' || analysisType === 'full'
  const showCrack = analysisType === 'crack_detection' || analysisType === 'full'
  const comparisonHeight: ImageComparisonHeight = 'clamp(360px, 56vh, 640px)'

  const analysisTypeLabelMap: Record<string, string> = {
    full: '综合分析',
    face_segmentation: '掌子面分割',
    crack_detection: '裂缝检测',
  }
  const analysisTypeLabel = analysisTypeLabelMap[analysisType] || analysisType
  const processingSeconds =
    analysis.completed_at && analysis.created_at
      ? Math.max(0, dayjs(analysis.completed_at).diff(dayjs(analysis.created_at), 'second'))
      : null
  const createdTimeText = dayjs(analysis.created_at).format('MM-DD HH:mm:ss')

  const downloadFile = async (url: string, baseName: string) => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `${baseName}.jpg`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  const originalUrl = analysisApi.getImageUrl(analysis.id, 'original')
  const comparisonItems: { key: string; label: string; children: React.ReactNode }[] = []

  if (showFace && analysis.overlay_image_url) {
    comparisonItems.push({
      key: 'face',
      label: '超欠挖分析',
      children: (
        <div className="report-compare-wrapper">
          <ImageComparison
            leftImage={originalUrl}
            rightImage={analysisApi.getImageUrl(analysis.id, 'overlay')}
            leftLabel="原始图像"
            rightLabel="分析叠加"
            height={comparisonHeight}
          />
        </div>
      ),
    })
  }

  if (showCrack && analysis.crack_overlay_image_url) {
    comparisonItems.push({
      key: 'crack',
      label: '裂缝检测',
      children: (
        <div className="report-compare-wrapper">
          <ImageComparison
            leftImage={originalUrl}
            rightImage={analysisApi.getImageUrl(analysis.id, 'crack_overlay')}
            leftLabel="原始图像"
            rightLabel="裂缝标注"
            height={comparisonHeight}
          />
        </div>
      ),
    })
  }

  if (analysisType === 'full' && analysis.combined_overlay_image_url) {
    comparisonItems.push({
      key: 'combined',
      label: '综合视图',
      children: (
        <div className="report-compare-wrapper">
          <ImageComparison
            leftImage={originalUrl}
            rightImage={analysisApi.getImageUrl(analysis.id, 'combined_overlay')}
            leftLabel="原始图像"
            rightLabel="综合结果"
            height={comparisonHeight}
          />
        </div>
      ),
    })
  }

  const currentComparisonKey =
    activeComparisonKey && comparisonItems.some((item) => item.key === activeComparisonKey)
      ? activeComparisonKey
      : comparisonItems[0]?.key

  const differencePercentColor = Math.abs(excavation?.difference_percent ?? 0) > 5 ? '#cf1322' : '#3f8600'

  return (
    <div className="report-page report-page-unified">
      <div className="page-header report-header">
        <div className="report-header-main">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/history')} type="text" />
          <div>
            <div className="report-title-row">
              <Title level={4} className="page-title">分析报告 #{analysis.id}</Title>
              {excavation && getStatusTag(excavation.status)}
            </div>
            <Text type="secondary" className="report-subtitle">
              <EnvironmentOutlined /> 隧道掌子面里程桩号: K12+{analysis.id.toString().padStart(3, '0')} (模拟数据)
            </Text>
          </div>
        </div>
        <Space className="page-actions">
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile(originalUrl, `report_${analysis.id}`)}>
            导出报告
          </Button>
        </Space>
      </div>

      <div className="report-meta-strip">
        <span className="report-meta-item">
          <AppstoreOutlined className="report-meta-icon" />
          分析类型：{analysisTypeLabel}
        </span>
        <span className="report-meta-item">
          <CalendarOutlined className="report-meta-icon" />
          创建时间：{createdTimeText}
        </span>
        <span className="report-meta-item">
          <ClockCircleOutlined className="report-meta-icon" />
          处理耗时：{processingSeconds === null ? '计算中' : `${processingSeconds} 秒`}
        </span>
        {excavation && (
          <span className="report-meta-item">
            <PercentageOutlined className="report-meta-icon" />
            偏差：{excavation.difference_percent > 0 ? '+' : ''}{excavation.difference_percent.toFixed(2)}%
          </span>
        )}
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} xl={16}>
          <Card
            title="智能视觉分析"
            bordered={false}
            className="shadow-card card-surface"
          >
            {comparisonItems.length > 0 ? (
              <Tabs
                items={comparisonItems}
                activeKey={currentComparisonKey}
                onChange={setActiveComparisonKey}
                animated
                className="report-compare-tabs"
              />
            ) : (
              <Empty description="暂无图像数据" />
            )}
          </Card>

          <Card
            title={<><ExperimentOutlined /> 地质特征参数 (Geological Parameters)</>}
            bordered={false}
            className="card-surface report-card-spacing"
          >
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
              <Descriptions.Item label="岩体质量等级 (RMR)">
                <Tag color="blue">IV级 (差)</Tag> <Text type="secondary">(AI预估)</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Q系统评分">
                <Text strong>2.5</Text>
              </Descriptions.Item>
              <Descriptions.Item label="地下水状态">
                <Text>潮湿 / 滴水</Text>
              </Descriptions.Item>
              <Descriptions.Item label="主要节理组数">
                3 组
              </Descriptions.Item>
              <Descriptions.Item label="节理粗糙度 (Jrc)">
                6 - 8
              </Descriptions.Item>
              <Descriptions.Item label="岩石单轴抗压强度">
                ~45 MPa
              </Descriptions.Item>
            </Descriptions>
            <div className="report-geology-note">
              注：以上地质参数基于图像纹理分析生成，仅供参考，请以现场地质素描为准。
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          {excavation && (
            <Card title="超欠挖量化指标" bordered={false} className="card-surface report-sidebar-card">
              <div className="report-stat-summary">
                <Statistic
                  title="开挖面积偏差"
                  value={excavation.difference_percent}
                  precision={2}
                  valueStyle={{ color: differencePercentColor }}
                  prefix={excavation.difference_percent > 0 ? '+' : ''}
                  suffix="%"
                />
                <Text type="secondary">
                  实际 {excavation.actual_area_m2.toFixed(2)} m² / 设计 {excavation.design_area_m2.toFixed(2)} m²
                </Text>
              </div>

              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="最大超挖深度">
                  <Text strong className="report-value-danger">15.4 cm</Text>
                </Descriptions.Item>
                <Descriptions.Item label="最大欠挖深度">
                  <Text strong className="report-value-warning">8.2 cm</Text>
                </Descriptions.Item>
                <Descriptions.Item label="轮廓匹配度">
                  92.5%
                </Descriptions.Item>
                <Descriptions.Item label="AI置信度">
                  {((analysis.metrics?.confidence || 0) * 100).toFixed(1)}%
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          {analysis.metrics?.crack_count !== undefined && (
            <Card title="裂缝病害统计" bordered={false} className="card-surface">
              <Row gutter={16} className="report-crack-stats">
                <Col span={12}>
                  <Statistic title="识别数量" value={analysis.metrics.crack_count} suffix="条" />
                </Col>
                <Col span={12}>
                  <Statistic title="最大长度" value={0.85} precision={2} suffix="m" />
                </Col>
              </Row>
              <Divider className="report-crack-divider" />
              <div className="report-crack-tags">
                <Tag>纵向裂缝</Tag>
                <Tag>需由专家复核</Tag>
              </div>
            </Card>
          )}

          <Card size="small" title="分析元数据" bordered={false} className="card-surface report-meta-card">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="任务ID">#{analysis.id}</Descriptions.Item>
              <Descriptions.Item label="处理时间">{processingSeconds === null ? '-' : `${processingSeconds} 秒`}</Descriptions.Item>
              <Descriptions.Item label="模型版本">YOLOv11-Seg-v1.0.2</Descriptions.Item>
              <Descriptions.Item label="创建时间">{createdTimeText}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Report
