import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Spin, Table, Button, Empty, Space } from 'antd'
import {
  ArrowUpOutlined,
  HistoryOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  PictureOutlined,
  LineChartOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
} from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import { useAnalysisStore } from '@/stores/useAnalysisStore'
import { analysisApi, AnalysisListItem, TrendResponse, DeviationDistribution } from '@/api/client'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
)

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { stats, fetchStats } = useAnalysisStore()
  const [recent, setRecent] = useState<AnalysisListItem[]>([])
  const [isLoadingRecent, setIsLoadingRecent] = useState(false)
  const [trendData, setTrendData] = useState<TrendResponse | null>(null)
  const [distribution, setDistribution] = useState<DeviationDistribution | null>(null)
  const [isLoadingTrend, setIsLoadingTrend] = useState(false)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  const quickLinks = [
    { label: '掌子面分析', path: '/upload/face', icon: <PictureOutlined /> },
    { label: '裂缝检测', path: '/upload/crack', icon: <ThunderboltOutlined /> },
    { label: '实时监控', path: '/realtime', icon: <LineChartOutlined /> },
    { label: '历史记录', path: '/history', icon: <HistoryOutlined /> },
  ]

  useEffect(() => {
    let ignore = false
    const loadStats = async () => {
      setIsLoadingStats(true)
      try {
        await fetchStats()
        if (!ignore) {
          setLastUpdatedAt(new Date())
        }
      } finally {
        if (!ignore) {
          setIsLoadingStats(false)
        }
      }
    }

    loadStats()
    return () => {
      ignore = true
    }
  }, [fetchStats, refreshKey])

  useEffect(() => {
    let ignore = false
    const loadTrendData = async () => {
      setIsLoadingTrend(true)
      try {
        const [trendRes, distRes] = await Promise.all([
          analysisApi.getTrend(20),
          analysisApi.getDistribution(),
        ])
        if (!ignore) {
          setTrendData(trendRes.data)
          setDistribution(distRes.data)
          setLastUpdatedAt(new Date())
        }
      } catch {
        // ignore
      } finally {
        if (!ignore) setIsLoadingTrend(false)
      }
    }

    loadTrendData()
    return () => {
      ignore = true
    }
  }, [refreshKey])

  useEffect(() => {
    let ignore = false
    const loadRecent = async () => {
      setIsLoadingRecent(true)
      try {
        const res = await analysisApi.list(1, 6)
        if (!ignore) {
          setRecent(res.data.items)
          setLastUpdatedAt(new Date())
        }
      } catch {
        // ignore
      } finally {
        if (!ignore) setIsLoadingRecent(false)
      }
    }

    loadRecent()
    return () => {
      ignore = true
    }
  }, [refreshKey])

  const chartData = useMemo(() => {
    const labels = trendData?.labels || []
    const overData = trendData?.over_excavation_data || []
    const underData = trendData?.under_excavation_data || []

    return {
      labels,
      datasets: [
        {
          label: '超挖面积 (m²)',
          data: overData,
          borderColor: '#4c78a8',
          backgroundColor: (context: any) => {
            const ctx = context.chart.ctx
            const gradient = ctx.createLinearGradient(0, 0, 0, 300)
            gradient.addColorStop(0, 'rgba(76, 120, 168, 0.32)')
            gradient.addColorStop(1, 'rgba(76, 120, 168, 0)')
            return gradient
          },
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#4c78a8',
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: '欠挖面积 (m²)',
          data: underData,
          borderColor: '#f58518',
          backgroundColor: (context: any) => {
            const ctx = context.chart.ctx
            const gradient = ctx.createLinearGradient(0, 0, 0, 300)
            gradient.addColorStop(0, 'rgba(245, 133, 24, 0.28)')
            gradient.addColorStop(1, 'rgba(245, 133, 24, 0)')
            return gradient
          },
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          fill: true,
          pointRadius: 2,
        },
      ],
    }
  }, [trendData])

  const distributionChartData = useMemo(() => {
    if (!distribution) return null

    return {
      labels: ['严重超挖', '轻微超挖', '合格', '轻微欠挖', '严重欠挖'],
      datasets: [
        {
          data: [
            distribution.severe_over_count,
            distribution.minor_over_count,
            distribution.normal_count,
            distribution.minor_under_count,
            distribution.severe_under_count,
          ],
          backgroundColor: ['#e45756', '#f58518', '#72b7b2', '#54a24b', '#b279a2'],
          borderWidth: 0,
        },
      ],
    }
  }, [distribution])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#2a3441',
        padding: 12,
        cornerRadius: 8,
        titleFont: { size: 13, family: "'Inter', sans-serif" },
        bodyFont: { size: 12, family: "'Inter', sans-serif" },
        callbacks: {
          title: (items: any[]) => `样本序列: ${items[0].label}`,
        },
      },
    },
    scales: {
      y: {
        grid: {
          borderDash: [4, 4],
          color: '#e7ebf0',
          drawBorder: false,
        },
        ticks: {
          font: { size: 10, family: "'Inter', sans-serif" },
          color: '#6e7784',
        },
        beginAtZero: true,
      },
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 10, family: "'Inter', sans-serif" },
          color: '#6e7784',
        },
      },
    },
  }

  const isAnyLoading = isLoadingStats || isLoadingTrend || isLoadingRecent

  if (!stats && isLoadingStats) {
    return (
      <div className="dashboard-loading-wrap">
        <Spin size="large" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="dashboard-loading-wrap">
        <Empty description="暂无仪表盘数据" />
      </div>
    )
  }

  const total = stats.over_excavation_count + stats.under_excavation_count + stats.normal_count
  const normalPercent = total > 0 ? (stats.normal_count / total) * 100 : 0
  const abnormalCount = stats.over_excavation_count + stats.under_excavation_count
  const trendSummaryText =
    trendData && trendData.labels.length > 0
      ? `显示最近 ${trendData.labels.length} 次分析结果`
      : '暂无分析数据'

  const distributionTotal = distribution
    ? distribution.severe_over_count + distribution.minor_over_count + distribution.normal_count + distribution.minor_under_count + distribution.severe_under_count
    : 0

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1)
  }

  const recentColumns: ColumnsType<AnalysisListItem> = [
    {
      title: '序列 ID',
      dataIndex: 'id',
      render: (id) => <span className="dashboard-code-text">#{id}</span>,
    },
    {
      title: '分析状态',
      dataIndex: 'status',
      render: (status: string) => {
        const map: Record<string, { text: string; cls: string }> = {
          completed: { text: '完成', cls: 'success' },
          processing: { text: '分析中', cls: 'processing' },
          failed: { text: '失败', cls: 'error' },
          pending: { text: '等待中', cls: 'warning' },
        }
        const item = map[status] || { text: status, cls: 'neutral' }
        return <span className={`status-badge ${item.cls}`}>{item.text}</span>
      },
    },
    {
      title: '判定结果',
      dataIndex: 'excavation_status',
      render: (status: string | null | undefined) => {
        if (!status) {
          return <span className="dashboard-result-empty">-</span>
        }
        if (status === 'over_excavation') {
          return (
            <span className="dashboard-result-text is-over">
              <span className="dashboard-result-dot is-over" />
              超挖
            </span>
          )
        }
        if (status === 'under_excavation') {
          return (
            <span className="dashboard-result-text is-under">
              <span className="dashboard-result-dot is-under" />
              欠挖
            </span>
          )
        }
        return (
          <span className="dashboard-result-text is-normal">
            <span className="dashboard-result-dot is-normal" />
            合格
          </span>
        )
      },
    },
    {
      title: '偏差比例 (%)',
      dataIndex: 'difference_percent',
      render: (value: number | null | undefined) => {
        if (value === null || value === undefined) {
          return <span className="dashboard-diff-text is-empty">-</span>
        }
        const cls = Math.abs(value) > 10 ? 'is-high' : Math.abs(value) > 5 ? 'is-medium' : 'is-normal'
        return (
          <span className={`dashboard-diff-text ${cls}`}>
            {value > 0 ? '+' : ''}{value.toFixed(2)}
          </span>
        )
      },
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      render: (date: string) => <span className="dashboard-time-text">{dayjs(date).format('MM-DD HH:mm')}</span>,
    },
    {
      title: '操作',
      key: 'op',
      align: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          className="dashboard-op-btn"
          disabled={record.status !== 'completed'}
          onClick={(event) => {
            event.stopPropagation()
            if (record.status === 'completed') {
              navigate(`/report/${record.id}`)
            }
          }}
        >
          查看详情
        </Button>
      ),
    },
  ]

  return (
    <div>
      <div className="dashboard-toolbar">
        <div className="dashboard-toolbar-left">
          <div className="dashboard-toolbar-title">快捷入口</div>
          <div className="dashboard-toolbar-actions">
            {quickLinks.map((item) => (
              <Button
                key={item.path}
                size="small"
                type="default"
                icon={item.icon}
                className="dashboard-quick-btn"
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        <Space size={8} className="dashboard-toolbar-meta">
          <span className="dashboard-toolbar-time">
            更新时间：{lastUpdatedAt ? dayjs(lastUpdatedAt).format('HH:mm:ss') : '--:--:--'}
          </span>
          <Button
            size="small"
            icon={<ReloadOutlined spin={isAnyLoading} />}
            onClick={handleRefresh}
            disabled={isAnyLoading}
          >
            刷新数据
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="kpi-card dashboard-kpi-card">
            <div className="dashboard-kpi-label">今日分析样本</div>
            <div className="dashboard-kpi-value-row">
              <span className="dashboard-kpi-value">{stats.today_analyses}</span>
              <span className="dashboard-kpi-unit">个</span>
            </div>
            <div className="dashboard-kpi-foot">
              {stats.today_vs_yesterday_percent != null && !Number.isNaN(stats.today_vs_yesterday_percent) ? (
                <>
                  <span className={`status-badge ${stats.today_vs_yesterday_percent >= 0 ? 'success' : 'error'} dashboard-kpi-badge`}>
                    <ArrowUpOutlined
                      className={stats.today_vs_yesterday_percent < 0 ? 'dashboard-arrow-down' : ''}
                    />
                    {Math.abs(stats.today_vs_yesterday_percent).toFixed(1)}%
                  </span>
                  <span className="dashboard-muted-text">较昨日</span>
                </>
              ) : (
                <span className="dashboard-muted-text">昨日: {stats.yesterday_analyses ?? 0} 个</span>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="kpi-card dashboard-kpi-card dashboard-kpi-card--alert">
            <div className="dashboard-kpi-top-row">
              <div>
                <div className="dashboard-kpi-label">超欠挖异常</div>
                <div className="dashboard-kpi-value-row">
                  <span className="dashboard-kpi-value">{abnormalCount}</span>
                  <span className="dashboard-kpi-unit">次</span>
                </div>
              </div>
              <div className="dashboard-alert-icon-wrap">
                <ThunderboltOutlined className="dashboard-alert-icon" />
              </div>
            </div>
            <div className="dashboard-alert-text">需重点关注</div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="kpi-card dashboard-kpi-card">
            <div className="dashboard-kpi-label">平均开挖偏差</div>
            <div className="dashboard-kpi-value-row">
              <span className="dashboard-kpi-value">{Math.abs(stats.avg_difference_percent).toFixed(1)}</span>
              <span className="dashboard-kpi-unit">%</span>
            </div>
            <div className="dashboard-kpi-foot">
              {stats.avg_difference_percent !== 0 ? (
                <span className={`dashboard-kpi-trend ${stats.avg_difference_percent > 0 ? 'is-over' : 'is-under'}`}>
                  {stats.avg_difference_percent > 0 ? '平均超挖' : '平均欠挖'}
                </span>
              ) : (
                <span className="dashboard-kpi-trend is-normal">偏差正常</span>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="kpi-card dashboard-kpi-card">
            <div className="dashboard-kpi-label">系统合格率</div>
            <div className="dashboard-kpi-value-row">
              <span className="dashboard-kpi-value">{normalPercent.toFixed(1)}</span>
              <span className="dashboard-kpi-unit">%</span>
            </div>
            <div className="dashboard-progress-track">
              <div className="dashboard-progress-bar" style={{ width: `${normalPercent}%` }} />
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="dashboard-section-row">
        <Col xs={24} lg={16}>
          <Card bordered={false} className="kpi-card" bodyStyle={{ padding: 24 }}>
            <div className="dashboard-chart-head">
              <div>
                <h3 className="dashboard-card-title">超欠挖变化 (按分析序列)</h3>
                <p className="dashboard-card-subtitle">{trendSummaryText}</p>
              </div>
              <div className="dashboard-chart-legend">
                <span className="dashboard-legend-item">
                  <span className="dashboard-legend-dot is-over" />
                  超挖面积
                </span>
                <span className="dashboard-legend-item">
                  <span className="dashboard-legend-dot is-under" />
                  欠挖面积
                </span>
              </div>
            </div>
            <div className="chart-container">
              {isLoadingTrend ? (
                <div className="dashboard-chart-loading">
                  <Spin />
                </div>
              ) : trendData && trendData.labels.length > 0 ? (
                <Line data={chartData} options={chartOptions} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据，请先上传分析图像" />
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            bordered={false}
            className="kpi-card dashboard-distribution-card"
            style={{ height: '100%' }}
            bodyStyle={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            <div className="dashboard-distribution-head">
              <h3 className="dashboard-card-title dashboard-card-title--small">偏差分布统计</h3>
              <span className="status-badge neutral">全部</span>
            </div>
            <div className="dashboard-distribution-body">
              {isLoadingTrend ? (
                <div className="dashboard-distribution-loading">
                  <Spin size="small" />
                </div>
              ) : distribution && distributionChartData ? (
                <div className="dashboard-distribution-content">
                  <div className="dashboard-donut-wrap">
                    <Doughnut
                      data={distributionChartData}
                      options={{
                        cutout: '70%',
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (ctx) => ` ${ctx.label}: ${ctx.raw} 次`,
                            },
                          },
                        },
                      }}
                    />
                    <div className="dashboard-donut-center">
                      <div className="dashboard-donut-total">{distributionTotal}</div>
                      <div className="dashboard-donut-label">总样本</div>
                    </div>
                  </div>

                  <div className="dashboard-distribution-grid">
                    <span className="dashboard-distribution-item">
                      <span className="dashboard-distribution-dot is-severe-over" />
                      严重超挖 ({distribution.severe_over_count})
                    </span>
                    <span className="dashboard-distribution-item">
                      <span className="dashboard-distribution-dot is-minor-over" />
                      轻微超挖 ({distribution.minor_over_count})
                    </span>
                    <span className="dashboard-distribution-item">
                      <span className="dashboard-distribution-dot is-normal" />
                      合格 ({distribution.normal_count})
                    </span>
                    <span className="dashboard-distribution-item">
                      <span className="dashboard-distribution-dot is-under" />
                      欠挖 ({distribution.minor_under_count + distribution.severe_under_count})
                    </span>
                  </div>
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无统计数据" />
              )}

              <div className="dashboard-model-wrap">
                <div className="dashboard-model-title">模型运行状态</div>
                <div className="dashboard-model-card">
                  <div className="dashboard-model-main">
                    <span className="dashboard-model-dot" />
                    <span className="dashboard-model-name">YOLOv11-L</span>
                  </div>
                  <Button type="link" size="small" className="dashboard-model-link" onClick={() => navigate('/realtime')}>
                    详情 →
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="kpi-card dashboard-table-card" bodyStyle={{ padding: 0 }}>
        <div className="dashboard-table-head">
          <h3 className="dashboard-card-title dashboard-card-title--small">最新分析序列</h3>
          <Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => navigate('/history')}>
            查看全部
          </Button>
        </div>
        <Table<AnalysisListItem>
          rowKey="id"
          dataSource={recent}
          pagination={false}
          loading={isLoadingRecent}
          scroll={{ x: 860 }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分析记录" />,
          }}
          onRow={(record) => ({
            onClick: () => {
              if (record.status === 'completed') {
                navigate(`/report/${record.id}`)
              }
            },
            style: { cursor: record.status === 'completed' ? 'pointer' : 'default' },
          })}
          rowClassName={(record) => (record.status === 'completed' ? 'table-row-clickable' : 'table-row-disabled')}
          columns={recentColumns}
        />
      </Card>
    </div>
  )
}

export default Dashboard
