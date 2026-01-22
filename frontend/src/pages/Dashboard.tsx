import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Spin, Table, Button, Empty } from 'antd'
import {
  ArrowUpOutlined,
  MoreOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
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
  ArcElement
} from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import { useAnalysisStore } from '@/stores/useAnalysisStore'
import { analysisApi, AnalysisListItem, TrendResponse, DeviationDistribution } from '@/api/client'

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  Tooltip,
  Legend,
  Filler,
  ArcElement
)

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { stats, fetchStats } = useAnalysisStore()
  const [recent, setRecent] = useState<AnalysisListItem[]>([])
  const [isLoadingRecent, setIsLoadingRecent] = useState(false)
  const [trendData, setTrendData] = useState<TrendResponse | null>(null)
  const [distribution, setDistribution] = useState<DeviationDistribution | null>(null)
  const [isLoadingTrend, setIsLoadingTrend] = useState(false)

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Fetch trend data and distribution
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
  }, [])

  useEffect(() => {
    let ignore = false
    const loadRecent = async () => {
      setIsLoadingRecent(true)
      try {
        const res = await analysisApi.list(1, 6)
        if (!ignore) {
          setRecent(res.data.items)
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
  }, [])

  // Chart Data: Analysis Sequence (using real data from API)
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
          borderColor: '#f43f5e', // Rose 500
          backgroundColor: (context: any) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(244, 63, 94, 0.4)');
            gradient.addColorStop(1, 'rgba(244, 63, 94, 0.0)');
            return gradient;
          },
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#f43f5e',
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: '欠挖面积 (m²)',
          data: underData,
          borderColor: '#fbbf24', // Amber 400
          backgroundColor: (context: any) => {
             const ctx = context.chart.ctx;
             const gradient = ctx.createLinearGradient(0, 0, 0, 300);
             gradient.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
             gradient.addColorStop(1, 'rgba(251, 191, 36, 0.0)');
             return gradient;
          },
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          fill: true, // Also fill under-excavation slightly for better visual
          pointRadius: 2,
        }
      ],
    }
  }, [trendData])

  const distributionChartData = useMemo(() => {
    if (!distribution) return null;
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
          backgroundColor: [
            '#f43f5e', // Severe Over (Rose 500)
            '#fbbf24', // Minor Over (Amber 400)
            '#10b981', // Normal (Emerald 500)
            '#a78bfa', // Minor Under (Violet 400)
            '#7c3aed', // Severe Under (Violet 600)
          ],
          borderWidth: 0,
        },
      ],
    };
  }, [distribution]);

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
        backgroundColor: '#1e293b',
        padding: 12,
        cornerRadius: 8,
        titleFont: { size: 13, family: "'Inter', sans-serif" },
        bodyFont: { size: 12, family: "'Inter', sans-serif" },
        callbacks: {
            title: (items: any[]) => `样本序列: ${items[0].label}`
        }
      }
    },
    scales: {
      y: {
        grid: {
          borderDash: [4, 4],
          color: '#f1f5f9',
          drawBorder: false,
        },
        ticks: {
          font: { size: 10, family: "'Inter', sans-serif" },
          color: '#94a3b8'
        },
        beginAtZero: true
      },
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 10, family: "'Inter', sans-serif" },
          color: '#94a3b8'
        }
      }
    }
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  const total = stats.over_excavation_count + stats.under_excavation_count + stats.normal_count
  const normalPercent = total > 0 ? (stats.normal_count / total * 100) : 0

  return (
    <div>
      {/* KPI Section */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="kpi-card">
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              今日分析样本
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '30px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{stats.today_analyses}</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>个</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', fontSize: '12px' }}>
              {stats.today_vs_yesterday_percent != null && !isNaN(stats.today_vs_yesterday_percent) ? (
                <>
                  <span className={`status-badge ${stats.today_vs_yesterday_percent >= 0 ? 'success' : 'error'}`} style={{ marginRight: 8 }}>
                    <ArrowUpOutlined style={{ marginRight: 4, transform: stats.today_vs_yesterday_percent < 0 ? 'rotate(180deg)' : undefined }} />
                    {Math.abs(stats.today_vs_yesterday_percent).toFixed(1)}%
                  </span>
                  <span style={{ color: '#94a3b8' }}>较昨日</span>
                </>
              ) : (
                <span style={{ color: '#94a3b8' }}>昨日: {stats.yesterday_analyses ?? 0} 个</span>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    超欠挖异常
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: '30px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                      {stats.over_excavation_count + stats.under_excavation_count}
                    </span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>次</span>
                  </div>
               </div>
               <div style={{ width: 32, height: 32, borderRadius: 4, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <ThunderboltOutlined style={{ color: '#d97706', fontSize: 16 }} />
               </div>
            </div>
            <div style={{ marginTop: 12, fontSize: '12px', color: '#b45309', fontWeight: 500 }}>
              需重点关注
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="kpi-card">
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              平均开挖偏差
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '30px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                {Math.abs(stats.avg_difference_percent).toFixed(1)}
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>%</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', fontSize: '12px' }}>
              {stats.avg_difference_percent !== 0 ? (
                <span style={{ color: stats.avg_difference_percent > 0 ? '#e11d48' : '#d97706', fontWeight: 500 }}>
                  {stats.avg_difference_percent > 0 ? '平均超挖' : '平均欠挖'}
                </span>
              ) : (
                <span style={{ color: '#059669', fontWeight: 500 }}>偏差正常</span>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="kpi-card">
             <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              系统合格率
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '30px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                {normalPercent.toFixed(1)}
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>%</span>
            </div>
            <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 99, marginTop: 16 }}>
              <div style={{ width: `${normalPercent}%`, height: '100%', background: '#2563eb', borderRadius: 99 }}></div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Chart Section */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={16}>
          <Card bordered={false} className="kpi-card" bodyStyle={{ padding: 24 }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                   <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>超欠挖变化 (按分析序列)</h3>
                   <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                     {trendData && trendData.labels.length > 0
                       ? `显示最近 ${trendData.labels.length} 次分析结果`
                       : '暂无分析数据'}
                   </p>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                   <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#475569' }}>
                     <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f43f5e', marginRight: 8 }}></span>
                     超挖面积
                   </div>
                   <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#475569' }}>
                     <span style={{ width: 10, height: 10, borderRadius: 2, background: '#fbbf24', marginRight: 8 }}></span>
                     欠挖面积
                   </div>
                </div>
             </div>
             <div className="chart-container">
               {isLoadingTrend ? (
                 <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
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
          <Card bordered={false} className="kpi-card" style={{ height: '100%' }} bodyStyle={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
             <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>偏差分布统计</h3>
                <span className="status-badge neutral">全部</span>
             </div>
             <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {isLoadingTrend ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 150, width: '100%' }}>
                    <Spin size="small" />
                  </div>
                ) : distribution && distributionChartData ? (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 180, height: 180, marginBottom: 20, position: 'relative' }}>
                       <Doughnut 
                          data={distributionChartData} 
                          options={{ 
                             cutout: '70%', 
                             plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw} 次` } } } 
                          }} 
                       />
                       <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
                             {distribution.severe_over_count + distribution.minor_over_count + distribution.normal_count + distribution.minor_under_count + distribution.severe_under_count}
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>总样本</div>
                       </div>
                    </div>
                    
                    <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                       <div style={{ display: 'flex', alignItems: 'center', color: '#64748b' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f43f5e', marginRight: 6 }}></span>
                          严重超挖 ({distribution.severe_over_count})
                       </div>
                       <div style={{ display: 'flex', alignItems: 'center', color: '#64748b' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', marginRight: 6 }}></span>
                          轻微超挖 ({distribution.minor_over_count})
                       </div>
                       <div style={{ display: 'flex', alignItems: 'center', color: '#64748b' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginRight: 6 }}></span>
                          合格 ({distribution.normal_count})
                       </div>
                       <div style={{ display: 'flex', alignItems: 'center', color: '#64748b' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', marginRight: 6 }}></span>
                          欠挖 ({distribution.minor_under_count + distribution.severe_under_count})
                       </div>
                    </div>
                  </div>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无统计数据" />
                )}

                {/* Model Info */}
                <div style={{ width: '100%', marginTop: 'auto', paddingTop: 24, borderTop: '1px solid #f8fafc' }}>
                   <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: 8 }}>模型运行状态</div>
                   <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 6, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                         <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', marginRight: 8, boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.2)' }}></span>
                         <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>YOLOv11-L</span>
                      </div>
                      <span style={{ fontSize: '10px', color: '#2563eb', cursor: 'pointer' }} onClick={() => navigate('/realtime')}>详情 →</span>
                   </div>
                </div>
             </div>
          </Card>
        </Col>
      </Row>

      {/* Table Section */}
      <Card bordered={false} className="kpi-card" style={{ marginTop: 24 }} bodyStyle={{ padding: 0 }}>
         <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>最新分析序列</h3>
            <div style={{ display: 'flex', gap: 8 }}>
               <Button size="small" type="text" icon={<MoreOutlined />} />
            </div>
         </div>
         <Table<AnalysisListItem>
            rowKey="id"
            dataSource={recent}
            pagination={false}
            loading={isLoadingRecent}
            onRow={(record) => ({
                onClick: () => {
                  if (record.status === 'completed') navigate(`/report/${record.id}`)
                },
                style: { cursor: 'pointer' }
            })}
            columns={[
               {
                 title: '序列 ID',
                 dataIndex: 'id',
                 render: (id) => <span style={{ fontFamily: 'monospace', fontWeight: 500, color: '#0f172a' }}>#{id}</span>
               },
               {
                 title: '分析状态',
                 dataIndex: 'status',
                 render: (status) => {
                   const map: any = {
                      completed: { text: '完成', cls: 'success' },
                      processing: { text: '分析中', cls: 'processing' },
                      failed: { text: '失败', cls: 'error' },
                      pending: { text: '等待中', cls: 'warning' },
                   }
                   const c = map[status] || { text: status, cls: 'neutral' }
                   return <span className={`status-badge ${c.cls}`}>{c.text}</span>
                 }
               },
               {
                 title: '判定结果',
                 dataIndex: 'excavation_status',
                 render: (status) => {
                    if (!status) return <span style={{ color: '#cbd5e1' }}>-</span>;
                    if (status === 'over_excavation') return (
                       <span style={{ display: 'flex', alignItems: 'center', color: '#e11d48', fontWeight: 500 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e11d48', marginRight: 8 }}></span>
                          超挖
                       </span>
                    )
                    if (status === 'under_excavation') return (
                       <span style={{ display: 'flex', alignItems: 'center', color: '#d97706', fontWeight: 500 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', marginRight: 8 }}></span>
                          欠挖
                       </span>
                    )
                    return (
                       <span style={{ display: 'flex', alignItems: 'center', color: '#059669', fontWeight: 500 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669', marginRight: 8 }}></span>
                          合格
                       </span>
                    )
                 }
               },
               {
                 title: '偏差比例 (%)',
                 dataIndex: 'difference_percent',
                 render: (val) => {
                   if (val === null || val === undefined) return <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>-</span>
                   const color = Math.abs(val) > 10 ? '#e11d48' : Math.abs(val) > 5 ? '#d97706' : '#64748b'
                   return <span style={{ fontFamily: 'monospace', fontWeight: 600, color }}>{val > 0 ? '+' : ''}{val.toFixed(2)}</span>
                 }
               },
               {
                 title: '上传时间',
                 dataIndex: 'created_at',
                 render: (d) => <span style={{ color: '#94a3b8' }}>{dayjs(d).format('MM-DD HH:mm')}</span>
               },
               {
                 title: '操作',
                 key: 'op',
                 align: 'right',
                 render: (_, record) => (
                    <Button type="link" size="small" style={{ fontSize: 12, padding: 0 }} disabled={record.status !== 'completed'}>
                       查看详情
                    </Button>
                 )
               }
            ]}
         />
      </Card>
    </div>
  )
}

export default Dashboard